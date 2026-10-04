/* GET /api/sludge/crawl
   CRAWL + DISTILL: read what is launching right now (pump.fun top + live,
   DexScreener boosted Solana tokens) and boil it down to the words that keep
   recurring. The brewer uses these as live seeds. Cached 5 min at the edge. */
'use strict';
const L = require('../_lib/sludge');

module.exports = async (req, res) => {
  const [top, live, boosts] = await Promise.allSettled([L.pumpTop(50), L.pumpLive(50), L.dexBoosts()]);
  const sources = {
    pumpTop: top.status === 'fulfilled' ? 'ok' : 'down',
    pumpLive: live.status === 'fulfilled' ? 'ok' : 'down',
    dexBoosts: boosts.status === 'fulfilled' ? 'ok' : 'down'
  };
  const coins = [];
  const seen = new Set();
  const add = (c) => { if (c.mint && !seen.has(c.mint)) { seen.add(c.mint); coins.push(c); } };
  for (const r of [top, live]) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
    for (const c of r.value) add({ mint: c.mint, name: c.name, symbol: c.symbol, description: c.description, mcap: c.usd_market_cap });
  }
  if (boosts.status === 'fulfilled' && Array.isArray(boosts.value)) {
    for (const b of boosts.value) {
      if (b.chainId !== 'solana') continue;
      add({ mint: b.tokenAddress, name: '', symbol: '', description: b.description, mcap: 0 });
    }
  }
  if (!coins.length) return L.send(res, 502, { error: 'No source answered.', sources });
  L.send(res, 200, {
    generatedAt: new Date().toISOString(),
    coinsRead: coins.length,
    sources,
    narratives: L.distill(coins, 12)
  }, 300);
};
