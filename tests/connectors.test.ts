import { afterEach, describe, expect, it, vi } from "vitest";
import { xConnector, buildTweetBody } from "@/lib/social/x";
import { buildPhotoInitBody, buildVideoInitBody, resolvePrivacyLevel, tiktokConnector } from "@/lib/social/tiktok";
import { buildContainerParams, instagramConnector } from "@/lib/social/instagram";
import { ConnectorError } from "@/lib/social/types";
import { jsonRes, mockFetch } from "./helpers";

afterEach(() => vi.unstubAllEnvs());
const acct = { accessToken: "AT", externalUserId: "1789", username: "mothy" };
const settings = { privacyLevel: "PUBLIC_TO_EVERYONE", disableComment: false, disableDuet: true, disableStitch: true };

describe("X connector", () => {
  it("builds a PKCE authorize URL with the right scopes", () => {
    vi.stubEnv("X_CLIENT_ID", "cid");
    const u = new URL(xConnector.authorizeUrl({ state: "st", codeChallenge: "ch", redirectUri: "https://app/cb" }));
    expect(u.origin + u.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toBe("tweet.read tweet.write users.read media.write offline.access");
    expect(u.searchParams.get("client_id")).toBe("cid");
  });
  it("exchanges the code with Basic auth + verifier", async () => {
    vi.stubEnv("X_CLIENT_ID", "cid");
    vi.stubEnv("X_CLIENT_SECRET", "sec");
    const { f, calls } = mockFetch([
      ["https://api.x.com/2/oauth2/token", () => jsonRes({ access_token: "AT", refresh_token: "RT", expires_in: 7200, scope: "tweet.write" })],
      ["https://api.x.com/2/users/me", () => jsonRes({ data: { id: "42", username: "mothy", name: "Moth" } })],
    ]);
    const t = await xConnector.exchangeCode({ code: "c", codeVerifier: "v", redirectUri: "https://app/cb" }, f);
    expect(t).toMatchObject({ accessToken: "AT", refreshToken: "RT", externalUserId: "42", username: "mothy" });
    const body = new URLSearchParams(calls[0].init!.body as URLSearchParams);
    expect(body.get("code_verifier")).toBe("v");
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
  });
  it("uploads media then creates the post", async () => {
    const { f, calls } = mockFetch([
      ["https://cdn.example/img.jpg", () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })],
      ["https://api.x.com/2/media/upload", () => jsonRes({ data: { id: "m1" } })],
      ["https://api.x.com/2/tweets", () => jsonRes({ data: { id: "t1" } })],
    ]);
    const r = await xConnector.publish({ caption: "hi", mediaUrl: "https://cdn.example/img.jpg", mediaType: "image", mediaIsReal: true }, acct, f);
    expect(r).toEqual({ status: "posted", externalId: "t1", url: "https://x.com/mothy/status/t1" });
    expect(JSON.parse(calls[2].init!.body as string)).toEqual(buildTweetBody("hi", "m1"));
    expect((calls[2].init!.headers as Record<string, string>).Authorization).toBe("Bearer AT");
  });
  it("posts text-only for placeholder media and surfaces 429 as retryable", async () => {
    const { f, calls } = mockFetch([["https://api.x.com/2/tweets", () => jsonRes({ title: "Too Many Requests" }, 429)]]);
    const p = xConnector.publish({ caption: "hi", mediaUrl: "/api/media/placeholder", mediaType: "image", mediaIsReal: false }, acct, f);
    await expect(p).rejects.toMatchObject({ status: 429, retryable: true });
    expect(calls).toHaveLength(1);
  });
});

describe("TikTok connector", () => {
  it("forces SELF_ONLY until the app is audited", () => {
    expect(resolvePrivacyLevel("PUBLIC_TO_EVERYONE", ["PUBLIC_TO_EVERYONE"], false)).toBe("SELF_ONLY");
    expect(resolvePrivacyLevel("PUBLIC_TO_EVERYONE", ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], true)).toBe("PUBLIC_TO_EVERYONE");
    expect(() => resolvePrivacyLevel("FOLLOWER_OF_CREATOR", ["SELF_ONLY"], true)).toThrow(ConnectorError);
  });
  it("builds a Direct Post video init body with the AI-generated label", () => {
    const b = buildVideoInitBody("cap #AIgenerated", settings, 1234, false);
    expect(b.post_info).toMatchObject({ privacy_level: "SELF_ONLY", is_aigc: true, disable_duet: true, disable_comment: false, brand_content_toggle: false });
    expect(b.source_info).toEqual({ source: "FILE_UPLOAD", video_size: 1234, chunk_size: 1234, total_chunk_count: 1 });
    const p = buildPhotoInitBody("cap", settings, "https://app/api/media/proxy/1", false);
    expect(p).toMatchObject({ post_mode: "DIRECT_POST", media_type: "PHOTO", source_info: { source: "PULL_FROM_URL", photo_images: ["https://app/api/media/proxy/1"] } });
  });
  it("queries creator info, inits and uploads the video", async () => {
    vi.stubEnv("TIKTOK_APP_AUDITED", "true");
    const { f, calls } = mockFetch([
      [/creator_info\/query/, () => jsonRes({ data: { creator_nickname: "Moth", privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] }, error: { code: "ok" } })],
      ["https://cdn.example/v.mp4", () => new Response(new Uint8Array(10), { headers: { "content-type": "video/mp4" } })],
      [/video\/init/, () => jsonRes({ data: { publish_id: "pub_1", upload_url: "https://upload.tiktok/u1" } })],
      ["https://upload.tiktok/u1", () => new Response(null, { status: 201 })],
    ]);
    const r = await tiktokConnector.publish({ caption: "c", mediaUrl: "https://cdn.example/v.mp4", mediaType: "video", mediaIsReal: true, tiktok: settings }, acct, f);
    expect(r).toMatchObject({ status: "posted", externalId: "pub_1" });
    const init = JSON.parse(calls[2].init!.body as string);
    expect(init.post_info.privacy_level).toBe("PUBLIC_TO_EVERYONE");
    expect((calls[3].init!.headers as Record<string, string>)["Content-Range"]).toBe("bytes 0-9/10");
  });
  it("refuses unapproved posts and placeholder media (non-retryable)", async () => {
    const { f } = mockFetch([]);
    await expect(tiktokConnector.publish({ caption: "c", mediaUrl: "https://x/v.mp4", mediaType: "video", mediaIsReal: true, tiktok: null }, acct, f)).rejects.toMatchObject({ retryable: false });
    await expect(tiktokConnector.publish({ caption: "c", mediaUrl: "/p.svg", mediaType: "video", mediaIsReal: false, tiktok: settings }, acct, f)).rejects.toMatchObject({ retryable: false });
  });
  it("reports pending audit honestly", () => {
    vi.stubEnv("TIKTOK_APP_AUDITED", "false");
    expect(tiktokConnector.approvalNotice()).toMatch(/Pending TikTok app audit/);
  });
});

describe("Instagram connector", () => {
  it("builds container params (image vs reel) with AI disclosure", () => {
    expect(buildContainerParams({ caption: "c", mediaUrl: "https://m/i.jpg", mediaType: "image" })).toEqual({ caption: "c", is_ai_generated: "true", image_url: "https://m/i.jpg" });
    expect(buildContainerParams({ caption: "c", mediaUrl: "https://m/v.mp4", mediaType: "video" })).toMatchObject({ media_type: "REELS", video_url: "https://m/v.mp4" });
  });
  it("creates container -> waits FINISHED -> publishes", async () => {
    let polls = 0;
    const { f, calls } = mockFetch([
      [/\/1789\/media\?|\/1789\/media$/, () => jsonRes({ id: "c1" })],
      [/\/c1\?fields=status_code/, () => jsonRes({ status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" })],
      [/\/1789\/media_publish/, () => jsonRes({ id: "media9" })],
      [/\/media9\?fields=permalink/, () => jsonRes({ permalink: "https://instagram.com/p/x" })],
    ]);
    const r = await instagramConnector.publish({ caption: "c", mediaUrl: "https://m/v.mp4", mediaType: "video", mediaIsReal: true }, acct, f);
    expect(r).toEqual({ status: "posted", externalId: "media9", url: "https://instagram.com/p/x" });
    expect(calls[0].url).toBe("https://graph.instagram.com/v23.0/1789/media");
    const body = new URLSearchParams(calls[0].init!.body as URLSearchParams);
    expect(body.get("media_type")).toBe("REELS");
    expect(body.get("access_token")).toBe("AT");
    expect(new URLSearchParams(calls.at(-2)!.init!.body as URLSearchParams).get("creation_id")).toBe("c1");
  });
  it("exchanges code -> long-lived token -> profile", async () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "app");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "sec");
    const { f, calls } = mockFetch([
      ["https://api.instagram.com/oauth/access_token", () => jsonRes({ data: [{ access_token: "short", user_id: "17", permissions: "instagram_business_basic,instagram_business_content_publish" }] })],
      ["https://graph.instagram.com/access_token", () => jsonRes({ access_token: "long", expires_in: 5184000 })],
      [/graph\.instagram\.com\/v23\.0\/me/, () => jsonRes({ user_id: "1789", username: "mothy" })],
    ]);
    const t = await instagramConnector.exchangeCode({ code: "abc#_", codeVerifier: "", redirectUri: "https://app/cb" }, f);
    expect(t).toMatchObject({ accessToken: "long", externalUserId: "1789", username: "mothy" });
    expect(new URLSearchParams(calls[0].init!.body as URLSearchParams).get("code")).toBe("abc");
    expect(calls[1].url).toContain("grant_type=ig_exchange_token");
  });
});
