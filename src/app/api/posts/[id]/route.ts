import { eq } from "drizzle-orm";
import { posts } from "@/lib/db/schema";
import { config, type Platform } from "@/lib/config";
import { checkCaption, withAiDisclosure } from "@/lib/guard";
import { db, err, json, requireOwner } from "@/lib/http";
import { getAccount } from "@/lib/services/accounts";

type Body = {
  action?: "approve" | "skip" | "edit" | "retry";
  caption?: string;
  tiktok?: { privacyLevel?: string; allowComment?: boolean; allowDuet?: boolean; allowStitch?: boolean; consent?: boolean };
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = await db();
  const [post] = await d.select().from(posts).where(eq(posts.id, id)).limit(1);
  if (!post) return err("Post not found", 404);
  const o = await requireOwner(post.influencerId);
  if (o instanceof Response) return o;
  const body = (await req.json().catch(() => ({}))) as Body;
  const platform = post.platform as Platform;

  let caption = post.caption;
  if (typeof body.caption === "string" && body.caption.trim() && body.caption !== post.caption) {
    const check = checkCaption(body.caption.replace(/\$[A-Za-z][A-Za-z0-9]{0,11}\b/g, ""));
    if (!check.ok) return err(`Caption blocked: ${check.reason}`, 422);
    caption = withAiDisclosure(platform, body.caption);
  }

  switch (body.action) {
    case "skip":
      await d.update(posts).set({ status: "skipped", lastError: "skipped by creator" }).where(eq(posts.id, id));
      break;
    case "retry":
      if (post.status !== "failed") return err("Only failed posts can be retried");
      await d.update(posts).set({ status: post.platform === "tiktok" && !post.approvedAt ? "awaiting_approval" : "queued", attempts: 0, nextAttemptAt: null, lastError: null }).where(eq(posts.id, id));
      break;
    case "edit":
      if (!["queued", "awaiting_approval"].includes(post.status)) return err("Only upcoming posts can be edited");
      await d.update(posts).set({ caption }).where(eq(posts.id, id));
      break;
    case "approve": {
      if (platform !== "tiktok" || post.status !== "awaiting_approval") return err("Only TikTok posts awaiting approval can be approved");
      const t = body.tiktok ?? {};
      if (!t.consent) return err("Confirm consent to upload to TikTok (Music Usage Confirmation).");
      if (!t.privacyLevel) return err("Choose who can view this TikTok post.");
      const acct = await getAccount(d, o.inf.id, "tiktok");
      const options = ((acct?.meta as { creator?: { privacy_level_options?: string[] } })?.creator?.privacy_level_options ?? null) as string[] | null;
      if (options && !options.includes(t.privacyLevel)) return err("That privacy option isn't available for this TikTok account.");
      const privacyLevel = config.tiktok.audited() ? t.privacyLevel : "SELF_ONLY";
      await d
        .update(posts)
        .set({
          caption,
          status: "queued",
          approvedAt: new Date(),
          tiktokSettings: { privacyLevel, disableComment: !t.allowComment, disableDuet: !t.allowDuet, disableStitch: !t.allowStitch },
        })
        .where(eq(posts.id, id));
      break;
    }
    default:
      return err("Unknown action");
  }
  const [updated] = await d.select().from(posts).where(eq(posts.id, id)).limit(1);
  return json({ post: updated });
}
