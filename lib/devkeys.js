// Test/dev helper: a throwaway ed25519 "creator wallet" that signs action messages the
// same way a browser wallet does. Never used by the server at runtime.
import crypto from 'node:crypto';
import { base58Encode } from '../public/shared/util.js';
import { BRAND } from './config.js';

export function devWallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  const address = base58Encode(raw);
  const sign = (message) => ({ message, signature: base58Encode(crypto.sign(null, Buffer.from(message, 'utf8'), privateKey)) });
  const action = (action, builder, extra = [], issued = new Date()) => sign([
    BRAND.actionHeader, `Action: ${action}`, `Builder: ${builder}`, ...extra, `Creator: ${address}`,
    `Nonce: ${crypto.randomBytes(5).toString('hex')}`, `Issued: ${issued.toISOString()}`,
  ].join('\n'));
  return { address, sign, action };
}
