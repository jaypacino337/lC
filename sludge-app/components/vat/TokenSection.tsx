"use client";
import { RevealGroup, RevealItem, CopyButton } from "@/components/fx";
import { site } from "@/lib/site";
import { SectionHead } from "./SectionHead";

const PLANS = [
  { k: "Creator fees", body: "When the vat launches its own coins, their creator fees route back to $SLUDGE (via the memcoinz flywheel)." },
  { k: "Feed priority", body: "Holders get first access to the vat’s brewer: your prompt brews before the timeline’s does." },
  { k: "The lab", body: "Batch analytics, narrative history and vat controls, unlocked with $SLUDGE." },
];

export function TokenSection() {
  const live = site.stage === "live" && !!site.ca;
  return (
    <section id="token" className="relative scroll-mt-20 px-4 py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHead
          tag="04 · $SLUDGE"
          title="The runoff flows back."
          sub={
            live
              ? "$SLUDGE is live. Check the contract address below matches what you’re buying."
              : "$SLUDGE has not launched. There is no contract address yet, and anything claiming to be $SLUDGE before this page shows one is not us."
          }
        />
        {live && (
          <div className="mb-10 flex flex-wrap items-center gap-3 rounded-3xl vat-panel p-4 font-mono text-sm">
            <span className="text-muted">CA</span>
            <span className="min-w-0 flex-1 truncate">{site.ca}</span>
            <CopyButton value={site.ca} />
          </div>
        )}
        <RevealGroup className="grid gap-5 md:grid-cols-3">
          {PLANS.map((p) => (
            <RevealItem key={p.k}>
              <div className="h-full rounded-[2rem] vat-panel p-6">
                <span className="rounded-full bg-hazard/15 px-3 py-1 font-mono text-[10px] tracking-[0.16em] text-hazard">PLANNED</span>
                <h3 className="mt-5 font-display text-2xl">{p.k}</h3>
                <p className="mt-2 text-pretty text-muted">{p.body}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
