/** The SLUDGE mark: a grinning slime with two drips. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M32 10c-11 0-18 8-19 18-.5 6 .5 11 1.5 15 .5 2 2 3.5 4 3.5h6c1.5 0 2 3.5 2 6 0 2 3 2 3 0 0-2.5.5-6 2-6h1c1.5 0 2 5 2 8 0 2 3 2 3 0 0-3 .5-8 2-8h4c2 0 3.5-1.5 4-3.5 1-4 2-9 1.5-15C48 18 43 10 32 10z" fill="var(--color-brand)" />
      <ellipse cx="25" cy="30" rx="4" ry="5" fill="var(--color-ink)" />
      <ellipse cx="39" cy="30" rx="4" ry="5" fill="var(--color-ink)" />
      <ellipse cx="26" cy="28.5" rx="1.4" ry="1.8" fill="#f6ffe6" />
      <ellipse cx="40" cy="28.5" rx="1.4" ry="1.8" fill="#f6ffe6" />
      <path d="M26 40q6 4 12 0" fill="none" stroke="var(--color-ink)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
