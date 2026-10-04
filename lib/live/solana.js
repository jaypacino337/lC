// LIVE MODE ONLY. Minimal Solana helpers without dependencies: JSON-RPC and signing a
// serialized (legacy or v0) transaction that Jupiter built for the builder wallet.
import { base58Decode, base58Encode } from '../../public/shared/util.js';
import { signBytes, publicKeyFromSeed } from './keystore.js';

export async function rpc(method, params, url = process.env.SOLANA_RPC_URL) {
  if (!url) throw new Error('SOLANA_RPC_URL is not set');
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`RPC ${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}

function readCompactU16(buf, off) {
  let len = 0, size = 0;
  for (;;) {
    const b = buf[off + size];
    len |= (b & 0x7f) << (7 * size);
    size++;
    if ((b & 0x80) === 0) break;
  }
  return { len, size };
}

// Returns the message bytes, signature slots and the static account keys of a wire transaction
export function parseTransaction(bytes) {
  const buf = Buffer.from(bytes);
  const sigs = readCompactU16(buf, 0);
  const sigStart = sigs.size;
  const msgStart = sigStart + sigs.len * 64;
  const message = buf.subarray(msgStart);
  let o = 0;
  const versioned = (message[0] & 0x80) !== 0;
  if (versioned) o += 1;
  const header = { numRequiredSignatures: message[o], numReadonlySigned: message[o + 1], numReadonlyUnsigned: message[o + 2] };
  o += 3;
  const keys = readCompactU16(message, o);
  o += keys.size;
  const accountKeys = [];
  for (let i = 0; i < keys.len; i++) accountKeys.push(base58Encode(message.subarray(o + i * 32, o + (i + 1) * 32)));
  return { buf, sigStart, numSignatures: sigs.len, message, versioned, header, accountKeys };
}

// Sign a transaction for the builder wallet. Refuses if the wallet is not a required signer.
export function signTransaction(bytes, seed) {
  const tx = parseTransaction(bytes);
  const me = publicKeyFromSeed(seed);
  const idx = tx.accountKeys.indexOf(me);
  if (idx < 0 || idx >= tx.header.numRequiredSignatures) throw new Error('Builder wallet is not a signer of this transaction');
  const sig = signBytes(seed, tx.message);
  const out = Buffer.from(tx.buf);
  sig.copy(out, tx.sigStart + idx * 64);
  return { bytes: out, signature: base58Encode(sig) };
}

export async function sendAndConfirm(bytes, { timeoutMs = 60_000 } = {}) {
  const sig = await rpc('sendTransaction', [Buffer.from(bytes).toString('base64'), { encoding: 'base64', skipPreflight: false, maxRetries: 3, preflightCommitment: 'confirmed' }]);
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const st = await rpc('getSignatureStatuses', [[sig]]);
    const s = st?.value?.[0];
    if (s?.err) throw Object.assign(new Error('Transaction failed: ' + JSON.stringify(s.err)), { signature: sig });
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return sig;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw Object.assign(new Error('Transaction not confirmed in time'), { signature: sig });
}

export const lamports = (sol) => Math.round(sol * 1e9);
export { base58Decode };
