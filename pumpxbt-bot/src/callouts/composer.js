/* Builds the callout text and queues it for the manual posting step.
 *
 * The bot does not post to pump.fun. It writes the callout, queues it, and pings
 * you — you paste it. That keeps the account clear of automated-posting risk,
 * which matters because the callout history IS the asset here. If an official
 * write API turns up, this is the only place that needs to change.
 */
import { nowMs, hashId, pct } from '../util.js';

/** Human-readable justification, strongest signal first. */
function rationale(verdict) {
  const s = verdict.signals;
  const parts = [];
  if (s.earlyBuy > 0.3) parts.push('proven wallets accumulating pre-call');
  if (s.copyCaller > 0.3) parts.push('confirmed by callers with a real record');
  if (s.velocity > 0.5) parts.push('buy pressure building');
  if (s.freshness > 0.6) parts.push('still early');
  return parts;
}

export function composeCallout({ token, verdict, activity }) {
  const sym = token.symbol && token.symbol !== '???' ? `$${token.symbol}` : token.mint.slice(0, 6);
  const why = rationale(verdict);
  /* The callout score, not the trade score — this is a callout. */
  const score = verdict.callout?.score ?? verdict.calloutScore ?? verdict.score;

  const lines = [`${sym} — conviction ${(score * 100).toFixed(0)}/100`];
  if (why.length) lines.push(why.join(', ') + '.');
  if (activity?.buyers5m) {
    lines.push(`${activity.buyers5m} unique buyers in the last 5m.`);
  }

  return {
    text: lines.join(' '),
    reasons: verdict.reasons,
    score
  };
}

/** Queues a callout, tying it to the probe position that unlocked it. */
export function queueCallout(store, { token, verdict, activity, positionId }) {
  const composed = composeCallout({ token, verdict, activity });
  const createdAt = nowMs();
  const id = store.queueCallout({
    id: hashId('ours', token.mint, createdAt),
    mint: token.mint,
    createdAt,
    score: composed.score,
    text: composed.text,
    reasons: composed.reasons,
    positionId
  });
  return { id, ...composed };
}

/** Message body for the phone alert — everything needed to post in one glance. */
export function alertText({ token, composed, positionId, probeUsd }) {
  const sym = token.symbol && token.symbol !== '???' ? `$${token.symbol}` : '(no symbol)';
  return [
    `CALLOUT READY — ${sym}`,
    '',
    composed.text,
    '',
    `mint: ${token.mint}`,
    token.price ? `price: ${token.price.toExponential(3)}` : '',
    token.mcap ? `mcap: $${Math.round(token.mcap).toLocaleString()}` : '',
    probeUsd ? `probe: $${probeUsd} (paper)` : '',
    positionId ? `pos: ${positionId}` : '',
    '',
    'PAPER MODE — no funds moved. Post manually if you want the reward.'
  ].filter(Boolean).join('\n');
}
