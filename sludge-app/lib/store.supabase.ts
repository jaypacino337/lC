import { MINT_RE, type Batch, type BatchStore, type PendingBrew } from "./batch";

/**
 * Supabase backend over its REST API (PostgREST), no SDK. Tables: supabase/schema.sql
 * (RLS on, no public policies, so only this server-side service-role key can read
 * or write). Batches are append-only and keyed by mint, so an insert that
 * ignores duplicates is all the concurrency control needed.
 */
export function supabaseStore(url: string, serviceKey: string): BatchStore {
  const base = `${url.replace(/\/$/, "")}/rest/v1`;
  async function rest<T>(p: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
    const res = await fetch(`${base}${p}`, {
      ...init,
      cache: "no-store",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        ...(init.prefer ? { prefer: init.prefer } : {}),
      },
    });
    if (!res.ok) throw new Error(`Supabase ${init.method ?? "GET"} ${p.split("?")[0]} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }
  const safe = (mint: string) => {
    if (!MINT_RE.test(mint)) throw new Error("bad mint");
    return encodeURIComponent(mint);
  };

  return {
    async listBatches(limit = 60) {
      const rows = await rest<{ data: Batch }[]>(`/sludge_batches?select=data&order=created_at.desc&limit=${Math.min(200, Math.max(1, limit))}`);
      return rows.map((r) => r.data);
    },
    async addBatch(b) {
      safe(b.mint);
      await rest(`/sludge_batches?on_conflict=mint`, {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: JSON.stringify({ mint: b.mint, creator: b.creator, data: b }),
      });
    },
    async putPending(p: PendingBrew) {
      safe(p.mint);
      await rest(`/sludge_pending?on_conflict=mint`, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: JSON.stringify({ mint: p.mint, data: p }),
      });
    },
    async getPending(mint) {
      const rows = await rest<{ data: PendingBrew }[]>(`/sludge_pending?select=data&mint=eq.${safe(mint)}`);
      return rows[0]?.data ?? null;
    },
    async deletePending(mint) {
      await rest(`/sludge_pending?mint=eq.${safe(mint)}`, { method: "DELETE", prefer: "return=minimal" });
    },
  };
}
