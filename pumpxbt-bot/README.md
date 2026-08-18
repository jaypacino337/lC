# pumpxbt-bot

Callout-reward farming agent for pump.fun. **Paper mode only** — every fill is
simulated and nothing here can move funds.

Zero runtime dependencies. `node:sqlite`, `fetch`, `node:http` and `node:test`
are all built into Node 22, so there is nothing to install and nothing to audit.

```sh
node --version          # needs >= 22.5
cp .env.example .env
npm test                # 50 tests
npm run replay          # one tick against the bundled fixture
npm run paper           # continuous loop
npm run api             # ledger API on :8080
```

## Read this before running it live

**The pump.fun endpoints are guesses.** I could not reach pump.fun from the
environment this was written in, so the paths and field names in
`src/sources/pumpfun.js` are almost certainly wrong in detail. That file is the
*only* place that knows pump.fun's shape — fix it there and everything
downstream keeps working:

1. Open devtools on pump.fun, watch the network tab
2. Correct `PATHS` and the `parse*` functions to match reality
3. Drop a real captured response into `test/fixtures/` and run `npm test` —
   the parser tests will tell you what broke

Until then `PXBT_SOURCE=fixture` replays bundled data so you can develop with no
network at all.

**It does not post to pump.fun.** The bot writes the callout, queues it, and
Telegrams it to you — you paste it. That is deliberate: automated posting means
reverse-engineered auth or browser automation, both of which risk the account,
and the callout history *is* the asset. If an official write API turns up,
`src/callouts/composer.js` is the only file that changes.

## How it works

One tick: **observe → learn → decide → act**.

```
ingest callouts + trades        sources/pumpfun.js
resolve matured callouts        signals/callerScore.js  resolveOutcome
rebuild caller reputation       signals/callerScore.js  rebuildAllCallerStats
evaluate candidates             signals/engine.js
probe-buy + queue callout       exec/paper.js + callouts/composer.js
manage exits                    exec/portfolio.js
```

### Caller reputation is the moat

Anyone can read the callout feed. What you cannot buy is a scored history of who
is actually good. Two corrections to a naive win rate, both load-bearing:

- **Shrinkage.** A caller who is 1-for-1 is not better than one who is 40-for-50.
  A Wilson lower bound makes a rating something you earn with volume.
- **Time decay.** A great call six months ago in a different market is not
  evidence about today. Wins are weighted with a 14-day half-life.

Together these make the score hard to farm with a lucky streak — which matters
because you are about to copy these people with money.

### Two pipelines, not one

You said it: *"callout is different though, because it's just scanning
anything."* So there are two scores from one pass over the evidence.

|            | Callout                        | Trade                        |
| ---------- | ------------------------------ | ---------------------------- |
| Goal       | coverage — reward farming      | conviction — make money      |
| Weighting  | caller + velocity + freshness  | early-buy dominant           |
| Threshold  | 0.28 (low on purpose)          | 0.58                         |
| Size       | `PROBE_BUY_USD` ($2)           | up to `TRADE_MAX_USD`        |
| Exit       | bank at +50%, hold the floor   | stop / scale / time stop     |

Callout scoring deliberately does **not** require the early-buy edge. Gating
callouts on the trading signal would suppress most of the callable universe,
which is the opposite of what reward farming wants.

### The signal that actually has an edge

Following callouts puts you behind everyone reading the same feed. The
`earlyBuy` signal fires when a wallet **above the elite bar bought a token and
has not called it yet** — that is a genuine informational lead, and it carries
the heaviest weight in trade scoring.

### The $1 call-eligibility floor

You must hold ~$1 of a token to stay eligible to call it, so a position is never
fully closed while you want to keep calling:

```
sellableUsd = positionValue − CALL_ELIGIBILITY_FLOOR_USD
```

`plannedExit` can never breach it, and a position reduced to the floor is marked
`floored` — still held, still eligible, no real exposure.

**This is capital you are choosing never to recover.** At $1 across hundreds of
tokens it becomes real money, so the ledger tracks it as `flooredCapitalUsd`
rather than letting it quietly accumulate. Watch that number.

## X reply agent

`npm run x` — a separate service that watches mentions of your X account and
replies as PumpXBT, with memory. It remembers every thread, user, and reply in
the same SQLite file, so it never double-replies and each reply is written
against the thread's history and the bot's real state (stage, callout count,
top-caller scores — never invented numbers).

Three credential tiers, all optional:

| Configured | Behaviour |
| --- | --- |
| nothing | idles with a warning |
| `X_BEARER_TOKEN` only | reads mentions, composes replies, stores them as **drafts** — nothing is ever sent |
| + the four OAuth 1.0a keys | posts replies live |

With `ANTHROPIC_API_KEY` set, Claude (`claude-opus-5`, server-side refusal
fallbacks enabled) writes the replies; without it, deterministic grounded
templates are used. Either way the guardrails are enforced *outside* the model:
a hard length cap, a banned-claims scrub (anything reading as guaranteed
returns is dropped, not edited), paper-mode disclosure on any performance
question, and hard rate caps per window and per user. Start in dry-run, read
the drafts in the `x_replies` table, then add the write keys when you like
what it says.

## Ledger API

Read-only. No route can move funds or mutate strategy state, so it is safe to
expose to the site.

| Route            | Returns                                 |
| ---------------- | --------------------------------------- |
| `/api/state`     | everything the site needs, one call     |
| `/api/positions` | open + closed                           |
| `/api/callouts`  | ours, with status                       |
| `/api/ledger`    | every entry + totals                    |
| `/api/callers`   | reputation leaderboard                  |
| `/api/decisions` | audit trail, **including rejections**   |
| `/api/health`    | uptime, RPC pool, row counts            |

`/api/state` carries a `paper: true` flag and a disclaimer string while in paper
mode. Keep them on the site — a simulated run must never be displayed as a real
track record.

## Paper mode is pessimistic on purpose

Costs are modelled, not ignored: `COST_BPS` for fees plus square-root slippage
against liquidity, and an unknown liquidity figure assumes a punishing 3% rather
than a flattering 0%. A backtest that ignores slippage shows an edge that
evaporates the moment real money touches it.

Paper cash is derived from the ledger rather than held in memory, so restarts
cannot silently re-mint capital.

## What is deliberately missing

- **Live execution.** No keypair, no signing, no RPC writes. `PXBT_MODE=live`
  refuses to start. Prove the hit rate first.
- **On-chain safety gates.** Mint authority, LP status and deployer history need
  RPC calls that are not wired up. `src/signals/filters.js` has the framework.
- **A real price source for resolution.** Outcomes currently resolve off the
  trade feed; live, this wants proper candles.

## Before you fund anything

Run paper for two weeks. Then check `/api/decisions` — not just the wins, but
what it rejected and why. If the hit rate is not clearly there on paper, it will
not be there with money. Most memecoin bots lose; the ones that do not usually
got there by measuring before funding.

## Deploying

Railway: point a service at this folder, set the variables from `.env.example`,
run `npm run paper`. Add a second service running `npm run api` against the same
volume for the ledger. **Keys go in Railway variables, never in the repo.**

Mount a volume at `data/` — that database is the reputation history, and it is
the one thing here you cannot rebuild.
