/**
 * GlowPad's own generative character art (pure SVG, no external assets).
 * Same seed + palette => same face, which is how placeholder mode keeps a "consistent identity".
 */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) % 10000) / 10000;
  };
}

export interface AvatarOpts {
  seed: number;
  palette: string[];
  size?: number;
  scene?: string;
  label?: string;
}

const SCENE_BG: Record<string, string> = {
  "street walk": "M0 300 L60 220 L60 300 Z M70 300 L70 190 L120 190 L120 300 Z M260 300 L260 200 L320 200 L320 300 Z",
  gym: "M40 250 h60 v12 h-60z M30 238 h12 v36 h-12z M98 238 h12 v36 h-12z",
  stage: "M0 300 L0 250 L320 250 L320 300 Z M40 0 L90 250 M280 0 L230 250",
  airport: "M20 60 h280 v40 h-280z",
  "road trip": "M0 300 L140 210 L180 210 L320 300 Z",
  dance: "M60 40 a20 20 0 1 0 0.1 0 M260 70 a14 14 0 1 0 0.1 0",
};

export function avatarSvg({ seed, palette, size = 320, scene, label }: AvatarOpts): string {
  const r = rng(seed);
  const [c1, c2, c3] = [palette[0] ?? "#ff5c39", palette[1] ?? "#ffd166", palette[2] ?? "#1b1430"];
  const headShape = Math.floor(r() * 3);
  const ears = Math.floor(r() * 4);
  const eyes = Math.floor(r() * 3);
  const acc = Math.floor(r() * 4);
  const tilt = Math.round((r() - 0.5) * 10);
  const skin = ["#f7d6bf", "#c98b5e", "#8ad0a5", "#b9a4ff", "#ffd27a", "#7fc8ff"][Math.floor(r() * 6)];
  const head =
    headShape === 0
      ? `<circle cx="160" cy="170" r="78" fill="${skin}"/>`
      : headShape === 1
        ? `<rect x="86" y="96" width="148" height="150" rx="52" fill="${skin}"/>`
        : `<path d="M160 88 C230 88 244 160 236 200 C226 250 94 250 84 200 C76 160 90 88 160 88Z" fill="${skin}"/>`;
  const earSvg =
    ears === 0
      ? `<path d="M100 120 L92 62 L138 100Z M220 120 L228 62 L182 100Z" fill="${skin}"/>`
      : ears === 1
        ? `<circle cx="92" cy="112" r="24" fill="${skin}"/><circle cx="228" cy="112" r="24" fill="${skin}"/>`
        : ears === 2
          ? `<line x1="160" y1="96" x2="160" y2="56" stroke="${c3}" stroke-width="5"/><circle cx="160" cy="52" r="9" fill="${c1}"/>`
          : "";
  const eyeSvg =
    eyes === 0
      ? `<circle cx="132" cy="168" r="9" fill="${c3}"/><circle cx="188" cy="168" r="9" fill="${c3}"/><circle cx="135" cy="165" r="3" fill="#fff"/><circle cx="191" cy="165" r="3" fill="#fff"/>`
      : eyes === 1
        ? `<path d="M120 170 q12 -12 24 0 M176 170 q12 -12 24 0" stroke="${c3}" stroke-width="6" fill="none" stroke-linecap="round"/>`
        : `<rect x="110" y="152" width="100" height="30" rx="15" fill="${c3}"/><rect x="120" y="158" width="36" height="8" rx="4" fill="${c2}" opacity=".8"/>`;
  const mouth = `<path d="M142 206 q18 ${10 + Math.round(r() * 8)} 36 0" stroke="${c3}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  const accSvg =
    acc === 0
      ? `<path d="M96 108 q64 -60 128 0 l10 10 h-148z" fill="${c1}"/><rect x="88" y="112" width="150" height="12" rx="6" fill="${c3}"/>`
      : acc === 1
        ? `<circle cx="132" cy="168" r="20" fill="none" stroke="${c3}" stroke-width="5"/><circle cx="188" cy="168" r="20" fill="none" stroke="${c3}" stroke-width="5"/><line x1="152" y1="168" x2="168" y2="168" stroke="${c3}" stroke-width="5"/>`
        : acc === 2
          ? `<circle cx="226" cy="196" r="7" fill="${c2}" stroke="${c3}" stroke-width="3"/>`
          : "";
  const sceneSvg = scene && SCENE_BG[scene] ? `<path d="${SCENE_BG[scene]}" fill="${c3}" opacity=".35" stroke="${c3}" stroke-opacity=".35" stroke-width="4"/>` : "";
  const labelSvg = label
    ? `<rect x="12" y="270" width="${Math.min(296, 16 + label.length * 9)}" height="34" rx="17" fill="${c3}" opacity=".85"/><text x="28" y="292" font-family="system-ui, sans-serif" font-size="15" font-weight="700" fill="#fff">${escapeXml(label)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="${size}" height="${size}" role="img"><defs><linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient><radialGradient id="l${seed}" cx=".5" cy=".5" r=".5"><stop offset=".72" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#fff" stop-opacity=".9"/><stop offset=".9" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="320" height="320" fill="url(#g${seed})"/>${sceneSvg}<circle cx="160" cy="168" r="128" fill="url(#l${seed})" opacity=".55"/><g transform="rotate(${tilt} 160 170)">${earSvg}${head}${eyeSvg}${mouth}${accSvg}</g><path d="M90 320 q70 -70 140 0z" fill="${c3}"/>${labelSvg}</svg>`;
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

export function avatarDataUri(opts: AvatarOpts): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(avatarSvg(opts))}`;
}
