"use client";
import { AnimatePresence, motion } from "motion/react";
import { FlaskConical } from "lucide-react";
import { Bubbles } from "@/components/goo/Bubbles";
import { GooButton } from "@/components/goo/GooButton";
import { useBatches } from "@/lib/useBatches";
import { BatchCard } from "./BatchCard";
import { SectionHead } from "./SectionHead";

/** Coins actually launched through SLUDGE (confirmed create txs), live-enriched. */
export function Batches() {
  const { status, batches } = useBatches();
  return (
    <section id="batches" className="relative scroll-mt-20 bg-surface px-4 pt-16 pb-24">
      <div className="mx-auto max-w-7xl">
        <SectionHead
          tag="01 · Brewed in the vat"
          title="Every coin the vat has poured."
          sub="Only coins whose create transaction went through SLUDGE and confirmed on-chain. The slime level in each jar is its pump.fun bonding curve. Market data: DexScreener."
        />

        {status === "loading" && batches.length === 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-[2rem] border border-line bg-bg/40" />
            ))}
          </div>
        ) : batches.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative isolate overflow-hidden rounded-[2.5rem] border border-dashed border-brand/30 bg-bg/60 px-6 pt-14 pb-28 text-center"
          >
            <p className="slime-type text-4xl text-brand sm:text-5xl">{status === "error" ? "The log is murky." : "The vat is empty."}</p>
            <p className="mx-auto mt-4 max-w-md text-muted">
              {status === "error" ? "Couldn’t read the batch log just now. It retries on its own." : "No batch has been poured through SLUDGE yet. The first one lands right here, live, the moment its create tx confirms."}
            </p>
            <div className="mt-8">
              <GooButton href="/brew" size="lg">
                <FlaskConical className="size-5" /> Pour the first batch
              </GooButton>
            </div>
            <Bubbles rise={140} count={14} className="-z-10" />
          </motion.div>
        ) : (
          <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {batches.map((b, i) => (
                <BatchCard key={b.mint} b={b} n={batches.length - i} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </section>
  );
}
