"use client";
import { motion } from "motion/react";
import { RevealGroup, RevealItem } from "@/components/fx";
import { site } from "@/lib/site";
import { SectionHead } from "./SectionHead";

const TINT = ["bg-brand text-ink", "bg-accent text-ink", "bg-brand text-ink", "bg-accent text-ink"];

export function HowItBrews() {
  return (
    <section id="how" className="relative scroll-mt-20 px-4 py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHead tag="03 · How it brews" title="Four ingredients. One signature." sub="The brew is the launch. Nothing is simulated: the last step is a real pump.fun create transaction that only your wallet can sign." />
        <RevealGroup className="relative grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {/* goo pipe connecting the steps */}
          <div aria-hidden="true" className="goo pointer-events-none absolute inset-x-8 top-11 hidden h-10 lg:block">
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand/60" />
            {[0, 1, 2].map((i) => (
              <span key={i} className="absolute inset-0 animate-pipe" style={{ animationDelay: `${-i * 1.66}s` }}>
                <span className="absolute top-1/2 left-0 size-5 -translate-y-1/2 rounded-full bg-brand" />
              </span>
            ))}
          </div>
          {site.steps.map((s, i) => (
            <RevealItem key={s.k}>
              <motion.div whileHover={{ y: -6 }} className="relative h-full rounded-[2rem] vat-panel p-6">
                <span className={`relative z-10 grid size-14 animate-wobble place-items-center font-display text-2xl ${TINT[i]}`} style={{ animationDelay: `${-i * 1.4}s` }}>
                  {i + 1}
                </span>
                <h3 className="mt-6 font-display text-3xl text-fg">{s.k}</h3>
                <p className="mt-3 text-pretty text-muted">{s.body}</p>
              </motion.div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
