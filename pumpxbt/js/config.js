/* ============================================================================
   PumpXBT — site configuration.
   Everything editable lives here. No build step; just edit and reload.
   ========================================================================== */
window.PXBT = {

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
      body: 'Every creator fee generated on the coin routes straight into the PumpXBT treasury. No emissions, no team allocation — the treasury grows from real on-chain activity.'
    },
    {
      k: '02', title: 'The agent trades',
      body: 'PumpXBT deploys that treasury across pump.fun markets, sizing positions off its own signal engine and holding risk limits it cannot override.'
    },
    {
      k: '03', title: 'Callouts publish in-app',
      body: 'Every thesis the agent acts on is published as a callout inside the pump.fun app — timestamped, public, and attributable before the outcome is known.'
    },
    {
      k: '04', title: 'Rewards + profit accrue',
      body: 'Callout rewards earned on pump.fun combine with realised trading profit. Both land back in the treasury as a single yield stream.'
    },
    {
      k: '05', title: 'Buyback & burn',
      body: 'That stream is spent buying PUMPXBT on the open market and burning it. Supply falls as the agent performs — the loop closes and starts again.'
    }
  ],

  /* ── Intelligence layer ───────────────────────────────────────────────── */
  capabilities: [
    { icon: 'signal',  title: 'Signal engine',       body: 'Scores every new pump.fun launch on velocity, buy pressure and holder quality within seconds of the bonding curve opening.' },
    { icon: 'cluster', title: 'Wallet clustering',   body: 'Maps funding graphs to expose sniper rings, bundled supply and insider allocation before they hit the chart.' },
    { icon: 'wave',    title: 'Narrative tracking',  body: 'Watches which themes are actually rotating capital, not just which are loudest, and weights conviction accordingly.' },
    { icon: 'shield',  title: 'Risk filter',         body: 'Screens mint authority, LP status and deployer history. Anything failing the checks is never called out.' },
    { icon: 'chart',   title: 'Momentum scoring',    body: 'Continuous re-scoring of open positions so exits are as systematic as entries.' },
    { icon: 'bolt',    title: 'Autonomous callouts', body: 'Publishes to the pump.fun app without a human in the loop. The record is public and permanent.' }
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
    { phase: 'Live now',    title: 'Agent + callouts',   body: 'Autonomous trading against the treasury with public callouts published in the pump.fun app.', state: 'live' },
    { phase: 'Next',        title: 'Buyback & burn feed', body: 'A public, verifiable ledger of every buyback and burn transaction with on-chain links.', state: 'next' },
    { phase: 'Coming soon', title: 'The Terminal',        body: 'The full intelligence layer, exposed. Live signal scoring, wallet graphs and narrative heatmaps in one screen.', state: 'soon' },
    { phase: 'Coming soon', title: 'Alerts & API',        body: 'Push callouts and raw signal to your own stack, bot or group the moment they fire.', state: 'soon' }
  ],

  faq: [
    { q: 'What actually is PumpXBT?', a: 'An autonomous agent and intelligence layer built specifically for pump.fun. It reads the chain in real time, trades a treasury funded by creator fees, and publishes every thesis it acts on as a public callout in the app.' },
    { q: 'Where does the treasury come from?', a: 'Creator fees generated by the coin. There is no team allocation and no emission funding it — the treasury is a function of real trading activity on pump.fun.' },
    { q: 'How does the burn work?', a: 'Callout rewards and realised trading profit are pooled, spent buying PUMPXBT on the open market, and the acquired tokens are burned. Supply is designed to fall as the agent performs.' },
    { q: 'Are callouts financial advice?', a: 'No. Callouts are a public record of what the agent is doing with its own treasury. They are not advice and not a recommendation to buy anything.' }
  ]
};
