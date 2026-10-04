import { config } from "@/lib/config";
import { db, err, json } from "@/lib/http";
import { getInfluencerByMint } from "@/lib/services/influencers";
import { isSolanaAddress } from "@/lib/solana/address";
import { detectGraduation, lookupToken } from "@/lib/solana/token";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export async function GET(req: Request, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  if (!isSolanaAddress(mint)) return err("That doesn't look like a Solana token address.");
  if (!rateLimit(clientKey(req, "token"), 60, 60_000).ok) return err("Too many lookups, slow down.", 429);
  const token = await lookupToken(mint);
  if (!token) return err("Token not found on pump.fun or DexScreener. Check the address (new coins can take a minute to index).", 404);
  const existing = await getInfluencerByMint(await db(), mint);
  const graduation = detectGraduation(token.pump, token.pairs, config.minDexLiquidityUsd());
  return json({
    token: { mint, name: token.name, symbol: token.symbol, image: token.image, source: token.source, marketCapUsd: token.marketCapUsd },
    graduation,
    existing: existing ? { slug: existing.slug } : null,
  });
}
