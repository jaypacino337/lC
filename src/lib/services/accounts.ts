import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { socialAccounts, type SocialAccount } from "../db/schema";
import { decrypt, encrypt } from "../crypto";
import type { Platform } from "../config";
import { getConnector, type AccountContext, type FetchLike, type TokenSet } from "../social";
import { newId } from "./ids";

/** Persist tokens encrypted (AES-256-GCM). Plaintext tokens never leave the server. */
export async function saveAccount(db: DB, influencerId: string, platform: Platform, t: TokenSet) {
  const values = {
    externalUserId: t.externalUserId,
    username: t.username ?? null,
    accessTokenEnc: encrypt(t.accessToken),
    refreshTokenEnc: t.refreshToken ? encrypt(t.refreshToken) : null,
    expiresAt: t.expiresAt ?? null,
    refreshExpiresAt: t.refreshExpiresAt ?? null,
    scopes: t.scopes ?? null,
    meta: t.meta ?? {},
    updatedAt: new Date(),
  };
  await db
    .insert(socialAccounts)
    .values({ id: newId(), influencerId, platform, ...values })
    .onConflictDoUpdate({ target: [socialAccounts.influencerId, socialAccounts.platform], set: values });
}

export async function removeAccount(db: DB, influencerId: string, platform: string) {
  await db.delete(socialAccounts).where(and(eq(socialAccounts.influencerId, influencerId), eq(socialAccounts.platform, platform)));
}

export async function getAccount(db: DB, influencerId: string, platform: string): Promise<SocialAccount | null> {
  const [row] = await db.select().from(socialAccounts).where(and(eq(socialAccounts.influencerId, influencerId), eq(socialAccounts.platform, platform))).limit(1);
  return row ?? null;
}

/** Public-safe view of an account (no tokens). */
export function publicAccount(a: SocialAccount) {
  return { platform: a.platform, username: a.username, externalUserId: a.externalUserId, expiresAt: a.expiresAt, scopes: a.scopes, connectedAt: a.createdAt };
}

const REFRESH_WINDOW_MS = 10 * 60_000;

/** Decrypt tokens and refresh them if they expire soon. */
export async function accountContext(db: DB, acct: SocialAccount, f: FetchLike = fetch, now = new Date()): Promise<AccountContext> {
  let accessToken = decrypt(acct.accessTokenEnc);
  const expSoon = acct.expiresAt && acct.expiresAt.getTime() - now.getTime() < REFRESH_WINDOW_MS;
  if (expSoon) {
    const connector = getConnector(acct.platform);
    const refreshWith = acct.platform === "instagram" ? accessToken : acct.refreshTokenEnc ? decrypt(acct.refreshTokenEnc) : null;
    if (connector && refreshWith) {
      const next = await connector.refresh(refreshWith, f);
      accessToken = next.accessToken;
      await db
        .update(socialAccounts)
        .set({
          accessTokenEnc: encrypt(next.accessToken),
          refreshTokenEnc: next.refreshToken ? encrypt(next.refreshToken) : acct.refreshTokenEnc,
          expiresAt: next.expiresAt ?? null,
          refreshExpiresAt: next.refreshExpiresAt ?? acct.refreshExpiresAt,
          updatedAt: now,
        })
        .where(eq(socialAccounts.id, acct.id));
    }
  }
  return { accessToken, externalUserId: acct.externalUserId, username: acct.username, meta: acct.meta };
}
