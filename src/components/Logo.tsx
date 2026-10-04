export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="gp-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6a3d" />
          <stop offset="1" stopColor="#ffb547" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="34" r="20" fill="none" stroke="url(#gp-logo)" strokeWidth="7" className="origin-center animate-ring" />
      <circle cx="32" cy="34" r="7.5" fill="#fff6ea" />
      <path d="M50 6l2.2 5.3 5.3 2.2-5.3 2.2L50 21l-2.2-5.3-5.3-2.2 5.3-2.2z" fill="#4cf2c2" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="font-display text-xl font-extrabold tracking-tight">
        glow<span className="glow-text">pad</span>
      </span>
    </span>
  );
}
