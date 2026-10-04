import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { influencers, posts, socialAccounts, type Influencer } from "../db/schema";
import { DEFAULT_CADENCE, clampCadence } from "../content/cadence";
import type { CharacterSheet } from "../content/types";
import { hashString } from "../content/rand";
import { getMediaProvider } from "../media";
import { detectGraduation, type TokenInfo } from "../solana/token";
import { config } from "../config";
import { newId, slugify } from "./ids";

export async function uniqueSlug(db: DB, base: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const hit = await db.select({ id: influencers.id }).from(influencers).where(eq(influencers.slug, candidate)).limit(1);
    if (!hit.length) return candidate;
  }
  return `${root}-${newId().slice(0, 6)}`;
}

export async function createInfluencer(
  db: DB,
  p: { ownerWallet: string; token: TokenInfo; personaPrompt: string; character: CharacterSheet; characterSource: "claude" | "template" },
): Promise<Influencer> {
  const seed = hashString(`${p.token.mint}|${p.character.name}`) % 2_000_000_000;
  const provider = getMediaProvider();
  const ref = await provider.createReference({ prompt: `${p.character.name}: ${p.character.look}`, seed, palette: p.character.palette });
  const grad = detectGraduation(p.token.pump, p.token.pairs, config.minDexLiquidityUsd());
  const now = new Date();
  const [row] = await db
    .insert(influencers)
    .values({
      id: newId(),
      slug: await uniqueSlug(db, p.token.symbol || p.character.name),
      ownerWallet: p.ownerWallet,
      mint: p.token.mint,
      tokenName: p.token.name.slice(0, 64),
      tokenSymbol: p.token.symbol.slice(0, 16),
      tokenImage: p.token.image,
      tokenSource: p.token.source,
      personaPrompt: p.personaPrompt.slice(0, 500),
      character: p.character,
      characterSource: p.characterSource,
      referenceImageUrl: ref.status === "done" ? ref.url : null,
      seed,
      cadence: DEFAULT_CADENCE,
      graduated: grad.graduated,
      graduatedAt: grad.graduated ? now : null,
      graduationReason: grad.reason,
      graduationCheckedAt: now,
      marketCapUsd: p.token.marketCapUsd ? Math.round(p.token.marketCapUsd) : null,
      bondingProgress: grad.progress === null ? null : Math.round(grad.progress),
    })
    .returning();
  return row;
}

export async function getInfluencerBySlug(db: DB, slug: string) {
  const [row] = await db.select().from(influencers).where(eq(influencers.slug, slug)).limit(1);
  return row ?? null;
}

export async function getInfluencerById(db: DB, id: string) {
  const [row] = await db.select().from(influencers).where(eq(influencers.id, id)).limit(1);
  return row ?? null;
}

export async function getInfluencerByMint(db: DB, mint: string) {
  const [row] = await db.select().from(influencers).where(eq(influencers.mint, mint)).limit(1);
  return row ?? null;
}

export async function listByOwner(db: DB, wallet: string) {
  return db.select().from(influencers).where(eq(influencers.ownerWallet, wallet)).orderBy(desc(influencers.createdAt));
}

export async function listPublic(db: DB, limit = 48) {
  return db.select().from(influencers).orderBy(desc(influencers.graduated), desc(influencers.createdAt)).limit(limit);
}

export async function connectedPlatforms(db: DB, influencerIds: string[]) {
  if (!influencerIds.length) return new Map<string, { platform: string; username: string | null }[]>();
  const rows = await db
    .select({ influencerId: socialAccounts.influencerId, platform: socialAccounts.platform, username: socialAccounts.username })
    .from(socialAccounts)
    .where(inArray(socialAccounts.influencerId, influencerIds));
  const m = new Map<string, { platform: string; username: string | null }[]>();
  for (const r of rows) m.set(r.influencerId, [...(m.get(r.influencerId) ?? []), { platform: r.platform, username: r.username }]);
  return m;
}

export async function updateSettings(db: DB, id: string, patch: { paused?: boolean; cadence?: unknown }) {
  const set: Partial<Influencer> = {};
  if (typeof patch.paused === "boolean") set.paused = patch.paused;
  if (patch.cadence) set.cadence = clampCadence(patch.cadence as Record<string, unknown>);
  if (!Object.keys(set).length) return getInfluencerById(db, id);
  const [row] = await db.update(influencers).set(set).where(eq(influencers.id, id)).returning();
  return row;
}

export async function latestPosts(db: DB, limit = 12) {
  return db
    .select({ post: posts, inf: { slug: influencers.slug, name: sql<string>`${influencers.character}->>'name'`, symbol: influencers.tokenSymbol, seed: influencers.seed, character: influencers.character, referenceImageUrl: influencers.referenceImageUrl } })
    .from(posts)
    .innerJoin(influencers, eq(posts.influencerId, influencers.id))
    .where(inArray(posts.status, ["posted", "dry_run"]))
    .orderBy(desc(posts.postedAt))
    .limit(limit);
}

export async function postsFor(db: DB, influencerId: string, statuses?: string[], limit = 100) {
  const where = statuses ? and(eq(posts.influencerId, influencerId), inArray(posts.status, statuses as never[])) : eq(posts.influencerId, influencerId);
  return db.select().from(posts).where(where).orderBy(desc(posts.scheduledFor)).limit(limit);
}
