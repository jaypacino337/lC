/* ============================================================================
   SLUDGE — shared server code for the /api/sludge/* Vercel functions.

   Sources (all free, public, no keys):
     pump.fun frontend API  — top coins by market cap, coins currently live
     DexScreener public API — pairs (volume, liquidity, mcap, txns, age), boosts

   The score is deliberately simple and fully explained in the response: every
   point a coin earns or loses comes back as a labelled line item. Nothing here
   signs, sends or holds anything — read-only market data in, JSON out.
   ========================================================================== */
'use strict';

const PUMP = 'https://frontend-api-v3.pump.fun';
const DEX = 'https://api.dexscreener.com';
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function getJSON(url, timeoutMs = 4500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { accept: 'application/json', 'user-agent': 'sludge-site/1.0 (+read-only market data)' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + new URL(url).host);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/* ── sources ──────────────────────────────────────────────────────────────── */
const pumpTop = (limit = 50) =>
  getJSON(`${PUMP}/coins?offset=0&limit=${limit}&sort=market_cap&order=DESC&includeNsfw=false`);
const pumpLive = (limit = 50) =>
  getJSON(`${PUMP}/coins/currently-live?offset=0&limit=${limit}&includeNsfw=false`);
const dexBoosts = () => getJSON(`${DEX}/token-boosts/top/v1`);

/** DexScreener pairs for up to N mints, batched 30 per call. Returns {mint: bestPair}. */
async function dexPairs(mints) {
  const out = {};
  const uniq = [...new Set(mints.filter((m) => MINT_RE.test(m)))];
  const batches = [];
  for (let i = 0; i < uniq.length; i += 30) batches.push(uniq.slice(i, i + 30));
  const results = await Promise.allSettled(
    batches.map((b) => getJSON(`${DEX}/tokens/v1/solana/${b.join(',')}`))
  );
  for (const r of results) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
    for (const p of r.value) {
      const mint = p && p.baseToken && p.baseToken.address;
      if (!mint) continue;
      const liq = (p.liquidity && p.liquidity.usd) || 0;
      const cur = out[mint];
      if (!cur || liq > ((cur.liquidity && cur.liquidity.usd) || 0)) out[mint] = p;
    }
  }
  return out;
}

/* ── scoring ──────────────────────────────────────────────────────────────── */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : x != null && isFinite(+x) ? +x : null);
const r1 = (x) => Math.round(x * 10) / 10;

function fmtUsd(v) {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}
function fmtAge(h) {
  if (h == null) return '—';
  if (h < 1) return Math.round(h * 60) + 'm';
  if (h < 48) return Math.round(h) + 'h';
  return Math.round(h / 24) + 'd';
}

/** Pull the numbers the score uses out of a DexScreener pair. */
function metricsFromPair(p, now = Date.now()) {
  const vol = num(p.volume && p.volume.h24);
  const liq = num(p.liquidity && p.liquidity.usd);
  const mcap = num(p.marketCap) != null ? num(p.marketCap) : num(p.fdv);
  const tx = (p.txns && p.txns.h24) || {};
  const buys = num(tx.buys), sells = num(tx.sells);
  const created = num(p.pairCreatedAt);
  return {
    volume24h: vol,
    liquidityUsd: liq,
    marketCapUsd: mcap,
    mcapToLiq: mcap != null && liq ? mcap / liq : null,
    volToLiq: vol != null && liq ? vol / liq : null,
    ageHours: created ? Math.max(0, (now - created) / 36e5) : null,
    buys24h: buys,
    sells24h: sells,
    priceChange24h: num(p.priceChange && p.priceChange.h24),
    priceUsd: num(p.priceUsd)
  };
}

/**
 * Score 0–100 from market metrics. Returns the total plus a line item for
 * every component, so the UI can show exactly why a coin got its number.
 *
 *   VOLUME     0–35  log scale, $1K/24h → 0, $10M/24h → 35
 *   LIQUIDITY  0–25  log scale, ~$3K → 0, ~$3M → 25
 *   TURNOVER   0–15  24h volume ÷ liquidity; 0.3×–8× is healthy, >30× smells of wash trading
 *   AGE        0–15  log scale up to 30 days — surviving is a signal
 *   FLOW       0–10  share of 24h txns that are sells; 35–65% is two-sided, <5% is one-way
 *   INFLATED   −20   market cap > 60× liquidity (−8 when > 30×): the price is thin air
 *
 * Verdict: ≥65 KEEPS, 40–64 SIMMERING, <40 DISSOLVES. Any red flag (inflated,
 * wash-trade risk, one-way flow, dead pool) caps the verdict at SIMMERING.
 */
function scoreMetrics(m) {
  const parts = [];
  const flags = [];
  let redFlags = 0;
  const red = (t) => { redFlags++; flags.push({ level: 'red', text: t }); };
  const amber = (t) => flags.push({ level: 'amber', text: t });
  if (m.liquidityUsd == null || m.liquidityUsd <= 0 || m.volume24h == null) {
    return {
      score: null, verdict: 'UNSCORED', parts, flags: [{ level: 'amber', text: 'No DEX liquidity data — nothing honest to score.' }]
    };
  }

  const volPts = clamp01((Math.log10(Math.max(m.volume24h, 1)) - 3) / 4) * 35;
  parts.push({ k: 'VOLUME', points: r1(volPts), max: 35, detail: fmtUsd(m.volume24h) + ' traded in 24h' });

  const liqPts = clamp01((Math.log10(m.liquidityUsd) - 3.5) / 3) * 25;
  parts.push({ k: 'LIQUIDITY', points: r1(liqPts), max: 25, detail: fmtUsd(m.liquidityUsd) + ' in the pool' });

  const t = m.volToLiq || 0;
  let turnPts;
  if (t < 0.3) turnPts = 15 * (t / 0.3);
  else if (t <= 8) turnPts = 15;
  else turnPts = 15 * clamp01(1 - Math.log10(t / 8));      // 80× → 0
  parts.push({ k: 'TURNOVER', points: r1(turnPts), max: 15, detail: r1(t) + '× pool turned over in 24h' });
  if (t > 30) red('Wash-trade risk: volume is ' + Math.round(t) + '× liquidity.');
  if (m.volume24h < 1000) red('Dead pool: under $1K traded in 24h.');
  else if (t < 0.1) amber('Sleepy: volume is under 0.1× liquidity.');

  const h = m.ageHours;
  const agePts = h == null ? 0 : clamp01(Math.log10(h + 1) / Math.log10(24 * 30 + 1)) * 15;
  parts.push({ k: 'AGE', points: r1(agePts), max: 15, detail: h == null ? 'pair age unknown' : fmtAge(h) + ' old' });
  if (h != null && h < 1) amber('Fresh: under an hour old, nothing proven yet.');

  let flowPts = 0, flowDetail = 'no 24h transactions';
  const b = m.buys24h || 0, s = m.sells24h || 0;
  if (b + s > 0) {
    const share = s / (b + s);
    if (share < 0.05) flowPts = 0;
    else if (share < 0.35) flowPts = 10 * ((share - 0.05) / 0.3);
    else if (share <= 0.65) flowPts = 10;
    else flowPts = 10 * clamp01((0.95 - share) / 0.3);
    flowDetail = Math.round(share * 100) + '% of ' + (b + s).toLocaleString('en-US') + ' txns were sells';
    if (share < 0.05 && b + s > 50) red('One-way flow: almost nobody is selling. Check whether they can.');
    if (share > 0.8) amber('Exit queue: sells dominate.');
  }
  parts.push({ k: 'FLOW', points: r1(flowPts), max: 10, detail: flowDetail });

  const ratio = m.mcapToLiq;
  let pen = 0;
  if (ratio != null && ratio > 60) {
    pen = -20;
    red('INFLATED: market cap is ' + Math.round(ratio) + '× liquidity — the price is thin air.');
  } else if (ratio != null && ratio > 30) {
    pen = -8;
    amber('Thin: market cap is ' + Math.round(ratio) + '× liquidity.');
  }
  parts.push({
    k: 'INFLATION', points: pen, max: 0,
    detail: ratio == null ? 'mcap/liquidity unknown' : 'mcap is ' + r1(ratio) + '× liquidity (penalty above 30×, heavy above 60×)'
  });

  const raw = parts.reduce((a, p) => a + p.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  // a red flag caps the verdict: a big number cannot launder a broken market
  let verdict = score >= 65 ? 'KEEPS' : score >= 40 ? 'SIMMERING' : 'DISSOLVES';
  if (redFlags && verdict === 'KEEPS') verdict = 'SIMMERING';
  return { score, verdict, parts, flags };
}

function scorePair(p, extra) {
  const m = metricsFromPair(p);
  const s = scoreMetrics(m);
  return Object.assign({
    mint: p.baseToken.address,
    name: String(p.baseToken.name || '').slice(0, 40),
    symbol: String(p.baseToken.symbol || '').slice(0, 16),
    dex: p.dexId || null,
    pairUrl: p.url || null,
    pumpUrl: /pump$/.test(p.baseToken.address) ? 'https://pump.fun/coin/' + p.baseToken.address : null,
    metrics: m
  }, s, extra || {});
}

/* ── narrative distillation ───────────────────────────────────────────────── */
const STOP = new Set(('the and for you your are was with this that from have not but all just coin coins token ' +
  'tokens pump fun sol solana meme memecoin official community first only new get its our will can has who what ' +
  'when one two now out more most into been about there their they them then than been here like make made very ' +
  'project buy sell hold holders moon launch launched dev devs https http www com twitter tiktok telegram ' +
  'live stream streaming join chart ca contract address supply burn burned lp locked renounced ' +
  'test testing yes not lol https also every day time real world best big top built bringing through ' +
  'where which while would could should being over under after before into onto than that these those ' +
  'own way via per any each such other some many much really still even back down well need want ' +
  'see look going know think people anyone everyone something nothing website site www app').split(/\s+/));

/** Words that keep recurring across what is launching. Names and tickers count
    3×, descriptions 1× — no market-cap weighting, so one inflated coin (and its
    copycats) cannot buy the narrative. */
function distill(coins, max = 12) {
  const words = new Map();
  const toks = (t) => String(t || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 14 && !STOP.has(w));
  for (const c of coins) {
    const head = new Set(toks(c.name + ' ' + c.symbol));
    const body = new Set(toks((c.description || '').slice(0, 160)));
    for (const w of new Set([...head, ...body])) {
      // count each ticker once: twenty clones of one coin are one narrative, not twenty
      const sym = String(c.symbol || c.mint || '').trim().toUpperCase();
      const e = words.get(w) || { word: w, syms: new Set(), weight: 0, examples: [] };
      if (e.syms.has(sym)) continue;
      e.syms.add(sym);
      e.weight += head.has(w) ? 3 : 1;
      if (e.examples.length < 3 && c.symbol) e.examples.push(String(c.symbol).trim());
      words.set(w, e);
    }
  }
  return [...words.values()]
    .filter((e) => e.syms.size >= 2)
    .sort((a, b) => b.weight - a.weight || b.syms.size - a.syms.size)
    .slice(0, max)
    .map((e) => ({ word: e.word, count: e.syms.size, weight: e.weight, examples: e.examples }));
}

/* ── http helpers (plain Node req/res — works on Vercel and in a local server) ─ */
function send(res, status, body, cacheSeconds) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader(
    'cache-control',
    status === 200 && cacheSeconds
      ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 5}`
      : 'no-store'
  );
  res.end(JSON.stringify(body));
}
const query = (req) => new URL(req.url, 'http://localhost').searchParams;

module.exports = {
  MINT_RE, pumpTop, pumpLive, dexBoosts, dexPairs,
  metricsFromPair, scoreMetrics, scorePair, distill, send, query, fmtUsd
};
