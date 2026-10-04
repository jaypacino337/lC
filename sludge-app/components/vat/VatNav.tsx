"use client";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { FlaskConical, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";
import { GooButton } from "@/components/goo/GooButton";
import { Logo } from "./Logo";

export function VatNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  return (
    <motion.header
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn("sticky top-0 z-50 transition-[background,border-color,backdrop-filter] duration-300", scrolled || open ? "border-b border-line bg-bg/75 backdrop-blur-xl" : "border-b border-transparent")}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3" aria-label="Main">
        <a href="/" className="group flex items-center gap-2.5">
          <Logo className="size-9 transition-transform duration-500 group-hover:-rotate-12 group-hover:scale-110" />
          <span className="font-display text-2xl leading-none text-brand">{site.name}</span>
        </a>
        <div className="hidden items-center gap-1 text-sm md:flex">
          {site.nav.map((n) => (
            <a key={n.href} href={n.href} className="rounded-full px-4 py-2 text-muted transition hover:bg-white/5 hover:text-fg">
              {n.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <GooButton href="/brew" className="hidden sm:inline-flex">
            <FlaskConical className="size-4" /> Brew a coin
          </GooButton>
          <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-11 place-items-center rounded-full border border-line md:hidden">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden md:hidden">
            <div className="flex flex-col gap-1 px-4 pb-5">
              {site.nav.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-2xl px-4 py-3 font-display text-xl text-fg hover:bg-white/5">
                  {n.label}
                </a>
              ))}
              <GooButton href="/brew" className="mt-2">
                <FlaskConical className="size-4" /> Brew a coin
              </GooButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
