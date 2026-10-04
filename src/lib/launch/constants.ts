/** Shared (client + server) launch constants. */
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMPPORTAL_TRADE_LOCAL = "https://pumpportal.fun/api/trade-local";
export const PUMP_IPFS_URL = "https://pump.fun/api/ipfs";
/** PumpPortal charges 0.5% on Local Transaction API trades; for creation it applies only to the initial dev buy. */
export const PUMPPORTAL_FEE_PCT = 0.5;
export const MAX_DEV_BUY_SOL = 5;
export const DEFAULT_SLIPPAGE_PCT = 10;
export const DEFAULT_PRIORITY_FEE_SOL = 0.0005;
/** Rough network cost to create a pump.fun coin (rent for mint, metadata, bonding curve + tx fees). Shown as an estimate. */
export const EST_CREATE_NETWORK_COST_SOL = 0.025;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
