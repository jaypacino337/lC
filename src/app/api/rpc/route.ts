import { config } from "@/lib/config";
import { err } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/ratelimit";

/** Browser -> Solana RPC proxy so a private RPC key (SOLANA_RPC_URL) never reaches the client. Allow-listed methods only. */
const ALLOWED = new Set(["getLatestBlockhash", "simulateTransaction", "sendTransaction", "getSignatureStatuses", "getBalance", "getFeeForMessage", "getMinimumBalanceForRentExemption", "getBlockHeight", "getAccountInfo", "getEpochInfo", "getGenesisHash", "getSlot", "getVersion"]);

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req, "rpc"), 120, 60_000).ok) return err("Too many RPC calls", 429);
  const body = (await req.json().catch(() => null)) as { method?: string } | { method?: string }[] | null;
  const calls = Array.isArray(body) ? body : [body];
  if (!body || calls.some((c) => !c?.method || !ALLOWED.has(c.method))) return err("RPC method not allowed", 403);
  const res = await fetch(config.solanaRpcUrl(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return new Response(await res.text(), { status: res.status, headers: { "Content-Type": "application/json" } });
}
