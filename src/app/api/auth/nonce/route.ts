import { authNonces, users } from "@/lib/db/schema";
import { buildSignInMessage } from "@/lib/auth/message";
import { randomToken } from "@/lib/crypto";
import { db, err, json } from "@/lib/http";
import { isSolanaAddress } from "@/lib/solana/address";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const { wallet } = (await req.json().catch(() => ({}))) as { wallet?: string };
  if (!wallet || !isSolanaAddress(wallet)) return err("Invalid wallet address");
  if (!rateLimit(clientKey(req, "nonce"), 20, 60_000).ok) return err("Too many requests", 429);
  const nonce = randomToken(16);
  const domain = new URL(req.url).host;
  const message = buildSignInMessage({ domain, wallet, nonce, issuedAt: new Date().toISOString() });
  const d = await db();
  await d.insert(users).values({ wallet }).onConflictDoNothing();
  await d.insert(authNonces).values({ nonce, wallet, message, expiresAt: new Date(Date.now() + 5 * 60_000) });
  return json({ nonce, message });
}
