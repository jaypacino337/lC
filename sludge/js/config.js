/* ============================================================================
   SLUDGE — site config. Stage, links, API base and the loop copy live here.
   Honesty contract: unknowns render "—", unset links are hidden or disabled
   (never href="#"), and every loop step carries its real status.
   ========================================================================== */
window.SLUDGE = {

  /* 'prelaunch' — $SLUDGE has no contract yet (current)
     'live'      — token.address is set and the token trades              */
  stage: 'prelaunch',

  links: {
    buy: '',                  // $SLUDGE market URL (pump.fun/coin/<mint>) once it exists
    x: '',                    // https://x.com/<handle> — footer link stays hidden until set
    pump: 'https://pump.fun'
  },

  token: {
    address: '',              // $SLUDGE mint → CA pill becomes click-to-copy, buy button activates
    symbol: 'SLUDGE'
  },

  /* Serverless functions in /api/sludge/* (same origin on Vercel). Set to a
     full origin if the static site is hosted somewhere without functions. */
  api: '/api/sludge',

  /* The loop, as the site explains it — status is LIVE | MANUAL | PLANNED. */
  loop: [
    { k: 'CRAWL',   status: 'LIVE',    body: 'Reads pump.fun’s top and currently-live coins plus DexScreener’s boosted Solana tokens. Refreshed every few minutes.' },
    { k: 'DISTILL', status: 'LIVE',    body: 'Boils names, tickers and descriptions down to the words that keep recurring across different coins.' },
    { k: 'BREW',    status: 'LIVE',    body: 'Names it, tickers it, writes the description and draws the creature — in your browser, seeded and repeatable.' },
    { k: 'LAUNCH',  status: 'MANUAL',  body: 'You launch it on pump.fun with your own wallet. SLUDGE hands you the kit; it never holds a key or signs anything.' },
    { k: 'SCORE',   status: 'LIVE',    body: 'Graded on DexScreener volume, liquidity, turnover, age and order flow. Inflated market caps get docked.' },
    { k: 'MUTATE',  status: 'PLANNED', body: 'Feed the scores back into the brewer so it keeps what paid and dissolves what didn’t. Not built yet.' }
  ]
};
