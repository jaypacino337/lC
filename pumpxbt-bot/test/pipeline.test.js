import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PumpFunClient, parseCallout, parseTrade, deriveActivity } from '../src/sources/pumpfun.js';
import { Store } from '../src/store/db.js';
import { rebuildAllCallerStats, SCORING } from '../src/signals/callerScore.js';
import { buildApi } from '../src/api/server.js';

/* ── Parsers ───────────────────────────────────────────────────────────────
 * These guard the guesses in pumpfun.js. When you replace the fixture with a
 * real captured response, these are the tests that tell you what broke. */

test('parseCallout tolerates alternative field names', () => {
  const a = parseCallout({ caller: 'W', mint: 'M', created_at: 1750000000, price_usd: 0.5 });
  const b = parseCallout({ user: 'W', coin_mint: 'M', timestamp: 1750000000, price: 0.5 });
  assert.equal(a.caller, b.caller);
  assert.equal(a.mint, b.mint);
  assert.equal(a.priceAtCall, b.priceAtCall);
});

test('parseCallout normalises seconds and ISO timestamps to ms', () => {
  const secs = parseCallout({ caller: 'W', mint: 'M', created_at: 1750000000 });
  const iso = parseCallout({ caller: 'W', mint: 'M', created_at: '2025-06-15T12:00:00Z' });
  assert.ok(secs.calledAt > 1e12, 'seconds should be scaled to ms');
  assert.ok(iso.calledAt > 1e12);
});

test('parseCallout rejects rows missing required fields', () => {
  assert.equal(parseCallout({ caller: 'W' }), null);
  assert.equal(parseCallout({ mint: 'M' }), null);
});

test('parseTrade infers buy/sell from several encodings', () => {
  assert.equal(parseTrade({ user: 'W', mint: 'M', is_buy: true }).isBuy, true);
  assert.equal(parseTrade({ user: 'W', mint: 'M', side: 'buy' }).isBuy, true);
  assert.equal(parseTrade({ user: 'W', mint: 'M', side: 'sell' }).isBuy, false);
  assert.equal(parseTrade({ user: 'W', mint: 'M', type: 'BUY' }).isBuy, true);
});

test('deriveActivity computes velocity from a trade list', () => {
  const now = 1_760_000_000_000;
  const a = deriveActivity([
    { wallet: 'a', at: now - 1000, usd: 100, isBuy: true },
    { wallet: 'b', at: now - 2000, usd: 200, isBuy: true },
    { wallet: 'a', at: now - 3000, usd: 50, isBuy: true },
    { wallet: 'c', at: now - 4000, usd: 120, isBuy: false }
  ], 5 * 60_000, now);

  assert.equal(a.buyers5m, 2, 'unique buyers, not buy count');
  assert.equal(a.volume5m, 470);
  assert.equal(a.netInflow5m, 350 - 120);
  assert.equal(a.buySellRatio, 3);
});

test('deriveActivity ignores trades outside the window', () => {
  const now = 1_760_000_000_000;
  const a = deriveActivity([{ wallet: 'a', at: now - 60 * 60_000, usd: 999, isBuy: true }], 5 * 60_000, now);
  assert.equal(a.buyers5m, 0);
  assert.equal(a.volume5m, 0);
});

/* ── Fixture client ──────────────────────────────────────────────────────── */

test('fixture client returns parsed callouts, trades and tokens', async () => {
  const c = new PumpFunClient({ source: 'fixture' });
  const callouts = await c.recentCallouts();
  const trades = await c.recentTrades();
  const token = await c.token('MINT_SILENT_ELITE');

  assert.ok(callouts.length > 5);
  assert.ok(trades.length > 5);
  assert.equal(token.symbol, 'SILENT');
  assert.ok(callouts.every(x => x.caller && x.mint));
});

test('fixture trades filter by mint', async () => {
  const c = new PumpFunClient({ source: 'fixture' });
  const all = await c.recentTrades();
  const one = await c.recentTrades({ mint: 'MINT_SILENT_ELITE' });
  assert.ok(one.length < all.length);
  assert.ok(one.every(t => t.mint === 'MINT_SILENT_ELITE'));
});

/* ── Store + reputation, end to end ──────────────────────────────────────── */

test('reputation separates a sharp caller from a bad one', async () => {
  const store = new Store(':memory:');
  const c = new PumpFunClient({ source: 'fixture' });
  const callouts = await c.recentCallouts();

  for (const co of callouts) store.insertCallout(co);

  /* Resolve per the fixture scenario: MINT_W* doubled, MINT_L* did not. */
  for (const co of callouts) {
    const win = /^MINT_W\d/.test(co.mint);
    store.recordOutcome({
      calloutId: co.id,
      peakMult: win ? 3 : 0.6,
      endMult: win ? 2.2 : 0.5,
      isWin: win,
      windowMs: SCORING.windowMs
    });
  }

  rebuildAllCallerStats(store, { now: Date.now() });

  const sharp = store.callerScore('WALLET_SHARP_A');
  const bad = store.callerScore('WALLET_BAD_C');
  const lucky = store.callerScore('WALLET_LUCKY_B');

  assert.ok(sharp > bad, `sharp ${sharp.toFixed(3)} vs bad ${bad.toFixed(3)}`);
  assert.ok(sharp > lucky, `sharp ${sharp.toFixed(3)} vs 1-for-1 lucky ${lucky.toFixed(3)}`);
  assert.equal(bad, 0, 'a caller with zero wins should score zero');
  store.close();
});

test('insertCallout is idempotent', () => {
  const store = new Store(':memory:');
  const co = { id: 'x1', caller: 'W', mint: 'M', calledAt: 1750000000000, priceAtCall: 1 };
  assert.equal(store.insertCallout(co).inserted, true);
  assert.equal(store.insertCallout(co).inserted, false);
  assert.equal(store.stats().callouts, 1);
  store.close();
});

test('weCalled prevents duplicate callouts', () => {
  const store = new Store(':memory:');
  assert.equal(store.weCalled('M'), false);
  store.queueCallout({ mint: 'M', createdAt: Date.now(), score: 0.5, text: 't', reasons: [] });
  assert.equal(store.weCalled('M'), true);
  store.close();
});

/* ── Ledger API ──────────────────────────────────────────────────────────── */

test('api /state is read-only and flags paper mode', async () => {
  const store = new Store(':memory:');
  const { routes } = buildApi({ store, rpc: { size: 0, health: () => ({ keys: 0 }) } });
  const state = await routes['/api/state']();

  assert.equal(state.paper, true);
  assert.match(state.disclaimer, /PAPER MODE/);
  assert.ok(state.portfolio);
  assert.ok(Array.isArray(state.topCallers));
  store.close();
});

test('api /health reports store stats', async () => {
  const store = new Store(':memory:');
  const { routes } = buildApi({ store, rpc: { size: 0, health: () => ({ keys: 0 }) } });
  const h = await routes['/api/health']();
  assert.equal(h.ok, true);
  assert.equal(typeof h.callouts, 'number');
  store.close();
});
