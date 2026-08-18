import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store/db.js';
import { RegimeTracker, marketActivity } from '../src/signals/regime.js';
import { adaptation, ADAPT } from '../src/signals/adapt.js';

const NOW = 1_760_000_000_000;
const trades = (n, usdEach, { buyers = n, now = NOW } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    wallet: 'w' + (i % buyers), mint: 'M', at: now - 1000 - i,
    usd: usdEach, isBuy: true
  }));

/* ── market activity ─────────────────────────────────────────────────────── */

test('marketActivity aggregates across all mints in the window', () => {
  const a = marketActivity([
    { wallet: 'a', mint: 'M1', at: NOW - 1000, usd: 100, isBuy: true },
    { wallet: 'b', mint: 'M2', at: NOW - 2000, usd: 200, isBuy: true },
    { wallet: 'c', mint: 'M1', at: NOW - 3000, usd: 50, isBuy: false },
    { wallet: 'd', mint: 'M3', at: NOW - 60 * 60_000, usd: 999, isBuy: true } // stale
  ], { now: NOW });
  assert.equal(a.volume, 350);
  assert.equal(a.buyers, 2);
  assert.equal(a.sellFlow, 50);
});

/* ── regime ──────────────────────────────────────────────────────────────── */

function tracker() {
  const store = new Store(':memory:');
  return { store, r: new RegimeTracker(store.db) };
}

test('first observation seeds the baseline as neutral', () => {
  const { store, r } = tracker();
  const v = r.observe(trades(10, 100), { now: NOW });
  assert.equal(v.regime, 'neutral');
  assert.ok(Math.abs(v.ratio - 1) < 0.01);
  store.close();
});

test('a volume spike against an established baseline reads risk_on', () => {
  const { store, r } = tracker();
  for (let i = 0; i < 10; i++) r.observe(trades(10, 100, { now: NOW + i }), { now: NOW + i });
  const v = r.observe(trades(10, 500), { now: NOW + 100 });
  assert.equal(v.regime, 'risk_on');
  assert.ok(v.thresholdDelta < 0, 'hot tape lowers the trade bar');
  assert.ok(v.sizeMult > 1);
  store.close();
});

test('dead tape reads risk_off and tightens', () => {
  const { store, r } = tracker();
  for (let i = 0; i < 10; i++) r.observe(trades(10, 100, { now: NOW + i }), { now: NOW + i });
  const v = r.observe(trades(2, 10, { now: NOW + 100 }), { now: NOW + 100 });
  assert.equal(v.regime, 'risk_off');
  assert.ok(v.thresholdDelta > 0);
  assert.ok(v.sizeMult < 1);
  store.close();
});

test('a single whale does not read as a hot market', () => {
  const { store, r } = tracker();
  for (let i = 0; i < 10; i++) {
    r.observe(trades(30, 100, { buyers: 30, now: NOW + i }), { now: NOW + i });
  }
  /* Same total volume, one buyer: breadth factor should hold it below hot. */
  const whale = [{ wallet: 'whale', mint: 'M', at: NOW + 99, usd: 3600, isBuy: true }];
  const v = r.observe(whale, { now: NOW + 100 });
  assert.notEqual(v.regime, 'risk_on');
  store.close();
});

test('regime persists across a restart', () => {
  const { store, r } = tracker();
  r.observe(trades(10, 100), { now: NOW });
  const fresh = new RegimeTracker(store.db);
  assert.equal(fresh.current().regime, 'neutral');
  store.close();
});

/* ── adaptation ──────────────────────────────────────────────────────────── */

const closed = (wins, losses, winUsd = 10, lossUsd = -8) => [
  ...Array.from({ length: wins }, () => ({ realised_usd: winUsd })),
  ...Array.from({ length: losses }, () => ({ realised_usd: lossUsd }))
];

test('no adjustment below the minimum sample', () => {
  const a = adaptation(closed(2, 1));
  assert.equal(a.thresholdDelta, 0);
  assert.equal(a.sizeMult, 1);
  assert.equal(a.winRate, null);
});

test('a losing record raises the bar and cuts size', () => {
  const a = adaptation(closed(2, 10));
  assert.ok(a.thresholdDelta > 0, 'losing should tighten');
  assert.ok(a.sizeMult < 1);
});

test('a winning record eases the bar within bounds', () => {
  const a = adaptation(closed(9, 3));
  assert.ok(a.thresholdDelta < 0);
  assert.ok(a.sizeMult > 1);
  assert.ok(a.sizeMult <= ADAPT.maxSizeMult);
});

test('good win rate with net-negative pnl still sizes down', () => {
  /* many tiny wins, few huge losses — the classic blowup shape */
  const a = adaptation(closed(9, 3, 1, -20));
  assert.ok(a.pnlUsd < 0);
  assert.ok(a.sizeMult <= 0.8, `sizeMult ${a.sizeMult} should be braked by negative pnl`);
});

test('adjustments are hard-bounded no matter how extreme the record', () => {
  const dire = adaptation(closed(0, 20));
  assert.ok(dire.thresholdDelta <= ADAPT.maxThresholdDelta);
  assert.ok(dire.sizeMult >= ADAPT.minSizeMult);
  const godlike = adaptation(closed(20, 0, 100));
  assert.ok(Math.abs(godlike.thresholdDelta) <= ADAPT.maxThresholdDelta);
  assert.ok(godlike.sizeMult <= ADAPT.maxSizeMult);
});
