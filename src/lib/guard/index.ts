import { DENY_NAMES, IMPERSONATION_PATTERNS } from "./denylist";

export interface GuardResult {
  ok: boolean;
  reason?: string;
  match?: string;
}

export function normalize(s: string): string {
  return ` ${s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** Deny-list + pattern check for personas that would impersonate a real person. */
export function checkImpersonation(...texts: (string | undefined | null)[]): GuardResult {
  const joined = texts.filter(Boolean).join(" \n ");
  const norm = normalize(joined);
  for (const name of DENY_NAMES) {
    if (norm.includes(` ${name} `)) {
      return { ok: false, match: name, reason: `Personas can't be based on real people ("${name}"). Invent an original character instead.` };
    }
  }
  for (const re of IMPERSONATION_PATTERNS) {
    const m = joined.match(re);
    if (m) return { ok: false, match: m[0], reason: `Personas can't imitate real, identifiable people ("${m[0]}").` };
  }
  return { ok: true };
}

/** Auto-posts must never talk price, promise returns, or shill. Matched case-insensitively. */
const FINANCIAL_PATTERNS: RegExp[] = [
  /\b\d+(\.\d+)?\s?x\b/i, // 100x, 10 x
  /\bto the moon\b|\bmoon(ing|shot)?\b/i,
  /\b(price|prices|pricing|chart|charts|candle|candles|market\s?cap|mcap|ath|all[- ]time high|floor price)\b/i,
  /\b(buy|buying|bought|sell|selling|ape|aping|hodl|hold|holding|bag|bags|dip|pump|pumping|dump|dumping|rug|rugged)\b/i,
  /\b(invest|investing|investment|returns?|profit|profits|gains?|roi|yield|apy|apr|guaranteed|financial advice|nfa|dyor|lambo|rich|millionaire|wagmi)\b/i,
  /[$€£]\s?\d/, // any currency amount
  /\b\d+(\.\d+)?\s?(k|m|b)?\s?(usd|sol|usdc|dollars?)\b/i,
];

const PROFANITY_PATTERNS: RegExp[] = [/\b(f+u+c+k+\w*|sh[i1]t\w*|c+u+n+t+\w*|n[i1]gg\w*|f[a4]gg?\w*|retard\w*|wh[o0]re\w*)\b/i];

export function checkCaption(caption: string): GuardResult {
  for (const re of FINANCIAL_PATTERNS) {
    const m = caption.match(re);
    if (m) return { ok: false, match: m[0], reason: `financial/price talk ("${m[0]}")` };
  }
  for (const re of PROFANITY_PATTERNS) {
    const m = caption.match(re);
    if (m) return { ok: false, match: m[0], reason: "profanity or slur" };
  }
  const imp = checkImpersonation(caption);
  if (!imp.ok) return { ok: false, match: imp.match, reason: "mentions a real person" };
  return { ok: true };
}

/**
 * Sentence-level sanitizer: removes offending sentences. Returns null if nothing safe is left.
 * Cashtags ($TICKER) are kept - mentioning the token is fine, talking about its price is not.
 */
export function sanitizeCaption(caption: string): string | null {
  const parts = caption.split(/(?<=[.!?\n])\s+/);
  const kept = parts.filter((p) => checkCaption(p.replace(/\$[A-Za-z][A-Za-z0-9]{0,11}\b/g, "")).ok);
  const out = kept.join(" ").trim();
  return out.length >= 3 ? out : null;
}

export const AI_TAG = {
  x: "(AI-generated character)",
  tiktok: "#AIgenerated",
  instagram: "#AIgenerated",
} as const;

/** Appends the platform's AI disclosure text unless it's already present. Truncates to platform limits. */
export function withAiDisclosure(platform: "x" | "tiktok" | "instagram", caption: string): string {
  const tag = AI_TAG[platform];
  const limit = platform === "x" ? 280 : 2200;
  const base = caption.includes(tag) ? caption.replace(tag, "").trim() : caption.trim();
  const room = limit - tag.length - 1;
  const body = base.length > room ? `${base.slice(0, room - 1).trimEnd()}…` : base;
  return `${body} ${tag}`;
}
