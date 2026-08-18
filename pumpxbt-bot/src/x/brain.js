/* Reply generation, grounded in what the bot actually knows.
 *
 * Two modes:
 *  - With ANTHROPIC_API_KEY: Claude (claude-opus-5, Messages API over plain
 *    fetch — this project is deliberately dependency-free) writes the reply,
 *    grounded in a context block built from the live database: stage, top
 *    callers, our recent callouts, portfolio counts, and the thread history
 *    from memory. Server-side refusal fallbacks are enabled by default.
 *  - Without a key: deterministic template replies from the same grounding.
 *    Less charming, still truthful.
 *
 * Guardrails are enforced OUTSIDE the model: hard length cap, banned-claim
 * scrub, and the paper-mode disclosure. A prompt can be talked around; a
 * post-processor cannot. */
import { config } from '../config.js';
import { log } from '../log.js';
import { fetchJson, nowMs } from '../util.js';

const MAX_LEN = 270;   // X caps at 280; leave headroom

/* Claims the account must never make, whatever the model says. */
const BANNED = [
  /guarantee/i, /can'?t lose/i, /risk[- ]?free/i, /sure thing/i,
  /financial advice/i, /\b\d+x\b.{0,12}(soon|guaranteed|easy)/i,
  /insider/i, /pump it/i
];

export function sanitize(text, { stage = config.stage ?? 'paper' } = {}) {
  let t = String(text).replace(/\s+/g, ' ').trim();
  /* strip anything that reads like a promise of returns */
  for (const re of BANNED) {
    if (re.test(t)) return null;    // refuse to post rather than edit a claim
  }
  if (t.length > MAX_LEN) t = t.slice(0, MAX_LEN - 1).replace(/\s+\S*$/, '') + '…';
  if (!t) return null;
  return t;
}

/** Snapshot of real bot state — the only facts the reply may lean on. */
export function grounding(store) {
  const g = { stage: process.env.PXBT_MODE ?? 'paper' };
  try {
    g.stats = store.stats();
    g.topCallers = store.topCallers(3).map(c => ({
      score: Number(c.score.toFixed(2)), resolved: c.n_resolved
    }));
    g.recentCallouts = store.recentOurCallouts(3).map(c => ({
      text: c.text, when: c.created_at
    }));
    g.openPositions = store.openPositions().length;
  } catch (err) {
    log.debug('grounding partial', { err: err.message });
  }
  return g;
}

const PERSONA = `You are PumpXBT, the autonomous intelligence layer for pump.fun, replying on X.

Voice: sharp, dry, terse. Crypto-native but never sloppy. One or two sentences.
No hashtags, no emoji spam (one emoji max), no rocket ships.

Hard rules — never break these:
- You are currently in PAPER MODE: every trade is simulated. If anyone asks about
  performance, profits, or "how much have you made", say plainly that results are
  simulated paper-mode results, not realised returns.
- Never give financial advice, price targets, or tell anyone to buy anything.
- Never promise or imply returns. Never use "guaranteed", "risk-free", "can't lose".
- Only state facts present in the CONTEXT block. If you don't know, say you don't.
- Be helpful about what you are: an agent that scores pump.fun callers by track
  record, watches what proven wallets buy before they call it, and queues callouts.
- If someone is hostile, be unbothered and brief. Never argue at length.

Reply with ONLY the tweet text. No quotes, no preamble.`;

export class Brain {
  constructor(store, { apiKey = process.env.ANTHROPIC_API_KEY, model } = {}) {
    this.store = store;
    this.apiKey = (apiKey ?? '').trim();
    this.model = model ?? process.env.X_REPLY_MODEL ?? 'claude-opus-5';
  }

  get hasLLM() { return Boolean(this.apiKey); }

  /**
   * @param mention  { author, text }
   * @param thread   [{ author, text, is_ours }] oldest first
   * @returns sanitized reply text, or null to skip
   */
  async compose(mention, thread = []) {
    const g = grounding(this.store);
    const raw = this.hasLLM
      ? await this.llmReply(mention, thread, g).catch(err => {
          log.warn('llm reply failed, using template', { err: err.message });
          return this.templateReply(mention, g);
        })
      : this.templateReply(mention, g);
    return sanitize(raw);
  }

  async llmReply(mention, thread, g) {
    const convo = thread.map(t =>
      `${t.is_ours ? 'YOU' : '@' + (t.author ?? 'user')}: ${t.text}`).join('\n');

    const body = {
      model: this.model,
      max_tokens: 300,
      /* route refusals to a fallback model server-side instead of erroring */
      fallbacks: 'default',
      system: PERSONA,
      messages: [{
        role: 'user',
        content:
          'CONTEXT (real bot state, cite nothing beyond it):\n' +
          JSON.stringify(g) + '\n\n' +
          (convo ? 'THREAD SO FAR:\n' + convo + '\n\n' : '') +
          `NEW MENTION from @${mention.author ?? 'user'}:\n${mention.text}\n\n` +
          'Write the reply tweet.'
      }]
    };

    const res = await fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      body: JSON.stringify(body),
      timeoutMs: 30_000
    });

    if (res.stop_reason === 'refusal') {
      log.info('llm declined the reply', { category: res.stop_details?.category });
      return null;
    }
    const text = (res.content ?? []).filter(b => b.type === 'text').map(b => b.text).join(' ');
    return text || null;
  }

  /** Deterministic fallback — grounded, truthful, a little flat. */
  templateReply(mention, g) {
    const t = mention.text.toLowerCase();
    const paper = ' (paper mode — simulated, not realised returns)';

    if (/(profit|pnl|made|returns|up\?|gains)/.test(t)) {
      return `All results so far are simulated${paper}. The point right now is proving the hit rate in public before a dollar moves.`;
    }
    if (/(how.*work|what.*do|what is|wtf is)/.test(t)) {
      return 'I score pump.fun callers by their actual track record, watch what proven wallets buy before they call it, and queue callouts from that. Currently running in paper mode.';
    }
    if (/(callout|call|signal)/.test(t)) {
      const n = g.stats?.ourCallouts ?? 0;
      return `${n} callouts queued so far, every one timestamped before the outcome. Paper mode — the record is the product.`;
    }
    if (/(buy|should i|worth|ape)/.test(t)) {
      return 'Not advice, and I don’t do price targets. I publish what my own models flag, with the reasoning, and you can check the record yourself.';
    }
    return 'Agent online, paper mode. Scoring callers, watching wallets, building the record in public.';
  }
}
