/* Paper execution.
 *
 * Simulates fills so the strategy can be measured without funds at risk. The
 * point of paper mode is only useful if it is pessimistic, so costs are modelled
 * rather than ignored:
 *
 *   - a fixed round-trip cost in bps (pump.fun fee + priority fee)
 *   - size-dependent slippage against available liquidity
 *
 * A paper run that ignores slippage will show an edge that evaporates the moment
 * real money touches it, which is the standard way these projects lose money.
 *
 * Deliberately no signing, no keypair, no RPC writes. Live execution is a
 * separate module that does not exist yet, on purpose.
 */
import { config } from '../config.js';
import { log } from '../log.js';
import { nowMs, hashId, clamp, usd as fmtUsd } from '../util.js';

export class PaperBroker {
  constructor(store, { econ = config.econ, startUsd = config.risk.paperStartUsd } = {}) {
    this.store = store;
    this.econ = econ;
    this.startUsd = startUsd;
    /* Derived from the ledger, never held only in memory: positions survive a
     * restart, so cash must too. Holding it in a field meant every restart
     * re-minted the starting balance while the open positions stayed open. */
    this.cashUsd = this.computeCash();
  }

  /** Starting balance plus every settled buy (negative) and sell (positive). */
  computeCash() {
    const rows = this.store.ledgerTotals();
    const flow = rows
      .filter(r => r.kind === 'buy' || r.kind === 'sell')
      .reduce((s, r) => s + r.total, 0);
    return this.startUsd + flow;
  }

  /**
   * Slippage as a fraction, from order size against liquidity.
   * Square-root impact is the standard rough model; with no liquidity figure we
   * assume a punishing 3% rather than a flattering 0%.
   */
  slippageFrac(orderUsd, liquidityUsd) {
    if (!Number.isFinite(liquidityUsd) || liquidityUsd <= 0) return 0.03;
    return clamp(0.4 * Math.sqrt(orderUsd / liquidityUsd), 0, 0.25);
  }

  costFrac() { return this.econ.costBps / 10_000; }

  /** Simulated buy. Returns the created position id, or null if blocked. */
  buy({ mint, kind, usdSize, price, liquidityUsd, reason }) {
    if (!(price > 0)) { log.warn('paper buy skipped: no price', { mint }); return null; }
    if (usdSize > this.cashUsd) {
      log.warn('paper buy skipped: insufficient paper cash',
        { mint, need: fmtUsd(usdSize), have: fmtUsd(this.cashUsd) });
      return null;
    }

    const slip = this.slippageFrac(usdSize, liquidityUsd);
    const fillPrice = price * (1 + slip);
    const fees = usdSize * this.costFrac();
    const tokens = (usdSize - fees) / fillPrice;
    const openedAt = nowMs();

    const id = this.store.openPosition({
      id: hashId('pos', mint, openedAt),
      mint, kind, openedAt,
      entryPrice: fillPrice,
      tokens,
      costUsd: usdSize,
      feesUsd: fees,
      reasonOpen: reason,
      paper: true
    });

    this.cashUsd -= usdSize;
    this.store.addLedger({
      at: openedAt, kind: 'buy', usd: -usdSize, mint, ref: id,
      note: `paper ${kind} @ ${fillPrice.toExponential(3)} slip ${(slip * 100).toFixed(2)}%`
    });

    log.info('paper buy', {
      mint, kind, size: fmtUsd(usdSize), slip: `${(slip * 100).toFixed(2)}%`, reason
    });
    return id;
  }

  /**
   * Simulated sell of `usdTarget` worth. Never sells more than the position
   * holds; the call-eligibility floor is enforced by Portfolio.sellableUsd
   * before this is reached.
   */
  sell({ positionId, usdTarget, price, liquidityUsd, reason }) {
    const p = this.store.getPosition(positionId);
    if (!p) { log.warn('paper sell: unknown position', { positionId }); return null; }
    if (!(price > 0)) { log.warn('paper sell: no price', { mint: p.mint }); return null; }

    const positionValue = p.tokens * price;
    const target = Math.min(usdTarget, positionValue);
    if (target <= 0) return null;

    const slip = this.slippageFrac(target, liquidityUsd);
    const fillPrice = price * (1 - slip);
    const tokensSold = Math.min(p.tokens, target / fillPrice);
    const gross = tokensSold * fillPrice;
    const fees = gross * this.costFrac();
    const proceeds = gross - fees;

    /* Cost basis attributable to the tokens sold. */
    const basis = p.cost_usd * (tokensSold / p.tokens);
    const realised = proceeds - basis;
    const fullExit = tokensSold >= p.tokens * 0.999;

    if (fullExit) {
      this.store.closePosition(positionId, {
        exitPrice: fillPrice,
        proceedsUsd: (p.proceeds_usd ?? 0) + proceeds,
        realisedUsd: (p.realised_usd ?? 0) + realised,
        reason,
        status: 'closed'
      });
    } else {
      this.store.reducePosition(positionId, {
        tokensSold, proceedsUsd: proceeds, realisedUsd: realised, reason
      });
    }

    this.cashUsd += proceeds;
    this.store.addLedger({
      at: nowMs(), kind: 'sell', usd: proceeds, mint: p.mint, ref: positionId,
      note: `paper exit ${reason} realised ${fmtUsd(realised)}`
    });

    log.info('paper sell', {
      mint: p.mint, got: fmtUsd(proceeds), realised: fmtUsd(realised),
      full: fullExit, reason
    });
    return { proceeds, realised, fullExit, tokensSold };
  }
}
