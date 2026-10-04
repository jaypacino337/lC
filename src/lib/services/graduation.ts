import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { influencers } from "../db/schema";
import { config } from "../config";
import { detectGraduation, fetchDexPairs, fetchPumpCoin, type FetchLike } from "../solana/token";
import { notify } from "./notify";
import { planInfluencerDay } from "./planner";
import { todayUtc } from "../content/planner";

export interface GraduationReport {
  checked: number;
  newlyGraduated: string[];
  errors: number;
}

/** Checks every not-yet-graduated influencer; on graduation unlocks TikTok + Instagram and notifies the creator. */
export async function runGraduationCheck(db: DB, f: FetchLike = fetch, now = new Date()): Promise<GraduationReport> {
  const pending = await db.select().from(influencers).where(eq(influencers.graduated, false));
  const report: GraduationReport = { checked: 0, newlyGraduated: [], errors: 0 };
  for (const inf of pending) {
    report.checked++;
    try {
      const [pump, pairs] = await Promise.all([fetchPumpCoin(inf.mint, f), fetchDexPairs(inf.mint, f)]);
      const g = detectGraduation(pump, pairs, config.minDexLiquidityUsd());
      const mcap = pump?.usd_market_cap ?? pairs[0]?.marketCap ?? null;
      await db
        .update(influencers)
        .set({
          graduationCheckedAt: now,
          graduationReason: g.reason,
          marketCapUsd: mcap ? Math.round(mcap) : inf.marketCapUsd,
          ...(g.graduated ? { graduated: true, graduatedAt: now } : {}),
        })
        .where(eq(influencers.id, inf.id));
      if (g.graduated) {
        report.newlyGraduated.push(inf.slug);
        await notify(db, {
          wallet: inf.ownerWallet,
          influencerId: inf.id,
          kind: "graduation",
          title: `$${inf.tokenSymbol} graduated - TikTok + Instagram unlocked`,
          body: `${inf.character.name} can now post on TikTok and Instagram (${g.reason}). Connect both accounts in your dashboard to go live.`,
        });
        // Plan the rest of today for the newly unlocked platforms.
        await planInfluencerDay(db, { ...inf, graduated: true }, todayUtc(now), now);
      }
    } catch (e) {
      report.errors++;
      console.warn(`[glowpad] graduation check failed for ${inf.mint}:`, e);
    }
  }
  return report;
}
