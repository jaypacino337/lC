/* Helius key pool.
 *
 * Round-robins across every key you supply and benches a key for a cooldown
 * when it 429s, so throughput scales with key count instead of collapsing on the
 * first rate limit. Keys are held in memory only and never logged. */
import { config } from '../config.js';
import { log } from '../log.js';
import { fetchJson, retry, nowMs } from '../util.js';

const COOLDOWN_MS = 20_000;

export class RpcPool {
  constructor(keys = config.heliusKeys) {
    this.keys = keys.slice();
    this.cursor = 0;
    this.benched = new Map();     // key -> timestamp it becomes usable again
    this.calls = 0;
    this.rateLimited = 0;
  }

  get size() { return this.keys.length; }

  /** Next key that is not benched, or null if every key is cooling down. */
  nextKey() {
    if (!this.keys.length) return null;
    const now = nowMs();
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[this.cursor % this.keys.length];
      this.cursor++;
      const until = this.benched.get(key);
      if (!until || until <= now) return key;
    }
    return null;
  }

  bench(key, ms = COOLDOWN_MS) {
    this.benched.set(key, nowMs() + ms);
    this.rateLimited++;
  }

  /** How long until at least one key frees up. */
  msUntilFree() {
    if (!this.keys.length) return Infinity;
    const now = nowMs();
    let soonest = Infinity;
    for (const key of this.keys) {
      const until = this.benched.get(key) ?? 0;
      soonest = Math.min(soonest, Math.max(0, until - now));
    }
    return soonest;
  }

  /** JSON-RPC call, retried across keys. */
  async rpc(method, params = []) {
    if (!this.keys.length) throw new Error('RpcPool: no HELIUS_KEYS configured');

    return retry(async () => {
      const key = this.nextKey();
      if (!key) {
        const err = new Error('all keys rate-limited');
        err.status = 429;
        throw err;
      }
      this.calls++;
      try {
        const body = await fetchJson(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          timeoutMs: 10_000
        });
        if (body.error) throw new Error(`RPC ${method}: ${body.error.message}`);
        return body.result;
      } catch (err) {
        if (err.status === 429) this.bench(key);
        throw err;
      }
    }, {
      attempts: Math.min(5, Math.max(3, this.keys.length)),
      shouldRetry: (e) => e.status === 429 || e.status >= 500 || e.name === 'AbortError',
      onRetry: (e, n, waitMs) =>
        log.debug('rpc retry', { method, attempt: n, waitMs: Math.round(waitMs), err: e.message })
    });
  }

  /** SOL balance in lamports. */
  async getBalance(address) {
    const r = await this.rpc('getBalance', [address]);
    return r?.value ?? 0;
  }

  /** SPL token accounts for an owner — the balance breakdown the site shows. */
  async getTokenAccounts(owner) {
    const r = await this.rpc('getTokenAccountsByOwner', [
      owner,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
      { encoding: 'jsonParsed' }
    ]);
    return (r?.value ?? []).map(a => {
      const info = a.account?.data?.parsed?.info;
      return {
        mint: info?.mint,
        amount: Number(info?.tokenAmount?.uiAmount ?? 0),
        decimals: info?.tokenAmount?.decimals ?? 0
      };
    }).filter(t => t.mint && t.amount > 0);
  }

  health() {
    return {
      keys: this.keys.length,
      benched: [...this.benched.values()].filter(t => t > nowMs()).length,
      calls: this.calls,
      rateLimited: this.rateLimited
    };
  }
}
