# FOREMAN

**Hire an AI builder that trades Solana memecoins 24/7, explains every move, and climbs a career ladder.**

FOREMAN is the rebranded clone of the BUILD site (buildagent.fun): the same toy-brick frontend and
3D site office, plus a rebuilt backend. By default it runs in **paper trading** mode: the market data
is real (pump.fun + DexScreener), the fills and the SOL are simulated.

- Name / ticker: **FOREMAN / $FOREMAN** (no DexScreener pairs for `FOREMAN` when this was set up)
- Frontend: static ES modules in `public/` (no build step), Solana Wallet Standard for sign-in
- Backend: one Vercel Node function (`api/index.js`) routing every `/api/*` call, no npm dependencies
- Storage: Upstash Redis / Vercel KV over REST, a JSON file locally, in-memory as the last resort

## Quick start (local)

```bash
npm run dev          # http://localhost:3000, ticks every 60s, data in .data/db.json
npm run seed         # optional: 4 demo paper builders signed by a throwaway local key
npm run tick         # optional: force one market tick now
npm test             # node:test suites (engine, paper P&L, auth, API, live keystore)
```

Requires Node 20+. No `npm install` needed.

## Paper vs live: what is real

| Thing | Paper mode (default, the only mode wired today) |
|---|---|
| Token universe | **Real.** pump.fun top coins by market cap, recently active and just-graduated coins, plus DexScreener boosted Solana tokens |
| Prices, liquidity, volume, 5m/1h/6h/24h change | **Real.** DexScreener `tokens/v1`, SOL/USD from the deepest SOL/USDC pool |
| Entry / exit decisions | **Real logic** on real data (`lib/engine.js`) |
| Fills | **Simulated** at the live price with a 0.3% pool fee, price impact = trade size ÷ (pool liquidity ÷ 2), and a 0.000205 SOL network fee per swap |
| SOL balances, deposits, withdrawals | **Simulated** ("paper SOL"). Nothing is ever sent from or to a wallet |
| P&L, volume, level, leaderboard | **Derived from the stored paper trades**: `P&L = equity + withdrawn − deposited`, equity = paper cash + positions at the live price |
| Builder wallet | **None.** Paper builders have `wallet: "paper:<id>"`, so there is no address anyone could send funds to |
| Coin launch on pump.fun | **Not done.** The coin name/ticker is a name tag only |
| Transactions / Solscan links | **None.** Paper trades have `sig: null` and show a `paper` chip |
| Your wallet | Only signs free messages (create, pause, strategy, paper top-up/withdraw, custom strategy). Never asked for a seed phrase or private key |

The UI says so everywhere it used to imply real money: a PAPER banner and pill, `paper` chips on
trades, "paper" on stats and P&L, paper deposit/withdraw dialogs, and a paper launch flow.

## How a builder works

1. **Hire** (`#/build`): pick a look, name, ticker, paper capital (0.2–100 SOL) and a strategy. The page
   asks your wallet to sign one message (`FOREMAN action / Action: launch / … / Capital: 1 SOL (paper)`).
   The server checks the ed25519 signature and creates the builder.
2. **Tick** (every `TICK_EVERY_MS`, default 60s): refresh the market, then for every builder
   - check exits on open positions: take profit, stop loss, trailing stop, max hold time, "trend broken"
     (5m ≤ −8% while losing), or a 30-minute price outage (closed at the last known price);
   - if nothing was sold, look for one entry that fits its strategy; size = equity × size %, capped,
     keeping a 0.03 SOL reserve, minimum 0.02 SOL per trade, max open positions per strategy;
   - log the decision (BUY / SELL / HOLD + reason, or why it was blocked) and an equity point.
3. Tokens with one-sided order flow (>1000 buys and <5% as many sells in 24h) are skipped as likely fake.

Strategies (same as the original): Blueprint (classic), Riveter (scalper), Highrise (trend),
Excavator (dip: uses the 6h change as "ran up first"), Surveyor (sniper), plus one custom strategy per
wallet built with sliders (`public/shared/custom-strategy.js`, validated on both sides). The original
"New Pairs" strategy (minute-old pump.fun coins with holder/bundle checks) is not included: it needs
on-chain holder data this build does not collect.

### When do ticks run?

- **Locally**: `npm run dev` ticks on an interval.
- **Lazy tick-on-read**: `GET /api/state` and `/api/stream` run a tick when the last one is older than
  `TICK_EVERY_MS` (`AUTO_TICK=true`). This keeps builders trading whenever someone has the site open,
  on any Vercel plan.
- **Vercel Cron** (`vercel.json`): ships as once a day (`0 0 * * *`) because Hobby projects reject
  anything more frequent. On Pro, change it to `* * * * *`.
- **External pinger** (any plan): call `GET https://<your-domain>/api/tick?secret=<CRON_SECRET>` every
  minute from cron-job.org, GitHub Actions, UptimeRobot, etc.

## API

All JSON. Writes need a fresh signed message (`message`, `signature`, optional `signedMessage`) from
the builder's creator wallet; each signature works once and expires after 10 minutes.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/state` | Full snapshot: `now, stats, agents[], coins[], feed[], tokens[], thoughts[], thinking, bonded[], config, engine, flywheel, arena, companies`. Triggers a lazy tick |
| GET | `/api/stream` | Server-sent events: `snapshot` and `trade` (uses `Last-Event-ID`). On Vercel it answers once and the browser reconnects every `STREAM_RETRY_MS`; locally it holds for `STREAM_HOLD_MS` |
| GET | `/api/agents/:id` or `/api/agents/:no` | One builder: summary + positions, history, decisions, deposits, withdrawals, equity curve, custom strategy |
| GET | `/api/tick` | Run one tick. Needs `Authorization: Bearer $CRON_SECRET` or `?secret=`. `&force=1` ignores the interval. Without `CRON_SECRET` it only works off Vercel |
| GET | `/api/health` | Mode, storage kind, last tick, market errors |
| GET | `/api/img/:id` | The builder's coin/name-tag image |
| GET | `/api/blockhash` | Latest blockhash from `SOLANA_RPC_URL` (used by wallet flows) |
| POST | `/api/launch/prepare` | Create a paper builder. Body: `creator, coin{name,ticker,…}, agentName, startingCapital, strategy, avatarSeed, image` + signature of `Action: launch`, `Builder: new`, `Name:`, `Ticker:`, `Capital: <n> SOL (paper)` |
| POST | `/api/launch/:id/funded`, `/api/launch/:id/image` | Compatibility no-ops (paper builders are active immediately) |
| POST | `/api/agents/:id/pause` | `{paused}` + `Action: pause` / `resume` |
| POST | `/api/agents/:id/retry` | `Action: retry` |
| POST | `/api/agents/:id/strategy` | `{strategy}` + `Action: strategy`, `Strategy: <id>` |
| POST | `/api/agents/:id/office` | `{office}` + `Action: office`, `Office: <n>` (only offices up to the builder's level) |
| POST | `/api/agents/:id/deposit` | Paper top-up `{amountSol}` + `Action: paper-deposit`, `Amount: <n> SOL (paper)` |
| POST | `/api/agents/:id/withdraw` | `{all, amountSol}` + `Action: withdraw`, `Amount: all` or `Amount: <n> SOL`. `all` sells every position at market first and pauses the builder |
| GET | `/api/custom-strategy/:owner` | That wallet's custom strategy or `null` |
| POST | `/api/custom-strategy` | `{owner, name, base, params, prompt, applyTo?}` + `Action: custom-strategy` and the exact `Settings: {…}` line (plus the risk line when the settings are risky) |
| POST | `/api/custom-strategy/prompt` | `{prompt}` → `{base, params, name, understood[], notes[], risks[]}` (built-in keyword/number reader, no AI) |
| GET | `/api/burns`, `/api/market`, `/api/arena`, `/api/companies` | Disabled features: empty, `enabled: false` |
| GET/POST | skins, builder market, NFT, X posting, arena duels, companies (`/api/agents/:id/skin*`, `/market/*`, `/nft/mint`, `/x/*`, `/arena/*`, `/company/*`, `/api/arena/:id/*`, `/api/companies/:id/*`) | `501 Not available in this build`. The nav hides them because `config.*.enabled` is false |

## What is stubbed / not rebuilt

- **Live trading** (see below).
- **pump.fun coin launches and creator-fee claims**: paper builders get a name tag instead of a coin.
- **Skins shop, Builder Market, builder NFTs, buyback & burn, X auto-posting, Arena duels, Companies,
  promotion rewards**: these all moved real SOL or tokens on the original site. Their pages and art
  are kept in `public/` but switched off; their endpoints answer 501.
- **New Pairs strategy**: removed (needs on-chain holder analysis).

## Live trading

`LIVE_TRADING` is **off**, and live execution is **not wired into the app** (`LIVE_WIRED = false` in
`lib/config.js`), so setting the flag alone changes nothing: the site stays in paper mode.

What exists, clearly separated in `lib/live/` and only usable when `LIVE_TRADING=true`,
`WALLET_ENCRYPTION_KEY` and `SOLANA_RPC_URL` are all set:

- `keystore.js`: generates builder keypairs (or imports operator-supplied ones), encrypts the 32-byte
  seed with AES-256-GCM under `WALLET_ENCRYPTION_KEY`, decrypts only in memory to sign. Keys are never
  logged, never returned by any route, never sent to the browser, never committed.
- `solana.js`: dependency-free JSON-RPC, wire-transaction parsing and signing (refuses to sign if the
  builder is not a required signer), send + confirm.
- `jupiter.js`: Jupiter quote/swap (`JUPITER_API_URL`, default `https://lite-api.jup.ag/swap/v1`),
  `buyWithSol` / `sellForSol`.

Still needed before real money (do this deliberately, with tiny amounts first):
1. Launch flow: create + encrypt a keypair per builder, verify the creator's funding transfer on-chain.
2. Tick: for `mode: 'live'` builders, turn the engine's BUY/SELL into `buyWithSol`/`sellForSol`, book
   the real `inAmount`/`outAmount` (token decimals from `getTokenSupply`), store the signature.
3. Withdrawals: build and sign a SOL transfer from the builder wallet to the creator.
4. Back up `WALLET_ENCRYPTION_KEY` offline. Losing it means losing every builder wallet.
5. Flip `LIVE_WIRED` and review the UI copy for live mode (it already has both texts).

## Environment variables

See `.env.example`. Nothing is required locally.

| Var | Default | Purpose |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` + `KV_REST_API_TOKEN`) | none | Persistent storage. **Without these on Vercel, data lives in memory and resets on every cold start** (the site shows a warning) |
| `DATA_FILE` | `.data/db.json` | Local JSON storage |
| `CRON_SECRET` | none | Protects `/api/tick` (Vercel Cron sends it automatically) |
| `TICK_EVERY_MS` | `60000` | Minimum time between ticks |
| `AUTO_TICK` | `true` | Tick lazily when the page is read |
| `STREAM_HOLD_MS` / `STREAM_RETRY_MS` | `0` on Vercel, `25000` locally / `5000` | SSE behaviour |
| `MAX_AGENTS`, `MAX_AGENTS_PER_CREATOR`, `MAX_PAPER_CAPITAL_SOL` | `200`, `5`, `100` | Abuse limits |
| `SITE_URL`, `X_URL`, `CONTRACT_ADDRESS` | empty | Shown in the header, footer and share posts |
| `SOLANA_RPC_URL` | public mainnet RPC | `/api/blockhash` and the live module |
| `LIVE_TRADING`, `WALLET_ENCRYPTION_KEY`, `JUPITER_API_URL` | off | Live module only (not wired) |

## Deploy on Vercel

1. Put this code in its own repo (next section) and import it in Vercel. No framework, no build:
   `vercel.json` sets `outputDirectory: public`, rewrites `/api/*` to `api/index.js`, and adds the cron.
2. Storage: Vercel → Storage / Marketplace → **Upstash Redis** → connect to the project (it sets the
   env vars). Redeploy.
3. Env: add `CRON_SECRET` (any long random string) and `SITE_URL=https://your-domain`.
4. Ticks: keep the lazy tick, and either switch the cron to `* * * * *` (Pro) or point an external
   pinger at `/api/tick?secret=…` every minute.
5. Optional: set `og:image` in `public/index.html` to the absolute URL `https://your-domain/brand/og.jpg`
   (some link previewers ignore relative URLs).
6. Check `https://your-domain/api/health`: `storage` should be `redis` and `engine.lastTickAt` recent.

Note: pump.fun's API sometimes blocks datacenter IPs. If it does, the tick still runs on DexScreener's
boosted tokens and `/api/health` lists the error.

## Move this branch into its own repo

This project lives on the orphan branch `build-agent` (no shared history with anything else).

```bash
# create an empty repo first (GitHub → New repository, no README), then:
git clone --branch build-agent --single-branch https://github.com/jaypacino337/lc foreman
cd foreman
git push https://github.com/<you>/<new-repo>.git build-agent:main
# from then on work in the new repo:
git remote set-url origin https://github.com/<you>/<new-repo>.git && git fetch origin && git checkout -B main origin/main
```

## Layout

```
public/            the site (index.html, styles.css, app/, shared/, brand/ art)
api/index.js       Vercel function: every /api/* request
lib/router.js      routes → lib/app.js (state, tick, actions)
lib/engine.js      strategy rules + paper fills (pure, tested)
lib/market.js      pump.fun + DexScreener
lib/auth.js        signed-message checks (ed25519)
lib/store.js       Upstash / file / memory
lib/live/          live-trading building blocks (off, unwired)
server/            local dev server
scripts/           seed + tick
test/              node:test
```

Not financial advice. Memecoins are extremely risky, and paper results do not predict real ones.
