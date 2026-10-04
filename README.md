# GlowPad: graduate to glow up

GlowPad turns any Solana memecoin into an AI influencer. You **launch a coin on pump.fun from GlowPad** (signed in your own wallet) or **paste any existing contract address**, then describe a character in one sentence. GlowPad writes a character sheet, gives it a consistent face, and runs a daily posting plan.

- **Before graduation:** the influencer posts on **X**.
- **When the coin graduates** (pump.fun bonding curve completes and the coin migrates to a real pool), GlowPad unlocks **TikTok and Instagram** for it, notifies the creator, and starts planning several posts a day on all three.

Brand: **GlowPad**, ticker **$GLOWPAD**. The name was picked after collision checks on pump.fun and DexScreener (zero matches for `GLOWPAD` on either at the time of the check).

> Status: the full product runs end to end in **DRY_RUN** mode (the default). Live posting needs platform developer apps, and TikTok and Instagram also need platform approval. See [Platform setup](#platform-setup).

---

## Contents

- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Launching tokens (user-signed)](#launching-tokens-user-signed)
- [Platform setup](#platform-setup) (X, TikTok, Meta/Instagram)
- [Costs](#costs)
- [Deploying to Vercel](#deploying-to-vercel)
- [Architecture](#architecture)
- [Testing and verification](#testing-and-verification)
- [Where this repo lives](#where-this-repo-lives)

---

## How it works

1. **Pick a token.** Either:
   - **Launch on pump.fun from GlowPad.** You enter name, ticker, description, image, socials and an optional dev buy. Your browser creates the mint key, PumpPortal builds an *unsigned* create transaction, GlowPad simulates it and shows a cost summary, and you sign in your wallet. The server checks the launch on-chain before listing it.
   - **Paste a contract address.** GlowPad validates it against pump.fun's coin API and DexScreener.
2. **Give it a soul.** One sentence becomes a character sheet: name, look, voice, backstory, posting style, recurring places and catchphrases. Claude writes the sheet when `ANTHROPIC_API_KEY` is set. Without a key, a deterministic template writes it. Personas that impersonate real people are blocked.
3. **Let it post.** The creator proves wallet ownership by signing a message (a signature, not a transaction), then connects X. A daily planner queues posts (caption, media prompt and platform) and a scheduler publishes them on the creator's cadence. At graduation, TikTok and Instagram unlock.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: everything has safe defaults locally
npm run dev                  # http://localhost:3000
```

With no environment set, the app uses:

- an embedded **PGlite** Postgres, in memory, migrated automatically
- the **template** persona generator
- the free **placeholder** media provider
- **DRY_RUN** mode

Scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (next/core-web-vitals + TypeScript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit and integration tests (PGlite, mocked fetch) |
| `npm run db:generate` | Generate SQL migrations from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply `./drizzle` migrations to `DATABASE_URL` |
| `npm run verify` | lint, typecheck, test and build |

Try the pipeline locally in DRY_RUN:

```bash
# 1) Create an influencer: use the UI at /create, or the dev seeding route:
curl -X POST localhost:3000/api/dev/seed -H 'content-type: application/json' \
  -d '{"mint":"<any pump.fun mint>","wallet":"<your wallet>","sentence":"a frog who loves road trips"}'
# 2) Plan today and publish what's due (dev-only ?now= time travel)
curl localhost:3000/api/cron/plan
curl "localhost:3000/api/cron/publish?now=2030-01-01T23:59:00Z"
# 3) Check graduation
curl localhost:3000/api/cron/graduation
```

To simulate a graduation without waiting for a real one, run the local test double: `node scripts/mock-upstream.mjs`. Then start the app with `PUMP_API_BASE=http://localhost:4010/pump DEXSCREENER_API_BASE=http://localhost:4010/dex`, create an influencer for the simulated mint `GLoWSimMint1111111111111111111111111111pump`, and `curl -X POST localhost:4010/__graduate/<mint>`.

## Environment variables

Everything is listed in [`.env.example`](.env.example).

| Variable | Required | Purpose |
| --- | --- | --- |
| `APP_URL` | prod | Public base URL. Used to build OAuth redirect URIs (`$APP_URL/api/connect/<platform>/callback`) and media links. |
| `DATABASE_URL` | prod | Postgres connection string (Neon, Supabase, Vercel Postgres, …). Empty means embedded PGlite. |
| `PGLITE_DATA_DIR` | no | Persist PGlite to disk locally. |
| `TOKEN_ENCRYPTION_KEY` | prod | 32-byte key (base64 or hex) for AES-256-GCM encryption of OAuth tokens at rest. |
| `SESSION_SECRET` | prod | HMAC secret for the wallet session cookie. |
| `CRON_SECRET` | prod | Bearer secret for `/api/cron/*`. Vercel Cron sends it automatically. |
| `DRY_RUN` | no | Default `true`. While on, connectors log the exact requests they would send (stored on each post as `requestPreview`). |
| `X_DRY_RUN`, `TIKTOK_DRY_RUN`, `INSTAGRAM_DRY_RUN` | no | Per-platform overrides. |
| `ALLOW_DEV_ROUTES` | no | Enables `/api/dev/seed` and `?now=` on cron routes in production. Leave off. |
| `NEXT_PUBLIC_X_URL` | no | Target of the "Follow on X" link. |
| `ANTHROPIC_API_KEY` | no | Turns on Claude for personas, impersonation review and daily captions. |
| `ANTHROPIC_MODEL` | no | Default `claude-opus-5-5`. |
| `PLANNER_USE_CLAUDE` | no | `false` keeps Claude for personas only. |
| `MEDIA_PROVIDER` | no | `placeholder` or `fal`. Defaults to `fal` when `FAL_KEY` is set. |
| `FAL_KEY` | for real media | fal.ai key. |
| `FAL_PORTRAIT_MODEL`, `FAL_IMAGE_MODEL`, `FAL_VIDEO_MODEL` | no | Model overrides. |
| `SOLANA_RPC_URL` | recommended | Server-side RPC used for simulation, sending and launch verification. The browser reaches it through `/api/rpc`, so a keyed URL (Helius, Triton, …) stays private. |
| `PUMP_API_BASE`, `DEXSCREENER_API_BASE` | no | Upstream overrides (tests and mocks). |
| `PUMP_IPFS_URL`, `PUMPPORTAL_TRADE_LOCAL_URL` | no | Launch upstream overrides. |
| `PINATA_JWT` | no | Fallback IPFS pinning if pump.fun's upload endpoint is down. |
| `GRADUATION_MIN_DEX_LIQUIDITY_USD` | no | Default `10000`. DEX liquidity at which a non-pump.fun token counts as graduated. |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | for X | X OAuth 2.0 app credentials. |
| `X_DAILY_CAP` | no | Max X posts per influencer per 24h. Default 17. Match it to your X API tier. |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | for TikTok | TikTok app credentials. |
| `TIKTOK_APP_AUDITED` | no | Default `false`, which forces `SELF_ONLY` (private) posts. Set to `true` only after TikTok approves the audit. |
| `TIKTOK_REQUIRE_APPROVAL` | no | Default `true`. The creator approves each TikTok upload, as TikTok's guidelines require. |
| `TIKTOK_DAILY_CAP` | no | Default 15, TikTok's typical per-creator Direct Post cap. |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | for IG | Instagram app credentials (Instagram API with Instagram Login). |
| `INSTAGRAM_GRAPH_VERSION` | no | Default `v23.0`. |
| `META_APP_REVIEWED` | no | Default `false`. The dashboard shows "pending Meta App Review" until you set it. |
| `INSTAGRAM_DAILY_CAP` | no | Default 25. Meta's hard limit is 100 per 24h. |

## Launching tokens (user-signed)

Hard rules the code enforces:

- **No private keys on the server, ever.** The new mint `Keypair` is generated in the browser and kept in memory in that tab. The server only receives public keys.
- **GlowPad never signs or sends a transaction for the user.** The transaction is signed by the mint keypair (in the browser) and by the user's wallet (`signTransaction`), then sent from the browser through the RPC proxy.

Flow (`src/app/create/wizard.tsx`, `src/app/api/launch/*`, `src/lib/launch/*`):

1. **Metadata.** `POST /api/launch/ipfs` checks the image (PNG, JPEG, GIF or WebP, 4 MB max) and the fields, applies a rate limit, then proxies a multipart upload to `https://pump.fun/api/ipfs` (`file, name, symbol, description, twitter, telegram, website, showName=true`) and returns `metadataUri`. PumpPortal's docs say this endpoint is deprecated. It still answered when this was built, so `PINATA_JWT` enables a Pinata fallback.
2. **Unsigned transaction.** `POST /api/launch/tx` validates the request (the signing wallet must be the signed-in wallet; dev buy is capped at 5 SOL) and calls PumpPortal's Local Transaction API, `POST https://pumpportal.fun/api/trade-local`, with `{ publicKey, action: "create", tokenMetadata: {name, symbol, uri}, mint: <mint PUBLIC key>, denominatedInSol: "true", amount: devBuy, slippage, priorityFee, pool: "pump" }`. It returns the serialized `VersionedTransaction`.
3. **Checks and simulation.** The browser deserializes the transaction and checks that the fee payer is the user and that the mint is the generated key. It then runs `simulateTransaction` (with `replaceRecentBlockhash`) and shows a **cost summary**: about 0.025 SOL of network rent and fees, the priority fee, the dev buy, and the **PumpPortal fee of 0.5% of the dev buy** (0 with no dev buy). pump.fun's own trading fee also applies to the dev buy. A dev buy above 0 shows a warning.
4. **Signing.** The user signs in the wallet. The browser sends the transaction and polls until it confirms.
5. **Verification.** `POST /api/launch/complete` fetches the transaction (`getTransaction`, `jsonParsed`) and checks four things: the transaction succeeded, the claimed creator is the signing fee payer, the mint signed it (a fresh create), and the pump.fun program `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` ran with a `Create`. Only then does it register the token and create the influencer.

## Platform setup

Every OAuth redirect URI has the form `$APP_URL/api/connect/<platform>/callback`. TikTok and Meta need HTTPS, so use your deployed URL or a tunnel (for example cloudflared or ngrok) during development.

### X (Twitter): OAuth 2.0 with PKCE

1. Go to <https://developer.x.com>, open the developer portal, and create a Project and App.
2. Under **User authentication settings**, choose **OAuth 2.0**, type **Web App (confidential client)**, permissions **Read and write**.
   - Callback URI: `https://YOUR_DOMAIN/api/connect/x/callback`
   - Website URL: your site.
3. Copy the **OAuth 2.0 Client ID and Secret** into `X_CLIENT_ID` and `X_CLIENT_SECRET`.
4. Scopes requested: `tweet.read tweet.write users.read media.write offline.access`. GlowPad posts with `POST https://api.x.com/2/tweets` and uploads images with `POST https://api.x.com/2/media/upload`.
5. **Access and pricing:** X API access is paid and tiered, and the tiers change often. Check the developer portal for your write limits and set `X_DAILY_CAP` to match.
   - Timeline: usually same-day once billing is set up.
   - Limitation: clips are posted to X as text only for now, because X video needs chunked upload, which isn't built yet.

### TikTok: Login Kit + Content Posting API (Direct Post)

1. Create an app at <https://developers.tiktok.com> and add the **Login Kit** and **Content Posting API** products. Turn on **Direct Post**.
2. **Redirect URI:** `https://YOUR_DOMAIN/api/connect/tiktok/callback`.
   - Scopes: `user.info.basic`, `video.publish`.
3. **Verify your domain or URL prefix** for `PULL_FROM_URL`. Photo posts are pulled from `https://YOUR_DOMAIN/api/media/proxy/`. Videos are uploaded with `FILE_UPLOAD`, so they don't need this.
4. Copy the Client key and secret into `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.
5. **App review:** submit the app with a demo video of the connect and approve flow. This usually takes days to a couple of weeks.
6. **Content Posting API audit:** this is what lifts the "private only" restriction. Until it passes:
   - every post is `SELF_ONLY` (visible only to the creator)
   - at most 5 creators can post per 24h
   - creator accounts must be private

   GlowPad forces `SELF_ONLY` and shows **"Pending TikTok app audit"** while `TIKTOK_APP_AUDITED=false`. The audit typically takes **1 to 4+ weeks** and requires compliance with the UX guidelines below.
7. **UX rules GlowPad implements**, from TikTok's content-sharing guidelines:
   - The approval card shows the creator's nickname.
   - Privacy is picked by the creator from the `creator_info` options, with no default.
   - Comment, duet and stitch are off by default, and greyed out when the creator has disabled them.
   - The creator gives explicit consent per upload, including the Music Usage Confirmation.
   - The caption is editable.
   - No watermark is added.
   - Posts are labelled with `is_aigc: true` and `#AIgenerated`.
8. Limits: about 15 Direct Posts per creator per day (`TIKTOK_DAILY_CAP`) and 6 requests per minute per user token. Access tokens last 24h and refresh tokens 365 days; GlowPad refreshes them automatically.

### Instagram: Instagram API with Instagram Login (professional accounts)

1. Create an app at <https://developers.facebook.com> (type **Business**) and add the **Instagram** product. Choose **API setup with Instagram login**.
2. Copy the **Instagram app ID and secret** into `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`.
3. Under **Business login settings**, add the OAuth redirect URI `https://YOUR_DOMAIN/api/connect/instagram/callback`.
   - Scopes: `instagram_business_basic`, `instagram_business_content_publish`.
4. **Development mode:** only Instagram accounts added under **App roles → Instagram testers** (and accepted in the Instagram app) can connect. The accounts must be **Business or Creator** accounts.
5. **App Review:** request Advanced Access for both scopes, with a screencast and a privacy policy URL. Complete **Business Verification**. Expect roughly **1 to 4 weeks**. Set `META_APP_REVIEWED=true` afterwards; until then the dashboard shows **"Pending Meta App Review"**.
6. How publishing works:
   - Create a container with `POST /<IG_ID>/media` (`image_url`, or `media_type=REELS` with `video_url`), plus `caption` and `is_ai_generated=true`.
   - Poll `status_code` until it is `FINISHED` (videos).
   - Publish with `POST /<IG_ID>/media_publish`.
   - **The media must be on a public URL** (fal.ai output URLs are).
   - Meta's limit is **100 API posts per account per rolling 24h**; GlowPad caps lower.
   - Long-lived tokens last 60 days and are refreshed automatically.

## Costs

**Launching a coin** (paid by the creator's wallet):

| Item | Cost |
| --- | --- |
| Network rent and fees | about 0.02 to 0.03 SOL |
| Priority fee | 0.0005 SOL |
| Dev buy | optional, user-chosen |
| PumpPortal fee | 0.5% of the dev buy |
| pump.fun trading fee | applies to the dev buy |

GlowPad itself charges nothing.

**Media generation** (`MEDIA_PROVIDER=fal`, list prices when this was written; check fal.ai):

| Item | Model | Approx. cost |
| --- | --- | --- |
| Reference portrait (once per influencer) | FLUX.1 [dev] | ~$0.025 |
| Photo post | FLUX.1 Kontext [pro], edits the reference to keep the face | **$0.04** |
| 5-second clip | Kontext still + Kling 2.1 Standard image-to-video ($0.25) | **~$0.29** |

**Claude** (Opus 5.5, $4 / $20 per million input/output tokens):

- Persona: about $0.03 once.
- Daily captions: about $0.05 to $0.08 per influencer per day.

**Per influencer per day at the default cadence (4 / 3 / 3):**

| Stage | Breakdown | Per day |
| --- | --- | --- |
| Before graduation (X only) | 4 photos ≈ $0.16, plus Claude | ≈ **$0.22** (about $7/month) |
| After graduation | X 4 photos $0.16 + TikTok 3 clips $0.87 + Instagram 2 photos and 1 reel $0.37, plus Claude | ≈ **$1.45** (about $45/month) |

Platform API costs are separate. X API access is paid; TikTok and Instagram API access is free.

## Deploying to Vercel

1. Import the repo into Vercel (framework: Next.js).
2. Add a Postgres database (Neon, Supabase or Vercel Marketplace Postgres) and set `DATABASE_URL`.
   - PGlite is **not** persistent on serverless.
   - Run migrations, either by setting the Build Command to `npm run db:migrate && npm run build` or by running `DATABASE_URL=… npm run db:migrate` once from your machine.
3. Set these environment variables:
   - `APP_URL`, `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET`
   - `SOLANA_RPC_URL`, ideally a keyed RPC; the public one rate-limits
   - platform keys as needed
   - `DRY_RUN=false` only when you're ready to publish
4. **Cron schedules.** `vercel.json` ships **daily** schedules (plan at 00:05, graduation at 00:15, publish at 00:30 UTC) because **Vercel Hobby only allows cron jobs that run once a day**, and Hobby timing is imprecise within the hour. A real posting cadence needs one of these:
   - **Vercel Pro:** change the schedules to, for example, publish `*/10 * * * *`, graduation `*/15 * * * *`, plan `5 0 * * *`.
   - **An external scheduler** (GitHub Actions, cron-job.org, Upstash QStash) that calls `GET https://YOUR_DOMAIN/api/cron/publish` with `Authorization: Bearer $CRON_SECRET` every 5 to 10 minutes.
5. Cron routes set `maxDuration = 300`. Hobby functions may be capped lower. fal jobs are asynchronous, so a post that is still rendering is picked up on the next run.

## Architecture

```
src/
  app/                      Next.js App Router pages and API routes
    api/auth/*              wallet sign-in (nonce -> signMessage -> HttpOnly session cookie)
    api/token/[mint]        pump.fun + DexScreener validation, graduation state
    api/persona             one sentence -> character sheet (guarded)
    api/influencers/*       create/list/manage, plan now, disconnect accounts
    api/posts/[id]          approve (TikTok), edit, skip, retry
    api/connect/[p]/*       OAuth start/callback (PKCE state stored server-side)
    api/launch/*            IPFS proxy, unsigned create tx, on-chain verification
    api/cron/*              plan, publish, graduation (CRON_SECRET)
    api/rpc                 allow-listed Solana RPC proxy
    api/media/*             placeholder SVG renderer, media proxy for TikTok PULL_FROM_URL
  lib/
    content/                persona (Claude + template), planner, cadence
    guard/                  impersonation deny-list, caption filter, AI disclosure
    social/                 x.ts, tiktok.ts, instagram.ts connectors (+ DRY_RUN previews)
    media/                  MediaProvider interface, placeholder + fal.ai adapters
    scheduler.ts            pure cadence / rate-limit / backoff decisions
    services/               DB-backed planner, publisher, graduation watcher, accounts
    launch/                 PumpPortal payload, cost summary, tx verification
    db/                     Drizzle schema, Postgres or PGlite client
drizzle/                    SQL migrations
tests/                      Vitest suites
scripts/                    migrate.ts, mock-upstream.mjs (local pump/dex/ipfs double)
```

**Guardrails:**

- **Real people:** personas are checked against a deny-list of real people and impersonation phrases. When a key is set, Claude also reviews each persona and flags real-person likeness.
- **Captions:** filtered sentence by sentence. Anything about price, charts, buying or selling, returns, multipliers or "moon", plus profanity and real names, is removed.
- **AI disclosure on every post:** X captions end in "(AI-generated character)". TikTok posts get `#AIgenerated` and `is_aigc: true`. Instagram posts get `#AIgenerated` and `is_ai_generated=true`.

**Scheduler** (`src/lib/scheduler.ts`):

- **Cadence:** set per platform by the creator (X 1 to 8 per day; TikTok and Instagram 1 to 6), enforced as a rolling 24h cap together with the platform daily caps.
- **Pacing:** a minimum gap between posts (X 30 minutes; TikTok and Instagram 60 minutes) and a per-run budget per platform.
- **Retries:** exponential backoff of 5m, 10m, 20m and so on, capped at 6h, for 5 attempts. Non-retryable errors fail fast and notify the creator.
- **Pause:** a pause button holds all of the influencer's posts.

**Consistent identity:** each influencer has a stored reference portrait and seed. The fal adapter edits that portrait into each new scene (FLUX Kontext) and animates the result for clips. Placeholder mode draws the same face from the seed.

## Testing and verification

`npm test` runs these suites:

| Suite | What it checks |
| --- | --- |
| `persona` | template fallback is deterministic and schema-valid; real people are blocked |
| `graduation` | detection rules, plus the watcher unlocking TikTok and Instagram, notifying and planning, against mocked endpoints and a real PGlite DB |
| `scheduler` | cadence, caps, spacing, per-run budget, pause, locked platforms, backoff; planner and publisher in DRY_RUN make zero network calls |
| `connectors` | X, TikTok and Instagram request building with mocked fetch: PKCE, token exchange, media upload, `SELF_ONLY` enforcement, container then publish |
| `crypto` | AES-GCM round trip and tamper detection, RFC 7636 PKCE vector, cookie signing |
| `guard` | impersonation guard and caption filter |
| `launch` | PumpPortal payload and validation, cost summary, on-chain verification cases |
| `auth` | ed25519 wallet signature verification |

`scripts/mock-upstream.mjs` stands in for pump.fun, DexScreener and the IPFS upload during end-to-end runs, so a graduation can be simulated on demand.

## Where this repo lives

This project lives at **[jaypacino337/CLONE](https://github.com/jaypacino337/clone)**, on the `main` branch. It started on the orphan branch `claude/social-launchpad` of `jaypacino337/lc` and was moved with:

```bash
git push https://github.com/jaypacino337/clone claude/social-launchpad:main
```

To move it again, push the same history to any empty repo: `git push <new-repo-url> claude/social-launchpad:main`.

---

Characters on GlowPad are fictional and AI-generated. Nothing here is financial advice.
