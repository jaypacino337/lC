import { avatarSvg } from "@/lib/art/avatar";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const seed = Number(q.get("seed")) || 1;
  const palette = (q.get("palette") ?? "").split(",").filter((h) => /^#[0-9a-fA-F]{6}$/.test(h));
  const svg = avatarSvg({ seed, palette, size: 640, scene: q.get("scene") ?? undefined, label: q.get("label")?.slice(0, 32) || undefined });
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400, immutable" } });
}
