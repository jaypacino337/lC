import type { SVGProps } from "react";

type P = "x" | "tiktok" | "instagram";
const COLORS: Record<P, string> = { x: "var(--color-x)", tiktok: "var(--color-tiktok)", instagram: "var(--color-insta)" };
export const PLATFORM_NAME: Record<P, string> = { x: "X", tiktok: "TikTok", instagram: "Instagram" };

/** Simple generic glyphs (not the platforms' official marks) used as labels. */
export function PlatformIcon({ platform, size = 16, ...rest }: { platform: P; size?: number } & SVGProps<SVGSVGElement>) {
  const c = COLORS[platform];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={PLATFORM_NAME[platform]} role="img" {...rest}>
      {platform === "x" && <path d="M5 4l14 16M19 4L5 20" />}
      {platform === "tiktok" && (
        <>
          <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 3c.5 2.6 2.4 4.4 5 4.6" />
        </>
      )}
      {platform === "instagram" && (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r=".6" fill={c} />
        </>
      )}
    </svg>
  );
}

export function PlatformBadge({ platform, locked, label }: { platform: P; locked?: boolean; label?: string }) {
  return (
    <span className={`chip ${locked ? "opacity-45" : ""}`} title={locked ? `${PLATFORM_NAME[platform]} unlocks at graduation` : PLATFORM_NAME[platform]}>
      <PlatformIcon platform={platform} size={13} />
      {label ?? PLATFORM_NAME[platform]}
      {locked && <span aria-hidden>🔒</span>}
    </span>
  );
}
