import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bondingProgress, detectGraduation, lookupToken, type DexPair, type PumpCoin } from "@/lib/solana/token";
import { runGraduationCheck } from "@/lib/services/graduation";
import { createInfluencer } from "@/lib/services/influencers";
import { templateCharacter } from "@/lib/content/persona";
import { influencers, notifications, posts } from "@/lib/db/schema";
import { jsonRes, mockFetch, testDb } from "./helpers";

const MINT = "4ee8GNXtBGa7ZEumqhKxxF6h6fCo4V3ZsxjZSF5npump";
const coin = (over: Partial<PumpCoin> = {}): PumpCoin => ({ mint: MINT, name: "Moth", symbol: "MOTH", program: "pump", complete: false, real_token_reserves: 600_000_000_000_000, usd_market_cap: 9000, ...over });
const pair = (dexId: string, liq: number): DexPair => ({ chainId: "solana", dexId, pairAddress: "P", baseToken: { address: MINT, name: "Moth", symbol: "MOTH" }, liquidity: { usd: liq } });

describe("detectGraduation", () => {
  it("bonding curve in progress", () => {
    const g = detectGraduation(coin(), []);
    expect(g.graduated).toBe(false);
    expect(g.progress).toBeCloseTo(24.3, 0);
  });
  it("complete flag", () => expect(detectGraduation(coin({ complete: true }), []).graduated).toBe(true));
  it("migrated pool even if complete lags", () => {
    expect(detectGraduation(coin({ pump_swap_pool: "Nx9d" }), []).graduated).toBe(true);
    expect(detectGraduation(coin({ raydium_pool: "Ray" }), []).graduated).toBe(true);
  });
  it("DexScreener pumpswap pair counts, pump.fun bonding pair does not", () => {
    expect(detectGraduation(coin(), [pair("pumpfun", 50_000)]).graduated).toBe(false);
    expect(detectGraduation(coin(), [pair("pumpswap", 20_000)]).graduated).toBe(true);
  });
  it("non-pump tokens graduate once they have real DEX liquidity", () => {
    expect(detectGraduation(null, [pair("raydium", 5_000)]).graduated).toBe(false);
    expect(detectGraduation(null, [pair("raydium", 50_000)]).graduated).toBe(true);
    expect(detectGraduation(null, []).graduated).toBe(false);
  });
  it("progress math", () => {
    expect(bondingProgress(coin({ real_token_reserves: 793_100_000_000_000 }))).toBe(0);
    expect(bondingProgress(coin({ real_token_reserves: 0 }))).toBe(100);
  });
});

describe("graduation watcher", () => {
  it("unlocks TikTok + Instagram, notifies the creator and plans the new platforms", async () => {
    const db = await testDb();
    let graduated = false;
    const { f } = mockFetch([
      [/pump\.fun\/coins-v2\//, () => jsonRes(coin(graduated ? { complete: true, pump_swap_pool: "Nx9d" } : {}))],
      [/dexscreener\.com\/tokens\/v1\/solana\//, () => jsonRes(graduated ? [pair("pumpswap", 80_000)] : [pair("pumpfun", 4_000)])],
    ]);
    const token = await lookupToken(MINT, f);
    expect(token?.source).toBe("pump");
    const inf = await createInfluencer(db, { ownerWallet: "Owner1111111111111111111111111111111111111", token: token!, personaPrompt: "a moth", character: templateCharacter({ sentence: "a moth", tokenName: "Moth", tokenSymbol: "MOTH" }), characterSource: "template" });
    expect(inf.graduated).toBe(false);

    const early = new Date("2030-01-01T06:00:00Z");
    let report = await runGraduationCheck(db, f, early);
    expect(report.newlyGraduated).toEqual([]);

    graduated = true;
    report = await runGraduationCheck(db, f, early);
    expect(report.newlyGraduated).toEqual([inf.slug]);
    const [after] = await db.select().from(influencers).where(eq(influencers.id, inf.id));
    expect(after.graduated).toBe(true);
    const notes = await db.select().from(notifications).where(eq(notifications.influencerId, inf.id));
    expect(notes.some((n) => n.kind === "graduation" && /TikTok \+ Instagram unlocked/.test(n.title))).toBe(true);
    const planned = await db.select().from(posts).where(eq(posts.influencerId, inf.id));
    expect(new Set(planned.map((p) => p.platform))).toEqual(new Set(["x", "tiktok", "instagram"]));

    // idempotent: already-graduated influencers are not re-checked
    expect((await runGraduationCheck(db, f, early)).checked).toBe(0);
  });
});
