import Link from "next/link";
import { Avatar } from "./Avatar";
import { GraduationBar } from "./GraduationBar";
import { PlatformBadge } from "./PlatformIcon";

export interface InfluencerCardData {
  name: string;
  symbol: string;
  tagline: string;
  seed: number;
  palette: string[];
  avatarSrc?: string | null;
  graduated: boolean;
  progress: number | null;
  href?: string;
  sample?: boolean;
  connected?: string[];
}

export function InfluencerCard({ c }: { c: InfluencerCardData }) {
  const body = (
    <article className="card group flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-amber/50">
      <div className="relative aspect-square overflow-hidden">
        <Avatar seed={c.seed} palette={c.palette} src={c.avatarSrc} size={400} className="h-full w-full transition duration-500 group-hover:scale-105" alt={`${c.name} avatar`} />
        {c.sample && <span className="chip absolute right-3 top-3 border-white/20 bg-black/50 text-[10px] uppercase tracking-wide backdrop-blur">Concept</span>}
        {c.graduated && <span className="chip absolute left-3 top-3 border-mint/40 bg-black/50 text-mint backdrop-blur">🎓 Graduated</span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-display text-lg font-bold leading-tight">{c.name}</h3>
          <p className="text-sm text-amber">${c.symbol}</p>
        </div>
        <p className="line-clamp-2 text-sm text-mute">{c.tagline}</p>
        <div className="flex flex-wrap gap-1.5">
          <PlatformBadge platform="x" />
          <PlatformBadge platform="tiktok" locked={!c.graduated} />
          <PlatformBadge platform="instagram" locked={!c.graduated} />
        </div>
        <div className="mt-auto">
          <GraduationBar progress={c.progress} graduated={c.graduated} />
        </div>
      </div>
    </article>
  );
  return c.href ? <Link href={c.href} className="block h-full">{body}</Link> : body;
}
