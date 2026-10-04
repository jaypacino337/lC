import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { backoffMs, decide, type DuePost, type InfluencerState, type PlatformLimits } from "@/lib/scheduler";
import { computeSlots, planSlots } from "@/lib/content/planner";
import { clampCadence } from "@/lib/content/cadence";
import type { Platform } from "@/lib/config";
import { createInfluencer } from "@/lib/services/influencers";
import { runPlanner } from "@/lib/services/planner";
import { runPublish } from "@/lib/services/publisher";
import { templateCharacter } from "@/lib/content/persona";
import { placeholderProvider } from "@/lib/media/placeholder";
import { influencers, posts } from "@/lib/db/schema";
import { mockFetch, testDb } from "./helpers";

const now = new Date("2030-03-01T12:00:00Z");
const limits: Record<Platform, PlatformLimits> = {
  x: { dailyCap: 17, minSpacingMinutes: 30, perRunMax: 2 },
  tiktok: { dailyCap: 15, minSpacingMinutes: 60, perRunMax: 5 },
  instagram: { dailyCap: 25, minSpacingMinutes: 60, perRunMax: 10 },
};
const inf = (over: Partial<InfluencerState> = {}): InfluencerState => ({ id: "i1", paused: false, graduated: false, cadence: { x: 4, tiktok: 3, instagram: 3 }, connected: { x: true }, ...over });
const due = (id: string, platform: Platform, minsAgo = 5, influencerId = "i1"): DuePost => ({ id, influencerId, platform, scheduledFor: new Date(now.getTime() - minsAgo * 60_000), status: "queued", nextAttemptAt: null });
const run = (d: DuePost[], s: InfluencerState[], history: { influencerId: string; platform: Platform; postedAt: Date }[] = [], dryRun = false) =>
  decide(d, new Map(s.map((x) => [x.id, x])), history, now, { dryRun: () => dryRun, limits });

describe("cadence", () => {
  it("clamps creator cadence into per-platform bounds", () => {
    expect(clampCadence({ x: 99, tiktok: 0, instagram: "4" })).toEqual({ x: 8, tiktok: 1, instagram: 4 });
  });
  it("spreads N slots across the day in order", () => {
    const slots = computeSlots(6, "2030-03-01", 42);
    expect(slots).toHaveLength(6);
    for (let i = 1; i < slots.length; i++) expect(slots[i].getTime()).toBeGreaterThan(slots[i - 1].getTime());
    expect(slots[0].getUTCHours()).toBeGreaterThanOrEqual(7);
    expect(slots[5].getUTCHours()).toBeLessThanOrEqual(23);
  });
  it("plans X only before graduation and all three after", () => {
    const base = { id: "a", tokenSymbol: "M", character: templateCharacter({ sentence: "a moth", tokenName: "M", tokenSymbol: "MOTH" }), seed: 1, paused: false, cadence: { x: 5, tiktok: 3, instagram: 4 } };
    expect(new Set(planSlots({ ...base, graduated: false }, "2030-03-01").map((s) => s.platform))).toEqual(new Set(["x"]));
    const all = planSlots({ ...base, graduated: true }, "2030-03-01");
    expect(all.filter((s) => s.platform === "x")).toHaveLength(5);
    expect(all.filter((s) => s.platform === "tiktok")).toHaveLength(3);
    expect(all.filter((s) => s.platform === "instagram")).toHaveLength(4);
    expect(planSlots({ ...base, graduated: true, paused: true }, "2030-03-01")).toHaveLength(0);
  });
});

describe("scheduler decisions", () => {
  it("publishes one due post per influencer+platform per run (spacing)", () => {
    const d = run([due("a", "x", 50), due("b", "x", 10)], [inf()]);
    expect(d.publish.map((p) => p.id)).toEqual(["a"]);
    expect(d.deferred[0].reason).toMatch(/spacing/);
  });
  it("respects the creator cadence as a rolling 24h cap", () => {
    const history = [1, 2, 3, 4].map((h) => ({ influencerId: "i1", platform: "x" as Platform, postedAt: new Date(now.getTime() - h * 3 * 3600_000) }));
    const d = run([due("a", "x")], [inf()], history);
    expect(d.publish).toHaveLength(0);
    expect(d.deferred[0].reason).toMatch(/24h cap reached \(4\/4\)/);
  });
  it("enforces min spacing since the last post", () => {
    const d = run([due("a", "x")], [inf()], [{ influencerId: "i1", platform: "x", postedAt: new Date(now.getTime() - 10 * 60_000) }]);
    expect(d.publish).toHaveLength(0);
    expect(d.deferred[0].until?.getTime()).toBe(now.getTime() + 20 * 60_000);
  });
  it("caps publishes per platform per run", () => {
    const infs = ["i1", "i2", "i3"].map((id) => inf({ id }));
    const d = run(["i1", "i2", "i3"].map((id, k) => due(`p${k}`, "x", 5, id)), infs);
    expect(d.publish).toHaveLength(2);
    expect(d.deferred[0].reason).toMatch(/per-run/);
  });
  it("holds paused influencers and skips locked platforms", () => {
    expect(run([due("a", "x")], [inf({ paused: true })]).deferred[0].reason).toMatch(/paused/);
    const locked = run([due("t", "tiktok")], [inf()], [], true);
    expect(locked.deferred[0]).toMatchObject({ skip: true });
    expect(run([due("t", "tiktok")], [inf({ graduated: true, connected: { tiktok: true } })]).publish).toHaveLength(1);
  });
  it("defers when not connected unless DRY_RUN", () => {
    expect(run([due("a", "x")], [inf({ connected: {} })]).deferred[0].reason).toMatch(/not connected/);
    expect(run([due("a", "x")], [inf({ connected: {} })], [], true).publish).toHaveLength(1);
  });
  it("ignores future posts and posts in backoff", () => {
    const fut = { ...due("f", "x"), scheduledFor: new Date(now.getTime() + 60_000) };
    const back = { ...due("b", "x"), nextAttemptAt: new Date(now.getTime() + 60_000) };
    const d = run([fut, back], [inf()]);
    expect(d.publish).toHaveLength(0);
    expect(d.deferred).toHaveLength(0);
  });
  it("backs off exponentially with a ceiling", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([5, 10, 20, 40].map((m) => m * 60_000));
    expect(backoffMs(20)).toBe(6 * 3600_000);
  });
});

describe("planner + publisher in DRY_RUN", () => {
  it("plans the day, then logs request previews without calling any platform", async () => {
    const db = await testDb();
    const token = { mint: "4ee8GNXtBGa7ZEumqhKxxF6h6fCo4V3ZsxjZSF5npump", name: "Moth", symbol: "MOTH", image: null, source: "pump" as const, marketCapUsd: 1, pump: null, pairs: [] };
    const i = await createInfluencer(db, { ownerWallet: "W", token, personaPrompt: "a moth", character: templateCharacter({ sentence: "a moth obsessed with ring lights", tokenName: "Moth", tokenSymbol: "MOTH" }), characterSource: "template" });
    await db.update(influencers).set({ graduated: true }).where(eq(influencers.id, i.id));
    const day = new Date("2030-03-01T00:01:00Z");
    const plan = await runPlanner(db, day);
    expect(plan.created).toBe(4 + 3 + 3);
    expect((await runPlanner(db, day)).created).toBe(0); // idempotent

    const all = await db.select().from(posts);
    expect(all.filter((p) => p.platform === "tiktok").every((p) => p.status === "awaiting_approval")).toBe(true);
    expect(all.every((p) => /AI-generated|#AIgenerated/.test(p.caption))).toBe(true);

    const { f, calls } = mockFetch([]);
    const end = new Date("2030-03-01T23:59:00Z");
    const r1 = await runPublish(db, end, f, placeholderProvider);
    expect(r1.dryRun).toBe(2); // one X + one Instagram (TikTok waits for approval)
    expect(calls).toHaveLength(0);
    const done = await db.select().from(posts).where(eq(posts.status, "dry_run"));
    expect(done).toHaveLength(2);
    const ig = done.find((p) => p.platform === "instagram")!;
    expect(JSON.stringify(ig.requestPreview)).toMatch(/media_publish/);
    expect(JSON.stringify(ig.requestPreview)).toMatch(/is_ai_generated/);

    // pausing stops everything
    await db.update(influencers).set({ paused: true }).where(eq(influencers.id, i.id));
    const r2 = await runPublish(db, new Date(end.getTime() + 3600_000), f, placeholderProvider);
    expect(r2.dryRun).toBe(0);
  });
});
