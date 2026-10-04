import { err, json, requireOwner } from "@/lib/http";
import { getAccount, publicAccount } from "@/lib/services/accounts";
import { postsFor, updateSettings } from "@/lib/services/influencers";
import { connectors } from "@/lib/social";
import { config, PLATFORMS } from "@/lib/config";
import { getMediaProvider } from "@/lib/media";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const o = await requireOwner((await ctx.params).id);
  if (o instanceof Response) return o;
  const { inf, d } = o;
  const accounts = await Promise.all(
    PLATFORMS.map(async (p) => {
      const a = await getAccount(d, inf.id, p);
      const c = connectors[p];
      return {
        platform: p,
        connected: !!a,
        account: a ? publicAccount(a) : null,
        configured: c.configured(),
        approvalNotice: c.approvalNotice(),
        dryRun: config.dryRun(p),
        unlocked: p === "x" || inf.graduated,
        creator: p === "tiktok" && a ? ((a.meta as { creator?: unknown })?.creator ?? null) : undefined,
      };
    }),
  );
  const posts = await postsFor(d, inf.id, undefined, 150);
  const provider = getMediaProvider();
  return json({
    influencer: inf,
    accounts,
    posts,
    system: { dryRun: config.dryRun(), mediaProvider: provider.name, mediaReal: provider.real, tiktokAudited: config.tiktok.audited(), tiktokApproval: config.tiktok.requireApproval(), metaReviewed: config.instagram.reviewed() },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const o = await requireOwner((await ctx.params).id);
  if (o instanceof Response) return o;
  const body = (await req.json().catch(() => ({}))) as { paused?: boolean; cadence?: unknown };
  if (body.paused === undefined && !body.cadence) return err("Nothing to update");
  const inf = await updateSettings(o.d, o.inf.id, body);
  return json({ influencer: inf });
}
