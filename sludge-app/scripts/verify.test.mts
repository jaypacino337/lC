/**
 * Offline checks for the batch pipeline: no network, no mainnet.
 *   npx tsx scripts/verify.test.mts
 * 1. isBrewCreate accepts a pump.fun create signed by mint + creator, rejects look-alikes.
 * 2. The file store logs a batch once (idempotent) and lists newest first.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage } from "@solana/web3.js";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sludge-"));
process.env.SLUDGE_DATA_DIR = dir;
const { isBrewCreate } = await import("../lib/verify.ts");
const { PUMP } = await import("../lib/chain.ts");
const { fileStore } = await import("../lib/store.file.ts");

const creator = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const blockhash = "11111111111111111111111111111111";
const msg = (payer: PublicKey, signers: PublicKey[], program: PublicKey) =>
  new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [new TransactionInstruction({ programId: program, keys: signers.map((s) => ({ pubkey: s, isSigner: true, isWritable: true })), data: Buffer.alloc(0) })],
  }).compileToV0Message();

assert.equal(isBrewCreate(msg(creator, [creator, mint], PUMP), mint.toBase58(), creator.toBase58()), true, "real create");
assert.equal(isBrewCreate(msg(creator, [creator], PUMP), mint.toBase58(), creator.toBase58()), false, "mint didn't sign");
const other = Keypair.generate().publicKey;
assert.equal(isBrewCreate(msg(other, [other, mint], PUMP), mint.toBase58(), creator.toBase58()), false, "someone else paid");
assert.equal(isBrewCreate(msg(creator, [creator, mint], SystemProgram.programId), mint.toBase58(), creator.toBase58()), false, "not pump.fun");
console.log("✓ isBrewCreate: accepts the real create, rejects 3 look-alikes");

const base = { creator: creator.toBase58(), name: "GLORPLORD", symbol: "GLRP", image: null, description: "", devBuy: 0, signature: "sig" };
await fileStore.putPending({ ...base, mint: mint.toBase58(), at: 1 });
assert.equal((await fileStore.getPending(mint.toBase58()))?.symbol, "GLRP");
await fileStore.addBatch({ ...base, mint: mint.toBase58(), at: 1000 });
await fileStore.addBatch({ ...base, mint: mint.toBase58(), at: 9999, name: "DUPE" });
const m2 = Keypair.generate().publicKey.toBase58();
await fileStore.addBatch({ ...base, mint: m2, at: 2000 });
await fileStore.deletePending(mint.toBase58());
const list = await fileStore.listBatches();
assert.deepEqual(list.map((b) => b.mint), [m2, mint.toBase58()], "newest first");
assert.equal(list[1].name, "GLORPLORD", "second add of the same mint is ignored");
assert.equal(await fileStore.getPending(mint.toBase58()), null);
await assert.rejects(fileStore.addBatch({ ...base, mint: "../../etc/passwd", at: 1 }), /bad mint/);
console.log("✓ file store: idempotent per mint, newest first, path-safe");
await fs.rm(dir, { recursive: true, force: true });
