/* Validates flywheel/memcoin.config.json with the same rules the memcoinz
 * worker applies at boot, then prints the one-line MEMCOIN_CONFIG_JSON for the
 * Railway service. Prints no secrets: the config only NAMES the key's env var.
 *
 *   PXBT_MINT=<mint> PXBT_TREASURY=<wallet> npm run flywheel:env */
import { readFileSync } from 'node:fs';
import { isAddress } from '../src/sources/solana.js';

export function buildWorkerConfig(file, env = process.env) {
  const cfg = JSON.parse(readFileSync(file, 'utf8'));
  if (env.PXBT_MINT) cfg.mint = env.PXBT_MINT;
  if (env.PXBT_TREASURY) cfg.payTo = { ...cfg.payTo, treasury: env.PXBT_TREASURY };

  const errs = [];
  if (!cfg.mint) errs.push('mint is empty (set PXBT_MINT or edit the file)');
  else if (!isAddress(cfg.mint)) errs.push(`mint "${cfg.mint}" is not a Solana address`);
  const creator = cfg.wallets?.creator;
  if (!creator) errs.push('wallets.creator missing (name an env var, e.g. "PXBT_CREATOR_KEYPAIR")');
  else if (isAddress(creator) || creator.length > 64) errs.push('wallets.creator must NAME an env var, not hold a key or address');
  const total = Object.values(cfg.route ?? { airdrop: 100 }).reduce((s, v) => s + (v ?? 0), 0);
  if (total !== 100) errs.push(`route must total 100 (got ${total})`);
  for (const k of ['creator', 'lp', 'treasury']) {
    if (cfg.route?.[k] && !cfg.payTo?.[k]) errs.push(`route.${k} is set but payTo.${k} is missing`);
    if (cfg.payTo?.[k] && !isAddress(cfg.payTo[k])) errs.push(`payTo.${k} is not a Solana address`);
  }
  return { cfg, errs };
}

const isMain = process.argv[1]?.endsWith('flywheel-env.js');
if (isMain) {
  const file = new URL('../flywheel/memcoin.config.json', import.meta.url);
  const { cfg, errs } = buildWorkerConfig(file);
  if (errs.length) {
    console.error('✖ flywheel config:\n  - ' + errs.join('\n  - '));
    process.exit(1);
  }
  console.log(`MEMCOIN_CONFIG_JSON=${JSON.stringify(cfg)}`);
  console.error(`\n✓ valid. Also set on the worker: ${cfg.wallets.creator} (sealed), SOLANA_RPC_URL, RAILWAY_RUN_UID=0. Leave LIVE unset for the dry-run week.`);
}
