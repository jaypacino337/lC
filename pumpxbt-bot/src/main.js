/* Orchestrator.
 *
 * One tick:
 *   1. ingest recent callouts + trades          (observe)
 *   2. resolve callouts old enough to score     (learn)
 *   3. rebuild caller reputation                (learn)
 *   4. evaluate candidate mints                 (decide)
 *   5. probe-buy + queue callout, or trade      (act, simulated)
 *   6. manage exits on open positions           (act, simulated)
 *
 * Paper mode throughout: nothing here signs a transaction.
 */
import { config, validate } from './config.js';
import { log } from './log.js';
import { Store } from './store/db.js';
import { PumpFunClient, deriveActivity } from './sources/pumpfun.js';
import { RpcPool } from './sources/rpcPool.js';
import { rebuildAllCallerStats, resolveOutcome, SCORING } from './signals/callerScore.js';
import { evaluate } from './signals/engine.js';
import { Portfolio } from './exec/portfolio.js';
import { PaperBroker } from './exec/paper.js';
import { queueCallout, alertText } from './callouts/composer.js';
import { Alerts } from './alerts/telegram.js';
import { sleep, nowMs, usd } from './util.js';

export class Bot {
  constructor({ store, pump, rpc, alerts } = {}) {
    validate();
    this.store = store ?? new Store();
    this.pump = pump ?? new PumpFunClient();
    this.rpc = rpc ?? new RpcPool();
    this.alerts = alerts ?? new Alerts();
    this.portfolio = new Portfolio(this.store);
    this.broker = new PaperBroker(this.store);

    this.priceBook = new Map();   // mint -> last known price
    this.running = false;
    this.ticks = 0;
  }

  /* ── 1. Observe ───────────────────────────────────────────────────────── */
  async ingest() {
    let newCallouts = 0, newTrades = 0;

    const callouts = await this.pump.recentCallouts({ limit: 100 });
    this.store.tx(() => {
      for (const c of callouts) {
        if (this.store.insertCallout(c).inserted) newCallouts++;
      }
    });

    const trades = await this.pump.recentTrades({ limit: 300 });
    this.store.tx(() => {
      for (const t of trades) {
        if (!t.isBuy) continue;
        this.store.insertWalletBuy({
          id: t.id, wallet: t.wallet, mint: t.mint, at: t.at, usd: t.usd, price: t.price
        });
        newTrades++;
      }
    });

    for (const t of trades) {
      if (Number.isFinite(t.price)) this.priceBook.set(t.mint, t.price);
    }
    return { newCallouts, newTrades, trades };
  }

  /* ── 2. Learn: resolve matured callouts ───────────────────────────────── */
  async resolveMatured() {
    const pending = this.store.unresolvedCallouts(SCORING.windowMs, 100);
    let resolved = 0;

    for (const c of pending) {
      /* Price path after the call. In fixture mode this comes from the trade
       * feed; live, this wants a proper candle source for accuracy. */
      const trades = await this.pump.recentTrades({ mint: c.mint, limit: 200 });
      const calledAt = c.called_at ?? c.seen_at;
      const path = trades
        .filter(t => t.at >= calledAt && Number.isFinite(t.price))
        .map(t => ({ at: t.at, price: t.price }));

      if (!path.length) continue;

      const outcome = resolveOutcome(c.price_at_call, path);
      if (!outcome) continue;

      this.store.recordOutcome({ calloutId: c.id, ...outcome });
      resolved++;
    }
    return resolved;
  }

  /* ── 4. Decide ────────────────────────────────────────────────────────── */
  async evaluateCandidates(trades) {
    /* Candidate universe: anything called recently or traded recently. Callouts
     * cover far more than we buy, so the universe is deliberately wide. */
    const mints = new Set();
    for (const c of this.store.db
      .prepare('SELECT DISTINCT mint FROM callouts ORDER BY seen_at DESC LIMIT 80').all()) {
      mints.add(c.mint);
    }
    for (const t of trades.slice(0, 200)) mints.add(t.mint);

    const results = [];
    for (const mint of mints) {
      try {
        const r = await this.evaluateMint(mint, trades);
        if (r) results.push(r);
      } catch (err) {
        log.debug('evaluate failed', { mint, err: err.message });
      }
    }
    return results;
  }

  async evaluateMint(mint, allTrades) {
    const token = await this.pump.token(mint);
    if (!token) return null;
    if (Number.isFinite(token.price)) this.priceBook.set(mint, token.price);

    const mintTrades = allTrades.filter(t => t.mint === mint);
    const activity = mintTrades.length
      ? deriveActivity(mintTrades)
      : (Number.isFinite(token.buyers5m)
          ? { buyers5m: token.buyers5m, volume5m: token.volume5m ?? 0,
              netInflow5m: token.netInflow5m ?? 0, buySellRatio: 1 }
          : null);

    /* Callers who called this mint, with their current reputation. */
    const callers = this.store.db.prepare(`
      SELECT c.caller, COALESCE(s.score, 0) AS score, c.called_at AS calledAt
      FROM callouts c LEFT JOIN caller_stats s ON s.caller = c.caller
      WHERE c.mint = ?
    `).all(mint);

    const ctx = {
      token,
      activity,
      callers,
      reputableBuyers: this.store.reputableBuyers(
        mint, SCORING.eliteThreshold, nowMs() - 60 * 60_000
      ),
      calloutCount: this.store.calloutCountForMint(mint),
      alreadyCalledByUs: this.store.weCalled(mint),
      existing: this.store.positionForMint(mint)
    };

    const verdict = evaluate(ctx);

    this.store.recordDecision({
      mint,
      at: nowMs(),
      callout: verdict.callout.should,
      trade: verdict.trade.should,
      score: verdict.callout.should ? verdict.calloutScore : verdict.score,
      rejected: verdict.callout.reject ?? verdict.trade.reject ?? null,
      reasons: verdict.reasons
    });

    return { mint, token, activity, ctx, verdict };
  }

  /* ── 5. Act ───────────────────────────────────────────────────────────── */
  async act(candidates) {
    let probes = 0, trades = 0, queued = 0;

    /* Best first, so the risk budget goes to the strongest signals. Rank on
     * whichever score actually qualified the candidate. */
    const rank = (v) => Math.max(
      v.trade.should ? v.trade.score : 0,
      v.callout.should ? v.callout.score : 0
    );
    const ranked = candidates
      .filter(c => c.verdict.callout.should || c.verdict.trade.should)
      .sort((a, b) => rank(b.verdict) - rank(a.verdict));

    for (const c of ranked) {
      const { token, verdict, activity } = c;
      const isTrade = verdict.trade.should;
      const kind = isTrade ? 'trade' : 'probe';
      const size = this.portfolio.sizeFor(kind, verdict.trade.convictionFrac);

      const blocked = this.portfolio.canOpen(kind, size);
      if (blocked) { log.debug('open blocked', { mint: token.mint, blocked }); continue; }

      const positionId = this.broker.buy({
        mint: token.mint,
        kind,
        usdSize: size,
        price: token.price,
        liquidityUsd: token.liquidity,
        reason: verdict.reasons.join('; ') ||
          `${kind} score ${(isTrade ? verdict.score : verdict.calloutScore).toFixed(2)}`
      });
      if (!positionId) continue;

      isTrade ? trades++ : probes++;

      /* A buy of any size unlocks the callout, which is the actual business. */
      if (verdict.callout.should) {
        const composed = queueCallout(this.store, {
          token, verdict, activity, positionId
        });
        queued++;
        await this.alerts.send(alertText({
          token, composed, positionId, probeUsd: size
        }));
        log.info('callout queued', {
          mint: token.mint, score: verdict.calloutScore.toFixed(2), text: composed.text
        });
      }
    }
    return { probes, trades, queued };
  }

  /* ── 6. Manage exits ──────────────────────────────────────────────────── */
  async manageExits() {
    let exits = 0;
    for (const p of this.store.openPositions()) {
      const price = this.priceBook.get(p.mint);
      if (!Number.isFinite(price)) continue;

      const plan = this.portfolio.plannedExit(p, price);
      if (!plan || plan.usd <= 0) continue;

      const token = await this.pump.token(p.mint).catch(() => null);
      const res = this.broker.sell({
        positionId: p.id,
        usdTarget: plan.usd,
        price,
        liquidityUsd: token?.liquidity,
        reason: plan.reason
      });
      if (res) exits++;
    }
    return exits;
  }

  /* ── Tick ─────────────────────────────────────────────────────────────── */
  async tick() {
    const t0 = nowMs();
    const { newCallouts, newTrades, trades } = await this.ingest();
    const resolved = await this.resolveMatured();
    const callersUpdated = rebuildAllCallerStats(this.store);
    const candidates = await this.evaluateCandidates(trades);
    const acted = await this.act(candidates);
    const exits = await this.manageExits();

    this.ticks++;
    const sum = this.portfolio.summary(Object.fromEntries(this.priceBook));

    log.info('tick', {
      n: this.ticks,
      ms: nowMs() - t0,
      newCallouts, newTrades, resolved, callersUpdated,
      evaluated: candidates.length,
      ...acted,
      exits,
      open: sum.openCount,
      unrealised: usd(sum.unrealisedUsd),
      realised: usd(sum.realisedUsd),
      paperCash: usd(this.broker.cashUsd)
    });

    return { newCallouts, newTrades, resolved, candidates: candidates.length, ...acted, exits };
  }

  async run({ once = false } = {}) {
    this.running = true;
    log.info('pumpxbt bot starting', {
      mode: config.mode,
      source: config.source,
      heliusKeys: this.rpc.size,
      alerts: this.alerts.enabled ? 'telegram' : 'off',
      db: config.dbPath
    });
    if (config.source === 'fixture') {
      log.warn('running on FIXTURES — no live data. Set PXBT_SOURCE=live once endpoints are verified.');
    }

    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        log.error('tick failed', { err: err.message, stack: err.stack?.split('\n')[1]?.trim() });
      }
      if (once) break;
      await sleep(config.pollIntervalMs);
    }
  }

  stop() { this.running = false; }
}

/* ── Entry point ─────────────────────────────────────────────────────────── */
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const bot = new Bot();
  const once = process.argv.includes('--once');

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      log.info('shutting down', { signal: sig });
      bot.stop();
      setTimeout(() => process.exit(0), 500);
    });
  }
  bot.run({ once }).catch(err => {
    log.error('fatal', { err: err.message });
    process.exit(1);
  });
}
