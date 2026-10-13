import { cn } from "@/lib/cn";

/** Slow-moving blurred color blobs + grid. Drop behind a hero. Pure CSS. */
export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute -top-1/3 left-1/4 h-[60vmax] w-[60vmax] animate-aurora rounded-full bg-brand/20 blur-[120px]" />
      <div className="absolute -bottom-1/3 right-0 h-[50vmax] w-[50vmax] animate-aurora rounded-full bg-accent/15 blur-[120px] [animation-delay:-6s]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" />
    </div>
  );
}
