// Application layer: storage access, the tick (market refresh + every builder's decision),
// the public snapshot and every creator action. HTTP lives in lib/router.js.
import crypto from 'node:crypto';
import { getStore, withLock } from './store.js';
import { settings, publicConfig, mode, TRADING, FILTERS, STRATEGIES, DEFAULT_STRATEGY, BRAND } from './config.js';
import { loadMarket } from './market.js';
import { runAgent, resolveStrategy, liquidate, equityOf } from './engine.js';
import { agentSummary, agentDetail, decorateTrade, statsOf, priceFn } from './views.js';
import { httpError, isAddress, verifyAction } from './auth.js';
import { sanitize, cleanName, settingsLine, riskReasons, CUSTOM_RISK_ACK, CUSTOM_BASES } from '../public/shared/custom-strategy.js';

const K = {
  meta: 'fm:meta', ids: 'fm:agents', agent: (id) => 'fm:agent:' + id, feed: 'fm:feed', thoughts: 'fm:thoughts',
  market: 'fm:market', custom: (owner) => 'fm:custom:' + owner, img: (id) => 'fm:img:' + id,
};
const FEED_MAX = 60, THOUGHTS_MAX = 40;
export const newId = (p) => p + '_' + crypto.randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8).padEnd(8, '0');
const customId = (owner) => 'custom-' + crypto.createHash('sha256').update(owner).digest('hex').slice(0, 10);

// ── reads ──
export async function loadAgents(store = getStore()) {
  const ids = (await store.get(K.ids)) || [];
  const docs = await store.mget(ids.map(K.agent));
  return docs.filter(Boolean);
}
export async function getMarket(store = getStore()) { return store.get(K.market); }
async function findAgent(idOrNo, store = getStore()) {
  const s = String(idOrNo);
  if (/^\d+$/.test(s)) return (await loadAgents(store)).find((a) => a.no === Number(s)) || null;
  return store.get(K.agent(s));
}
async function customsFor(agents, store = getStore()) {
  const owners = [...new Set(agents.filter((a) => a.strategy?.startsWith('custom-')).map((a) => a.creator))];
  const docs = await store.mget(owners.map(K.custom));
  return docs.filter(Boolean);
}
export function customView(c) {
  if (!c) return null;
  const base = STRATEGIES.find((s) => s.id === c.base);
  const p = c.params;
  return {
    id: c.id, owner: c.owner, name: c.name, custom: true, base: c.base, baseName: base?.name || c.base, risk: null,
    tagline: 'Custom strategy', goal: `Custom ${base?.name || c.base} settings by ${c.owner.slice(0, 4)}…${c.owner.slice(-4)}`,
    maxTradeSol: null, sizePct: p.sizePct, maxOpen: p.maxOpen, takeProfitPct: p.takeProfitPct, stopLossPct: p.stopLossPct,
    trail: p.trailAt > 0 ? { at: p.trailAt, by: p.trailBy } : null, maxHoldMin: p.maxHoldMin || null, cooldownMin: p.cooldownMin,
    minLiquidityUsd: p.minLiquidityUsd, params: p, prompt: c.prompt || '', updatedAt: c.updatedAt,
  };
}

// ── snapshot ──
export async function getState(store = getStore()) {
  const [agents, market, feed, thoughts, meta] = await Promise.all([
    loadAgents(store), store.get(K.market), store.get(K.feed), store.get(K.thoughts), store.get(K.meta),
  ]);
  const customs = (await customsFor(agents, store)).map(customView);
  const now = Date.now();
  const summaries = agents.map((a) => agentSummary(a, market)).sort((x, y) => y.pnlSol - x.pnlSol);
  const holders = {};
  for (const a of agents) for (const p of a.positions) holders[p.mint] = (holders[p.mint] || 0) + 1;
  const tokens = (market?.tokens || [])
    .map((t) => ({ ...t, agents: holders[t.mint] || 0 }))
    .sort((a, b) => (b.agents - a.agents) || (b.volume24hUsd - a.volume24hUsd))
    .slice(0, 80);
  const coins = agents.filter((a) => a.coin).map((a) => ({ ...a.coin, mcapUsd: null, athUsd: null, agentId: a.id, agentNo: a.no })).sort((a, b) => b.createdAt - a.createdAt);
  const cfg = publicConfig({ storage: store.kind, customStrategies: customs });
  return {
    now,
    stats: { ...statsOf(agents, market, now), paper: cfg.paper },
    agents: summaries,
    coins,
    feed: feed || [],
    tokens,
    flywheel: { enabled: false, mint: null, pct: 0, totalSol: 0, totalTokens: 0, count: 0, queuedSol: 0, recent: [], agents: { totalSol: 0, totalTokens: 0, count: 0, queuedSol: 0, skinTokens: 0, skinBurns: 0 }, dev: { enabled: false } },
    thoughts: thoughts || [],
    thinking: summaries.filter((a) => a.status === 'ACTIVE').length,
    arena: { open: [], live: [], done: [] },
    companies: [],
    config: cfg,
    bonded: market?.bonded || [],
    engine: { lastTickAt: meta?.lastTickAt || null, ticks: meta?.ticks || 0, marketAt: market?.ts || null, marketErrors: market?.errors || [], tickEveryMs: settings().tickEveryMs },
  };
}

export async function getAgentDetail(idOrNo, store = getStore()) {
  const a = await findAgent(idOrNo, store);
  if (!a) throw httpError(404, 'Builder not found');
  const [market, meta, custom] = await Promise.all([store.get(K.market), store.get(K.meta), a.strategy?.startsWith('custom-') ? store.get(K.custom(a.creator)) : null]);
  return agentDetail(a, market, { custom: customView(custom), tickEveryMs: settings().tickEveryMs, lastTickAt: meta?.lastTickAt });
}

// ── tick ──
// force: run even if the last tick is recent. Returns a short report.
export async function tick({ force = false, store = getStore(), now = Date.now(), marketLoader = loadMarket } = {}) {
  const S = settings();
  const meta0 = (await store.get(K.meta)) || {};
  if (!force && meta0.lastTickAt && now - meta0.lastTickAt < S.tickEveryMs * 0.8) return { skipped: 'recent', lastTickAt: meta0.lastTickAt };
  // one tick at a time across instances (gate expires on its own)
  if (!(await store.setNX('fm:tickgate', now, 90_000))) return { skipped: 'running' };
  try { return await tickInner({ store, now, marketLoader, meta0 }); }
  finally { await store.del('fm:tickgate'); }
}

async function tickInner({ store, now, marketLoader, meta0 }) {
  const t0 = Date.now();
  const before = await loadAgents(store);
  const held = [...new Set(before.flatMap((a) => a.positions.map((p) => p.mint)))];
  const prev = await store.get(K.market);
  const market = await marketLoader({ heldMints: held, prev, filters: FILTERS, now });
  await store.set(K.market, market);
  if (!market.ready) {
    await store.set(K.meta, { ...meta0, lastTickAt: now, ticks: (meta0.ticks || 0) + 1, lastError: market.errors.join('; ') || 'market not ready' });
    return { ok: false, error: 'Market data unavailable: ' + market.errors.join('; ') };
  }
  return withLock('agents', async () => {
    const agents = await loadAgents(store);
    const customs = new Map((await customsFor(agents, store)).map((c) => [c.id, c]));
    const { map } = priceFn(market);
    const feed = (await store.get(K.feed)) || [];
    const thoughts = (await store.get(K.thoughts)) || [];
    let nTrades = 0;
    for (const a of agents) {
      if (a.mode === 'live') continue; // live builders are handled by lib/live (not wired by default)
      const st = resolveStrategy(a.strategy, customs.get(a.strategy));
      const res = runAgent(a, { tokens: map, solUsd: market.solUsd, strategy: st, trading: TRADING, now, newId });
      await store.set(K.agent(a.id), res.agent);
      for (const t of res.trades) { feed.unshift(decorateTrade(t, a)); nTrades++; }
      if (res.thought) thoughts.unshift({
        id: newId('th'), ts: now, agentId: a.id, agentNo: a.no, agentName: a.name, ticker: a.coin?.ticker || null, image: a.coin?.image || null,
        avatarSeed: a.avatarSeed, action: res.thought.action, symbol: res.thought.symbol, text: res.thought.text, blocked: res.thought.blocked || null,
        failed: false, note: !!res.thought.note, levelUp: res.thought.levelUp || null, trade: res.thought.trade || null, paper: a.mode !== 'live',
      });
    }
    feed.sort((x, y) => y.ts - x.ts);
    await store.set(K.feed, feed.slice(0, FEED_MAX));
    await store.set(K.thoughts, thoughts.slice(0, THOUGHTS_MAX));
    const meta = (await store.get(K.meta)) || {};
    await store.set(K.meta, { ...meta, lastTickAt: now, ticks: (meta.ticks || 0) + 1, lastTickMs: Date.now() - t0, lastError: market.errors.length ? market.errors.join('; ') : null });
    return { ok: true, agents: agents.length, trades: nTrades, tokens: market.tokens.length, solUsd: market.solUsd, ms: Date.now() - t0, warnings: market.errors };
  });
}

// Lazily tick when someone reads the page and the last tick is stale (works without a cron).
export async function maybeTick(store = getStore()) {
  const S = settings();
  if (!S.autoTick) return null;
  const meta = (await store.get(K.meta)) || {};
  if (meta.lastTickAt && Date.now() - meta.lastTickAt < S.tickEveryMs) return null;
  const p = tick({ store }).catch((e) => ({ ok: false, error: e.message }));
  return Promise.race([p, new Promise((r) => setTimeout(() => r({ pending: true }), 8_000))]);
}

// ── creator actions ──
const builderOf = (a) => a.wallet;

export async function prepareLaunch(body, store = getStore()) {
  const S = settings();
  if (mode() !== 'paper') throw httpError(501, 'Live launches are not wired in this build. See README → Live trading.');
  const creator = body?.creator;
  if (!isAddress(creator)) throw httpError(400, 'Connect a Solana wallet first');
  const auth = await verifyAction(body, { action: 'launch', builder: 'new', creator, lines: [] }, { store });
  const coin = body.coin || {};
  const name = String(coin.name || '').trim().slice(0, 32);
  const ticker = String(coin.ticker || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  const agentName = String(body.agentName || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 32);
  if (!name) throw httpError(400, 'Give your coin a name.');
  if (ticker.length < 2) throw httpError(400, 'Ticker must be 2–10 letters or numbers.');
  if (!agentName) throw httpError(400, 'Give your builder a name.');
  const capital = Math.round(Number(body.startingCapital) * 1e4) / 1e4;
  if (!(capital >= 0.2) || capital > S.maxPaperCapital) throw httpError(400, `Paper capital must be between 0.2 and ${S.maxPaperCapital} SOL.`);
  if (auth.fields.Capital !== `${capital} SOL (paper)`) throw httpError(401, 'Signed capital does not match');
  if (auth.fields.Name !== agentName || auth.fields.Ticker !== ticker) throw httpError(401, 'Signed name / ticker do not match');
  let strategy = String(body.strategy || DEFAULT_STRATEGY);
  if (strategy.startsWith('custom-')) {
    const c = await store.get(K.custom(creator));
    if (!c || c.id !== strategy) strategy = DEFAULT_STRATEGY;
  } else if (!STRATEGIES.some((s) => s.id === strategy)) strategy = DEFAULT_STRATEGY;
  const avatarSeed = /^[a-z0-9]{2,20}$/i.test(body.avatarSeed || '') ? body.avatarSeed : 'r' + crypto.randomBytes(5).toString('hex');

  return withLock('agents', async () => {
    const ids = (await store.get(K.ids)) || [];
    if (ids.length >= S.maxAgents) throw httpError(429, 'This site is full: the operator caps the number of builders.');
    const mine = (await store.mget(ids.map(K.agent))).filter((a) => a && a.creator === creator);
    if (mine.length >= S.maxAgentsPerCreator) throw httpError(429, `One wallet can run up to ${S.maxAgentsPerCreator} builders.`);
    const meta = (await store.get(K.meta)) || {};
    const no = (meta.nextNo || 1);
    const id = newId('ag');
    const now = Date.now();
    let image = null;
    if (typeof body.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(body.image) && body.image.length < 900_000) {
      await store.set(K.img(id), body.image);
      image = `/api/img/${id}`;
    }
    const agent = {
      id, no, name: agentName, avatarSeed, baseSeed: avatarSeed, wallet: `paper:${id}`, creator, createdAt: now, mode: 'paper',
      coin: { name, ticker, description: String(coin.description || '').slice(0, 280), twitter: String(coin.twitter || '').slice(0, 200), telegram: String(coin.telegram || '').slice(0, 200), website: String(coin.website || '').slice(0, 200), image, mint: null, uri: null, launchSig: null, createdAt: now, paper: true },
      strategy, paused: false, rawStatus: 'ACTIVE', office: null,
      startingCapital: capital, cashSol: capital, depositedSol: capital, withdrawnSol: 0,
      positions: [], history: [], decisions: [], deposits: [{ ts: now, amount: capital, from: creator, sig: null, kind: 'paper-launch' }], withdrawals: [],
      equity: [[now, capital]], cooldowns: {}, bestProfitSol: 0, levelNo: 1,
      stats: { trades: 0, closedTrades: 0, wins: 0, realizedPnlSol: 0, feesSol: 0 }, lastTradeAt: null,
    };
    await store.set(K.agent(id), agent);
    await store.set(K.ids, [...ids, id]);
    await store.set(K.meta, { ...meta, nextNo: no + 1 });
    return { agentId: id, no, wallet: agent.wallet, requiredSol: 0, paper: true, status: 'ACTIVE' };
  });
}

// Mutate one agent under the lock after checking the creator's signature.
async function creatorAction(id, body, action, lines, fn, store = getStore()) {
  const a0 = await findAgent(id, store);
  if (!a0) throw httpError(404, 'Builder not found');
  const auth = await verifyAction(body, { action, builder: builderOf(a0), creator: a0.creator, lines }, { store });
  return withLock('agents', async () => {
    const a = await store.get(K.agent(a0.id));
    const out = await fn(a, auth);
    await store.set(K.agent(a.id), a);
    return out ?? { ok: true };
  });
}

export const setPaused = (id, body) => creatorAction(id, body, body?.paused ? 'pause' : 'resume', [], (a) => { a.paused = !!body.paused; });
export const retry = (id, body) => creatorAction(id, body, 'retry', [], (a) => { a.rawStatus = 'ACTIVE'; a.error = null; });

export async function setStrategy(id, body, store = getStore()) {
  const want = String(body?.strategy || '');
  return creatorAction(id, body, 'strategy', [`Strategy: ${want}`], async (a) => {
    if (want.startsWith('custom-')) {
      const c = await store.get(K.custom(a.creator));
      if (!c || c.id !== want) throw httpError(400, 'That custom strategy does not belong to this creator');
    } else if (!STRATEGIES.some((s) => s.id === want)) throw httpError(400, 'Unknown strategy');
    a.strategy = want;
  }, store);
}

export async function setOffice(id, body) {
  const n = Math.round(Number(body?.office));
  return creatorAction(id, body, 'office', [`Office: ${n}`], (a) => {
    const lvl = a.levelNo || 1;
    if (!(n >= 1 && n <= lvl)) throw httpError(400, 'That office unlocks at a higher level');
    a.office = n;
  });
}

export async function paperDeposit(id, body) {
  if (mode() !== 'paper') throw httpError(501, 'On-chain deposits are not wired in this build.');
  const v = Math.round(Number(body?.amountSol) * 1e4) / 1e4;
  if (!(v > 0 && v <= settings().maxPaperCapital)) throw httpError(400, 'Enter a paper amount');
  return creatorAction(id, body, 'paper-deposit', [`Amount: ${v} SOL (paper)`], (a) => {
    if (a.depositedSol - a.withdrawnSol + v > settings().maxPaperCapital * 2) throw httpError(400, 'Paper balance cap reached');
    a.cashSol += v; a.depositedSol += v;
    a.deposits.unshift({ ts: Date.now(), amount: v, from: a.creator, sig: null, kind: 'paper' });
    return { ok: true, amount: v, paper: true };
  });
}

export async function paperWithdraw(id, body, store = getStore()) {
  const all = !!body?.all;
  const amt = Math.round(Number(body?.amountSol) * 1e6) / 1e6;
  const line = `Amount: ${all ? 'all' : amt + ' SOL'}`;
  const market = await store.get(K.market);
  const { map } = priceFn(market);
  return creatorAction(id, body, 'withdraw', [line], async (a) => {
    let notes = [];
    if (all && a.positions.length) {
      const res = liquidate(a, { tokens: map, solUsd: market?.solUsd || 0, trading: TRADING, now: Date.now(), newId });
      Object.assign(a, res.agent);
      const feed = (await store.get(K.feed)) || [];
      for (const t of res.trades) feed.unshift(decorateTrade(t, a));
      await store.set(K.feed, feed.slice(0, FEED_MAX));
      notes.push(`Sold ${res.trades.length} open position${res.trades.length > 1 ? 's' : ''} first.`);
    }
    const amount = all ? a.cashSol : Math.min(amt, a.cashSol);
    if (!(amount > 0)) throw httpError(400, 'Nothing to withdraw');
    a.cashSol = Math.round((a.cashSol - amount) * 1e9) / 1e9;
    a.withdrawnSol += amount;
    a.withdrawals.unshift({ ts: Date.now(), amount, to: a.creator, sig: null, kind: a.mode === 'live' ? 'onchain' : 'paper' });
    if (all) a.paused = true;
    a.equity.push([Date.now(), equityOf(a, (m) => map.get(m)?.priceSol ?? null)]);
    return { ok: true, amount, sig: null, paper: a.mode !== 'live', notes };
  }, store);
}

// ── custom strategies ──
export async function getCustom(owner, store = getStore()) {
  if (!isAddress(owner)) throw httpError(400, 'Bad wallet address');
  return { strategy: customView(await store.get(K.custom(owner))) };
}

export async function saveCustom(body, store = getStore()) {
  const owner = body?.owner;
  if (!isAddress(owner)) throw httpError(400, 'Connect a wallet first');
  const name = cleanName(body.name);
  const { base, params } = sanitize(body.base, body.params);
  const reasons = riskReasons(base, params);
  let agent = null;
  if (body.applyTo) { agent = await findAgent(body.applyTo, store); if (!agent) throw httpError(404, 'Builder not found'); if (agent.creator !== owner) throw httpError(403, 'Only the creator can change this builder'); }
  await verifyAction(body, { action: 'custom-strategy', builder: agent ? agent.wallet : 'none', creator: owner, lines: [settingsLine(name, base, params), ...(reasons.length ? [CUSTOM_RISK_ACK] : [])] }, { store });
  const prev = await store.get(K.custom(owner));
  const doc = { id: customId(owner), owner, name, base, params, prompt: String(body.prompt || '').slice(0, 500), createdAt: prev?.createdAt || Date.now(), updatedAt: Date.now() };
  await store.set(K.custom(owner), doc);
  if (agent) await withLock('agents', async () => { const a = await store.get(K.agent(agent.id)); a.strategy = doc.id; await store.set(K.agent(a.id), a); });
  return { strategy: customView(doc) };
}

// Built-in reader for "describe your strategy in words" (no AI: keyword + number parsing)
export function promptStrategy(prompt) {
  const text = String(prompt || '').toLowerCase().slice(0, 1000);
  const understood = [], notes = [];
  let base = 'classic';
  if (/scalp|quick|fast|in and out/.test(text)) base = 'scalper';
  else if (/dip|pullback|pull back|retrace/.test(text)) base = 'dip';
  else if (/trend|momentum|ride|runner/.test(text)) base = 'trend';
  else if (/careful|selective|sniper|patient|strongest|only the best/.test(text)) base = 'sniper';
  understood.push(`Entry style: ${STRATEGIES.find((s) => s.id === base).name}`);
  const params = {};
  const n = (re) => { const m = text.match(re); return m ? Number(m[1].replace(',', '.')) : null; };
  const tp = n(/(?:take[- ]?profit|tp|sell (?:at|when up)|profit (?:at|of))\D{0,12}(\d+(?:[.,]\d+)?)\s*%/);
  if (tp != null) { params.takeProfitPct = tp / 100; understood.push(`Take profit at +${tp}%`); }
  const sl = n(/(?:stop[- ]?loss|sl|cut (?:losses )?at|max loss)\D{0,12}(\d+(?:[.,]\d+)?)\s*%/);
  if (sl != null) { params.stopLossPct = -sl / 100; understood.push(`Stop loss at −${sl}%`); }
  const size = n(/(\d+(?:[.,]\d+)?)\s*%\s*(?:of (?:the |my |its )?(?:sol|balance|capital)|per trade|each trade)/);
  if (size != null) { params.sizePct = size / 100; understood.push(`${size}% of the SOL per trade`); }
  const open = n(/(?:max(?:imum)?|up to|at most)\s*(\d+)\s*(?:open )?(?:positions|coins|tokens|trades at once)/);
  if (open != null) { params.maxOpen = open; understood.push(`Up to ${open} open positions`); }
  const hold = n(/(?:hold|close|exit)\D{0,20}(\d+)\s*(?:min|minutes|m\b)/);
  if (hold != null) { params.maxHoldMin = hold; understood.push(`Max hold ${hold} minutes`); }
  const cool = n(/cool ?down\D{0,10}(\d+)\s*(?:min|minutes|m\b)/);
  if (cool != null) { params.cooldownMin = cool; understood.push(`Cooldown ${cool} minutes`); }
  const trail = n(/trail(?:ing)?(?: stop)?\D{0,12}(\d+(?:[.,]\d+)?)\s*%/);
  if (trail != null) { params.trailBy = trail / 100; if (!params.trailAt) params.trailAt = Math.max(0.02, trail / 100 * 2); understood.push(`Trailing stop ${trail}% from the best point`); }
  const liq = text.match(/liquidity\D{0,15}\$?\s*(\d+(?:[.,]\d+)?)\s*(k|m)?/);
  if (liq) { const v = Number(liq[1].replace(',', '.')) * (liq[2] === 'm' ? 1e6 : liq[2] === 'k' ? 1e3 : 1); params.minLiquidityUsd = v; understood.push(`Min liquidity $${Math.round(v).toLocaleString('en')}`); }
  if (/new ?pairs|fresh (?:coins|launches)|just launched/.test(text)) notes.push('Brand-new pump.fun coins are not supported: the builder trades coins that already have a DEX pool.');
  const builtIn = STRATEGIES.find((s) => s.id === base);
  const name = (base === 'classic' ? 'My Blueprint' : 'My ' + builtIn.name).slice(0, 24);
  let clean;
  try { clean = sanitize(base, { ...defaultsFlat(builtIn), ...params }); } catch (e) { clean = { base, params: defaultsFlat(builtIn) }; notes.push(e.message); }
  return { base, params: clean.params, name, understood, notes, risks: riskReasons(base, clean.params) };
}
function defaultsFlat(b) {
  return { sizePct: b.sizePct, maxOpen: b.maxOpen, takeProfitPct: b.takeProfitPct, stopLossPct: b.stopLossPct, trailAt: b.trail?.at || 0, trailBy: b.trail?.by || 0.03, maxHoldMin: b.maxHoldMin || 0, cooldownMin: b.cooldownMin || 0, minLiquidityUsd: b.minLiquidityUsd, ...b.entry };
}

export async function getImage(id, store = getStore()) { return store.get(K.img(String(id))); }

export { K, CUSTOM_BASES, BRAND };
