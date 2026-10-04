import { config } from "@/lib/config";
import { err, json, requireWallet } from "@/lib/http";
import { MetadataFields, buildIpfsForm, validateImage } from "@/lib/launch/payload";
import { clientKey, rateLimit } from "@/lib/ratelimit";

/** Proxies the token image + metadata to pump.fun's IPFS endpoint (falls back to Pinata when PINATA_JWT is set). */
export async function POST(req: Request) {
  const wallet = await requireWallet();
  if (typeof wallet !== "string") return wallet;
  const rl = rateLimit(clientKey(req, `ipfs:${wallet}`), 5, 10 * 60_000);
  if (!rl.ok) return err(`Too many uploads. Try again in ${rl.retryAfterSec}s.`, 429);
  const form = await req.formData().catch(() => null);
  if (!form) return err("Expected multipart form data");
  const file = form.get("file");
  const imgErr = validateImage(file instanceof Blob ? { type: file.type, size: file.size } : null);
  if (imgErr) return err(imgErr);
  const fields = MetadataFields.safeParse({
    name: form.get("name"),
    symbol: form.get("symbol"),
    description: form.get("description") ?? "",
    twitter: form.get("twitter") ?? "",
    telegram: form.get("telegram") ?? "",
    website: form.get("website") ?? "",
  });
  if (!fields.success) return err(`Invalid token details: ${fields.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`);
  const image = file as Blob;
  try {
    const res = await fetch(config.pumpIpfsUrl(), { method: "POST", body: buildIpfsForm(fields.data, image), signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const j = (await res.json()) as { metadataUri?: string; metadata?: { image?: string } };
      if (j.metadataUri) return json({ metadataUri: j.metadataUri, image: j.metadata?.image ?? null, via: "pump.fun" });
    }
    console.warn("[glowpad] pump.fun IPFS upload failed", res.status);
  } catch (e) {
    console.warn("[glowpad] pump.fun IPFS upload error", e);
  }
  const jwt = config.pinataJwt();
  if (!jwt) return err("pump.fun's metadata upload is unavailable right now. (Operators: set PINATA_JWT for a fallback.)", 502);
  const pin = async (blob: Blob, name: string) => {
    const fd = new FormData();
    fd.append("network", "public");
    fd.append("file", blob, name);
    const r = await fetch("https://uploads.pinata.cloud/v3/files", { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: fd });
    if (!r.ok) throw new Error(`pinata ${r.status}`);
    return `https://ipfs.io/ipfs/${((await r.json()) as { data: { cid: string } }).data.cid}`;
  };
  try {
    const imageUri = await pin(image, "image");
    const f = fields.data;
    const meta = { name: f.name, symbol: f.symbol.toUpperCase(), description: f.description, image: imageUri, showName: true, twitter: f.twitter || undefined, telegram: f.telegram || undefined, website: f.website || undefined };
    const metadataUri = await pin(new Blob([JSON.stringify(meta)], { type: "application/json" }), "metadata.json");
    return json({ metadataUri, image: imageUri, via: "pinata" });
  } catch (e) {
    return err(`Metadata upload failed: ${(e as Error).message}`, 502);
  }
}
