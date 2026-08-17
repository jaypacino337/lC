/* SQLite schema. Append-mostly: observations are immutable, scores are derived.
 *
 * The reputation tables are the valuable asset here. Everything else can be
 * rebuilt; `callouts` + `caller_stats` cannot, because they are a record of what
 * was knowable at a point in time. Back this file's database up. */

export const SCHEMA_VERSION = 1;

export const DDL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── Observations ──────────────────────────────────────────────────────────
-- Every callout we see on pump.fun, whoever made it. Immutable once written.
CREATE TABLE IF NOT EXISTS callouts (
  id            TEXT PRIMARY KEY,      -- platform id, or hashId() fallback
  caller        TEXT NOT NULL,         -- wallet / user identifier
  mint          TEXT NOT NULL,
  seen_at       INTEGER NOT NULL,      -- ms epoch, when WE saw it
  called_at     INTEGER,               -- ms epoch, platform timestamp
  price_at_call REAL,                  -- USD, for outcome scoring
  mcap_at_call  REAL,
  raw           TEXT,                  -- original payload, for reprocessing
  UNIQUE (caller, mint, called_at)
);
CREATE INDEX IF NOT EXISTS idx_callouts_caller ON callouts (caller, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_callouts_mint   ON callouts (mint, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_callouts_seen   ON callouts (seen_at DESC);

-- Resolved outcome per callout. Written later, once the window has elapsed.
CREATE TABLE IF NOT EXISTS callout_outcomes (
  callout_id  TEXT PRIMARY KEY REFERENCES callouts (id) ON DELETE CASCADE,
  resolved_at INTEGER NOT NULL,
  peak_mult   REAL,                    -- max price in window / price at call
  end_mult    REAL,                    -- price at window close / price at call
  is_win      INTEGER NOT NULL,        -- 1 if peak_mult >= win threshold
  window_ms   INTEGER NOT NULL
);

-- Buys by wallets we care about. Feeds the "bought but hasn't called" signal.
CREATE TABLE IF NOT EXISTS wallet_buys (
  id       TEXT PRIMARY KEY,
  wallet   TEXT NOT NULL,
  mint     TEXT NOT NULL,
  at       INTEGER NOT NULL,
  usd      REAL,
  price    REAL
);
CREATE INDEX IF NOT EXISTS idx_buys_wallet ON wallet_buys (wallet, at DESC);
CREATE INDEX IF NOT EXISTS idx_buys_mint   ON wallet_buys (mint, at DESC);

-- ── Derived reputation ────────────────────────────────────────────────────
-- Recomputed from callouts + outcomes. Safe to drop and rebuild.
CREATE TABLE IF NOT EXISTS caller_stats (
  caller        TEXT PRIMARY KEY,
  n_calls       INTEGER NOT NULL DEFAULT 0,
  n_resolved    INTEGER NOT NULL DEFAULT 0,
  n_wins        INTEGER NOT NULL DEFAULT 0,
  raw_win_rate  REAL NOT NULL DEFAULT 0,   -- naive wins/resolved
  score         REAL NOT NULL DEFAULT 0,   -- decayed + shrunk. Use this one.
  avg_peak_mult REAL,
  last_call_at  INTEGER,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_caller_score ON caller_stats (score DESC);

-- ── Our activity ──────────────────────────────────────────────────────────
-- Positions the bot opened. In paper mode these are simulated fills.
CREATE TABLE IF NOT EXISTS positions (
  id            TEXT PRIMARY KEY,
  mint          TEXT NOT NULL,
  kind          TEXT NOT NULL,         -- 'probe' | 'trade'
  opened_at     INTEGER NOT NULL,
  entry_price   REAL NOT NULL,
  tokens        REAL NOT NULL,
  cost_usd      REAL NOT NULL,         -- including modelled fees
  fees_usd      REAL NOT NULL DEFAULT 0,
  closed_at     INTEGER,
  exit_price    REAL,
  proceeds_usd  REAL,
  realised_usd  REAL,
  status        TEXT NOT NULL DEFAULT 'open',   -- open | closed | floored
  reason_open   TEXT,
  reason_close  TEXT,
  paper         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_pos_status ON positions (status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_mint   ON positions (mint);

-- Callouts WE intend to publish. Queued for the manual posting step.
CREATE TABLE IF NOT EXISTS our_callouts (
  id           TEXT PRIMARY KEY,
  mint         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  score        REAL NOT NULL,
  text         TEXT NOT NULL,
  reasons      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | posted | skipped
  posted_at    INTEGER,
  position_id  TEXT REFERENCES positions (id)
);
CREATE INDEX IF NOT EXISTS idx_ours_status ON our_callouts (status, created_at DESC);

-- Money in/out of the treasury, for the site's ledger.
CREATE TABLE IF NOT EXISTS ledger (
  id       TEXT PRIMARY KEY,
  at       INTEGER NOT NULL,
  kind     TEXT NOT NULL,   -- fee_claim | buy | sell | buyback | burn | reward
  usd      REAL NOT NULL,   -- signed: positive into treasury
  mint     TEXT,
  ref      TEXT,            -- tx signature or position id
  note     TEXT
);
CREATE INDEX IF NOT EXISTS idx_ledger_at ON ledger (at DESC);

-- Every decision, including rejections. This is how you debug a strategy.
CREATE TABLE IF NOT EXISTS decisions (
  id        TEXT PRIMARY KEY,
  at        INTEGER NOT NULL,
  mint      TEXT NOT NULL,
  callout   INTEGER NOT NULL,   -- 1 if we would call it
  trade     INTEGER NOT NULL,   -- 1 if we would size a conviction trade
  score     REAL,
  size_usd  REAL,
  rejected  TEXT,               -- first failing gate, if any
  reasons   TEXT
);
CREATE INDEX IF NOT EXISTS idx_dec_at ON decisions (at DESC);
`;
