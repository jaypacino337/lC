/* Environment parsing and validation. Fails fast and loudly: a bot that starts
 * with a silently-wrong config is worse than one that refuses to start. */
import { readFileSync, existsSync } from 'node:fs';

/* Minimal .env loader — no dependency needed. Railway injects real env vars,
 * so this only matters for local runs. */
function loadDotenv(path = '.env') {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotenv();

const num = (k, d) => {
  const v = process.env[k];
  if (v === undefined || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${k} must be a number, got "${v}"`);
  return n;
};
const str = (k, d = '') => (process.env[k] ?? d).trim();
const list = (k) => str(k).split(',').map(s => s.trim()).filter(Boolean);
const enun = (k, allowed, d) => {
  const v = str(k, d);
  if (!allowed.includes(v)) throw new Error(`${k} must be one of ${allowed.join('|')}, got "${v}"`);
  return v;
};

export const config = {
  mode:   enun('PXBT_MODE', ['paper', 'live'], 'paper'),
  source: enun('PXBT_SOURCE', ['live', 'fixture'], 'fixture'),

  heliusKeys: list('HELIUS_KEYS'),

  pumpfun: {
    base:         str('PUMPFUN_API_BASE', 'https://frontend-api.pump.fun'),
    calloutsPath: str('PUMPFUN_CALLOUTS_PATH', '/callouts'),
    tradesPath:   str('PUMPFUN_TRADES_PATH', '/trades')
  },

  econ: {
    probeUsd:    num('PROBE_BUY_USD', 2),
    callFloorUsd: num('CALL_ELIGIBILITY_FLOOR_USD', 1),
    tradeMaxUsd: num('TRADE_MAX_USD', 25),
    costBps:     num('COST_BPS', 180)
  },

  risk: {
    maxOpenPositions: num('MAX_OPEN_POSITIONS', 25),
    maxDailyDeployUsd: num('MAX_DAILY_DEPLOY_USD', 250),
    paperStartUsd:    num('PAPER_START_USD', 500)
  },

  treasuryWallet: str('TREASURY_WALLET'),

  x: {
    bearer:       str('X_BEARER_TOKEN'),
    apiKey:       str('X_API_KEY'),
    apiSecret:    str('X_API_SECRET'),
    accessToken:  str('X_ACCESS_TOKEN'),
    accessSecret: str('X_ACCESS_SECRET'),
    handle:       str('X_HANDLE'),
    userId:       str('X_USER_ID'),
    maxRepliesPer15m:       num('X_MAX_REPLIES_PER_15M', 8),
    maxRepliesPerUserPerDay: num('X_MAX_REPLIES_PER_USER_PER_DAY', 3),
    pollIntervalMs:         num('X_POLL_INTERVAL_MS', 90_000)
  },

  telegram: {
    token:  str('TELEGRAM_BOT_TOKEN'),
    chatId: str('TELEGRAM_CHAT_ID'),
    get enabled() { return Boolean(this.token && this.chatId); }
  },

  api: {
    port: num('PORT', 8080),
    corsOrigins: list('CORS_ORIGINS')
  },

  pollIntervalMs: num('POLL_INTERVAL_MS', 6000),
  dbPath: str('DB_PATH', './data/pumpxbt.db'),
  logLevel: enun('LOG_LEVEL', ['debug', 'info', 'warn', 'error'], 'info')
};

/* Invariants worth dying on. */
export function validate(cfg = config) {
  const errs = [];

  if (cfg.mode === 'live') {
    errs.push(
      'PXBT_MODE=live is not supported: live execution is deliberately not ' +
      'implemented in this version. Run paper mode until the signal is proven.'
    );
  }
  if (cfg.source === 'live' && cfg.heliusKeys.length === 0) {
    errs.push('PXBT_SOURCE=live requires at least one key in HELIUS_KEYS.');
  }
  if (cfg.econ.callFloorUsd >= cfg.econ.probeUsd) {
    errs.push(
      `CALL_ELIGIBILITY_FLOOR_USD (${cfg.econ.callFloorUsd}) must be below ` +
      `PROBE_BUY_USD (${cfg.econ.probeUsd}), or a probe can never take profit ` +
      'without losing call eligibility.'
    );
  }
  if (cfg.econ.costBps < 0 || cfg.econ.costBps > 10000) {
    errs.push('COST_BPS must be between 0 and 10000.');
  }
  if (errs.length) {
    throw new Error('Invalid configuration:\n  - ' + errs.join('\n  - '));
  }
  return cfg;
}
