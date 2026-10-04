import "server-only";
import { getDbInternal, type DB } from "./client";

export type { DB };
export async function getDb(): Promise<DB> {
  return getDbInternal();
}
