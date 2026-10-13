/** Shared types for the batch registry (no runtime imports, so stores can import it freely). */
/** A brew that has a create tx built but not yet confirmed on-chain. */
export interface PendingBrew {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  image: string | null;
  description: string;
  devBuy: number;
  at: number;
}

/** A coin the vat actually launched: its create tx confirmed through /api/send. */
export interface Batch {
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  image: string | null;
  description: string;
  devBuy: number;
  signature: string;
  /** ms epoch of confirmation */
  at: number;
}

export interface BatchStore {
  listBatches(limit?: number): Promise<Batch[]>;
  /** Insert if absent (idempotent on mint). */
  addBatch(b: Batch): Promise<void>;
  putPending(p: PendingBrew): Promise<void>;
  getPending(mint: string): Promise<PendingBrew | null>;
  deletePending(mint: string): Promise<void>;
}

export const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
