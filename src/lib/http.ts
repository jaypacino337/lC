import "server-only";
import { NextResponse } from "next/server";
import { getSessionWallet } from "./auth/session";
import { config } from "./config";
import { getDbInternal, type DB } from "./db/client";
import { getInfluencerById } from "./services/influencers";

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function err(message: string, status = 400, extra?: Record<string, unknown>) {
  return json({ error: message, ...extra }, status);
}

export async function db(): Promise<DB> {
  return getDbInternal();
}

export async function requireWallet(): Promise<string | NextResponse> {
  const w = await getSessionWallet();
  return w ?? err("Sign in with your wallet first.", 401);
}

export async function requireOwner(id: string) {
  const wallet = await requireWallet();
  if (typeof wallet !== "string") return wallet;
  const d = await db();
  const inf = await getInfluencerById(d, id);
  if (!inf) return err("Influencer not found", 404);
  if (inf.ownerWallet !== wallet) return err("Only the creator wallet can manage this influencer.", 403);
  return { wallet, inf, d };
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without a secret, cron routes only work outside production. */
export function cronAuthorized(req: Request): boolean {
  const secret = config.cronSecret();
  if (!secret) return !config.isProd();
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
