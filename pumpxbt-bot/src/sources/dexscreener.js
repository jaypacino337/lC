/* DexScreener public API, verified 2026-10-04 (fixture: test/fixtures/dexscreener.tokens.json).
 *
 *   GET https://api.dexscreener.com/tokens/v1/solana/{mint,mint,...}   up to 30 mints
 *
 * Returns pairs for pump.fun bonding curves (dexId "pumpfun") as well as
 * PumpSwap/Raydium/Orca pools, with price, liquidity, market cap and 5-minute
 * txn/volume aggregates. No key, rate limit ~300 req/min. */
import { fetchJson, retry, nowMs } from '../util.js';

export const DEXSCREENER = 'https://api.dexscreener.com';
export const WSOL = 'So11111111111111111111111111111111111111112';
const BATCH = 30;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/** Best pair per base-token mint: highest USD liquidity, where the mint is the base. */
export function bestPairs(pairs) {
  const best = new Map();
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const mint = p?.baseToken?.address;
    if (!mint) continue;
    const cur = best.get(mint);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) best.set(mint, p);
  }
  return best;
}

/** DexScreener pair → the bot's normalised Token shape. */
export function parsePair(p) {
  if (!p?.baseToken?.address) return null;
  const buys = num(p.txns?.m5?.buys) ?? 0;
  const sells = num(p.txns?.m5?.sells) ?? 0;
  return {
    mint: p.baseToken.address,
    symbol: String(p.baseToken.symbol ?? '???'),
    name: String(p.baseToken.name ?? ''),
    price: num(p.priceUsd),
    mcap: num(p.marketCap ?? p.fdv),
    liquidity: num(p.liquidity?.usd),
    createdAt: num(p.pairCreatedAt),
    /* DexScreener gives txn counts, not unique wallets: buy count is an upper
     * bound on unique buyers, and is labelled as such where it is shown. */
    buyers5m: buys,
    volume5m: num(p.volume?.m5),
    netInflow5m: null,
    buySellRatio: sells ? buys / sells : buys,
    change24h: num(p.priceChange?.h24),
    volume24h: num(p.volume?.h24),
    dexId: p.dexId ?? null,
    pairAddress: p.pairAddress ?? null,
    url: p.url ?? null,
    complete: p.dexId ? p.dexId !== 'pumpfun' : false,
    source: 'dexscreener',
    raw: p
  };
}

export class DexScreener {
  constructor({ base = DEXSCREENER, ttlMs = 20_000 } = {}) {
    this.base = base;
    this.ttlMs = ttlMs;
    this.cache = new Map();     // mint -> { at, token|null }
  }

  async fetchBatch(mints) {
    const url = `${this.base}/tokens/v1/solana/${mints.map(encodeURIComponent).join(',')}`;
    return retry(() => fetchJson(url, { timeoutMs: 9000, headers: { accept: 'application/json' } }), {
      attempts: 3,
      shouldRetry: (e) => e.status === 429 || e.status >= 500 || e.name === 'AbortError'
    });
  }

  /** Map mint → Token|null for every requested mint. */
  async tokens(mints) {
    const out = new Map();
    const todo = [];
    for (const m of new Set(mints)) {
      const c = this.cache.get(m);
      if (c && nowMs() - c.at < this.ttlMs) out.set(m, c.token);
      else todo.push(m);
    }
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      const best = bestPairs(await this.fetchBatch(chunk));
      for (const m of chunk) {
        const token = best.has(m) ? parsePair(best.get(m)) : null;
        this.cache.set(m, { at: nowMs(), token });
        out.set(m, token);
      }
    }
    return out;
  }

  async token(mint) {
    return (await this.tokens([mint])).get(mint) ?? null;
  }

  /** USD per SOL, from the deepest WSOL pair. */
  async solUsd() {
    const t = await this.token(WSOL);
    return t?.price ?? null;
  }
}
