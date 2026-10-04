/* Read-only Solana access, zero dependencies.
 *
 * Everything here is a READ: account data, balances, supply. Nothing in this
 * file can build or sign a transaction. Execution (claim → buyback/burn →
 * payouts) runs on the shared memcoinz flywheel worker, not in this process.
 *
 * PDA derivation and the bonding-curve layout are ported from memcoinz
 * (`solana-core/scripts/lib.ts`, `launchpad-site/preset-seats/lib/chain.ts`)
 * and pinned by test vectors captured from mainnet (test/solana.test.js). */
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { fetchJson, retry, nowMs } from '../util.js';

export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_AMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
/* Rent-exempt minimum for a 0-byte account; it stays in the bonding vault. */
export const RENT_EXEMPT_0 = 890_880;
export const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
/* pump.fun mints 1B tokens (6 decimals) and burns reduce supply, so
 * burned = initial − current supply. */
export const PUMP_INITIAL_SUPPLY = 1_000_000_000n * 1_000_000n;
/* 793.1M of those are sold along the curve. */
export const PUMP_INITIAL_REAL_TOKENS = 793_100_000_000_000n;

/* ── base58 ─────────────────────────────────────────────────────────────── */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = Object.fromEntries([...ALPHABET].map((c, i) => [c, BigInt(i)]));

export function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const v = MAP[c];
    if (v === undefined) throw new Error(`invalid base58 character "${c}"`);
    n = n * 58n + v;
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c !== '1') break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

export function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}

/** 32-byte public key from a base58 address, or throws. */
export function pubkeyBytes(addr) {
  const b = b58decode(String(addr));
  if (b.length !== 32) throw new Error(`not a 32-byte address: ${addr}`);
  return b;
}

export function isAddress(addr) {
  try { pubkeyBytes(addr); return true; } catch { return false; }
}

/* ── ed25519 on-curve check (for PDA derivation) ────────────────────────── */
const P = 2n ** 255n - 19n;
const mod = (a) => ((a % P) + P) % P;
function pow(b, e) {
  let r = 1n; b = mod(b);
  while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; }
  return r;
}
const D = mod(-121665n * pow(121666n, P - 2n));
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

/** True when 32 bytes decode to a valid ed25519 point (i.e. could have a key). */
export function isOnCurve(bytes) {
  const b = Uint8Array.from(bytes);
  const xOdd = (b[31] & 0x80) !== 0;
  b[31] &= 0x7f;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(b[i]);
  if (y >= P) return false;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  const v3 = mod(v * v * v);
  const v7 = mod(v3 * v3 * v);
  let x = mod(u * v3 * pow(u * v7, (P - 5n) / 8n));
  const vx2 = mod(v * x * x);
  if (vx2 === u) { /* root found */ }
  else if (vx2 === mod(-u)) x = mod(x * SQRT_M1);
  else return false;
  if (x === 0n && xOdd) return false;
  return true;
}

/** Program-derived address, same algorithm as PublicKey.findProgramAddressSync. */
export function findProgramAddress(seeds, programId) {
  const program = pubkeyBytes(programId);
  const parts = seeds.map(s => (typeof s === 'string' ? Buffer.from(s) : Buffer.from(s)));
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash('sha256');
    for (const s of parts) h.update(s);
    h.update(Buffer.from([bump]));
    h.update(program);
    h.update(Buffer.from('ProgramDerivedAddress'));
    const digest = h.digest();
    if (!isOnCurve(digest)) return [b58encode(digest), bump];
  }
  throw new Error('no viable bump');
}

export const bondingCurvePda = (mint) =>
  findProgramAddress(['bonding-curve', pubkeyBytes(mint)], PUMP_PROGRAM_ID)[0];

export const creatorVaultPda = (creator) =>
  findProgramAddress(['creator-vault', pubkeyBytes(creator)], PUMP_PROGRAM_ID)[0];

export const ammCreatorVaultAuthority = (creator) =>
  findProgramAddress(['creator_vault', pubkeyBytes(creator)], PUMP_AMM_PROGRAM_ID)[0];

export const associatedTokenAddress = (owner, mint, tokenProgram = TOKEN_PROGRAM_ID) =>
  findProgramAddress([pubkeyBytes(owner), pubkeyBytes(tokenProgram), pubkeyBytes(mint)], ATA_PROGRAM_ID)[0];

/* ── pump.fun BondingCurve account ──────────────────────────────────────────
 * 8-byte discriminator, then u64 virtual_token, virtual_sol, real_token,
 * real_sol, total_supply, then bool complete, then (newer curves) the creator
 * pubkey. */
export function decodeBondingCurve(data) {
  const b = Buffer.from(data);
  if (b.length < 49) return null;
  const virtualToken = b.readBigUInt64LE(8);
  const virtualSol = b.readBigUInt64LE(16);
  const realToken = b.readBigUInt64LE(24);
  const realSol = b.readBigUInt64LE(32);
  const totalSupply = b.readBigUInt64LE(40);
  const complete = b[48] === 1;
  const creator = b.length >= 81 ? b58encode(b.subarray(49, 81)) : null;
  const sold = PUMP_INITIAL_REAL_TOKENS - (realToken > PUMP_INITIAL_REAL_TOKENS ? PUMP_INITIAL_REAL_TOKENS : realToken);
  return {
    virtualTokens: Number(virtualToken) / 1e6,
    virtualSol: Number(virtualSol) / 1e9,
    realTokens: Number(realToken) / 1e6,
    realSol: Number(realSol) / 1e9,
    totalSupply: Number(totalSupply) / 1e6,
    complete,
    creator,
    /* SOL per whole token on the curve. */
    priceSol: virtualToken > 0n ? (Number(virtualSol) / 1e9) / (Number(virtualToken) / 1e6) : null,
    progress: complete ? 1 : Number((sold * 10_000n) / PUMP_INITIAL_REAL_TOKENS) / 10_000
  };
}

/* ── RPC reader ─────────────────────────────────────────────────────────── */
export class SolanaReader {
  /**
   * `pool` is the Helius RpcPool when keys exist; otherwise single-URL JSON-RPC
   * against SOLANA_RPC_URL (or the public endpoint, fine for the handful of
   * account reads this does — not for holder scans).
   */
  constructor({ pool = null, url = config.solanaRpcUrl || PUBLIC_RPC } = {}) {
    this.pool = pool && pool.size ? pool : null;
    this.url = url;
  }

  get endpoint() {
    return this.pool ? `helius×${this.pool.size}` : new URL(this.url).host;
  }

  async rpc(method, params = []) {
    if (this.pool) return this.pool.rpc(method, params);
    return retry(async () => {
      const body = await fetchJson(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        timeoutMs: 10_000
      });
      if (body.error) throw new Error(`RPC ${method}: ${body.error.message}`);
      return body.result;
    }, {
      attempts: 3,
      shouldRetry: (e) => e.status === 429 || e.status >= 500 || e.name === 'AbortError'
    });
  }

  async accountData(address) {
    const r = await this.rpc('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }]);
    const v = r?.value;
    if (!v) return null;
    return { lamports: v.lamports, owner: v.owner, data: Buffer.from(v.data[0], 'base64') };
  }

  async bondingCurve(mint) {
    const acc = await this.accountData(bondingCurvePda(mint));
    return acc && acc.owner === PUMP_PROGRAM_ID ? decodeBondingCurve(acc.data) : null;
  }

  /** Lamports held by an address (0 when the account does not exist). */
  async balance(address) {
    const r = await this.rpc('getBalance', [address, { commitment: 'confirmed' }]);
    return r?.value ?? 0;
  }

  /**
   * Creator fees waiting to be claimed — same accounts and maths as memcoinz
   * pump-claim `claimable()`: bonding vault minus rent, plus the PumpSwap
   * creator vault's WSOL. Lamports.
   */
  async claimable(creator) {
    const bondingVault = creatorVaultPda(creator);
    const ammWsol = associatedTokenAddress(ammCreatorVaultAuthority(creator), WSOL_MINT);
    const [bondingLamports, amm] = await Promise.all([
      this.balance(bondingVault),
      this.rpc('getTokenAccountBalance', [ammWsol]).then(r => Number(r?.value?.amount ?? 0)).catch(() => 0)
    ]);
    const bonding = Math.max(0, bondingLamports - RENT_EXEMPT_0);
    return { bondingVault, ammWsol, bonding, amm, total: bonding + amm };
  }

  async tokenSupply(mint) {
    const r = await this.rpc('getTokenSupply', [mint]);
    return r?.value ? { raw: BigInt(r.value.amount), decimals: r.value.decimals } : null;
  }
}

/** Cache a zero-arg async function for `ttlMs`; failures are not cached. */
export function cached(fn, ttlMs) {
  let at = 0, val, inflight = null;
  return async () => {
    if (at && nowMs() - at < ttlMs) return val;
    if (inflight) return inflight;
    inflight = fn().then(v => { val = v; at = nowMs(); return v; })
      .finally(() => { inflight = null; });
    return inflight;
  };
}
