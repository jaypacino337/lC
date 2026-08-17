/* Repository layer over node:sqlite. All SQL lives here; nothing else in the
 * codebase writes queries. Every statement is parameterised. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DDL, SCHEMA_VERSION } from './schema.js';
import { config } from '../config.js';
import { hashId, nowMs } from '../util.js';

export function open(path = config.dbPath) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(DDL);
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run('schema_version', String(SCHEMA_VERSION));
  return db;
}

export class Store {
  constructor(path = config.dbPath) {
    this.db = open(path);
  }
  close() { this.db.close(); }

  /** Runs fn inside a transaction, rolling back on throw. */
  tx(fn) {
    this.db.exec('BEGIN');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // ── Callouts observed ───────────────────────────────────────────────────
  /** Idempotent: re-seeing the same callout is a no-op. Returns true if new. */
  insertCallout(c) {
    const id = c.id || hashId(c.caller, c.mint, c.calledAt);
    const res = this.db.prepare(`
      INSERT OR IGNORE INTO callouts
        (id, caller, mint, seen_at, called_at, price_at_call, mcap_at_call, raw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, c.caller, c.mint, c.seenAt ?? nowMs(), c.calledAt ?? null,
           c.priceAtCall ?? null, c.mcapAtCall ?? null,
           c.raw ? JSON.stringify(c.raw) : null);
    return { id, inserted: res.changes > 0 };
  }

  getCallout(id) {
    return this.db.prepare('SELECT * FROM callouts WHERE id = ?').get(id);
  }

  /** Callouts old enough to score but not yet resolved. */
  unresolvedCallouts(windowMs, limit = 200) {
    return this.db.prepare(`
      SELECT c.* FROM callouts c
      LEFT JOIN callout_outcomes o ON o.callout_id = c.id
      WHERE o.callout_id IS NULL
        AND c.price_at_call IS NOT NULL
        AND COALESCE(c.called_at, c.seen_at) <= ?
      ORDER BY c.seen_at ASC
      LIMIT ?
    `).all(nowMs() - windowMs, limit);
  }

  recordOutcome(o) {
    this.db.prepare(`
      INSERT OR REPLACE INTO callout_outcomes
        (callout_id, resolved_at, peak_mult, end_mult, is_win, window_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(o.calloutId, o.resolvedAt ?? nowMs(), o.peakMult ?? null,
           o.endMult ?? null, o.isWin ? 1 : 0, o.windowMs);
  }

  /** Resolved history for one caller, newest first — input to scoring. */
  callerHistory(caller, limit = 500) {
    return this.db.prepare(`
      SELECT c.id, c.mint, COALESCE(c.called_at, c.seen_at) AS at,
             o.is_win, o.peak_mult
      FROM callouts c
      JOIN callout_outcomes o ON o.callout_id = c.id
      WHERE c.caller = ?
      ORDER BY at DESC
      LIMIT ?
    `).all(caller, limit);
  }

  allCallers() {
    return this.db.prepare('SELECT DISTINCT caller FROM callouts').all().map(r => r.caller);
  }

  hasCalled(caller, mint) {
    return this.db.prepare(
      'SELECT 1 FROM callouts WHERE caller = ? AND mint = ? LIMIT 1'
    ).get(caller, mint) !== undefined;
  }

  /** Any callout at all for this mint — used to detect uncalled tokens. */
  calloutCountForMint(mint) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM callouts WHERE mint = ?').get(mint).n;
  }

  // ── Caller reputation ───────────────────────────────────────────────────
  upsertCallerStats(s) {
    this.db.prepare(`
      INSERT INTO caller_stats
        (caller, n_calls, n_resolved, n_wins, raw_win_rate, score,
         avg_peak_mult, last_call_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (caller) DO UPDATE SET
        n_calls = excluded.n_calls, n_resolved = excluded.n_resolved,
        n_wins = excluded.n_wins, raw_win_rate = excluded.raw_win_rate,
        score = excluded.score, avg_peak_mult = excluded.avg_peak_mult,
        last_call_at = excluded.last_call_at, updated_at = excluded.updated_at
    `).run(s.caller, s.nCalls, s.nResolved, s.nWins, s.rawWinRate, s.score,
           s.avgPeakMult ?? null, s.lastCallAt ?? null, nowMs());
  }

  callerScore(caller) {
    const r = this.db.prepare('SELECT * FROM caller_stats WHERE caller = ?').get(caller);
    return r ? r.score : 0;
  }

  topCallers(limit = 50, minResolved = 5) {
    return this.db.prepare(`
      SELECT * FROM caller_stats
      WHERE n_resolved >= ?
      ORDER BY score DESC
      LIMIT ?
    `).all(minResolved, limit);
  }

  // ── Wallet buys ─────────────────────────────────────────────────────────
  insertWalletBuy(b) {
    const id = b.id || hashId(b.wallet, b.mint, b.at);
    this.db.prepare(`
      INSERT OR IGNORE INTO wallet_buys (id, wallet, mint, at, usd, price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, b.wallet, b.mint, b.at, b.usd ?? null, b.price ?? null);
    return id;
  }

  /** Buys of `mint` by wallets whose caller score clears `minScore`. */
  reputableBuyers(mint, minScore, sinceMs) {
    return this.db.prepare(`
      SELECT b.wallet, b.at, b.usd, s.score
      FROM wallet_buys b
      JOIN caller_stats s ON s.caller = b.wallet
      WHERE b.mint = ? AND s.score >= ? AND b.at >= ?
      ORDER BY s.score DESC
    `).all(mint, minScore, sinceMs);
  }

  // ── Positions ───────────────────────────────────────────────────────────
  openPosition(p) {
    const id = p.id || hashId('pos', p.mint, p.openedAt);
    this.db.prepare(`
      INSERT INTO positions
        (id, mint, kind, opened_at, entry_price, tokens, cost_usd, fees_usd,
         status, reason_open, paper)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(id, p.mint, p.kind, p.openedAt, p.entryPrice, p.tokens, p.costUsd,
           p.feesUsd ?? 0, p.reasonOpen ?? null, p.paper === false ? 0 : 1);
    return id;
  }

  closePosition(id, { exitPrice, proceedsUsd, realisedUsd, reason, status = 'closed' }) {
    this.db.prepare(`
      UPDATE positions
      SET closed_at = ?, exit_price = ?, proceeds_usd = ?, realised_usd = ?,
          reason_close = ?, status = ?
      WHERE id = ?
    `).run(nowMs(), exitPrice, proceedsUsd, realisedUsd, reason ?? null, status, id);
  }

  /** Partial exit: reduce tokens and cost basis proportionally, stay open. */
  reducePosition(id, { tokensSold, proceedsUsd, realisedUsd, reason }) {
    const p = this.getPosition(id);
    if (!p) throw new Error(`no position ${id}`);
    const frac = tokensSold / p.tokens;
    this.db.prepare(`
      UPDATE positions
      SET tokens = tokens - ?,
          cost_usd = cost_usd - ?,
          realised_usd = COALESCE(realised_usd, 0) + ?,
          proceeds_usd = COALESCE(proceeds_usd, 0) + ?,
          reason_close = ?,
          status = 'floored'
      WHERE id = ?
    `).run(tokensSold, p.cost_usd * frac, realisedUsd, proceedsUsd, reason ?? null, id);
  }

  getPosition(id) {
    return this.db.prepare('SELECT * FROM positions WHERE id = ?').get(id);
  }

  openPositions() {
    return this.db.prepare(
      "SELECT * FROM positions WHERE status IN ('open','floored') ORDER BY opened_at DESC"
    ).all();
  }

  positionForMint(mint) {
    return this.db.prepare(
      "SELECT * FROM positions WHERE mint = ? AND status IN ('open','floored') LIMIT 1"
    ).get(mint);
  }

  closedPositions(limit = 200) {
    return this.db.prepare(
      "SELECT * FROM positions WHERE status = 'closed' ORDER BY closed_at DESC LIMIT ?"
    ).all(limit);
  }

  deployedSince(sinceMs) {
    return this.db.prepare(
      'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM positions WHERE opened_at >= ?'
    ).get(sinceMs).total;
  }

  // ── Our callouts ────────────────────────────────────────────────────────
  queueCallout(c) {
    const id = c.id || hashId('ours', c.mint, c.createdAt);
    this.db.prepare(`
      INSERT OR IGNORE INTO our_callouts
        (id, mint, created_at, score, text, reasons, position_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, c.mint, c.createdAt, c.score, c.text,
           JSON.stringify(c.reasons ?? []), c.positionId ?? null);
    return id;
  }

  weCalled(mint) {
    return this.db.prepare('SELECT 1 FROM our_callouts WHERE mint = ? LIMIT 1')
      .get(mint) !== undefined;
  }

  pendingCallouts(limit = 50) {
    return this.db.prepare(
      "SELECT * FROM our_callouts WHERE status = 'pending' ORDER BY created_at DESC LIMIT ?"
    ).all(limit);
  }

  markCalloutPosted(id) {
    this.db.prepare("UPDATE our_callouts SET status = 'posted', posted_at = ? WHERE id = ?")
      .run(nowMs(), id);
  }

  recentOurCallouts(limit = 100) {
    return this.db.prepare('SELECT * FROM our_callouts ORDER BY created_at DESC LIMIT ?')
      .all(limit);
  }

  // ── Ledger ──────────────────────────────────────────────────────────────
  addLedger(e) {
    const id = e.id || hashId('led', e.kind, e.at, e.ref ?? '', e.usd);
    this.db.prepare(`
      INSERT OR IGNORE INTO ledger (id, at, kind, usd, mint, ref, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, e.at ?? nowMs(), e.kind, e.usd, e.mint ?? null, e.ref ?? null, e.note ?? null);
    return id;
  }

  ledger(limit = 200) {
    return this.db.prepare('SELECT * FROM ledger ORDER BY at DESC LIMIT ?').all(limit);
  }

  ledgerTotals() {
    return this.db.prepare(`
      SELECT kind, COALESCE(SUM(usd), 0) AS total, COUNT(*) AS n
      FROM ledger GROUP BY kind
    `).all();
  }

  // ── Decisions ───────────────────────────────────────────────────────────
  recordDecision(d) {
    const id = d.id || hashId('dec', d.mint, d.at);
    this.db.prepare(`
      INSERT OR IGNORE INTO decisions
        (id, at, mint, callout, trade, score, size_usd, rejected, reasons)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, d.at ?? nowMs(), d.mint, d.callout ? 1 : 0, d.trade ? 1 : 0,
           d.score ?? null, d.sizeUsd ?? null, d.rejected ?? null,
           JSON.stringify(d.reasons ?? []));
    return id;
  }

  recentDecisions(limit = 100) {
    return this.db.prepare('SELECT * FROM decisions ORDER BY at DESC LIMIT ?').all(limit);
  }

  stats() {
    const one = (sql, ...a) => this.db.prepare(sql).get(...a);
    return {
      callouts: one('SELECT COUNT(*) AS n FROM callouts').n,
      resolved: one('SELECT COUNT(*) AS n FROM callout_outcomes').n,
      callers: one('SELECT COUNT(*) AS n FROM caller_stats').n,
      openPositions: one("SELECT COUNT(*) AS n FROM positions WHERE status IN ('open','floored')").n,
      closedPositions: one("SELECT COUNT(*) AS n FROM positions WHERE status = 'closed'").n,
      ourCallouts: one('SELECT COUNT(*) AS n FROM our_callouts').n,
      decisions: one('SELECT COUNT(*) AS n FROM decisions').n
    };
  }
}
