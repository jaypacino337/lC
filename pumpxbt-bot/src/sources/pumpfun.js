/* ============================================================================
 * pump.fun adapter.
 *
 * ⚠️  THE ENDPOINT SHAPES BELOW ARE UNVERIFIED.
 *
 * I could not reach pump.fun or its docs from the environment this was written
 * in, so the request paths and response field names in `parseCallout` /
 * `parseTrade` are best guesses. They are almost certainly wrong in detail.
 *
 * This is deliberately the ONLY file that knows what pump.fun's API looks like.
 * Everything downstream consumes the normalised shapes documented below, so
 * correcting reality costs you one file:
 *
 *   1. Open devtools on pump.fun, watch the network tab
 *   2. Fix PATHS and the parse* functions to match what you actually see
 *   3. Drop a real response into test/fixtures/ and run `npm test`
 *
 * Normalised shapes the rest of the bot expects:
 *
 *   Callout { id, caller, mint, calledAt, priceAtCall, mcapAtCall, raw }
 *   Trade   { id, wallet, mint, at, usd, price, isBuy, raw }
 *   Token   { mint, symbol, name, price, mcap, liquidity, createdAt,
 *             buyers5m, volume5m, netInflow5m, raw }
 *
 * On ToS: this reads public data. It does not automate posting, log in, or
 * touch an account. Posting is left as a manual step for exactly that reason.
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { config } from '../config.js';
import { log } from '../log.js';
import { fetchJson, retry, hashId, nowMs } from '../util.js';

const FIXTURE = new URL('../../test/fixtures/pumpfun.sample.json', import.meta.url);

export class PumpFunClient {
  constructor({ source = config.source, base = config.pumpfun.base } = {}) {
    this.source = source;
    this.base = base.replace(/\/$/, '');
    this.warned = false;
  }

  async get(path, params = {}) {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    if (!this.warned) {
      this.warned = true;
      log.warn('pump.fun endpoints are unverified — confirm paths before trusting live output',
        { base: this.base });
    }
    return retry(() => fetchJson(url.toString(), {
      timeoutMs: 9000,
      headers: { accept: 'application/json' }
    }), {
      attempts: 3,
      shouldRetry: (e) => e.status === 429 || e.status >= 500 || e.name === 'AbortError',
      onRetry: (e, n) => log.debug('pump.fun retry', { path, attempt: n, err: e.message })
    });
  }

  /**
   * Loads the fixture and time-shifts it so it replays as "just happened".
   *
   * The fixture declares `_anchor` (its own notion of now, in seconds). Every
   * timestamp is shifted by realNow - anchor, which preserves all the *relative*
   * ages: history stays hours old so it can be scored, while the live tokens stay
   * minutes old so they still pass the freshness gates. Without this the fixture
   * rots and the bot correctly refuses to act on year-old data.
   */
  fixture() {
    if (this._fx) return this._fx;
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const anchorSec = raw._anchor;

    if (Number.isFinite(anchorSec)) {
      const offsetSec = Math.floor(nowMs() / 1000) - anchorSec;
      const shift = (obj, keys) => {
        for (const k of keys) {
          if (Number.isFinite(obj?.[k])) obj[k] += offsetSec;
        }
      };
      for (const c of raw.callouts ?? []) shift(c, ['created_at', 'timestamp', 'called_at']);
      for (const t of raw.trades ?? []) shift(t, ['timestamp', 'created_at']);
      for (const t of raw.tokens ?? []) shift(t, ['created_timestamp', 'created_at']);
    }
    this._fx = raw;
    return this._fx;
  }

  /* ── Callouts ─────────────────────────────────────────────────────────── */
  async recentCallouts({ limit = 100 } = {}) {
    if (this.source === 'fixture') return this.fixture().callouts.map(parseCallout);
    const raw = await this.get(config.pumpfun.calloutsPath, { limit, offset: 0 });
    return asArray(raw).map(parseCallout).filter(Boolean);
  }

  /* ── Trades ───────────────────────────────────────────────────────────── */
  async recentTrades({ mint, limit = 200 } = {}) {
    if (this.source === 'fixture') {
      const all = this.fixture().trades.map(parseTrade);
      return mint ? all.filter(t => t.mint === mint) : all;
    }
    const path = mint
      ? `${config.pumpfun.tradesPath}/${encodeURIComponent(mint)}`
      : config.pumpfun.tradesPath;
    const raw = await this.get(path, { limit });
    return asArray(raw).map(parseTrade).filter(Boolean);
  }

  /* ── Tokens ───────────────────────────────────────────────────────────── */
  async token(mint) {
    if (this.source === 'fixture') {
      return this.fixture().tokens.map(parseToken).find(t => t.mint === mint) ?? null;
    }
    const raw = await this.get(`/coins/${encodeURIComponent(mint)}`);
    return raw ? parseToken(raw) : null;
  }

  async tokens(mints) {
    const out = [];
    for (const m of mints) {
      try {
        const t = await this.token(m);
        if (t) out.push(t);
      } catch (err) {
        log.debug('token fetch failed', { mint: m, err: err.message });
      }
    }
    return out;
  }
}

/* ── Parsers ────────────────────────────────────────────────────────────────
 * Each reads defensively across several plausible field names, so a partial
 * guess still yields usable data rather than undefined everywhere. */

const pick = (o, ...keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const numOr = (v, d = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Timestamps arrive as ms, seconds or ISO strings depending on the endpoint. */
function toMs(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function parseCallout(r) {
  const mint = pick(r, 'mint', 'coin_mint', 'token', 'ca', 'coin.mint');
  const caller = pick(r, 'caller', 'user', 'wallet', 'creator', 'author', 'user_address');
  if (!mint || !caller) return null;
  const calledAt = toMs(pick(r, 'called_at', 'created_at', 'timestamp', 'time')) ?? nowMs();
  return {
    id: String(pick(r, 'id', 'callout_id', 'signature') ?? hashId(caller, mint, calledAt)),
    caller: String(caller),
    mint: String(mint),
    calledAt,
    priceAtCall: numOr(pick(r, 'price_usd', 'price', 'usd_price', 'price_at_call')),
    mcapAtCall: numOr(pick(r, 'market_cap', 'usd_market_cap', 'mcap')),
    raw: r
  };
}

export function parseTrade(r) {
  const mint = pick(r, 'mint', 'coin_mint', 'token', 'coin.mint');
  const wallet = pick(r, 'user', 'wallet', 'trader', 'user_address', 'owner');
  if (!mint || !wallet) return null;
  const at = toMs(pick(r, 'timestamp', 'created_at', 'time', 'block_time')) ?? nowMs();
  const isBuyRaw = pick(r, 'is_buy', 'isBuy', 'side', 'type');
  const isBuy = typeof isBuyRaw === 'boolean'
    ? isBuyRaw
    : String(isBuyRaw ?? '').toLowerCase().startsWith('b');
  return {
    id: String(pick(r, 'signature', 'id', 'tx') ?? hashId(wallet, mint, at)),
    wallet: String(wallet),
    mint: String(mint),
    at,
    usd: numOr(pick(r, 'usd', 'usd_amount', 'sol_amount_usd', 'amount_usd')),
    price: numOr(pick(r, 'price_usd', 'price')),
    isBuy,
    raw: r
  };
}

export function parseToken(r) {
  const mint = pick(r, 'mint', 'coin_mint', 'address', 'ca');
  if (!mint) return null;
  return {
    mint: String(mint),
    symbol: String(pick(r, 'symbol', 'ticker') ?? '???'),
    name: String(pick(r, 'name', 'coin_name') ?? ''),
    price: numOr(pick(r, 'price_usd', 'price')),
    mcap: numOr(pick(r, 'usd_market_cap', 'market_cap', 'mcap')),
    liquidity: numOr(pick(r, 'liquidity', 'virtual_sol_reserves', 'liquidity_usd')),
    createdAt: toMs(pick(r, 'created_timestamp', 'created_at', 'launch_time')),
    /* Derived elsewhere from the trade feed when the API does not supply them. */
    buyers5m: numOr(pick(r, 'buyers_5m', 'unique_buyers_5m'), null),
    volume5m: numOr(pick(r, 'volume_5m', 'vol_5m'), null),
    netInflow5m: numOr(pick(r, 'net_inflow_5m'), null),
    complete: Boolean(pick(r, 'complete', 'bonding_complete')),
    raw: r
  };
}

function asArray(x) {
  if (Array.isArray(x)) return x;
  if (!x || typeof x !== 'object') return [];
  for (const k of ['data', 'results', 'items', 'callouts', 'trades', 'coins']) {
    if (Array.isArray(x[k])) return x[k];
  }
  return [];
}

/** Derives velocity metrics from a trade list when the API does not give them. */
export function deriveActivity(trades, windowMs = 5 * 60_000, now = nowMs()) {
  const recent = trades.filter(t => t.at >= now - windowMs);
  const buys = recent.filter(t => t.isBuy);
  const sells = recent.filter(t => !t.isBuy);
  const sum = (a) => a.reduce((s, t) => s + (t.usd ?? 0), 0);
  return {
    buyers5m: new Set(buys.map(t => t.wallet)).size,
    volume5m: sum(recent),
    netInflow5m: sum(buys) - sum(sells),
    buyCount: buys.length,
    sellCount: sells.length,
    buySellRatio: sells.length ? buys.length / sells.length : buys.length
  };
}
