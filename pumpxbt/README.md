# PumpXBT site

A pro trading terminal look: graphite surfaces, one orange accent, dense data grids,
mono tabular numerals. It's static and has no build step. Fonts are self-hosted
(`assets/fonts`, OFL).

| Page | What |
|---|---|
| `index.html` | landing page: live launch tape, PUMPXBT quote, flywheel KPIs, the 5-step loop with live figures, callouts, burn meter |
| `terminal.html` | the desk: flywheel panel, live launches, paper positions, callouts, top callers, full decision audit (including rejections), source health |

## Every number has a source
| figure | source | needs |
|---|---|---|
| launches tape + grid | PumpPortal websocket `subscribeNewToken` / `subscribeMigration` (free, browser connects directly) | nothing |
| PUMPXBT price / mcap / liq / vol, SOL | DexScreener `tokens/v1` | `token.address` |
| claimable fees, treasury + creator SOL, burned, supply, curve | bot ledger API → Solana RPC | `ledgerApi` + bot env |
| worker mode / cycles / last cycle | bot ledger API → memcoinz worker `/health` | `ledgerApi` + `WORKER_URL` on the bot |
| agent P&L, positions, callouts, decisions | bot ledger API (paper: labelled SIMULATED) | `ledgerApi` |

When a source is missing or down, the figure shows `—`. There is deliberately no
config field for typing treasury numbers in by hand.

## Configure (`js/config.js`)
- `token.address` / `token.pumpUrl`: once the coin exists
- `ledgerApi`: the PumpXBT bot's public URL (add this site's origin to the bot's `CORS_ORIGINS`)
- `stage`: `prelaunch | paper | live`. The ledger API's own `paper` flag wins when it's reachable
- `feeds.market` / `feeds.launches`: turn the client-side feeds off

Before launch, also fix `og:url` / `og:image` in both HTML files so they point at the real domain.

## Run + QA
```sh
python3 -m http.server 8123          # in pumpxbt/
~/memcoinz/bin/mc qa http://localhost:8123/ --pages /,/terminal.html
```
