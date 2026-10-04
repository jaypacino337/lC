/* GET /api/sludge/board?limit=25
   Live scoreboard: pump.fun's top coins by market cap + coins currently live,
   priced on DexScreener and scored. Cached 60s at the edge. */
'use strict';
const L = require('../_lib/sludge');

module.exports = async (req, res) => {
  const limit = Math.max(5, Math.min(60, parseInt(L.query(req).get('limit'), 10) || 25));
  const sources = {};
  const [top, live] = await Promise.allSettled([L.pumpTop(50), L.pumpLive(50)]);
  sources.pumpTop = top.status === 'fulfilled' ? 'ok' : String(top.reason && top.reason.message);
  sources.pumpLive = live.status === 'fulfilled' ? 'ok' : String(live.reason && live.reason.message);

  const coins = new Map();
  for (const [r, tag] of [[top, 'top'], [live, 'live']]) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
    for (const c of r.value) if (c && c.mint && !coins.has(c.mint)) coins.set(c.mint, tag);
  }
  if (!coins.size) return L.send(res, 502, { error: 'pump.fun did not answer', sources });

  let pairs;
  try { pairs = await L.dexPairs([...coins.keys()]); sources.dexscreener = 'ok'; }
  catch (e) { return L.send(res, 502, { error: 'DexScreener did not answer', sources }); }

  const rows = [];
  for (const [mint, list] of coins) {
    const p = pairs[mint];
    if (!p) continue;
    const s = L.scorePair(p, { list });
    if (s.score != null) rows.push(s);
  }
  const rank = { KEEPS: 0, SIMMERING: 1, DISSOLVES: 2 };
  rows.sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.score - a.score);

  L.send(res, 200, {
    generatedAt: new Date().toISOString(),
    coinsRead: coins.size,
    scored: rows.length,
    sources,
    rows: rows.slice(0, limit)
  }, 60);
};
