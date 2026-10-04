import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { oauthStates } from "@/lib/db/schema";
import { getSessionWallet } from "@/lib/auth/session";
import { config, platformLabel, type Platform } from "@/lib/config";
import { db } from "@/lib/http";
import { saveAccount } from "@/lib/services/accounts";
import { notify } from "@/lib/services/notify";
import { getConnector } from "@/lib/social";

export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const connector = getConnector(platform);
  const d = await db();
  const [row] = await d.select().from(oauthStates).where(and(eq(oauthStates.state, state), eq(oauthStates.platform, platform), gt(oauthStates.expiresAt, new Date()))).limit(1);
  const back = (id: string, q: string) => NextResponse.redirect(`${config.appUrl()}/dashboard/${id}?${q}`);
  if (!connector || !row) return NextResponse.redirect(`${config.appUrl()}/dashboard?connect_error=${encodeURIComponent("Connection expired, try again.")}`);
  await d.delete(oauthStates).where(eq(oauthStates.state, state));
  const wallet = await getSessionWallet();
  if (wallet !== row.wallet) return back(row.influencerId, `connect_error=${encodeURIComponent("Wallet session changed during connection.")}`);
  if (!code) return back(row.influencerId, `connect_error=${encodeURIComponent(url.searchParams.get("error_description") || url.searchParams.get("error") || "Authorization was cancelled.")}`);
  try {
    const tokens = await connector.exchangeCode({ code, codeVerifier: row.codeVerifier, redirectUri: `${config.appUrl()}/api/connect/${platform}/callback` });
    await saveAccount(d, row.influencerId, platform as Platform, tokens);
    await notify(d, { wallet, influencerId: row.influencerId, kind: "account", title: `${platformLabel(platform as Platform)} connected`, body: `Connected as ${tokens.username ?? tokens.externalUserId}.` });
    return back(row.influencerId, `connected=${platform}`);
  } catch (e) {
    console.error(`[glowpad] ${platform} OAuth failed`, e);
    return back(row.influencerId, `connect_error=${encodeURIComponent(`${platformLabel(platform as Platform)} connection failed. Check app credentials and redirect URI.`)}`);
  }
}
