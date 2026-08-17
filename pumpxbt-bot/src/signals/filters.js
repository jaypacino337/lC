/* Hard gates. Each returns null to pass or a string reason to reject.
 *
 * Gates are cheap boolean safety, evaluated before any scoring: they exist to
 * make whole classes of token un-buyable rather than merely low-scoring. Order
 * matters — cheapest and most decisive first. */
import { nowMs } from '../util.js';

export const GATES = {
  minLiquidityUsd: 1500,
  minUniqueBuyers5m: 6,
  minAgeMs: 45_000,             // ignore the first seconds; too much is noise
  maxAgeMs: 12 * 60 * 60_000,   // and it is not "early" after half a day
  minVolume5mUsd: 800,
  maxCalloutsAlready: 8,        // already saturated, the reward is gone
  requireNetInflow: true
};

/** Gates for buying with money. */
export function tradeGates(ctx, opts = {}) {
  const g = { ...GATES, ...opts };
  const { token, activity, existing, now = nowMs() } = ctx;

  if (!token) return 'no token data';
  if (existing) return 'already holding';
  if (!Number.isFinite(token.price) || token.price <= 0) return 'no usable price';

  if (Number.isFinite(token.liquidity) && token.liquidity < g.minLiquidityUsd) {
    return `liquidity ${Math.round(token.liquidity)} < ${g.minLiquidityUsd}`;
  }
  if (token.createdAt) {
    const age = now - token.createdAt;
    if (age < g.minAgeMs) return `too new (${Math.round(age / 1000)}s)`;
    if (age > g.maxAgeMs) return 'too old to be early';
  }
  if (activity) {
    if (activity.buyers5m < g.minUniqueBuyers5m) {
      return `only ${activity.buyers5m} buyers in 5m`;
    }
    if (activity.volume5m < g.minVolume5mUsd) {
      return `volume ${Math.round(activity.volume5m)} < ${g.minVolume5mUsd}`;
    }
    if (g.requireNetInflow && activity.netInflow5m <= 0) {
      return 'net outflow';
    }
  }
  return null;
}

/**
 * Gates for publishing a callout.
 *
 * Deliberately looser than tradeGates: you said callouts should cover far more
 * than we buy, because the reward is for calling, not for conviction. The only
 * hard requirements are that it is real, we have not already called it, and the
 * callout space is not already crowded.
 */
export function calloutGates(ctx, opts = {}) {
  const g = { ...GATES, ...opts };
  const { token, alreadyCalledByUs, calloutCount } = ctx;

  if (!token) return 'no token data';
  if (alreadyCalledByUs) return 'we already called it';
  if (!Number.isFinite(token.price) || token.price <= 0) return 'no usable price';
  if (calloutCount >= g.maxCalloutsAlready) {
    return `${calloutCount} callouts already — saturated`;
  }
  return null;
}
