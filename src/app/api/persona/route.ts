import { err, json } from "@/lib/http";
import { generatePersona } from "@/lib/content/persona";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sentence?: string; tokenName?: string; tokenSymbol?: string };
  const sentence = (body.sentence ?? "").trim();
  if (sentence.length < 4 || sentence.length > 300) return err("Describe your character in one sentence (4-300 characters).");
  if (!rateLimit(clientKey(req, "persona"), 12, 60_000).ok) return err("Too many generations, wait a minute.", 429);
  const res = await generatePersona({ sentence, tokenName: (body.tokenName ?? "").slice(0, 64) || "Token", tokenSymbol: (body.tokenSymbol ?? "").slice(0, 16) || "TOKEN" });
  if (!res.ok) return err(res.guard.reason ?? "Persona not allowed", 422, { blocked: true });
  return json({ character: res.character, source: res.source });
}
