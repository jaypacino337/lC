/* Market regime — "is today a day to be trading at all?"
 *
 * Publicly the site just says the agent "picks its moments". Concretely, this
 * is what that means: aggregate flow across everything we can see on pump.fun
 * (total 5m volume, unique buyers, buy/sell skew) compared against a rolling
 * baseline the bot maintains of what "normal" has looked like lately. Hot tape
 * loosens the trade threshold and sizes up; dead tape tightens and sizes down;
 * callouts keep flowing in every regime because coverage is the reward business.
 *
 * The baseline is an EMA persisted in the meta table, so the notion of "normal"
 * survives restarts and adapts as the market itself grows or dies. */
import { nowMs, clamp } from '../util.js';

export const REGIME = {
  windowMs: 5 * 60_000,
  emaAlpha: 0.05,            // slow: ~20 observations to move the baseline
  hotRatio: 1.35,            // observed / baseline above this = risk_on
  coldRatio: 0.60,           // below this = risk_off
  /* effect on the TRADE pipeline only */
  effects: {
    risk_on:  { thresholdDelta: -0.05, sizeMult: 1.15 },
    neutral:  { thresholdDelta: 0,     sizeMult: 1.0 },
    risk_off: { thresholdDelta: +0.08, sizeMult: 0.6 }
  }
};

/** Raw activity across ALL trades seen this tick (not per-mint). */
export function marketActivity(trades, { windowMs = REGIME.windowMs, now = nowMs() } = {}) {
  const recent = trades.filter(t => t.at >= now - windowMs);
  const buys = recent.filter(t => t.isBuy);
  const sells = recent.filter(t => !t.isBuy);
  const sum = a => a.reduce((s, t) => s + (t.usd ?? 0), 0);
  return {
    volume: sum(recent),
    buyers: new Set(buys.map(t => t.wallet)).size,
    buyFlow: sum(buys),
    sellFlow: sum(sells),
    trades: recent.length
  };
}

export class RegimeTracker {
  constructor(db, opts = {}) {
    this.db = db;
    this.o = { ...REGIME, ...opts };
    this.last = null;
  }

  _get(key, d) {
    const r = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return r ? Number(r.value) : d;
  }
  _set(key, v) {
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
      .run(key, String(v));
  }

  /**
   * Feed one tick's trades; returns the current regime verdict.
   * { regime, ratio, activity, thresholdDelta, sizeMult }
   */
  observe(trades, { now = nowMs() } = {}) {
    const a = marketActivity(trades, { now, windowMs: this.o.windowMs });

    /* Composite "flow" score: volume dominates, breadth (buyers) keeps a single
     * whale from reading as a hot market. */
    const flow = a.volume * (0.7 + 0.3 * Math.min(1, a.buyers / 40));

    let base = this._get('regime_baseline', 0);
    if (base <= 0) base = flow || 1;            // first observation seeds it
    const ratio = flow / base;

    /* Update the baseline AFTER computing the ratio, so a spike is judged
     * against yesterday's normal, not against itself. */
    this._set('regime_baseline', base + this.o.emaAlpha * (flow - base));

    const regime = ratio >= this.o.hotRatio ? 'risk_on'
                 : ratio <= this.o.coldRatio ? 'risk_off'
                 : 'neutral';
    const fx = this.o.effects[regime];

    this.last = {
      regime,
      ratio: Number(clamp(ratio, 0, 99).toFixed(2)),
      activity: a,
      thresholdDelta: fx.thresholdDelta,
      sizeMult: fx.sizeMult,
      at: now
    };
    this._set('regime_last', JSON.stringify(this.last));
    return this.last;
  }

  /** Last verdict, surviving restarts — for the API and the X brain. */
  current() {
    if (this.last) return this.last;
    const r = this.db.prepare("SELECT value FROM meta WHERE key = 'regime_last'").get();
    return r ? JSON.parse(r.value) : null;
  }
}
