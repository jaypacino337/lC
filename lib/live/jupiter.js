// LIVE MODE ONLY. Swaps through the Jupiter swap API. Nothing in this file runs unless
// LIVE_TRADING=true, WALLET_ENCRYPTION_KEY and SOLANA_RPC_URL are all set (see lib/config.js → liveReady).
import { liveReady } from '../config.js';
import { signTransaction, sendAndConfirm, lamports, rpc } from './solana.js';

const JUP = process.env.JUPITER_API_URL || 'https://lite-api.jup.ag/swap/v1';
export const WSOL = 'So11111111111111111111111111111111111111112';

function assertLive() { if (!liveReady()) throw new Error('Live trading is off (set LIVE_TRADING=true, WALLET_ENCRYPTION_KEY and SOLANA_RPC_URL)'); }

export async function quote({ inputMint, outputMint, amount, slippageBps = 1500 }) {
  const u = `${JUP}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${BigInt(amount)}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
  const r = await fetch(u);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('Jupiter quote: ' + (j.error || r.status));
  return j;
}

export async function swap({ seed, userPublicKey, quoteResponse, priorityFeeSol = 0.0002 }) {
  assertLive();
  const r = await fetch(`${JUP}/swap`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteResponse, userPublicKey, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: lamports(priorityFeeSol) }),
  });
  const j = await r.json();
  if (!r.ok || !j.swapTransaction) throw new Error('Jupiter swap: ' + (j.error || r.status));
  const { bytes } = signTransaction(Buffer.from(j.swapTransaction, 'base64'), seed);
  const signature = await sendAndConfirm(bytes);
  return { signature, inAmount: quoteResponse.inAmount, outAmount: quoteResponse.outAmount };
}

export async function buyWithSol({ seed, wallet, mint, sol, slippageBps }) {
  const q = await quote({ inputMint: WSOL, outputMint: mint, amount: lamports(sol), slippageBps });
  return swap({ seed, userPublicKey: wallet, quoteResponse: q });
}

export async function sellForSol({ seed, wallet, mint, rawAmount, slippageBps }) {
  const q = await quote({ inputMint: mint, outputMint: WSOL, amount: rawAmount, slippageBps });
  return swap({ seed, userPublicKey: wallet, quoteResponse: q });
}

export async function solBalance(wallet) { return (await rpc('getBalance', [wallet, { commitment: 'confirmed' }])).value / 1e9; }
