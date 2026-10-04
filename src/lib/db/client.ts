/**
 * Database client.
 * - DATABASE_URL set  -> real Postgres via postgres-js (run `npm run db:migrate` on deploy).
 * - otherwise         -> PGlite (Postgres compiled to WASM), in-memory by default or on disk
 *                        when PGLITE_DATA_DIR is set. Migrations are applied automatically.
 * Both paths share the same Drizzle schema and SQL migrations in ./drizzle.
 */
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const g = globalThis as unknown as { __glowpadDb?: Promise<DB> };

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

async function createPostgres(url: string): Promise<DB> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const sql = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX || 5), prepare: false });
  return drizzle(sql, { schema }) as unknown as DB;
}

export async function createPglite(dataDir?: string): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db as unknown as DB;
}

export function getDbInternal(): Promise<DB> {
  if (!g.__glowpadDb) {
    const url = process.env.DATABASE_URL;
    g.__glowpadDb = url ? createPostgres(url) : createPglite(process.env.PGLITE_DATA_DIR || undefined);
    g.__glowpadDb.catch(() => {
      g.__glowpadDb = undefined;
    });
  }
  return g.__glowpadDb;
}

/** Test helper: swap in a specific database instance. */
export function setDbForTests(db: DB | undefined) {
  g.__glowpadDb = db ? Promise.resolve(db) : undefined;
}

export function storageMode(): "postgres" | "pglite-disk" | "pglite-memory" {
  if (process.env.DATABASE_URL) return "postgres";
  return process.env.PGLITE_DATA_DIR ? "pglite-disk" : "pglite-memory";
}
