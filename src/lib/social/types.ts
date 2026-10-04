import type { Platform } from "../config";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TokenSet {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  refreshExpiresAt?: Date | null;
  scopes?: string | null;
  externalUserId: string;
  username?: string | null;
  meta?: Record<string, unknown>;
}

export interface TikTokSettings {
  privacyLevel: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
}

export interface PublishInput {
  caption: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | "none";
  /** False for placeholder media: the connector posts text-only where possible, or refuses. */
  mediaIsReal: boolean;
  tiktok?: TikTokSettings | null;
  /** Resumable state for multi-step publishes (e.g. Instagram video containers). */
  job?: Record<string, unknown> | null;
}

export type PublishResult =
  | { status: "posted"; externalId: string; url?: string | null }
  | { status: "pending"; job: Record<string, unknown> };

/** A request as it would be sent, with secrets removed - stored for DRY_RUN previews. */
export interface PreviewRequest {
  method: string;
  url: string;
  body?: unknown;
  note?: string;
}

export interface AccountContext {
  accessToken: string;
  externalUserId: string;
  username?: string | null;
  meta?: Record<string, unknown>;
}

export interface Connector {
  platform: Platform;
  scopes: string[];
  configured(): boolean;
  /** Human-readable approval state shown in the dashboard, e.g. "pending TikTok app audit". */
  approvalNotice(): string | null;
  authorizeUrl(p: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }, f?: FetchLike): Promise<TokenSet>;
  refresh(refreshToken: string, f?: FetchLike): Promise<Partial<TokenSet> & { accessToken: string }>;
  preview(input: PublishInput, account: Pick<AccountContext, "externalUserId" | "username">): PreviewRequest[];
  publish(input: PublishInput, account: AccountContext, f?: FetchLike): Promise<PublishResult>;
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly status: number = 0,
    /** Retryable errors (429/5xx/network) get exponential backoff; others fail fast. */
    public readonly retryable: boolean = status === 0 || status === 429 || status >= 500,
  ) {
    super(message);
  }
}

export async function expectOk(res: Response, what: string): Promise<unknown> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* keep text */
  }
  if (!res.ok) throw new ConnectorError(`${what} failed (${res.status}): ${text.slice(0, 300)}`, res.status);
  return body;
}

export async function download(url: string, f: FetchLike): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await f(url, {});
  if (!res.ok) throw new ConnectorError(`media download failed (${res.status})`, res.status);
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") || "application/octet-stream" };
}
