import type { VersionedMessage } from "@solana/web3.js";
import { PUMP } from "./chain";

/**
 * Is this (confirmed) tx the create tx of that brew? It must be signed by the
 * mint keypair, paid for (first signer) by the creator who started the brew,
 * and call the pump.fun program. Program ids can't live in lookup tables, so
 * checking the static keys is enough.
 */
export function isBrewCreate(msg: VersionedMessage, mint: string, creator: string): boolean {
  const keys = msg.staticAccountKeys.map((k) => k.toBase58());
  const signers = keys.slice(0, msg.header.numRequiredSignatures);
  return signers[0] === creator && signers.includes(mint) && keys.includes(PUMP.toBase58());
}
