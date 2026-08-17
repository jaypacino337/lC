/* Small shared helpers. Pure and individually testable. */

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const nowMs = () => Date.now();

/** USD for display. */
export function usd(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(2)}K`;
  return `${sign}$${a.toFixed(2)}`;
}

export function pct(n, dp = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(dp)}%`;
}

/**
 * Exponential time decay. Returns a weight in (0,1]: 1 for something that just
 * happened, 0.5 at exactly one half-life ago.
 */
export function decay(ageMs, halfLifeMs) {
  if (!(halfLifeMs > 0)) return 1;
  return Math.pow(0.5, Math.max(0, ageMs) / halfLifeMs);
}

/**
 * Wilson score lower bound for a binomial proportion.
 *
 * This is what stops a caller who went 1-for-1 outranking one who went 40-for-50.
 * Small samples get pulled toward zero until they earn their rating; z=1.96 is
 * the 95% one-sided bound.
 */
export function wilsonLowerBound(successes, total, z = 1.96) {
  if (total <= 0) return 0;
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denom);
}

/** Retry with exponential backoff and jitter. `shouldRetry` gates on error type. */
export async function retry(fn, {
  attempts = 4, baseMs = 300, maxMs = 8000, shouldRetry = () => true, onRetry
} = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !shouldRetry(err)) break;
      const backoff = Math.min(maxMs, baseMs * 2 ** i);
      const wait = backoff / 2 + Math.random() * (backoff / 2);   // jitter
      onRetry?.(err, i + 1, wait);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/** fetch with a hard timeout, so a hung request can't stall the loop. */
export async function fetchJson(url, { timeoutMs = 8000, ...init } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Stable id for deduping observations that lack one. */
export function hashId(...parts) {
  const s = parts.join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
