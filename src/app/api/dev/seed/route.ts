import { config } from "@/lib/config";
import { db, err, json } from "@/lib/http";
import { generatePersona } from "@/lib/content/persona";
import { registerInfluencer } from "@/lib/services/register";
import { isSolanaAddress } from "@/lib/solana/address";
import { lookupToken } from "@/lib/solana/token";

/** Development helper: create an influencer for a mint without the browser flow. Disabled in production unless ALLOW_DEV_ROUTES=true. */
export async function POST(req: Request) {
  if (!config.devRoutes()) return err("Not found", 404);
  const b = (await req.json().catch(() => ({}))) as { mint?: string; wallet?: string; sentence?: string };
  if (!b.mint || !isSolanaAddress(b.mint) || !b.wallet || !isSolanaAddress(b.wallet)) return err("mint and wallet required");
  const token = await lookupToken(b.mint);
  if (!token) return err("token not found", 404);
  const sentence = b.sentence ?? "a moth who is obsessed with ring lights and late-night diners";
  const p = await generatePersona({ sentence, tokenName: token.name, tokenSymbol: token.symbol });
  if (!p.ok) return err(p.guard.reason ?? "blocked", 422);
  const res = await registerInfluencer(await db(), { wallet: b.wallet, token, personaPrompt: sentence, character: p.character, characterSource: p.source });
  return res.ok ? json(res, 201) : err(res.error, res.status);
}
