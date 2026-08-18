/* The X reply agent loop.
 *
 * One tick: fetch new mentions → remember them → for each, decide whether to
 * reply (dedupe, self-filter, rate limits) → compose grounded reply → post
 * (or draft in dry-run) → remember what we said.
 *
 * Everything is injectable so the whole loop is testable with a fake client. */
import { config } from '../config.js';
import { log } from '../log.js';
import { hashId, nowMs, sleep } from '../util.js';
import { XMemory } from './memory.js';
import { XClient } from './xclient.js';
import { Brain } from './brain.js';

export class XAgent {
  constructor(store, { client, brain, limits } = {}) {
    this.store = store;
    this.memory = new XMemory(store.db);
    this.client = client ?? new XClient();
    this.brain = brain ?? new Brain(store);
    this.limits = {
      maxPer15m: config.x.maxRepliesPer15m,
      maxPerUserPerDay: config.x.maxRepliesPerUserPerDay,
      ...limits
    };
    this.selfId = null;
    this.running = false;
  }

  /** Returns a skip reason, or null if this mention deserves a reply. */
  shouldReply(mention) {
    if (mention.authorId && mention.authorId === this.selfId) return 'own post';
    if (this.memory.hasReplied(mention.id)) return 'already replied';
    if (this.memory.postedSince(nowMs() - 15 * 60_000) >= this.limits.maxPer15m) {
      return 'window rate limit';
    }
    if (this.memory.repliesTo(mention.authorId, nowMs() - 24 * 60 * 60_000) >=
        this.limits.maxPerUserPerDay) {
      return 'per-user daily cap';
    }
    return null;
  }

  async handle(mention) {
    this.memory.recordPost(mention);
    this.memory.touchUser({ id: mention.authorId, handle: mention.author });

    const skip = this.shouldReply(mention);
    if (skip) {
      log.debug('mention skipped', { id: mention.id, skip });
      return { skipped: skip };
    }

    const text = await this.brain.compose(mention, this.memory.thread(mention.convId));
    if (!text) {
      log.info('no reply composed (guardrails or decline)', { id: mention.id });
      return { skipped: 'no compose' };
    }

    const replyId = hashId('xr', mention.id);
    this.memory.draftReply({
      id: replyId, inReplyTo: mention.id, convId: mention.convId, text
    });

    try {
      const res = await this.client.reply(text, mention.id);
      if (res.dryRun) {
        /* stays a draft — visible in memory, nothing sent */
        return { drafted: text };
      }
      this.memory.markPosted(replyId, res.id);
      this.memory.recordPost({
        id: res.id ?? replyId, authorId: this.selfId ?? 'self',
        author: config.x.handle, convId: mention.convId, text
      }, { ours: true });
      return { posted: text };
    } catch (err) {
      this.memory.markFailed(replyId, err.message);
      log.warn('reply failed', { id: mention.id, err: err.message });
      return { failed: err.message };
    }
  }

  async tick() {
    if (!this.client.canRead) {
      log.warn('x agent idle: no X_BEARER_TOKEN configured');
      return { idle: true };
    }
    this.selfId = await this.client.selfId();

    const mentions = await this.client.mentions({ sinceId: this.memory.sinceId });
    let posted = 0, drafted = 0, skipped = 0;

    /* oldest first so threads build in order */
    for (const m of mentions.slice().reverse()) {
      const r = await this.handle(m);
      if (r.posted) posted++;
      else if (r.drafted) drafted++;
      else skipped++;
    }
    if (mentions.length) this.memory.sinceId = mentions[0].id;

    if (mentions.length || posted || drafted) {
      log.info('x tick', {
        mentions: mentions.length, posted, drafted, skipped,
        mode: this.client.canWrite ? 'live' : 'dry-run',
        llm: this.brain.hasLLM ? this.brain.model : 'templates'
      });
    }
    return { mentions: mentions.length, posted, drafted, skipped };
  }

  async run() {
    this.running = true;
    log.info('x agent starting', {
      read: this.client.canRead,
      write: this.client.canWrite ? 'LIVE POSTING' : 'dry-run (drafts only)',
      llm: this.brain.hasLLM ? this.brain.model : 'templates',
      per15m: this.limits.maxPer15m
    });
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        log.error('x tick failed', { err: err.message });
      }
      await sleep(config.x.pollIntervalMs);
    }
  }

  stop() { this.running = false; }
}
