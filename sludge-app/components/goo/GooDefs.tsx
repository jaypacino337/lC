/**
 * SVG filter defs for the goo look, rendered once in the root layout.
 * `goo`: blur, then crush the alpha channel so overlapping blurry shapes
 * snap back to hard edges, which makes touching shapes merge like metaballs.
 */
export function GooDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute size-0">
      <defs>
        <filter id="goo" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g" />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
        {/* title goo: blur measured relative to the element's box, so it scales with the font */}
        <filter id="goo-title" primitiveUnits="objectBoundingBox" x="-5%" y="-5%" width="110%" height="115%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.0065 0.012" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g" />
          <feComposite in="SourceGraphic" in2="g" operator="atop" />
        </filter>
        <filter id="goo-soft" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
          <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
        </filter>
      </defs>
    </svg>
  );
}
