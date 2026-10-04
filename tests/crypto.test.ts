import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, loadKey, pkceChallenge, sign, unsign } from "@/lib/crypto";

describe("token encryption (AES-256-GCM)", () => {
  const key = randomBytes(32);
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("secret-access-token", key);
    const b = encrypt("secret-access-token", key);
    expect(a).not.toEqual(b);
    expect(a).not.toContain("secret");
    expect(decrypt(a, key)).toBe("secret-access-token");
  });
  it("rejects tampered ciphertext", () => {
    const parts = encrypt("hello", key).split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
  });
  it("rejects the wrong key", () => {
    expect(() => decrypt(encrypt("hello", key), randomBytes(32))).toThrow();
  });
  it("accepts base64 and hex keys of 32 bytes and rejects other sizes", () => {
    const raw = randomBytes(32);
    expect(loadKey(raw.toString("base64")).equals(raw)).toBe(true);
    expect(loadKey(raw.toString("hex")).equals(raw)).toBe(true);
    expect(() => loadKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("PKCE + session signing", () => {
  it("computes the RFC 7636 S256 challenge", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("signs and verifies cookies, rejecting forgeries", () => {
    const s = sign("wallet:123");
    expect(unsign(s)).toBe("wallet:123");
    expect(unsign(s.replace("wallet", "attacker"))).toBeNull();
  });
});
