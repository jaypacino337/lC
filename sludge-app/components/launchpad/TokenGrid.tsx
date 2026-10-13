"use client";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Marquee } from "@/components/fx";
import { cn } from "@/lib/cn";
import { fmtUsd, type Token } from "@/lib/dex";
import { site } from "@/lib/site";
import { SectionHead } from "@/components/vat/SectionHead";
import { TokenCard } from "./TokenCard";

type Kind = "trending" | "new";

export function TokenGrid() {
  const [kind, setKind] = useState<Kind>("trending");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [state, setState] = useState<"loading" | "live" | "error">("loading");
  const [updated, setUpdated] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async (k: Kind) => {
    try {
      const res = await fetch(`/api/tokens?kind=${k}`, { cache: "no-store" });
      const json = (await res.json()) as { tokens: Token[]; at: number; error?: string };
      if (!res.ok || json.error) throw new Error(json.error);
      setTokens(json.tokens);
      setUpdated(json.at);
      setState("live");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    setState("loading");
    load(kind);
    const id = setInterval(() => load(kind), site.refreshMs);
    return () => clearInterval(id);
  }, [kind, load]);

  const shown = tokens.filter((t) => !query || `${t.name} ${t.symbol} ${t.address}`.toLowerCase().includes(query.toLowerCase()));
  const movers = [...tokens].filter((t) => t.change24h !== null).sort((a, b) => Math.abs(b.change24h!) - Math.abs(a.change24h!)).slice(0, 12);

  return (
    <section id="swamp" className="scroll-mt-20 overflow-x-clip px-4 pt-24 pb-28">
      <div className="mx-auto max-w-7xl">
        <SectionHead tag="02 · The rest of the swamp" title="What’s bubbling on Solana right now." sub="Not ours: the live trending and newest Solana coins from DexScreener, so you can see what the vat is competing with. Refreshed every 20 seconds." />
      </div>
      {movers.length > 0 && (
        <div className="mb-10 -rotate-1 border-y-2 border-brand/40 bg-brand/8 py-3">
          <Marquee duration={40} gap="2.5rem">
            {movers.map((t) => (
              <a key={t.address} href={t.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-mono text-sm whitespace-nowrap">
                <span className="font-display text-base text-fg">${t.symbol}</span>
                <span className="text-muted">{fmtUsd(t.marketCap)}</span>
                <span className={t.change24h! >= 0 ? "text-brand" : "text-accent"}>
                  {t.change24h! >= 0 ? "▲" : "▼"} {Math.abs(t.change24h!).toFixed(1)}%
                </span>
              </a>
            ))}
          </Marquee>
        </div>
      )}

      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative inline-flex rounded-full vat-panel p-1">
            {(["trending", "new"] as Kind[]).map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)} className={cn("relative z-10 rounded-full px-5 py-2 font-display text-base capitalize transition-colors", kind === k ? "text-ink" : "text-muted hover:text-fg")}>
                {kind === k && <motion.span layoutId="tab" className="absolute inset-0 -z-10 rounded-full bg-brand" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                {k}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, ticker, CA"
              aria-label="Search tokens"
              className="w-full rounded-full border border-line bg-surface/60 px-4 py-2 text-sm outline-none placeholder:text-muted focus:border-brand/50 sm:w-64"
            />
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
              <span className={cn("size-2 rounded-full", state === "live" ? "animate-pulse bg-brand" : state === "error" ? "bg-accent" : "bg-muted")} />
              {state === "live" && updated ? "live" : state === "error" ? "data unavailable" : "loading"}
              <RefreshCw className={cn("size-3", state === "loading" && "animate-spin")} />
            </span>
          </div>
        </div>

        {state === "loading" && tokens.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-[2rem] border border-line bg-surface/50" />
            ))}
          </div>
        ) : state === "error" && tokens.length === 0 ? (
          <p className="rounded-[2rem] border border-line p-10 text-center text-muted">Market data is unavailable right now. Retrying automatically.</p>
        ) : (
          <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {shown.map((t) => (
                <TokenCard key={t.address} t={t} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
        <p className="mt-6 text-center text-xs text-muted">Data: DexScreener. Not an endorsement, and not launched by SLUDGE. Do your own research.</p>
      </div>
    </section>
  );
}
