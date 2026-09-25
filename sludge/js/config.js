/* ============================================================================
   SLUDGE — site config. Stage, links, and the vat feed all live here.
   Same honesty contract as the rest of the repo: the render layer shows "—"
   for unknowns, the brewer is labelled a simulation until the real launcher
   exists, and `stage` drives every status surface at once.
   ========================================================================== */
window.SLUDGE = {

  /* 'prelaunch' — the vat is not launching coins yet (current)
     'live'      — the launcher actually deploys coins               */
  stage: 'prelaunch',

  links: {
    buy: '#',                 // $SLUDGE market URL when live
    x: '#',
    pump: 'https://pump.fun',
    docs: '#'
  },

  token: {
    address: '',              // contract address when live → CA pill activates
    symbol: 'SLUDGE'
  },

  /* Batches the vat has actually brewed and launched. Empty until the real
     launcher exists — the table shows its empty state, never demo rows. */
  batches: [],

  /* The loop, as the site explains it. */
  loop: [
    { k: 'CRAWL',  body: 'Reads the internet raw — feeds, forums, the trenches. No filters, no taste.' },
    { k: 'DISTILL', body: 'Boils the noise down to whatever narrative is actually forming.' },
    { k: 'BREW',   body: 'Names it, draws it, writes the case. A coin congeals in the vat.' },
    { k: 'LAUNCH', body: 'Deploys to pump.fun. The sludge is loose.' },
    { k: 'SCORE',  body: 'Graded on real onchain volume only. No vibes, no self-reporting.' },
    { k: 'MUTATE', body: 'Every hour: keep the lessons that paid, dissolve the ones that didn’t.' }
  ]
};
