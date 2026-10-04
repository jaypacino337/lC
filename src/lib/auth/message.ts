import nacl from "tweetnacl";
import bs58 from "bs58";

/** The exact text a wallet signs to prove ownership. Signing a message never moves funds. */
export function buildSignInMessage(opts: { domain: string; wallet: string; nonce: string; issuedAt: string }): string {
  return [
    `${opts.domain} wants you to sign in with your Solana account:`,
    opts.wallet,
    "",
    "Sign in to GlowPad to manage your AI influencers. This is a message signature, not a transaction: it costs nothing and cannot move funds.",
    "",
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt}`,
  ].join("\n");
}

export function verifyWalletSignature(message: string, signatureB58: string, walletB58: string): boolean {
  try {
    const sig = bs58.decode(signatureB58);
    const pk = bs58.decode(walletB58);
    if (sig.length !== 64 || pk.length !== 32) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pk);
  } catch {
    return false;
  }
}
