CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "influencers" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"owner_wallet" text NOT NULL,
	"mint" text NOT NULL,
	"token_name" text NOT NULL,
	"token_symbol" text NOT NULL,
	"token_image" text,
	"token_source" text DEFAULT 'pump' NOT NULL,
	"persona_prompt" text NOT NULL,
	"character" jsonb NOT NULL,
	"character_source" text DEFAULT 'template' NOT NULL,
	"reference_image_url" text,
	"seed" integer NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"cadence" jsonb NOT NULL,
	"graduated" boolean DEFAULT false NOT NULL,
	"graduated_at" timestamp with time zone,
	"graduation_reason" text,
	"graduation_checked_at" timestamp with time zone,
	"market_cap_usd" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"influencer_id" text,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"influencer_id" text NOT NULL,
	"platform" text NOT NULL,
	"code_verifier" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"influencer_id" text NOT NULL,
	"platform" text NOT NULL,
	"plan_date" text NOT NULL,
	"slot" integer NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"caption" text NOT NULL,
	"media_prompt" text NOT NULL,
	"media_type" text DEFAULT 'image' NOT NULL,
	"media_url" text,
	"media_job" jsonb,
	"location" text,
	"tiktok_settings" jsonb,
	"approved_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"external_id" text,
	"external_url" text,
	"request_preview" jsonb,
	"posted_at" timestamp with time zone,
	"source" text DEFAULT 'template' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"influencer_id" text NOT NULL,
	"platform" text NOT NULL,
	"external_user_id" text NOT NULL,
	"username" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"refresh_expires_at" timestamp with time zone,
	"scopes" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"wallet" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_influencer_id_influencers_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_influencer_id_influencers_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "influencers_slug_idx" ON "influencers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "influencers_mint_idx" ON "influencers" USING btree ("mint");--> statement-breakpoint
CREATE INDEX "influencers_owner_idx" ON "influencers" USING btree ("owner_wallet");--> statement-breakpoint
CREATE INDEX "notifications_wallet_idx" ON "notifications" USING btree ("wallet");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slot_idx" ON "posts" USING btree ("influencer_id","platform","plan_date","slot");--> statement-breakpoint
CREATE INDEX "posts_due_idx" ON "posts" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_inf_platform_idx" ON "social_accounts" USING btree ("influencer_id","platform");