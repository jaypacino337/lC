/**
 * Pure scheduling decisions (no I/O) so cadence and rate limiting are unit-testable.
 * The publisher feeds it due posts + recent history and executes what it returns.
 */
import { config, type Platform } from "./config";
import { clampCadence, unlockedPlatforms } from "./content/cadence";

export interface PlatformLimits {
  /** Hard cap of published posts per influencer account per rolling 24h. */
  dailyCap: number;
  /** Minimum minutes between two posts of the same influencer on this platform. */
  minSpacingMinutes: number;
  /** Max publishes on this platform per cron run (protects app-level rate limits & function time). */
  perRunMax: number;
}

export function platformLimits(): Record<Platform, PlatformLimits> {
  return {
    x: { dailyCap: config.x.dailyCap(), minSpacingMinutes: 30, perRunMax: 25 },
    tiktok: { dailyCap: config.tiktok.dailyCap(), minSpacingMinutes: 60, perRunMax: 5 },
    instagram: { dailyCap: config.instagram.dailyCap(), minSpacingMinutes: 60, perRunMax: 10 },
  };
}

export const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;

/** Exponential backoff: 5m, 10m, 20m, 40m ... capped at 6h. */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
}

export interface DuePost {
  id: string;
  influencerId: string;
  platform: Platform;
  scheduledFor: Date;
  status: string;
  nextAttemptAt: Date | null;
}

export interface InfluencerState {
  id: string;
  paused: boolean;
  graduated: boolean;
  cadence: unknown;
  connected: Partial<Record<Platform, boolean>>;
}

export interface HistoryEntry {
  influencerId: string;
  platform: Platform;
  postedAt: Date;
}

export type Deferral = { postId: string; reason: string; until?: Date; skip?: boolean };

export interface Decision {
  publish: DuePost[];
  deferred: Deferral[];
}

/**
 * Decide which due posts to publish now.
 * Rules, in order: paused -> skip-for-now; platform locked (pre-graduation TikTok/IG) -> skip;
 * not connected (and not DRY_RUN) -> defer; cadence/day cap/rolling-24h cap -> defer; min spacing -> defer;
 * per-run platform budget -> defer to next run. One publish per influencer+platform per run.
 */
export function decide(due: DuePost[], influencers: Map<string, InfluencerState>, history: HistoryEntry[], now: Date, opts: { dryRun: (p: Platform) => boolean; limits?: Record<Platform, PlatformLimits> } ): Decision {
  const limits = opts.limits ?? platformLimits();
  const out: Decision = { publish: [], deferred: [] };
  const dayAgo = now.getTime() - 24 * 60 * 60_000;
  const key = (i: string, p: Platform) => `${i}|${p}`;
  const count24 = new Map<string, number>();
  const last = new Map<string, number>();
  for (const h of history) {
    const k = key(h.influencerId, h.platform);
    const t = h.postedAt.getTime();
    if (t >= dayAgo) count24.set(k, (count24.get(k) ?? 0) + 1);
    last.set(k, Math.max(last.get(k) ?? 0, t));
  }
  const runCount: Record<Platform, number> = { x: 0, tiktok: 0, instagram: 0 };
  const sorted = [...due].sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  for (const post of sorted) {
    if (post.scheduledFor.getTime() > now.getTime()) continue;
    if (post.nextAttemptAt && post.nextAttemptAt.getTime() > now.getTime()) continue;
    const inf = influencers.get(post.influencerId);
    if (!inf) {
      out.deferred.push({ postId: post.id, reason: "influencer missing", skip: true });
      continue;
    }
    if (inf.paused) {
      out.deferred.push({ postId: post.id, reason: "influencer paused" });
      continue;
    }
    if (!unlockedPlatforms(inf).includes(post.platform)) {
      out.deferred.push({ postId: post.id, reason: `${post.platform} unlocks at graduation`, skip: true });
      continue;
    }
    if (!opts.dryRun(post.platform) && !inf.connected[post.platform]) {
      out.deferred.push({ postId: post.id, reason: `${post.platform} account not connected`, until: new Date(now.getTime() + 60 * 60_000) });
      continue;
    }
    const k = key(post.influencerId, post.platform);
    const lim = limits[post.platform];
    const cadence = clampCadence(inf.cadence as Record<string, unknown>)[post.platform];
    const cap = Math.min(lim.dailyCap, cadence);
    const used = count24.get(k) ?? 0;
    if (used >= cap) {
      out.deferred.push({ postId: post.id, reason: `24h cap reached (${used}/${cap})`, until: new Date(now.getTime() + 60 * 60_000) });
      continue;
    }
    const lastAt = last.get(k);
    if (lastAt && now.getTime() - lastAt < lim.minSpacingMinutes * 60_000) {
      out.deferred.push({ postId: post.id, reason: `spacing (${lim.minSpacingMinutes}m between posts)`, until: new Date(lastAt + lim.minSpacingMinutes * 60_000) });
      continue;
    }
    if (runCount[post.platform] >= lim.perRunMax) {
      out.deferred.push({ postId: post.id, reason: "per-run platform budget used" });
      continue;
    }
    runCount[post.platform]++;
    count24.set(k, used + 1);
    last.set(k, now.getTime());
    out.publish.push(post);
  }
  return out;
}
