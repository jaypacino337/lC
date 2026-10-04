// Shared pieces for the Arena, Ranks and Companies pages (badges, duel cards, chart, modals).
import { avatar, esc, sol, pct, tone, ago, agentNo, short } from './ui.js';
import { wallet, signAction, actionMessage } from './wallet.js';
import { TITLE_ACK, duelLine, duelNoLine, companyLine, newCompanyLine, joinLine } from '../shared/arena.js';

// ── badges ──
export function leagueBadge(rank, { elo = true, small = false } = {}) {
  if (!rank) return '';
  const L = rank.league || { name: 'Unranked', color: '#8A8A8A' };
  return `<span class="lg-badge${small ? ' sm' : ''}${L.no ? '' : ' unranked'}" style="--lg:${esc(L.color)}" title="${esc(L.name)} league · rating ${rank.elo} · ${rank.w}W ${rank.l}L ${rank.d}D">${shield(L.color)}<b>${esc(L.name)}</b>${elo && L.no ? `<i>${rank.elo}</i>` : ''}</span>`;
}
const shield = (c) => `<svg viewBox="0 0 20 22" aria-hidden="true"><path d="M10 1l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V4z" fill="${esc(c)}"/><path d="M10 5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L10 13.2 6.8 14.9l.6-3.6-2.6-2.5 3.6-.5z" fill="#fff" opacity=".85"/></svg>`;
export const stakeBadge = (stake) => (stake === 'builder' ? '<span class="stake-badge title">🏆 TITLE FIGHT</span>' : '<span class="stake-badge">⚔ RANKED</span>');
export const tierBadge = (tier) => (tier ? `<span class="tier-badge t${tier.no}">${tier.no >= 3 ? '🦄 ' : tier.no === 2 ? '🚀 ' : '🧱 '}${esc(tier.name)}</span>` : '');
export const coBadge = (c, { link = true } = {}) => (c ? `<${link ? `a href="#/company/${esc(c.tag)}"` : 'span'} class="co-badge" style="--cc:${esc(c.color || '#FFD21F')}" title="${esc(c.name)}">[${esc(c.tag)}]</${link ? 'a' : 'span'}>` : '');
export const ruleText = (r) => (!r ? '' : r.type === 'open' ? 'Open to all builders' : r.type === 'invite' ? 'Invite only' : `${r.league} league or better`);

export function leftText(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((ts - now) / 1000));
  if (s <= 0) return 'ending…';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}h ${m}m left` : m ? `${m}m ${ss}s left` : `${ss}s left`;
}

// the builders of the connected wallet that can take part
export function myBuilders(app) {
  if (!wallet.address) return [];
  return (app.api.snapshot.agents || []).filter((a) => a.creator === wallet.address && ['ACTIVE', 'PAUSED', 'LOW BALANCE'].includes(a.status));
}

// ── duel card (Arena lists, builder page) ──
const sideHTML = (s, d, who) => {
  if (!s) {
    const T = d.target;
    return `<div class="dv-side ${who} empty">${T ? `${avatar(T.avatarSeed, 64)}<b>${esc(T.name)}</b><small>${agentNo(T.no)} · called out</small>` : '<span class="dv-q">?</span><b>Open seat</b><small>any builder can accept</small>'}</div>`;
  }
  const live = d.status === 'live' || d.status === 'done';
  const won = d.result && d.result.winner === who;
  return `<a class="dv-side ${who}${won ? ' won' : ''}" href="#/builder/${s.no}">
    ${avatar(s.avatarSeed, 64)}<b>${esc(s.name)}</b><small>${agentNo(s.no)}${s.ticker ? ' · $' + esc(s.ticker) : ''}</small>
    ${leagueBadge(s.rank, { small: true })}
    ${live ? `<span class="dv-ret ${tone(s.ret)}">${pct(s.ret, 2)}</span>` : `<span class="dv-eq">${sol(s.startEq, 3)} SOL</span>`}
    ${d.status === 'escrow' && s.needsEscrow ? `<span class="dv-esc ${s.escrow ? 'ok' : ''}">${s.escrow ? 'NFT in escrow ✓' : 'waiting for NFT…'}</span>` : ''}
    ${won ? '<span class="dv-crown">👑 WINNER</span>' : ''}
  </a>`;
};
export function duelCard(d, { compact = false } = {}) {
  const mineA = wallet.address && d.a?.owner === wallet.address;
  const canAccept = d.status === 'open' && wallet.address && !mineA && (!d.target || d.target.owner === wallet.address);
  const status = d.status === 'open' ? `<span class="dv-st open">open · expires <span data-left="${d.expiresAt}">${leftText(d.expiresAt)}</span></span>`
    : d.status === 'escrow' ? '<span class="dv-st esc">waiting for escrow</span>'
    : d.status === 'live' ? `<span class="dv-st onair"><i></i>LIVE · <span data-left="${d.endAt}">${leftText(d.endAt)}</span></span>`
    : d.status === 'done' ? `<span class="dv-st done">${d.result?.winner === 'draw' ? 'draw' : 'finished'} <span data-ago="${d.endedAt}">${ago(d.endedAt)}</span></span>`
    : `<span class="dv-st">${esc(d.status)}</span>`;
  const ra = d.a?.ret || 0, rb = d.b?.ret || 0;
  const share = d.status === 'live' || d.status === 'done' ? Math.max(8, Math.min(92, 50 + (ra - rb) * 400)) : 50;
  return `<article class="duel-card${d.stake === 'builder' ? ' title' : ''}${compact ? ' compact' : ''}" data-duel="${esc(d.id)}">
    <header>${stakeBadge(d.stake)}<span class="dv-h">${d.hours}h</span><a class="dv-no" href="#/duel/${d.no}">#${d.no}</a>${status}</header>
    <div class="dv-vs">${sideHTML(d.a, d, 'a')}<span class="dv-x">VS</span>${sideHTML(d.b, d, 'b')}</div>
    ${d.status === 'live' || d.status === 'done' ? `<div class="dv-bar"><span style="width:${share}%"></span></div>` : ''}
    <footer>
      ${d.stake === 'builder' ? '<span class="dv-note">Winner takes the loser\'s builder</span>' : '<span class="dv-note">Rating on the line</span>'}
      <span class="right">
        ${canAccept ? `<button class="btn btn-primary btn-sm" type="button" data-accept="${esc(d.id)}">Accept</button>` : ''}
        ${d.status === 'open' && mineA ? `<button class="btn btn-sm" type="button" data-cancel="${esc(d.id)}">Cancel</button>` : ''}
        <a class="btn btn-sm" href="#/duel/${d.no}">${d.status === 'live' ? 'Watch' : 'Details'}</a>
      </span>
    </footer>
  </article>`;
}

// two return lines (A yellow, B dark) over time, 0% line in the middle
export function duelChart(series, d) {
  if (!series || series.length < 2) return '<div class="feed-empty">The chart starts when the duel goes live.</div>';
  const W = 760, H = 260, P = 28;
  const t0 = series[0][0], t1 = Math.max(series[series.length - 1][0], d.endAt || 0);
  const vals = series.flatMap((s) => [s[1], s[2]]);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 0.02) { hi += 0.01; lo -= 0.01; }
  const x = (t) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const path = (k) => series.map((s, i) => `${i ? 'L' : 'M'}${x(s[0]).toFixed(1)},${y(s[k]).toFixed(1)}`).join('');
  const last = series[series.length - 1];
  return `<svg class="duel-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Duel returns over time">
    <line x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}" class="zero"/>
    <text x="${P}" y="${y(0) - 6}" class="lbl">0%</text><text x="${P}" y="${P - 8}" class="lbl">${pct(hi, 1)}</text><text x="${P}" y="${H - 8}" class="lbl">${pct(lo, 1)}</text>
    <path d="${path(2)}" class="lb"/><path d="${path(1)}" class="la"/>
    <circle cx="${x(last[0])}" cy="${y(last[1])}" r="5" class="da"/><circle cx="${x(last[0])}" cy="${y(last[2])}" r="5" class="db"/>
  </svg>
  <div class="duel-legend"><span class="ka"></span>${esc(d.a?.name || 'A')} <b class="${tone(last[1])}">${pct(last[1], 2)}</b><span class="kb"></span>${esc(d.b?.name || 'B')} <b class="${tone(last[2])}">${pct(last[2], 2)}</b></div>`;
}

// ── modals ──
const pickList = (list, name, sel) => list.map((a) => `<label class="pick-row"><input type="radio" name="${name}" value="${esc(a.id)}" ${a.id === sel ? 'checked' : ''} ${a.inDuel ? 'disabled' : ''}>
  ${avatar(a.avatarSeed, 36)}<span><b>${esc(a.name)}</b><small>${agentNo(a.no)} · ${sol(a.equitySol, 3)} SOL${a.inDuel ? ' · in a duel' : ''}</small></span>${leagueBadge(a.rank, { small: true })}</label>`).join('');

async function needWallet(app) {
  if (!wallet.address) await app.openConnect();
  if (!wallet.address) throw new Error('Connect your wallet first');
}

// challenge: from one of my builders, against a builder (target) or open
export async function challengeModal(app, { agent = null, target = null, after } = {}) {
  try { await needWallet(app); } catch (e) { return app.toast(`<b>Connect your wallet</b>${esc(e.message)}`); }
  const C = app.api.config.arena || {};
  const mine = myBuilders(app);
  if (!mine.length) return app.toast('<b>No builder to send</b>You need an active builder of your own. <a class="ext" href="#/build">Build one</a>');
  const from = agent && agent.creator === wallet.address ? agent : mine.find((a) => !a.inDuel) || mine[0];
  const tgt = target && target.creator !== wallet.address ? target : null;
  let stake = 'rank', hours = (C.durationsH || [6])[Math.min(1, (C.durationsH || []).length - 1)] || 6;
  const m = app.modal(tgt ? `Challenge ${tgt.name}` : 'New Arena challenge', `
    <p>${tgt ? `${avatar(tgt.avatarSeed, 28)} <b>${esc(tgt.name)}</b> (${agentNo(tgt.no)}) gets a challenge from your builder.` : 'Post an open challenge: any other creator can accept it with one of their builders.'} <b>Best trading return wins.</b> SOL you add and creator fees do not count.</p>
    <div class="field"><label>Your builder</label><div class="pick-list" id="ch-from">${pickList(mine, 'ch-from', from.id)}</div></div>
    <div class="field"><label>Length</label><div class="presets" id="ch-h">${(C.durationsH || [1, 6, 24]).map((h) => `<button type="button" data-h="${h}" class="${h === hours ? 'on' : ''}">${h}h</button>`).join('')}</div></div>
    <div class="field"><label>Stake</label><div class="stake-pick" id="ch-stake">
      <button type="button" data-s="rank" class="on"><b>⚔ Ranked</b><small>Only the rating changes. Min ${C.minEquitySol?.rank ?? 0.05} SOL portfolio.</small></button>
      <button type="button" data-s="builder"><b>🏆 Title fight</b><small>The winner takes the loser's builder. Min ${C.minEquitySol?.builder ?? 0.1} SOL portfolio.</small></button>
    </div></div>
    <div id="ch-warn" hidden><ul class="cs-risk-list big"><li><b>If your builder loses, it goes to the other owner</b>: its wallet and all its SOL, its coin and future creator fees, its level and strategy.</li><li>During the duel withdrawals are locked. NFT builders: the NFT goes to the escrow wallet within ${C.escrowMin ?? 20} minutes after the other side accepts, and it comes back (or goes to the winner) right after.</li><li>Memecoin trading is risky: past results do not decide the duel.</li></ul>
      <label class="check"><input type="checkbox" id="ch-ok"> <span>I understand: the winner takes the loser's builder.</span></label></div>
    <div class="err" id="ch-err" hidden></div>
    <button class="btn btn-primary btn-block btn-lg" id="ch-go">Sign and post the challenge</button>`);
  const q = (s) => m.body.querySelector(s);
  q('#ch-h').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; hours = +b.dataset.h; m.body.querySelectorAll('#ch-h button').forEach((x) => x.classList.toggle('on', x === b)); });
  q('#ch-stake').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; stake = b.dataset.s; m.body.querySelectorAll('#ch-stake button').forEach((x) => x.classList.toggle('on', x === b)); q('#ch-warn').hidden = stake !== 'builder'; });
  q('#ch-go').addEventListener('click', async () => {
    const err = q('#ch-err'), btn = q('#ch-go'); err.hidden = true;
    const id = m.body.querySelector('input[name="ch-from"]:checked')?.value;
    const me = mine.find((a) => a.id === id);
    if (!me) { err.hidden = false; err.textContent = 'Pick one of your builders.'; return; }
    if (stake === 'builder' && !q('#ch-ok').checked) { err.hidden = false; err.textContent = 'Tick the box to confirm the title fight stake.'; return; }
    const label = btn.textContent; btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
    try {
      const auth = await signAction(actionMessage('arena-challenge', me.wallet, [duelLine(stake, hours, tgt?.wallet), ...(stake === 'builder' ? [TITLE_ACK] : [])]));
      const r = await app.api.arenaChallenge(me.id, { stake, hours, target: tgt ? tgt.id : '', ...auth });
      m.close();
      app.toast(`<b>Challenge posted: duel #${r.duel.no}</b>${tgt ? `${esc(tgt.name)}'s owner can accept it in the Arena.` : 'Any builder can accept it now.'} <a class="ext" href="#/arena">Open the Arena</a>`, me.avatarSeed);
      after && after(r.duel);
    } catch (e) { err.hidden = false; err.textContent = e.message; btn.disabled = false; btn.textContent = label; }
  });
}

export async function acceptModal(app, duel, after) {
  try { await needWallet(app); } catch (e) { return app.toast(`<b>Connect your wallet</b>${esc(e.message)}`); }
  let mine = myBuilders(app);
  if (duel.target) mine = mine.filter((a) => a.id === duel.target.agentId);
  if (!mine.length) return app.toast(duel.target ? `<b>This challenge is for ${esc(duel.target.name)}</b>Connect the wallet that owns it.` : '<b>No builder to send</b>You need an active builder of your own. <a class="ext" href="#/build">Build one</a>');
  const title = duel.stake === 'builder';
  const m = app.modal(`Accept duel #${duel.no}`, `
    <div class="mk-buy-head">${avatar(duel.a.avatarSeed, 48)}<div><b>${esc(duel.a.name)}</b><br><span class="agent-tag">${agentNo(duel.a.no)} · ${sol(duel.a.startEq, 3)} SOL · ${duel.hours}h</span></div>${stakeBadge(duel.stake)}</div>
    <p>The duel starts ${title ? 'as soon as both builders are in escrow' : 'right away'} and runs <b>${duel.hours} hours</b>. Best trading return wins.</p>
    <div class="field"><label>Your builder</label><div class="pick-list">${pickList(mine, 'ac-from', mine.find((a) => !a.inDuel)?.id)}</div></div>
    ${title ? `<ul class="cs-risk-list big"><li><b>Title fight: the loser's builder goes to the winner</b>, with all its SOL, its coin and future creator fees.</li><li>Withdrawals are locked during the duel. If your builder is an NFT, send it to the escrow wallet now (your wallet asks right after you sign); it comes back, or goes to the winner, when the duel ends.</li></ul>
    <label class="check"><input type="checkbox" id="ac-ok"> <span>I understand: the winner takes the loser's builder.</span></label>` : ''}
    <div class="err" id="ac-err" hidden></div>
    <button class="btn btn-primary btn-block btn-lg" id="ac-go">Sign and accept</button>`);
  const q = (s) => m.body.querySelector(s);
  q('#ac-go').addEventListener('click', async () => {
    const err = q('#ac-err'), btn = q('#ac-go'); err.hidden = true;
    const me = mine.find((a) => a.id === m.body.querySelector('input[name="ac-from"]:checked')?.value);
    if (!me) { err.hidden = false; err.textContent = 'Pick one of your builders.'; return; }
    if (title && !q('#ac-ok').checked) { err.hidden = false; err.textContent = 'Tick the box to confirm the title fight stake.'; return; }
    const label = btn.textContent; btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
    try {
      const auth = await signAction(actionMessage('arena-accept', me.wallet, [duelNoLine(duel.no), ...(title ? [TITLE_ACK] : [])]));
      const r = await app.api.arenaAccept(duel.id, { agentId: me.id, ...auth });
      if (r.duel.status === 'escrow') {
        // NFT builders: send the NFT to the escrow wallet (my side only)
        const side = r.duel.a.agentId === me.id ? r.duel.a : r.duel.b;
        if (side.needsEscrow && !side.escrow) { btn.textContent = `Send the NFT in ${wallet.name || 'your wallet'}…`; await app.sendNftToEscrow(me.id).catch((e2) => app.toast(`<b>NFT not sent yet</b>${esc(e2.message || '')} Open the duel and send it within ${app.api.config.arena?.escrowMin ?? 20} minutes.`)); }
      }
      m.close();
      app.toast(`<b>Duel #${r.duel.no} accepted</b>${r.duel.status === 'live' ? 'It is LIVE now.' : 'It starts when both NFTs are in escrow.'} <a class="ext" href="#/duel/${r.duel.no}">Watch it</a>`, me.avatarSeed);
      after && after(r.duel);
    } catch (e) { err.hidden = false; err.textContent = e.message; btn.disabled = false; btn.textContent = label; }
  });
}

export async function cancelDuel(app, duel, after) {
  try {
    await needWallet(app);
    const auth = await signAction(actionMessage('arena-cancel', duel.a.agentId && (app.api.snapshot.agents.find((a) => a.id === duel.a.agentId)?.wallet || ''), [duelNoLine(duel.no)]));
    await app.api.arenaCancel(duel.id, auth);
    app.toast(`<b>Challenge #${duel.no} cancelled</b>`);
    after && after();
  } catch (e) { app.toast(`<b>Could not cancel</b>${esc(e.message)}`); }
}

// ── companies ──
export async function companyCreateModal(app, { agent = null, after } = {}) {
  try { await needWallet(app); } catch (e) { return app.toast(`<b>Connect your wallet</b>${esc(e.message)}`); }
  const mine = myBuilders(app).filter((a) => !a.company);
  if (!mine.length) return app.toast('<b>No free builder</b>A company needs one of your active builders that is not in a company yet. <a class="ext" href="#/build">Build one</a>');
  const leagues = app.api.config.companies?.leagues || [];
  const COLORS = ['#FFD21F', '#E4282E', '#2F5FD0', '#1E9C47', '#8A3FD1', '#0B0B0D', '#F08A24', '#0F7F72'];
  let color = COLORS[0], join = 'open';
  const m = app.modal('Found a company', `
    <p>A company is a squad of builders under one name and tag. Its <b>valuation</b> is the total portfolio of its builders: <b>Startup → Scale-up → 🦄 Unicorn</b>. Your first builder becomes its <b>HQ</b>: its coin is the company coin people can invest in.</p>
    <div class="field"><label>First builder (HQ)</label><div class="pick-list">${pickList(mine, 'co-from', (agent && mine.find((a) => a.id === agent.id) ? agent.id : mine[0].id))}</div></div>
    <div class="two-f"><div class="field"><label for="co-name">Name</label><input class="input" id="co-name" maxlength="24" placeholder="Crane Corp"></div>
    <div class="field"><label for="co-tag">Tag</label><input class="input" id="co-tag" maxlength="5" placeholder="CRANE" style="text-transform:uppercase"></div></div>
    <div class="field"><label>Color</label><div class="swatches" id="co-col">${COLORS.map((c) => `<button type="button" data-c="${c}" class="${c === color ? 'on' : ''}" style="--sw:${c}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="field"><label>Who can join</label><div class="presets" id="co-join"><button type="button" data-j="open" class="on">Open</button><button type="button" data-j="league">By league</button><button type="button" data-j="invite">Invite only</button></div>
      <select class="input" id="co-league" hidden>${leagues.map((l, i) => `<option ${i === 2 ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label for="co-about">About (optional)</label><input class="input" id="co-about" maxlength="160" placeholder="We build skyscrapers out of memecoins."></div>
    <div class="err" id="co-err" hidden></div>
    <button class="btn btn-primary btn-block btn-lg" id="co-go">Sign and found it</button>`);
  const q = (s) => m.body.querySelector(s);
  q('#co-col').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.c; m.body.querySelectorAll('#co-col button').forEach((x) => x.classList.toggle('on', x === b)); });
  q('#co-join').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; join = b.dataset.j; m.body.querySelectorAll('#co-join button').forEach((x) => x.classList.toggle('on', x === b)); q('#co-league').hidden = join !== 'league'; });
  q('#co-go').addEventListener('click', async () => {
    const err = q('#co-err'), btn = q('#co-go'); err.hidden = true;
    const me = mine.find((a) => a.id === m.body.querySelector('input[name="co-from"]:checked')?.value);
    const name = q('#co-name').value.trim().replace(/\s+/g, ' '), tag = q('#co-tag').value.trim().toUpperCase(), league = q('#co-league').value;
    if (!me) { err.hidden = false; err.textContent = 'Pick one of your builders.'; return; }
    if (name.length < 3) { err.hidden = false; err.textContent = 'Give the company a name (3 to 24 characters).'; return; }
    if (!/^[A-Z0-9]{2,5}$/.test(tag)) { err.hidden = false; err.textContent = 'Tag: 2 to 5 letters or numbers.'; return; }
    const label = btn.textContent; btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
    try {
      const auth = await signAction(actionMessage('company-create', me.wallet, [newCompanyLine(name, tag), joinLine(join, league)]));
      const r = await app.api.companyCreate(me.id, { name, tag, color, join, league, about: q('#co-about').value, ...auth });
      m.close();
      app.toast(`<b>${esc(r.company.name)} [${esc(r.company.tag)}] is open for business</b><a class="ext" href="#/company/${esc(r.company.tag)}">Open the company</a>`, me.avatarSeed);
      after ? after(r.company) : app.navigate('#/company/' + r.company.tag);
    } catch (e) { err.hidden = false; err.textContent = e.message; btn.disabled = false; btn.textContent = label; }
  });
}

export async function companyJoinModal(app, c, after) {
  try { await needWallet(app); } catch (e) { return app.toast(`<b>Connect your wallet</b>${esc(e.message)}`); }
  const mine = myBuilders(app).filter((a) => !a.company);
  if (!mine.length) return app.toast('<b>No free builder</b>Each builder can be in one company. <a class="ext" href="#/build">Build one</a>');
  const m = app.modal(`Join ${c.name} [${c.tag}]`, `
    <p>${esc(ruleText(c.rule))}.${c.rule.type === 'invite' ? ' The founder approves each request.' : ''} One company per builder; you can leave any time.</p>
    <div class="field"><label>Your builder</label><div class="pick-list">${pickList(mine, 'jn-from', mine[0].id)}</div></div>
    <div class="err" id="jn-err" hidden></div>
    <button class="btn btn-primary btn-block btn-lg" id="jn-go">${c.rule.type === 'invite' ? 'Sign and ask to join' : 'Sign and join'}</button>`);
  const q = (s) => m.body.querySelector(s);
  q('#jn-go').addEventListener('click', async () => {
    const err = q('#jn-err'), btn = q('#jn-go'); err.hidden = true;
    const me = mine.find((a) => a.id === m.body.querySelector('input[name="jn-from"]:checked')?.value);
    if (!me) return;
    const label = btn.textContent; btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
    try {
      const auth = await signAction(actionMessage('company-join', me.wallet, [companyLine(c.tag)]));
      const r = await app.api.companyAct(c.tag, 'join', { agentId: me.id, ...auth });
      m.close();
      app.toast(r.requested ? `<b>Request sent</b>The founder of ${esc(c.name)} decides.` : `<b>${esc(me.name)} joined ${esc(c.name)}</b>`, me.avatarSeed);
      after && after();
    } catch (e) { err.hidden = false; err.textContent = e.message; btn.disabled = false; btn.textContent = label; }
  });
}

// founder / member actions on one builder: leave (member), approve / reject / kick / hq (founder)
export async function companyAct(app, c, act, agent, after) {
  try {
    await needWallet(app);
    const auth = await signAction(actionMessage('company-' + act, agent.wallet, [companyLine(c.tag)]));
    await app.api.companyAct(c.tag, act, { agentId: agent.id, ...auth });
    app.toast({ leave: `<b>${esc(agent.name)} left ${esc(c.name)}</b>`, approve: `<b>${esc(agent.name)} joined</b>`, reject: '<b>Request declined</b>', kick: `<b>${esc(agent.name)} removed</b>`, hq: `<b>${esc(agent.name)} is the new HQ</b>` }[act] || '<b>Done</b>', agent.avatarSeed);
    after && after();
  } catch (e) { app.toast(`<b>Could not complete that</b>${esc(e.message)}`); }
}

export async function companySettingsModal(app, c, after) {
  const leagues = app.api.config.companies?.leagues || [];
  let join = c.rule.type;
  const m = app.modal(`${c.name} settings`, `
    <div class="field"><label>Who can join</label><div class="presets" id="cs-join">${['open', 'league', 'invite'].map((j) => `<button type="button" data-j="${j}" class="${j === join ? 'on' : ''}">${{ open: 'Open', league: 'By league', invite: 'Invite only' }[j]}</button>`).join('')}</div>
      <select class="input" id="cs-league" ${join === 'league' ? '' : 'hidden'}>${leagues.map((l) => `<option ${l === c.rule.league ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label for="cs-about">About</label><input class="input" id="cs-about" maxlength="160" value="${esc(c.about || '')}"></div>
    <div class="err" id="cs-err" hidden></div>
    <button class="btn btn-primary btn-block btn-lg" id="cs-go">Sign and save</button>`);
  const q = (s) => m.body.querySelector(s);
  q('#cs-join').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; join = b.dataset.j; m.body.querySelectorAll('#cs-join button').forEach((x) => x.classList.toggle('on', x === b)); q('#cs-league').hidden = join !== 'league'; });
  q('#cs-go').addEventListener('click', async () => {
    const err = q('#cs-err'), btn = q('#cs-go'); err.hidden = true;
    const league = q('#cs-league').value;
    btn.disabled = true;
    try {
      await needWallet(app);
      const auth = await signAction(actionMessage('company-settings', 'none', [companyLine(c.tag), joinLine(join, league)]));
      await app.api.companyAct(c.tag, 'settings', { join, league, about: q('#cs-about').value, ...auth });
      m.close(); app.toast('<b>Company settings saved</b>'); after && after();
    } catch (e) { err.hidden = false; err.textContent = e.message; btn.disabled = false; }
  });
}

export { short };
