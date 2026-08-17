# PumpXBT

Marketing site for PumpXBT — the intelligence layer and autonomous agent for
pump.fun.

Static, dependency-free, no build step. Dark terminal aesthetic on the pump.fun
green.

## Running it

```sh
python3 -m http.server 8000
# open http://localhost:8000/pumpxbt/
```

Any static host works (Vercel, Netlify, Cloudflare Pages, GitHub Pages).

## Deploying

The site is static, so any host works with **no build command and no output
directory** — point it at this folder and it serves.

**Vercel / Netlify / Cloudflare Pages:** import the repo, set **Root Directory**
to `pumpxbt`, framework preset **Other**, leave build settings empty. That makes
PumpXBT the site at `/` without moving any files. The repo's other site
(LONGDOG, at the repo root) can be a second project pointed at `/`.

**GitHub Pages:** Settings → Pages → deploy from branch. The site appears at
`<user>.github.io/<repo>/pumpxbt/`. All paths are relative, so a subdirectory
works fine.

## Before launch — do these four things

**0. Fix the social card URLs.** In `index.html`, `og:url`, `og:image` and
`twitter:image` are absolute URLs pointing at `pumpxbt.fun`. Change them to your
real domain. Social crawlers do not run JavaScript and cannot resolve relative
paths — if these are wrong, link previews on X, Telegram and Discord render
blank. Test with the X Card Validator after deploying.


**1. Add your brand files.** Drop `logo.png` and `banner.png` into `assets/`.
See `assets/README.md` for sizes. Until they exist the site falls back to a
placeholder mark and a "drop your files here" panel — it never shows a broken
image.

**2. Set the contract address.** In `js/config.js`:

```js
token: { address: 'YOUR_MINT_ADDRESS', pumpUrl: 'https://pump.fun/coin/...' }
```

The moment this is set, price / 24h change / market cap / liquidity go live via
the Dexscreener public API, refreshing every 60 seconds. Until it is set every
market figure renders as an em dash with a note explaining why.

**3. Fill in the treasury numbers.** Also in `js/config.js`. These have no
public feed so they are yours to maintain:

```js
treasury: {
  valueUsd: null, realisedPnlUsd: null, feesRoutedUsd: null,
  boughtBackUsd: null, burnedTokens: null, burnedPctSupply: null,
  lastBurnTx: ''
}
```

Any field left `null` renders as `—`. That is deliberate: **the site never
displays an invented number.** Set `lastBurnTx` to a signature and the "view
latest burn transaction" button appears, linked to Solscan.

## The callouts section

`callouts.sample` is `true` out of the box. While true, the terminal panel is
badged **SAMPLE DATA** in amber and the prompt reads `# awaiting live feed`.

Set it to `false` only once `callouts.items` contains real, published callouts.
Leaving it `true` with real-looking rows would present a fabricated track
record as a genuine one.

```js
callouts: {
  sample: false,
  items: [{ ticker: 'ABC', note: 'thesis…', at: '2h ago', status: 'win' }]
}
```

`status` accepts `win` (green) or `open` (amber).

## Editing content

Everything on the page is driven by `js/config.js` — the flywheel steps,
capability cards, roadmap and FAQ are all arrays. Add or reorder entries and
the page rebuilds itself; no HTML editing needed.

The flywheel diagram derives its node positions from the number of steps, so
adding a sixth step re-spaces the circle automatically.

## Files

| Path             | What it does                                              |
| ---------------- | --------------------------------------------------------- |
| `index.html`     | Page structure                                             |
| `css/styles.css` | Design system and all layout                               |
| `js/config.js`   | **Everything you edit** — token, treasury, copy, roadmap   |
| `js/app.js`      | Rendering, live market data, scroll interactions           |
| `assets/`        | Your `logo.png` and `banner.png` go here                   |

## Notes

- Respects `prefers-reduced-motion`; scales to a 390px phone.
- The hero sparkline is decorative and deterministic — it is not price history
  and is never labelled as such.
- Footer carries a risk disclaimer. Keep it.
- Not affiliated with pump.fun.
