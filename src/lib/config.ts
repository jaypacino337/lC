/**
 * Central, typed access to environment configuration.
 * Everything here is server-only; never import this from a client component.
 */
export type Platform = "x" | "tiktok" | "instagram";
export const PLATFORMS: Platform[] = ["x", "tiktok", "instagram"];

function flag(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export const config = {
  appUrl: () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  isProd: () => process.env.NODE_ENV === "production",
  /** Global DRY_RUN switch. Defaults to ON: nothing is ever posted unless explicitly disabled. */
  dryRun: (platform?: Platform): boolean => {
    const global = flag("DRY_RUN", true);
    if (!platform) return global;
    const key = `${platform.toUpperCase()}_DRY_RUN`;
    return process.env[key] !== undefined && process.env[key] !== "" ? flag(key, true) : global;
  },
  cronSecret: () => process.env.CRON_SECRET || "",
  sessionSecret: () => process.env.SESSION_SECRET || "",
  anthropicKey: () => process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  pumpApiBase: () => (process.env.PUMP_API_BASE || "https://frontend-api-v3.pump.fun").replace(/\/$/, ""),
  dexApiBase: () => (process.env.DEXSCREENER_API_BASE || "https://api.dexscreener.com").replace(/\/$/, ""),
  /** Liquidity (USD) at which a non-pump.fun token counts as "graduated" (already on a real DEX). */
  minDexLiquidityUsd: () => int("GRADUATION_MIN_DEX_LIQUIDITY_USD", 10_000),
  mediaProvider: () => (process.env.MEDIA_PROVIDER || (process.env.FAL_KEY ? "fal" : "placeholder")) as "fal" | "placeholder",
  falKey: () => process.env.FAL_KEY || "",
  falImageModel: () => process.env.FAL_IMAGE_MODEL || "fal-ai/flux-pro/kontext",
  falPortraitModel: () => process.env.FAL_PORTRAIT_MODEL || "fal-ai/flux/dev",
  falVideoModel: () => process.env.FAL_VIDEO_MODEL || "fal-ai/kling-video/v2.1/standard/image-to-video",
  x: {
    clientId: () => process.env.X_CLIENT_ID || "",
    clientSecret: () => process.env.X_CLIENT_SECRET || "",
    dailyCap: () => int("X_DAILY_CAP", 17),
  },
  tiktok: {
    clientKey: () => process.env.TIKTOK_CLIENT_KEY || "",
    clientSecret: () => process.env.TIKTOK_CLIENT_SECRET || "",
    /** Until TikTok audits the app, every Direct Post is forced to SELF_ONLY (private). */
    audited: () => flag("TIKTOK_APP_AUDITED", false),
    /** TikTok's guidelines require express user consent per upload -> creator approves each post. */
    requireApproval: () => flag("TIKTOK_REQUIRE_APPROVAL", true),
    dailyCap: () => int("TIKTOK_DAILY_CAP", 15),
  },
  instagram: {
    appId: () => process.env.INSTAGRAM_APP_ID || "",
    appSecret: () => process.env.INSTAGRAM_APP_SECRET || "",
    reviewed: () => flag("META_APP_REVIEWED", false),
    graphVersion: () => process.env.INSTAGRAM_GRAPH_VERSION || "v23.0",
    dailyCap: () => int("INSTAGRAM_DAILY_CAP", 25),
  },
  solanaRpcUrl: () => process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  pumpIpfsUrl: () => process.env.PUMP_IPFS_URL || "https://pump.fun/api/ipfs",
  pumpPortalUrl: () => process.env.PUMPPORTAL_TRADE_LOCAL_URL || "https://pumpportal.fun/api/trade-local",
  /** Optional fallback IPFS pinning if pump.fun's upload endpoint is unavailable. */
  pinataJwt: () => process.env.PINATA_JWT || "",
  /** Enables /api/dev/* helpers (seeding). Always on outside production. */
  devRoutes: () => !config.isProd() || flag("ALLOW_DEV_ROUTES", false),
};

export function platformLabel(p: Platform): string {
  return p === "x" ? "X" : p === "tiktok" ? "TikTok" : "Instagram";
}
