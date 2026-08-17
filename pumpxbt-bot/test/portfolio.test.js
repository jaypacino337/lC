import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store/db.js';
import { Portfolio } from '../src/exec/portfolio.js';
import { PaperBroker } from '../src/exec/paper.js';

const econ = { probeUsd: 2, callFloorUsd: 1, tradeMaxUsd: 25, costBps: 180 };
const risk = { maxOpenPositions: 5, maxDailyDeployUsd: 100, paperStartUsd: 500 };

function fresh() {
  const store = new Store(':memory:');
  return { store, pf: new Portfolio(store, { econ, risk }) };
}

test('sellableUsd reserves the call-eligibility floor', () => {
  const { pf } = fresh();
  const pos = { tokens: 1000, cost_usd: 2, kind: 'probe', opened_at: 0 };
  // 1000 tokens at 0.005 = $5 value; $1 must stay behind
  assert.equal(pf.sellableUsd(pos, 0.005), 4);
});

test('sellableUsd is zero when the position is at the floor', () => {
  const { pf } = fresh();
  const pos = { tokens: 100, cost_usd: 2, kind: 'probe', opened_at: 0 };
  assert.equal(pf.sellableUsd(pos, 0.01), 0);      // exactly $1
  assert.equal(pf.sellableUsd(pos, 0.005), 0);     // below $1
});

test('plannedExit never proposes selling through the floor', () => {
  const { pf } = fresh();
  const pos = { tokens: 1000, cost_usd: 2, kind: 'probe', opened_at: 0, id: 'p' };
  const plan = pf.plannedExit(pos, 0.005);         // $5 value, +150%
  assert.ok(plan, 'should want to exit a profitable probe');
  assert.ok(plan.usd <= 4 + 1e-9, `proposed ${plan.usd}, max sellable is 4`);
});

test('probe with no profit is left alone', () => {
  const { pf } = fresh();
  const pos = { tokens: 1000, cost_usd: 2, kind: 'probe', opened_at: Date.now() };
  assert.equal(pf.plannedExit(pos, 0.002), null);  // $2 value, flat
});

test('conviction trade stops out at -35%', () => {
  const { pf } = fresh();
  const pos = { tokens: 1000, cost_usd: 20, kind: 'trade', opened_at: Date.now() };
  const plan = pf.plannedExit(pos, 0.012);         // $12 value, -40%
  assert.ok(plan);
  assert.match(plan.reason, /stop/);
});

test('conviction trade scales out at +100% and fully exits at +300%', () => {
  const { pf } = fresh();
  const pos = { tokens: 1000, cost_usd: 20, kind: 'trade', opened_at: Date.now() };

  const half = pf.plannedExit(pos, 0.042);         // $42, +110%
  assert.equal(half.portion, 0.5);

  const full = pf.plannedExit(pos, 0.090);         // $90, +350%
  assert.equal(full.portion, 1);
});

test('canOpen enforces the daily deploy cap', () => {
  const { store, pf } = fresh();
  const broker = new PaperBroker(store, { econ });
  for (let i = 0; i < 4; i++) {
    broker.buy({ mint: `M${i}`, kind: 'trade', usdSize: 25, price: 0.001, liquidityUsd: 50000, reason: 't' });
  }
  const blocked = pf.canOpen('trade', 25);   // 100 already deployed, cap is 100
  assert.ok(blocked, 'should block');
  assert.match(blocked, /daily deploy cap/);
});

test('canOpen enforces max open positions', () => {
  const { store, pf } = fresh();
  const broker = new PaperBroker(store, { econ });
  for (let i = 0; i < 5; i++) {
    broker.buy({ mint: `X${i}`, kind: 'probe', usdSize: 2, price: 0.001, liquidityUsd: 50000, reason: 't' });
  }
  const blocked = pf.canOpen('probe', 2);
  assert.match(blocked, /max open positions/);
});

test('paper cash survives a restart instead of re-minting capital', () => {
  const store = new Store(':memory:');
  const a = new PaperBroker(store, { econ, startUsd: 500 });
  a.buy({ mint: 'R1', kind: 'trade', usdSize: 25, price: 0.001, liquidityUsd: 50000, reason: 't' });
  a.buy({ mint: 'R2', kind: 'probe', usdSize: 2, price: 0.001, liquidityUsd: 50000, reason: 't' });
  assert.equal(a.cashUsd, 473);

  /* A second broker over the same store is what a process restart looks like. */
  const b = new PaperBroker(store, { econ, startUsd: 500 });
  assert.equal(b.cashUsd, 473, 'restart must not reset cash while positions are open');
  store.close();
});

test('paper cash reflects proceeds after a sell', () => {
  const store = new Store(':memory:');
  const a = new PaperBroker(store, { econ, startUsd: 100 });
  const id = a.buy({ mint: 'S1', kind: 'trade', usdSize: 20, price: 0.001, liquidityUsd: 50000, reason: 't' });
  const res = a.sell({ positionId: id, usdTarget: 40, price: 0.003, liquidityUsd: 50000, reason: 'target' });
  const restarted = new PaperBroker(store, { econ, startUsd: 100 });
  assert.ok(Math.abs(restarted.cashUsd - (100 - 20 + res.proceeds)) < 1e-6);
  store.close();
});

test('summary reports floored capital separately', () => {
  const { store, pf } = fresh();
  const broker = new PaperBroker(store, { econ });
  const id = broker.buy({ mint: 'FL', kind: 'probe', usdSize: 2, price: 0.001, liquidityUsd: 50000, reason: 't' });
  // sell down toward the floor
  broker.sell({ positionId: id, usdTarget: 4, price: 0.0025, liquidityUsd: 50000, reason: 'probe +50%' });
  const s = pf.summary({ FL: 0.0025 });
  assert.ok(s.realisedUsd !== 0, 'should have realised something');
  assert.ok(Number.isFinite(s.flooredCapitalUsd));
});
