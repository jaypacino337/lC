import { Reveal } from "@/components/fx";

export function SectionHead({ tag, title, sub, id }: { tag: string; title: string; sub?: string; id?: string }) {
  return (
    <Reveal className="mb-12 max-w-3xl">
      <span className="inline-block rounded-full border border-brand/40 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-brand uppercase">{tag}</span>
      <h2 id={id} className="slime-type mt-5 text-[clamp(2.4rem,6vw,4.4rem)] text-balance text-fg">
        {title}
      </h2>
      {sub && <p className="mt-5 text-lg text-pretty text-muted">{sub}</p>}
    </Reveal>
  );
}
