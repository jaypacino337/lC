/**
 * Publisher: executes the scheduler's decisions.
 * For each due post: render media (async providers may take several runs), then either log the exact
 * requests that would be sent (DRY_RUN, default) or call the platform connector. Failures back off
 * exponentially; non-retryable errors fail fast and notify the creator.
 */
import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import type { DB } from "../db/client";
import { influencers, posts, socialAccounts, type Influencer, type Post } from "../db/schema";
import { config, platformLabel, type Platform } from "../config";
import { getMediaProvider, type MediaProvider } from "../media";
import { ConnectorError, getConnector, type FetchLike, type PublishInput, type TikTokSettings } from "../social";
import { MAX_ATTEMPTS, backoffMs, decide, type InfluencerState } from "../scheduler";
import { accountContext } from "./accounts";
import { notify } from "./notify";

export interface PublishReport {
  considered: number;
  published: number;
  dryRun: number;
  pendingMedia: number;
  deferred: number;
  failed: number;
  details: { postId: string; platform: string; outcome: string }[];
}

const SCENE_WORDS = ["street walk", "face cam", "gym", "road trip", "airport", "stage", "dance", "cooking", "night out", "camera roll"];

function absolute(url: string): string {
  return url.startsWith("/") ? `${config.appUrl()}${url}` : url;
}

export async function runPublish(db: DB, now = new Date(), f: FetchLike = fetch, provider: MediaProvider = getMediaProvider()): Promise<PublishReport> {
  const report: PublishReport = { considered: 0, published: 0, dryRun: 0, pendingMedia: 0, deferred: 0, failed: 0, details: [] };
  const due = await db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "queued"), lte(posts.scheduledFor, now)))
    .orderBy(posts.scheduledFor)
    .limit(200);
  report.considered = due.length;
  if (!due.length) return report;

  const infIds = [...new Set(due.map((p) => p.influencerId))];
  const infRows = await db.select().from(influencers).where(inArray(influencers.id, infIds));
  const accts = await db.select().from(socialAccounts).where(inArray(socialAccounts.influencerId, infIds));
  const history = await db
    .select({ influencerId: posts.influencerId, platform: posts.platform, postedAt: posts.postedAt })
    .from(posts)
    .where(and(inArray(posts.influencerId, infIds), or(eq(posts.status, "posted"), eq(posts.status, "dry_run")), gte(posts.postedAt, new Date(now.getTime() - 24 * 3600_000))));

  const infMap = new Map<string, Influencer>(infRows.map((i) => [i.id, i]));
  const state = new Map<string, InfluencerState>(
    infRows.map((i) => [
      i.id,
      { id: i.id, paused: i.paused, graduated: i.graduated, cadence: i.cadence, connected: Object.fromEntries(accts.filter((a) => a.influencerId === i.id).map((a) => [a.platform, true])) },
    ]),
  );
  const decision = decide(
    due.map((p) => ({ id: p.id, influencerId: p.influencerId, platform: p.platform as Platform, scheduledFor: p.scheduledFor, status: p.status, nextAttemptAt: p.nextAttemptAt })),
    state,
    history.filter((h) => h.postedAt).map((h) => ({ influencerId: h.influencerId, platform: h.platform as Platform, postedAt: h.postedAt as Date })),
    now,
    { dryRun: (p) => config.dryRun(p) },
  );

  for (const d of decision.deferred) {
    report.deferred++;
    report.details.push({ postId: d.postId, platform: due.find((p) => p.id === d.postId)?.platform ?? "?", outcome: `deferred: ${d.reason}` });
    if (d.skip) await db.update(posts).set({ status: "skipped", lastError: d.reason }).where(eq(posts.id, d.postId));
    else if (d.until) await db.update(posts).set({ nextAttemptAt: d.until, lastError: d.reason }).where(eq(posts.id, d.postId));
  }

  const byId = new Map(due.map((p) => [p.id, p]));
  for (const dp of decision.publish) {
    const post = byId.get(dp.id) as Post;
    const inf = infMap.get(post.influencerId) as Influencer;
    const outcome = await publishOne(db, post, inf, now, f, provider);
    report.details.push({ postId: post.id, platform: post.platform, outcome });
    if (outcome === "posted") report.published++;
    else if (outcome === "dry_run") report.dryRun++;
    else if (outcome === "pending_media" || outcome === "pending_platform") report.pendingMedia++;
    else report.failed++;
  }
  return report;
}

async function publishOne(db: DB, post: Post, inf: Influencer, now: Date, f: FetchLike, provider: MediaProvider): Promise<string> {
  const platform = post.platform as Platform;
  const connector = getConnector(platform);
  if (!connector) return "failed";
  const dry = config.dryRun(platform);
  try {
    // 1) Media
    let mediaUrl = post.mediaUrl;
    if (!mediaUrl && post.mediaType !== "none") {
      const step = await provider.render({
        kind: post.mediaType as "image" | "video",
        prompt: post.mediaPrompt,
        seed: inf.seed + post.slot,
        referenceImageUrl: inf.referenceImageUrl,
        job: (post.mediaJob as Record<string, unknown> | null)?.media as Record<string, unknown> | undefined,
        palette: inf.character.palette,
        scene: SCENE_WORDS.find((s) => post.mediaPrompt.toLowerCase().includes(s)),
        label: `${inf.character.name} · ${post.location ?? ""}`.slice(0, 32),
      });
      if (step.status === "pending") {
        await db.update(posts).set({ mediaJob: { ...(post.mediaJob ?? {}), media: step.job } }).where(eq(posts.id, post.id));
        return "pending_media";
      }
      if (step.status === "error") throw new ConnectorError(`media: ${step.error}`, 0, true);
      mediaUrl = step.url;
      await db.update(posts).set({ mediaUrl }).where(eq(posts.id, post.id));
    }
    const input: PublishInput = {
      caption: post.caption,
      mediaUrl: mediaUrl ? absolute(mediaUrl) : null,
      mediaType: post.mediaType as PublishInput["mediaType"],
      mediaIsReal: provider.real,
      tiktok: (post.tiktokSettings as TikTokSettings | null) ?? null,
      job: (post.mediaJob as Record<string, unknown> | null)?.publish as Record<string, unknown> | undefined,
    };
    // TikTok photo posts must be pulled from our verified domain.
    if (platform === "tiktok" && post.mediaType === "image" && mediaUrl) input.mediaUrl = `${config.appUrl()}/api/media/proxy/${post.id}`;

    const acct = (await db.select().from(socialAccounts).where(and(eq(socialAccounts.influencerId, inf.id), eq(socialAccounts.platform, platform))).limit(1))[0];

    // 2) DRY_RUN: record exactly what would be sent.
    if (dry) {
      const preview = connector.preview(input, { externalUserId: acct?.externalUserId ?? "<ig_user_id>", username: acct?.username ?? null });
      console.log(`[glowpad][DRY_RUN] ${platformLabel(platform)} post for $${inf.tokenSymbol}:`, JSON.stringify(preview));
      await db.update(posts).set({ status: "dry_run", postedAt: now, requestPreview: preview, attempts: post.attempts + 1, lastError: null }).where(eq(posts.id, post.id));
      return "dry_run";
    }
    if (!acct) throw new ConnectorError(`${platformLabel(platform)} account not connected`, 400, false);

    // 3) Real publish
    await db.update(posts).set({ status: "posting" }).where(eq(posts.id, post.id));
    const ctx = await accountContext(db, acct, f, now);
    const res = await connector.publish(input, ctx, f);
    if (res.status === "pending") {
      await db.update(posts).set({ status: "queued", mediaJob: { ...(post.mediaJob ?? {}), publish: res.job }, nextAttemptAt: new Date(now.getTime() + 2 * 60_000) }).where(eq(posts.id, post.id));
      return "pending_platform";
    }
    await db
      .update(posts)
      .set({ status: "posted", postedAt: now, externalId: res.externalId, externalUrl: res.url ?? null, attempts: post.attempts + 1, lastError: null, requestPreview: connector.preview(input, ctx) })
      .where(eq(posts.id, post.id));
    return "posted";
  } catch (e) {
    const err = e instanceof ConnectorError ? e : new ConnectorError(String((e as Error)?.message ?? e), 0, true);
    const attempts = post.attempts + 1;
    const giveUp = !err.retryable || attempts >= MAX_ATTEMPTS;
    await db
      .update(posts)
      .set({ status: giveUp ? "failed" : "queued", attempts, lastError: err.message.slice(0, 500), nextAttemptAt: giveUp ? null : new Date(now.getTime() + backoffMs(attempts)) })
      .where(eq(posts.id, post.id));
    if (giveUp) {
      await notify(db, { wallet: inf.ownerWallet, influencerId: inf.id, kind: "post_failed", title: `${platformLabel(platform)} post failed`, body: err.message.slice(0, 300) });
    }
    return giveUp ? "failed" : "retry";
  }
}
