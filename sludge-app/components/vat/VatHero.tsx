"use client";
import { motion } from "motion/react";
import { ArrowDown, FlaskConical } from "lucide-react";
import { Reveal } from "@/components/fx";
import { Bubbles } from "@/components/goo/Bubbles";
import { GooButton } from "@/components/goo/GooButton";
import { SlimeField } from "@/components/goo/SlimeField";
import { fmtAge } from "@/lib/dex";
import { site } from "@/lib/site";
import { useBatches } from "@/lib/useBatches";
import { DripTitle } from "./DripTitle";

export function VatHero() {
  const { status, batches } = useBatches();
  const latest = batches[0];
  const stats = [
    { k: "Batches poured", v: status === "live" ? String(batches.length) : "—" },
    { k: "Last pour", v: latest ? `${fmtAge(latest.at)} ago` : status === "live" ? "none yet" : "—" },
    { k: "Keys on our server", v: "0" },
  ];

  return (
    <section className="relative isolate overflow-hidden px-4 pt-14 pb-40 sm:pt-20">
      <SlimeField />
      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <Reveal>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg/50 px-4 py-1.5 font-mono text-[10px] tracking-[0.12em] sm:text-[11px] sm:tracking-[0.18em] text-muted uppercase backdrop-blur">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/70" />
              <span className="relative size-2 rounded-full bg-brand" />
            </span>
            A vat · a launchpad · no supervision
          </span>
        </Reveal>

        <div className="mt-4">
          <DripTitle text={site.name} />
        </div>

        <motion.p
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="slime-type -mt-[clamp(3.4rem,15vw,11rem)] text-[clamp(2rem,6vw,4rem)] text-balance text-fg"
        >
          {site.tagline}
        </motion.p>
        <Reveal delay={0.9}>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted">
            Throw in a name, a ticker, an image and a dev buy. The vat pours a real pump.fun coin, signed by <em className="text-fg not-italic">your</em> Phantom wallet, and every batch it brews bubbles up on this page.
          </p>
        </Reveal>
        <Reveal delay={1.05} className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <GooButton href="/brew" size="lg">
            <FlaskConical className="size-5" /> Brew a coin
          </GooButton>
          <GooButton href="#batches" size="lg" variant="ghost">
            See the batches <ArrowDown className="size-4" />
          </GooButton>
        </Reveal>

        <Reveal delay={1.2}>
          <dl className="mx-auto mt-14 grid max-w-2xl grid-cols-3 divide-x divide-line overflow-hidden rounded-3xl vat-panel">
            {stats.map((s) => (
              <div key={s.k} className="px-3 py-4 sm:px-6">
                <dt className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase sm:text-[11px]">{s.k}</dt>
                <dd className="mt-1 font-display text-xl text-brand tabular-nums sm:text-3xl">{s.v}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
      <Bubbles rise={260} count={22} pool="var(--color-surface)" />
    </section>
  );
}
