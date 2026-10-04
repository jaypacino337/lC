import { site } from "@/lib/site";
import { Bubbles } from "@/components/goo/Bubbles";
import { Logo } from "./Logo";

export function VatFooter() {
  const links = [
    { label: "Brew", href: "/brew" },
    { label: "Batches", href: "/#batches" },
    { label: "pump.fun", href: "https://pump.fun", ext: true },
    ...(site.socials.x ? [{ label: "X", href: site.socials.x, ext: true }] : []),
    ...(site.socials.telegram ? [{ label: "Telegram", href: site.socials.telegram, ext: true }] : []),
  ];
  return (
    <footer className="relative isolate overflow-hidden border-t border-line px-4 pt-16 pb-28">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <a href="/" className="flex items-center gap-3">
            <Logo className="size-12" />
            <span className="font-display text-4xl text-brand">{site.name}</span>
          </a>
          <p className="mt-4 max-w-md text-sm text-pretty text-muted">
            ${site.ticker} is a memecoin attached to an experimental launchpad. Launching costs real SOL and most coins go to zero. Nothing here is financial advice. Biohazard suit not included.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          {links.map((l) => (
            <a key={l.label} href={l.href} {...(l.ext ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="transition hover:text-brand">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
      <p className="mx-auto mt-10 max-w-7xl font-mono text-[11px] text-muted">© {new Date().getFullYear()} the vat · data: DexScreener, Solana RPC · images: IPFS</p>
      <Bubbles rise={90} count={16} className="-z-10 opacity-60" pool="var(--color-brand)" />
    </footer>
  );
}
