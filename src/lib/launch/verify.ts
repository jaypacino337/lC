/**
 * On-chain verification of a launch before it enters the registry:
 *  - the transaction succeeded (meta.err == null)
 *  - the claimed creator signed it and paid the fee (first account key, signer)
 *  - the claimed mint signed it (a fresh mint keypair must sign pump.fun's create)
 *  - pump.fun's program was invoked and the mint now has a token balance / supply
 */
import { PUMP_PROGRAM_ID } from "./constants";

export interface ParsedAccountKey {
  pubkey: string;
  signer: boolean;
  writable?: boolean;
}

export interface ParsedTx {
  slot?: number;
  blockTime?: number | null;
  meta: { err: unknown; postTokenBalances?: { mint: string }[]; logMessages?: string[] } | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: ParsedAccountKey[]; instructions: { programId: string }[] };
  };
}

export interface VerifyResult {
  ok: boolean;
  reason: string;
}

export function verifyLaunchTx(tx: ParsedTx | null, claim: { mint: string; creator: string; signature: string }): VerifyResult {
  if (!tx) return { ok: false, reason: "transaction not found (not confirmed yet?)" };
  if (!tx.meta) return { ok: false, reason: "transaction has no status metadata" };
  if (tx.meta.err) return { ok: false, reason: `transaction failed: ${JSON.stringify(tx.meta.err)}` };
  if (!tx.transaction.signatures.includes(claim.signature)) return { ok: false, reason: "signature mismatch" };
  const keys = tx.transaction.message.accountKeys;
  const feePayer = keys[0];
  if (!feePayer || feePayer.pubkey !== claim.creator || !feePayer.signer) return { ok: false, reason: "creator wallet did not sign/pay for this transaction" };
  const mintKey = keys.find((k) => k.pubkey === claim.mint);
  if (!mintKey || !mintKey.signer) return { ok: false, reason: "mint keypair did not sign this transaction (not a fresh mint creation)" };
  const invokedPump = tx.transaction.message.instructions.some((i) => i.programId === PUMP_PROGRAM_ID) || keys.some((k) => k.pubkey === PUMP_PROGRAM_ID);
  if (!invokedPump) return { ok: false, reason: "pump.fun program was not invoked" };
  const logs = tx.meta.logMessages ?? [];
  const createLogged = logs.some((l) => /Instruction: Create/i.test(l));
  const mintHasBalance = (tx.meta.postTokenBalances ?? []).some((b) => b.mint === claim.mint);
  if (!createLogged && !mintHasBalance) return { ok: false, reason: "no pump.fun Create instruction found for this mint" };
  return { ok: true, reason: "verified on-chain" };
}

export async function fetchParsedTransaction(signature: string, rpcUrl: string, f: typeof fetch = fetch): Promise<ParsedTx | null> {
  const res = await f(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const j = (await res.json()) as { result: ParsedTx | null; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result;
}
