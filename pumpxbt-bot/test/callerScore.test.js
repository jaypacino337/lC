import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCaller, resolveOutcome, SCORING } from '../src/signals/callerScore.js';
import { wilsonLowerBound, decay } from '../src/util.js';

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const hist = (n, wins, ageDays = 1) =>
  Array.from({ length: n }, (_, i) => ({
    at: NOW - ageDays * DAY,
    is_win: i < wins ? 1 : 0,
    peak_mult: i < wins ? 3 : 0.5
  }));

test('wilson bound shrinks small samples toward zero', () => {
  const perfectSmall = wilsonLowerBound(1, 1);
  const strongLarge = wilsonLowerBound(40, 50);
  assert.ok(perfectSmall < strongLarge,
    `1/1 (${perfectSmall.toFixed(3)}) must not outrank 40/50 (${strongLarge.toFixed(3)})`);
});

test('a 1-for-1 caller does not outrank a proven one', () => {
  const lucky = scoreCaller(hist(1, 1), { now: NOW });
  const proven = scoreCaller(hist(50, 40), { now: NOW });
  assert.ok(proven.score > lucky.score);
  assert.equal(lucky.rawWinRate, 1);   // raw rate is perfect...
  assert.ok(lucky.score < 0.2);        // ...but the score is not fooled
});

test('below minResolved the score is penalised', () => {
  const thin = scoreCaller(hist(2, 2), { now: NOW });
  const enough = scoreCaller(hist(SCORING.minResolved, SCORING.minResolved), { now: NOW });
  assert.ok(thin.score < enough.score);
});

test('stale wins score below recent wins', () => {
  const recent = scoreCaller(hist(20, 16, 1), { now: NOW });
  const stale = scoreCaller(hist(20, 16, 180), { now: NOW });
  assert.ok(recent.score > stale.score,
    `recent ${recent.score.toFixed(3)} should beat stale ${stale.score.toFixed(3)}`);
  assert.equal(recent.rawWinRate, stale.rawWinRate);   // same raw rate
});

test('a bad caller scores near zero and fails the follow threshold', () => {
  const bad = scoreCaller(hist(20, 1), { now: NOW });
  assert.ok(bad.score < SCORING.followThreshold);
});

test('a good caller clears the follow threshold', () => {
  const good = scoreCaller(hist(30, 24, 2), { now: NOW });
  assert.ok(good.score >= SCORING.followThreshold,
    `expected >= ${SCORING.followThreshold}, got ${good.score.toFixed(3)}`);
});

test('empty history is score zero, not NaN', () => {
  const s = scoreCaller([], { now: NOW });
  assert.equal(s.score, 0);
  assert.equal(s.nResolved, 0);
  assert.ok(Number.isFinite(s.score));
});

test('decay halves at one half-life', () => {
  assert.ok(Math.abs(decay(DAY, DAY) - 0.5) < 1e-9);
  assert.equal(decay(0, DAY), 1);
});

test('resolveOutcome marks a 2x peak as a win', () => {
  const out = resolveOutcome(100, [{ at: 1, price: 150 }, { at: 2, price: 210 }, { at: 3, price: 120 }]);
  assert.equal(out.isWin, true);
  assert.ok(Math.abs(out.peakMult - 2.1) < 1e-9);
  assert.ok(Math.abs(out.endMult - 1.2) < 1e-9);
});

test('resolveOutcome marks a pump that never doubled as a loss', () => {
  const out = resolveOutcome(100, [{ at: 1, price: 150 }, { at: 2, price: 80 }]);
  assert.equal(out.isWin, false);
});

test('resolveOutcome guards bad input', () => {
  assert.equal(resolveOutcome(0, [{ at: 1, price: 5 }]), null);
  assert.equal(resolveOutcome(100, []), null);
});
