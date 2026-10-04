import { config } from "@/lib/config";
import { err, json, requireWallet } from "@/lib/http";
import { CreateTxRequest, buildCreatePayload } from "@/lib/launch/payload";
import { clientKey, rateLimit } from "@/lib/ratelimit";

/**
 * Asks PumpPortal's Local Transaction API for an UNSIGNED create transaction.
 * Only public keys are sent; the browser signs with the mint keypair and the user's wallet.
 */
export async function POST(req: Request) {
  const wallet = await requireWallet();
  if (typeof wallet !== "string") return wallet;
  if (!rateLimit(clientKey(req, `tx:${wallet}`), 10, 10 * 60_000).ok) return err("Too many requests", 429);
  const parsed = CreateTxRequest.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(`Invalid launch request: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`);
  if (parsed.data.publicKey !== wallet) return err("The signing wallet must be the wallet you're signed in with.", 403);
  let payload;
  try {
    payload = buildCreatePayload(parsed.data);
  } catch (e) {
    return err((e as Error).message);
  }
  const res = await fetch(config.pumpPortalUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return err(`PumpPortal could not build the transaction (${res.status}): ${(await res.text()).slice(0, 200)}`, 502);
  const bytes = Buffer.from(await res.arrayBuffer());
  return json({ tx: bytes.toString("base64"), payload });
}
