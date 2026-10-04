// Key/value storage with three backends, picked from the environment:
//   1. Upstash Redis / Vercel KV over REST  (UPSTASH_REDIS_REST_URL+TOKEN or KV_REST_API_URL+TOKEN)
//   2. A JSON file on disk                  (DATA_FILE, default .data/db.json) when not on Vercel
//   3. In-memory                            (Vercel without a database: resets on cold start)
// Values are JSON. setNX + TTL give a simple lock that works across serverless instances.
import fs from 'node:fs';
import path from 'node:path';

class MemoryStore {
  constructor() { this.kind = 'memory'; this.m = new Map(); }
  _live(k) {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp && e.exp < Date.now()) { this.m.delete(k); return undefined; }
    return e;
  }
  async get(k) { const e = this._live(k); return e ? structuredClone(e.v) : null; }
  async mget(keys) { return Promise.all(keys.map((k) => this.get(k))); }
  async set(k, v, { px } = {}) { this.m.set(k, { v: structuredClone(v), exp: px ? Date.now() + px : 0 }); this._dirty(); }
  async setNX(k, v, px) { if (this._live(k)) return false; await this.set(k, v, { px }); return true; }
  async del(k) { this.m.delete(k); this._dirty(); }
  _dirty() {}
}

class FileStore extends MemoryStore {
  constructor(file) {
    super();
    this.kind = 'file';
    this.file = file;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [k, e] of Object.entries(raw)) this.m.set(k, e);
    } catch {}
  }
  _dirty() {
    clearTimeout(this.t);
    this.t = setTimeout(() => this.flush(), 200);
  }
  flush() {
    clearTimeout(this.t);
    const out = {};
    for (const [k, e] of this.m) if (!e.exp || e.exp > Date.now()) out[k] = e;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, this.file);
  }
}

class UpstashStore {
  constructor(url, token) { this.kind = 'redis'; this.url = url.replace(/\/+$/, ''); this.token = token; }
  async cmd(...args) {
    const r = await fetch(this.url, { method: 'POST', headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.error) throw new Error('Storage error: ' + (body.error || r.status));
    return body.result;
  }
  async get(k) { const v = await this.cmd('GET', k); return v == null ? null : JSON.parse(v); }
  async mget(keys) { if (!keys.length) return []; const vs = await this.cmd('MGET', ...keys); return vs.map((v) => (v == null ? null : JSON.parse(v))); }
  async set(k, v, { px } = {}) { await (px ? this.cmd('SET', k, JSON.stringify(v), 'PX', String(px)) : this.cmd('SET', k, JSON.stringify(v))); }
  async setNX(k, v, px) { return (await this.cmd('SET', k, JSON.stringify(v), 'PX', String(px), 'NX')) === 'OK'; }
  async del(k) { await this.cmd('DEL', k); }
}

let store = null;
export function getStore() {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) store = new UpstashStore(url, token);
  else if (process.env.VERCEL) {
    store = new MemoryStore();
    console.warn('[foreman] No KV/Upstash env vars: using in-memory storage. Data resets on every cold start.');
  } else store = new FileStore(process.env.DATA_FILE || path.resolve('.data/db.json'));
  return store;
}
export function setStore(s) { store = s; }
export { MemoryStore, FileStore, UpstashStore };

// Run fn while holding a short cross-instance lock. Waits up to waitMs for it.
export async function withLock(name, fn, { ttlMs = 30_000, waitMs = 8_000 } = {}) {
  const s = getStore();
  const key = 'fm:lock:' + name;
  const token = Math.random().toString(36).slice(2);
  const until = Date.now() + waitMs;
  while (!(await s.setNX(key, token, ttlMs))) {
    if (Date.now() > until) throw Object.assign(new Error('Busy, try again in a few seconds'), { status: 503 });
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
  }
  try { return await fn(); }
  finally { if ((await s.get(key)) === token) await s.del(key); }
}
