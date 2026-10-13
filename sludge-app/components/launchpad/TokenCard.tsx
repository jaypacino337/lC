"use client";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtAge, fmtUsd, type Token } from "@/lib/dex";

/** One token tile. Flashes green/red when its market cap moves between refreshes. */
export function TokenCard({ t }: { t: Token }) {
  const prev = useRef(t.marketCap);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => {
    if (prev.current !== null && t.marketCap !== null && t.marketCap !== prev.current) {
      setFlash(t.marketCap > prev.current ? "up" : "down");
      const id = setTimeout(() => setFlash(null), 900);
      prev.current = t.marketCap;
      return () => clearTimeout(id);
    }
    prev.current = t.marketCap;
  }, [t.marketCap]);

  const ch = t.change24h;
  const buyPct = t.buys24h !== null && t.sells24h !== null && t.buys24h + t.sells24h > 0 ? (t.buys24h / (t.buys24h + t.sells24h)) * 100 : null;

  return (
    <motion.a
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      href={t.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative block overflow-hidden rounded-[1.75rem] vat-panel p-4 transition-[border-color,box-shadow] duration-300 hover:border-brand/40 hover:shadow-[0_0_40px_-12px_var(--color-brand)]",
        flash === "up" && "ring-1 ring-brand/70",
        flash === "down" && "ring-1 ring-accent/70"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-[42%] bg-white/5 transition-[border-radius] duration-500 group-hover:rounded-[30%_70%_60%_40%/50%_40%_60%_50%]">
          {t.image && imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.image} alt={`${t.symbol} logo`} loading="lazy" onError={() => setImgOk(false)} className="size-full object-cover transition-transform duration-500 group-hover:scale-110" />
          ) : (
            <div className="grid size-full place-items-center font-display text-lg text-muted">{t.symbol.slice(0, 2)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg leading-tight">{t.name}</h3>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase", t.stage === "curve" ? "bg-brand/15 text-brand" : "bg-accent/15 text-accent")}>
              {t.stage === "curve" ? "on curve" : t.dexId}
            </span>
          </div>
          <p className="font-mono text-xs text-muted">${t.symbol} · {fmtAge(t.createdAt)} old</p>
        </div>
        <ArrowUpRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-fg" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-[11px] text-muted">MCap</p>
          <p className="font-mono font-semibold tabular-nums">{fmtUsd(t.marketCap)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">Vol 24h</p>
          <p className="font-mono tabular-nums">{fmtUsd(t.volume24h)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted">24h</p>
          <p className={cn("font-mono tabular-nums", ch === null ? "text-muted" : ch >= 0 ? "text-brand" : "text-accent")}>
            {ch === null ? "—" : `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%`}
          </p>
        </div>
      </div>

      {buyPct !== null && (
        <div className="mt-4">
          <div className="flex justify-between text-[10px] text-muted">
            <span>{t.buys24h} buys</span>
            <span>{t.sells24h} sells</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-accent/50">
            <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: `${buyPct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>
      )}
    </motion.a>
  );
}
