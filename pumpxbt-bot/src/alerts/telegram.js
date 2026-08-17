/* Telegram alerts. Optional — disabled unless both env vars are set.
 *
 * This is the manual-callout loop: the bot decides, you post. Failures here are
 * logged and swallowed, because a down notification service must never stop the
 * strategy from running. */
import { config } from '../config.js';
import { log } from '../log.js';
import { fetchJson } from '../util.js';

export class Alerts {
  constructor(cfg = config.telegram) {
    this.cfg = cfg;
    this.sent = 0;
    this.failed = 0;
  }

  get enabled() { return Boolean(this.cfg.token && this.cfg.chatId); }

  async send(text) {
    if (!this.enabled) {
      log.debug('alert suppressed (telegram not configured)');
      return false;
    }
    try {
      await fetchJson(`https://api.telegram.org/bot${this.cfg.token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.cfg.chatId,
          text,
          disable_web_page_preview: true
        }),
        timeoutMs: 8000
      });
      this.sent++;
      return true;
    } catch (err) {
      this.failed++;
      log.warn('telegram send failed', { err: log.scrub(err.message) });
      return false;
    }
  }
}
