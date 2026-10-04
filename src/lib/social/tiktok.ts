/**
 * TikTok connector - Login Kit (OAuth v2) + Content Posting API, Direct Post.
 * Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 *       https://developers.tiktok.com/doc/content-sharing-guidelines
 * Reality check (from TikTok's docs):
 *  - Unaudited API clients may only post with privacy_level SELF_ONLY (private), and only for up to
 *    5 users per 24h, whose accounts must be private. Public posting requires passing TikTok's audit.
 *  - Creators have a Direct Post cap (~15 posts/day/creator) and access tokens are limited to 6 req/min.
 *  - The UX must show the creator's nickname, let the user pick privacy (no default), keep
 *    comment/duet/stitch off by default, and get express consent per upload -> creator approval queue.
 *  - is_aigc=true labels the video as AI-generated content.
 */
import { config } from "../config";
import { ConnectorError, download, expectOk, type Connector, type FetchLike, type PreviewRequest, type PublishInput, type TikTokSettings } from "./types";

export const TT_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TT_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TT_API = "https://open.tiktokapis.com/v2";
export const TT_SCOPES = ["user.info.basic", "video.publish"];
const JSON_HEADERS = { "Content-Type": "application/json; charset=UTF-8" };

export interface CreatorInfo {
  creator_nickname?: string;
  creator_username?: string;
  privacy_level_options: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

/** Unaudited apps are forced to SELF_ONLY; otherwise the creator's choice must be one TikTok offered. */
export function resolvePrivacyLevel(requested: string | undefined, options: string[] | undefined, audited: boolean): string {
  if (!audited) return "SELF_ONLY";
  if (requested && (!options || options.includes(requested))) return requested;
  throw new ConnectorError("TikTok privacy level must be chosen by the creator from creator_info options", 400, false);
}

export function buildVideoInitBody(caption: string, settings: TikTokSettings, videoSize: number, audited: boolean, options?: string[]) {
  return {
    post_info: {
      title: caption.slice(0, 2200),
      privacy_level: resolvePrivacyLevel(settings.privacyLevel, options, audited),
      disable_duet: settings.disableDuet,
      disable_comment: settings.disableComment,
      disable_stitch: settings.disableStitch,
      video_cover_timestamp_ms: 1000,
      brand_content_toggle: false,
      is_aigc: true,
    },
    source_info: { source: "FILE_UPLOAD", video_size: videoSize, chunk_size: videoSize, total_chunk_count: 1 },
  };
}

export function buildPhotoInitBody(caption: string, settings: TikTokSettings, photoUrl: string, audited: boolean, options?: string[]) {
  return {
    post_info: {
      title: caption.slice(0, 90),
      description: caption.slice(0, 4000),
      privacy_level: resolvePrivacyLevel(settings.privacyLevel, options, audited),
      disable_comment: settings.disableComment,
      auto_add_music: true,
      brand_content_toggle: false,
    },
    source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: [photoUrl] },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  };
}

export async function queryCreatorInfo(accessToken: string, f: FetchLike = fetch): Promise<CreatorInfo> {
  const res = (await expectOk(
    await f(`${TT_API}/post/publish/creator_info/query/`, { method: "POST", headers: { ...JSON_HEADERS, Authorization: `Bearer ${accessToken}` } }),
    "TikTok creator_info",
  )) as { data: CreatorInfo };
  return res.data;
}

const DEFAULT_SETTINGS: TikTokSettings = { privacyLevel: "SELF_ONLY", disableComment: true, disableDuet: true, disableStitch: true };

export const tiktokConnector: Connector = {
  platform: "tiktok",
  scopes: TT_SCOPES,
  configured: () => !!config.tiktok.clientKey() && !!config.tiktok.clientSecret(),
  approvalNotice: () =>
    config.tiktok.audited() ? null : "Pending TikTok app audit: posts are published as private (SELF_ONLY) and only up to 5 creators can post per 24h.",
  authorizeUrl({ state, redirectUri }) {
    const q = new URLSearchParams({ client_key: config.tiktok.clientKey(), scope: TT_SCOPES.join(","), response_type: "code", redirect_uri: redirectUri, state });
    return `${TT_AUTHORIZE_URL}?${q}`;
  },
  async exchangeCode({ code, redirectUri }, f: FetchLike = fetch) {
    const body = new URLSearchParams({
      client_key: config.tiktok.clientKey(),
      client_secret: config.tiktok.clientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const tok = (await expectOk(await f(TT_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }), "TikTok token")) as {
      open_id: string;
      access_token: string;
      refresh_token: string;
      expires_in: number;
      refresh_expires_in: number;
      scope: string;
    };
    let username: string | null = null;
    let creator: CreatorInfo | null = null;
    try {
      creator = await queryCreatorInfo(tok.access_token, f);
      username = creator.creator_username ?? creator.creator_nickname ?? null;
    } catch {
      /* the account may not be eligible yet; surfaced later */
    }
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
      refreshExpiresAt: new Date(Date.now() + tok.refresh_expires_in * 1000),
      scopes: tok.scope,
      externalUserId: tok.open_id,
      username,
      meta: { creator },
    };
  },
  async refresh(refreshToken, f: FetchLike = fetch) {
    const body = new URLSearchParams({
      client_key: config.tiktok.clientKey(),
      client_secret: config.tiktok.clientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const tok = (await expectOk(await f(TT_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }), "TikTok refresh")) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      refresh_expires_in: number;
    };
    return {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresAt: new Date(Date.now() + tok.expires_in * 1000),
      refreshExpiresAt: new Date(Date.now() + tok.refresh_expires_in * 1000),
    };
  },
  preview(input: PublishInput): PreviewRequest[] {
    const settings = input.tiktok ?? DEFAULT_SETTINGS;
    const audited = config.tiktok.audited();
    const reqs: PreviewRequest[] = [{ method: "POST", url: `${TT_API}/post/publish/creator_info/query/` }];
    if (input.mediaType === "video") {
      reqs.push({ method: "POST", url: `${TT_API}/post/publish/video/init/`, body: buildVideoInitBody(input.caption, settings, 0, audited) });
      reqs.push({ method: "PUT", url: "<upload_url from init>", note: "single-chunk FILE_UPLOAD of the rendered mp4" });
    } else {
      reqs.push({ method: "POST", url: `${TT_API}/post/publish/content/init/`, body: buildPhotoInitBody(input.caption, settings, input.mediaUrl ?? "<media url>", audited) });
    }
    return reqs;
  },
  async publish(input, account, f: FetchLike = fetch) {
    if (!input.mediaIsReal || !input.mediaUrl) throw new ConnectorError("TikTok needs real media - configure a media provider (FAL_KEY).", 400, false);
    const settings = input.tiktok;
    if (!settings) throw new ConnectorError("TikTok post has not been approved with privacy settings", 400, false);
    const audited = config.tiktok.audited();
    const auth = { ...JSON_HEADERS, Authorization: `Bearer ${account.accessToken}` };
    const creator = await queryCreatorInfo(account.accessToken, f);
    if (input.mediaType === "video") {
      const { bytes } = await download(input.mediaUrl, f);
      const init = (await expectOk(
        await f(`${TT_API}/post/publish/video/init/`, { method: "POST", headers: auth, body: JSON.stringify(buildVideoInitBody(input.caption, settings, bytes.byteLength, audited, creator.privacy_level_options)) }),
        "TikTok video init",
      )) as { data: { publish_id: string; upload_url: string } };
      const put = await f(init.data.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.byteLength), "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}` },
        body: bytes as BodyInit,
      });
      if (!put.ok) throw new ConnectorError(`TikTok upload failed (${put.status})`, put.status);
      return { status: "posted", externalId: init.data.publish_id, url: null };
    }
    // Photo posts are pulled by TikTok from a URL prefix verified in the developer portal -> serve via our proxy route.
    const init = (await expectOk(
      await f(`${TT_API}/post/publish/content/init/`, { method: "POST", headers: auth, body: JSON.stringify(buildPhotoInitBody(input.caption, settings, input.mediaUrl, audited, creator.privacy_level_options)) }),
      "TikTok photo init",
    )) as { data: { publish_id: string } };
    return { status: "posted", externalId: init.data.publish_id, url: null };
  },
};
