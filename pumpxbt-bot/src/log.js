/* Structured line logging. JSON when not a TTY (Railway captures it cleanly),
 * human-readable with colour when it is. */
import { config } from './config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? 20;
const tty = process.stdout.isTTY;

const COLOR = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

function emit(level, msg, fields) {
  if (LEVELS[level] < threshold) return;
  const ts = new Date().toISOString();

  if (!tty) {
    process.stdout.write(JSON.stringify({ ts, level, msg, ...fields }) + '\n');
    return;
  }
  let line = `${COLOR[level]}${level.toUpperCase().padEnd(5)}${RESET} ${ts.slice(11, 19)} ${msg}`;
  if (fields && Object.keys(fields).length) {
    line += ' ' + Object.entries(fields)
      .map(([k, v]) => `\x1b[90m${k}=${RESET}${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
  }
  process.stdout.write(line + '\n');
}

export const log = {
  debug: (m, f) => emit('debug', m, f),
  info:  (m, f) => emit('info', m, f),
  warn:  (m, f) => emit('warn', m, f),
  error: (m, f) => emit('error', m, f),

  /* Redacts anything that looks like a key before it can reach a log line. */
  scrub(s) {
    return String(s).replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<key>');
  }
};
