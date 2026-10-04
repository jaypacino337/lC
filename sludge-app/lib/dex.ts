/**
 * DexScreener public API (no key, ~60 req/min). Every number on the launchpad
 * comes from here, never invented. Shapes verified 2026-10.
 */
export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  volume?: { h24?: number; h1?: number };
  txns?: { h24?: { buys: number; sells: number } };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string; header?: string; socials?: { type: string; url: string }[]; websites?: { url: string }[] };
}

export interface Token {
  address: string;
  name: string;
  symbol: string;
  image: string | null;
  priceUsd: number | null;
  change24h: number | null;
  change1h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  liquidity: number | null;
  buys24h: number | null;
  sells24h: number | null;
  createdAt: number | null;
  /** "curve" = still on pump.fun bonding curve; "dex" = graduated / other DEX */
  stage: "curve" | "dex";
  dexId: string;
  url: string;
}

const API = "https://api.dexscreener.com";

async function get<T>(path: string, revalidate = 30): Promise<T> {
  const res = await fetch(API + path, { next: { revalidate }, headers: { accept: "application/json" } } as RequestInit);
  if (!res.ok) throw new Error(`DexScreener ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

/** Most liquid pair per token. */
function best(pairs: DexPair[]): Map<string, DexPair> {
  const out = new Map<string, DexPair>();
  for (const p of pairs) {
    const cur = out.get(p.baseToken.address);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) out.set(p.baseToken.address, p);
  }
  return out;
}

function toToken(p: DexPair, fallbackImage?: string): Token {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v != null && Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    address: p.baseToken.address,
    name: p.baseToken.name,
    symbol: p.baseToken.symbol,
    image: p.info?.imageUrl ?? fallbackImage ?? null,
    priceUsd: num(p.priceUsd),
    change24h: num(p.priceChange?.h24),
    change1h: num(p.priceChange?.h1),
    marketCap: num(p.marketCap ?? p.fdv),
    volume24h: num(p.volume?.h24),
    liquidity: num(p.liquidity?.usd),
    buys24h: p.txns?.h24?.buys ?? null,
    sells24h: p.txns?.h24?.sells ?? null,
    createdAt: p.pairCreatedAt ?? null,
    stage: p.dexId === "pumpfun" ? "curve" : "dex",
    dexId: p.dexId,
    url: p.url,
  };
}

/** Enrich up to 30 addresses per call with live pair data. */
export async function tokensByAddress(addresses: string[], images: Record<string, string> = {}): Promise<Token[]> {
  const out: Token[] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    const pairs = await get<DexPair[]>(`/tokens/v1/solana/${addresses.slice(i, i + 30).join(",")}`);
    for (const [addr, p] of best(pairs)) out.push(toToken(p, images[addr]));
  }
  return out;
}

type Listing = { chainId: string; tokenAddress: string; icon?: string };

export async function listTokens(kind: "trending" | "new", limit = 30): Promise<Token[]> {
  const list = await get<Listing[]>(kind === "trending" ? "/token-boosts/top/v1" : "/token-profiles/latest/v1");
  const sol = [...new Map(list.filter((t) => t.chainId === "solana").map((t) => [t.tokenAddress, t])).values()].slice(0, limit);
  const images = Object.fromEntries(sol.filter((t) => t.icon).map((t) => [t.tokenAddress, t.icon!]));
  const tokens = await tokensByAddress(sol.map((t) => t.tokenAddress), images);
  // keep listing order
  const order = new Map(sol.map((t, i) => [t.tokenAddress, i]));
  return tokens.sort((a, b) => (order.get(a.address) ?? 0) - (order.get(b.address) ?? 0));
}

export function fmtUsd(n: number | null, compact = true): string {
  if (n === null) return "—";
  if (!compact) return n < 0.01 ? `$${n.toPrecision(3)}` : `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function fmtAge(ts: number | null): string {
  if (!ts) return "—";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}
