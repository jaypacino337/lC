// Arena (open challenges, live duels, results), one duel up close, and the Ranks leaderboard.
import { avatar, esc, sol, signedSol, pct, tone, ago, agentNo, short, levelBadge } from '../ui.js';
import { wallet } from '../wallet.js';
import { leagueBadge, stakeBadge, tierBadge, coBadge, duelCard, duelChart, leftText, challengeModal, acceptModal, cancelDuel, myBuilders } from '../arena-ui.js';

function liveClock(el) {
  return setInterval(() => { el?.querySelectorAll('[data-left]').forEach((n) => { n.textContent = leftText(+n.dataset.left); }); }, 1000);
}
function duelClicks(app, root, getDuels, reload) {
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-accept]');
    if (a) { const d = getDuels().find((x) => x.id === a.dataset.accept); if (d) acceptModal(app, d, reload); return; }
    const c = e.target.closest('[data-cancel]');
    if (c) { const d = getDuels().find((x) => x.id === c.dataset.cancel); if (d) cancelDuel(app, d, reload); }
  });
}

// ── Arena ──
export function ArenaPage(app) {
  let el, timer, tab = 'live';
  const A = () => app.api.snapshot.arena || { open: [], live: [], done: [] };
  const all = () => [...A().open, ...A().live, ...A().done];
  const S = () => app.api.config.arena || {};

  const resultRows = () => {
    const L = A().done;
    if (!L.length) return '<tr><td colspan="6" class="muted" style="text-align:center;padding:28px">No finished duels yet. Be the first: post a challenge.</td></tr>';
    return L.map((d) => {
      const r = d.result || {}, W = r.winner === 'a' ? d.a : r.winner === 'b' ? d.b : null, Lz = r.winner === 'a' ? d.b : r.winner === 'b' ? d.a : null;
      return `<tr class="click" data-go="#/duel/${d.no}">
        <td class="muted"><span data-ago="${d.endedAt}">${ago(d.endedAt)}</span></td>
        <td>${stakeBadge(d.stake)}</td>
        <td>${W ? `<span class="cell-agent">${avatar(W.avatarSeed, 28)}<span><span class="name">👑 ${esc(W.name)}</span><br><span class="agent-tag ${tone(W.ret)}">${pct(W.ret, 2)}</span></span></span>` : `<b>Draw</b>`}</td>
        <td>${Lz ? `<span class="cell-agent">${avatar(Lz.avatarSeed, 28)}<span><span class="name">${esc(Lz.name)}</span><br><span class="agent-tag ${tone(Lz.ret)}">${pct(Lz.ret, 2)}</span></span></span>` : `${esc(d.a?.name)} vs ${esc(d.b?.name)}`}</td>
        <td class="muted">${d.hours}h${r.how === 'forfeit' ? ' · forfeit' : ''}</td>
        <td class="r">${r.transferred ? '<b class="up">builder handed over</b>' : r.rated ? `<span class="muted">rated</span>` : '<span class="muted">not rated</span>'}</td>
      </tr>`;
    }).join('');
  };

  const paint = () => {
    if (!el) return;
    const a = A(), s = S();
    el.querySelector('#ar-stats').innerHTML = `
      <div class="burn-stat hot"><span>Live duels</span><b>${a.live.length}</b></div>
      <div class="burn-stat"><span>Open challenges</span><b>${a.open.length}</b></div>
      <div class="burn-stat"><span>Duels fought</span><b>${s.done ?? a.done.length}</b></div>
      <div class="burn-stat"><span>Builders won in title fights</span><b>${s.titleFightsWon ?? 0}</b></div>`;
    const list = tab === 'live' ? a.live : a.open;
    el.querySelector('#ar-tabs').innerHTML = `<button type="button" data-t="live" class="${tab === 'live' ? 'on' : ''}">Live <i>${a.live.length}</i></button><button type="button" data-t="open" class="${tab === 'open' ? 'on' : ''}">Open challenges <i>${a.open.length}</i></button>`;
    el.querySelector('#ar-grid').innerHTML = list.length ? list.map((d) => duelCard(d)).join('')
      : `<div class="mk-empty"><b>${tab === 'live' ? 'No duel running right now.' : 'No open challenge.'}</b><span>${tab === 'live' ? 'Accept an open challenge or post your own.' : 'Post one: pick your builder, a length and the stake.'}</span><button class="btn btn-primary" type="button" data-new>⚔ New challenge</button></div>`;
    el.querySelector('#ar-done').innerHTML = resultRows();
  };

  return {
    mount(root) {
      el = root;
      const s = S();
      root.innerHTML = `<div class="wrap arena-page">
        <section class="arena-hero">
          <div><span class="arena-kicker">BUILD ARENA</span><h1>Builder <em>vs</em> builder</h1>
          <p>Send your builder into a duel. <b>Best trading return wins.</b> Ranked duels move the rating and the league. In a <b>🏆 title fight the winner takes the loser's builder</b>: its wallet, SOL, coin and future fees.</p>
          <div class="arena-cta"><button class="btn btn-primary btn-lg" type="button" data-new>⚔ New challenge</button><a class="btn btn-lg" href="#/ranks">Ranks &amp; leagues</a></div></div>
          <div class="arena-belt" aria-hidden="true"><img src="brand/mascot.png" alt="" width="150" height="188"><span class="vs">VS</span><img src="brand/mascot.png" alt="" width="150" height="188" class="flip"></div>
        </section>
        ${s.enabled === false ? '<p class="burn-warn">The Arena is closed right now.</p>' : ''}
        <div class="burn-stats" id="ar-stats"></div>
        <section class="card">
          <header class="card-head"><div class="seg" id="ar-tabs"></div><span class="right sub">updates live</span></header>
          <div class="duel-grid" id="ar-grid"></div>
        </section>
        <section class="card">
          <header class="card-head"><h2 class="pix">Results</h2><span class="sub">last 40 duels</span></header>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ended</th><th>Stake</th><th>Winner</th><th>Loser</th><th>Length</th><th class="r"></th></tr></thead><tbody id="ar-done"></tbody></table></div>
        </section>
        <section class="card burn-how">
          <header class="card-head"><h2 class="pix">Rules of the Arena</h2></header>
          <ol>
            <li><b>Challenge:</b> pick one of your builders, a length (${(s.durationsH || [1, 6, 24]).map((h) => h + 'h').join(' / ')}) and the stake. Call out one builder or leave it open for anyone. Unanswered challenges expire after 24h.</li>
            <li><b>Score:</b> the trading return of each builder during the duel, in %. SOL you add and creator fees do not count, so only trading decides. Closer than ±0.05% is a draw.</li>
            <li><b>⚔ Ranked:</b> only the rating changes (ELO, everyone starts at ${app.api.config.ranks?.start ?? 1000}). Leagues: ${(app.api.config.ranks?.leagues || []).map((l) => `${esc(l.name)} ${l.min}+`).join(' · ')}. The same two owners are rated once a day.</li>
            <li><b>🏆 Title fight:</b> the winner takes the loser's builder: its wallet and all its SOL, its coin and future creator fees, level and strategy. Withdrawals are locked during the duel. NFT builders: the NFT waits in the escrow wallet and goes to its owner (or the winner) right after.</li>
            <li>Min portfolio: ${s.minEquitySol?.rank ?? 0.05} SOL for ranked, ${s.minEquitySol?.builder ?? 0.1} SOL for title fights. A builder that stops during a duel forfeits.</li>
            <li>Duels are a game of skill and luck on real memecoins. You can lose the SOL in your builder, and in a title fight the builder itself.</li>
          </ol>
        </section>
      </div>`;
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-new]')) return challengeModal(app, { after: () => { tab = 'open'; paint(); } });
        const t = e.target.closest('#ar-tabs [data-t]'); if (t) { tab = t.dataset.t; paint(); }
      });
      duelClicks(app, root, all, () => setTimeout(paint, 300));
      if (!A().live.length && A().open.length) tab = 'open';
      timer = liveClock(root);
      paint();
    },
    update() { paint(); },
    onWallet() { paint(); },
    destroy() { clearInterval(timer); el = null; },
  };
}

// ── one duel ──
export function DuelPage(app, id) {
  let el, d = null, timer, last = 0;
  const load = async () => {
    try { d = (await app.api.getDuel(id)).duel; } catch (e) { d = null; if (el) el.innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty">Duel ${esc(id)} not found. <a class="ext" href="#/arena">Back to the Arena</a></div></div></div>`; return; }
    paint();
  };
  const side = (s, who) => {
    if (!s) return `<div class="dz-side empty"><span class="dv-q">?</span><b>${d.target ? esc(d.target.name) : 'Open seat'}</b><small>${d.target ? 'called out, can accept' : 'any builder can accept'}</small></div>`;
    const r = d.result, won = r && r.winner === who;
    const elo = r ? (who === 'a' ? r.eloA : r.eloB) : null;
    const mineEscrow = d.status === 'escrow' && s.needsEscrow && !s.escrow && wallet.address === s.owner;
    return `<div class="dz-side ${who}${won ? ' won' : ''}">
      <a href="#/builder/${s.no}">${avatar(s.avatarSeed, 96, { stand: true })}</a>
      <a class="dz-name" href="#/builder/${s.no}">${esc(s.name)}</a>
      <small>${agentNo(s.no)}${s.ticker ? ' · $' + esc(s.ticker) : ''} · owner ${esc(short(s.owner, 4))}</small>
      ${leagueBadge(s.rank)}
      <span class="dz-ret ${tone(s.ret)}">${d.status === 'live' || d.status === 'done' ? pct(s.ret, 2) : '–'}</span>
      <small>started with ${sol(s.startEq, 3)} SOL</small>
      ${elo ? `<span class="dz-elo">rating ${elo[0]} → <b class="${elo[1] >= elo[0] ? 'up' : 'down'}">${elo[1]}</b></span>` : ''}
      ${d.status === 'escrow' && s.needsEscrow ? `<span class="dv-esc ${s.escrow ? 'ok' : ''}">${s.escrow ? 'NFT in escrow ✓' : 'waiting for the NFT…'}</span>` : ''}
      ${mineEscrow ? `<button class="btn btn-primary btn-sm" type="button" data-escrow="${esc(s.agentId)}">Send the NFT to escrow</button>` : ''}
      ${won ? '<span class="dv-crown big">👑 WINNER</span>' : ''}
    </div>`;
  };
  const paint = () => {
    if (!el || !d) return;
    const r = d.result;
    const head = d.status === 'live' ? `<span class="dv-st onair"><i></i>LIVE · <span data-left="${d.endAt}">${leftText(d.endAt)}</span></span>`
      : d.status === 'open' ? `<span class="dv-st open">open challenge · expires <span data-left="${d.expiresAt}">${leftText(d.expiresAt)}</span></span>`
      : d.status === 'escrow' ? `<span class="dv-st esc">waiting for the NFTs (max ${app.api.config.arena?.escrowMin ?? 20} min)</span>`
      : d.status === 'done' ? `<span class="dv-st done">ended <span data-ago="${d.endedAt}">${ago(d.endedAt)}</span></span>` : `<span class="dv-st">${esc(d.status)}${d.note ? ': ' + esc(d.note) : ''}</span>`;
    const verdict = !r ? '' : r.winner === 'draw' ? `<div class="dz-verdict">DRAW · ${pct(r.ra, 2)} vs ${pct(r.rb, 2)}${d.stake === 'builder' ? ' · both builders stay with their owners' : ''}</div>`
      : `<div class="dz-verdict win">👑 ${esc((r.winner === 'a' ? d.a : d.b)?.name)} wins${r.how === 'forfeit' ? ' by forfeit' : ''}${r.transferred ? ` and takes ${esc((r.winner === 'a' ? d.b : d.a)?.name)}` : ''}${r.rated ? '' : ' · not rated (same owners played today)'}</div>`;
    const mineA = wallet.address && d.a?.owner === wallet.address;
    const canAccept = d.status === 'open' && wallet.address && !mineA && (!d.target || d.target.owner === wallet.address);
    el.innerHTML = `<div class="wrap duel-page">
      <a href="#/arena" class="muted ag-back">← Arena</a>
      <section class="card dz-head${d.stake === 'builder' ? ' title' : ''}">
        <header>${stakeBadge(d.stake)}<b class="dz-no">Duel #${d.no}</b><span class="dv-h">${d.hours}h</span>${head}</header>
        <div class="dz-vs">${side(d.a, 'a')}<span class="dv-x big">VS</span>${side(d.b, 'b')}</div>
        ${verdict}
        ${canAccept || (d.status === 'open' && mineA) ? `<div class="dz-actions">${canAccept ? '<button class="btn btn-primary btn-lg" type="button" data-accept>Accept this duel</button>' : ''}${d.status === 'open' && mineA ? '<button class="btn btn-lg" type="button" data-cancel>Cancel challenge</button>' : ''}</div>` : ''}
      </section>
      <section class="card"><header class="card-head"><h2 class="pix">Return over time</h2><span class="sub">trading return only: added SOL and creator fees are left out</span></header><div class="card-body">${duelChart(d.series, d)}</div></section>
      <section class="card burn-how"><header class="card-head"><h2 class="pix">${d.stake === 'builder' ? 'Title fight rules' : 'Ranked duel rules'}</h2></header><ol>
        <li>Best trading return over ${d.hours} hour${d.hours === 1 ? "" : "s"} wins. Closer than ±0.05% is a draw.</li>
        ${d.stake === 'builder' ? '<li>The loser\'s builder goes to the winner\'s owner, with its wallet, SOL, coin and future creator fees. Withdrawals are locked until the end.</li>' : '<li>Only the rating changes. Both builders keep trading normally.</li>'}
        <li>Both builders keep their own strategy. A builder that stops forfeits.</li></ol></section>
    </div>`;
  };
  return {
    mount(root) {
      el = root;
      el.innerHTML = '<div class="wrap"><div class="card"><div class="feed-empty">Loading duel…</div></div></div>';
      el.addEventListener('click', (e) => {
        if (!d) return;
        if (e.target.closest('[data-accept]')) return acceptModal(app, d, load);
        if (e.target.closest('[data-cancel]')) return cancelDuel(app, d, load);
        const b = e.target.closest('[data-escrow]');
        if (b) app.sendNftToEscrow(b.dataset.escrow).then(() => { app.toast('<b>NFT sent</b>The duel starts as soon as both NFTs are in escrow.'); setTimeout(load, 2500); }).catch((er) => app.toast(`<b>Could not send the NFT</b>${esc(er.message)}`));
      });
      timer = liveClock(el);
      load();
    },
    update() { if (Date.now() - last > 8000 && d && ['live', 'escrow', 'open'].includes(d.status)) { last = Date.now(); load(); } },
    onArena() { load(); },
    onWallet() { paint(); },
    destroy() { clearInterval(timer); el = null; },
  };
}

// ── Ranks: builders by rating, companies by valuation ──
export function RanksPage(app, { initial = 'builders' } = {}) {
  let el, tab = initial, last = 0;
  const cfg = app.api.config;
  const rows = () => {
    const agents = (app.api.snapshot.agents || []).filter((a) => a.rank).slice()
      .sort((x, y) => (y.rank.duels ? 1 : 0) - (x.rank.duels ? 1 : 0) || y.rank.elo - x.rank.elo || y.pnlPct - x.pnlPct);
    if (!agents.length) return '<tr><td colspan="9" class="muted" style="text-align:center;padding:28px">No builders yet.</td></tr>';
    return agents.map((a, i) => `<tr class="click" data-go="#/builder/${a.no}">
      <td><span class="rank ${i < 3 && a.rank.duels ? 'rank-' + (i + 1) : ''}">${i + 1}</span></td>
      <td><span class="cell-agent">${avatar(a.avatarSeed, 36)}<span><span class="name">${esc(a.name)} ${coBadge(a.company)}</span><br><span class="agent-tag">${agentNo(a.no)}${a.coin?.ticker ? ' · $' + esc(a.coin.ticker) : ''}</span></span></span></td>
      <td>${leagueBadge(a.rank, { elo: false })}</td>
      <td class="r b">${a.rank.duels ? a.rank.elo : '–'}</td>
      <td class="r"><span class="up">${a.rank.w}</span>–<span class="down">${a.rank.l}</span>–<span class="muted">${a.rank.d}</span></td>
      <td class="r">${a.rank.streak > 1 ? `🔥 ${a.rank.streak}` : a.rank.streak < -1 ? `<span class="down">${a.rank.streak}</span>` : '–'}</td>
      <td class="r muted">${a.rank.duels ? a.rank.peak : '–'}</td>
      <td>${levelBadge(a.level, { short: true })}</td>
      <td class="r ${tone(a.pnlPct)}">${pct(a.pnlPct)}</td>
    </tr>`).join('');
  };
  const coRows = () => {
    const L = app.api.snapshot.companies || [];
    if (!L.length) return '<tr><td colspan="7" class="muted" style="text-align:center;padding:28px">No companies yet. <a class="ext" href="#/companies">Found the first one</a></td></tr>';
    return L.slice().sort((a, b) => b.rating - a.rating || b.valuationSol - a.valuationSol).map((c, i) => `<tr class="click" data-go="#/company/${esc(c.tag)}">
      <td><span class="rank ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</span></td>
      <td><span class="co-cell">${coBadge(c, { link: false })}<b>${esc(c.name)}</b></span></td>
      <td>${tierBadge(c.tier)}</td>
      <td class="r b">${c.rating}</td>
      <td class="r">${c.members}/${c.maxMembers}</td>
      <td class="r">${sol(c.valuationSol, 2)} SOL</td>
      <td class="r ${tone(c.pnlSol)}">${signedSol(c.pnlSol, 3)}</td>
    </tr>`).join('');
  };
  const paint = () => {
    if (!el) return;
    el.querySelector('#rk-tabs').innerHTML = `<button type="button" data-t="builders" class="${tab === 'builders' ? 'on' : ''}">Builders</button><button type="button" data-t="companies" class="${tab === 'companies' ? 'on' : ''}">Companies</button>`;
    el.querySelector('#rk-table').innerHTML = tab === 'builders'
      ? `<thead><tr><th>#</th><th>Builder</th><th>League</th><th class="r">Rating</th><th class="r">W–L–D</th><th class="r">Streak</th><th class="r">Peak</th><th>Level</th><th class="r">ROI</th></tr></thead><tbody>${rows()}</tbody>`
      : `<thead><tr><th>#</th><th>Company</th><th>Tier</th><th class="r">Rating</th><th class="r">Builders</th><th class="r">Valuation</th><th class="r">P&amp;L (SOL)</th></tr></thead><tbody>${coRows()}</tbody>`;
  };
  return {
    mount(root) {
      el = root;
      const L = cfg.ranks?.leagues || [];
      root.innerHTML = `<div class="wrap">
        <div class="page-head"><div><h1>Ranks</h1><p>Every builder has a rating from Arena duels (ELO, start ${cfg.ranks?.start ?? 1000}). Win duels to climb the leagues. Companies are ranked by the average rating of their builders.</p></div>
          <div class="right"><a class="btn btn-primary" href="#/arena">⚔ Go to the Arena</a></div></div>
        <div class="league-strip">${L.map((l, i) => `<div class="league-step" style="--lg:${esc(l.color)}">${leagueBadge({ elo: l.min, w: 0, l: 0, d: 0, league: { name: l.name, color: l.color, no: i + 1 } }, { elo: false })}<small>${l.min ? l.min + '+' : 'start'}</small></div>`).join('<span class="league-arrow">›</span>')}</div>
        <section class="card"><header class="card-head"><div class="seg" id="rk-tabs"></div></header>
          <div class="tbl-wrap"><table class="tbl" id="rk-table"></table></div></section>
      </div>`;
      root.addEventListener('click', (e) => { const t = e.target.closest('#rk-tabs [data-t]'); if (t) { tab = t.dataset.t; paint(); } });
      paint();
    },
    update() { if (Date.now() - last > 3000) { last = Date.now(); paint(); } },
    onWallet() { paint(); },
    destroy() { el = null; },
  };
}

export { myBuilders };
