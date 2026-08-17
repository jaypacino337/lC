/* The decision engine.
 *
 * Your requirement, restated: the callout pipeline and the trade pipeline are
 * separate. Callouts scan everything and fire on anything half-decent, because
 * the business is reward farming. Trades are selective, sized larger, and exit
 * on different rules. So `evaluate()` returns two independent verdicts from one
 * pass over the same evidence.
 *
 * Signals combined, each in [0,1] and weighted:
 *
 *   copyCaller   a caller above threshold has called it
 *   earlyBuy     a caller ABOVE THE ELITE BAR bought it and has NOT called it
 *   velocity     unique buyers and net inflow over 5m
 *   freshness    younger is better, inside the gate window
 *
 * earlyBuy carries the most weight because it is the only signal here with a
 * genuine informational lead — everything else is visible to anyone reading the
 * same feed at the same time.
 */
import { SCORING } from './callerScore.js';
import { tradeGates, calloutGates } from './filters.js';
import { clamp, nowMs } from '../util.js';

/* Two weightings, because the two pipelines want different things.
 *
 * TRADE is earlyBuy-dominant: to risk money we want the informational lead, and
 * a setup without it should stay small or be skipped.
 *
 * CALLOUT deliberately does NOT lean on earlyBuy. The business is reward farming,
 * so coverage is the goal and a decent token with a trusted call and live flow is
 * worth calling whether or not an elite wallet happened to front-run it. Gating
 * callouts on the trading edge would suppress most of the callable universe. */
export const TRADE_WEIGHTS = {
  earlyBuy:   0.40,
  copyCaller: 0.30,
  velocity:   0.20,
  freshness:  0.10
};

export const CALLOUT_WEIGHTS = {
  copyCaller: 0.40,
  velocity:   0.30,
  freshness:  0.15,
  earlyBuy:   0.15   // a bonus, never a requirement
};

/** Back-compat alias; the trade weighting is the "primary" score. */
export const WEIGHTS = TRADE_WEIGHTS;

export const THRESHOLDS = {
  callout: 0.28,   // low bar on purpose — coverage is the point
  trade:   0.58    // real money, real conviction
};

/**
 * @param {object} ctx
 *   token            normalised Token
 *   activity         output of deriveActivity()
 *   callers          [{caller, score, calledAt}] callouts seen for this mint
 *   reputableBuyers  [{wallet, score, at, usd}] buys by scored wallets
 *   calloutCount     how many callouts this mint already has
 *   alreadyCalledByUs
 *   existing         our open position, if any
 */
export function evaluate(ctx, opts = {}) {
  const now = opts.now ?? nowMs();
  const wTrade = { ...TRADE_WEIGHTS, ...opts.weights };
  const wCallout = { ...CALLOUT_WEIGHTS, ...opts.calloutWeights };
  const th = { ...THRESHOLDS, ...opts.thresholds };
  const sc = { ...SCORING, ...opts.scoring };

  const signals = {};
  const reasons = [];

  /* ── copyCaller ───────────────────────────────────────────────────────── */
  const good = (ctx.callers ?? []).filter(c => c.score >= sc.followThreshold);
  if (good.length) {
    const best = Math.max(...good.map(c => c.score));
    /* Extra callers add confidence but with diminishing returns. */
    signals.copyCaller = clamp(best * (1 + 0.12 * (good.length - 1)), 0, 1);
    reasons.push(`${good.length} trusted caller(s), best ${best.toFixed(2)}`);
  } else {
    signals.copyCaller = 0;
  }

  /* ── earlyBuy — the edge ──────────────────────────────────────────────── */
  const elite = (ctx.reputableBuyers ?? []).filter(b => b.score >= sc.eliteThreshold);
  const silentElite = elite.filter(b => !good.some(c => c.caller === b.wallet));
  if (silentElite.length) {
    const best = Math.max(...silentElite.map(b => b.score));
    signals.earlyBuy = clamp(best * (1 + 0.15 * (silentElite.length - 1)), 0, 1);
    reasons.push(
      `${silentElite.length} elite wallet(s) bought without calling, best ${best.toFixed(2)}`
    );
  } else {
    signals.earlyBuy = 0;
  }

  /* ── velocity ─────────────────────────────────────────────────────────── */
  const a = ctx.activity;
  if (a) {
    const buyers = clamp(a.buyers5m / 40, 0, 1);
    const inflow = clamp((a.netInflow5m ?? 0) / 8000, 0, 1);
    const ratio = clamp(((a.buySellRatio ?? 1) - 1) / 3, 0, 1);
    signals.velocity = clamp(buyers * 0.45 + inflow * 0.35 + ratio * 0.20, 0, 1);
    if (signals.velocity > 0.5) {
      reasons.push(`velocity ${a.buyers5m} buyers / ${Math.round(a.netInflow5m ?? 0)} net`);
    }
  } else {
    signals.velocity = 0;
  }

  /* ── freshness ────────────────────────────────────────────────────────── */
  if (ctx.token?.createdAt) {
    const ageMin = (now - ctx.token.createdAt) / 60_000;
    signals.freshness = clamp(1 - ageMin / 120, 0, 1);   // decays over 2h
  } else {
    signals.freshness = 0.3;   // unknown age: neutral-ish, do not reward
  }

  /* ── blend ────────────────────────────────────────────────────────────── */
  const blend = (weights) => clamp(
    Object.entries(weights).reduce((s, [k, weight]) => s + weight * (signals[k] ?? 0), 0),
    0, 1
  );
  const tradeScore = blend(wTrade);
  const calloutScore = blend(wCallout);

  /* ── verdicts ─────────────────────────────────────────────────────────── */
  const calloutReject = calloutGates(ctx, opts.gates);
  const tradeReject = tradeGates({ ...ctx, now }, opts.gates);

  const shouldCallout = !calloutReject && calloutScore >= th.callout;
  const shouldTrade = !tradeReject && tradeScore >= th.trade;

  return {
    /* `score` is the conviction (trade) score — used for ranking risk. */
    score: tradeScore,
    calloutScore,
    signals,
    reasons,
    callout: {
      should: shouldCallout,
      score: calloutScore,
      reject: calloutReject,
      threshold: th.callout
    },
    trade: {
      should: shouldTrade,
      score: tradeScore,
      reject: tradeReject,
      threshold: th.trade,
      /* Size scales with conviction above the bar, capped by config. */
      convictionFrac: shouldTrade
        ? clamp((tradeScore - th.trade) / (1 - th.trade), 0.25, 1)
        : 0
    }
  };
}
