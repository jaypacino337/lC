/* ============================================================================
   PumpXBT — site configuration. No build step: edit and reload.

   Every number on the site comes from a live source or renders as "—":
     market     DexScreener public API          (needs token.address)
     launches   PumpPortal public websocket     (free, no key)
     flywheel   the bot's ledger API → memcoinz worker /health + on-chain reads
     agent      the bot's ledger API (paper mode: labelled SIMULATED everywhere)
   There is deliberately nowhere to type a treasury figure by hand.
   ========================================================================== */
window.PXBT = {

  /* 'prelaunch' | 'paper' | 'live'. The status chip and stage bar read this,
   * but the ledger API's own `paper` flag always wins when it is reachable. */
  stage: 'paper',

  /* PumpXBT bot (pumpxbt-bot, `npm start`) public URL, e.g.
   * https://pumpxbt-bot.up.railway.app. Add this site's origin to the bot's
   * CORS_ORIGINS. Empty = every agent / flywheel figure shows "—". */
  ledgerApi: '',

  token: {
    address: '',                       // mint, once launched
    symbol: 'PUMPXBT',
    name: 'PumpXBT',
    pumpUrl: 'https://pump.fun',       // swap for the coin page when live
    twitterUrl: 'https://x.com',
    docsUrl: ''
  },

  /* Client-side live feeds. Turn off to make the page fully static. */
  feeds: {
    market: true,       // DexScreener: PUMPXBT quote + SOL price
    launches: true      // PumpPortal: every new pump.fun launch, as it happens
  },

  /* ── The flywheel ─────────────────────────────────────────────────────────
   * `by` says who executes the step today. `metric` names the live figure
   * shown next to it (see app.js METRICS). */
  flywheel: [
    { k: '01', title: 'Creator fees fund the treasury', by: 'worker', metric: 'claimable',
      body: 'Every creator fee the coin earns is claimed on a fixed cycle by the flywheel worker. No emissions, no team bag.' },
    { k: '02', title: 'The agent trades', by: 'agent', metric: 'agentMode',
      body: 'PumpXBT reads every launch and sizes by conviction under hard risk limits. Paper mode until the record earns real size.' },
    { k: '03', title: 'Callouts, on the record', by: 'agent', metric: 'callouts',
      body: 'Each thesis becomes a callout, timestamped before the outcome. Nothing gets deleted or cherry-picked.' },
    { k: '04', title: 'Rewards + profit accrue', by: 'treasury', metric: 'treasury',
      body: 'Callout rewards and realised profit land in the agent treasury, and every line shows up in the terminal.' },
    { k: '05', title: 'Buyback & burn', by: 'worker', metric: 'burned',
      body: 'A fixed share of every claim buys PUMPXBT on the open market and burns it. The loop closes and runs again.' }
  ],

  capabilities: [
    { code: 'SIG', title: 'Signal stack', body: 'A read on every launch seconds after the curve opens: flow, breadth, freshness and curve state.' },
    { code: 'CLR', title: 'Caller intelligence', body: 'Callers are scored by their actual record. Small samples get shrunk and stale wins decay, so lucky streaks don’t survive the math.' },
    { code: 'WLT', title: 'Wallet radar', body: 'Watches what proven wallets buy before they say anything. The gap between the buy and the call is the edge.' },
    { code: 'RGM', title: 'Regime sense', body: 'Knows when the tape is worth trading. Hot tape gets size, dead tape gets patience.' },
    { code: 'ADP', title: 'Self-correction', body: 'It grades its own trades. A cold streak tightens the trigger, and a hot one earns it back.' },
    { code: 'MEM', title: 'Memory', body: 'It remembers every thread, wallet and call. Ask it on X and it answers from live state.' }
  ],

  roadmap: [
    { phase: 'Live', title: 'Terminal: free', body: 'Live launches, the flywheel and the agent’s record, in public. No login.', state: 'live' },
    { phase: 'Paper', title: 'Agent + callouts', body: 'The agent runs on live data with simulated fills. Execution goes live once the record is proven.', state: 'progress' },
    { phase: 'Next', title: 'Buyback & burn feed', body: 'Every flywheel cycle linked transaction by transaction, straight from the worker’s ledger.', state: 'next' },
    { phase: 'Soon', title: 'Terminal Pro', body: 'Wallet scanner, live signal scoring, caller leaderboard, alerts and an API.', state: 'soon' }
  ],

  faq: [
    { q: 'What is PumpXBT?', a: 'An autonomous agent built for one venue: pump.fun. It reads launches in real time, scores callers by their record, trades a creator-fee treasury and publishes its theses as callouts. The terminal keeps the score.' },
    { q: 'Where does the treasury come from?', a: 'Creator fees. A worker claims them on a fixed cycle and splits each claim: part buys back and burns PUMPXBT, part funds the agent treasury. The split is public config.' },
    { q: 'Is the agent trading real money?', a: 'Not yet. It runs on live market data with simulated fills, and every agent figure is labelled SIMULATED until that changes. The fee claim and buyback run on their own worker, and its status is shown live.' },
    { q: 'Why should I trust the numbers?', a: 'Don’t. Check them. Burned supply is read from the mint on-chain, claimable fees from the creator vaults, and worker health from the worker itself. If a source is down, the figure shows “—” instead of a guess.' },
    { q: 'Are callouts financial advice?', a: 'No. Callouts are a public record of what the agent does with its own treasury, timestamped so you can judge the record. Nothing here tells you to buy anything.' }
  ]
};
