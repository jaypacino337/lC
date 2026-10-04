import { config } from "@/lib/config";
import { db, err, json, requireWallet } from "@/lib/http";
import { fetchParsedTransaction, verifyLaunchTx } from "@/lib/launch/verify";
import { registerInfluencer } from "@/lib/services/register";
import { isSolanaAddress } from "@/lib/solana/address";

/** Verifies the launch transaction on-chain, then registers the token + influencer. */
export async function POST(req: Request) {
  const wallet = await requireWallet();
  if (typeof wallet !== "string") return wallet;
  const b = (await req.json().catch(() => ({}))) as {
    signature?: string; mint?: string; name?: string; symbol?: string; image?: string | null; personaPrompt?: string; character?: unknown; characterSource?: string;
  };
  if (!b.signature || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(b.signature)) return err("Invalid transaction signature");
  if (!b.mint || !isSolanaAddress(b.mint)) return err("Invalid mint");
  let tx = null;
  for (let i = 0; i < 5 && !tx; i++) {
    try {
      tx = await fetchParsedTransaction(b.signature, config.solanaRpcUrl());
    } catch (e) {
      console.warn("[glowpad] getTransaction failed", e);
    }
    if (!tx) await new Promise((r) => setTimeout(r, 2000));
  }
  const v = verifyLaunchTx(tx, { mint: b.mint, creator: wallet, signature: b.signature });
  if (!v.ok) return err(`Launch could not be verified: ${v.reason}`, 422);
  const res = await registerInfluencer(await db(), {
    wallet,
    token: { mint: b.mint, name: (b.name ?? "").slice(0, 32), symbol: (b.symbol ?? "").slice(0, 10), image: b.image ?? null, source: "pump", marketCapUsd: null, pump: null, pairs: [] },
    personaPrompt: (b.personaPrompt ?? "").trim(),
    character: b.character,
    characterSource: b.characterSource,
  });
  return res.ok ? json({ ...res, verified: v.reason }, 201) : err(res.error, res.status);
}
