/* Conversation memory for the X agent.
 *
 * This is what makes it an agent rather than an autoresponder: it remembers who
 * it talked to, what was said in each thread, and what it has already replied
 * to, so it never double-replies and every reply can use the thread's history.
 * Lives in the same SQLite file as the trading data, so the brain can ground
 * replies in real bot state with plain joins. */
import { nowMs } from '../util.js';

const DDL = `
CREATE TABLE IF NOT EXISTS x_posts (
  id          TEXT PRIMARY KEY,     -- tweet id
  author_id   TEXT NOT NULL,
  author      TEXT,                 -- @handle if known
  conv_id     TEXT,                 -- X conversation_id (thread key)
  text        TEXT NOT NULL,
  seen_at     INTEGER NOT NULL,
  is_ours     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_xposts_conv ON x_posts (conv_id, seen_at);
CREATE INDEX IF NOT EXISTS idx_xposts_author ON x_posts (author_id, seen_at DESC);

CREATE TABLE IF NOT EXISTS x_replies (
  id          TEXT PRIMARY KEY,     -- hash id
  in_reply_to TEXT NOT NULL UNIQUE, -- tweet id we replied to (UNIQUE = never twice)
  conv_id     TEXT,
  text        TEXT NOT NULL,
  status      TEXT NOT NULL,        -- draft | posted | failed | skipped
  posted_id   TEXT,                 -- our tweet id once posted
  created_at  INTEGER NOT NULL,
  posted_at   INTEGER,
  error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_xreplies_status ON x_replies (status, created_at DESC);

CREATE TABLE IF NOT EXISTS x_users (
  id          TEXT PRIMARY KEY,     -- X user id
  handle      TEXT,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  n_mentions  INTEGER NOT NULL DEFAULT 0,
  note        TEXT                  -- free-form memory about this user
);

CREATE TABLE IF NOT EXISTS x_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export class XMemory {
  constructor(db) {
    this.db = db;
    this.db.exec(DDL);
  }

  /* ── cursor over the mentions timeline ─────────────────────────────────── */
  get sinceId() {
    const r = this.db.prepare("SELECT value FROM x_state WHERE key = 'since_id'").get();
    return r ? r.value : null;
  }
  set sinceId(id) {
    this.db.prepare('INSERT OR REPLACE INTO x_state (key, value) VALUES (?, ?)')
      .run('since_id', String(id));
  }

  /* ── posts ─────────────────────────────────────────────────────────────── */
  recordPost(p, { ours = false } = {}) {
    this.db.prepare(`
      INSERT OR IGNORE INTO x_posts (id, author_id, author, conv_id, text, seen_at, is_ours)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(p.id, p.authorId, p.author ?? null, p.convId ?? null, p.text,
           nowMs(), ours ? 1 : 0);
  }

  /** Thread history, oldest first — the context a reply is written against. */
  thread(convId, limit = 12) {
    if (!convId) return [];
    return this.db.prepare(`
      SELECT author, author_id, text, is_ours FROM x_posts
      WHERE conv_id = ? ORDER BY seen_at ASC LIMIT ?
    `).all(convId, limit);
  }

  /* ── users ─────────────────────────────────────────────────────────────── */
  touchUser(u) {
    this.db.prepare(`
      INSERT INTO x_users (id, handle, first_seen, last_seen, n_mentions)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT (id) DO UPDATE SET
        handle = COALESCE(excluded.handle, handle),
        last_seen = excluded.last_seen,
        n_mentions = n_mentions + 1
    `).run(u.id, u.handle ?? null, nowMs(), nowMs());
  }

  user(id) {
    return this.db.prepare('SELECT * FROM x_users WHERE id = ?').get(id);
  }

  /* ── replies ───────────────────────────────────────────────────────────── */
  hasReplied(tweetId) {
    return this.db.prepare('SELECT 1 FROM x_replies WHERE in_reply_to = ?').get(tweetId) !== undefined;
  }

  draftReply(r) {
    this.db.prepare(`
      INSERT OR IGNORE INTO x_replies (id, in_reply_to, conv_id, text, status, created_at)
      VALUES (?, ?, ?, ?, 'draft', ?)
    `).run(r.id, r.inReplyTo, r.convId ?? null, r.text, nowMs());
  }

  markPosted(id, postedId) {
    this.db.prepare(
      "UPDATE x_replies SET status = 'posted', posted_id = ?, posted_at = ? WHERE id = ?"
    ).run(postedId ?? null, nowMs(), id);
  }

  markFailed(id, error) {
    this.db.prepare("UPDATE x_replies SET status = 'failed', error = ? WHERE id = ?")
      .run(String(error).slice(0, 300), id);
  }

  /** Replies posted in the trailing window — input to the rate limiter. */
  postedSince(sinceMs) {
    return this.db.prepare(
      "SELECT COUNT(*) AS n FROM x_replies WHERE status = 'posted' AND posted_at >= ?"
    ).get(sinceMs).n;
  }

  repliesTo(authorId, sinceMs) {
    return this.db.prepare(`
      SELECT COUNT(*) AS n FROM x_replies r
      JOIN x_posts p ON p.id = r.in_reply_to
      WHERE p.author_id = ? AND r.created_at >= ? AND r.status != 'skipped'
    `).get(authorId, sinceMs).n;
  }

  recent(limit = 50) {
    return this.db.prepare('SELECT * FROM x_replies ORDER BY created_at DESC LIMIT ?').all(limit);
  }
}
