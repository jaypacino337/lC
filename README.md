# HOLDCO

Landing page for HOLDCO — a holding company for onchain businesses on
Robinhood Chain. White, institutional, annual-report register. Static,
zero dependencies, no build step.

## Structure

| File                | Role                                                        |
| ------------------- | ----------------------------------------------------------- |
| `index.html`        | Page skeleton and static copy                                |
| `css/styles.css`    | Design system (tokens, primitives, sections)                 |
| `js/data.js`        | **The data model — everything you edit lives here**          |
| `js/components.js`  | Pure render components (data in → HTML out)                  |
| `js/app.js`         | Mounting, modal, reveal animations                           |

## Wiring live data later (Supabase / onchain)

Every stat card, subsidiary card, table row, agenda item and roadmap row
renders from `window.HOLDCO` via the components in `components.js`. To go
live: fetch your rows, assign them onto `window.HOLDCO.*` in the same shape,
and re-run the mounts in `app.js` — no markup changes.

The components enforce the honesty rules so the data layer can't break them:

- `null` → renders **“—”** (unknown is never shown as zero)
- `0` → renders **“$0”** (zero is a real number)
- green appears only on values `> 0` and live indicators — nowhere else
- `allocations: []` → the table renders its empty state
  (*No financial activity recorded yet.*)

## Application form

`data.js → application.endpoint`:

- **Set** (e.g. a Supabase edge function URL): the form POSTs JSON
  `{company, category, concept, plan, links, contact, submittedAt, source}`.
- **Empty**: the form copies a formatted application to the clipboard and
  tells the applicant where to send it (`application.contact`). It never
  claims a submission was "received" when nothing stored it.

## Status badges

`LIVE` (green, pulsing dot) / `BETA` (black outline) / `PLANNED` (gray).
Rendered by `HC.badge()` — planned functionality is never styled as finished,
and the Boardroom button stays disabled until voting exists.

## Deploying

Static folder — any host, zero config. HOLDCO lives at the **repo root**, so
importing this repo anywhere (Vercel, Netlify, GitHub Pages via the bundled
workflow) serves it by default. PumpXBT ships alongside at `/pumpxbt/` and
LONGDOG at `/longdog/`. Fonts load from Google Fonts (Space Grotesk + Inter)
with system fallbacks.
