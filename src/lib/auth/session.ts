import "server-only";
import { cookies } from "next/headers";
import { sign, unsign } from "../crypto";

export const SESSION_COOKIE = "glowpad_session";
const MAX_AGE = 60 * 60 * 24 * 7;

export async function createSession(wallet: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sign(`${wallet}:${exp}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export function parseSession(raw: string | undefined): string | null {
  if (!raw) return null;
  const v = unsign(raw);
  if (!v) return null;
  const [wallet, exp] = v.split(":");
  if (!wallet || !exp || Number(exp) < Date.now() / 1000) return null;
  return wallet;
}

export async function getSessionWallet(): Promise<string | null> {
  return parseSession((await cookies()).get(SESSION_COOKIE)?.value);
}
