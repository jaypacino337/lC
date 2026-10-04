// Companies: squads of builders (list + one company with roster, HQ coin, founder tools).
import { avatar, esc, sol, signedSol, pct, tone, ago, agentNo, short, levelBadge, usd } from '../ui.js';
import { wallet } from '../wallet.js';
import { leagueBadge, tierBadge, coBadge, ruleText, companyCreateModal, companyJoinModal, companyAct, companySettingsModal, challengeModal, myBuilders } from '../arena-ui.js';

export function CompaniesPage(app) {
  let el, sort = 'val', last = 0;
  const SORTS = { val: (a, b) => b.valuationSol - a.valuationSol, rating: (a, b) => b.rating - a.rating, pnl: (a, b) => b.pnlSol - a.pnlSol, new: (a, b) => b.createdAt - a.createdAt };
  const card = (c) => {
    const next = c.tier.next ? Math.min(100, (c.valuationSol / c.tier.next.minSol) * 100) : 100;
    return `<a class="co-card" href="#/company/${esc(c.tag)}" style="--cc:${esc(c.color)}">
      <div class="co-band"><span class="co-tag">${esc(c.tag)}</span>${tierBadge(c.tier)}</div>
      <div class="co-body">
        <b class="co-name">${esc(c.name)}</b>
        ${c.about ? `<p class="co-about">${esc(c.about)}</p>` : ''}
        <div class="co-faces">${c.faces.map((s) => avatar(s, 36)).join('')}<span>${c.members}/${c.maxMembers} builders</span></div>
        <dl class="co-nums"><div><dt>Valuation</dt><dd>${sol(c.valuationSol, 2)} SOL</dd></div><div><dt>Rating</dt><dd>${c.rating}</dd></div><div><dt>P&amp;L</dt><dd class="${tone(c.pnlSol)}">${signedSol(c.pnlSol, 3)}</dd></div></dl>
        <div class="co-prog" title="${c.tier.next ? `${sol(c.valuationSol, 2)} / ${c.tier.next.minSol} SOL to ${esc(c.tier.next.name)}` : 'Top tier'}"><span style="width:${next}%"></span></div>
        <div class="co-foot"><span class="chip">${esc(ruleText(c.rule))}</span>${c.hq?.ticker ? `<span class="chip">HQ $${esc(c.hq.ticker)}</span>` : ''}</div>
      </div>
    </a>`;
  };
  const paint = () => {
    if (!el) return;
    const L = (app.api.snapshot.companies || []).slice().sort(SORTS[sort]);
    const T = app.api.config.companies?.tiers || [];
    el.querySelector('#co-stats').innerHTML = `
      <div class="burn-stat hot"><span>Companies</span><b>${L.length}</b></div>
      ${T.map((t, i) => `<div class="burn-stat"><span>${i === T.length - 1 ? '🦄 ' : ''}${esc(t.name)}s</span><b>${L.filter((c) => c.tier.no === i + 1).length}</b></div>`).join('')}`;
    el.querySelector('#co-grid').innerHTML = L.length ? L.map(card).join('') : `<div class="mk-empty"><b>No companies yet.</b><span>Found the first one with one of your builders.</span><button class="btn btn-primary" type="button" data-new>🏢 Found a company</button></div>`;
  };
  return {
    mount(root) {
      el = root;
      const T = app.api.config.companies?.tiers || [];
      root.innerHTML = `<div class="wrap">
        <div class="page-head"><div><h1>Companies</h1><p>Builders team up under one name. The <b>valuation</b> is the total portfolio of the company's builders: ${T.map((t) => `${esc(t.name)} ${t.minSol ? t.minSol + '+ SOL' : ''}`).join(' → ')}. Join by rank, by invite, or invest in the company coin (its HQ builder's coin).</p></div>
          <div class="right"><button class="btn btn-primary" type="button" data-new>🏢 Found a company</button></div></div>
        <div class="burn-stats" id="co-stats"></div>
        <section class="card"><header class="card-head"><h2 class="pix">All companies</h2>
          <div class="right seg" id="co-sort">${[['val', 'Valuation'], ['rating', 'Rating'], ['pnl', 'P&L'], ['new', 'Newest']].map(([k, l]) => `<button type="button" data-s="${k}" class="${k === sort ? 'on' : ''}">${l}</button>`).join('')}</div></header>
          <div class="co-grid" id="co-grid"></div></section>
      </div>`;
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-new]')) { e.preventDefault(); return companyCreateModal(app); }
        const s = e.target.closest('#co-sort [data-s]'); if (s) { sort = s.dataset.s; root.querySelectorAll('#co-sort button').forEach((x) => x.classList.toggle('on', x === s)); paint(); }
      });
      paint();
    },
    update() { if (Date.now() - last > 3000) { last = Date.now(); paint(); } },
    onWallet() { paint(); },
    destroy() { el = null; },
  };
}

export function CompanyPage(app, id) {
  let el, c = null, last = 0;
  const load = async () => {
    try { c = (await app.api.getCompany(id)).company; } catch { c = null; if (el) el.innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty">Company ${esc(id)} not found. <a class="ext" href="#/companies">All companies</a></div></div></div>`; return; }
    paint();
  };
  const founder = () => wallet.address && c && wallet.address === c.founder;
  const paint = () => {
    if (!el || !c) return;
    const mineIn = (c.roster || []).filter((a) => a.creator === wallet.address);
    const free = myBuilders(app).filter((a) => !a.company);
    const nextPct = c.tier.next ? Math.min(100, (c.valuationSol / c.tier.next.minSol) * 100) : 100;
    el.innerHTML = `<div class="wrap co-page">
      <a href="#/companies" class="muted ag-back">← All companies</a>
      <section class="co-hero" style="--cc:${esc(c.color)}">
        <div class="co-hero-in">
          <span class="co-tag big">${esc(c.tag)}</span>
          <div><h1>${esc(c.name)}</h1>
            <div class="ag-chips">${tierBadge(c.tier)}${c.league?.no ? leagueBadge({ elo: c.rating, w: c.wins, l: c.losses, d: 0, league: c.league }) : ''}<span class="chip">${esc(ruleText(c.rule))}</span><span class="chip">founded <span data-ago="${c.createdAt}">${ago(c.createdAt)}</span></span></div>
            ${c.about ? `<p class="co-about">${esc(c.about)}</p>` : ''}
            <small class="muted">Founder ${esc(short(c.founder, 4))}${founder() ? ' (you)' : ''}</small></div>
        </div>
        <div class="co-hero-act">
          ${free.length && c.members < c.maxMembers ? `<button class="btn btn-primary btn-lg" type="button" data-join>${c.rule.type === 'invite' ? 'Ask to join' : 'Join with a builder'}</button>` : ''}
          ${c.hq?.mint ? `<a class="btn btn-lg" href="https://pump.fun/coin/${esc(c.hq.mint)}" target="_blank" rel="noopener">📈 Invest: buy $${esc(c.hq.ticker)}</a>` : ''}
          ${founder() ? '<button class="btn btn-lg" type="button" data-settings>Settings</button>' : ''}
        </div>
      </section>
      <div class="burn-stats">
        <div class="burn-stat hot"><span>Valuation</span><b>${sol(c.valuationSol, 2)} SOL</b></div>
        <div class="burn-stat"><span>Company rating</span><b>${c.rating}</b></div>
        <div class="burn-stat"><span>Builders</span><b>${c.members}/${c.maxMembers}</b></div>
        <div class="burn-stat"><span>Total P&amp;L</span><b class="${tone(c.pnlSol)}">${signedSol(c.pnlSol, 3)} SOL</b></div>
        <div class="burn-stat"><span>Duels won</span><b>${c.wins}</b></div>
      </div>
      <section class="card co-tierbar"><div class="card-body"><div class="co-prog big"><span style="width:${nextPct}%"></span></div>
        <p>${c.tier.next ? `<b>${sol(Math.max(0, c.tier.next.minSol - c.valuationSol), 2)} SOL</b> more portfolio value → <b>${esc(c.tier.next.name)}</b>${c.tier.next.name === 'Unicorn' ? ' 🦄' : ''}` : '<b>🦄 Unicorn.</b> Top tier reached.'}</p></div></section>
      ${c.hq ? `<section class="card co-hq"><div class="card-body"><span class="agent-tag">COMPANY COIN · HQ</span>
        <div class="co-hq-row">${c.hq.image ? `<img src="${esc(c.hq.image)}" alt="" width="48" height="48" onerror="this.remove()">` : ''}<div><b>$${esc(c.hq.ticker)}</b> · coin of <a class="ext" href="#/builder/${c.hq.no}">${esc(c.hq.name)}</a><br><span class="muted">market cap ${usd(c.hq.mcapUsd)}. Its creator fees go into the HQ builder, which trades for the company.</span></div>
        ${c.hq.mint ? `<a class="btn btn-primary" href="https://pump.fun/coin/${esc(c.hq.mint)}" target="_blank" rel="noopener">Invest on pump.fun ↗</a>` : ''}</div></div></section>` : ''}
      ${founder() && c.pending?.length ? `<section class="card"><header class="card-head"><h2 class="pix">Requests to join</h2><span class="sub">${c.pending.length} waiting</span></header>
        <div class="tbl-wrap"><table class="tbl"><tbody>${c.pending.map((a) => `<tr><td><span class="cell-agent">${avatar(a.avatarSeed, 36)}<span><a class="name" href="#/builder/${a.no}">${esc(a.name)}</a><br><span class="agent-tag">${agentNo(a.no)}</span></span></span></td><td>${leagueBadge(a.rank)}</td><td class="r">${sol(a.equitySol, 3)} SOL</td><td class="r ${tone(a.pnlPct)}">${pct(a.pnlPct)}</td>
          <td class="r"><button class="btn btn-primary btn-sm" type="button" data-co="approve" data-a="${esc(a.id)}">Approve</button> <button class="btn btn-sm" type="button" data-co="reject" data-a="${esc(a.id)}">Decline</button></td></tr>`).join('')}</tbody></table></div></section>` : ''}
      <section class="card"><header class="card-head"><h2 class="pix">Roster</h2><span class="sub">best rated first</span></header>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Builder</th><th>League</th><th class="r">Rating</th><th>Level</th><th class="r">Portfolio</th><th class="r">P&amp;L</th><th class="r"></th></tr></thead><tbody>
        ${(c.roster || []).map((a) => `<tr>
          <td><span class="cell-agent">${avatar(a.avatarSeed, 36)}<span><a class="name" href="#/builder/${a.no}">${esc(a.name)}</a>${c.hq?.agentId === a.id ? ' <span class="chip">HQ</span>' : ''}<br><span class="agent-tag">${agentNo(a.no)}${a.coin?.ticker ? ' · $' + esc(a.coin.ticker) : ''} · ${esc(short(a.creator, 4))}</span></span></span></td>
          <td>${leagueBadge(a.rank, { elo: false })}</td><td class="r b">${a.rank.duels ? a.rank.elo : '–'}</td><td>${levelBadge(a.level, { short: true })}</td>
          <td class="r">${sol(a.equitySol, 3)} SOL</td><td class="r ${tone(a.pnlPct)}">${pct(a.pnlPct)}</td>
          <td class="r co-acts">
            ${a.creator === wallet.address ? `<button class="btn btn-sm" type="button" data-co="leave" data-a="${esc(a.id)}">Leave</button>` : wallet.address ? `<button class="btn btn-sm" type="button" data-duel="${esc(a.id)}">⚔ Challenge</button>` : ''}
            ${founder() && c.hq?.agentId !== a.id && a.coin?.mint ? `<button class="btn btn-sm" type="button" data-co="hq" data-a="${esc(a.id)}">Make HQ</button>` : ''}
            ${founder() && a.creator !== wallet.address ? `<button class="btn btn-sm" type="button" data-co="kick" data-a="${esc(a.id)}">Remove</button>` : ''}
          </td></tr>`).join('')}
        </tbody></table></div></section>
      <section class="card"><header class="card-head"><h2 class="pix">Company log</h2></header>
        <ul class="co-log">${(c.log || []).map((x) => `<li><span data-ago="${x.ts}">${ago(x.ts)}</span>${esc(x.text)}</li>`).join('') || '<li class="muted">Nothing yet.</li>'}</ul></section>
      ${mineIn.length ? '' : ''}
    </div>`;
  };
  return {
    mount(root) {
      el = root;
      el.innerHTML = '<div class="wrap"><div class="card"><div class="feed-empty">Loading company…</div></div></div>';
      el.addEventListener('click', (e) => {
        if (!c) return;
        if (e.target.closest('[data-join]')) return companyJoinModal(app, c, load);
        if (e.target.closest('[data-settings]')) return companySettingsModal(app, c, load);
        const du = e.target.closest('[data-duel]');
        if (du) { const t = (c.roster || []).find((a) => a.id === du.dataset.duel); if (t) return challengeModal(app, { target: t }); }
        const b = e.target.closest('[data-co]');
        if (b) {
          const a = [...(c.roster || []), ...(c.pending || [])].find((x) => x.id === b.dataset.a);
          if (a) companyAct(app, c, b.dataset.co, a, load);
        }
      });
      load();
    },
    update() { if (Date.now() - last > 10000) { last = Date.now(); load(); } },
    onCompany() { load(); },
    onWallet() { paint(); },
    destroy() { el = null; },
  };
}
