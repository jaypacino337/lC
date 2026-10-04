// The trading brain. Pure functions only (no I/O) so the rules and the paper P&L math
// can be unit-tested. Prices come from real market data (lib/market.js); in paper mode
// the fills below are simulated with pool fee, price impact and network fees.
import { toRuntime } from '../public/shared/custom-strategy.js';
import { STRATEGIES, LEVELS } from './config.js';

const round = (x, d = 9) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : 0);
const pc = (x) => (x >= 0 ? '+' : '−') + (Math.abs(x) * 100).toFixed(1) + '%';
const k = (x) => (x >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'M' : '$' + Math.round(x / 1000) + 'K');

export const HISTORY_MAX = 200;
export const DECISIONS_MAX = 40;
export const EQUITY_MAX = 300;

// ── strategies ──
export function resolveStrategy(id, custom) {
  if (custom && id === custom.id) return { id: custom.id, ...toRuntime(custom), entry: entryOf(custom.base, custom.params) };
  const st = STRATEGIES.find((s) => s.id === id) || STRATEGIES[0];
  return { ...st, base: st.id };
}
function entryOf(base, p) {
  const keys = ['minVol5mUsd', 'minChange5m', 'maxChange5m', 'maxSpike5m', 'minVol1hUsd', 'minRun1h', 'pullbackMin', 'pullbackMax', 'bounceFromLow'];
  return Object.fromEntries(keys.filter((x) => p[x] != null).map((x) => [x, p[x]]));
}

// ── entries: returns { score, reason } when the token fits the strategy, else null ──
export function entrySignal(st, t) {
  if (!t || !t.eligible || !(t.priceSol > 0)) return null;
  if (t.liquidityUsd < (st.minLiquidityUsd ?? 30000)) return null;
  const c5 = t.change5m ?? 0, c1 = t.change1h ?? 0, c6 = t.change6h ?? 0;
  const e = st.entry || {};
  const flowOk = t.buys5m == null || t.sells5m == null || t.buys5m >= t.sells5m;
  const liq = `${k(t.liquidityUsd)} liquidity`;
  switch (st.base || st.id) {
    case 'scalper':
      if (t.volume5mUsd >= (e.minVol5mUsd ?? 15000) && c5 >= (e.minChange5m ?? 0.03) && flowOk)
        return { score: c5 + t.volume5mUsd / 1e7, reason: `5m ${pc(c5)} on ${k(t.volume5mUsd)} 5m volume. Quick momentum scalp.` };
      return null;
    case 'trend':
      if (t.volume1hUsd >= (e.minVol1hUsd ?? 100000) && c1 >= 0.05 && c5 > 0 && c5 < 0.2)
        return { score: c1 + c5, reason: `1h ${pc(c1)}, 5m ${pc(c5)}, ${k(t.volume1hUsd)} 1h volume. Riding the trend.` };
      return null;
    case 'dip': {
      // DexScreener exposes 5m/1h/6h/24h changes: the 6h move stands in for "ran up first"
      const pull = -c1;
      if (c6 >= (e.minRun1h ?? 0.1) && pull >= (e.pullbackMin ?? 0.07) && pull <= (e.pullbackMax ?? 0.15) && c5 >= (e.bounceFromLow ?? 0.02))
        return { score: c5 + pull / 2, reason: `Ran ${pc(c6)} over 6h, pulled back ${pc(c1)} in 1h, bouncing ${pc(c5)} now. Dip entry.` };
      return null;
    }
    case 'sniper':
      if (t.volume5mUsd >= (e.minVol5mUsd ?? 25000) && c5 >= (e.minChange5m ?? 0.03) && c5 <= (e.maxChange5m ?? 0.12) && c1 <= (e.maxSpike5m ?? 0.2) && flowOk)
        return { score: c5 * 2, reason: `Clean setup: 5m ${pc(c5)}, 1h ${pc(c1)}, ${liq}. Measured twice.` };
      return null;
    default: // classic: momentum or mean reversion
      if (c5 >= 0.02 && c1 >= 0 && flowOk) return { score: c5 + c1 * 0.3, reason: `Best score on the board: 5m ${pc(c5)}, 1h ${pc(c1)}, ${liq}. Momentum entry.` };
      if (c1 <= -0.15 && c5 >= 0.01) return { score: c5 + 0.01, reason: `1h ${pc(c1)}, 5m ${pc(c5)}. Mean-reversion entry.` };
      return null;
  }
}

// ── exits: returns { source, reason } when the position should be closed, else null ──
export function markPnlPct(pos, priceSol) { return pos.costSol > 0 ? (pos.tokens * priceSol) / pos.costSol - 1 : 0; }

export function exitSignal(st, pos, t, now, trading) {
  const price = t?.priceSol > 0 ? t.priceSol : null;
  const stale = !price && now - (pos.lastPriceAt || pos.openedAt) > trading.staleAfterMs;
  const pnl = markPnlPct(pos, price || pos.lastPriceSol || pos.entryPriceSol);
  const peak = Math.max(pos.peakPnlPct ?? 0, pnl);
  const sym = '$' + pos.symbol;
  if (stale) return { source: 'stale', reason: `No price for ${sym} for 30 minutes. Closed at the last known price.`, pnl, peak };
  if (!price) return null;
  if (pnl >= st.takeProfitPct) return { source: 'take-profit', reason: `Sold ${sym} at ${pc(pnl)}. Take profit hit (${pc(st.takeProfitPct)}).`, pnl, peak };
  if (pnl <= st.stopLossPct) return { source: 'stop-loss', reason: `Sold ${sym} at ${pc(pnl)}. Stop loss hit (${pc(st.stopLossPct)}).`, pnl, peak };
  if (st.trail && peak >= st.trail.at && (1 + pnl) / (1 + peak) - 1 <= -st.trail.by)
    return { source: 'trailing-stop', reason: `Sold ${sym} at ${pc(pnl)}. Gave back ${pc(st.trail.by)} from its best (${pc(peak)}).`, pnl, peak };
  if (st.maxHoldMin && now - pos.openedAt >= st.maxHoldMin * 60_000)
    return { source: 'time-exit', reason: `Sold ${sym} at ${pc(pnl)}. Held for ${st.maxHoldMin} minutes, the plan's limit.`, pnl, peak };
  if ((t.change5m ?? 0) <= -0.08 && pnl < 0)
    return { source: 'ai', reason: `Sold ${sym} at ${pc(pnl)}. Trend broken (5m ${pc(t.change5m)}), early exit.`, pnl, peak };
  return null;
}

// ── paper fills ──
// Constant-product approximation: buying/selling X USD against a pool with L USD of
// liquidity (≈ L/2 per side) moves the price by about X / (L/2).
export function priceImpact(amountUsd, liquidityUsd) {
  if (!(liquidityUsd > 0)) return 0.5;
  return Math.min(0.5, amountUsd / (liquidityUsd / 2));
}

export function paperBuy({ sol, priceSol, liquidityUsd, solUsd, trading }) {
  const fees = trading.priorityFeeSol + trading.baseFeeSol;
  const impact = priceImpact(sol * solUsd, liquidityUsd);
  const fillPrice = priceSol * (1 + impact);
  const tokens = (sol * (1 - trading.poolFeePct)) / fillPrice;
  return { tokens: round(tokens, 6), costSol: round(sol + fees), cashOut: round(sol + fees), fillPrice, impact, feesSol: fees };
}

export function paperSell({ tokens, priceSol, liquidityUsd, solUsd, trading }) {
  const fees = trading.priorityFeeSol + trading.baseFeeSol;
  const gross = tokens * priceSol;
  const impact = priceImpact(gross * solUsd, liquidityUsd);
  const proceeds = Math.max(0, gross * (1 - impact) * (1 - trading.poolFeePct) - fees);
  return { sol: round(proceeds), fillPrice: priceSol * (1 - impact), impact, feesSol: fees };
}

// ── accounting ──
export function positionsValue(agent, priceOf) {
  return agent.positions.reduce((s, p) => s + p.tokens * (priceOf(p.mint) ?? p.lastPriceSol ?? p.entryPriceSol), 0);
}
export function equityOf(agent, priceOf) { return round(agent.cashSol + positionsValue(agent, priceOf)); }
export function pnlOf(agent, equity) { return round(equity + agent.withdrawnSol - agent.depositedSol); }

export function levelFor(bestProfitSol) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (bestProfitSol >= l.minProfitSol) cur = l;
  const next = LEVELS.find((l) => l.no === cur.no + 1) || null;
  const progress = next ? Math.max(0, Math.min(1, (bestProfitSol - cur.minProfitSol) / (next.minProfitSol - cur.minProfitSol))) : 1;
  return { no: cur.no, name: cur.name, color: cur.color, bestProfitSol: round(bestProfitSol), next, progress, max: LEVELS.length };
}

const push = (arr, x, max) => { arr.unshift(x); if (arr.length > max) arr.length = max; };

// One decision cycle for one builder. Returns a new agent object plus what happened.
// ctx: { tokens: Map(mint -> token), solUsd, strategy, trading, now, newId(prefix), holders: Map(mint -> count) }
export function runAgent(agentIn, ctx) {
  const a = structuredClone(agentIn);
  const { tokens, solUsd, strategy: st, trading, now } = ctx;
  const priceOf = (m) => tokens.get(m)?.priceSol ?? null;
  const trades = [];
  let thought = null;
  a.cooldowns = Object.fromEntries(Object.entries(a.cooldowns || {}).filter(([, until]) => until > now));

  const record = (t) => { trades.push(t); push(a.history, t, HISTORY_MAX); a.lastTradeAt = now; a.stats.trades++; };

  // 1) exits
  for (const pos of [...a.positions]) {
    const t = tokens.get(pos.mint);
    if (t?.priceSol > 0) { pos.lastPriceSol = t.priceSol; pos.lastPriceAt = now; }
    const ex = exitSignal(st, pos, t, now, trading);
    pos.peakPnlPct = Math.max(pos.peakPnlPct ?? 0, ex?.peak ?? markPnlPct(pos, pos.lastPriceSol || pos.entryPriceSol));
    if (!ex) continue;
    const px = t?.priceSol > 0 ? t.priceSol : pos.lastPriceSol || pos.entryPriceSol;
    const fill = paperSell({ tokens: pos.tokens, priceSol: px, liquidityUsd: t?.liquidityUsd || 0, solUsd, trading });
    a.cashSol = round(a.cashSol + fill.sol);
    a.positions = a.positions.filter((p) => p !== pos);
    const pnlSol = round(fill.sol - pos.costSol);
    a.stats.closedTrades++; if (pnlSol > 0) a.stats.wins++;
    a.stats.realizedPnlSol = round(a.stats.realizedPnlSol + pnlSol);
    a.stats.feesSol = round(a.stats.feesSol + fill.feesSol);
    if (st.cooldownMin) a.cooldowns[pos.mint] = now + st.cooldownMin * 60_000;
    const trade = {
      id: ctx.newId('tr'), agentId: a.id, side: 'SELL', mint: pos.mint, symbol: pos.symbol, sol: fill.sol, tokens: pos.tokens,
      priceUsd: t?.priceUsd ?? null, priceSol: px, pnlSol, pnlPct: pos.costSol > 0 ? round(pnlSol / pos.costSol, 6) : 0, heldMs: now - pos.openedAt,
      source: ex.source, reason: ex.reason, impactPct: round(fill.impact, 6), ts: now, sig: null, url: null, paper: a.mode !== 'live',
    };
    record(trade);
    thought = { action: 'SELL', symbol: pos.symbol, text: ex.reason, trade: trade.id };
  }

  // 2) entries (one per cycle at most)
  const equity = equityOf(a, priceOf);
  if (!a.paused && !thought) {
    const held = new Set(a.positions.map((p) => p.mint));
    const cands = [];
    let eligible = 0;
    for (const t of tokens.values()) {
      if (t.eligible) eligible++;
      if (held.has(t.mint) || a.cooldowns[t.mint]) continue;
      const s = entrySignal(st, t);
      if (s) cands.push({ t, ...s });
    }
    cands.sort((x, y) => y.score - x.score);
    const best = cands[0];
    if (!best) {
      thought = { action: 'HOLD', symbol: null, text: `Watching ${eligible} eligible tokens. None fits the ${st.name} plan right now. Holding.` };
    } else {
      let size = equity * st.sizePct;
      if (st.maxTradeSol) size = Math.min(size, st.maxTradeSol);
      const fees = trading.priorityFeeSol + trading.baseFeeSol;
      const room = a.cashSol - trading.minSolReserve - fees;
      size = round(Math.min(size, room), 6);
      let blocked = null;
      if (a.positions.length >= st.maxOpen) blocked = `All ${st.maxOpen} position slots are in use`;
      else if (size < trading.minTradeSol) blocked = `Trade size ${Math.max(0, size).toFixed(4)} SOL is below the ${trading.minTradeSol} SOL minimum`;
      if (blocked) {
        thought = { action: 'BUY', symbol: best.t.symbol, text: `Wanted to buy $${best.t.symbol}. ${best.reason}`, blocked };
      } else {
        const t = best.t;
        const fill = paperBuy({ sol: size, priceSol: t.priceSol, liquidityUsd: t.liquidityUsd, solUsd, trading });
        a.cashSol = round(a.cashSol - fill.cashOut);
        a.stats.feesSol = round(a.stats.feesSol + fill.feesSol);
        a.positions.push({
          mint: t.mint, symbol: t.symbol, icon: t.icon || null, url: t.url || null, tokens: fill.tokens, costSol: fill.costSol,
          entryPriceSol: fill.costSol / fill.tokens, openedAt: now, peakPnlPct: 0, lastPriceSol: t.priceSol, lastPriceAt: now,
        });
        const reason = `$${t.symbol}: ${best.reason} Position opened.`;
        const trade = {
          id: ctx.newId('tr'), agentId: a.id, side: 'BUY', mint: t.mint, symbol: t.symbol, sol: size, tokens: fill.tokens,
          priceUsd: t.priceUsd, priceSol: t.priceSol, source: 'ai', reason, impactPct: round(fill.impact, 6), ts: now, sig: null, url: null, paper: a.mode !== 'live',
        };
        record(trade);
        thought = { action: 'BUY', symbol: t.symbol, text: reason, trade: trade.id };
      }
    }
  } else if (a.paused && !thought) {
    thought = { action: 'HOLD', symbol: null, text: 'Paused by its creator. Open positions are still watched for exits.', note: true };
  }

  // 3) bookkeeping
  const eqNow = equityOf(a, priceOf);
  const pnl = pnlOf(a, eqNow);
  a.bestProfitSol = Math.max(a.bestProfitSol || 0, pnl);
  const before = a.levelNo || 1;
  const lvl = levelFor(a.bestProfitSol);
  a.levelNo = lvl.no;
  if (lvl.no > before) thought = { ...(thought || { action: 'HOLD', symbol: null, text: '' }), levelUp: { from: LEVELS[before - 1].name, to: lvl.name, no: lvl.no } };
  a.equity.push([now, round(eqNow, 6)]);
  if (a.equity.length > EQUITY_MAX) a.equity.splice(0, a.equity.length - EQUITY_MAX);
  if (thought) {
    const d = { ts: now, action: thought.action, symbol: thought.symbol, reason: thought.text, approved: !thought.blocked, blocked: thought.blocked || null };
    const last = a.decisions[0];
    if (last && last.action === d.action && last.symbol === d.symbol && last.blocked === d.blocked && last.reason === d.reason) { last.ts = now; last.count = (last.count || 1) + 1; }
    else push(a.decisions, d, DECISIONS_MAX);
  }
  a.lastRunAt = now;
  return { agent: a, trades, thought };
}

// Close every position at market (used by paper withdrawals of "all")
export function liquidate(agentIn, ctx, source = 'withdraw') {
  const a = structuredClone(agentIn);
  const trades = [];
  for (const pos of a.positions) {
    const t = ctx.tokens.get(pos.mint);
    const px = t?.priceSol > 0 ? t.priceSol : pos.lastPriceSol || pos.entryPriceSol;
    const fill = paperSell({ tokens: pos.tokens, priceSol: px, liquidityUsd: t?.liquidityUsd || 0, solUsd: ctx.solUsd, trading: ctx.trading });
    a.cashSol = round(a.cashSol + fill.sol);
    const pnlSol = round(fill.sol - pos.costSol);
    a.stats.closedTrades++; if (pnlSol > 0) a.stats.wins++;
    a.stats.realizedPnlSol = round(a.stats.realizedPnlSol + pnlSol);
    a.stats.trades++;
    const trade = { id: ctx.newId('tr'), agentId: a.id, side: 'SELL', mint: pos.mint, symbol: pos.symbol, sol: fill.sol, tokens: pos.tokens, priceUsd: t?.priceUsd ?? null, priceSol: px, pnlSol, pnlPct: pos.costSol > 0 ? round(pnlSol / pos.costSol, 6) : 0, heldMs: ctx.now - pos.openedAt, source, reason: `Sold $${pos.symbol} for a withdrawal.`, ts: ctx.now, sig: null, url: null, paper: a.mode !== 'live' };
    trades.push(trade); a.history.unshift(trade);
  }
  a.history.length = Math.min(a.history.length, HISTORY_MAX);
  a.positions = [];
  if (trades.length) a.lastTradeAt = ctx.now;
  return { agent: a, trades };
}
