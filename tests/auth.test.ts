import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { buildSignInMessage, verifyWalletSignature } from "@/lib/auth/message";
import { isSolanaAddress } from "@/lib/solana/address";

describe("wallet ownership proof", () => {
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const message = buildSignInMessage({ domain: "glowpad.test", wallet, nonce: "n1", issuedAt: "2030-01-01T00:00:00Z" });
  it("verifies a real ed25519 signature over the sign-in message", () => {
    const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
    expect(verifyWalletSignature(message, sig, wallet)).toBe(true);
    expect(verifyWalletSignature(message.replace("n1", "n2"), sig, wallet)).toBe(false);
    expect(verifyWalletSignature(message, sig, bs58.encode(nacl.sign.keyPair().publicKey))).toBe(false);
  });
  it("tells the user it is not a transaction", () => expect(message).toMatch(/not a transaction/));
  it("validates addresses", () => {
    expect(isSolanaAddress(wallet)).toBe(true);
    expect(isSolanaAddress("0x4104906fd7da3152CA53dA54675cA2e3d65A4444")).toBe(false);
  });
});
