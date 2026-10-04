/**
 * The brewer, ported from the static sludge/ site: a deterministic coin
 * generator plus procedural blob art. Same prompt + nonce → same coin, same
 * creature. It's a seeded generator, not a language model, and it makes no
 * network calls. Its output is only a suggestion for the create form's
 * ingredients; nothing launches until the user signs in Phantom.
 */

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, arr: readonly T[]) => arr[Math.floor(r() * arr.length)];

const GOO = ["SLOP", "GRIME", "OOZE", "MUCK", "DRIP", "GUNK", "SCUM", "BOG", "CRUD", "SILT", "GLOP", "MIRE", "SPEW", "GLORP", "SMEAR", "FUNK"] as const;
const TAIL = ["LORD", "BOY", "WIF", "INU", "CORE", "MAXX", "ROT", "JUICE", "FACE", "ZILLA", "GREMLIN", "ENJOYER", "GOBLIN", "UNIT", "FIEND"] as const;
const VIBE = ["terminal", "feral", "load-bearing", "unregulated", "nutrient-rich", "weaponized", "artisanal", "biohazardous", "free-range", "industrial"] as const;
const PLACE = ["the trenches", "the group chat", "a drainage ditch", "the timeline", "the vat", "a portable toilet at a hackathon", "the mempool", "an abandoned Denny’s", "the discord", "a wet cardboard box"] as const;
const CASE = [
  "{N} is what leaks out when {P} floods.",
  "{N} was found alive in {P}. It refuses to leave.",
  "Every cycle produces one {V} coin. {N} is this one.",
  "{N} is {V} sludge from {P}. That is the whole thesis.",
  "You don’t buy {N}. {N} accumulates on you.",
  "Scientists pulled {N} out of {P} and it started trading.",
] as const;

function tickerFrom(r: () => number, name: string): string {
  const letters = name.replace(/[^A-Z]/g, "");
  const len = 4 + Math.floor(r() * 3);
  if (letters.length <= len) return letters || "SLDG";
  // keep the first letter + consonants: tickers hate vowels
  let out = letters[0];
  for (let i = 1; i < letters.length && out.length < len; i++) {
    if (!/[AEIOU]/.test(letters[i]) || r() < 0.25) out += letters[i];
  }
  return out;
}

export interface Brew {
  name: string;
  ticker: string;
  thesis: string;
  seed: number;
}

/** Brew a coin. `prompt` may be empty (the vat decides). `nonce` re-rolls. */
export function brew(prompt: string, nonce = 0): Brew {
  const clean = prompt.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 60);
  const seed = hash(`${clean}::${nonce | 0}`);
  const r = rng(seed);
  let name: string;
  if (clean) {
    // fold the user's strongest word into the name
    const words = clean.replace(/[^A-Z ]/g, "").split(" ").filter(Boolean);
    const word = words.sort((a, b) => b.length - a.length)[0] || pick(r, GOO);
    name = r() < 0.5 ? pick(r, GOO) + word : word + pick(r, TAIL);
  } else {
    name = pick(r, GOO) + (r() < 0.35 ? pick(r, GOO) : "") + pick(r, TAIL);
  }
  name = name.slice(0, 14);
  const thesis = pick(r, CASE).replaceAll("{N}", `$${name}`).replace("{P}", pick(r, PLACE)).replace("{V}", pick(r, VIBE));
  return { name, ticker: tickerFrom(r, name), thesis, seed };
}

/**
 * A wobbling goo creature with drips and a face, drawn from the coin's seed.
 * Canvas, ~2ms, no assets. `w`/`h` are the logical drawing size; the canvas's
 * real pixel size can be larger. `bg` paints the dark vat behind it (for the PNG).
 */
export function drawBlob(canvas: HTMLCanvasElement, seed: number, opts: { w?: number; h?: number; bg?: boolean } = {}) {
  const r = rng(seed ^ 0x9e3779b9);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = opts.w ?? 260, H = opts.h ?? 280;
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  const cx = W / 2, cy = H * 0.4, R = Math.min(W, H) * 0.28;
  const INK = "#060805";
  ctx.clearRect(0, 0, W, H);
  if (opts.bg) {
    const bg = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, W * 0.8);
    bg.addColorStop(0, "#2a1640");
    bg.addColorStop(1, INK);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // body: radius perturbed around the circle
  const N = 14, wob = 0.1 + r() * 0.14;
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, rad = R * (1 + (r() - 0.5) * 2 * wob);
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 1.05]);
  }
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[N - 1][0]) / 2, (pts[0][1] + pts[N - 1][1]) / 2);
  for (let i = 0; i < N; i++) {
    const p = pts[i], q = pts[(i + 1) % N];
    ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.2, cx, cy, R * 1.5);
  grad.addColorStop(0, "#e4ff6b");
  grad.addColorStop(0.55, "#b8ff1f");
  grad.addColorStop(1, "#4f8a00");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // shine
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.42, cy - R * 0.5, R * 0.16, R * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fill();

  // drips (purple runoff)
  const drips = 2 + Math.floor(r() * 3);
  for (let i = 0; i < drips; i++) {
    const dx = cx + (r() - 0.5) * R * 1.5;
    const top = cy + R * 0.8, len = R * (0.3 + r() * 0.6), w = 7 + r() * 12;
    ctx.beginPath();
    ctx.moveTo(dx - w / 2, top);
    ctx.quadraticCurveTo(dx - w / 2, top + len * 0.7, dx, top + len);
    ctx.quadraticCurveTo(dx + w / 2, top + len * 0.7, dx + w / 2, top);
    ctx.closePath();
    ctx.fillStyle = "#9cdc00";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(dx, top + len + 9 + r() * 14, 4 + r() * 4, 0, Math.PI * 2);
    ctx.fillStyle = "#b45cff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // face
  const eyeY = cy - R * 0.12, gap = R * (0.38 + r() * 0.14), er = R * (0.16 + r() * 0.07);
  const deadEye = r() < 0.22; // one X eye sometimes
  [-1, 1].forEach((side, idx) => {
    const ex = cx + side * gap;
    if (deadEye && idx === 0) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ex - er * 0.7, eyeY - er * 0.7);
      ctx.lineTo(ex + er * 0.7, eyeY + er * 0.7);
      ctx.moveTo(ex + er * 0.7, eyeY - er * 0.7);
      ctx.lineTo(ex - er * 0.7, eyeY + er * 0.7);
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, er, er * 1.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#f6ffe6";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex + (r() - 0.5) * er * 0.7, eyeY + (r() - 0.5) * er * 0.6, er * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  });

  // mouth: wavy, judgmental
  const my = cy + R * (0.32 + r() * 0.1), mw = R * (0.5 + r() * 0.3);
  ctx.beginPath();
  ctx.moveTo(cx - mw / 2, my);
  ctx.quadraticCurveTo(cx - mw / 6, my + (r() - 0.3) * 16, cx, my);
  ctx.quadraticCurveTo(cx + mw / 6, my + (r() - 0.3) * 16, cx + mw / 2, my);
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Square 1000×1000 PNG of the creature, ready to be the coin image. */
export function blobPNG(seed: number): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = c.height = 1000;
  drawBlob(c, seed, { w: 280, h: 280, bg: true });
  return new Promise((res) => c.toBlob(res, "image/png"));
}
