# Launch checklist

Three things live in this repo:

| Path           | What                                   | State                        |
| -------------- | -------------------------------------- | ---------------------------- |
| `/`            | PumpXBT site + Terminal (repo root)    | Works, needs your assets     |
| `/longdog`     | LONGDOG — scrolling toy                | Done                         |
| `/pumpxbt-bot` | Paper-mode agent + ledger API + X agent | Runs, endpoints unverified  |

---

## Blocked on you — nobody else can do these

### 1. Brand assets
Drop `logo.png` and `banner.png` into `assets/` (repo root).
Transparent PNG for the logo — the site is dark, so a white background reads as
a white square. Banner at least 1200×630 or social platforms will refuse it.

### 2. Social card URLs
`index.html` has `og:url`, `og:image` and `twitter:image` pointing at the
placeholder domain `pumpxbt.fun`. Change to your real domain, then check with the
X Card Validator. Crawlers do not run JavaScript — get this wrong and every
shared link previews blank.

### 3. Contract address
`js/config.js` → `token.address`, and `token.pumpUrl` to the coin's URL.
Price, 24h, market cap and liquidity then go live automatically via Dexscreener,
refreshing every 60s. Until then they show `—`.

### 4. Verify the pump.fun endpoints
**This blocks the bot going live, and I could not do it.** The paths and field
names in `pumpxbt-bot/src/sources/pumpfun.js` are guesses — I had no network
access to pump.fun.

Open devtools on pump.fun, watch the network tab, correct that one file, drop a
real captured response into `test/fixtures/`, run `npm test`. The parser tests
will tell you exactly what broke. Everything downstream is insulated from this.

### 5. Decide about the default branch
The repo's only branch is `claude/longdog-site-design-kguow6`. Imports work, but
it is a scruffy default for a public repo. Creating `main` needs your say-so.

---

## Deploying

### Site → Vercel
Import the repo at vercel.com/new and click Deploy. **Change nothing** — the
site is at the repo root, so there is no root directory to set, no build
command, no output directory. LONGDOG ships with it at `/longdog/`.

### Bot → Railway
Point a service at `pumpxbt-bot`, set variables from `.env.example`, and
**mount a volume at `data/`** — that SQLite file is the caller reputation
history and is the only thing here you cannot rebuild.

Add a second service running `npm run api` for the ledger, sharing the volume.
Then set `ledgerApi` in `js/config.js` to its URL and the site's treasury
and callout panels populate from real data.

**Keys go in Railway variables. Never in the repo.**

---

## The stage flag

`js/config.js` → `stage`, one of `prelaunch` | `paper` | `live`.

It drives the banner, the hero pill, the ticker and the roadmap together, so
those four can never contradict each other. It is currently `paper`, which is
accurate: the agent runs and scores signal, but every fill is simulated.

**Do not set `live` until the agent actually trades real funds.** The site is
public and points at a token; claiming a running agent that does not exist is
how a launch becomes a legal problem.

---

## Before you fund the bot

Run paper for two weeks. Then read `/api/decisions` — not just what it bought,
but what it rejected and why. If the edge is not visible on paper it will not
appear with money.

Watch `flooredCapitalUsd` in `/api/state`. The $1-per-token call-eligibility
floor is capital you are choosing never to recover; across hundreds of tokens it
becomes real.

Live execution is deliberately not implemented. `PXBT_MODE=live` refuses to
start, and there is no keypair anywhere in the codebase.

---

## What is verified

- LONGDOG: renders at desktop and mobile, infinite scroll holds across recycle
  boundaries, zero console errors
- PumpXBT site: renders at 1440/768/390, zero errors, no horizontal overflow,
  all status surfaces agree with `stage`
- Bot: 50 tests passing; a full tick ingests, resolves outcomes, scores callers,
  fires both signal paths, opens paper probes and queues callouts
- Restart accounting: paper cash derives from the ledger, so restarts do not
  re-mint capital

## What is NOT verified

- Any pump.fun API call, ever — see item 4
- Any Helius call against a real key
- The site with your real logo and banner in place
- iOS Safari momentum scrolling on LONGDOG's scroll recycling
