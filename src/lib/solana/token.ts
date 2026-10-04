/**
 * Token lookups against pump.fun's public frontend API and DexScreener, plus graduation detection.
 * Pure detection logic (`detectGraduation`) is separated from I/O so it can be unit tested.
 */
import { config } from "../config";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PumpCoin {
  mint: string;
  name: string;
  symbol: string;
  image_uri?: string;
  description?: string;
  complete?: boolean;
  raydium_pool?: string | null;
  pump_swap_pool?: string | null;
  program?: string;
  protocol?: string;
  usd_market_cap?: number;
  real_token_reserves?: number;
  creator?: string;
  twitter?: string | null;
  website?: string | null;
}

export interface DexPair {
  chainId: string;
  dexId: string;
  url?: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  info?: { imageUrl?: string };
}

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  source: "pump" | "dex";
  marketCapUsd: number | null;
  pump: PumpCoin | null;
  pairs: DexPair[];
}

export interface GraduationResult {
  graduated: boolean;
  reason: string;
  /** 0-100 bonding-curve progress for pump.fun coins (100 once graduated); null if unknown. */
  progress: number | null;
}

/** pump.fun bonding curves start with ~793.1M tokens available for sale (6 decimals). */
export const PUMP_INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000;
const NON_DEX_IDS = new Set(["pumpfun", "pump.fun", "moonshot", "launchlab"]);

export function isPumpCoin(c: PumpCoin | null): boolean {
  return !!c && (c.program === "pump" || c.protocol === "pump" || c.mint.endsWith("pump"));
}

export function bondingProgress(c: PumpCoin): number | null {
  if (c.complete) return 100;
  if (typeof c.real_token_reserves !== "number") return null;
  const p = 100 - (c.real_token_reserves * 100) / PUMP_INITIAL_REAL_TOKEN_RESERVES;
  return Math.max(0, Math.min(100, Math.round(p * 10) / 10));
}

export function detectGraduation(pump: PumpCoin | null, pairs: DexPair[], minDexLiquidityUsd = 10_000): GraduationResult {
  const dexPools = pairs.filter((p) => p.chainId === "solana" && !NON_DEX_IDS.has(p.dexId.toLowerCase()));
  if (pump && isPumpCoin(pump)) {
    const progress = bondingProgress(pump);
    if (pump.complete) return { graduated: true, reason: "pump.fun bonding curve complete", progress: 100 };
    if (pump.pump_swap_pool) return { graduated: true, reason: "migrated to PumpSwap pool", progress: 100 };
    if (pump.raydium_pool) return { graduated: true, reason: "migrated to Raydium pool", progress: 100 };
    const migrated = dexPools.find((p) => ["pumpswap", "raydium"].includes(p.dexId.toLowerCase()));
    if (migrated) return { graduated: true, reason: `DexScreener shows a ${migrated.dexId} pool`, progress: 100 };
    return { graduated: false, reason: "still on the pump.fun bonding curve", progress };
  }
  const liquid = dexPools.find((p) => (p.liquidity?.usd ?? 0) >= minDexLiquidityUsd);
  if (liquid) {
    return { graduated: true, reason: `trading on ${liquid.dexId} with $${Math.round(liquid.liquidity?.usd ?? 0).toLocaleString("en-US")} liquidity`, progress: 100 };
  }
  return {
    graduated: false,
    reason: dexPools.length ? `DEX liquidity below $${minDexLiquidityUsd.toLocaleString("en-US")}` : "no DEX pool found yet",
    progress: null,
  };
}

async function getJson<T>(f: FetchLike, url: string): Promise<{ status: number; data: T | null }> {
  try {
    const res = await f(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    return { status: 0, data: null };
  }
}

/** pump.fun coin lookup. `/coins-v2/<mint>` is the live route; `/coins/<mint>` is tried as a fallback. */
export async function fetchPumpCoin(mint: string, f: FetchLike = fetch): Promise<PumpCoin | null> {
  const base = config.pumpApiBase();
  for (const path of [`/coins-v2/${mint}`, `/coins/${mint}`]) {
    const { data } = await getJson<PumpCoin>(f, base + path);
    if (data && typeof data === "object" && data.mint === mint) return data;
  }
  return null;
}

export async function fetchDexPairs(mint: string, f: FetchLike = fetch): Promise<DexPair[]> {
  const { data } = await getJson<DexPair[] | { pairs?: DexPair[] }>(f, `${config.dexApiBase()}/tokens/v1/solana/${mint}`);
  if (!data) return [];
  const pairs = Array.isArray(data) ? data : data.pairs ?? [];
  return pairs.filter((p) => p.baseToken?.address === mint || (p as unknown as { quoteToken?: { address: string } }).quoteToken?.address === mint);
}

export async function lookupToken(mint: string, f: FetchLike = fetch): Promise<TokenInfo | null> {
  const [pump, pairs] = await Promise.all([fetchPumpCoin(mint, f), fetchDexPairs(mint, f)]);
  const best = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  if (pump && isPumpCoin(pump)) {
    return {
      mint,
      name: pump.name,
      symbol: pump.symbol,
      image: pump.image_uri || best?.info?.imageUrl || null,
      source: "pump",
      marketCapUsd: pump.usd_market_cap ?? best?.marketCap ?? null,
      pump,
      pairs,
    };
  }
  if (best) {
    const tok = best.baseToken.address === mint ? best.baseToken : { name: pump?.name ?? "", symbol: pump?.symbol ?? "" };
    return {
      mint,
      name: tok.name,
      symbol: tok.symbol,
      image: best.info?.imageUrl ?? pump?.image_uri ?? null,
      source: "dex",
      marketCapUsd: best.marketCap ?? best.fdv ?? null,
      pump,
      pairs,
    };
  }
  return null;
}
