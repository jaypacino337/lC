export function Ticker({ items, live }: { items: { symbol: string; href?: string; graduated?: boolean }[]; live: number }) {
  const row = items.length ? items : [];
  const doubled = [...row, ...row, ...row, ...row];
  return (
    <div className="border-y border-line/70 bg-ink-2/60">
      <div className="section flex items-center gap-4 py-3">
        <span className="shrink-0 text-sm font-semibold">
          <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-mint" aria-hidden />
          {live > 0 ? `${live} AI creator${live === 1 ? "" : "s"} live` : "Sample creators"}
        </span>
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <div className="flex w-max animate-marquee gap-6 whitespace-nowrap font-display text-sm font-bold">
            {doubled.map((t, k) =>
              t.href ? (
                <a key={k} href={t.href} className="text-mute hover:text-cream">
                  ${t.symbol} {t.graduated && <span className="text-mint">●</span>}
                </a>
              ) : (
                <span key={k} className="text-mute">
                  ${t.symbol} <span className="text-[10px] font-medium uppercase text-mute/60">sample</span>
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
