// LIVE MODE ONLY. Builder wallet keys, encrypted at rest with AES-256-GCM.
// The encryption key comes from WALLET_ENCRYPTION_KEY (32 bytes, hex or base64) and is never stored.
// Rules: keys are never logged, never returned by any API route, never sent to the browser.
import crypto from 'node:crypto';
import { base58Encode, base58Decode } from '../../public/shared/util.js';

const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

function masterKey(raw = process.env.WALLET_ENCRYPTION_KEY) {
  if (!raw) throw new Error('WALLET_ENCRYPTION_KEY is not set');
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('WALLET_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)');
  return k;
}

export function publicKeyFromSeed(seed) {
  const pk = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(seed)]), format: 'der', type: 'pkcs8' });
  const jwk = crypto.createPublicKey(pk).export({ format: 'jwk' });
  return base58Encode(Buffer.from(jwk.x, 'base64url'));
}

export function generateKeypair() {
  const seed = crypto.randomBytes(32);
  return { publicKey: publicKeyFromSeed(seed), seed };
}

// Operator-supplied key: base58 64-byte secret (Phantom export) or a JSON byte array (solana-keygen)
export function importSecret(input) {
  const s = String(input).trim();
  const bytes = s.startsWith('[') ? Uint8Array.from(JSON.parse(s)) : base58Decode(s);
  if (bytes.length !== 64 && bytes.length !== 32) throw new Error('Expected a 64-byte secret key or 32-byte seed');
  const seed = Buffer.from(bytes.slice(0, 32));
  const publicKey = publicKeyFromSeed(seed);
  if (bytes.length === 64 && base58Encode(bytes.slice(32)) !== publicKey) throw new Error('Secret key does not match its public key');
  return { publicKey, seed };
}

export function encryptSeed(seed, key = masterKey()) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(seed), c.final()]);
  return { v: 1, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}

export function decryptSeed(blob, key = masterKey()) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
  d.setAuthTag(Buffer.from(blob.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(blob.ct, 'base64')), d.final()]);
}

export function signBytes(seed, bytes) {
  const pk = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(seed)]), format: 'der', type: 'pkcs8' });
  return crypto.sign(null, Buffer.from(bytes), pk);
}
