import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseWorkerHealth, summariseLedgers, Flywheel } from '../src/sources/flywheel.js';
import { buildWorkerConfig } from '../scripts/flywheel-env.js';
import { buildApi } from '../src/api/server.js';
import { Store } from '../src/store/db.js';
import { RpcPool } from '../src/sources/rpcPool.js';

/* Captured from a real dry-run of memcoinz deploy/worker on 2026-10-04. */
const health = JSON.parse(readFileSync(new URL('./fixtures/worker.health.json', import.meta.url), 'utf8'));
const MINT = 'A6zceQB4mGSy83hcJ4PCjdH5Zf5aCumtau31sDMapump';
const WALLET = 'Cy2qEbkTH1EH1Cj9bxJjNceZHVrkn4kj9iuyctsMoGNA';

test('worker /health parses; anything else is rejected', () => {
  const h = parseWorkerHealth(health);
  assert.equal(h.mint, MINT);
  assert.equal(h.live, false);
  assert.equal(h.cycles, 1);
  assert.equal(h.last.ok, true);
  assert.equal(parseWorkerHealth({ ok: true }), null);
  assert.equal(parseWorkerHealth(null), null);
});

test('ledger summary: last write per key wins, torn lines ignored', () => {
  const text = [
    { key: 'a', status: 'pending', signature: 'S1', at: '2026-10-04T00:00:00Z' },
    { key: 'a', status: 'sent', signature: 'S1', at: '2026-10-04T00:00:01Z' },
    { key: 'b', status: 'pending', signature: 'S2', at: '2026-10-04T00:00:02Z' },
    { key: 'c', status: 'failed', at: '2026-10-04T00:00:03Z' }
  ].map(e => JSON.stringify(e)).join('\n') + '\n{"key":"d","sta';
  const s = summariseLedgers([{ name: 'airdrop-x.jsonl', text }]);
  assert.deepEqual([s.sent, s.pending, s.failed], [1, 1, 1]);
  assert.deepEqual(s.signatures.map(x => x.signature), ['S1']);
});

const fakeChain = {
  endpoint: 'fake',
  async tokenSupply() { return { raw: 990_000_000n * 1_000_000n, decimals: 6 }; },  // 10M burned
  async bondingCurve() { return { complete: true, progress: 1, realSol: 0 }; },
  async claimable() { return { total: 250_000_000 }; },
  async balance() { return 1_500_000_000; }
};

test('flywheel state: worker + chain, burned derived from supply', async () => {
  const fw = new Flywheel({
    workerUrl: 'https://w.example', mint: MINT, creator: WALLET, treasury: WALLET,
    chain: fakeChain, fetchImpl: async (url) => { assert.equal(url, 'https://w.example/health'); return health; }
  });
  const s = await fw.state();
  assert.equal(s.worker.reachable, true);
  assert.equal(s.worker.health.cycles, 1);
  assert.equal(s.chain.burnedTokens, 10_000_000);
  assert.equal(s.chain.burnedPctSupply, 1);
  assert.equal(s.chain.claimableSol, 0.25);
  assert.equal(s.chain.treasurySol, 1.5);
});

test('flywheel state: nothing configured → nulls, never invented numbers', async () => {
  const fw = new Flywheel({ workerUrl: '', mint: '', creator: '', treasury: '', chain: fakeChain });
  const s = await fw.state();
  assert.equal(s.worker.reachable, false);
  for (const k of ['burnedTokens', 'claimableSol', 'treasurySol', 'creatorSol']) assert.equal(s.chain[k], null, k);
});

test('flywheel state: unreachable worker is reported, mint mismatch is flagged', async () => {
  const down = new Flywheel({ workerUrl: 'https://w', mint: MINT, chain: fakeChain,
    fetchImpl: async () => { throw new Error('HTTP 502'); } });
  assert.match((await down.state()).worker.error, /502/);
  const other = new Flywheel({ workerUrl: 'https://w', mint: WALLET, chain: fakeChain, fetchImpl: async () => health });
  assert.match((await other.state()).worker.warning, /PXBT_MINT/);
});

test('flywheel state: reads status.json + ledgers from a co-located volume', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pxbt-vol-'));
  writeFileSync(join(dir, 'status.json'), JSON.stringify(health));
  mkdirSync(join(dir, 'ledgers'));
  writeFileSync(join(dir, 'ledgers', 'airdrop-A.jsonl'), JSON.stringify({ key: 'w', status: 'sent', signature: 'SIG', at: 'x' }) + '\n');
  const s = await new Flywheel({ workerUrl: '', dataDir: dir, mint: MINT, chain: fakeChain }).state();
  assert.equal(s.worker.reachable, true);
  assert.equal(s.worker.ledgers.sent, 1);
});

test('flywheel config: the shipped file is valid once mint + treasury are given', () => {
  const file = new URL('../flywheel/memcoin.config.json', import.meta.url);
  assert.ok(buildWorkerConfig(file, {}).errs.some(e => /mint is empty/.test(e)));
  const { cfg, errs } = buildWorkerConfig(file, { PXBT_MINT: MINT, PXBT_TREASURY: WALLET });
  assert.deepEqual(errs, []);
  assert.equal(Object.values(cfg.route).reduce((a, b) => a + b, 0), 100);
  assert.equal(cfg.wallets.creator, 'PXBT_CREATOR_KEYPAIR');   // names an env var, never a key
  assert.ok(buildWorkerConfig(file, { PXBT_MINT: 'nope', PXBT_TREASURY: WALLET }).errs.length);
});

test('api: /api/flywheel and /api/state.flywheel serve the reader, paper ledger is not treasury', async () => {
  const fw = new Flywheel({ workerUrl: 'https://w', mint: MINT, creator: WALLET, chain: fakeChain, fetchImpl: async () => health });
  const { routes, store } = buildApi({ store: new Store(':memory:'), rpc: new RpcPool([]), flywheel: fw });
  const f = await routes['/api/flywheel']();
  assert.equal(f.worker.health.mint, MINT);
  const st = await routes['/api/state']();
  assert.equal(st.flywheel.chain.burnedTokens, 10_000_000);
  assert.equal(st.paper, true);
  assert.equal('treasury' in st, false);
  store.close?.();
});

test('burned is null, not negative, when supply exceeds the configured initial supply', async () => {
  const twoB = { ...fakeChain, async tokenSupply() { return { raw: 2_000_000_000n * 1_000_000n, decimals: 6 }; } };
  const s = await new Flywheel({ workerUrl: '', mint: MINT, chain: twoB }).state();
  assert.equal(s.chain.burnedTokens, null);
  assert.equal(s.chain.supply, 2_000_000_000);
  const cfg = await new Flywheel({ workerUrl: '', mint: MINT, chain: twoB, initialSupplyRaw: 2_100_000_000n * 1_000_000n }).state();
  assert.equal(cfg.chain.burnedTokens, 100_000_000);
});
