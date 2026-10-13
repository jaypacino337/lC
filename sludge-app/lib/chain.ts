import { Connection, PublicKey } from "@solana/web3.js";

export const connection = () => new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");

/** pump.fun bonding-curve program. */
export const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
/** pump.fun starts every curve with 793.1M real tokens for sale (6 decimals). */
const INITIAL_REAL_TOKENS = 793_100_000_000_000n;

/**
 * Bonding-curve progress read from chain: pump.fun BondingCurve account
 * (8-byte discriminator, then u64 virtual_token, virtual_sol, real_token,
 * real_sol, total_supply, then bool complete). null when unreadable.
 */
export async function curveProgress(conn: Connection, mints: string[]): Promise<Map<string, { progress: number; complete: boolean; realSol: number } | null>> {
  const out = new Map<string, { progress: number; complete: boolean; realSol: number } | null>();
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const pdas = chunk.map((m) => PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(m).toBuffer()], PUMP)[0]);
    const accs = await conn.getMultipleAccountsInfo(pdas).catch(() => chunk.map(() => null));
    accs.forEach((a, j) => {
      if (!a || a.data.length < 49) return out.set(chunk[j], null);
      const realToken = a.data.readBigUInt64LE(24);
      const realSol = a.data.readBigUInt64LE(32);
      const complete = a.data[48] === 1;
      const sold = INITIAL_REAL_TOKENS - (realToken > INITIAL_REAL_TOKENS ? INITIAL_REAL_TOKENS : realToken);
      out.set(chunk[j], { progress: complete ? 1 : Number((sold * 10_000n) / INITIAL_REAL_TOKENS) / 10_000, complete, realSol: Number(realSol) / 1e9 });
    });
  }
  return out;
}
