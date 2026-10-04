// Creates a few demo paper builders signed by a throwaway local wallet, then ticks once.
// npm run seed [-- 4]
import { prepareLaunch, tick } from '../lib/app.js';
import { devWallet } from '../lib/devkeys.js';
import { getStore } from '../lib/store.js';

const n = Math.min(5, Number(process.argv[2]) || 4);
const plans = [
  ['Rivet Rita', 'RITA', 'classic', 1], ['Dozer Dan', 'DOZER', 'trend', 2.5], ['Scaffold Sam', 'SCAF', 'scalper', 1],
  ['Digger Dee', 'DIGR', 'dip', 0.5], ['Level Lou', 'LOU', 'sniper', 5],
];
const w = devWallet();
for (const [agentName, ticker, strategy, capital] of plans.slice(0, n)) {
  const auth = w.action('launch', 'new', [`Name: ${agentName}`, `Ticker: ${ticker}`, `Capital: ${capital} SOL (paper)`]);
  const r = await prepareLaunch({ creator: w.address, coin: { name: agentName + ' Coin', ticker }, agentName, startingCapital: capital, strategy, avatarSeed: 'seed' + ticker.toLowerCase(), ...auth });
  console.log('created', r.no, agentName, strategy, capital, 'SOL (paper)');
}
console.log(JSON.stringify(await tick({ force: true })));
getStore().flush?.();
process.exit(0);
