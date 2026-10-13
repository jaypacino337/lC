import { NextResponse } from "next/server";
import { VersionedTransaction } from "@solana/web3.js";
import { connection } from "@/lib/chain";
import { clientIp, rateLimited } from "@/lib/http";
import { MINT_RE, store } from "@/lib/store";
import { isBrewCreate } from "@/lib/verify";

/**
 * Brew step 2: relay a fully-signed tx through the server RPC (keeps the RPC key
 * off the client) and confirm it. If it is the create tx of a pending brew, the
 * coin is logged as a batch, but only when the confirmed tx really is that brew:
 * signed by the mint keypair, paid for by the creator who started it, and
 * calling the pump.fun program.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (rateLimited(`send:${clientIp(req)}`, 12)) return NextResponse.json({ error: "Too many pours. Try again in a minute." }, { status: 429 });
  const { tx, mint } = (await req.json().catch(() => ({}))) as { tx?: string; mint?: string };
  if (!tx) return NextResponse.json({ error: "missing tx" }, { status: 400 });

  let raw: Buffer, msg: VersionedTransaction["message"];
  try {
    raw = Buffer.from(tx, "base64");
    msg = VersionedTransaction.deserialize(raw).message;
  } catch {
    return NextResponse.json({ error: "That isn’t a valid transaction." }, { status: 400 });
  }

  const conn = connection();
  try {
    const signature = await conn.sendRawTransaction(raw, { maxRetries: 3 });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) return NextResponse.json({ error: `Transaction failed: ${JSON.stringify(res.value.err)}`, signature }, { status: 502 });

    let logged = false;
    if (mint && MINT_RE.test(mint)) {
      const pending = await store.getPending(mint);
      if (pending && isBrewCreate(msg, mint, pending.creator)) {
        const { at: _brewedAt, ...brew } = pending;
        await store.addBatch({ ...brew, signature, at: Date.now() });
        await store.deletePending(mint);
        logged = true;
      }
    }
    return NextResponse.json({ signature, logged });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.split("\n")[0] }, { status: 502 });
  }
}
