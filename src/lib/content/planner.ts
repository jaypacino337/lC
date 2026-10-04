/**
 * Daily planner: for each active influencer and each unlocked platform, create `cadence[platform]`
 * posts for the day (caption + media prompt), spread across the day, stored in the posts queue.
 * Idempotent: a unique index on (influencer, platform, date, slot) prevents double-planning.
 */
import * as z from "zod";
import { claudeEnabled, generateStructured } from "../claude";
import type { Platform } from "../config";
import { config } from "../config";
import { checkCaption, sanitizeCaption, withAiDisclosure } from "../guard";
import { clampCadence, unlockedPlatforms } from "./cadence";
import { hashString, mulberry32, pick } from "./rand";
import type { CharacterSheet, PlannedPostDraft } from "./types";

export interface PlannerInfluencer {
  id: string;
  tokenSymbol: string;
  character: CharacterSheet;
  seed: number;
  graduated: boolean;
  paused: boolean;
  cadence: unknown;
}

export interface SlotPlan {
  platform: Platform;
  slot: number;
  scheduledFor: Date;
}

const WINDOW_START_MIN = 7 * 60; // 07:00 UTC
const WINDOW_END_MIN = 23 * 60 + 30; // 23:30 UTC

/** Evenly spread `count` slots across the posting window with deterministic jitter. */
export function computeSlots(count: number, date: string, seed: number): Date[] {
  const base = Date.parse(`${date}T00:00:00.000Z`);
  const span = WINDOW_END_MIN - WINDOW_START_MIN;
  const step = span / count;
  const rng = mulberry32(seed ^ hashString(date));
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = (rng() - 0.5) * step * 0.5;
    const minute = Math.round(WINDOW_START_MIN + step * i + step / 2 + jitter);
    out.push(new Date(base + minute * 60_000));
  }
  return out;
}

export function planSlots(inf: PlannerInfluencer, date: string): SlotPlan[] {
  if (inf.paused) return [];
  const cadence = clampCadence(inf.cadence as Record<string, unknown>);
  const out: SlotPlan[] = [];
  for (const platform of unlockedPlatforms(inf)) {
    const times = computeSlots(cadence[platform], date, inf.seed + hashString(platform));
    times.forEach((t, slot) => out.push({ platform, slot, scheduledFor: t }));
  }
  return out;
}

export function mediaTypeFor(platform: Platform, slot: number): "image" | "video" {
  if (platform === "tiktok") return "video";
  if (platform === "instagram") return slot % 2 === 0 ? "image" : "video";
  return "image";
}

const SCENES = [
  { scene: "street walk", line: (c: CharacterSheet, loc: string) => `walked past ${loc} and it felt like a movie scene. ${c.catchphrases[0] ?? "more soon"}.` },
  { scene: "face cam", line: (c: CharacterSheet) => `quick check-in from the couch. today's mood: ${c.voice.split(",")[0]}.` },
  { scene: "gym", line: () => `leg day. not doing well. still showed up, that's the whole post.` },
  { scene: "road trip", line: (_c: CharacterSheet, loc: string) => `pulled over at ${loc}. the playlist is perfect and the snacks are questionable.` },
  { scene: "airport", line: () => `gate changed twice. made a friend. we are both still lost.` },
  { scene: "stage", line: () => `soundcheck done. tried to look cool, tripped on a cable, kept going.` },
  { scene: "dance", line: () => `learned exactly one move and I am doing it everywhere today.` },
  { scene: "cooking", line: () => `attempted breakfast. the toast won. the coffee is excellent though.` },
  { scene: "night out", line: (_c: CharacterSheet, loc: string) => `${loc}, 1am, deep conversations with strangers about whether birds have favourite songs.` },
  { scene: "camera roll", line: (c: CharacterSheet) => `camera roll from the week. ${c.catchphrases[1] ?? "tiny wins count"}.` },
];

export function templateDrafts(character: CharacterSheet, symbol: string, platform: Platform, count: number, date: string, seed: number): PlannedPostDraft[] {
  const rng = mulberry32(seed ^ hashString(`${date}|${platform}`));
  const out: PlannedPostDraft[] = [];
  for (let i = 0; i < count; i++) {
    const s = pick(rng, SCENES);
    const loc = pick(rng, character.recurringLocations.length ? character.recurringLocations : ["the city"]);
    const caption = `${s.line(character, loc)} $${symbol}`;
    out.push({
      caption,
      location: loc,
      mediaType: mediaTypeFor(platform, i),
      mediaPrompt: `${character.name}, ${character.look}. Scene: ${s.scene} at ${loc}. Candid smartphone ${mediaTypeFor(platform, i) === "video" ? "5-second vertical clip" : "photo"}, natural light, consistent identity.`,
    });
  }
  return out;
}

const DraftSchema = z.object({
  posts: z.array(
    z.object({
      platform: z.enum(["x", "tiktok", "instagram"]),
      caption: z.string(),
      mediaPrompt: z.string(),
      location: z.string(),
    }),
  ),
});

async function claudeDrafts(inf: PlannerInfluencer, wanted: Record<Platform, number>, date: string): Promise<Record<Platform, PlannedPostDraft[]> | null> {
  const total = Object.values(wanted).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const c = inf.character;
  const out = await generateStructured({
    schema: DraftSchema,
    system: `You write a day of social posts for a fictional AI influencer. Stay in character.
Hard rules: never mention prices, charts, market cap, buying, selling, holding, gains, returns, "moon", multipliers or any financial promise. No real people. No hashtags except at most one. You may mention the cashtag $${inf.tokenSymbol} at most once per post as a name tag, never with price talk. X captions <= 230 characters; TikTok/Instagram captions <= 400 characters.`,
    prompt: `Character sheet:\n${JSON.stringify(c, null, 2)}\n\nDate: ${date}. Write exactly: ${(Object.keys(wanted) as Platform[])
      .filter((p) => wanted[p] > 0)
      .map((p) => `${wanted[p]} ${p} posts`)
      .join(", ")}. Each post: a caption, a media prompt (visual description that restates the character's look so the face stays consistent, plus the scene), and the location (prefer recurring locations).`,
    maxTokens: 8000,
  });
  if (!out) return null;
  const res: Record<Platform, PlannedPostDraft[]> = { x: [], tiktok: [], instagram: [] };
  for (const p of out.posts) {
    if (res[p.platform].length >= wanted[p.platform]) continue;
    res[p.platform].push({ caption: p.caption, mediaPrompt: p.mediaPrompt, location: p.location, mediaType: mediaTypeFor(p.platform, res[p.platform].length) });
  }
  return res;
}

/** Applies the content filter and AI disclosure. Falls back to the template caption if nothing safe remains. */
export function finalizeCaption(platform: Platform, caption: string, fallback: string): { caption: string; filtered: boolean } {
  let filtered = false;
  let text = caption;
  if (!checkCaption(text.replace(/\$[A-Za-z][A-Za-z0-9]{0,11}\b/g, "")).ok) {
    filtered = true;
    text = sanitizeCaption(text) ?? fallback;
  }
  return { caption: withAiDisclosure(platform, text), filtered };
}

export interface DraftedSlot extends SlotPlan, PlannedPostDraft {
  source: "claude" | "template";
  filtered: boolean;
}

export async function draftDay(inf: PlannerInfluencer, date: string, missing: SlotPlan[]): Promise<DraftedSlot[]> {
  const wanted: Record<Platform, number> = { x: 0, tiktok: 0, instagram: 0 };
  for (const s of missing) wanted[s.platform]++;
  const ai = claudeEnabled() && process.env.PLANNER_USE_CLAUDE !== "false" ? await claudeDrafts(inf, wanted, date) : null;
  const out: DraftedSlot[] = [];
  for (const platform of Object.keys(wanted) as Platform[]) {
    const slots = missing.filter((s) => s.platform === platform);
    if (!slots.length) continue;
    const tpl = templateDrafts(inf.character, inf.tokenSymbol, platform, slots.length, date, inf.seed + slots[0].slot);
    slots.forEach((slot, i) => {
      const fromAi = ai?.[platform]?.[i];
      const draft = fromAi ?? tpl[i];
      const { caption, filtered } = finalizeCaption(platform, draft.caption, tpl[i].caption);
      out.push({ ...slot, ...draft, mediaType: mediaTypeFor(platform, slot.slot), caption, filtered, source: fromAi ? "claude" : "template" });
    });
  }
  return out;
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export const plannerInfo = () => ({ claude: claudeEnabled(), dryRun: config.dryRun() });
