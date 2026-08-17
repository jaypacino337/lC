/* Portfolio accounting and risk limits.
 *
 * The interesting constraint is yours: you must keep ~$1 of a token to stay
 * eligible to call it. That makes the exit rule unusual — a position is never
 * fully closed while you want to keep calling it. So:
 *
 *   sellableUsd = positionValue - callEligibilityFloor
 *
 * `plannedExit` can never breach the floor, and a position reduced to the floor
 * is marked 'floored' rather than 'closed': still held, still call-eligible, but
 * no longer carrying real exposure.
 *
 * Note this means the floor is capital you are choosing never to recover. At $1
 * a token across hundreds of tokens that is a real, growing cost — the ledger
 * tracks it as `flooredCapitalUsd` so it stays visible instead of quietly
 * accumulating.
 */
import { config } from '../config.js';
import { nowMs, clamp } from '../util.js';

export class Portfolio {
  constructor(store, { econ = config.econ, risk = config.risk } = {}) {
    this.store = store;
    this.econ = econ;
    this.risk = risk;
  }

  /** Mark-to-market value of an open position at the given price. */
  valueOf(position, price) {
    if (!Number.isFinite(price)) return null;
    return position.tokens * price;
  }

  /** Unrealised PnL in USD and as a fraction of remaining cost basis. */
  unrealised(position, price) {
    const value = this.valueOf(position, price);
    if (value === null) return { usd: null, frac: null };
    const usd = value - position.cost_usd;
    return { usd, frac: position.cost_usd > 0 ? usd / position.cost_usd : null };
  }

  /** How much of a position may be sold without losing call eligibility. */
  sellableUsd(position, price, { keepEligible = true } = {}) {
    const value = this.valueOf(position, price);
    if (value === null) return 0;
    const floor = keepEligible ? this.econ.callFloorUsd : 0;
    return Math.max(0, value - floor);
  }

  /**
   * Decides whether and how much to exit.
   *
   * Probes and conviction trades exit on different rules, as you asked:
   *  - probe: opened only to unlock a callout, so take profit early and hold the
   *    floor forever. No stop — the position is $2 and the floor is $1, so the
   *    most it can lose is a dollar.
   *  - trade: real exposure, so it gets a stop, a target, and a time stop.
   */
  plannedExit(position, price, { now = nowMs() } = {}) {
    const value = this.valueOf(position, price);
    if (value === null) return null;

    const { frac } = this.unrealised(position, price);
    const ageMs = now - position.opened_at;
    const sellable = this.sellableUsd(position, price);

    if (sellable <= 0) return null;   // already at or below the floor

    const decide = (reason, portion) => ({
      reason,
      usd: clamp(sellable * portion, 0, sellable),
      portion
    });

    if (position.kind === 'probe') {
      /* Probes exist to justify a callout. Bank anything meaningful. */
      if (frac !== null && frac >= 0.5) return decide('probe +50%', 1);
      if (ageMs > 6 * 60 * 60_000) return decide('probe timeout', 1);
      return null;
    }

    /* Conviction trades. */
    if (frac !== null) {
      if (frac <= -0.35) return decide('stop -35%', 1);
      if (frac >= 3.0) return decide('target +300%', 1);
      if (frac >= 1.0) return decide('scale out +100%', 0.5);
    }
    if (ageMs > 4 * 60 * 60_000) return decide('time stop 4h', 1);
    return null;
  }

  /* ── Risk limits ────────────────────────────────────────────────────────
   * Checked before every open. Returns a reason string to block, or null. */
  canOpen(kind, usd, { now = nowMs() } = {}) {
    const open = this.store.openPositions();
    if (open.length >= this.risk.maxOpenPositions) {
      return `max open positions (${this.risk.maxOpenPositions})`;
    }
    const dayStart = now - 24 * 60 * 60_000;
    const deployed = this.store.deployedSince(dayStart);
    if (deployed + usd > this.risk.maxDailyDeployUsd) {
      return `daily deploy cap: ${deployed.toFixed(2)} + ${usd.toFixed(2)} > ${this.risk.maxDailyDeployUsd}`;
    }
    if (usd <= 0) return 'non-positive size';
    return null;
  }

  /** Size for a trade given conviction, capped by config. */
  sizeFor(kind, convictionFrac = 1) {
    if (kind === 'probe') return this.econ.probeUsd;
    return Math.max(this.econ.probeUsd, this.econ.tradeMaxUsd * convictionFrac);
  }

  /** Everything the site's ledger needs, in one call. */
  summary(priceBook = {}) {
    const open = this.store.openPositions();
    const closed = this.store.closedPositions(500);

    let openValue = 0, openCost = 0, flooredCapital = 0;
    const positions = open.map(p => {
      const price = priceBook[p.mint] ?? p.entry_price;
      const value = this.valueOf(p, price) ?? 0;
      openValue += value;
      openCost += p.cost_usd;
      if (p.status === 'floored') flooredCapital += value;
      const u = this.unrealised(p, price);
      return {
        mint: p.mint, kind: p.kind, status: p.status,
        openedAt: p.opened_at, tokens: p.tokens,
        entryPrice: p.entry_price, price,
        costUsd: p.cost_usd, valueUsd: value,
        unrealisedUsd: u.usd, unrealisedFrac: u.frac
      };
    });

    const realised = closed.reduce((s, p) => s + (p.realised_usd ?? 0), 0) +
                     open.reduce((s, p) => s + (p.realised_usd ?? 0), 0);
    const fees = [...open, ...closed].reduce((s, p) => s + (p.fees_usd ?? 0), 0);
    const wins = closed.filter(p => (p.realised_usd ?? 0) > 0).length;

    return {
      positions,
      openCount: open.length,
      openCostUsd: openCost,
      openValueUsd: openValue,
      unrealisedUsd: openValue - openCost,
      realisedUsd: realised,
      feesUsd: fees,
      flooredCapitalUsd: flooredCapital,
      closedCount: closed.length,
      winCount: wins,
      winRate: closed.length ? wins / closed.length : null
    };
  }
}
