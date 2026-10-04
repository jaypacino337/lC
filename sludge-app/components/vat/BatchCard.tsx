"use client";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import type { BatchView } from "@/app/api/batches/route";
import { cn } from "@/lib/cn";
import { fmtAge, fmtUsd } from "@/lib/dex";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** One coin the vat launched: a slime jar whose fill level is its bonding-curve progress. */
export function BatchCard({ b, n }: { b: BatchView; n: number }) {
  const [imgOk, setImgOk] = useState(true);
  const fill = b.graduated ? 1 : b.curve ?? 0;
  const ch = b.change24h;
  return (
    <motion.a
      layout
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      whileHover={{ y: -6, rotate: -0.6 }}
      href={b.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-[2rem] vat-panel p-5 transition-shadow hover:shadow-[0_0_50px_-14px_var(--color-brand)]"
    >
      {/* slime level = curve progress */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ height: `${Math.max(6, fill * 100)}%` }}>
        <div className="absolute inset-0 bg-gradient-to-t from-brand/25 to-brand/5" />
        <svg viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute -top-2 h-3 w-[200%] animate-marquee fill-brand/20 [--duration:6s]">
          <path d="M0 6 Q 12.5 0 25 6 T 50 6 T 75 6 T 100 6 T 125 6 T 150 6 T 175 6 T 200 6 V12 H0Z" />
        </svg>
      </div>

      <div className="relative flex items-start gap-4">
        <div className="relative size-16 shrink-0 animate-wobble overflow-hidden bg-white/5 ring-2 ring-brand/50">
          {b.image && imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.image} alt={`${b.symbol} logo`} loading="lazy" onError={() => setImgOk(false)} className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center font-display text-xl text-brand">{b.symbol.slice(0, 2)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted">BATCH #{String(n).padStart(3, "0")}</p>
          <h3 className="truncate font-display text-xl text-fg">{b.name}</h3>
          <p className="font-mono text-xs text-brand">${b.symbol}</p>
        </div>
        <ArrowUpRight className="size-5 shrink-0 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>

      <dl className="relative mt-5 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-[11px] text-muted">MCap</dt>
          <dd className="font-mono font-semibold tabular-nums">{fmtUsd(b.marketCap)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">Curve</dt>
          <dd className="font-mono tabular-nums">{b.graduated ? "graduated" : b.curve === null ? "—" : `${(b.curve * 100).toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted">24h</dt>
          <dd className={cn("font-mono tabular-nums", ch === null ? "text-muted" : ch >= 0 ? "text-brand" : "text-accent")}>{ch === null ? "—" : `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%`}</dd>
        </div>
      </dl>
      <p className="relative mt-4 font-mono text-[11px] text-muted">
        poured {fmtAge(b.at)} ago · by {short(b.creator)}
      </p>
    </motion.a>
  );
}
