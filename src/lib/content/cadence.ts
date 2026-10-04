import type { Platform } from "../config";

export type Cadence = Record<Platform, number>;

export const CADENCE_LIMITS: Record<Platform, { min: number; max: number }> = {
  x: { min: 1, max: 8 },
  tiktok: { min: 1, max: 6 },
  instagram: { min: 1, max: 6 },
};

export const DEFAULT_CADENCE: Cadence = { x: 4, tiktok: 3, instagram: 3 };

export function clampCadence(input: Partial<Record<string, unknown>> | null | undefined): Cadence {
  const out = { ...DEFAULT_CADENCE };
  for (const p of Object.keys(CADENCE_LIMITS) as Platform[]) {
    const v = Number(input?.[p]);
    if (Number.isFinite(v)) out[p] = Math.min(CADENCE_LIMITS[p].max, Math.max(CADENCE_LIMITS[p].min, Math.round(v)));
  }
  return out;
}

/** Platforms an influencer may post to: X from day one, TikTok + Instagram only after graduation. */
export function unlockedPlatforms(inf: { graduated: boolean }): Platform[] {
  return inf.graduated ? ["x", "tiktok", "instagram"] : ["x"];
}
