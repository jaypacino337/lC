"use client";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Primary CTA: a slime pill that buds little blobs on hover (goo-filtered), with
 * the label on a crisp layer above. Renders <a> with href, else <button>.
 */
export function GooButton({
  children,
  href,
  onClick,
  type = "button",
  disabled,
  variant = "acid",
  size = "md",
  className,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: "acid" | "purple" | "ghost";
  size?: "md" | "lg";
  className?: string;
}) {
  const fill = variant === "acid" ? "bg-brand" : variant === "purple" ? "bg-accent" : "bg-white/8";
  const text = variant === "ghost" ? "text-fg" : "text-ink";
  const inner = (
    <>
      {variant !== "ghost" && (
        <span aria-hidden="true" className="goo pointer-events-none absolute -inset-4">
          <span className={cn("absolute inset-4 rounded-full", fill)} />
          {[
            "left-[18%] top-1/2 group-hover:-translate-y-[150%]",
            "left-[52%] top-1/2 group-hover:translate-y-[140%]",
            "left-[78%] top-1/2 group-hover:-translate-y-[130%] group-hover:translate-x-3",
          ].map((pos, i) => (
            <span key={i} className={cn("absolute size-5 -translate-y-1/2 rounded-full transition-transform duration-500 ease-[cubic-bezier(.3,1.6,.5,1)]", fill, pos)} />
          ))}
        </span>
      )}
      <span className={cn("relative z-10 inline-flex items-center gap-2", text)}>{children}</span>
    </>
  );
  const cls = cn(
    "group relative inline-flex items-center justify-center rounded-full font-display tracking-wide transition-[filter,opacity] select-none disabled:pointer-events-none disabled:opacity-55",
    size === "lg" ? "px-8 py-4 text-lg" : "px-6 py-3 text-base",
    variant === "ghost" && "border border-line bg-white/5 backdrop-blur hover:border-brand/50 hover:bg-white/10",
    className
  );
  if (href)
    return (
      <motion.a whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} href={href} className={cls}>
        {inner}
      </motion.a>
    );
  return (
    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }} type={type} onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </motion.button>
  );
}
