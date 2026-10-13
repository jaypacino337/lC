"use client";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";

/**
 * The giant SLUDGE wordmark. Text + hanging drips sit in one goo-filtered
 * layer, so the drips neck off the bottoms of the letters and fall. Letters
 * splash in one by one.
 */
// sizes in em, so the drips (and the goo filter) scale with the wordmark
const DRIPS = [
  { x: 7, w: 0.11, fall: 0.5, dur: 5.2, delay: -0.8 },
  { x: 26, w: 0.08, fall: 0.38, dur: 4.1, delay: -2.6 },
  { x: 44, w: 0.14, fall: 0.75, dur: 6.6, delay: -4.4 },
  { x: 61, w: 0.09, fall: 0.45, dur: 4.7, delay: -1.5 },
  { x: 80, w: 0.12, fall: 0.6, dur: 5.9, delay: -3.3 },
  { x: 93, w: 0.075, fall: 0.35, dur: 3.9, delay: -0.2 },
];

export function DripTitle({ text }: { text: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto w-fit">
      <div className="px-[0.05em] pb-[0.75em] text-[clamp(4.6rem,21vw,15rem)]" style={{ filter: "url(#goo-title)" }}>
        <div className="relative">
          <h1 className="flex font-display text-[1em] leading-[0.85] text-brand" aria-label={text}>
            {text.split("").map((ch, i) => (
              <motion.span
                key={i}
                aria-hidden="true"
                className="inline-block"
                initial={reduce ? false : { y: "-60%", scaleY: 1.4, scaleX: 0.7, opacity: 0 }}
                animate={{ y: 0, scaleY: 1, scaleX: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 14, mass: 1.1, delay: 0.15 + i * 0.07 }}
              >
                {ch}
              </motion.span>
            ))}
          </h1>
          {DRIPS.map((d, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="absolute top-[74%] origin-top animate-drip rounded-b-full bg-brand"
              style={{ left: `${d.x}%`, width: `${d.w}em`, height: `${d.w * 2.6}em`, "--fall": `${d.fall}em`, "--dur": `${d.dur}s`, "--delay": `${d.delay}s` } as CSSProperties}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
