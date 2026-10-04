// Server configuration: environment flags + the trading rules the engine and the
// page share. Everything the browser sees goes through publicConfig().

const env = (k, d) => (process.env[k] == null || process.env[k] === '' ? d : process.env[k]);
const num = (k, d) => { const v = Number(env(k, d)); return Number.isFinite(v) ? v : d; };
const bool = (k, d = false) => { const v = env(k, null); return v == null ? d : /^(1|true|yes|on)$/i.test(String(v)); };

export const BRAND = { name: 'FOREMAN', ticker: 'FOREMAN', actionHeader: 'FOREMAN action' };

// LIVE_TRADING must be explicitly "true" AND the live prerequisites must be present.
// Anything else = paper mode (simulated fills on real prices).
export function liveRequested() { return bool('LIVE_TRADING', false); }
export function liveReady() {
  return liveRequested() && !!env('WALLET_ENCRYPTION_KEY', null) && !!env('SOLANA_RPC_URL', null);
}
export const mode = () => (liveReady() ? 'live' : 'paper');

export const settings = () => ({
  tickEveryMs: num('TICK_EVERY_MS', 60_000),
  autoTick: bool('AUTO_TICK', true),                 // tick lazily when the page is read and the last tick is stale
  streamHoldMs: num('STREAM_HOLD_MS', process.env.VERCEL ? 0 : 25_000),
  streamRetryMs: num('STREAM_RETRY_MS', 5_000),
  maxAgents: num('MAX_AGENTS', 200),
  maxAgentsPerCreator: num('MAX_AGENTS_PER_CREATOR', 5),
  maxPaperCapital: num('MAX_PAPER_CAPITAL_SOL', 100),
  cronSecret: env('CRON_SECRET', null),
  siteUrl: env('SITE_URL', ''),
  xUrl: env('X_URL', ''),
  contractAddress: env('CONTRACT_ADDRESS', ''),
  rpcUrl: env('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com'),
  marketTtlMs: num('MARKET_TTL_MS', 45_000),
});

export const TRADING = {
  tradeSizePct: 0.1,
  maxOpenPositions: 3,
  stopLossPct: -0.2,
  takeProfitPct: 0.4,
  minSolReserve: 0.03,
  minTradeSol: 0.02,
  maxTradeSol: null,
  slippagePct: 15,
  priorityFeeSol: 0.0002,     // charged on every paper fill, like a real swap would be
  baseFeeSol: 0.000005,
  poolFeePct: 0.003,          // DEX pool fee applied to every paper fill
  staleAfterMs: 30 * 60_000,  // a held token with no price for this long is sold at its last price
};

export const FILTERS = { minLiquidityUsd: 30000, minVolume24hUsd: 50000, minMcapUsd: 50000, minAgeHours: 1 };

export const LEVELS = [
  { no: 1, name: 'Apprentice', minProfitSol: 0, color: '#8E9199', rewardSol: 0 },
  { no: 2, name: 'Bricklayer', minProfitSol: 0.1, color: '#2F6FE0', rewardSol: 0 },
  { no: 3, name: 'Carpenter', minProfitSol: 0.5, color: '#16A34A', rewardSol: 0 },
  { no: 4, name: 'Site Lead', minProfitSol: 1.5, color: '#8B5CF6', rewardSol: 0 },
  { no: 5, name: 'Architect', minProfitSol: 4, color: '#F2B705', rewardSol: 0 },
  { no: 6, name: 'Master Builder', minProfitSol: 20, color: '#151515', rewardSol: 0 },
];

// Built-in strategies (same shape the page renders). The engine reads entry/exit numbers from here.
export const STRATEGIES = [
  { id: 'classic', name: 'Blueprint', tagline: 'Balanced all-rounder', goal: 'The standard plan: momentum and dip entries, locks in gains when the trend fades.', risk: null, maxTradeSol: null, sizePct: 0.1, maxOpen: 3, takeProfitPct: 0.4, stopLossPct: -0.2, trail: null, maxHoldMin: null, cooldownMin: 0, minLiquidityUsd: 30000, entry: {}, safety: null },
  { id: 'scalper', name: 'Riveter', tagline: 'Fast momentum', goal: 'Many quick, short trades on tokens with active momentum. In fast, out fast.', risk: null, maxTradeSol: null, sizePct: 0.1, maxOpen: 2, takeProfitPct: 0.06, stopLossPct: -0.03, trail: { at: 0.04, by: 0.02 }, maxHoldMin: 10, cooldownMin: 10, minLiquidityUsd: 30000, entry: { minVol5mUsd: 15000, minChange5m: 0.03 }, safety: null },
  { id: 'trend', name: 'Highrise', tagline: 'Momentum rider', goal: 'Climbs with stronger moves and holds them longer, floor by floor.', risk: null, maxTradeSol: null, sizePct: 0.15, maxOpen: 2, takeProfitPct: 0.15, stopLossPct: -0.06, trail: { at: 0.1, by: 0.05 }, maxHoldMin: 60, cooldownMin: 0, minLiquidityUsd: 50000, entry: { minVol1hUsd: 100000 }, safety: null },
  { id: 'dip', name: 'Excavator', tagline: 'Dig the dips', goal: 'Digs into pullbacks after a run instead of chasing green candles.', risk: null, maxTradeSol: null, sizePct: 0.12, maxOpen: 2, takeProfitPct: 0.1, stopLossPct: -0.05, trail: { at: 0.07, by: 0.03 }, maxHoldMin: 30, cooldownMin: 0, minLiquidityUsd: 40000, entry: { minRun1h: 0.1, pullbackMin: 0.07, pullbackMax: 0.15, bounceFromLow: 0.02 }, safety: null },
  { id: 'sniper', name: 'Surveyor', tagline: 'Measures twice', goal: 'Measures every setup twice: trades less often and only enters the strongest ones.', risk: null, maxTradeSol: null, sizePct: 0.2, maxOpen: 1, takeProfitPct: 0.12, stopLossPct: -0.05, trail: { at: 0.08, by: 0.04 }, maxHoldMin: 45, cooldownMin: 20, minLiquidityUsd: 50000, entry: { minVol5mUsd: 25000, minChange5m: 0.03, maxChange5m: 0.12, maxSpike5m: 0.2 }, safety: null },
];
export const DEFAULT_STRATEGY = 'classic';

export const LAUNCH = {
  minStartingCapital: 0.2,
  maxStartingCapital: null,
  capitalPresets: [0.5, 1, 2.5, 5],
  defaultStartingCapital: 1,
  launchReserveSol: 0,
  devBuySol: 0,
  fundingTimeoutMs: 30 * 60_000,
};

export function publicConfig({ storage = 'memory', customStrategies = [] } = {}) {
  const s = settings();
  const m = mode();
  return {
    mode: m,
    paper: m === 'paper',
    brand: BRAND,
    storage,
    storageWarning: storage === 'memory' && process.env.VERCEL
      ? 'Demo storage: no database is configured, so builders reset whenever the server restarts.'
      : null,
    trading: { ...TRADING },
    brain: { decisionEveryMs: [s.tickEveryMs, s.tickEveryMs], maxTokensShown: 15 },
    launch: { ...LAUNCH, maxStartingCapital: m === 'paper' ? s.maxPaperCapital : LAUNCH.maxStartingCapital, launchReserveSol: m === 'paper' ? 0 : 0.05 },
    fees: { claimEveryMs: 0, minClaimSol: 0, creatorSharePct: 0 },
    xPosting: { enabled: false },
    filters: { ...FILTERS },
    tradingEnabled: true,
    launchEnabled: true,
    levels: LEVELS,
    rewards: { enabled: false, payTo: 'creator', wallet: null, balanceSol: 0, paidSol: 0, pending: 0, recent: [] },
    defaultStrategy: DEFAULT_STRATEGY,
    strategies: STRATEGIES,
    skins: { enabled: false, items: [] },
    flywheel: { enabled: false },
    customStrategies,
    customEnabled: true,
    promptAi: false,
    market: { enabled: false },
    arena: { enabled: false },
    companies: { enabled: false, tiers: [], leagues: [] },
    ranks: { start: 1000, leagues: [] },
    agentNft: { enabled: false },
    siteUrl: s.siteUrl,
    contractAddress: s.contractAddress,
    xUrl: s.xUrl,
    tickEveryMs: s.tickEveryMs,
  };
}
