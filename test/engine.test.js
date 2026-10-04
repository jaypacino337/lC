import test from 'node:test';
import assert from 'node:assert/strict';
import { paperBuy, paperSell, priceImpact, entrySignal, exitSignal, runAgent, resolveStrategy, equityOf, pnlOf, levelFor, liquidate } from '../lib/engine.js';
import { TRADING } from '../lib/config.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !≈ ${b}`);
let n = 0;
const newId = (p) => `${p}_${++n}`;
const tok = (o = {}) => ({ mint: 'M1', symbol: 'AAA', priceSol: 0.001, priceUsd: 0.1, liquidityUsd: 1_000_000, volume24hUsd: 1e6, volume1hUsd: 2e5, volume5mUsd: 30000, change5m: 0.05, change1h: 0.1, change6h: 0.2, buys5m: 50, sells5m: 20, eligible: true, ...o });
const agent = (o = {}) => ({ id: 'ag_1', mode: 'paper', cashSol: 1, depositedSol: 1, withdrawnSol: 0, positions: [], history: [], decisions: [], equity: [], cooldowns: {}, stats: { trades: 0, closedTrades: 0, wins: 0, realizedPnlSol: 0, feesSol: 0 }, paused: false, ...o });

test('price impact grows with size and is capped', () => {
  near(priceImpact(1000, 1_000_000), 0.002);
  assert.equal(priceImpact(1e9, 1000), 0.5);
  assert.equal(priceImpact(10, 0), 0.5);
});

test('paper buy charges pool fee, impact and network fee', () => {
  const r = paperBuy({ sol: 0.1, priceSol: 0.001, liquidityUsd: 1_000_000, solUsd: 100, trading: TRADING });
  const fees = TRADING.priorityFeeSol + TRADING.baseFeeSol;
  near(r.costSol, 0.1 + fees);
  const impact = (0.1 * 100) / 500_000;
  near(r.tokens, (0.1 * (1 - TRADING.poolFeePct)) / (0.001 * (1 + impact)), 1e-6);
});

test('a flat round trip loses exactly the simulated costs', () => {
  const b = paperBuy({ sol: 0.1, priceSol: 0.001, liquidityUsd: 1e6, solUsd: 100, trading: TRADING });
  const s = paperSell({ tokens: b.tokens, priceSol: 0.001, liquidityUsd: 1e6, solUsd: 100, trading: TRADING });
  const pnl = s.sol - b.costSol;
  assert.ok(pnl < 0, 'fees make a flat trade negative');
  assert.ok(pnl > -0.002, 'but only by fees and a little impact: ' + pnl);
});

test('entry rules per strategy', () => {
  const classic = resolveStrategy('classic');
  assert.ok(entrySignal(classic, tok()));
  assert.equal(entrySignal(classic, tok({ change5m: 0.005 })), null);
  assert.ok(entrySignal(classic, tok({ change5m: 0.02, change1h: -0.3 })), 'mean reversion');
  assert.equal(entrySignal(classic, tok({ eligible: false })), null);
  assert.equal(entrySignal(classic, tok({ liquidityUsd: 1000 })), null);
  const scalper = resolveStrategy('scalper');
  assert.ok(entrySignal(scalper, tok()));
  assert.equal(entrySignal(scalper, tok({ volume5mUsd: 100 })), null);
  assert.equal(entrySignal(scalper, tok({ buys5m: 5, sells5m: 50 })), null, 'sell pressure blocks');
  const trend = resolveStrategy('trend');
  assert.ok(entrySignal(trend, tok({ change1h: 0.2, change5m: 0.03 })));
  assert.equal(entrySignal(trend, tok({ volume1hUsd: 10 })), null);
  const dip = resolveStrategy('dip');
  assert.ok(entrySignal(dip, tok({ change6h: 0.5, change1h: -0.1, change5m: 0.03 })));
  assert.equal(entrySignal(dip, tok({ change6h: 0.5, change1h: -0.3, change5m: 0.03 })), null, 'too deep');
  const sniper = resolveStrategy('sniper');
  assert.ok(entrySignal(sniper, tok({ change5m: 0.05, change1h: 0.1 })));
  assert.equal(entrySignal(sniper, tok({ change5m: 0.3 })), null, 'already ran');
});

test('exit rules: take profit, stop loss, trailing stop, time exit, stale', () => {
  const st = resolveStrategy('scalper'); // tp 6%, sl -3%, trail at 4% by 2%, max hold 10m
  const now = 1_000_000_000;
  const pos = { mint: 'M1', symbol: 'AAA', tokens: 100, costSol: 0.1, entryPriceSol: 0.001, openedAt: now - 60_000, peakPnlPct: 0 };
  assert.equal(exitSignal(st, pos, tok({ priceSol: 0.00107 }), now, TRADING).source, 'take-profit');
  assert.equal(exitSignal(st, pos, tok({ priceSol: 0.00096 }), now, TRADING).source, 'stop-loss');
  assert.equal(exitSignal(st, { ...pos, peakPnlPct: 0.05 }, tok({ priceSol: 0.00102 }), now, TRADING).source, 'trailing-stop');
  assert.equal(exitSignal(st, { ...pos, openedAt: now - 11 * 60_000 }, tok({ priceSol: 0.001 }), now, TRADING).source, 'time-exit');
  assert.equal(exitSignal(st, pos, tok({ priceSol: 0.001, change5m: 0 }), now, TRADING), null);
  assert.equal(exitSignal(st, { ...pos, lastPriceAt: now - 31 * 60_000 }, undefined, now, TRADING).source, 'stale');
  assert.equal(exitSignal(st, { ...pos, lastPriceAt: now - 60_000 }, undefined, now, TRADING), null);
});

test('runAgent buys with the strategy size and books the position', () => {
  const st = resolveStrategy('classic'); // 10% per trade
  const tokens = new Map([['M1', tok()]]);
  const r = runAgent(agent(), { tokens, solUsd: 100, strategy: st, trading: TRADING, now: 1000, newId });
  assert.equal(r.trades.length, 1);
  const t = r.trades[0];
  assert.equal(t.side, 'BUY');
  assert.equal(t.paper, true);
  assert.equal(t.sig, null, 'paper trades never carry a signature');
  near(t.sol, 0.1);
  assert.equal(r.agent.positions.length, 1);
  near(r.agent.cashSol, 1 - 0.1 - TRADING.priorityFeeSol - TRADING.baseFeeSol);
  assert.equal(r.agent.stats.trades, 1);
  assert.equal(r.thought.action, 'BUY');
});

test('runAgent blocks tiny trades and full slots, never goes below reserve', () => {
  const st = resolveStrategy('classic');
  const tokens = new Map([['M1', tok()], ['M2', tok({ mint: 'M2', symbol: 'BBB' })]]);
  const small = runAgent(agent({ cashSol: 0.05, depositedSol: 0.05 }), { tokens, solUsd: 100, strategy: st, trading: TRADING, now: 1, newId });
  assert.equal(small.trades.length, 0);
  assert.match(small.thought.blocked, /below the 0.02 SOL minimum/);
  const full = agent({ positions: [1, 2, 3].map((i) => ({ mint: 'X' + i, symbol: 'X', tokens: 1, costSol: 0.1, entryPriceSol: 0.1, openedAt: 0, lastPriceSol: 0.1, lastPriceAt: 1 })) });
  const r = runAgent(full, { tokens, solUsd: 100, strategy: st, trading: TRADING, now: 2, newId });
  assert.match(r.thought.blocked, /All 3 position slots/);
});

test('paused builders never open trades but still exit', () => {
  const st = resolveStrategy('classic');
  const tokens = new Map([['M1', tok({ priceSol: 0.002 })]]);
  const a = agent({ paused: true, positions: [{ mint: 'M1', symbol: 'AAA', tokens: 100, costSol: 0.1, entryPriceSol: 0.001, openedAt: 0, peakPnlPct: 0 }] });
  const r = runAgent(a, { tokens, solUsd: 100, strategy: st, trading: TRADING, now: 10, newId });
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].side, 'SELL');
  assert.equal(r.trades[0].source, 'take-profit');
});

test('paper P&L: equity minus deposits equals realized trade P&L once flat', () => {
  const st = resolveStrategy('classic');
  let a = agent();
  const t0 = new Map([['M1', tok({ priceSol: 0.001 })]]);
  a = runAgent(a, { tokens: t0, solUsd: 100, strategy: st, trading: TRADING, now: 1, newId }).agent;
  const t1 = new Map([['M1', tok({ priceSol: 0.0015, change5m: 0 })]]); // +50% → take profit (40%)
  const r = runAgent(a, { tokens: t1, solUsd: 100, strategy: st, trading: TRADING, now: 2, newId });
  assert.equal(r.trades[0].side, 'SELL');
  assert.equal(r.trades[0].source, 'take-profit');
  a = r.agent;
  assert.equal(a.positions.length, 0);
  const eq = equityOf(a, () => null);
  near(pnlOf(a, eq), a.stats.realizedPnlSol, 1e-8);
  assert.ok(a.stats.realizedPnlSol > 0.03, 'about +40% on 0.1 SOL minus costs');
  assert.equal(a.stats.wins, 1);
  assert.equal(a.stats.closedTrades, 1);
});

test('withdrawals do not change P&L; liquidate sells everything', () => {
  const st = resolveStrategy('classic');
  let a = runAgent(agent(), { tokens: new Map([['M1', tok()]]), solUsd: 100, strategy: st, trading: TRADING, now: 1, newId }).agent;
  const ctx = { tokens: new Map([['M1', tok({ priceSol: 0.0011 })]]), solUsd: 100, trading: TRADING, now: 2, newId };
  const before = pnlOf(a, equityOf(a, (m) => ctx.tokens.get(m)?.priceSol));
  const { agent: b, trades } = liquidate(a, ctx);
  assert.equal(trades.length, 1);
  assert.equal(b.positions.length, 0);
  const after = pnlOf(b, equityOf(b, () => null));
  assert.ok(after < before, 'selling costs impact + fees');
  b.withdrawnSol += 0.5; b.cashSol -= 0.5;
  near(pnlOf(b, equityOf(b, () => null)), after, 1e-9);
});

test('levels follow best profit', () => {
  assert.equal(levelFor(0).name, 'Apprentice');
  assert.equal(levelFor(0.1).name, 'Bricklayer');
  assert.equal(levelFor(2).name, 'Site Lead');
  assert.equal(levelFor(100).no, 6);
  assert.equal(levelFor(100).next, null);
});

test('custom strategies resolve to runtime rules', () => {
  const c = { id: 'custom-abc', name: 'Mine', base: 'scalper', params: { sizePct: 0.2, maxOpen: 2, takeProfitPct: 0.1, stopLossPct: -0.05, trailAt: 0, trailBy: 0.03, maxHoldMin: 0, cooldownMin: 0, minLiquidityUsd: 40000, minVol5mUsd: 1000, minChange5m: 0.01 } };
  const st = resolveStrategy('custom-abc', c);
  assert.equal(st.base, 'scalper');
  assert.equal(st.trail, null);
  assert.equal(st.maxHoldMin, null);
  assert.ok(entrySignal(st, tok({ volume5mUsd: 2000, change5m: 0.02 })));
});
