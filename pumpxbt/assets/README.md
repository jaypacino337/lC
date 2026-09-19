# assets

Drop your two brand files here. The site picks them up automatically — no code
changes needed.

| File         | Used for                                    | Suggested size        |
| ------------ | ------------------------------------------- | --------------------- |
| `logo.png`   | Nav mark, favicon fallback                  | 512×512, transparent  |
| `banner.png` | Hero panel, Open Graph / Twitter card image | 1280×640              |

Until they exist:

- the nav falls back to `mark.svg` (a neutral placeholder mark), and
- the hero panel shows a "drop your files here" state instead of a broken image.

Both fallbacks are handled by `onerror` in `index.html`, so a missing file
never shows a broken-image icon.

**A transparent `logo.png` looks best** — the site is dark, so a white
background box will read as a white square in the nav.

For the Open Graph image, `banner.png` should be at least 1200×630 or social
platforms will crop or refuse it.
