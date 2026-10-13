/* The fee flywheel, read-only.
 *
 * Execution lives on the shared memcoinz flywheel worker (one Railway service
 * per coin, image `memcoinz/deploy/worker`). It claims creator fees and routes
 * them per flywheel/memcoin.config.json: buyback+burn and the agent treasury.
 * This module never signs anything — it reports what the worker and the chain
 * say, so the site shows real numbers or "—".
 *
 *   worker   GET {WORKER_URL}/health → {mint, live, intervalMinutes, cycles, failures, last}
 *            (shape pinned by test/fixtures/worker.health.json, captured from a
 *            real dry-run of the worker)
 *            WORKER_DATA_DIR → status.json + ledgers/*.jsonl, only when this process
 *            can see the worker's volume (same box). Railway volumes are per-service.
 *   chain    mint supply → burned; curve state; claimable creator fees;
 *            creator + treasury wallet SOL balances.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { log } from '../log.js';
import { fetchJson, nowMs } from '../util.js';
import { SolanaReader, PUMP_INITIAL_SUPPLY, cached } from './solana.js';

/* Burned = initial − current supply. Standard pump.fun mints start at 1B
 * (6 decimals); some newer curves do not, so the initial figure is config and
 * a supply ABOVE it yields null ("—") rather than a negative burn. */
const INITIAL_SUPPLY_RAW = process.env.PXBT_INITIAL_SUPPLY
  ? BigInt(Math.round(Number(process.env.PXBT_INITIAL_SUPPLY))) * 1_000_000n
  : PUMP_INITIAL_SUPPLY;

/** Validates a worker /health body; returns null when it isn't one. */
export function parseWorkerHealth(h) {
  if (!h || typeof h !== 'object' || typeof h.cycles !== 'number') return null;
  return {
    mint: typeof h.mint === 'string' ? h.mint : null,
    live: h.live === true,
    intervalMinutes: Number.isFinite(h.intervalMinutes) ? h.intervalMinutes : null,
    cycles: h.cycles,
    failures: Number.isFinite(h.failures) ? h.failures : 0,
    last: h.last && typeof h.last === 'object'
      ? {
          startedAt: h.last.startedAt ?? null,
          finishedAt: h.last.finishedAt ?? null,
          ok: h.last.ok === true,
          error: h.last.error ?? null
        }
      : null
  };
}

/**
 * Summarises memcoinz JSONL ledgers (solana-core `Ledger`): last write per key
 * wins, exactly as the worker resumes them.
 */
export function summariseLedgers(files) {
  const out = { files: 0, sent: 0, pending: 0, failed: 0, signatures: [] };
  const sigs = new Map();   // signature -> latest at
  for (const { name, text } of files) {
    out.files++;
    const latest = new Map();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e && e.key) latest.set(e.key, e);
      } catch { /* torn final line after a crash — ignore, as Ledger would fail on it */ }
    }
    for (const e of latest.values()) {
      if (e.status === 'sent') out.sent++;
      else if (e.status === 'failed') out.failed++;
      else out.pending++;
      if (e.status === 'sent' && e.signature) {
        const prev = sigs.get(e.signature);
        if (!prev || (e.at ?? '') > prev.at) sigs.set(e.signature, { signature: e.signature, at: e.at ?? null, ledger: name });
      }
    }
  }
  out.signatures = [...sigs.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 25);
  return out;
}

export class Flywheel {
  constructor({
    workerUrl = config.flywheel.workerUrl,
    dataDir = config.flywheel.workerDataDir,
    mint = config.flywheel.mint,
    creator = config.flywheel.creatorWallet,
    treasury = config.treasuryWallet,
    chain,
    fetchImpl = fetchJson,
    initialSupplyRaw = INITIAL_SUPPLY_RAW
  } = {}) {
    this.initialSupplyRaw = initialSupplyRaw;
    this.workerUrl = workerUrl.replace(/\/$/, '');
    this.dataDir = dataDir;
    this.mint = mint;
    this.creator = creator;
    this.treasury = treasury;
    this.chain = chain ?? new SolanaReader();
    this.fetch = fetchImpl;
    this.worker = cached(() => this.readWorker(), 15_000);
    this.onchain = cached(() => this.readChain(), 30_000);
  }

  async readWorker() {
    const base = { configured: Boolean(this.workerUrl || this.dataDir), reachable: false, health: null, ledgers: null };
    if (this.workerUrl) {
      try {
        base.health = parseWorkerHealth(await this.fetch(`${this.workerUrl}/health`, { timeoutMs: 6000 }));
        base.reachable = Boolean(base.health);
      } catch (err) {
        base.error = `worker unreachable: ${err.message}`;
      }
    }
    if (this.dataDir && existsSync(this.dataDir)) {
      try {
        const statusFile = join(this.dataDir, 'status.json');
        if (!base.health && existsSync(statusFile)) {
          base.health = parseWorkerHealth(JSON.parse(readFileSync(statusFile, 'utf8')));
          base.reachable = Boolean(base.health);
        }
        const dir = join(this.dataDir, 'ledgers');
        const files = existsSync(dir)
          ? readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }))
          : [];
        base.ledgers = summariseLedgers(files);
      } catch (err) {
        log.warn('worker data dir read failed', { err: err.message });
      }
    }
    if (base.health?.mint && this.mint && base.health.mint !== this.mint) {
      base.warning = `worker runs mint ${base.health.mint}, but PXBT_MINT is ${this.mint}`;
    }
    return base;
  }

  async readChain() {
    const out = { mint: this.mint || null, burnedTokens: null, burnedPctSupply: null, supply: null,
      curve: null, claimableSol: null, creatorSol: null, treasurySol: null, readAt: nowMs() };
    const jobs = [];
    if (this.mint) {
      jobs.push(this.chain.tokenSupply(this.mint).then(s => {
        if (!s) return;
        out.supply = Number(s.raw) / 10 ** s.decimals;
        if (s.decimals === 6 && s.raw <= this.initialSupplyRaw) {
          const burned = this.initialSupplyRaw - s.raw;
          out.burnedTokens = Number(burned) / 1e6;
          out.burnedPctSupply = Number((burned * 1_000_000n) / this.initialSupplyRaw) / 10_000;
        }
      }));
      jobs.push(this.chain.bondingCurve(this.mint).then(c => {
        out.curve = c ? { complete: c.complete, progress: c.progress, realSol: c.realSol } : null;
      }));
    }
    if (this.creator) {
      jobs.push(this.chain.claimable(this.creator).then(c => { out.claimableSol = c.total / 1e9; }));
      jobs.push(this.chain.balance(this.creator).then(l => { out.creatorSol = l / 1e9; }));
    }
    if (this.treasury) jobs.push(this.chain.balance(this.treasury).then(l => { out.treasurySol = l / 1e9; }));
    const res = await Promise.allSettled(jobs);
    const errs = res.filter(r => r.status === 'rejected').map(r => r.reason?.message);
    if (errs.length) out.errors = errs;
    return out;
  }

  /** Everything the site's flywheel panel needs. Nulls mean "unknown" → "—". */
  async state() {
    const [worker, chain] = await Promise.all([
      this.worker().catch(err => ({ configured: true, reachable: false, error: err.message })),
      this.onchain().catch(err => ({ errors: [err.message] }))
    ]);
    return {
      configured: { worker: Boolean(this.workerUrl || this.dataDir), mint: Boolean(this.mint),
        creator: Boolean(this.creator), treasury: Boolean(this.treasury) },
      worker,
      chain
    };
  }
}
