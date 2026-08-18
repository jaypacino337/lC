/* X API v2 client. Zero dependencies — OAuth 1.0a signing via node:crypto.
 *
 * Reading (mentions, user lookup) uses the app bearer token. Posting a reply
 * requires user-context OAuth 1.0a (the four keys from the X developer portal,
 * with Read+Write app permissions). If the posting keys are absent the client
 * runs in DRY-RUN: composed replies are stored as drafts and logged, nothing is
 * sent. That makes the whole agent testable with no X account at all.
 *
 * Note: JSON request bodies are NOT part of the OAuth 1.0a signature base
 * string — only the oauth_* params and query params are. Getting that wrong is
 * the classic 401 here. */
import { createHmac, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { log } from '../log.js';
import { fetchJson, retry } from '../util.js';

const API = 'https://api.x.com/2';

/* RFC 3986 percent-encoding — encodeURIComponent plus the five it misses. */
export function rfc3986(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** OAuth 1.0a Authorization header for one request. Exported for tests. */
export function oauthHeader({ method, url, query = {}, creds, nonce, timestamp }) {
  const oauth = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce ?? randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: '1.0'
  };

  const all = { ...query, ...oauth };
  const paramString = Object.keys(all).sort()
    .map(k => `${rfc3986(k)}=${rfc3986(all[k])}`)
    .join('&');
  const base = [method.toUpperCase(), rfc3986(url), rfc3986(paramString)].join('&');
  const signingKey = `${rfc3986(creds.apiSecret)}&${rfc3986(creds.accessSecret)}`;
  oauth.oauth_signature = createHmac('sha1', signingKey).update(base).digest('base64');

  return 'OAuth ' + Object.keys(oauth).sort()
    .map(k => `${rfc3986(k)}="${rfc3986(oauth[k])}"`)
    .join(', ');
}

export class XClient {
  constructor(x = config.x) {
    this.cfg = x;
    this.userId = null;
  }

  get canRead() { return Boolean(this.cfg.bearer); }
  get canWrite() {
    const c = this.cfg;
    return Boolean(c.apiKey && c.apiSecret && c.accessToken && c.accessSecret);
  }

  async bearerGet(path, params = {}) {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    return retry(() => fetchJson(url.toString(), {
      headers: { authorization: `Bearer ${this.cfg.bearer}` },
      timeoutMs: 10_000
    }), {
      attempts: 3,
      shouldRetry: e => e.status === 429 || e.status >= 500 || e.name === 'AbortError',
      onRetry: (e, n) => log.debug('x api retry', { path, attempt: n, err: e.message })
    });
  }

  /** Resolve our own user id from the configured @handle. Cached. */
  async selfId() {
    if (this.userId) return this.userId;
    if (this.cfg.userId) return (this.userId = this.cfg.userId);
    if (!this.cfg.handle) throw new Error('X_HANDLE or X_USER_ID must be set');
    const j = await this.bearerGet(`/users/by/username/${encodeURIComponent(this.cfg.handle.replace(/^@/, ''))}`);
    this.userId = j?.data?.id;
    if (!this.userId) throw new Error('could not resolve X_HANDLE to a user id');
    return this.userId;
  }

  /**
   * Mentions newer than sinceId, normalised to
   * { id, authorId, author, convId, text }.
   */
  async mentions({ sinceId = null, max = 25 } = {}) {
    const id = await this.selfId();
    const params = {
      max_results: Math.min(Math.max(max, 5), 100),
      'tweet.fields': 'author_id,conversation_id,created_at',
      expansions: 'author_id',
      'user.fields': 'username'
    };
    if (sinceId) params.since_id = sinceId;

    const j = await this.bearerGet(`/users/${id}/mentions`, params);
    const users = new Map((j?.includes?.users ?? []).map(u => [u.id, u.username]));
    return (j?.data ?? []).map(t => ({
      id: t.id,
      authorId: t.author_id,
      author: users.get(t.author_id) ?? null,
      convId: t.conversation_id ?? t.id,
      text: t.text ?? ''
    }));
  }

  /**
   * Post a reply. Returns { dryRun } without touching the network when the
   * write keys are absent, so the agent is safe to run credential-less.
   */
  async reply(text, inReplyToId) {
    if (!this.canWrite) {
      log.info('DRY RUN reply (no write keys)', { to: inReplyToId, text });
      return { dryRun: true };
    }
    const url = `${API}/tweets`;
    const auth = oauthHeader({
      method: 'POST', url,
      creds: this.cfg
    });
    const j = await fetchJson(url, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: inReplyToId } }),
      timeoutMs: 10_000
    });
    return { dryRun: false, id: j?.data?.id };
  }
}
