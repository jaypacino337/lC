/* ============================================================================
 * pump.fun market data — the ONLY file that knows where data comes from.
 *
 * Live sources, every one probed from the build sandbox on 2026-10-04 with the
 * captured responses kept under test/fixtures/:
 *
 *   launches + creator buys   PumpPortal websocket (free subscribeNewToken /
 *                             subscribeMigration)          pumpportal.stream.json
 *   all trades (optional)     PumpPortal subscribeTokenTrade — metered, only
 *                             with PUMPPORTAL_API_KEY
 *   price / liq / mcap / 5m   DexScreener tokens/v1        dexscreener.tokens.json
 *   curve state (fallback)    on-chain BondingCurve account rpc.bondingCurve.json
 *
 * What is NOT available: pump.fun's in-app callouts have no documented public
 * feed (frontend-api.pump.fun returns Cloudflare 1016; the v3 host has no
 * callouts route). Live mode therefore ingests zero callouts and says so in
 * /api/health instead of guessing an endpoint. The caller-reputation engine
 * still runs on fixtures and on any callouts that do get recorded.
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
import { hashId, nowMs } from '../util.js';
import { PumpPortalStream, eventToTrade } from './pumpportal.js';
import { DexScreener } from './dexscreener.js';
import { SolanaReader, cached } from './solana.js';

const FIXTURE = new URL('../../test/fixtures/pumpfun.sample.json', import.meta.url);
const TRADE_LOOKBACK_MS = 30 * 60_000;
const CHAIN_FALLBACKS_PER_TICK = 10;
const CURVE_TTL_MS = 15_000;

export class PumpFunClient {
  constructor({ source = config.source, stream, dex, chain } = {}) {
    this.source = source;
    if (source === 'live') {
      this.stream = stream ?? new PumpPortalStream({
        apiKey: config.pumpportal.apiKey,
        tradeSubs: config.pumpportal.tradeSubs
      });
      this.dex = dex ?? new DexScreener();
      this.chain = chain ?? new SolanaReader();
      this.solUsd = cached(() => this.dex.solUsd(), 60_000);
    }
    this.chainBudget = CHAIN_FALLBACKS_PER_TICK;
    this.curveCache = new Map();   // mint -> { at, token } for unindexed launches
    this.warnedCallouts = false;
  }

  /** False in live mode: positions are marked from token() quotes only. */
  get marksFromTrades() { return this.source !== 'live'; }

  /** Opens the PumpPortal socket (live only). */
  async start() {
    if (this.source !== 'live') return false;
    return this.stream.start();
  }

  stop() { this.stream?.stop(); }

  health() {
    if (this.source !== 'live') return { source: 'fixture' };
    return {
      source: 'live',
      pumpportal: this.stream.health(),
      dexscreener: 'tokens/v1',
      chain: this.chain.endpoint,
      callouts: 'unavailable — pump.fun publishes no documented callout feed'
    };
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
  async recentCallouts() {
    if (this.source === 'fixture') return this.fixture().callouts.map(parseCallout);
    if (!this.warnedCallouts) {
      this.warnedCallouts = true;
      log.warn('live callouts unavailable: pump.fun has no documented public callout feed — ingesting none');
    }
    return [];
  }

  /* ── Trades ───────────────────────────────────────────────────────────── */
  async recentTrades({ mint } = {}) {
    if (this.source === 'fixture') {
      const all = this.fixture().trades.map(parseTrade);
      return mint ? all.filter(t => t.mint === mint) : all;
    }
    this.chainBudget = CHAIN_FALLBACKS_PER_TICK;
    const solUsd = await this.solUsd().catch(() => null);
    const events = this.stream.recent({ sinceMs: nowMs() - TRADE_LOOKBACK_MS })
      .filter(e => !mint || e.mint === mint);
    /* Newest first, so the candidate universe favours fresh launches. */
    return events.map(e => eventToTrade(e, solUsd)).filter(Boolean).reverse();
  }

  /* ── Tokens ───────────────────────────────────────────────────────────── */
  async token(mint) {
    if (this.source === 'fixture') {
      return this.fixture().tokens.map(parseToken).find(t => t.mint === mint) ?? null;
    }
    return (await this.tokenMap([mint])).get(mint) ?? null;
  }

  async tokens(mints) {
    if (this.source === 'fixture') {
      const out = [];
      for (const m of mints) { const t = await this.token(m); if (t) out.push(t); }
      return out;
    }
    return [...(await this.tokenMap(mints)).values()].filter(Boolean);
  }

  /** Batch lookup; call once per tick with the whole candidate set to stay under rate limits. */
  async warm(mints) {
    if (this.source === 'live' && mints.length) await this.tokenMap(mints).catch(() => null);
  }

  async tokenMap(mints) {
    const out = await this.dex.tokens(mints);
    const create = (m) => this.stream.creates.get(m);
    for (const m of mints) {
      const t = out.get(m);
      if (t) {
        if (!t.createdAt && create(m)) t.createdAt = create(m).at;
        if (this.stream.migrated.has(m)) t.complete = true;
        continue;
      }
      /* Not indexed yet (seconds-old launch): read the curve itself. */
      const hit = this.curveCache.get(m);
      if (hit && nowMs() - hit.at < CURVE_TTL_MS) { out.set(m, hit.token); continue; }
      if (this.chainBudget-- <= 0) continue;
      try {
        const token = await this.curveToken(m);
        this.curveCache.set(m, { at: nowMs(), token });
        if (this.curveCache.size > 500) this.curveCache.delete(this.curveCache.keys().next().value);
        out.set(m, token);
      } catch (err) {
        log.debug('curve read failed', { mint: m, err: err.message });
      }
    }
    return out;
  }

  async curveToken(mint) {
    const curve = await this.chain.bondingCurve(mint);
    if (!curve) return null;
    const solUsd = await this.solUsd().catch(() => null);
    const c = this.stream.creates.get(mint);
    const price = solUsd && curve.priceSol ? curve.priceSol * solUsd : null;
    return {
      mint,
      symbol: c?.symbol || '???',
      name: c?.name || '',
      price,
      mcap: price ? price * curve.totalSupply : null,
      liquidity: solUsd ? curve.realSol * solUsd : null,
      createdAt: c?.at ?? null,
      buyers5m: null, volume5m: null, netInflow5m: null,
      complete: curve.complete,
      progress: curve.progress,
      source: 'chain',
      raw: curve
    };
  }
}

/* ── Fixture parsers ────────────────────────────────────────────────────────
 * Used for the bundled strategy fixture (synthetic, see its _comment). Each
 * reads defensively across several field names so hand-written scenarios stay
 * easy to author. */

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

/** Timestamps arrive as ms, seconds or ISO strings depending on the source. */
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
    /* Derived elsewhere from the trade feed when the source does not supply them. */
    buyers5m: numOr(pick(r, 'buyers_5m', 'unique_buyers_5m'), null),
    volume5m: numOr(pick(r, 'volume_5m', 'vol_5m'), null),
    netInflow5m: numOr(pick(r, 'net_inflow_5m'), null),
    complete: Boolean(pick(r, 'complete', 'bonding_complete')),
    raw: r
  };
}

/** Derives velocity metrics from a trade list when the source does not give them. */
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
