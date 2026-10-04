import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MemoryStore, setStore } from '../lib/store.js';
import { verifyAction, verifyEd25519 } from '../lib/auth.js';
import { devWallet } from '../lib/devkeys.js';
import * as app from '../lib/app.js';
import { handle } from '../lib/router.js';
import { FILTERS } from '../lib/config.js';
import { isEligible, oneSided, normalizePair } from '../lib/market.js';

process.env.AUTO_TICK = 'false';

// a fake market: one token whose price we control
let price = 0.001;
const fakeMarket = async ({ now }) => {
  const t = { mint: 'MINT1', symbol: 'TEST', name: 'Test', priceSol: price, priceUsd: price * 100, liquidityUsd: 1e6, volume24hUsd: 5e6, volume1hUsd: 5e5, volume5mUsd: 5e4, change5m: 0.05, change1h: 0.1, change6h: 0.3, change24h: 0.5, buys5m: 40, sells5m: 10, mcapUsd: 1e7, ageHours: 48, eligible: true, spark: [] };
  return { ts: now, solUsd: 100, tokens: [t], bonded: [], history: {}, errors: [], ready: true };
};

function fresh() { const s = new MemoryStore(); setStore(s); return s; }

test('signatures: valid, tampered, wrong action, expired, replayed', async () => {
  const store = fresh();
  const w = devWallet();
  const ok = w.action('pause', 'paper:ag_1');
  assert.ok(verifyEd25519(w.address, Buffer.from(ok.message), ok.signature));
  const m = await verifyAction(ok, { action: 'pause', builder: 'paper:ag_1', creator: w.address }, { store });
  assert.equal(m.creator, w.address);
  await assert.rejects(verifyAction(ok, { action: 'pause', builder: 'paper:ag_1' }, { store }), /already used/);
  const t = w.action('pause', 'paper:ag_1');
  await assert.rejects(verifyAction({ ...t, message: t.message.replace('pause', 'resume') }, { action: 'resume' }, { store }), /Bad signature/);
  await assert.rejects(verifyAction(w.action('pause', 'x'), { action: 'withdraw' }, { store }), /expected "withdraw"/);
  await assert.rejects(verifyAction(w.action('pause', 'x', [], new Date(Date.now() - 3_600_000)), { action: 'pause' }, { store }), /expired/);
  const other = devWallet();
  await assert.rejects(verifyAction(w.action('pause', 'x'), { action: 'pause', creator: other.address }, { store }), /Only the creator/);
});

test('market filters drop one-sided order flow', () => {
  const p = { baseToken: { address: 'A', symbol: 'A' }, priceUsd: '1', liquidity: { usd: 1e6 }, volume: { h24: 1e6 }, marketCap: 1e7, pairCreatedAt: Date.now() - 5 * 3600e3, priceChange: { m5: 1, h1: 2 }, txns: { h24: { buys: 5000, sells: 20 } } };
  const t = normalizePair(p, 100);
  assert.equal(t.change5m, 0.01, 'percent → fraction');
  assert.ok(oneSided(t));
  assert.equal(isEligible(t, FILTERS), false);
  t.sells24h = 3000;
  assert.equal(isEligible(t, FILTERS), true);
});

test('end to end: launch → tick buys → price up → take profit → honest stats', async () => {
  const store = fresh();
  price = 0.001;
  const w = devWallet();
  const auth = w.action('launch', 'new', ['Name: Tester', 'Ticker: TST', 'Capital: 1 SOL (paper)']);
  const r = await app.prepareLaunch({ creator: w.address, coin: { name: 'Test coin', ticker: 'TST' }, agentName: 'Tester', startingCapital: 1, strategy: 'classic', ...auth });
  assert.equal(r.paper, true);
  assert.match(r.wallet, /^paper:/, 'paper builders get no real-looking address');
  // capital mismatch with the signed message is refused
  const bad = w.action('launch', 'new', ['Name: Tester', 'Ticker: TST', 'Capital: 1 SOL (paper)']);
  await assert.rejects(app.prepareLaunch({ creator: w.address, coin: { name: 'x', ticker: 'TST' }, agentName: 'Tester', startingCapital: 50, ...bad }), /capital/i);

  let t = await app.tick({ force: true, marketLoader: fakeMarket });
  assert.equal(t.ok, true);
  assert.equal(t.trades, 1);
  let s = await app.getState(store);
  assert.equal(s.feed[0].side, 'BUY');
  assert.equal(s.feed[0].paper, true);
  assert.equal(s.stats.paper, true);
  assert.equal(s.config.mode, 'paper');

  price = 0.0015; // +50% → classic take profit at +40%
  t = await app.tick({ force: true, marketLoader: fakeMarket });
  s = await app.getState(store);
  const sell = s.feed.find((x) => x.side === 'SELL');
  assert.equal(sell.source, 'take-profit');
  const a = s.agents[0];
  // P&L shown = sum of closed trade P&L (no open positions left at this point, or marked at market)
  const detail = await app.getAgentDetail(a.id, store);
  if (!detail.positions.length) assert.ok(Math.abs(detail.pnlSol - detail.realizedPnlSol) < 1e-6);
  assert.ok(s.stats.pnlSol > 0);
  assert.equal(s.stats.trades24h, detail.history.length);
  assert.ok(Math.abs(s.stats.volume24hSol - detail.history.reduce((x, y) => x + y.sol, 0)) < 1e-6);
});

test('creator actions: pause, strategy, paper deposit, withdraw; strangers are refused', async () => {
  const store = fresh();
  price = 0.001;
  const w = devWallet(), stranger = devWallet();
  const L = w.action('launch', 'new', ['Name: Boss', 'Ticker: BOSS', 'Capital: 2 SOL (paper)']);
  const { agentId, wallet } = await app.prepareLaunch({ creator: w.address, coin: { name: 'Boss', ticker: 'BOSS' }, agentName: 'Boss', startingCapital: 2, ...L });
  await assert.rejects(app.setPaused(agentId, { paused: true, ...stranger.action('pause', wallet) }), /Only the creator/);
  await app.setPaused(agentId, { paused: true, ...w.action('pause', wallet) });
  assert.equal((await app.getAgentDetail(agentId, store)).status, 'PAUSED');
  await app.setStrategy(agentId, { strategy: 'trend', ...w.action('strategy', wallet, ['Strategy: trend']) });
  assert.equal((await app.getAgentDetail(agentId, store)).strategy, 'trend');
  await assert.rejects(app.setStrategy(agentId, { strategy: 'trend', ...w.action('strategy', wallet, ['Strategy: dip']) }), /missing/);
  await app.paperDeposit(agentId, { amountSol: 0.5, ...w.action('paper-deposit', wallet, ['Amount: 0.5 SOL (paper)']) });
  let d = await app.getAgentDetail(agentId, store);
  assert.equal(d.depositedSol, 2.5);
  assert.equal(d.pnlSol, 0, 'deposits are never profit');
  const wd = await app.paperWithdraw(agentId, { all: false, amountSol: 1, ...w.action('withdraw', wallet, ['Amount: 1 SOL']) });
  assert.equal(wd.sig, null);
  d = await app.getAgentDetail(agentId, store);
  assert.equal(d.withdrawnSol, 1);
  assert.equal(d.pnlSol, 0, 'withdrawals are never losses');
});

test('custom strategy: save (signed settings), apply, prompt reader', async () => {
  const store = fresh();
  const w = devWallet();
  const r0 = app.promptStrategy('quick scalps, take profit 12%, stop loss 4%, 15% per trade, max 2 positions, liquidity $80k');
  assert.equal(r0.base, 'scalper');
  assert.equal(r0.params.takeProfitPct, 0.12);
  assert.equal(r0.params.stopLossPct, -0.04);
  assert.equal(r0.params.sizePct, 0.15);
  assert.equal(r0.params.minLiquidityUsd, 80000);
  const { settingsLine } = await import('../public/shared/custom-strategy.js');
  const auth = w.action('custom-strategy', 'none', [settingsLine('Quick', r0.base, r0.params)]);
  const saved = await app.saveCustom({ owner: w.address, name: 'Quick', base: r0.base, params: r0.params, ...auth });
  assert.match(saved.strategy.id, /^custom-/);
  assert.equal((await app.getCustom(w.address, store)).strategy.name, 'Quick');
});

test('HTTP router: state, agent 404, stubbed features answer 501, tick needs auth on Vercel', async () => {
  fresh();
  const srv = http.createServer((req, res) => handle(req, res)).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const st = await (await fetch(base + '/api/state')).json();
    assert.equal(st.config.paper, true);
    assert.equal((await fetch(base + '/api/agents/ag_nope')).status, 404);
    const r = await fetch(base + '/api/agents/x/skin/buy', { method: 'POST', body: '{}' });
    assert.equal(r.status, 501);
    assert.equal((await fetch(base + '/api/nope')).status, 404);
    process.env.VERCEL = '1';
    assert.equal((await fetch(base + '/api/tick')).status, 401);
    process.env.CRON_SECRET = 's3cret';
    assert.equal((await fetch(base + '/api/tick', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  } finally { delete process.env.VERCEL; delete process.env.CRON_SECRET; srv.close(); }
});
