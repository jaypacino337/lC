# PumpXBT fee flywheel

PumpXBT's 5-step loop *is* the memcoinz flywheel. Execution does not happen in
this bot. It runs on the **shared memcoinz worker** (`memcoinz/deploy/worker`):
one Railway service per coin, the same image for every coin, and a volume for
crash-safe ledgers.

| loop step (site) | who does it | how |
|---|---|---|
| 01 creator fees fund the treasury | worker | `pump-claim` → `route.treasury` % paid to `payTo.treasury` (the agent wallet) |
| 02 the agent trades | this bot | **paper only** today; no keys, no signing |
| 03 callouts | this bot | composed + queued; you post them by hand |
| 04 rewards + profit accrue | you | manual until the agent goes live |
| 05 buyback & burn | worker | `buyback-burn` with `route.buyback` % of every claim |

`memcoin.config.json` here is the coin's flywheel config. `wallets.creator`
names an **env var** (`PXBT_CREATOR_KEYPAIR`). The key lives only in Railway's
sealed variables and is never in the repo or on disk.

## Ship it

```sh
# 1. fill in mint + payTo.treasury in memcoin.config.json (or pass them as env)
PXBT_MINT=<mint> PXBT_TREASURY=<agent wallet> npm run flywheel:env
# → validates exactly like the worker does, then prints MEMCOIN_CONFIG_JSON=...
```

2. Railway → New service → GitHub repo **memcoinz** → Settings → config-as-code path
   `deploy/worker/railway.json` → add a **Volume** at `/data`.
3. Variables: `MEMCOIN_CONFIG_JSON` (from step 1), `PXBT_CREATOR_KEYPAIR` (sealed),
   `SOLANA_RPC_URL`, `RAILWAY_RUN_UID=0`. Leave `LIVE` unset for a dry-run week.
4. Give the worker a public domain, then set `WORKER_URL=https://<that domain>` on
   the PumpXBT bot service. The terminal's flywheel panel reads `/health` from it.
5. After a week of clean dry-run cycles, set `LIVE=true` on the worker.

The route split is Jay's call: `buyback` is burned, and `treasury` funds the agent.
The worker re-reads nothing at runtime. To change the split, edit this file,
re-run `flywheel:env`, and paste the new variable (Railway redeploys).
