import type { DB } from "../db/client";
import { checkImpersonation } from "../guard";
import { CharacterSheetSchema } from "../content/schema";
import type { TokenInfo } from "../solana/token";
import { createInfluencer, getInfluencerByMint } from "./influencers";
import { notify } from "./notify";
import { planInfluencerDay } from "./planner";
import { todayUtc } from "../content/planner";

export type RegisterResult = { ok: true; slug: string; id: string } | { ok: false; status: number; error: string };

/** Shared by "paste a mint", "launched here" and dev seeding. Re-validates the (client-supplied) character sheet. */
export async function registerInfluencer(
  db: DB,
  p: { wallet: string; token: TokenInfo; personaPrompt: string; character: unknown; characterSource?: string },
): Promise<RegisterResult> {
  const parsed = CharacterSheetSchema.safeParse(p.character);
  if (!parsed.success) return { ok: false, status: 400, error: "Character sheet is incomplete." };
  const c = parsed.data;
  const guard = checkImpersonation(p.personaPrompt, c.name, c.look, c.backstory, c.tagline, p.token.name);
  if (!guard.ok) return { ok: false, status: 422, error: guard.reason ?? "Persona not allowed" };
  if (await getInfluencerByMint(db, p.token.mint)) return { ok: false, status: 409, error: "This token already has an influencer." };
  const inf = await createInfluencer(db, {
    ownerWallet: p.wallet,
    token: p.token,
    personaPrompt: p.personaPrompt,
    character: c,
    characterSource: p.characterSource === "claude" ? "claude" : "template",
  });
  const now = new Date();
  await planInfluencerDay(db, inf, todayUtc(now), now);
  await notify(db, {
    wallet: p.wallet,
    influencerId: inf.id,
    kind: "info",
    title: `${c.name} is alive`,
    body: inf.graduated
      ? `$${inf.tokenSymbol} has already graduated, so X, TikTok and Instagram are all unlocked. Connect accounts to start posting.`
      : `Connect X to start posting. TikTok + Instagram unlock when $${inf.tokenSymbol} graduates from the pump.fun bonding curve.`,
  });
  return { ok: true, slug: inf.slug, id: inf.id };
}
