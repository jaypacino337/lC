import { eq } from "drizzle-orm";
import { posts } from "@/lib/db/schema";
import { db } from "@/lib/http";

/**
 * Serves a post's rendered media from OUR domain. TikTok's PULL_FROM_URL only accepts URLs under a
 * domain/URL prefix verified in the TikTok developer portal - verify `${APP_URL}/api/media/proxy/`.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  const d = await db();
  const [post] = await d.select({ mediaUrl: posts.mediaUrl }).from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post?.mediaUrl || !/^https:\/\//.test(post.mediaUrl)) return new Response("Not found", { status: 404 });
  const upstream = await fetch(post.mediaUrl);
  if (!upstream.ok || !upstream.body) return new Response("Upstream error", { status: 502 });
  return new Response(upstream.body, {
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "public, max-age=3600" },
  });
}
