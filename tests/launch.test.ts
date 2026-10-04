import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { CreateTxRequest, buildCreatePayload, buildIpfsForm, costSummary, validateImage } from "@/lib/launch/payload";
import { verifyLaunchTx, type ParsedTx } from "@/lib/launch/verify";
import { PUMP_PROGRAM_ID } from "@/lib/launch/constants";

const user = Keypair.generate().publicKey.toBase58();
const mint = Keypair.generate().publicKey.toBase58();
const base = { publicKey: user, mint, name: "Glow Moth", symbol: "moth", uri: "https://ipfs.io/ipfs/bafk" };

describe("PumpPortal create payload", () => {
  it("builds the local-transaction body with only public keys", () => {
    const p = buildCreatePayload(CreateTxRequest.parse(base));
    expect(p).toEqual({
      publicKey: user,
      action: "create",
      tokenMetadata: { name: "Glow Moth", symbol: "MOTH", uri: "https://ipfs.io/ipfs/bafk" },
      mint,
      denominatedInSol: "true",
      amount: 0,
      slippage: 10,
      priorityFee: 0.0005,
      pool: "pump",
    });
    expect(JSON.stringify(p)).not.toMatch(/secret/i);
  });
  it("rejects bad input", () => {
    expect(CreateTxRequest.safeParse({ ...base, devBuySol: 6 }).success).toBe(false);
    expect(CreateTxRequest.safeParse({ ...base, symbol: "MO TH" }).success).toBe(false);
    expect(CreateTxRequest.safeParse({ ...base, uri: "http://insecure" }).success).toBe(false);
    expect(CreateTxRequest.safeParse({ ...base, mint: "notakey" }).success).toBe(false);
    expect(() => buildCreatePayload(CreateTxRequest.parse({ ...base, mint: user }))).toThrow(/fresh keypair/);
  });
  it("validates images and builds the IPFS form", () => {
    expect(validateImage({ type: "image/svg+xml", size: 2000 })).toMatch(/PNG/);
    expect(validateImage({ type: "image/png", size: 10 * 1024 * 1024 })).toMatch(/under/);
    expect(validateImage({ type: "image/png", size: 2000 })).toBeNull();
    const fd = buildIpfsForm({ name: "Glow", symbol: "glw", description: "d", twitter: "", telegram: "", website: "https://glow.example" }, new Blob(["x"]));
    expect(fd.get("showName")).toBe("true");
    expect(fd.get("symbol")).toBe("GLW");
    expect(fd.get("file")).toBeInstanceOf(Blob);
  });
  it("summarises costs with the 0.5% PumpPortal fee on the dev buy only", () => {
    expect(costSummary(0, 0.0005, 0.025).portalFee).toBe(0);
    const c = costSummary(1, 0.0005, 0.025);
    expect(c.portalFee).toBeCloseTo(0.005);
    expect(c.total).toBeCloseTo(1.0305);
  });
});

describe("on-chain launch verification", () => {
  const sig = "5".repeat(88);
  const good = (): ParsedTx => ({
    meta: { err: null, postTokenBalances: [{ mint }], logMessages: ["Program 6EF8... invoke [1]", "Program log: Instruction: Create"] },
    transaction: {
      signatures: [sig, "x"],
      message: {
        accountKeys: [
          { pubkey: user, signer: true, writable: true },
          { pubkey: mint, signer: true, writable: true },
          { pubkey: PUMP_PROGRAM_ID, signer: false },
        ],
        instructions: [{ programId: "ComputeBudget111111111111111111111111111111" }, { programId: PUMP_PROGRAM_ID }],
      },
    },
  });
  const claim = { mint, creator: user, signature: sig };
  it("accepts a successful create signed by creator + mint", () => expect(verifyLaunchTx(good(), claim)).toEqual({ ok: true, reason: "verified on-chain" }));
  it("rejects missing / failed transactions", () => {
    expect(verifyLaunchTx(null, claim).ok).toBe(false);
    const t = good();
    t.meta!.err = { InstructionError: [1, "Custom"] };
    expect(verifyLaunchTx(t, claim).reason).toMatch(/failed/);
  });
  it("rejects when someone else signed/paid", () => {
    const other = Keypair.generate().publicKey.toBase58();
    expect(verifyLaunchTx(good(), { ...claim, creator: other }).reason).toMatch(/creator wallet/);
  });
  it("rejects when the mint did not sign (e.g. a buy of an existing coin)", () => {
    const t = good();
    t.transaction.message.accountKeys[1].signer = false;
    expect(verifyLaunchTx(t, claim).reason).toMatch(/mint keypair/);
  });
  it("rejects non-pump.fun transactions and signature mismatches", () => {
    const t = good();
    t.transaction.message.instructions = [];
    t.transaction.message.accountKeys = t.transaction.message.accountKeys.slice(0, 2);
    expect(verifyLaunchTx(t, claim).reason).toMatch(/pump.fun program/);
    expect(verifyLaunchTx(good(), { ...claim, signature: "6".repeat(88) }).reason).toMatch(/signature/);
  });
});
