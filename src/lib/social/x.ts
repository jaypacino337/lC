/**
 * X (Twitter) connector - OAuth 2.0 Authorization Code with PKCE, posting via X API v2.
 * Docs: https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
 *       POST https://api.x.com/2/tweets, POST https://api.x.com/2/media/upload (media.write)
 */
import { config } from "../config";
import { ConnectorError, download, expectOk, type Connector, type FetchLike, type PreviewRequest, type PublishInput } from "./types";

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_API = "https://api.x.com/2";
export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];

function tokenHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const id = config.x.clientId();
  const secret = config.x.clientSecret();
  if (secret) h.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64")}`;
  return h;
}

export function buildTweetBody(text: string, mediaId?: string | null) {
  return mediaId ? { text, media: { media_ids: [mediaId] } } : { text };
}

export const xConnector: Connector = {
  platform: "x",
  scopes: X_SCOPES,
  configured: () => !!config.x.clientId(),
  approvalNotice: () => null,
  authorizeUrl({ state, codeChallenge, redirectUri }) {
    const q = new URLSearchParams({
      response_type: "code",
      client_id: config.x.clientId(),
      redirect_uri: redirectUri,
      scope: X_SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${X_AUTHORIZE_URL}?${q}`;
  },
  async exchangeCode({ code, codeVerifier, redirectUri }, f: FetchLike = fetch) {
    const body = new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: codeVerifier, client_id: config.x.clientId() });
    const tok = (await expectOk(await f(X_TOKEN_URL, { method: "POST", headers: tokenHeaders(), body }), "X token exchange")) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    const me = (await expectOk(await f(`${X_API}/users/me`, { headers: { Authorization: `Bearer ${tok.access_token}` } }), "X users/me")) as {
      data: { id: string; username: string; name: string };
    };
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? null,
      expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
      scopes: tok.scope ?? X_SCOPES.join(" "),
      externalUserId: me.data.id,
      username: me.data.username,
      meta: { name: me.data.name },
    };
  },
  async refresh(refreshToken, f: FetchLike = fetch) {
    const body = new URLSearchParams({ refresh_token: refreshToken, grant_type: "refresh_token", client_id: config.x.clientId() });
    const tok = (await expectOk(await f(X_TOKEN_URL, { method: "POST", headers: tokenHeaders(), body }), "X token refresh")) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return { accessToken: tok.access_token, refreshToken: tok.refresh_token ?? refreshToken, expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null };
  },
  preview(input: PublishInput): PreviewRequest[] {
    const reqs: PreviewRequest[] = [];
    const withMedia = input.mediaIsReal && input.mediaUrl && input.mediaType === "image";
    if (withMedia) reqs.push({ method: "POST", url: `${X_API}/media/upload`, body: { media: `<bytes of ${input.mediaUrl}>`, media_category: "tweet_image" } });
    reqs.push({ method: "POST", url: `${X_API}/tweets`, body: buildTweetBody(input.caption, withMedia ? "<media_id>" : null) });
    if (input.mediaType === "video") reqs[reqs.length - 1].note = "Video clips are posted to X as text + still for now (chunked video upload not implemented).";
    return reqs;
  },
  async publish(input, account, f: FetchLike = fetch) {
    const auth = { Authorization: `Bearer ${account.accessToken}` };
    let mediaId: string | null = null;
    if (input.mediaIsReal && input.mediaUrl && input.mediaType === "image") {
      const { bytes, contentType } = await download(input.mediaUrl, f);
      const form = new FormData();
      form.append("media", new Blob([bytes as BlobPart], { type: contentType }), "media");
      form.append("media_category", "tweet_image");
      const up = (await expectOk(await f(`${X_API}/media/upload`, { method: "POST", headers: auth, body: form }), "X media upload")) as { data?: { id: string } };
      mediaId = up.data?.id ?? null;
      if (!mediaId) throw new ConnectorError("X media upload returned no id", 502);
    }
    const res = (await expectOk(
      await f(`${X_API}/tweets`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(buildTweetBody(input.caption, mediaId)) }),
      "X create post",
    )) as { data: { id: string } };
    const handle = account.username ?? "i";
    return { status: "posted", externalId: res.data.id, url: `https://x.com/${handle}/status/${res.data.id}` };
  },
};
