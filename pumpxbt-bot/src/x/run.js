/* Entry point for the X agent — its own service so it can deploy separately
 * from the trading loop (`npm run x` on Railway, sharing the data/ volume). */
import { validate } from '../config.js';
import { log } from '../log.js';
import { Store } from '../store/db.js';
import { XAgent } from './agent.js';

validate();
const agent = new XAgent(new Store());

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info('x agent shutting down', { signal: sig });
    agent.stop();
    setTimeout(() => process.exit(0), 500);
  });
}

agent.run().catch(err => {
  log.error('x agent fatal', { err: err.message });
  process.exit(1);
});
