// Creator actions are authorised by a free wallet signature (Solana signMessage, ed25519).
// The page builds the message with actionMessage() in public/app/wallet.js:
//   FOREMAN action / Action: x / Builder: <wallet> / ...extra / Creator: <addr> / Nonce / Issued
// No private keys ever reach the server: it only checks signatures against public keys.
import crypto from 'node:crypto';
import { base58Decode } from '../public/shared/util.js';
import { BRAND } from './config.js';
import { getStore } from './store.js';

const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
const MAX_AGE_MS = 10 * 60_000;

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export function isAddress(a) {
  if (typeof a !== 'string' || a.length < 32 || a.length > 44) return false;
  try { return base58Decode(a).length === 32; } catch { return false; }
}

export function verifyEd25519(pubkeyB58, messageBytes, signatureB58) {
  try {
    const pub = base58Decode(pubkeyB58);
    const sig = base58Decode(signatureB58);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(pub)]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(messageBytes), key, Buffer.from(sig));
  } catch { return false; }
}

export function parseMessage(message) {
  const lines = String(message || '').split('\n');
  const fields = {};
  for (const l of lines.slice(1)) {
    const i = l.indexOf(': ');
    if (i > 0) { const key = l.slice(0, i); if (!(key in fields)) fields[key] = l.slice(i + 2); }
  }
  return { header: lines[0], lines, fields };
}

// Checks a signed action. Returns the parsed message. Throws httpError on failure.
// expect: { action, builder?, creator?, lines?: [exact lines that must be present] }
export async function verifyAction(body, expect, { now = Date.now(), store = getStore() } = {}) {
  const { message, signature, signedMessage } = body || {};
  if (typeof message !== 'string' || typeof signature !== 'string') throw httpError(401, 'Sign the action in your wallet first');
  if (message.length > 4000) throw httpError(400, 'Message too long');
  const m = parseMessage(message);
  if (m.header !== BRAND.actionHeader) throw httpError(401, 'Unknown message format');
  if (m.fields.Action !== expect.action) throw httpError(401, `Signed message is for "${m.fields.Action}", expected "${expect.action}"`);
  if (expect.builder && m.fields.Builder !== expect.builder) throw httpError(401, 'Signed message is for a different builder');
  const creator = m.fields.Creator;
  if (!isAddress(creator)) throw httpError(401, 'Signed message has no creator wallet');
  if (expect.creator && creator !== expect.creator) throw httpError(403, 'Only the creator wallet can do this');
  for (const line of expect.lines || []) if (!m.lines.includes(line)) throw httpError(401, `Signed message is missing: ${line}`);
  const issued = Date.parse(m.fields.Issued || '');
  if (!Number.isFinite(issued) || Math.abs(now - issued) > MAX_AGE_MS) throw httpError(401, 'Signature expired. Sign again.');
  if (!m.fields.Nonce) throw httpError(401, 'Signed message has no nonce');

  // Some wallets sign a prefixed version of the message; accept it only if it contains ours.
  let bytes = Buffer.from(message, 'utf8');
  if (typeof signedMessage === 'string' && signedMessage) {
    const signed = Buffer.from(signedMessage, 'base64');
    if (!signed.includes(bytes)) throw httpError(401, 'Signed bytes do not contain the action');
    bytes = signed;
  }
  if (!verifyEd25519(creator, bytes, signature)) throw httpError(401, 'Bad signature');

  // replay protection: each signature works once
  const fresh = await store.setNX('fm:sig:' + signature.slice(0, 64), 1, MAX_AGE_MS * 2);
  if (!fresh) throw httpError(401, 'This signature was already used. Sign again.');
  return { ...m, creator };
}
