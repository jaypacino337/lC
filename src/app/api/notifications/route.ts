import { db, json, requireWallet } from "@/lib/http";
import { listNotifications, markAllRead } from "@/lib/services/notify";

export async function GET() {
  const wallet = await requireWallet();
  if (typeof wallet !== "string") return wallet;
  return json({ notifications: await listNotifications(await db(), wallet) });
}

export async function POST() {
  const wallet = await requireWallet();
  if (typeof wallet !== "string") return wallet;
  await markAllRead(await db(), wallet);
  return json({ ok: true });
}
