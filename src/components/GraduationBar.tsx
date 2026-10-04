export function GraduationBar({ progress, graduated, compact = false }: { progress: number | null; graduated: boolean; compact?: boolean }) {
  const pct = graduated ? 100 : Math.max(0, Math.min(100, progress ?? 0));
  return (
    <div className="w-full">
      {!compact && (
        <div className="mb-1 flex items-center justify-between text-xs text-mute">
          <span>{graduated ? "Graduated · TikTok + Instagram live" : "Bonding curve"}</span>
          <span className="font-semibold text-cream">{graduated ? "100%" : progress === null ? "-" : `${pct.toFixed(0)}%`}</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Graduation progress">
        <div className={`h-full rounded-full ${graduated ? "bg-mint" : "bg-gradient-to-r from-glow to-amber"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
