import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * A pool of slime along the bottom edge with bubbles rising out of it. The whole
 * layer runs through the goo filter, so bubbles bud off the surface and merge
 * when they touch. Positions are seeded (no Math.random) so SSR and the client
 * agree. Pure CSS; reduced motion freezes it.
 */
const seeded = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function Bubbles({ count = 18, rise = 340, className, color = "var(--color-brand)", pool = color }: { count?: number; rise?: number; className?: string; color?: string; pool?: string }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden", className)} style={{ height: rise + 60 }}>
      <div className="goo absolute inset-0">
        <div className="absolute inset-x-[-5%] bottom-[-18px] h-10 rounded-[50%]" style={{ background: pool }} />
        {Array.from({ length: count }).map((_, i) => {
          const size = 10 + seeded(i) * 34;
          return (
            <span
              key={i}
              className="absolute bottom-2 animate-bubble rounded-full"
              style={
                {
                  left: `${4 + seeded(i + 40) * 92}%`,
                  width: size,
                  height: size,
                  background: i % 4 === 0 ? "var(--color-accent)" : color,
                  "--dur": `${5 + seeded(i + 7) * 7}s`,
                  "--delay": `${-seeded(i + 3) * 12}s`,
                  "--sway": `${(seeded(i + 11) - 0.5) * 60}px`,
                  "--rise": `${rise * (0.55 + seeded(i + 21) * 0.45)}px`,
                } as CSSProperties
              }
            />
          );
        })}
      </div>
    </div>
  );
}
