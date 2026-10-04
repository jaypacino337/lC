import { NextResponse } from "next/server";
import { connection, curveProgress } from "@/lib/chain";
import { tokensByAddress } from "@/lib/dex";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export interface BatchView {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  creator: string;
  signature: string;
  at: number;
  devBuy: number;
  /** 0..1 from the pump.fun curve account; null when unreadable */
  curve: number | null;
  graduated: boolean;
  marketCap: number | null;
  volume24h: number | null;
  change24h: number | null;
  url: string;
}

/** Coins the vat launched: registry (confirmed creates) + chain (curve) + DexScreener (market). Real data only. */
export async function GET() {
  try {
    const batches = await store.listBatches(60);
    if (batches.length === 0) return NextResponse.json({ batches: [], at: Date.now() });
    const mints = batches.map((b) => b.mint);
    const [curves, market] = await Promise.all([
      curveProgress(connection(), mints).catch(() => new Map<string, null>()),
      tokensByAddress(mints).catch(() => []),
    ]);
    const m = new Map(market.map((t) => [t.address, t]));
    const out: BatchView[] = batches.map((b) => {
      const c = curves.get(b.mint) ?? null;
      const t = m.get(b.mint);
      return {
        mint: b.mint,
        name: b.name,
        symbol: b.symbol,
        image: b.image ?? t?.image ?? null,
        creator: b.creator,
        signature: b.signature,
        at: b.at,
        devBuy: b.devBuy,
        curve: c ? c.progress : null,
        graduated: !!c?.complete || t?.stage === "dex",
        marketCap: t?.marketCap ?? null,
        volume24h: t?.volume24h ?? null,
        change24h: t?.change24h ?? null,
        url: `https://pump.fun/coin/${b.mint}`,
      };
    });
    return NextResponse.json({ batches: out, at: Date.now() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ batches: [], error: "The batch log is unreachable right now.", at: Date.now() }, { status: 502 });
  }
}
