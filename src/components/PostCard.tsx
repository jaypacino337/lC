import Link from "next/link";
import { Avatar } from "./Avatar";
import { PlatformIcon, PLATFORM_NAME } from "./PlatformIcon";

export interface PostCardData {
  name: string;
  symbol: string;
  seed: number;
  palette: string[];
  avatarSrc?: string | null;
  platform: "x" | "tiktok" | "instagram";
  caption: string;
  mediaSrc?: string | null;
  scene?: string;
  when: string;
  href?: string;
  badge?: string;
  externalUrl?: string | null;
}

export function PostCard({ p }: { p: PostCardData }) {
  const media = p.mediaSrc && /^https:\/\//.test(p.mediaSrc) ? p.mediaSrc : null;
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative aspect-[4/5] overflow-hidden bg-ink-3">
        {media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Avatar seed={p.seed} palette={p.palette} scene={p.scene} size={400} className="h-full w-full" />
        )}
        <span className="chip absolute left-3 top-3 border-white/20 bg-black/50 backdrop-blur">
          <PlatformIcon platform={p.platform} size={13} /> {PLATFORM_NAME[p.platform]}
        </span>
        {p.badge && <span className="chip absolute right-3 top-3 border-white/20 bg-black/50 text-[10px] uppercase tracking-wide backdrop-blur">{p.badge}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-sm">
          <Avatar seed={p.seed} palette={p.palette} src={p.avatarSrc} size={28} className="h-7 w-7 rounded-full" />
          {p.href ? (
            <Link href={p.href} className="font-bold hover:underline">{p.name}</Link>
          ) : (
            <span className="font-bold">{p.name}</span>
          )}
          <span className="text-mute">${p.symbol}</span>
          <span className="ml-auto text-xs text-mute">{p.when}</span>
        </div>
        <p className="text-sm leading-relaxed text-cream/90">{p.caption}</p>
        {p.externalUrl && (
          <a href={p.externalUrl} target="_blank" rel="noreferrer" className="mt-auto text-xs font-semibold text-amber hover:underline">
            View on {PLATFORM_NAME[p.platform]} ↗
          </a>
        )}
      </div>
    </article>
  );
}
