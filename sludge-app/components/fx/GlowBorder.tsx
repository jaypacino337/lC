import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A rotating conic-gradient border. Great for the main CTA card or the CA box. */
export function GlowBorder({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl p-px", className)}>
      <div aria-hidden className="absolute inset-[-100%] animate-spin-slow bg-[conic-gradient(from_0deg,transparent_0_60%,var(--color-brand)_75%,var(--color-accent)_85%,transparent_100%)]" />
      <div className="relative rounded-[calc(1rem-1px)] bg-surface">{children}</div>
    </div>
  );
}
