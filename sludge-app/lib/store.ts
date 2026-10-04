export type { Batch, BatchStore, PendingBrew } from "./batch";
export { MINT_RE } from "./batch";
import type { BatchStore } from "./batch";
import { fileStore } from "./store.file";
import { supabaseStore } from "./store.supabase";

/**
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → Supabase (use this on Vercel).
 * Otherwise → JSON files in SLUDGE_DATA_DIR (default ./.data; one server with a disk).
 */
export const store: BatchStore =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? supabaseStore(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : fileStore;

export const storeKind = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "file";
