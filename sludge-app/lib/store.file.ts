import fs from "node:fs/promises";
import path from "node:path";
import { MINT_RE, type Batch, type BatchStore, type PendingBrew } from "./batch";

/**
 * File backend: JSON files in SLUDGE_DATA_DIR (./.data). For one server / a VPS /
 * Railway with a volume. On Vercel the disk is ephemeral, so set
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to use store.supabase.ts instead.
 */
const DIR = process.env.SLUDGE_DATA_DIR ?? path.join(process.cwd(), ".data");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 1));
  await fs.rename(tmp, file); // atomic: readers never see a half-written file
}

const safe = (mint: string) => {
  if (!MINT_RE.test(mint)) throw new Error("bad mint");
  return mint;
};
const batchFile = (mint: string) => path.join(DIR, "batches", `${safe(mint)}.json`);
const pendingFile = (mint: string) => path.join(DIR, "pending", `${safe(mint)}.json`);

export const fileStore: BatchStore = {
  async listBatches(limit = 60) {
    const dir = path.join(DIR, "batches");
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const all = await Promise.all(files.filter((f) => f.endsWith(".json")).map((f) => readJson<Batch>(path.join(dir, f))));
    return all.filter((b): b is Batch => !!b).sort((a, b) => b.at - a.at).slice(0, limit);
  },
  async addBatch(b) {
    const file = batchFile(b.mint);
    if (await readJson(file)) return;
    await writeJson(file, b);
  },
  putPending: (p: PendingBrew) => writeJson(pendingFile(p.mint), p),
  getPending: (mint: string) => readJson<PendingBrew>(pendingFile(mint)),
  deletePending: (mint: string) => fs.rm(pendingFile(mint), { force: true }),
};
