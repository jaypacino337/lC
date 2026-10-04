import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { CharacterSheet } from "../content/types";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  wallet: text("wallet").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  wallet: text("wallet").notNull(),
  message: text("message").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

export type Cadence = { x: number; tiktok: number; instagram: number };

export const influencers = pgTable(
  "influencers",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    ownerWallet: text("owner_wallet").notNull(),
    mint: text("mint").notNull(),
    tokenName: text("token_name").notNull(),
    tokenSymbol: text("token_symbol").notNull(),
    tokenImage: text("token_image"),
    tokenSource: text("token_source").notNull().default("pump"), // pump | dex
    personaPrompt: text("persona_prompt").notNull(),
    character: jsonb("character").$type<CharacterSheet>().notNull(),
    characterSource: text("character_source").notNull().default("template"), // claude | template
    referenceImageUrl: text("reference_image_url"),
    seed: integer("seed").notNull(),
    paused: boolean("paused").notNull().default(false),
    cadence: jsonb("cadence").$type<Cadence>().notNull(),
    graduated: boolean("graduated").notNull().default(false),
    graduatedAt: ts("graduated_at"),
    graduationReason: text("graduation_reason"),
    graduationCheckedAt: ts("graduation_checked_at"),
    marketCapUsd: integer("market_cap_usd"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("influencers_slug_idx").on(t.slug), uniqueIndex("influencers_mint_idx").on(t.mint), index("influencers_owner_idx").on(t.ownerWallet)],
);

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text("id").primaryKey(),
    influencerId: text("influencer_id").notNull().references(() => influencers.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // x | tiktok | instagram
    externalUserId: text("external_user_id").notNull(),
    username: text("username"),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: ts("expires_at"),
    refreshExpiresAt: ts("refresh_expires_at"),
    scopes: text("scopes"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("social_accounts_inf_platform_idx").on(t.influencerId, t.platform)],
);

export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  wallet: text("wallet").notNull(),
  influencerId: text("influencer_id").notNull(),
  platform: text("platform").notNull(),
  codeVerifier: text("code_verifier").notNull(),
  expiresAt: ts("expires_at").notNull(),
});

export type PostStatus = "queued" | "awaiting_approval" | "posting" | "posted" | "dry_run" | "failed" | "skipped";

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    influencerId: text("influencer_id").notNull().references(() => influencers.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    planDate: text("plan_date").notNull(), // YYYY-MM-DD (UTC)
    slot: integer("slot").notNull(),
    scheduledFor: ts("scheduled_for").notNull(),
    status: text("status").$type<PostStatus>().notNull().default("queued"),
    caption: text("caption").notNull(),
    mediaPrompt: text("media_prompt").notNull(),
    mediaType: text("media_type").notNull().default("image"), // image | video | none
    mediaUrl: text("media_url"),
    mediaJob: jsonb("media_job").$type<Record<string, unknown>>(),
    location: text("location"),
    tiktokSettings: jsonb("tiktok_settings").$type<Record<string, unknown>>(),
    approvedAt: ts("approved_at"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at"),
    lastError: text("last_error"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    requestPreview: jsonb("request_preview").$type<unknown>(),
    postedAt: ts("posted_at"),
    source: text("source").notNull().default("template"), // claude | template
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("posts_slot_idx").on(t.influencerId, t.platform, t.planDate, t.slot),
    index("posts_due_idx").on(t.status, t.scheduledFor),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    wallet: text("wallet").notNull(),
    influencerId: text("influencer_id"),
    kind: text("kind").notNull(), // graduation | post_failed | account | info
    title: text("title").notNull(),
    body: text("body").notNull(),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_wallet_idx").on(t.wallet)],
);

export type Influencer = typeof influencers.$inferSelect;
export type NewInfluencer = typeof influencers.$inferInsert;
export type SocialAccount = typeof socialAccounts.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
