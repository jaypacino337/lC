import { NextResponse } from "next/server";
import { clientIp, rateLimited } from "@/lib/http";
import { MINT_RE, store } from "@/lib/store";

/**
 * Brew step 1: pin the image + metadata to IPFS (Pinata) and ask PumpPortal
 * for an UNSIGNED create transaction. The brew is parked as "pending"; it only
 * becomes a batch once /api/send confirms the signed tx on-chain.
 *
 * The browser generated the mint keypair and Phantom holds the wallet key:
 * no private key ever reaches this server.
 *
 * Env: PINATA_JWT (server-only).
 */
export const runtime = "nodejs";

async function pin(file: Blob, name: string, jwt: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, name);
  form.append("network", "public");
  const res = await fetch("https://uploads.pinata.cloud/v3/files", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form });
  if (!res.ok) throw new Error(`IPFS upload failed (${res.status})`);
  const json = (await res.json()) as { data: { cid: string } };
  return `https://ipfs.io/ipfs/${json.data.cid}`;
}

const err = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) return err("The vat is sealed: launching isn’t configured on this server yet (PINATA_JWT missing).", 503);
  if (rateLimited(`create:${clientIp(req)}`, 6)) return err("Easy, the vat is still bubbling. Try again in a minute.", 429);

  const f = await req.formData();
  const str = (k: string) => String(f.get(k) ?? "").trim();
  const name = str("name"), symbol = str("symbol").replace(/^\$/, "").toUpperCase();
  const publicKey = str("publicKey"), mint = str("mint"), description = str("description").slice(0, 500);
  const image = f.get("image");
  const devBuy = Number(str("devBuy") || 0);
  if (!name || name.length > 32) return err("Name is required (max 32 characters).");
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return err("Ticker must be 1–10 letters or numbers.");
  if (!(image instanceof Blob) || image.size === 0) return err("The vat needs an image.");
  if (image.size > 4_000_000) return err("Image must be under 4 MB.");
  if (!image.type.startsWith("image/")) return err("That file isn’t an image.");
  if (!MINT_RE.test(publicKey) || !MINT_RE.test(mint)) return err("Connect Phantom first.");
  if (!Number.isFinite(devBuy) || devBuy < 0 || devBuy > 50) return err("Dev buy must be between 0 and 50 SOL.");

  try {
    const imageUrl = await pin(image, "image", jwt);
    const metadata = {
      name, symbol, description, image: imageUrl, showName: true, createdOn: "https://pump.fun",
      ...(str("twitter") ? { twitter: str("twitter") } : {}),
      ...(str("telegram") ? { telegram: str("telegram") } : {}),
      ...(str("website") ? { website: str("website") } : {}),
    };
    const uri = await pin(new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json", jwt);

    const tx = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey, action: "create", tokenMetadata: { name, symbol, uri }, mint,
        denominatedInSol: "true", amount: devBuy, slippage: 10, priorityFee: 0.0005, pool: "pump",
      }),
    });
    if (tx.status !== 200) return err(`PumpPortal: ${(await tx.text()).slice(0, 200)}`, 502);

    await store.putPending({ mint, creator: publicKey, name, symbol, image: imageUrl, description, devBuy, at: Date.now() });
    return NextResponse.json({ tx: Buffer.from(await tx.arrayBuffer()).toString("base64"), uri });
  } catch (e) {
    return err((e as Error).message, 502);
  }
}
