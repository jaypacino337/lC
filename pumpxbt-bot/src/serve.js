/* One process, one volume: the agent loop and the read-only ledger API share
 * the SQLite file and the live source connections. This is the Railway entry
 * point — Railway volumes attach to a single service, so the bot and the API
 * cannot be split across two services and still read the same database. */
import { config } from './config.js';
import { log } from './log.js';
import { Bot } from './main.js';
import { buildApi } from './api/server.js';

const bot = new Bot();
const { server } = buildApi({ store: bot.store, rpc: bot.rpc, pump: bot.pump });

server.listen(config.api.port, () => {
  log.info('ledger api listening', { port: config.api.port, cors: config.api.corsOrigins });
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info('shutting down', { signal: sig });
    bot.stop();
    server.close();
    setTimeout(() => process.exit(0), 500);
  });
}

bot.run().catch(err => {
  log.error('fatal', { err: err.message });
  process.exit(1);
});
