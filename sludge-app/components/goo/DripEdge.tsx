import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * A wavy slime edge that hangs off the bottom of a section, with drops that
 * swell, stretch and fall. Goo-filtered so each drop necks off the edge.
 * `fill` should match the section the edge belongs to.
 */
const DROPS = [
  { x: 9, w: 16, fall: 70, dur: 4.8, delay: -1.2 },
  { x: 23, w: 22, fall: 90, dur: 6.2, delay: -3.4 },
  { x: 41, w: 14, fall: 60, dur: 5.1, delay: -0.4 },
  { x: 57, w: 26, fall: 110, dur: 7.4, delay: -5.1 },
  { x: 72, w: 15, fall: 70, dur: 4.4, delay: -2.2 },
  { x: 88, w: 20, fall: 85, dur: 5.8, delay: -4.0 },
];

export function DripEdge({ fill = "var(--color-bg)", className, flip = false }: { fill?: string; className?: string; flip?: boolean }) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none relative z-10 h-0", className)} style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <div className="goo absolute inset-x-0 top-0 h-48 overflow-hidden">
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-12 w-full">
          <path
            fill={fill}
            d="M0,0 L1440,0 L1440,22 C1400,24 1380,50 1352,47 C1330,45 1330,24 1300,25 C1240,28 1250,58 1214,57 C1180,56 1190,26 1150,25 L1020,24 C990,25 995,42 968,44 C935,47 940,24 900,24 L780,22 C750,24 760,58 722,57 C688,56 700,25 660,24 L520,22 C495,24 500,37 476,40 C445,44 450,22 410,22 L300,21 C270,22 280,50 246,49 C216,48 225,22 190,22 L90,21 C60,22 70,34 40,35 C20,36 10,22 0,22 Z"
          />
        </svg>
        {DROPS.map((d, i) => (
          <span
            key={i}
            className="absolute top-6 origin-top animate-drip rounded-b-full"
            style={{ left: `${d.x}%`, width: d.w, height: d.w * 2.2, background: fill, "--fall": `${d.fall}px`, "--dur": `${d.dur}s`, "--delay": `${d.delay}s` } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
