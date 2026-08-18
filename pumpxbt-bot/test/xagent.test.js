import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store/db.js';
import { XMemory } from '../src/x/memory.js';
import { XAgent } from '../src/x/agent.js';
import { Brain, sanitize } from '../src/x/brain.js';
import { rfc3986, oauthHeader } from '../src/x/xclient.js';

/* Fake X client: canned mentions, records what gets posted, no network. */
class FakeX {
  constructor(mentionBatches = []) {
    this.batches = mentionBatches;
    this.posted = [];
    this.write = true;
  }
  get canRead() { return true; }
  get canWrite() { return this.write; }
  async selfId() { return 'SELF'; }
  async mentions() { return this.batches.shift() ?? []; }
  async reply(text, inReplyToId) {
    if (!this.canWrite) return { dryRun: true };
    this.posted.push({ text, inReplyToId });
    return { dryRun: false, id: 'post_' + this.posted.length };
  }
}

const M = (id, text, author = 'alice', authorId = 'u1') =>
  ({ id, authorId, author, convId: 'c1', text });

function agent(batches, { write = true } = {}) {
  const store = new Store(':memory:');
  const fake = new FakeX(batches);
  fake.write = write;
  const a = new XAgent(store, { client: fake, brain: new Brain(store, { apiKey: '' }) });
  return { a, fake, store };
}

/* ── sanitize ────────────────────────────────────────────────────────────── */

test('sanitize hard-caps length under the X limit', () => {
  const out = sanitize('word '.repeat(120));
  assert.ok(out.length <= 270);
  assert.ok(out.endsWith('…'));
});

test('sanitize refuses banned claims instead of editing them', () => {
  assert.equal(sanitize('This is a guaranteed 10x, risk-free!'), null);
  assert.equal(sanitize('trust me, you can’t lose'.replace('’', "'")), null);
  assert.equal(sanitize('normal sentence about the record'), 'normal sentence about the record');
});

/* ── templates are truthful about paper mode ─────────────────────────────── */

test('profit questions always get the paper-mode disclosure', async () => {
  const store = new Store(':memory:');
  const b = new Brain(store, { apiKey: '' });
  const out = await b.compose(M('t1', 'how much profit have you made??'), []);
  assert.match(out, /simulated|paper/i);
  store.close();
});

test('advice questions never produce advice', async () => {
  const store = new Store(':memory:');
  const b = new Brain(store, { apiKey: '' });
  const out = await b.compose(M('t1', 'should i buy this coin?'), []);
  assert.match(out, /not advice/i);
  assert.doesNotMatch(out, /guarantee/i);
  store.close();
});

/* ── agent loop ──────────────────────────────────────────────────────────── */

test('agent replies to a mention and remembers it', async () => {
  const { a, fake } = agent([[M('t1', 'what is this?')]]);
  const r = await a.tick();
  assert.equal(r.posted, 1);
  assert.equal(fake.posted.length, 1);
  assert.equal(fake.posted[0].inReplyToId, 't1');
  assert.equal(a.memory.hasReplied('t1'), true);
});

test('agent never replies to the same mention twice', async () => {
  const { a, fake } = agent([[M('t1', 'hello')], [M('t1', 'hello')]]);
  await a.tick();
  await a.tick();
  assert.equal(fake.posted.length, 1);
});

test('agent never replies to itself', async () => {
  const { a, fake } = agent([[{ id: 't9', authorId: 'SELF', author: 'me', convId: 'c1', text: 'own post' }]]);
  const r = await a.tick();
  assert.equal(r.posted, 0);
  assert.equal(fake.posted.length, 0);
});

test('window rate limit stops the flood', async () => {
  const many = Array.from({ length: 12 }, (_, i) => M('t' + i, 'q' + i, 'user' + i, 'u' + i));
  const { a, fake } = agent([many]);
  await a.tick();
  assert.ok(fake.posted.length <= a.limits.maxPer15m,
    `${fake.posted.length} posted, cap ${a.limits.maxPer15m}`);
});

test('per-user daily cap holds', async () => {
  const spam = Array.from({ length: 6 }, (_, i) => M('s' + i, 'spam ' + i));
  const { a, fake } = agent([spam]);
  await a.tick();
  assert.ok(fake.posted.length <= a.limits.maxPerUserPerDay);
});

test('dry-run drafts instead of posting', async () => {
  const { a, fake } = agent([[M('t1', 'how does it work?')]], { write: false });
  const r = await a.tick();
  assert.equal(r.drafted, 1);
  assert.equal(fake.posted.length, 0);
  const drafts = a.memory.recent().filter(x => x.status === 'draft');
  assert.equal(drafts.length, 1);
});

test('thread memory accumulates per conversation', async () => {
  const { a } = agent([[M('t1', 'first')], [M('t2', 'second')]]);
  await a.tick();
  await a.tick();
  const thread = a.memory.thread('c1');
  assert.ok(thread.length >= 3, 'two mentions + at least one of our replies');
  assert.ok(thread.some(t => t.is_ours === 1));
});

/* ── memory primitives ───────────────────────────────────────────────────── */

test('since_id cursor persists', () => {
  const store = new Store(':memory:');
  const m = new XMemory(store.db);
  assert.equal(m.sinceId, null);
  m.sinceId = '12345';
  assert.equal(new XMemory(store.db).sinceId, '12345');
  store.close();
});

/* ── oauth signing ───────────────────────────────────────────────────────── */

test('rfc3986 escapes the characters encodeURIComponent misses', () => {
  assert.equal(rfc3986("a!*'()b"), 'a%21%2A%27%28%29b');
});

test('oauth header is deterministic given nonce+timestamp and includes signature', () => {
  const creds = { apiKey: 'ck', apiSecret: 'cs', accessToken: 'at', accessSecret: 'as' };
  const h1 = oauthHeader({ method: 'POST', url: 'https://api.x.com/2/tweets', creds, nonce: 'n', timestamp: '100' });
  const h2 = oauthHeader({ method: 'POST', url: 'https://api.x.com/2/tweets', creds, nonce: 'n', timestamp: '100' });
  assert.equal(h1, h2);
  assert.match(h1, /^OAuth /);
  assert.match(h1, /oauth_signature="[^"]+"/);
  assert.match(h1, /oauth_signature_method="HMAC-SHA1"/);
});
