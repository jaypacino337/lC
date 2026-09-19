/* ============================================================================
   PumpXBT — site configuration.
   Everything editable lives here. No build step; just edit and reload.
   ========================================================================== */
window.PXBT = {

  /* ── Stage ────────────────────────────────────────────────────────────────
   * Drives every status badge on the page. Change this ONE value as the project
   * progresses — the hero pill, the ticker, the roadmap and the banner all read
   * from it, so they can never drift out of sync with reality.
   *
   *   'prelaunch' — nothing is running yet
   *   'paper'     — the agent runs, but every fill is simulated (current)
   *   'live'      — the agent trades real funds
   *
   * Do not set 'live' until it actually is. Claiming a running agent while none
   * exists is the kind of thing that turns a launch into a legal problem. */
  stage: 'paper',

  /* Ledger API base URL, e.g. https://pumpxbt-api.up.railway.app
   * When set, the treasury figures and callouts below are replaced with live
   * data from the bot. Leave empty to show configured values only. */
  ledgerApi: '',

  /* ── Token ────────────────────────────────────────────────────────────────
   * Paste the mint address once the token is live. While this is empty every
   * market figure on the page renders as "—" and is labelled "awaiting
   * contract" — the site never shows invented price, volume or market cap. */
  token: {
    address: '',                       // e.g. 'So11111111111111111111111111111111111111112'
    symbol: 'PUMPXBT',
    name: 'PumpXBT',
    chain: 'solana',
    pumpUrl: 'https://pump.fun',       // swap for the direct coin URL when live
    twitterUrl: 'https://x.com',
    docsUrl: ''                        // leave empty to hide the Docs link
  },

  /* Live market data is pulled client-side from the Dexscreener public API
   * once `token.address` is set. Set to false to keep everything static. */
  liveData: true,

  /* ── Treasury & burn ──────────────────────────────────────────────────────
   * These have no public price feed, so they come from here. Leave any value
   * null to render "—" rather than a number you cannot yet stand behind. */
  treasury: {
    valueUsd: null,          // current treasury value
    realisedPnlUsd: null,    // cumulative realised trading profit
    feesRoutedUsd: null,     // creator fees routed into treasury to date
    boughtBackUsd: null,     // cumulative buyback spend
    burnedTokens: null,      // cumulative tokens burned
    burnedPctSupply: null,   // % of total supply burned, e.g. 3.2
    lastBurnTx: ''           // solscan signature for the most recent burn
  },

  /* ── The flywheel ─────────────────────────────────────────────────────── */
  flywheel: [
    {
      k: '01', title: 'Creator fees fund the treasury',
      body: 'Every creator fee the coin generates routes straight into the treasury. No emissions, no team bag — the war chest is trading activity, nothing else.'
    },
    {
      k: '02', title: 'The agent trades',
      body: 'PumpXBT deploys the treasury across pump.fun with sizing set by conviction and risk limits it cannot override. It picks its moments — it does not chase.'
    },
    {
      k: '03', title: 'Callouts publish in-app',
      body: 'Every thesis becomes a callout in the pump.fun app — timestamped before the outcome, attributable forever. No deleted calls, no cherry-picking.'
    },
    {
      k: '04', title: 'Rewards + profit accrue',
      body: 'Callout rewards stack with realised trading profit. One yield stream, fully accounted, line by line in the terminal.'
    },
    {
      k: '05', title: 'Buyback & burn',
      body: 'That stream buys PUMPXBT on the open market and burns it. The better the agent performs, the smaller the supply. Loop closes. Runs again.'
    }
  ],

  /* ── Intelligence layer ───────────────────────────────────────────────── */
  capabilities: [
    { icon: 'signal',  title: 'Signal stack',      body: 'A proprietary read on every launch, seconds after the curve opens. What it weighs stays in-house — the results don’t.' },
    { icon: 'cluster', title: 'Caller intelligence', body: 'Every caller on pump.fun, scored by their actual record — shrunk for small samples, decayed for stale ones. Lucky streaks don’t survive the math.' },
    { icon: 'wave',    title: 'Wallet radar',      body: 'Watches what proven wallets buy before they say anything. The gap between the buy and the call is the edge.' },
    { icon: 'chart',   title: 'Regime sense',      body: 'Knows when the tape is worth trading and when it isn’t. Hot days get size. Dead days get patience.' },
    { icon: 'shield',  title: 'Self-correction',   body: 'It grades its own trades and adjusts. A cold streak tightens the trigger automatically; a hot one earns it back.' },
    { icon: 'bolt',    title: 'Memory',            body: 'It remembers every thread, every wallet, every call it has made. Ask it anything on X — it answers from live state.' }
  ],

  /* ── Callouts feed ────────────────────────────────────────────────────────
   * SAMPLE is true until this is wired to the live callout source. While true
   * the section renders a clearly-marked "sample" state instead of passing
   * these off as a real track record. Set to false only when `items` are real. */
  callouts: {
    sample: true,
    items: [
      { ticker: 'EXAMPLE', note: 'Sample row — replace with live callout data.', at: '—', status: 'open' },
      { ticker: 'EXAMPLE', note: 'Sample row — replace with live callout data.', at: '—', status: 'open' },
      { ticker: 'EXAMPLE', note: 'Sample row — replace with live callout data.', at: '—', status: 'open' }
    ]
  },

  /* ── Roadmap ──────────────────────────────────────────────────────────── */
  roadmap: [
    { phase: 'Live now',    title: 'Terminal — free',     body: 'Every callout, every trade, every fee claim and burn — scored in public, updated live. No login, no paywall.', state: 'live' },
    { phase: 'In progress', title: 'Agent + callouts',    body: 'The agent runs in paper mode: scoring callers, reading the tape, logging every trade it would take. Execution goes live once the record is proven.', state: 'progress' },
    { phase: 'Next',        title: 'Buyback & burn feed', body: 'A verifiable on-chain ledger of every buyback and every burn, linked transaction by transaction.', state: 'next' },
    { phase: 'Coming soon', title: 'Terminal Pro',        body: 'Bloomberg-grade: wallet scanner, live signal scoring, caller leaderboard, narrative heatmap, alerts and API.', state: 'soon' }
  ],

  faq: [
    { q: 'What actually is PumpXBT?', a: 'An autonomous agent built for one venue: pump.fun. It reads the chain in real time, scores every caller by their actual record, trades a creator-fee treasury, and publishes every thesis as a public callout. The terminal keeps the score.' },
    { q: 'Where does the treasury come from?', a: 'Creator fees. No team allocation, no emissions — if the coin trades, the treasury grows. That is the whole model.' },
    { q: 'How does the burn work?', a: 'Callout rewards and realised profit are pooled, spent buying PUMPXBT on the open market, and burned. When the agent performs, supply only moves one direction.' },
    { q: 'Why should I trust the numbers?', a: 'You shouldn’t trust — you should check. The terminal shows every callout, every trade and every treasury event as they happen, and while the agent is in paper mode it says so on every page.' },
    { q: 'Are callouts financial advice?', a: 'No. Callouts are a public record of what the agent does with its own treasury — timestamped so you can judge the record. Nothing here is a recommendation to buy anything.' }
  ]
};
