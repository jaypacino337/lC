import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, THRESHOLDS } from '../src/signals/engine.js';
import { tradeGates, calloutGates } from '../src/signals/filters.js';
import { SCORING } from '../src/signals/callerScore.js';

const NOW = 1_760_000_000_000;

const token = (over = {}) => ({
  mint: 'M', symbol: 'SYM', price: 0.00001, mcap: 25000,
  liquidity: 30000, createdAt: NOW - 5 * 60_000, ...over
});

const activity = (over = {}) => ({
  buyers5m: 20, volume5m: 5000, netInflow5m: 3000, buySellRatio: 3, ...over
});

const base = (over = {}) => ({
  token: token(), activity: activity(),
  callers: [], reputableBuyers: [],
  calloutCount: 0, alreadyCalledByUs: false, existing: null, ...over
});

test('a silent elite buyer is the strongest single signal', () => {
  const withElite = evaluate(base({
    reputableBuyers: [{ wallet: 'E', score: 0.8, at: NOW, usd: 900 }]
  }), { now: NOW });

  const withCaller = evaluate(base({
    callers: [{ caller: 'C', score: 0.8, calledAt: NOW }]
  }), { now: NOW });

  assert.ok(withElite.signals.earlyBuy > 0.7);
  assert.ok(withElite.score > withCaller.score,
    'pre-call accumulation should outweigh a published call');
});

test('an elite wallet that already called does not count as an early buy', () => {
  const v = evaluate(base({
    callers: [{ caller: 'E', score: 0.8, calledAt: NOW }],
    reputableBuyers: [{ wallet: 'E', score: 0.8, at: NOW, usd: 900 }]
  }), { now: NOW });
  assert.equal(v.signals.earlyBuy, 0, 'same wallet called it, so there is no lead');
});

test('low-score callers are ignored entirely', () => {
  const v = evaluate(base({
    callers: [{ caller: 'bad', score: 0.05, calledAt: NOW }]
  }), { now: NOW });
  assert.equal(v.signals.copyCaller, 0);
});

test('callout threshold is looser than the trade threshold', () => {
  assert.ok(THRESHOLDS.callout < THRESHOLDS.trade);

  /* A middling setup should be callable but not tradeable — the whole point of
     separating coverage from conviction. */
  const v = evaluate(base({
    callers: [{ caller: 'C', score: 0.45, calledAt: NOW }],
    activity: activity({ buyers5m: 9, netInflow5m: 700, buySellRatio: 1.4 })
  }), { now: NOW });

  assert.equal(v.callout.should, true,
    `callout score ${v.calloutScore.toFixed(3)} should clear ${THRESHOLDS.callout}`);
  assert.equal(v.trade.should, false,
    `trade score ${v.score.toFixed(3)} should miss ${THRESHOLDS.trade}`);
});

test('callout scoring does not depend on the early-buy edge', () => {
  /* Coverage is the business: a decent token with a trusted call and live flow
     must be callable even with no elite wallet front-running it. */
  const noEdge = evaluate(base({
    callers: [{ caller: 'C', score: 0.5, calledAt: NOW }],
    reputableBuyers: []
  }), { now: NOW });

  assert.equal(noEdge.signals.earlyBuy, 0);
  assert.equal(noEdge.callout.should, true,
    `callout score ${noEdge.calloutScore.toFixed(3)} should still clear the bar`);
  assert.ok(noEdge.calloutScore > noEdge.score,
    'without the edge, the callout score should exceed the conviction score');
});

test('the two scores are reported separately and consistently', () => {
  const v = evaluate(base({
    callers: [{ caller: 'C', score: 0.6, calledAt: NOW }]
  }), { now: NOW });
  assert.equal(v.callout.score, v.calloutScore);
  assert.equal(v.trade.score, v.score);
  assert.notEqual(v.calloutScore, v.score, 'different weightings should give different scores');
});

test('a strong setup clears both bars and sizes up', () => {
  const v = evaluate(base({
    callers: [{ caller: 'C', score: 0.7, calledAt: NOW }],
    reputableBuyers: [
      { wallet: 'E1', score: 0.85, at: NOW, usd: 1200 },
      { wallet: 'E2', score: 0.75, at: NOW, usd: 800 }
    ],
    activity: activity({ buyers5m: 45, netInflow5m: 9000, buySellRatio: 5 })
  }), { now: NOW });

  assert.equal(v.callout.should, true);
  assert.equal(v.trade.should, true);
  assert.ok(v.trade.convictionFrac > 0.25);
});

test('already holding blocks a trade but the gate is separate from scoring', () => {
  const ctx = base({
    existing: { id: 'p', mint: 'M' },
    reputableBuyers: [{ wallet: 'E', score: 0.9, at: NOW, usd: 900 }]
  });
  const v = evaluate(ctx, { now: NOW });
  assert.equal(v.trade.should, false);
  assert.match(v.trade.reject, /already holding/);
});

test('saturated callout space blocks calling', () => {
  const v = evaluate(base({ calloutCount: 20 }), { now: NOW });
  assert.equal(v.callout.should, false);
  assert.match(v.callout.reject, /saturated/);
});

test('we never call the same mint twice', () => {
  const v = evaluate(base({ alreadyCalledByUs: true }), { now: NOW });
  assert.match(v.callout.reject, /already called/);
});

test('gates reject thin liquidity and dead flow', () => {
  assert.match(tradeGates({ token: token({ liquidity: 100 }), activity: activity(), now: NOW }), /liquidity/);
  assert.match(tradeGates({ token: token(), activity: activity({ netInflow5m: -500 }), now: NOW }), /net outflow/);
  assert.match(tradeGates({ token: token(), activity: activity({ buyers5m: 2 }), now: NOW }), /buyers/);
});

test('gates reject tokens that are too new or too old', () => {
  assert.match(tradeGates({ token: token({ createdAt: NOW - 1000 }), activity: activity(), now: NOW }), /too new/);
  assert.match(tradeGates({ token: token({ createdAt: NOW - 40 * 60 * 60_000 }), activity: activity(), now: NOW }), /too old/);
});

test('a token with no price is unusable for both pipelines', () => {
  const ctx = base({ token: token({ price: null }) });
  assert.match(tradeGates({ ...ctx, now: NOW }), /price/);
  assert.match(calloutGates(ctx), /price/);
});

test('scores stay within [0,1] under extreme input', () => {
  const v = evaluate(base({
    callers: Array.from({ length: 30 }, (_, i) => ({ caller: `c${i}`, score: 1, calledAt: NOW })),
    reputableBuyers: Array.from({ length: 30 }, (_, i) => ({ wallet: `e${i}`, score: 1, at: NOW, usd: 1e6 })),
    activity: activity({ buyers5m: 1e6, netInflow5m: 1e9, buySellRatio: 1e6 })
  }), { now: NOW });
  assert.ok(v.score <= 1 && v.score >= 0, `score out of range: ${v.score}`);
  for (const [k, val] of Object.entries(v.signals)) {
    assert.ok(val <= 1 && val >= 0, `${k} out of range: ${val}`);
  }
});

test('elite threshold is stricter than follow threshold', () => {
  assert.ok(SCORING.eliteThreshold > SCORING.followThreshold,
    'copying money should demand more evidence than noting a call');
});
