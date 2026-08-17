/* Read-only ledger API.
 *
 * This is the feed for the site's "show everything" panel: treasury balance,
 * every trade, PnL, holdings, callouts. Strictly read-only — there is no route
 * that can move funds or mutate strategy state, so exposing it publicly is safe.
 *
 *   GET /api/health
 *   GET /api/state      everything the site needs, one call
 *   GET /api/positions
 *   GET /api/callouts
 *   GET /api/ledger
 *   GET /api/callers    reputation leaderboard
 *   GET /api/decisions  audit trail, including rejections
 */
import { createServer } from 'node:http';
import { config } from '../config.js';
import { log } from '../log.js';
import { Store } from '../store/db.js';
import { Portfolio } from '../exec/portfolio.js';
import { RpcPool } from '../sources/rpcPool.js';
import { nowMs } from '../util.js';

const startedAt = nowMs();

export function buildApi({ store = new Store(), rpc = new RpcPool() } = {}) {
  const portfolio = new Portfolio(store);

  /* Treasury wallet balances, cached — the site polls, RPC costs money. */
  let treasuryCache = { at: 0, data: null };
  async function treasury() {
    if (!config.treasuryWallet || !rpc.size) return null;
    if (nowMs() - treasuryCache.at < 30_000) return treasuryCache.data;
    try {
      const [lamports, tokens] = await Promise.all([
        rpc.getBalance(config.treasuryWallet),
        rpc.getTokenAccounts(config.treasuryWallet)
      ]);
      treasuryCache = {
        at: nowMs(),
        data: { wallet: config.treasuryWallet, sol: lamports / 1e9, tokens }
      };
    } catch (err) {
      log.warn('treasury read failed', { err: err.message });
    }
    return treasuryCache.data;
  }

  const priceBook = () => {
    const rows = store.db.prepare(`
      SELECT mint, entry_price AS price FROM positions
      WHERE status IN ('open','floored')
    `).all();
    return Object.fromEntries(rows.map(r => [r.mint, r.price]));
  };

  const routes = {
    '/api/health': async () => ({
      ok: true,
      mode: config.mode,
      source: config.source,
      uptimeMs: nowMs() - startedAt,
      rpc: rpc.health(),
      ...store.stats()
    }),

    '/api/state': async () => {
      const summary = portfolio.summary(priceBook());
      const totals = Object.fromEntries(
        store.ledgerTotals().map(r => [r.kind, r.total])
      );
      return {
        mode: config.mode,
        paper: config.mode === 'paper',
        generatedAt: nowMs(),
        portfolio: summary,
        treasury: await treasury(),
        totals,
        callouts: {
          ours: store.recentOurCallouts(50),
          pending: store.pendingCallouts(20).length
        },
        topCallers: store.topCallers(10),
        stats: store.stats(),
        /* Never let a paper run be mistaken for a real track record. */
        disclaimer: config.mode === 'paper'
          ? 'PAPER MODE — all fills are simulated. No funds have been deployed.'
          : null
      };
    },

    '/api/positions': async () => ({
      open: portfolio.summary(priceBook()).positions,
      closed: store.closedPositions(100)
    }),
    '/api/callouts': async () => ({ ours: store.recentOurCallouts(200) }),
    '/api/ledger': async () => ({ entries: store.ledger(200), totals: store.ledgerTotals() }),
    '/api/callers': async () => ({ callers: store.topCallers(100) }),
    '/api/decisions': async () => ({ decisions: store.recentDecisions(200) })
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;

    if (origin && config.api.corsOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'application/json' })
         .end(JSON.stringify({ error: 'read-only API' }));
      return;
    }

    const handler = routes[url.pathname];
    if (!handler) {
      res.writeHead(404, { 'content-type': 'application/json' })
         .end(JSON.stringify({ error: 'not found', routes: Object.keys(routes) }));
      return;
    }

    try {
      const body = await handler();
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=10'
      }).end(JSON.stringify(body, null, 2));
    } catch (err) {
      log.error('api error', { path: url.pathname, err: err.message });
      res.writeHead(500, { 'content-type': 'application/json' })
         .end(JSON.stringify({ error: 'internal' }));
    }
  });

  return { server, store, routes };
}

const isMain = process.argv[1]?.endsWith('server.js');
if (isMain) {
  const { server } = buildApi();
  server.listen(config.api.port, () => {
    log.info('ledger api listening', {
      port: config.api.port, cors: config.api.corsOrigins
    });
  });
}
