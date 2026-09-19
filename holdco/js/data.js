/* ============================================================================
   HOLDCO — content and data model.

   Every number, card, table row and agenda item on the site renders from this
   file. To wire live data later (Supabase / onchain), replace the static
   values here or point `sources.*` at endpoints — the components in
   components.js consume this shape and nothing else.

   HONESTY RULES (enforced by the render layer):
   - Never put invented revenue here. Unknown = null → renders as "—".
     Genuinely zero = 0 → renders as "$0".
   - A feature is LIVE only when it is usable today. Otherwise BETA or PLANNED.
   ========================================================================== */
window.HOLDCO = {

  meta: {
    name: 'HOLDCO',
    chain: 'Robinhood Chain',
    stage: 'BETA',            // shown as the global stage label
    applicationsOpen: true
  },

  links: {
    apply: '#apply',          // in-page application form
    buy: '#',                 // token market URL when live
    docs: '#',
    x: '#',
    proof: '#'                // onchain treasury / explorer link when live
  },

  /* If set, the application form POSTs JSON here (e.g. a Supabase edge
     function). If empty, the form falls back to copy-to-clipboard. */
  application: {
    endpoint: '',
    contact: ''               // e.g. '@holdco' — shown in the fallback note
  },

  /* ── Group metrics (hero + financials). null = no data yet → "—" ───────── */
  metrics: {
    subsidiaries: 0,
    groupRevenueUsd: 0,
    treasuryUsd: 0,
    subsidiaryRevenueUsd: 0,
    operatingExpensesUsd: 0,
    buybacksUsd: 0,
    developmentUsd: 0
  },

  /* ── Portfolio directory ───────────────────────────────────────────────── */
  subsidiaries: [
    {
      name: 'HOLDCO LAUNCH OFFICE',
      status: 'BETA',
      category: 'Infrastructure',
      blurb: 'Shared infrastructure for launching new companies.',
      revenueUsd: 0,
      launch: null            // ISO date string when known
    },
    {
      name: 'HOLDCO BOARDROOM',
      status: 'PLANNED',
      category: 'Governance',
      blurb: 'Company governance, proposals and group decisions.',
      revenueUsd: null,
      launch: null
    },
    {
      name: 'HOLDCO PAYROLL',
      status: 'PLANNED',
      category: 'Operations',
      blurb: 'Payroll infrastructure for onchain teams.',
      revenueUsd: null,
      launch: null
    },
    {
      name: 'HOLDCO CONTRACTOR',
      status: 'PLANNED',
      category: 'Operations',
      blurb: 'Funded jobs and contributor payments.',
      revenueUsd: null,
      launch: null
    },
    {
      name: 'HOLDCO VENTURES',
      status: 'PLANNED',
      category: 'Incubation',
      blurb: 'Incubation and grants for new products.',
      revenueUsd: null,
      launch: null
    },
    {
      name: 'HOLDCO IPO',
      status: 'PLANNED',
      category: 'Launch pathway',
      blurb: 'Milestone-based pathway for companies preparing to launch.',
      revenueUsd: null,
      launch: null
    }
  ],

  /* ── Launch office ─────────────────────────────────────────────────────── */
  launchOffice: {
    gets: [
      'Pons / Robinhood Chain launch infrastructure',
      'Shared contract templates',
      'Treasury dashboards',
      'Fee-routing infrastructure',
      'Product and development support',
      'Branding and launch resources',
      'HOLDCO distribution',
      'Company reporting',
      'Access to future HOLDCO modules'
    ]
  },

  /* ── Token utility ─────────────────────────────────────────────────────── */
  token: [
    {
      title: 'LAUNCH BONDS',
      body: 'Approved subsidiary operators may be required to lock HOLDCO while completing launch milestones.'
    },
    {
      title: 'BOARDROOM',
      body: 'HOLDCO can be used for eligible proposal and governance participation.'
    },
    {
      title: 'GROUP SERVICES',
      body: 'HOLDCO can unlock premium tooling, analytics, software modules and ecosystem services.'
    },
    {
      title: 'REPUTATION',
      body: 'Participation across HOLDCO companies can contribute to a persistent builder and operator profile.'
    },
    {
      title: 'FUTURE MODULES',
      body: 'Additional token utility may be introduced as real HOLDCO products launch.'
    }
  ],

  /* ── Boardroom agenda ──────────────────────────────────────────────────── */
  boardroom: {
    live: false,              // voting is not built; the section says so
    agendas: [
      { id: 'AGENDA 001', title: 'Select first external subsidiary', status: 'Upcoming' },
      { id: 'AGENDA 002', title: 'Prioritize next HOLDCO module', status: 'Upcoming' },
      { id: 'AGENDA 003', title: 'Development budget framework', status: 'Planned' }
    ]
  },

  /* ── Financial allocations ledger. Empty until real activity exists. ──────
     Row shape: { date: 'YYYY-MM-DD', company, type, amountUsd, tx: 'url' } */
  allocations: [],

  /* ── Roadmap ───────────────────────────────────────────────────────────── */
  roadmap: [
    { n: '01', title: 'HOLDCO', body: 'Parent company launches.', status: 'BETA' },
    { n: '02', title: 'LAUNCH OFFICE', body: 'Subsidiary application and launch infrastructure.', status: 'BETA' },
    { n: '03', title: 'FIRST SUBSIDIARIES', body: 'Initial HOLDCO companies begin operating.', status: 'PLANNED' },
    { n: '04', title: 'BOARDROOM', body: 'Company proposal and governance layer.', status: 'PLANNED' },
    { n: '05', title: 'SHARED INFRASTRUCTURE', body: 'Payroll, contractor, treasury and reporting modules.', status: 'PLANNED' },
    { n: '06', title: 'EXPANSION', body: 'External builders and additional business verticals join the group.', status: 'PLANNED' }
  ]
};
