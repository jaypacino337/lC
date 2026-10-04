// HTTP routing for every /api endpoint. Works with Node's http.IncomingMessage /
// ServerResponse (local dev server) and with Vercel's Node runtime (same objects).
import * as app from './app.js';
import { settings } from './config.js';
import { getStore } from './store.js';
import { httpError } from './auth.js';

const NOT_HERE = 'Not available in this build (paper mode). See README → "What is stubbed".';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;            // Vercel pre-parses JSON
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > 2_000_000) throw httpError(413, 'Request too large'); chunks.push(c); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError(400, 'Invalid JSON'); }
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function cronAuthorized(req, url) {
  const secret = settings().cronSecret;
  if (!secret) return !process.env.VERCEL; // without a secret only local runs may tick on demand
  const h = req.headers.authorization || '';
  return h === `Bearer ${secret}` || url.searchParams.get('secret') === secret;
}

async function stream(req, res) {
  const S = settings();
  const store = getStore();
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write(`retry: ${S.streamRetryMs}\n\n`);
  let lastTs = Number(req.headers['last-event-id']) || 0;
  let lastTick = -1;
  let closed = false;
  req.on('close', () => { closed = true; });
  const push = async () => {
    await app.maybeTick(store);
    const s = await app.getState(store);
    const tickAt = s.engine.lastTickAt || 0;
    if (tickAt === lastTick) { res.write(': ping\n\n'); return; }
    lastTick = tickAt;
    if (lastTs) for (const t of [...s.feed].reverse()) if (t.ts > lastTs) res.write(`event: trade\ndata: ${JSON.stringify(t)}\n\n`);
    const newest = s.feed[0]?.ts || lastTs || Date.now();
    lastTs = Math.max(lastTs, newest);
    res.write(`id: ${lastTs}\nevent: snapshot\ndata: ${JSON.stringify({ ...s, feed: undefined })}\n\n`);
  };
  try {
    await push();
    const until = Date.now() + S.streamHoldMs;
    while (!closed && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 3000));
      if (!closed) await push();
    }
  } catch (e) { if (!closed) res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`); }
  res.end();
}

const routes = [
  ['GET', /^\/state$/, async () => { await app.maybeTick(); return app.getState(); }],
  ['GET', /^\/agents\/([^/]+)$/, (m) => app.getAgentDetail(decodeURIComponent(m[1]))],
  ['GET', /^\/blockhash$/, async () => {
    const r = await fetch(settings().rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }) });
    const j = await r.json();
    if (!j.result?.value) throw httpError(502, 'RPC error');
    return { blockhash: j.result.value.blockhash, lastValidBlockHeight: j.result.value.lastValidBlockHeight };
  }],
  ['POST', /^\/launch\/prepare$/, (m, b) => app.prepareLaunch(b)],
  ['POST', /^\/launch\/([^/]+)\/image$/, () => ({ ok: true })],
  ['POST', /^\/launch\/([^/]+)\/funded$/, async (m) => ({ ok: true, status: (await app.getAgentDetail(m[1])).rawStatus })],
  ['POST', /^\/agents\/([^/]+)\/deposit$/, (m, b) => app.paperDeposit(m[1], b)],
  ['POST', /^\/agents\/([^/]+)\/withdraw$/, (m, b) => app.paperWithdraw(m[1], b)],
  ['POST', /^\/agents\/([^/]+)\/pause$/, (m, b) => app.setPaused(m[1], b)],
  ['POST', /^\/agents\/([^/]+)\/strategy$/, (m, b) => app.setStrategy(m[1], b)],
  ['POST', /^\/agents\/([^/]+)\/retry$/, (m, b) => app.retry(m[1], b)],
  ['POST', /^\/agents\/([^/]+)\/office$/, (m, b) => app.setOffice(m[1], b)],
  ['GET', /^\/custom-strategy\/([^/]+)$/, (m) => app.getCustom(decodeURIComponent(m[1]))],
  ['POST', /^\/custom-strategy$/, (m, b) => app.saveCustom(b)],
  ['POST', /^\/custom-strategy\/prompt$/, (m, b) => app.promptStrategy(b?.prompt)],
  ['GET', /^\/burns$/, () => ({ enabled: false, mint: null, pct: 0, totalSol: 0, totalTokens: 0, count: 0, queuedSol: 0, recent: [], agents: { totalSol: 0, totalTokens: 0, count: 0, queuedSol: 0, skinTokens: 0, skinBurns: 0 }, dev: { enabled: false }, burns: [], claims: [] })],
  ['GET', /^\/market$/, () => ({ enabled: false, listings: [], sales: [], refunds: [], listed: 0, sold: 0, volumeSol: 0 })],
  ['GET', /^\/arena$/, () => ({ open: [], live: [], done: [], summary: { enabled: false } })],
  ['GET', /^\/arena\/([^/]+)$/, () => { throw httpError(404, 'Duel not found'); }],
  ['GET', /^\/companies$/, () => ({ companies: [], summary: { enabled: false } })],
  ['GET', /^\/companies\/([^/]+)$/, () => { throw httpError(404, 'Company not found'); }],
  ['GET', /^\/agents\/([^/]+)\/(skin\/quote|market\/quote)$/, () => { throw httpError(501, NOT_HERE); }],
  ['POST', /^\/agents\/([^/]+)\/(skin|skin\/buy|skin\/hold|market\/list|market\/delist|market\/buy|nft\/mint|x\/connect|x\/settings|x\/disconnect|x\/post|arena\/challenge|company\/create)$/, () => { throw httpError(501, NOT_HERE); }],
  ['POST', /^\/arena\/([^/]+)\/(accept|cancel)$/, () => { throw httpError(501, NOT_HERE); }],
  ['POST', /^\/companies\/([^/]+)\/([a-z-]+)$/, () => { throw httpError(501, NOT_HERE); }],
  ['GET', /^\/health$/, async () => { const s = await app.getState(); return { ok: true, mode: s.config.mode, storage: s.config.storage, engine: s.engine, agents: s.agents.length }; }],
];

export async function handle(req, res, pathOverride) {
  const url = new URL(req.url, 'http://local');
  let path = pathOverride || url.searchParams.get('__p') || url.pathname;
  path = path.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  try {
    if (path === '/stream' && method === 'GET') return await stream(req, res);
    if (/^\/img\/[^/]+$/.test(path) && method === 'GET') {
      const data = await app.getImage(path.split('/').pop());
      const m = data && data.match(/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/);
      if (!m) return send(res, 404, { error: 'Not found' });
      res.statusCode = 200;
      res.setHeader('content-type', m[1]);
      res.setHeader('cache-control', 'public, max-age=86400, immutable');
      return res.end(Buffer.from(m[2], 'base64'));
    }
    if (path === '/tick') {
      if (!cronAuthorized(req, url)) return send(res, 401, { error: 'Unauthorized' });
      return send(res, 200, await app.tick({ force: url.searchParams.get('force') === '1' }));
    }
    for (const [m, re, fn] of routes) {
      const match = path.match(re);
      if (!match) continue;
      if (m !== method) continue;
      const body = method === 'POST' ? await readBody(req) : null;
      return send(res, 200, await fn(match, body, url));
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500 && status !== 501 && status !== 503) console.error('[api]', path, e);
    return send(res, status, { error: e.message || 'Server error' });
  }
}
