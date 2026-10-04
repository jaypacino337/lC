/**
 * SLUDGE: the one config file. Brand, links, copy and the vat's rules live here;
 * every section reads from it. Colors are in app/globals.css (@theme).
 *
 * Honesty contract (carried over from the static sludge/ site): unknowns render
 * "—", unset links are hidden (never href="#"), and nothing is labelled live
 * unless it is.
 */
export const site = {
  name: "SLUDGE",
  ticker: "SLUDGE",
  tagline: "The vat launches coins.",
  description:
    "SLUDGE is a launchpad that drips. Feed the vat a name, a ticker, an image and a dev buy; it pours a real pump.fun coin that you sign with your own Phantom wallet. Every batch it brews shows up here, live.",
  /** Production origin, used for absolute OG/canonical URLs. Set NEXT_PUBLIC_SITE_URL in Vercel. */
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",

  /** 'prelaunch': $SLUDGE has no contract yet. 'live': set `ca` and `buyUrl`. */
  stage: "prelaunch" as "prelaunch" | "live",
  /** $SLUDGE mint. Empty until it exists; the UI says "not launched" instead. */
  ca: "",
  buyUrl: "",
  socials: {
    x: "", // https://x.com/<handle>: the footer link stays hidden until set
    telegram: "",
  },

  /** Live grid refresh (ms). DexScreener allows ~60 req/min; the server caches 30s. */
  refreshMs: 20_000,

  nav: [
    { label: "Batches", href: "/#batches" },
    { label: "The swamp", href: "/#swamp" },
    { label: "How it brews", href: "/#how" },
    { label: "$SLUDGE", href: "/#token" },
  ],

  /** The brew, as the site explains it. Ingredients = the create form's fields. */
  steps: [
    { k: "FEED", body: "Drop in the ingredients: name, ticker, an image and a description. Or hit “let the vat decide” and it brews a coin and draws its creature." },
    { k: "SPIKE", body: "Pick a dev buy in SOL (0 is fine). It’s the first buy on your own curve, paid from your wallet." },
    { k: "SIGN", body: "Your browser makes the mint key; the server builds the pump.fun create tx; Phantom asks you to sign. No key ever touches the server." },
    { k: "POUR", body: "The vat relays the signed tx and waits for confirmation. Once it lands, the coin is logged as a batch and shows up on this page." },
  ],

  ingredients: [
    { k: "NAME", hint: "max 32" },
    { k: "TICKER", hint: "max 10" },
    { k: "IMAGE", hint: "≤ 4 MB" },
    { k: "DEV BUY", hint: "SOL" },
  ],

  faq: [
    { q: "Does SLUDGE hold my keys?", a: "No. The mint keypair is generated in your browser and only signs its own create transaction. Your wallet signs in Phantom. The server never sees a private key." },
    { q: "What does it cost?", a: "Solana network fees, the pump.fun creation cost, and whatever dev buy you choose. SLUDGE adds no fee of its own today." },
    { q: "Which coins show up under Batches?", a: "Only coins whose create transaction was relayed through this site and confirmed on-chain, signed by the mint and the creator wallet that started the brew. Market numbers come from DexScreener and the pump.fun curve, never invented." },
    { q: "Is $SLUDGE live?", a: "Not yet. There is no contract address. Anything calling itself $SLUDGE before this page shows a CA is not us." },
  ],
} as const;

export type Site = typeof site;
