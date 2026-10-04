import { db, err, json, requireWallet } from "@/lib/http";
import { connectedPlatforms, listByOwner } from "@/lib/services/influencers";
import { registerInfluencer } from "@/lib/services/register";
import { isSolanaAddress } from "@/lib/solana/address";
import { lookupToken } from "@/lib/solana/token";

export async function GET() {
  const wallet = await requireWallet();
  if (typeof wallet !== "string") return wallet;
  const d = await db();
  const list = await listByOwner(d, wallet);
  const acc = await connectedPlatforms(d, list.map((i) => i.id));
  return json({ influencers: list.map((i) => ({ ...i, accounts: acc.get(i.id) ?? [] })) });
}

export async function POST(req: Request) {
  const wallet = await requireWallet();
  if (typeof wallet !== "string") return wallet;
  const body = (await req.json().catch(() => ({}))) as { mint?: string; personaPrompt?: string; character?: unknown; characterSource?: string };
  if (!body.mint || !isSolanaAddress(body.mint)) return err("Invalid token address");
  const token = await lookupToken(body.mint);
  if (!token) return err("Token not found on pump.fun or DexScreener.", 404);
  const res = await registerInfluencer(await db(), { wallet, token, personaPrompt: (body.personaPrompt ?? "").trim(), character: body.character, characterSource: body.characterSource });
  return res.ok ? json(res, 201) : err(res.error, res.status);
}
