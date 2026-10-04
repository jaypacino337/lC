# SLUDGE: the vat launches coins

A real Solana launchpad in toxic-goo clothing. Built from the memcoinz `launchpad` preset (`mc new-site --preset launchpad`), re-skinned and rewired as SLUDGE. The old static prelaunch site in `../sludge/` is left untouched.

| page | what |
|---|---|
| `/` | Hero (LiquidEther slime fluid, goo wordmark with drips), **Batches** (coins actually launched through SLUDGE, with live curve and market data), **the swamp** (live trending/new Solana grid from DexScreener), how it brews, $SLUDGE (prelaunch, honest), FAQ |
| `/brew` | The create flow as a vat. Ingredients = name, ticker, image, dev buy. "Let the vat decide" runs the ported seeded brewer: name, ticker, description and a drawn creature PNG as the coin image. Phantom signs; the server never sees a key. (`/create` redirects here.) |

## How a brew becomes a batch
1. The browser generates the mint keypair.
2. `POST /api/create` pins the image and metadata to IPFS (Pinata), asks PumpPortal for the **unsigned** create tx, and parks the brew as *pending*.
3. The browser signs with the mint key, then Phantom signs.
4. `POST /api/send` relays and confirms the tx. If it matches the pending brew (signed by that mint, paid by that creator, calls the pump.fun program: `lib/verify.ts`), it is stored as a **batch** (`mint, creator, name, symbol, image, signature, at`).
5. `GET /api/batches` lists batches, enriched with the on-chain bonding-curve progress (`lib/chain.ts`) and DexScreener market data. Real numbers or "—".

Storage (`lib/store.ts`) is picked by env: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → Supabase (`supabase/schema.sql`, RLS on, no public policies). Otherwise it uses JSON files in `SLUDGE_DATA_DIR` (default `./.data`, for a server with a disk only, **not** Vercel).

## Env (server-only, never `NEXT_PUBLIC_`)
See `.env.example`: `SOLANA_RPC_URL`, `PINATA_JWT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, (`SLUDGE_DATA_DIR`), plus public `NEXT_PUBLIC_SITE_URL` for absolute OG URLs. Without `PINATA_JWT`, `/api/create` answers 503 "the vat is sealed" and nothing launches.

## Design
Toxic goo: acid green `#b8ff1f` and purple `#b45cff` on `#050704`; Bagel Fat One display, Rubik body, JetBrains Mono numbers. SVG goo filters (`components/goo/GooDefs.tsx`) make the wordmark drips, rising bubbles, drip edges and the budding CTA buttons merge like metaballs. Heavy effects are client-only and skipped under reduced motion: React Bits LiquidEther in the hero, Paper Shaders metaballs in the vat.

## Commands
```bash
npm install
npm run dev
npm test               # offline: tx-match rules + file store (no network, no mainnet)
npx tsc --noEmit && npm run build
npm start && ~/memcoinz/bin/mc qa http://localhost:3000
```
