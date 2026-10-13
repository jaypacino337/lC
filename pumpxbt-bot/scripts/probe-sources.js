/* Hits every live source once and reports PASS/FAIL. Run before PXBT_SOURCE=live:
 *   npm run probe            (behind a proxy: NODE_USE_ENV_PROXY=1 npm run probe) */
import { PumpPortalStream } from '../src/sources/pumpportal.js';
import { DexScreener, WSOL } from '../src/sources/dexscreener.js';
import { SolanaReader } from '../src/sources/solana.js';
import { Flywheel } from '../src/sources/flywheel.js';
import { config } from '../src/config.js';

const results = [];
const check = async (name, fn) => {
  try { results.push([name, 'PASS', await fn()]); }
  catch (err) { results.push([name, 'FAIL', err.message]); }
};

const stream = new PumpPortalStream({ apiKey: config.pumpportal.apiKey });
let launch;
await check('pumpportal websocket (subscribeNewToken)', async () => {
  if (!(await stream.start())) throw new Error('did not open within 10s');
  const t0 = Date.now();
  while (!stream.creates.size && Date.now() - t0 < 30_000) await new Promise(r => setTimeout(r, 250));
  launch = [...stream.creates.values()][0];
  if (!launch) throw new Error('connected but no launch within 30s');
  return `${launch.symbol} ${launch.mint}`;
});
stream.stop();

const dex = new DexScreener();
await check('dexscreener tokens/v1 (SOL price)', async () => `SOL $${await dex.solUsd()}`);

const chain = new SolanaReader();
await check(`chain bonding curve via ${chain.endpoint}`, async () => {
  if (!launch) throw new Error('no launch to read');
  const c = await chain.bondingCurve(launch.mint);
  if (!c) throw new Error('curve account missing');
  return `progress ${(c.progress * 100).toFixed(2)}%, creator ${c.creator}`;
});

if (config.flywheel.workerUrl || config.flywheel.mint) {
  await check('flywheel (worker + chain)', async () => JSON.stringify(await new Flywheel({ chain }).state()));
}

for (const [name, status, detail] of results) console.log(`${status === 'PASS' ? '✓' : '✖'} ${name}: ${detail}`);
process.exit(results.some(r => r[1] === 'FAIL') ? 1 : 0);
