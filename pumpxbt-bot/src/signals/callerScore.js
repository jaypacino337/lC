/* Caller reputation.
 *
 * The thing you asked for — "filter based off their previous callouts and their
 * percentages, filter out the bad ones, only take the good ones" — is this file.
 *
 * Two corrections to a naive win-rate, both of which matter a lot in practice:
 *
 *  1. SHRINKAGE. A caller who is 1-for-1 is not better than one who is 40-for-50,
 *     but a raw rate says 100% vs 80%. We use a Wilson lower bound, so a rating
 *     has to be earned with volume before it counts.
 *
 *  2. TIME DECAY. Someone who called well six months ago in a different market
 *     is not evidence about today. Wins are weighted by an exponential decay,
 *     defaulting to a 14-day half-life.
 *
 * Together these make the score hard to farm with a lucky streak, which is
 * exactly what you need if you are going to copy these people with money.
 */
import { wilsonLowerBound, decay, nowMs, clamp } from '../util.js';

export const SCORING = {
  /** A callout counts as a win if it ever traded at this multiple of call price. */
  winMultiple: 2.0,
  /** How long after a call we wait before scoring it. */
  windowMs: 60 * 60_000,
  /** Recency half-life for weighting past calls. */
  halfLifeMs: 14 * 24 * 60 * 60_000,
  /** Below this many resolved calls a caller is untrusted regardless of rate. */
  minResolved: 5,
  /** Callers must clear this to be copied. */
  followThreshold: 0.35,
  /** Higher bar for the "bought but hasn't called" signal — real money follows it. */
  eliteThreshold: 0.55
};

/**
 * Scores one caller from their resolved history.
 *
 * @param {Array<{at:number,is_win:number,peak_mult:number|null}>} history
 * @returns {{score:number,nResolved:number,nWins:number,rawWinRate:number,
 *            avgPeakMult:number|null,lastCallAt:number|null,weighted:object}}
 */
export function scoreCaller(history, opts = {}) {
  const o = { ...SCORING, ...opts };
  const now = opts.now ?? nowMs();

  if (!history?.length) {
    return {
      score: 0, nResolved: 0, nWins: 0, rawWinRate: 0,
      avgPeakMult: null, lastCallAt: null,
      weighted: { wins: 0, total: 0 }
    };
  }

  let wins = 0, wWins = 0, wTotal = 0, peakSum = 0, peakN = 0, lastCallAt = null;

  for (const h of history) {
    const isWin = h.is_win === 1 || h.is_win === true;
    if (isWin) wins++;

    const w = decay(now - h.at, o.halfLifeMs);
    wTotal += w;
    if (isWin) wWins += w;

    if (Number.isFinite(h.peak_mult)) { peakSum += h.peak_mult; peakN++; }
    if (lastCallAt === null || h.at > lastCallAt) lastCallAt = h.at;
  }

  const nResolved = history.length;
  const rawWinRate = wins / nResolved;

  /* Wilson on the decayed counts: recency shapes the estimate, and the effective
   * sample size shrinks it toward zero when the evidence is thin or stale. */
  let score = wilsonLowerBound(wWins, wTotal);

  /* Hard gate on volume — a Wilson bound on 2 samples is still noise. */
  if (nResolved < o.minResolved) {
    score *= nResolved / o.minResolved;
  }

  return {
    score: clamp(score, 0, 1),
    nResolved,
    nWins: wins,
    rawWinRate,
    avgPeakMult: peakN ? peakSum / peakN : null,
    lastCallAt,
    weighted: { wins: wWins, total: wTotal }
  };
}

/**
 * Resolves a callout into win/loss given the price path after the call.
 *
 * @param {number} priceAtCall
 * @param {Array<{at:number,price:number}>} path prices observed after the call
 */
export function resolveOutcome(priceAtCall, path, opts = {}) {
  const o = { ...SCORING, ...opts };
  if (!(priceAtCall > 0) || !path?.length) return null;

  let peak = priceAtCall;
  for (const p of path) if (Number.isFinite(p.price) && p.price > peak) peak = p.price;

  const last = [...path].reverse().find(p => Number.isFinite(p.price));
  const peakMult = peak / priceAtCall;
  const endMult = last ? last.price / priceAtCall : null;

  return {
    peakMult,
    endMult,
    isWin: peakMult >= o.winMultiple,
    windowMs: o.windowMs
  };
}

/** Recomputes and persists stats for every caller. Cheap enough to run often. */
export function rebuildAllCallerStats(store, opts = {}) {
  const callers = store.allCallers();
  let updated = 0;

  store.tx(() => {
    for (const caller of callers) {
      const history = store.callerHistory(caller);
      const s = scoreCaller(history, opts);
      store.upsertCallerStats({
        caller,
        nCalls: history.length,
        nResolved: s.nResolved,
        nWins: s.nWins,
        rawWinRate: s.rawWinRate,
        score: s.score,
        avgPeakMult: s.avgPeakMult,
        lastCallAt: s.lastCallAt
      });
      updated++;
    }
  });
  return updated;
}
