import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { influencers, posts, type Influencer } from "../db/schema";
import { config } from "../config";
import { draftDay, planSlots, todayUtc } from "../content/planner";
import { newId } from "./ids";

export interface PlanReport {
  date: string;
  influencers: number;
  created: number;
  filtered: number;
}

export async function planInfluencerDay(db: DB, inf: Influencer, date: string, notBefore?: Date): Promise<{ created: number; filtered: number }> {
  const wanted = planSlots(inf, date).filter((s) => !notBefore || s.scheduledFor.getTime() >= notBefore.getTime());
  if (!wanted.length) return { created: 0, filtered: 0 };
  const existing = await db.select({ platform: posts.platform, slot: posts.slot }).from(posts).where(and(eq(posts.influencerId, inf.id), eq(posts.planDate, date)));
  const have = new Set(existing.map((e) => `${e.platform}|${e.slot}`));
  const missing = wanted.filter((w) => !have.has(`${w.platform}|${w.slot}`));
  if (!missing.length) return { created: 0, filtered: 0 };
  const drafts = await draftDay(inf, date, missing);
  const needsApproval = config.tiktok.requireApproval();
  const rows = drafts.map((d) => ({
    id: newId(),
    influencerId: inf.id,
    platform: d.platform,
    planDate: date,
    slot: d.slot,
    scheduledFor: d.scheduledFor,
    status: (d.platform === "tiktok" && needsApproval ? "awaiting_approval" : "queued") as "queued" | "awaiting_approval",
    caption: d.caption,
    mediaPrompt: d.mediaPrompt,
    mediaType: d.mediaType,
    location: d.location,
    source: d.source,
  }));
  if (rows.length) await db.insert(posts).values(rows).onConflictDoNothing();
  return { created: rows.length, filtered: drafts.filter((d) => d.filtered).length };
}

export async function runPlanner(db: DB, now = new Date(), opts: { influencerId?: string; date?: string } = {}): Promise<PlanReport> {
  const date = opts.date ?? todayUtc(now);
  const list = opts.influencerId
    ? await db.select().from(influencers).where(eq(influencers.id, opts.influencerId))
    : await db.select().from(influencers).where(eq(influencers.paused, false));
  const report: PlanReport = { date, influencers: 0, created: 0, filtered: 0 };
  for (const inf of list) {
    const r = await planInfluencerDay(db, inf, date);
    report.influencers++;
    report.created += r.created;
    report.filtered += r.filtered;
  }
  return report;
}
