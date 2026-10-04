"use client";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { site } from "@/lib/site";
import { SectionHead } from "./SectionHead";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="px-4 pt-10 pb-28">
      <div className="mx-auto max-w-3xl">
        <SectionHead tag="05 · Before you stir" title="Questions from the rim of the vat." />
        <div className="space-y-3">
          {site.faq.map((f, i) => (
            <div key={f.q} className="overflow-hidden rounded-[1.75rem] vat-panel">
              <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left">
                <span className="font-display text-xl">{f.q}</span>
                <motion.span animate={{ rotate: open === i ? 45 : 0 }} className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-ink">
                  <Plus className="size-5" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                    <p className="px-6 pb-6 text-pretty text-muted">{f.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
