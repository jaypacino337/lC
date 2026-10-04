// Real market data: the token universe comes from pump.fun (top coins by market cap plus
// coins that just graduated), prices/liquidity/volume from DexScreener. Nothing here is
// simulated: the paper engine only simulates the fills.

const PUMP = 'https://frontend-api-v3.pump.fun';
const DEX = 'https://api.dexscreener.com';
const WSOL = 'So11111111111111111111111111111111111111112';
const SPARK_STEP_MS = 5 * 60_000;
const SPARK_POINTS = 12;

async function getJSON(url, timeoutMs = 7000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json', 'user-agent': 'foreman-bot/0.1' } });
    if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

export async function fetchPumpCoins() {
  const [top, bonded, active] = await Promise.allSettled([
    getJSON(`${PUMP}/coins?offset=0&limit=50&sort=market_cap&order=DESC&includeNsfw=false`),
    getJSON(`${PUMP}/coins?offset=0&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false&complete=true`),
    getJSON(`${PUMP}/coins?offset=0&limit=50&sort=last_trade_timestamp&order=DESC&includeNsfw=false&complete=true`),
  ]);
  const list = (x) => (x.status === 'fulfilled' && Array.isArray(x.value) ? x.value : []);
  return { top: [...list(top), ...list(active)], bonded: list(bonded), errors: [top, bonded, active].filter((x) => x.status === 'rejected').map((x) => String(x.reason?.message || x.reason)) };
}

// Fallback universe when pump.fun is unreachable (it blocks some datacenter IPs)
export async function fetchDexBoosted() {
  const lists = await Promise.all([`${DEX}/token-boosts/top/v1`, `${DEX}/token-boosts/latest/v1`].map((u) => getJSON(u).catch(() => [])));
  return [...new Set(lists.flatMap((rows) => (Array.isArray(rows) ? rows : [])).filter((r) => r.chainId === 'solana').map((r) => r.tokenAddress))];
}

// DexScreener: up to 30 mints per request. Returns the most liquid pair per mint.
export async function fetchDexPairs(mints) {
  const out = new Map();
  const uniq = [...new Set(mints.filter(Boolean))];
  const chunks = [];
  for (let i = 0; i < uniq.length; i += 30) chunks.push(uniq.slice(i, i + 30));
  const res = await Promise.allSettled(chunks.map((c) => getJSON(`${DEX}/tokens/v1/solana/${c.join(',')}`)));
  for (const r of res) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
    for (const p of r.value) {
      const mint = p?.baseToken?.address;
      if (!mint) continue;
      const prev = out.get(mint);
      if (!prev || (p.liquidity?.usd || 0) > (prev.liquidity?.usd || 0)) out.set(mint, p);
    }
  }
  return out;
}

export async function fetchSolUsd() {
  const pairs = await getJSON(`${DEX}/tokens/v1/solana/${WSOL}`).catch(() => []);
  const best = (Array.isArray(pairs) ? pairs : [])
    .filter((p) => p.baseToken?.address === WSOL && /^(USDC|USDT)$/.test(p.quoteToken?.symbol || ''))
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  const v = Number(best?.priceUsd);
  return v > 0 ? v : null;
}

const pctOf = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Number(x) / 100);

// One DexScreener pair -> the token row the page and the engine use
export function normalizePair(p, solUsd, now = Date.now(), pump = null) {
  const priceUsd = Number(p.priceUsd) || 0;
  return {
    mint: p.baseToken.address,
    symbol: p.baseToken.symbol || pump?.symbol || '?',
    name: p.baseToken.name || pump?.name || '',
    icon: p.info?.imageUrl || pump?.image_uri || null,
    dexId: p.dexId,
    url: p.url,
    pair: p.pairAddress,
    priceUsd,
    priceSol: solUsd > 0 ? priceUsd / solUsd : null,
    mcapUsd: Number(p.marketCap || p.fdv) || null,
    liquidityUsd: Number(p.liquidity?.usd) || 0,
    volume24hUsd: Number(p.volume?.h24) || 0,
    volume1hUsd: Number(p.volume?.h1) || 0,
    volume5mUsd: Number(p.volume?.m5) || 0,
    buys5m: p.txns?.m5?.buys ?? null,
    sells5m: p.txns?.m5?.sells ?? null,
    buys24h: p.txns?.h24?.buys ?? null,
    sells24h: p.txns?.h24?.sells ?? null,
    change5m: pctOf(p.priceChange?.m5),
    change1h: pctOf(p.priceChange?.h1),
    change6h: pctOf(p.priceChange?.h6),
    change24h: pctOf(p.priceChange?.h24),
    ageHours: p.pairCreatedAt ? (now - p.pairCreatedAt) / 3_600_000 : null,
    platformCoin: false,
  };
}

// One-sided order flow (thousands of buys, almost no sells) is a classic sign of fake volume
// or a token that cannot be sold. Builders skip those.
export function oneSided(t) {
  return t.buys24h != null && t.sells24h != null && t.buys24h > 1000 && t.sells24h < t.buys24h * 0.05;
}

export function isEligible(t, f) {
  return !!t.priceSol && !oneSided(t) && t.liquidityUsd >= f.minLiquidityUsd && t.volume24hUsd >= f.minVolume24hUsd
    && (t.mcapUsd || 0) >= f.minMcapUsd && (t.ageHours == null || t.ageHours >= f.minAgeHours);
}

// Keep a coarse price history per mint (one point per 5 minutes) for the sparklines
export function updateHistory(hist = {}, tokens, now = Date.now()) {
  const next = {};
  for (const t of tokens) {
    if (!(t.priceUsd > 0)) continue;
    const h = (hist[t.mint] || []).slice(-SPARK_POINTS);
    const last = h[h.length - 1];
    if (last && now - last[0] < SPARK_STEP_MS) h[h.length - 1] = [last[0], t.priceUsd];
    else h.push([now, t.priceUsd]);
    next[t.mint] = h.slice(-SPARK_POINTS);
  }
  return next;
}

// Full refresh. heldMints are always priced, even when they fall out of the universe.
export async function loadMarket({ heldMints = [], prev = null, filters, now = Date.now() }) {
  const errors = [];
  const [pump, solUsdNew] = await Promise.all([fetchPumpCoins(), fetchSolUsd()]);
  errors.push(...pump.errors);
  const solUsd = solUsdNew || prev?.solUsd || null;
  if (!solUsdNew) errors.push('SOL price unavailable' + (prev?.solUsd ? ' (using last known)' : ''));
  const pumpByMint = new Map([...pump.top, ...pump.bonded].map((c) => [c.mint, c]));
  // DexScreener's boosted Solana tokens widen the universe (and keep it alive when pump.fun blocks the server)
  const boosted = await fetchDexBoosted();
  const universe = [...new Set([...pumpByMint.keys(), ...boosted])].slice(0, 180);
  if (!pumpByMint.size && boosted.length) errors.push('pump.fun unreachable: using DexScreener boosted tokens only');
  const pairs = await fetchDexPairs([...universe, ...heldMints]);
  const tokens = [];
  for (const [mint, p] of pairs) {
    const t = normalizePair(p, solUsd, now, pumpByMint.get(mint));
    t.eligible = isEligible(t, filters);
    tokens.push(t);
  }
  const history = updateHistory(prev?.history, tokens, now);
  for (const t of tokens) t.spark = (history[t.mint] || []).map((x) => x[1]);
  const bonded = pump.bonded.slice(0, 12).map((c) => {
    const p = pairs.get(c.mint);
    return { mint: c.mint, ts: c.created_timestamp, name: c.name, symbol: c.symbol, image: c.image_uri || null, mcapUsd: Math.round((c.usd_market_cap || 0) * 100) / 100, liquidityUsd: Number(p?.liquidity?.usd) || 0, pool: 'pump-amm' };
  });
  return { ts: now, solUsd, tokens, bonded, history, errors, ready: tokens.length > 0 && solUsd > 0 };
}
