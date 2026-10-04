import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  b58decode, b58encode, isAddress, isOnCurve, bondingCurvePda, creatorVaultPda,
  ammCreatorVaultAuthority, associatedTokenAddress, WSOL_MINT, decodeBondingCurve
} from '../src/sources/solana.js';
import { parsePortalMessage, eventToTrade, PumpPortalStream } from '../src/sources/pumpportal.js';
import { bestPairs, parsePair, WSOL } from '../src/sources/dexscreener.js';
import { PumpFunClient } from '../src/sources/pumpfun.js';

/* Every fixture here is a real response captured from the live source on
 * 2026-10-04. If a source changes shape, capture a fresh one and re-run. */
const fx = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const stream = fx('pumpportal.stream.json').messages;
const dex = fx('dexscreener.tokens.json');
const curveAcc = fx('rpc.bondingCurve.json').response.result.value;

/* ── base58 + PDAs (vectors from mainnet) ────────────────────────────────── */

test('base58 round-trips, keeps leading zeros, rejects junk', () => {
  for (const a of [WSOL, '11111111111111111111111111111111', 'CUHCtchqaYwoWPf9vRThwit98uhRo1VsGV7Mx1Xy1RFt']) {
    assert.equal(b58encode(b58decode(a)), a);
  }
  assert.equal(b58decode('11111111111111111111111111111111').length, 32);
  assert.equal(isAddress('not-an-address!'), false);
  assert.equal(isAddress('abc'), false);
});

test('bonding-curve PDA matches the curve PumpPortal reported for the same mint', () => {
  const create = stream.find(m => m.mint === 'A6zceQB4mGSy83hcJ4PCjdH5Zf5aCumtau31sDMapump');
  assert.equal(bondingCurvePda(create.mint), create.bondingCurveKey);
  for (const m of stream.filter(m => m.txType === 'create')) {
    assert.equal(bondingCurvePda(m.mint), m.bondingCurveKey, m.symbol);
  }
});

test('creator vaults match the memcoinz worker\'s own derivation', () => {
  /* From a dry run of memcoinz deploy/worker: "bonding vault 3ywPo…", "PumpSwap vault BiVwS…". */
  const creator = 'Cy2qEbkTH1EH1Cj9bxJjNceZHVrkn4kj9iuyctsMoGNA';
  assert.equal(creatorVaultPda(creator), '3ywPoPn4msPJf4gnGiQNhyT1aPoy4vF1b5iuCnbkni44');
  assert.equal(associatedTokenAddress(ammCreatorVaultAuthority(creator), WSOL_MINT),
    'BiVwS7mZ7TsUG5z8q8LJ8Q8WhWKC1c5SHinyqPf9736D');
});

test('isOnCurve: real wallet keys are on the curve, PDAs are not', () => {
  assert.equal(isOnCurve(b58decode('Cy2qEbkTH1EH1Cj9bxJjNceZHVrkn4kj9iuyctsMoGNA')), true);
  assert.equal(isOnCurve(b58decode('CUHCtchqaYwoWPf9vRThwit98uhRo1VsGV7Mx1Xy1RFt')), false);
});

test('bonding curve account decodes to the creator PumpPortal named', () => {
  const c = decodeBondingCurve(Buffer.from(curveAcc.data[0], 'base64'));
  assert.equal(c.creator, '2aQTfNMWfRksacWVSGYeyGqypJUMWSUC29hQ8EfgmKBb');
  assert.equal(c.totalSupply, 1_000_000_000);
  assert.equal(c.complete, false);
  assert.ok(c.progress >= 0 && c.progress < 0.01);
  assert.ok(c.priceSol > 0 && c.priceSol < 1e-6);
  assert.equal(decodeBondingCurve(Buffer.alloc(10)), null);
});

/* ── PumpPortal ──────────────────────────────────────────────────────────── */

test('pumpportal: acks are ignored, creates are parsed', () => {
  const parsed = stream.map(m => parsePortalMessage(m, 1000));
  assert.equal(parsed[0], null);                         // "Successfully subscribed…"
  const creates = parsed.filter(Boolean);
  assert.equal(creates.length, stream.filter(m => m.txType === 'create').length);
  const lrp = creates.find(c => c.symbol === 'LRP');
  assert.equal(lrp.kind, 'create');
  assert.equal(lrp.creator, '2aQTfNMWfRksacWVSGYeyGqypJUMWSUC29hQ8EfgmKBb');
  assert.ok(Math.abs(lrp.initialBuySol - 0.008131888) < 1e-12);
  assert.ok(lrp.priceSol > 0);
});

test('pumpportal: a creator\'s initial buy becomes a trade; a zero-buy launch does not', () => {
  const [, , zero, buy] = stream.map(m => parsePortalMessage(m, 5000));
  assert.equal(eventToTrade(zero, 120), null);
  const t = eventToTrade(buy, 120);
  assert.equal(t.isBuy, true);
  assert.equal(t.wallet, buy.creator);
  assert.ok(Math.abs(t.usd - buy.initialBuySol * 120) < 1e-9);
  /* No SOL price → USD stays unknown rather than guessed. */
  assert.equal(eventToTrade(buy, null).usd, null);
});

test('pumpportal: buy/sell messages parse with the documented fields', () => {
  const base = { mint: 'M', traderPublicKey: 'W', solAmount: 1, tokenAmount: 5, vSolInBondingCurve: 30, vTokensInBondingCurve: 1e9 };
  assert.equal(parsePortalMessage({ ...base, txType: 'buy' }).isBuy, true);
  assert.equal(parsePortalMessage({ ...base, txType: 'sell' }).isBuy, false);
});

test('pumpportal stream: one socket, free subs on open, buffers events', async () => {
  const sent = [];
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; FakeWS.last = this; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
    send(s) { sent.push(JSON.parse(s)); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  const s = new PumpPortalStream({ WebSocketImpl: FakeWS });
  assert.equal(await s.start(), true);
  assert.deepEqual(sent.map(m => m.method), ['subscribeNewToken', 'subscribeMigration']);
  assert.ok(!FakeWS.last.url.includes('api-key'));
  for (const m of stream) FakeWS.last.onmessage({ data: JSON.stringify(m) });
  assert.equal(s.creates.size, 4);
  assert.equal(s.recent({ kind: 'create' }).length, 4);
  s.stop();
  assert.equal(s.connected, false);
});

test('pumpportal stream: metered trade subs only with a key, capped', () => {
  const noKey = new PumpPortalStream({ tradeSubs: 5 });
  assert.equal(noKey.tradeSubs, 0);
  const s = new PumpPortalStream({ apiKey: 'k', tradeSubs: 2 });
  const sent = [];
  s.ws = { readyState: 1, send: (x) => sent.push(JSON.parse(x)) };
  for (const m of stream) s.ingest(m);
  assert.equal(s.subscribedTrades.size, 2);
  assert.ok(sent.some(m => m.method === 'unsubscribeTokenTrade'));
});

/* ── DexScreener ─────────────────────────────────────────────────────────── */

test('dexscreener: best pair per base mint, parsed to the Token shape', () => {
  const best = bestPairs(dex);
  const sol = parsePair(best.get(WSOL));
  assert.ok(sol.price > 10);
  const lrp = parsePair(best.get('A6zceQB4mGSy83hcJ4PCjdH5Zf5aCumtau31sDMapump'));
  assert.equal(lrp.symbol, 'LRP');
  assert.equal(lrp.dexId, 'pumpfun');
  assert.equal(lrp.complete, false);               // still on the bonding curve
  assert.equal(lrp.buyers5m, 2);
  assert.ok(lrp.mcap > 0 && lrp.createdAt > 1.7e12);
  assert.equal(parsePair({}), null);
});

/* ── Live client, composed from injected sources (no network) ────────────── */

test('live client: launches → trades, DexScreener → token, chain fallback when unindexed', async () => {
  const s = new PumpPortalStream();
  for (const m of stream) s.ingest(m);
  const best = bestPairs(dex);
  const fakeDex = {
    async tokens(mints) { return new Map(mints.map(m => [m, best.has(m) ? parsePair(best.get(m)) : null])); },
    async solUsd() { return 120; }
  };
  const fakeChain = { endpoint: 'fake', async bondingCurve() { return decodeBondingCurve(Buffer.from(curveAcc.data[0], 'base64')); } };
  const c = new PumpFunClient({ source: 'live', stream: s, dex: fakeDex, chain: fakeChain });

  assert.deepEqual(await c.recentCallouts(), []);   // no verifiable feed → none, not guesses
  const trades = await c.recentTrades();
  assert.equal(trades.length, 3);                   // 4 launches, one had no initial buy
  assert.ok(trades.every(t => t.isBuy && t.usd > 0));

  const indexed = await c.token('A6zceQB4mGSy83hcJ4PCjdH5Zf5aCumtau31sDMapump');
  assert.equal(indexed.source, 'dexscreener');
  const fresh = await c.token('MguSf28z5BHGxQCh7PLsS6YwgV7stHTHAzsKP2epump');
  assert.equal(fresh.source, 'chain');
  assert.equal(fresh.symbol, 'INTERVIEWE');         // name from the stream
  assert.ok(fresh.price > 0 && fresh.liquidity > 0);
  assert.match(c.health().callouts, /unavailable/);
});

test('pumpportal: migration events mark a token graduated', () => {
  const migs = fx('pumpportal.stream.json').migrations;
  const s = new PumpPortalStream();
  for (const m of migs) s.ingest(m);
  assert.equal(s.migrated.size, 2);
  const e = parsePortalMessage(migs[1]);
  assert.equal(e.kind, 'migration');
  assert.equal(e.pool, 'pump-amm');
});

test('live mode never marks positions from stream-implied trade prices', async () => {
  /* Regression: a probe filled at the DexScreener quote and exited at a stream
   * price 160x higher on a non-standard curve, booking a fake +$126. */
  const { Bot } = await import('../src/main.js');
  const { Store } = await import('../src/store/db.js');
  const pump = {
    marksFromTrades: false,
    async recentCallouts() { return []; },
    async recentTrades() { return [{ id: 't', wallet: 'W', mint: 'M', at: Date.now(), usd: 5, price: 3.3e-6, isBuy: true }]; },
    async token() { return { mint: 'M', price: 2.04e-8, liquidity: 10 }; }
  };
  const store = new Store(':memory:');
  const bot = new Bot({ store, pump, rpc: { size: 0 }, alerts: { enabled: false, send: async () => {} } });
  await bot.ingest();
  assert.equal(bot.priceBook.has('M'), false);
  const fixture = new PumpFunClient({ source: 'fixture' });
  assert.equal(fixture.marksFromTrades, true);
  assert.equal(new PumpFunClient({ source: 'live', stream: new PumpPortalStream(), dex: {}, chain: {} }).marksFromTrades, false);
  store.close();
});

test('callout text says "buys" (not unique buyers) for DexScreener txn counts', async () => {
  const { composeCallout } = await import('../src/callouts/composer.js');
  const verdict = { calloutScore: 0.3, reasons: [], signals: {}, trade: {}, callout: {} };
  const token = { symbol: 'X', mint: 'M' };
  assert.match(composeCallout({ token, verdict, activity: { buyers5m: 108, buysAreTxns: true } }).text, /108 buys in the last 5m/);
  assert.match(composeCallout({ token, verdict, activity: { buyers5m: 8 } }).text, /8 unique buyers/);
});
