import { and, desc, eq, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { notifications } from "../db/schema";
import { newId } from "./ids";

export async function notify(db: DB, n: { wallet: string; influencerId?: string | null; kind: string; title: string; body: string }) {
  await db.insert(notifications).values({ id: newId(), wallet: n.wallet, influencerId: n.influencerId ?? null, kind: n.kind, title: n.title, body: n.body });
}

export async function listNotifications(db: DB, wallet: string, limit = 30) {
  return db.select().from(notifications).where(eq(notifications.wallet, wallet)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function markAllRead(db: DB, wallet: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.wallet, wallet), isNull(notifications.readAt)));
}
