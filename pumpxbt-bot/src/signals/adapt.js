/* Learning from its own outcomes.
 *
 * "Make it learn from its mistakes" without hand-waving: the only honest,
 * inspectable version of that at this stage is outcome-conditioned risk. The
 * bot looks at its own recently closed positions and adjusts how hard it is to
 * pull the trigger:
 *
 *   - losing streak  -> raise the trade bar, cut size (trade less until the
 *                       signal proves itself again)
 *   - winning record -> ease the bar slightly, restore size
 *
 * Adjustments are BOUNDED and DERIVED — recomputed from the ledger every tick,
 * never accumulated — so a bug cannot ratchet the bot into either recklessness
 * or paralysis, and restarts change nothing. It also never touches the callout
 * pipeline: coverage is the business, conviction is what gets tuned.
 *
 * This is deliberately not an ML weight update. With dozens of trades, fitting
 * anything fancier than "are we actually winning lately?" is fitting noise. */
import { clamp } from '../util.js';

export const ADAPT = {
  lookback: 20,              // most recent closed positions considered
  minSample: 5,              // below this, no adjustment at all
  /* bounds on what learning is allowed to do */
  maxThresholdDelta: 0.08,
  minSizeMult: 0.5,
  maxSizeMult: 1.15,
  /* the win rate at which no adjustment is applied */
  pivotWinRate: 0.45
};

/**
 * @param {Array<{realised_usd:number|null}>} closed newest first
 * @returns {{thresholdDelta:number, sizeMult:number, winRate:number|null,
 *            sample:number, pnlUsd:number}}
 */
export function adaptation(closed, opts = {}) {
  const o = { ...ADAPT, ...opts };
  const sample = closed.slice(0, o.lookback);
  const graded = sample.filter(p => Number.isFinite(p.realised_usd));

  if (graded.length < o.minSample) {
    return { thresholdDelta: 0, sizeMult: 1, winRate: null, sample: graded.length, pnlUsd: 0 };
  }

  const wins = graded.filter(p => p.realised_usd > 0).length;
  const winRate = wins / graded.length;
  const pnlUsd = graded.reduce((s, p) => s + p.realised_usd, 0);

  /* Linear in (winRate - pivot), clamped. Losing hard (-pivot below) hits the
   * full brake; a strong record eases the bar by at most half the brake. */
  const edge = winRate - o.pivotWinRate;
  const thresholdDelta = clamp(-edge * 0.3, -o.maxThresholdDelta / 2, o.maxThresholdDelta);

  /* Size follows PnL direction too: a positive win rate with net-negative PnL
   * (small wins, big losses) still sizes down. */
  let sizeMult = 1 + edge * 0.8;
  if (pnlUsd < 0) sizeMult = Math.min(sizeMult, 0.8);
  sizeMult = clamp(sizeMult, o.minSizeMult, o.maxSizeMult);

  return {
    thresholdDelta: Number(thresholdDelta.toFixed(3)),
    sizeMult: Number(sizeMult.toFixed(2)),
    winRate: Number(winRate.toFixed(2)),
    sample: graded.length,
    pnlUsd: Number(pnlUsd.toFixed(2))
  };
}
