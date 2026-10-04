/* GET /api/sludge/score?mint=<solana mint>
   Score any Solana token on its deepest DexScreener pair. */
'use strict';
const L = require('../_lib/sludge');

module.exports = async (req, res) => {
  const mint = (L.query(req).get('mint') || '').trim();
  if (!L.MINT_RE.test(mint)) return L.send(res, 400, { error: 'That is not a Solana mint address.' });
  let pairs;
  try { pairs = await L.dexPairs([mint]); }
  catch (e) { return L.send(res, 502, { error: 'DexScreener did not answer.' }); }
  const p = pairs[mint];
  if (!p) return L.send(res, 404, { error: 'No DEX pair found for that mint on DexScreener yet.', mint });
  L.send(res, 200, Object.assign({ generatedAt: new Date().toISOString() }, L.scorePair(p)), 30);
};
