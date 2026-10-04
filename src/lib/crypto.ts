/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 * Key: TOKEN_ENCRYPTION_KEY = 32 random bytes, base64 or hex (`openssl rand -base64 32`).
 * In development an insecure derived key is used (with a warning); production refuses to run without one.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
let warned = false;

export function loadKey(raw = process.env.TOKEN_ENCRYPTION_KEY || ""): Buffer {
  if (raw) {
    const trimmed = raw.trim();
    const buf = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
    if (buf.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or hex).");
    return buf;
  }
  if (process.env.NODE_ENV === "production" && !process.env.VITEST) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required in production.");
  }
  if (!warned) {
    warned = true;
    console.warn("[glowpad] TOKEN_ENCRYPTION_KEY not set - using an insecure development key.");
  }
  return createHash("sha256").update("glowpad-insecure-dev-key").digest();
}

export function encrypt(plaintext: string, key: Buffer = loadKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string, key: Buffer = loadKey()): string {
  const [version, ivB, tagB, ctB] = payload.split(".");
  if (version !== VERSION || !ivB || !tagB || ctB === undefined) throw new Error("Malformed encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** PKCE S256 challenge for a verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function sessionKey(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (s) return createHash("sha256").update(s).digest();
  if (process.env.NODE_ENV === "production" && !process.env.VITEST) throw new Error("SESSION_SECRET is required in production.");
  return createHash("sha256").update("glowpad-insecure-dev-session").digest();
}

export function sign(value: string): string {
  const mac = createHmac("sha256", sessionKey()).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function unsign(signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const mac = Buffer.from(signed.slice(i + 1));
  const expected = Buffer.from(createHmac("sha256", sessionKey()).update(value).digest("base64url"));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return value;
}
