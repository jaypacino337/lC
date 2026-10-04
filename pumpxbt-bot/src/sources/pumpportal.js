/* PumpPortal data websocket — https://pumpportal.fun/data-api/real-time/
 *
 *   wss://pumpportal.fun/api/data
 *     {"method":"subscribeNewToken"}           free   (verified 2026-10-04)
 *     {"method":"subscribeMigration"}          free   (verified 2026-10-04)
 *     {"method":"subscribeTokenTrade","keys"}  metered, needs ?api-key= and a funded linked wallet
 *     {"method":"subscribeAccountTrade","keys"} metered, same
 *
 * One connection, per PumpPortal's rules ("PLEASE ONLY USE ONE WEBSOCKET
 * CONNECTION AT A TIME"); new subscriptions go down the same socket. Captured
 * messages live in test/fixtures/pumpportal.stream.json.
 *
 * Without an API key the bot sees every launch and the creator's initial buy,
 * but not the trades after it — DexScreener's 5-minute aggregates fill that gap. */
import { log } from '../log.js';
import { nowMs, sleep } from '../util.js';

export const PUMPPORTAL_WS = 'wss://pumpportal.fun/api/data';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * Classify one websocket message.
 *   create    { kind, mint, creator, name, symbol, bondingCurve, marketCapSol, priceSol, initialBuySol, at, signature }
 *   trade     { kind, mint, wallet, isBuy, solAmount, tokenAmount, priceSol, marketCapSol, at, signature }
 *   migration { kind, mint, at, signature, pool }
 *   null      for acks ("Successfully subscribed…") and anything unrecognised
 */
export function parsePortalMessage(m, at = nowMs()) {
  if (!m || typeof m !== 'object' || !m.mint) return null;
  const vSol = num(m.vSolInBondingCurve);
  const vTok = num(m.vTokensInBondingCurve);
  const priceSol = vSol && vTok ? vSol / vTok : null;
  const tx = String(m.txType ?? '').toLowerCase();

  if (tx === 'create') {
    return {
      kind: 'create',
      mint: String(m.mint),
      creator: m.traderPublicKey ? String(m.traderPublicKey) : null,
      name: String(m.name ?? ''),
      symbol: String(m.symbol ?? ''),
      bondingCurve: m.bondingCurveKey ?? null,
      marketCapSol: num(m.marketCapSol),
      priceSol,
      initialBuySol: num(m.solAmount) ?? 0,
      initialBuyTokens: num(m.initialBuy) ?? 0,
      pool: m.pool ?? 'pump',
      at,
      signature: m.signature ?? null
    };
  }
  if (tx === 'buy' || tx === 'sell') {
    return {
      kind: 'trade',
      mint: String(m.mint),
      wallet: String(m.traderPublicKey ?? ''),
      isBuy: tx === 'buy',
      solAmount: num(m.solAmount),
      tokenAmount: num(m.tokenAmount),
      priceSol,
      marketCapSol: num(m.marketCapSol),
      at,
      signature: m.signature ?? null
    };
  }
  if (tx === 'migrate') {
    return { kind: 'migration', mint: String(m.mint), at, signature: m.signature ?? null, pool: m.pool ?? null };
  }
  return null;
}

/**
 * Convert a create (its initial buy) or trade event to the bot's Trade shape.
 * `solUsd` converts SOL to USD; without it usd/price stay null rather than guessed.
 */
export function eventToTrade(e, solUsd) {
  if (!e) return null;
  if (e.kind === 'create' && !(e.initialBuySol > 0)) return null;
  if (e.kind !== 'create' && e.kind !== 'trade') return null;
  const sol = e.kind === 'create' ? e.initialBuySol : e.solAmount;
  const fx = Number.isFinite(solUsd) ? solUsd : null;
  return {
    id: e.signature ?? `${e.mint}:${e.at}`,
    wallet: e.kind === 'create' ? e.creator : e.wallet,
    mint: e.mint,
    at: e.at,
    usd: fx && Number.isFinite(sol) ? sol * fx : null,
    price: fx && Number.isFinite(e.priceSol) ? e.priceSol * fx : null,
    isBuy: e.kind === 'create' ? true : e.isBuy,
    raw: e
  };
}

export class PumpPortalStream {
  constructor({ apiKey = '', tradeSubs = 0, maxEvents = 2000, WebSocketImpl = globalThis.WebSocket } = {}) {
    this.apiKey = apiKey;
    this.tradeSubs = apiKey ? tradeSubs : 0;  // metered: only with a key, and capped
    this.maxEvents = maxEvents;
    this.WS = WebSocketImpl;
    this.events = [];             // newest last
    this.creates = new Map();     // mint -> create event
    this.migrated = new Set();
    this.subscribedTrades = new Set();
    this.ws = null;
    this.stopped = false;
    this.stats = { connects: 0, messages: 0, lastMessageAt: null, lastError: null };
  }

  get connected() { return this.ws?.readyState === 1; }

  /** Feed one raw message (also used by tests). */
  ingest(msg, at = nowMs()) {
    this.stats.messages++;
    this.stats.lastMessageAt = at;
    const e = parsePortalMessage(msg, at);
    if (!e) return null;
    this.events.push(e);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    if (e.kind === 'create') {
      this.creates.set(e.mint, e);
      if (this.creates.size > this.maxEvents) this.creates.delete(this.creates.keys().next().value);
      this.maybeSubscribeTrades(e.mint);
    }
    if (e.kind === 'migration') this.migrated.add(e.mint);
    return e;
  }

  send(obj) {
    if (this.connected) this.ws.send(JSON.stringify(obj));
  }

  maybeSubscribeTrades(mint) {
    if (!this.tradeSubs || this.subscribedTrades.has(mint)) return;
    if (this.subscribedTrades.size >= this.tradeSubs) {
      const oldest = this.subscribedTrades.values().next().value;
      this.subscribedTrades.delete(oldest);
      this.send({ method: 'unsubscribeTokenTrade', keys: [oldest] });
    }
    this.subscribedTrades.add(mint);
    this.send({ method: 'subscribeTokenTrade', keys: [mint] });
  }

  /** Connect and keep reconnecting with backoff until stop(). Resolves once first opened (or after 10s). */
  start() {
    if (!this.WS) {
      log.warn('no global WebSocket (needs Node >= 22) — PumpPortal stream disabled');
      return Promise.resolve(false);
    }
    let firstOpen;
    const opened = new Promise(r => { firstOpen = r; });
    const loop = async () => {
      let backoff = 1000;
      while (!this.stopped) {
        await new Promise((resolve) => {
          const url = this.apiKey ? `${PUMPPORTAL_WS}?api-key=${encodeURIComponent(this.apiKey)}` : PUMPPORTAL_WS;
          let ws;
          try { ws = new this.WS(url); } catch (err) { this.stats.lastError = err.message; return resolve(); }
          this.ws = ws;
          ws.onopen = () => {
            this.stats.connects++;
            backoff = 1000;
            this.send({ method: 'subscribeNewToken' });
            this.send({ method: 'subscribeMigration' });
            if (this.subscribedTrades.size) this.send({ method: 'subscribeTokenTrade', keys: [...this.subscribedTrades] });
            log.info('pumpportal stream connected', { trades: this.tradeSubs ? 'metered' : 'off' });
            firstOpen(true);
          };
          ws.onmessage = (ev) => {
            try { this.ingest(JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data))); }
            catch { /* ignore malformed frame */ }
          };
          ws.onerror = (ev) => { this.stats.lastError = ev?.message ?? 'websocket error'; };
          ws.onclose = () => { this.ws = null; resolve(); };
        });
        if (this.stopped) break;
        log.warn('pumpportal stream closed — reconnecting', { inMs: backoff, err: this.stats.lastError });
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 60_000);
      }
    };
    loop();
    return Promise.race([opened, sleep(10_000).then(() => false)]);
  }

  stop() {
    this.stopped = true;
    try { this.ws?.close(); } catch { /* already closed */ }
  }

  recent({ sinceMs = 0, kind } = {}) {
    return this.events.filter(e => e.at >= sinceMs && (!kind || e.kind === kind));
  }

  health() {
    return {
      connected: this.connected,
      tradeStream: this.tradeSubs ? `metered, ${this.subscribedTrades.size}/${this.tradeSubs} mints` : 'off (no PUMPPORTAL_API_KEY)',
      tracked: this.creates.size,
      ...this.stats
    };
  }
}
