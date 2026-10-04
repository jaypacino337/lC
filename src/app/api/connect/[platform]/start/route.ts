import { NextResponse } from "next/server";
import { oauthStates } from "@/lib/db/schema";
import { config } from "@/lib/config";
import { pkceChallenge, randomToken } from "@/lib/crypto";
import { err, requireOwner } from "@/lib/http";
import { getConnector } from "@/lib/social";

export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  const connector = getConnector(platform);
  if (!connector) return err("Unknown platform", 404);
  const influencerId = new URL(req.url).searchParams.get("influencer") ?? "";
  const o = await requireOwner(influencerId);
  if (o instanceof Response) return o;
  const back = `${config.appUrl()}/dashboard/${influencerId}`;
  if (platform !== "x" && !o.inf.graduated) return NextResponse.redirect(`${back}?connect_error=${encodeURIComponent(`${platform} unlocks when $${o.inf.tokenSymbol} graduates`)}`);
  if (!connector.configured()) return NextResponse.redirect(`${back}?connect_error=${encodeURIComponent(`${platform} app credentials are not configured on this server`)}`);
  const state = randomToken(24);
  const verifier = randomToken(48);
  await o.d.insert(oauthStates).values({ state, wallet: o.wallet, influencerId, platform, codeVerifier: verifier, expiresAt: new Date(Date.now() + 10 * 60_000) });
  const url = connector.authorizeUrl({ state, codeChallenge: pkceChallenge(verifier), redirectUri: `${config.appUrl()}/api/connect/${platform}/callback` });
  return NextResponse.redirect(url);
}
