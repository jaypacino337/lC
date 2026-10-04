/**
 * Instagram connector - "Instagram API with Instagram Login" (professional: Business/Creator accounts).
 * Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
 *  - Scopes: instagram_business_basic, instagram_business_content_publish
 *  - Publishing = create container (POST /<IG_ID>/media) -> wait for FINISHED (videos) -> POST /<IG_ID>/media_publish
 *  - Media must be on a publicly reachable URL at publish time (Meta cURLs it).
 *  - Limit: 100 API-published posts per account per rolling 24h (we cap far lower, INSTAGRAM_DAILY_CAP).
 *  - is_ai_generated=true self-discloses AI usage on the post.
 *  - Until Meta App Review grants Advanced Access, only accounts with a role on the app can connect.
 */
import { config } from "../config";
import { ConnectorError, expectOk, type Connector, type FetchLike, type PreviewRequest, type PublishInput } from "./types";

export const IG_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const IG_GRAPH = "https://graph.instagram.com";
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

const v = () => config.instagram.graphVersion();

export function buildContainerParams(input: Pick<PublishInput, "caption" | "mediaUrl" | "mediaType">): Record<string, string> {
  if (!input.mediaUrl) throw new ConnectorError("Instagram requires media at a public URL", 400, false);
  const p: Record<string, string> = { caption: input.caption.slice(0, 2200), is_ai_generated: "true" };
  if (input.mediaType === "video") {
    p.media_type = "REELS";
    p.video_url = input.mediaUrl;
    p.share_to_feed = "true";
  } else {
    p.image_url = input.mediaUrl;
  }
  return p;
}

export const instagramConnector: Connector = {
  platform: "instagram",
  scopes: IG_SCOPES,
  configured: () => !!config.instagram.appId() && !!config.instagram.appSecret(),
  approvalNotice: () =>
    config.instagram.reviewed() ? null : "Pending Meta App Review: only Instagram accounts added as testers/roles on the Meta app can connect and publish.",
  authorizeUrl({ state, redirectUri }) {
    const q = new URLSearchParams({ client_id: config.instagram.appId(), redirect_uri: redirectUri, response_type: "code", scope: IG_SCOPES.join(","), state, enable_fb_login: "0" });
    return `${IG_AUTHORIZE_URL}?${q}`;
  },
  async exchangeCode({ code, redirectUri }, f: FetchLike = fetch) {
    const body = new URLSearchParams({
      client_id: config.instagram.appId(),
      client_secret: config.instagram.appSecret(),
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code: code.replace(/#_$/, ""),
    });
    const shortRaw = (await expectOk(await f(IG_TOKEN_URL, { method: "POST", body }), "Instagram token")) as
      | { access_token: string; user_id: string | number; permissions?: string | string[] }
      | { data: { access_token: string; user_id: string | number; permissions?: string }[] };
    const short = "data" in shortRaw ? shortRaw.data[0] : shortRaw;
    const longQ = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: config.instagram.appSecret(), access_token: short.access_token });
    const long = (await expectOk(await f(`${IG_GRAPH}/access_token?${longQ}`, {}), "Instagram long-lived token")) as { access_token: string; expires_in: number };
    const meQ = new URLSearchParams({ fields: "user_id,username", access_token: long.access_token });
    const me = (await expectOk(await f(`${IG_GRAPH}/${v()}/me?${meQ}`, {}), "Instagram me")) as { user_id?: string; id: string; username: string };
    return {
      accessToken: long.access_token,
      refreshToken: null,
      expiresAt: new Date(Date.now() + long.expires_in * 1000),
      scopes: Array.isArray(short.permissions) ? short.permissions.join(",") : short.permissions ?? IG_SCOPES.join(","),
      externalUserId: String(me.user_id ?? short.user_id ?? me.id),
      username: me.username,
    };
  },
  /** Instagram refreshes the long-lived token itself (no separate refresh token). */
  async refresh(accessToken, f: FetchLike = fetch) {
    const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: accessToken });
    const tok = (await expectOk(await f(`${IG_GRAPH}/refresh_access_token?${q}`, {}), "Instagram refresh")) as { access_token: string; expires_in: number };
    return { accessToken: tok.access_token, expiresAt: new Date(Date.now() + tok.expires_in * 1000) };
  },
  preview(input: PublishInput, account): PreviewRequest[] {
    const id = account.externalUserId;
    return [
      { method: "POST", url: `${IG_GRAPH}/${v()}/${id}/media`, body: input.mediaUrl ? buildContainerParams(input) : { note: "needs media" } },
      ...(input.mediaType === "video" ? [{ method: "GET", url: `${IG_GRAPH}/${v()}/<container_id>?fields=status_code`, note: "poll until FINISHED" }] : []),
      { method: "POST", url: `${IG_GRAPH}/${v()}/${id}/media_publish`, body: { creation_id: "<container_id>" } },
    ];
  },
  async publish(input, account, f: FetchLike = fetch) {
    if (!input.mediaIsReal || !input.mediaUrl) throw new ConnectorError("Instagram needs real media at a public URL - configure a media provider (FAL_KEY).", 400, false);
    const id = account.externalUserId;
    const tokenParam = { access_token: account.accessToken };
    let containerId = (input.job?.igContainerId as string | undefined) ?? null;
    if (!containerId) {
      const body = new URLSearchParams({ ...buildContainerParams(input), ...tokenParam });
      const c = (await expectOk(await f(`${IG_GRAPH}/${v()}/${id}/media`, { method: "POST", body }), "Instagram create container")) as { id: string };
      containerId = c.id;
    }
    if (input.mediaType === "video") {
      let finished = false;
      for (let i = 0; i < 6 && !finished; i++) {
        const q = new URLSearchParams({ fields: "status_code", ...tokenParam });
        const s = (await expectOk(await f(`${IG_GRAPH}/${v()}/${containerId}?${q}`, {}), "Instagram container status")) as { status_code: string };
        if (s.status_code === "FINISHED") finished = true;
        else if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new ConnectorError(`Instagram container ${s.status_code}`, 422, false);
        else if (i < 5) await new Promise((r) => setTimeout(r, process.env.VITEST ? 0 : 4000));
      }
      if (!finished) return { status: "pending", job: { igContainerId: containerId } };
    }
    const pub = (await expectOk(
      await f(`${IG_GRAPH}/${v()}/${id}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: containerId, ...tokenParam }) }),
      "Instagram media_publish",
    )) as { id: string };
    let url: string | null = null;
    try {
      const q = new URLSearchParams({ fields: "permalink", ...tokenParam });
      url = ((await (await f(`${IG_GRAPH}/${v()}/${pub.id}?${q}`, {})).json()) as { permalink?: string }).permalink ?? null;
    } catch {
      /* permalink is best-effort */
    }
    return { status: "posted", externalId: pub.id, url };
  },
};
