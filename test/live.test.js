import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateKeypair, encryptSeed, decryptSeed, importSecret, publicKeyFromSeed } from '../lib/live/keystore.js';
import { parseTransaction, signTransaction } from '../lib/live/solana.js';
import { verifyEd25519 } from '../lib/auth.js';
import { base58Decode, base58Encode } from '../public/shared/util.js';
import { liveReady, mode } from '../lib/config.js';

const KEY = crypto.randomBytes(32).toString('hex');

test('live mode is off unless explicitly enabled with all prerequisites', () => {
  delete process.env.LIVE_TRADING;
  assert.equal(mode(), 'paper');
  process.env.LIVE_TRADING = 'true';
  assert.equal(liveReady(), false, 'flag alone is not enough');
  delete process.env.LIVE_TRADING;
});

test('keystore: encrypt/decrypt round trip, wrong key fails, import checks pubkey', () => {
  const kp = generateKeypair();
  const blob = encryptSeed(kp.seed, Buffer.from(KEY, 'hex'));
  assert.ok(!JSON.stringify(blob).includes(kp.seed.toString('base64')));
  assert.deepEqual(decryptSeed(blob, Buffer.from(KEY, 'hex')), kp.seed);
  assert.throws(() => decryptSeed(blob, crypto.randomBytes(32)));
  const secret64 = base58Encode(Buffer.concat([kp.seed, base58Decode(kp.publicKey)]));
  assert.equal(importSecret(secret64).publicKey, kp.publicKey);
  const tampered = base58Encode(Buffer.concat([kp.seed, crypto.randomBytes(32)]));
  assert.throws(() => importSecret(tampered), /does not match/);
});

test('signs a v0 wire transaction in the fee payer slot', () => {
  const kp = generateKeypair();
  // minimal v0 message: prefix, header(1 signer), 2 keys, blockhash, 0 ix, 0 lookups
  const msg = Buffer.concat([Buffer.from([0x80, 1, 0, 1, 2]), base58Decode(kp.publicKey), crypto.randomBytes(32), crypto.randomBytes(32), Buffer.from([0, 0])]);
  const wire = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), msg]);
  const p = parseTransaction(wire);
  assert.equal(p.versioned, true);
  assert.equal(p.accountKeys[0], kp.publicKey);
  const { bytes, signature } = signTransaction(wire, kp.seed);
  assert.ok(verifyEd25519(publicKeyFromSeed(kp.seed), msg, signature));
  assert.deepEqual(bytes.subarray(1, 65), Buffer.from(base58Decode(signature)));
  assert.throws(() => signTransaction(wire, generateKeypair().seed), /not a signer/);
});
