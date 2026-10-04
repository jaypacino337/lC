import { and, eq, gt, isNull } from "drizzle-orm";
import { authNonces } from "@/lib/db/schema";
import { verifyWalletSignature } from "@/lib/auth/message";
import { createSession } from "@/lib/auth/session";
import { db, err, json } from "@/lib/http";

export async function POST(req: Request) {
  const { wallet, nonce, signature } = (await req.json().catch(() => ({}))) as { wallet?: string; nonce?: string; signature?: string };
  if (!wallet || !nonce || !signature) return err("Missing wallet, nonce or signature");
  const d = await db();
  const [row] = await d
    .select()
    .from(authNonces)
    .where(and(eq(authNonces.nonce, nonce), eq(authNonces.wallet, wallet), isNull(authNonces.usedAt), gt(authNonces.expiresAt, new Date())))
    .limit(1);
  if (!row) return err("Sign-in request expired. Try again.", 401);
  if (!verifyWalletSignature(row.message, signature, wallet)) return err("Signature does not match this wallet.", 401);
  await d.update(authNonces).set({ usedAt: new Date() }).where(eq(authNonces.nonce, nonce));
  await createSession(wallet);
  return json({ wallet });
}
