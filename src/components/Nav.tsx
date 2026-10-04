"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";
import { X_URL } from "@/lib/public";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/dashboard", label: "My influencers" },
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/80 backdrop-blur-xl">
      <div className="section flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="GlowPad home" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 text-sm lg:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`rounded-full px-3 py-1.5 transition hover:bg-white/5 ${path === l.href ? "text-cream" : "text-mute"}`}>
              {l.label}
            </Link>
          ))}
          <a href={X_URL} target="_blank" rel="noreferrer" className="rounded-full px-3 py-1.5 text-mute hover:bg-white/5">Follow on X ↗</a>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/create" className="btn btn-glow">+ Create influencer</Link>
          <WalletButton />
        </div>
        <button className="btn btn-ghost px-3 py-2 lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div className="section flex flex-col gap-1 border-t border-line/60 pb-4 pt-2 lg:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-xl px-3 py-2.5 text-mute hover:bg-white/5 hover:text-cream" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <a href={X_URL} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-2.5 text-mute hover:bg-white/5">Follow on X ↗</a>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link href="/create" className="btn btn-glow" onClick={() => setOpen(false)}>+ Create influencer</Link>
            <WalletButton className="w-full" />
          </div>
        </div>
      )}
    </header>
  );
}
