# LONGDOG

He is a long dog. Scroll to make him longer. There is no end.

A scrolling toy: a dachshund whose head sits at the top of the page and whose
body continues downward for as long as you keep going — past the topsoil, the
pipes, the fossil beds, the magma, and out the other side.

## Running it

No build step, no dependencies, no network requests. Serve the folder:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from disk works too — scripts are plain
`<script>` tags rather than ES modules, so there is no `file://` CORS problem.

It is a static site, so any host will do (GitHub Pages, Netlify, S3).

## How it works

**The page never gets taller.** A document tall enough for a dog this long
does not exist — browsers cap out around 33 million pixels. Instead `.runway`
is a fixed two-span strip and the scroll position is recycled inside it: pass
1.5 spans and the position drops back one span while the same distance is added
to `loop`. Everything visible is `position: fixed` and drawn from
`v = loop + scrollY`, so the jump is invisible and there is no maximum length.

**The camera zooms out.** Metres-per-pixel doubles every 16,000 px of scroll,
so depth is the integral of that curve:

```
mpp(v)   = M0 · 2^(v/16000)
depth(v) = C · (2^(v/16000) − 1),   C = M0 · 16000 / ln2
```

The first screen reads at roughly 200 px per metre — human scale, where a
dachshund is a dachshund — and the Earth's diameter arrives a few minutes
later. `scrollAt()` inverts the curve, which is how the depth ruler places
tick marks at round numbers and how `#42195` deep links land exactly.

**Nothing is loaded.** The dog is SVG built at runtime in `js/dog.js` — the
body is one seamless tile repeated vertically, the head is markup so the eyes
can blink and track the pointer. Scenery is CSS shapes spawned from a seeded
PRNG in chunks, pooled across three parallax layers and recycled off-screen
(about 25 nodes live at any time). Barks are synthesised with WebAudio. Total
network cost is the four source files.

## Files

| Path             | What it does                                                 |
| ---------------- | ------------------------------------------------------------ |
| `index.html`     | Markup: world layers, HUD, milestone panel                    |
| `css/styles.css` | Everything visual, including the procedural scenery shapes    |
| `js/data.js`     | Scale constants, zones, comparison units, milestone table     |
| `js/dog.js`      | The dog, as generated SVG                                     |
| `js/app.js`      | Scroll recycling, rendering, decor pool, milestones, sound    |

To add a zone, append to `ZONES` in `js/data.js` with a starting depth in
metres, two gradient stops, an ink colour for the HUD, and a list of scenery
types. To add scenery, add a `.d-yourshape` rule in the stylesheet and an entry
in `SIZES` in `js/app.js`.

## Controls

Scroll, or:

- **Stretch** — hold to lengthen him quickly (or hold `T`)
- **Tail?** — look for the tail
- **Milestones** (`M`) — what he has outgrown so far, saved locally
- **Sound** (`S`) — off by default
- **Share** — copies a link that opens at your length
- **Head** (`Home`) — go back and say hello
- Boop the nose

## Notes

Respects `prefers-reduced-motion`. Works down to a phone viewport. Progress is
kept in `localStorage` under `longdog:v1` and nothing leaves the browser.

The tail has never been observed. Reports are unverified.
