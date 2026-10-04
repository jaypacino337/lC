// Turns stored agent documents into the JSON shapes the page renders.
import { TRADING, LEVELS } from './config.js';
import { equityOf, pnlOf, levelFor } from './engine.js';

const UNRANKED = { elo: 1000, w: 0, l: 0, d: 0, duels: 0, peak: 1000, streak: 0, league: { name: 'Unranked', color: '#8A8A8A', no: 0 } };
const r6 = (x) => Math.round(x * 1e6) / 1e6;

export function priceFn(market) {
  const m = new Map((market?.tokens || []).map((t) => [t.mint, t]));
  return { map: m, priceOf: (mint) => m.get(mint)?.priceSol ?? null };
}

function sparkOf(equity, n = 44) {
  if (!equity?.length) return [];
  if (equity.length <= n) return equity.map((x) => x[1]);
  const out = [];
  for (let i = 0; i < n; i++) out.push(equity[Math.round((i * (equity.length - 1)) / (n - 1))][1]);
  return out;
}

export function statusOf(a, equity) {
  if (a.rawStatus && a.rawStatus !== 'ACTIVE') return a.rawStatus;
  if (a.paused) return 'PAUSED';
  if (!a.positions.length && equity < TRADING.minTradeSol + TRADING.minSolReserve) return 'LOW BALANCE';
  return 'ACTIVE';
}

export function agentSummary(a, market) {
  const { priceOf } = priceFn(market);
  const equity = equityOf(a, priceOf);
  const pnl = pnlOf(a, equity);
  const level = levelFor(Math.max(a.bestProfitSol || 0, pnl));
  return {
    id: a.id, no: a.no, name: a.name, avatarSeed: a.avatarSeed, wallet: a.wallet, creator: a.creator,
    skin: null, skins: [], baseSeed: a.baseSeed || a.avatarSeed, office: a.office || null, nft: null,
    strategy: a.strategy, level, coin: a.coin,
    balanceSol: r6(a.cashSol), equitySol: r6(equity), depositedSol: r6(a.depositedSol), pnlSol: r6(pnl),
    pnlPct: a.depositedSol > 0 ? r6(pnl / a.depositedSol) : 0,
    trades: a.stats.trades, openPositions: a.positions.length,
    winRate: a.stats.closedTrades ? r6(a.stats.wins / a.stats.closedTrades) : 0,
    status: statusOf(a, equity), paused: !!a.paused,
    feesKeptSol: 0, feesToCreatorSol: 0, flywheelSol: 0, flywheelTokens: 0,
    createdAt: a.createdAt, lastTradeAt: a.lastTradeAt || null, spark: sparkOf(a.equity),
    rank: UNRANKED, company: null, inDuel: false,
    mode: a.mode, paper: a.mode !== 'live',
  };
}

export function agentDetail(a, market, { custom = null, tickEveryMs = 60_000, lastTickAt = 0 } = {}) {
  const s = agentSummary(a, market);
  const { map } = priceFn(market);
  const positions = a.positions.map((p) => {
    const t = map.get(p.mint);
    const px = t?.priceSol ?? p.lastPriceSol ?? p.entryPriceSol;
    const valueSol = p.tokens * px;
    return {
      mint: p.mint, symbol: p.symbol, icon: p.icon, tokens: p.tokens, costSol: p.costSol, valueSol: r6(valueSol),
      entryPriceSol: p.entryPriceSol, priceSol: px, priceUsd: t?.priceUsd ?? null,
      pnlSol: r6(valueSol - p.costSol), pnlPct: p.costSol > 0 ? r6(valueSol / p.costSol - 1) : 0,
      change5m: t?.change5m ?? null, openedAt: p.openedAt, recovered: false, sellFails: 0, url: p.url, stale: !t,
    };
  });
  return {
    ...s,
    rawStatus: a.rawStatus || 'ACTIVE', error: a.error || null,
    requiredSol: 0, startingCapital: a.startingCapital, launchCostSol: 0, withdrawnSol: r6(a.withdrawnSol),
    realizedPnlSol: r6(a.stats.realizedPnlSol), closedTrades: a.stats.closedTrades, wins: a.stats.wins, feesPaidSol: r6(a.stats.feesSol),
    positions, history: a.history.slice(0, 100), decisions: a.decisions,
    deposits: a.deposits, withdrawals: a.withdrawals, feeClaims: [],
    equity: a.equity,
    nextDecisionAt: Math.max(Date.now(), (lastTickAt || Date.now()) + tickEveryMs), nextFeeClaimAt: null,
    rewards: [], flywheel: { pendingSol: 0, sol: 0, tokens: 0, burns: [] },
    customStrategy: custom, nftJob: null, market: null, sales: [], owners: [],
    arena: { rank: UNRANKED, current: null, open: [], history: [] },
    custody: a.mode === 'live' ? 'server keystore (AES-256-GCM encrypted)' : 'paper: no wallet, no keys, simulated SOL',
    x: { connected: false, enabled: false, settings: {}, posts: [], queued: [] },
  };
}

export function decorateTrade(t, a) {
  return { ...t, agentNo: a.no, agentName: a.name, avatarSeed: a.avatarSeed, coinTicker: a.coin?.ticker || null };
}

export function statsOf(agents, market, now = Date.now()) {
  const { priceOf } = priceFn(market);
  let aum = 0, pnl = 0, trades24h = 0, vol = 0, active = 0;
  for (const a of agents) {
    const eq = equityOf(a, priceOf);
    aum += eq; pnl += pnlOf(a, eq);
    if (statusOf(a, eq) === 'ACTIVE') active++;
    for (const t of a.history) { if (now - t.ts > 86_400_000) break; trades24h++; vol += t.sol; }
  }
  return {
    agentsActive: active, agentsTotal: agents.length, trades24h, volume24hSol: r6(vol), aumSol: r6(aum), pnlSol: r6(pnl),
    feesClaimedSol: 0, toCreatorsSol: 0, solUsd: market?.solUsd ?? null, tradingEnabled: true, marketReady: !!market?.ready,
  };
}

export { LEVELS };
