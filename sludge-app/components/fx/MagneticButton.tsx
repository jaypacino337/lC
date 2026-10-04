"use client";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Button/link that leans toward the cursor. Renders an <a> when href is set. */
export function MagneticButton({
  children,
  href,
  onClick,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 250, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 250, damping: 18 });
  const styles = cn(
    "relative inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-[background,box-shadow,color] duration-300",
    variant === "primary"
      ? "bg-brand text-black shadow-[0_0_0_0_var(--color-brand)] hover:shadow-[0_0_40px_-6px_var(--color-brand)]"
      : "border border-line bg-white/5 text-fg hover:bg-white/10",
    className
  );
  const external = href?.startsWith("http");
  return (
    <motion.div
      ref={ref}
      style={{ x, y }}
      className="inline-block"
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * 0.25);
        y.set((e.clientY - (r.top + r.height / 2)) * 0.35);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.96 }}
    >
      {href ? (
        <a href={href} className={styles} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
          {children}
        </a>
      ) : (
        <button type="button" onClick={onClick} className={styles}>
          {children}
        </button>
      )}
    </motion.div>
  );
}
