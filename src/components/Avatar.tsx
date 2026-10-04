import { avatarDataUri } from "@/lib/art/avatar";

export function Avatar({ seed, palette, src, size = 64, scene, label, className = "", alt = "" }: { seed: number; palette: string[]; src?: string | null; size?: number; scene?: string; label?: string; className?: string; alt?: string }) {
  const url = src && /^https:\/\//.test(src) ? src : avatarDataUri({ seed, palette, scene, label });
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} width={size} height={size} className={`object-cover ${className}`} loading={url.startsWith("data:") ? "eager" : "lazy"} />;
}
