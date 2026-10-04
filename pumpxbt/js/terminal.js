/* PumpXBT Terminal: live launches, the fee flywheel and the agent's full
 * record. Same rule as the site: a missing source renders "—", and paper-mode
 * agent figures are labelled SIMULATED wherever they appear. */
(function () {
  'use strict';

  var C = window.PXBT, X = window.PXF, F = X.F, $ = X.$, $$ = X.$$, put = X.put, led = X.led, DASH = X.DASH;
  var state = { sol: null, paper: C.stage !== 'live' };

  function rows(tableSel, emptySel, list, render) {
    var tb = $(tableSel + ' tbody');
    $(emptySel).hidden = list.length > 0;
    tb.innerHTML = list.map(render).join('');
  }
  function tokenLink(mint) {
    return '<a href="https://pump.fun/coin/' + encodeURIComponent(mint) + '" target="_blank" rel="noopener">' + F.esc(F.short(mint)) + '</a>';
  }
  function chip(text, cls) { return '<span class="chip ' + (cls || '') + '">' + F.esc(text) + '</span>'; }
  function tick() { put('#clock', new Date().toISOString().slice(11, 19)); }

  function stage() {
    put('#stageLabel', C.stage === 'prelaunch' ? 'PRE-LAUNCH' : state.paper ? 'PAPER' : 'LIVE');
    $('#stageNote').textContent = state.paper ? 'agent fills are simulated' : 'agent trades real funds';
    led('stage', state.paper ? 'paper' : 'on');
    ['#wrTag', '#pnlTag'].forEach(function (s) { $(s).textContent = state.paper ? '(SIM)' : ''; });
    var pc = $('#posChip');
    pc.textContent = state.paper ? 'simulated' : 'live';
    pc.className = 'chip ' + (state.paper ? 'chip-paper' : 'chip-ok');
  }

  /* ── market ─────────────────────────────────────────────────────────── */
  function loadMarket() {
    if (C.feeds.market === false) return;
    var mints = [X.WSOL].concat(C.token.address ? [C.token.address] : []);
    X.quotes(mints).then(function (q) {
      if (q[X.WSOL]) state.sol = q[X.WSOL].price;
      put('#solPx', F.usd(state.sol));
      var t = C.token.address && q[C.token.address];
      if (!t) return;
      put('[data-q="price"]', F.price(t.price));
      put('[data-q="change"]', F.pct(t.change), t.change >= 0 ? 'up' : 'down');
      put('[data-q="mcap"]', F.usd(t.mcap));
      put('[data-q="liq"]', F.usd(t.liq));
    }).catch(function () {});
  }

  /* ── flywheel ───────────────────────────────────────────────────────── */
  function renderFlywheel(fw) {
    var wk = fw.worker || {}, h = wk.health, ch = fw.chain || {};
    var fc = $('#fwChip');
    if (h) {
      fc.textContent = h.live ? 'live' : 'dry run'; fc.className = 'chip ' + (h.live ? 'chip-ok' : 'chip-warn');
      led('worker', h.last && !h.last.ok ? 'off' : 'on');
      put('#workerState', h.live ? 'live' : 'dry run');
      put('[data-fw="mode"]', h.live ? 'LIVE' : 'DRY RUN', h.live ? 'up' : null);
      put('[data-fw="interval"]', h.intervalMinutes ? h.intervalMinutes + ' min' : DASH);
      put('[data-fw="cycles"]', String(h.cycles));
      put('[data-fw="failures"]', String(h.failures), h.failures ? 'down' : null);
      put('[data-fw="last"]', h.last ? (h.last.ok ? 'ok · ' : 'FAILED · ') + F.ago(h.last.finishedAt) + ' ago' + (h.last.error ? ' · ' + h.last.error : '') : 'no cycle yet',
        h.last ? (h.last.ok ? 'up' : 'down') : null);
    } else {
      fc.textContent = wk.configured ? 'unreachable' : 'not connected';
      fc.className = 'chip ' + (wk.configured ? 'chip-bad' : '');
      led('worker', wk.configured ? 'off' : '');
      put('#workerState', wk.configured ? 'unreachable' : 'not set');
    }
    if (wk.warning) $('#fwNote').textContent = '⚠ ' + wk.warning;
    var withUsd = function (v, dp) { return F.sol(v, dp) + (state.sol && v !== null && v !== undefined ? ' · ' + F.usd(v * state.sol) : ''); };
    put('[data-fw="claimable"]', F.sol(ch.claimableSol, 4));
    put('[data-fw="treasury"]', withUsd(ch.treasurySol, 3));
    put('[data-fw="creator"]', F.sol(ch.creatorSol, 3));
    put('[data-fw="curve"]', ch.curve ? (ch.curve.complete ? 'GRADUATED' : (ch.curve.progress * 100).toFixed(1) + '%') : DASH);
    put('[data-fw="burned"]', F.num(ch.burnedTokens));
    put('[data-fw="burnedPct"]', ch.burnedPctSupply === null || ch.burnedPctSupply === undefined ? DASH : ch.burnedPctSupply.toFixed(3) + '%');
    var lg = wk.ledgers;
    put('[data-fw="ledgers"]', lg ? lg.sent + ' sent · ' + lg.pending + ' pending · ' + lg.failed + ' failed' : 'not mounted here');
  }

  /* ── agent ──────────────────────────────────────────────────────────── */
  function renderState(s) {
    state.paper = s.paper !== false;
    stage();
    renderFlywheel(s.flywheel || {});
    var reg = s.regime && { risk_on: 'RISK ON', neutral: 'NEUTRAL', risk_off: 'RISK OFF' }[s.regime.regime];
    var regCls = s.regime && (s.regime.regime === 'risk_on' ? 'up' : s.regime.regime === 'risk_off' ? 'down' : null);
    put('[data-ag="regime"]', reg || DASH, regCls);
    put('[data-ag="regime2"]', reg ? reg + ' · ' + s.regime.ratio + '×' : DASH, regCls);
    var wr = s.learning && s.learning.winRate;
    put('[data-ag="winrate"]', wr === null || wr === undefined ? DASH : Math.round(wr * 100) + '% · n=' + s.learning.sample);
    var p = s.portfolio || {};
    put('[data-ag="pnl"]', F.usd(p.realisedUsd), p.realisedUsd > 0 ? 'up' : p.realisedUsd < 0 ? 'down' : null);
    put('[data-ag="size"]', s.learning && isFinite(s.learning.sizeMult) ? s.learning.sizeMult.toFixed(2) + '×' : DASH);
    put('[data-ag="open"]', isFinite(p.openCount) ? String(p.openCount) : DASH);
    put('[data-ag="closed"]', isFinite(p.closedCount) ? String(p.closedCount) : DASH);
    put('[data-ag="floored"]', F.usd(p.flooredCapitalUsd));
    put('[data-ag="decisions"]', s.stats ? F.num(s.stats.decisions) : DASH);

    var ours = (s.callouts && s.callouts.ours) || [];
    put('#calloutsNote', ours.length + ' recorded · ' + ((s.callouts && s.callouts.pending) || 0) + ' pending');
    rows('#calloutGrid', '#calloutEmpty', ours.slice(0, 30), function (c) {
      return '<tr><td>' + F.ago(c.created_at) + '</td><td class="sym">' + tokenLink(c.mint) + '</td><td class="txt">' + F.esc(c.text) +
        '</td><td class="r">' + (isFinite(c.score) ? Math.round(c.score * 100) : DASH) + '</td><td class="r">' + chip(c.status) + '</td></tr>';
    });
    rows('#callerGrid', '#callerEmpty', s.topCallers || [], function (k) {
      return '<tr><td class="sym"><a href="https://solscan.io/account/' + encodeURIComponent(k.caller) + '" target="_blank" rel="noopener">' + F.esc(F.short(k.caller)) +
        '</a></td><td class="r">' + (k.score * 100).toFixed(0) + '</td><td class="r">' + k.n_wins + '/' + k.n_resolved + '</td></tr>';
    });
    put('#updated', 'updated ' + F.clock(Date.now()));
  }

  function renderPositions(j) {
    var open = (j.open || []).map(function (p) { return { open: true, mint: p.mint, kind: p.kind, size: p.costUsd, entry: p.entryPrice, now: p.price, pnl: p.unrealisedUsd, status: p.status || 'open' }; });
    var closed = (j.closed || []).slice(0, 30).map(function (p) { return { mint: p.mint, kind: p.kind, size: p.cost_usd, entry: p.entry_price, now: p.exit_price, pnl: p.realised_usd, status: p.realised_usd > 0 ? 'closed · win' : 'closed · loss' }; });
    rows('#posGrid', '#posEmpty', open.concat(closed), function (p) {
      var cls = p.pnl > 0 ? 'up' : p.pnl < 0 ? 'down' : '';
      return '<tr><td class="sym">' + tokenLink(p.mint) + '</td><td>' + F.esc(p.kind || DASH) + '</td><td class="r">' + F.usd(p.size) + '</td><td class="r">' +
        F.price(p.entry) + '</td><td class="r">' + F.price(p.now) + '</td><td class="r ' + cls + '">' + F.usd(p.pnl) + '</td><td class="r">' +
        chip(p.status, p.open ? 'chip-paper' : '') + '</td></tr>';
    });
  }

  function renderDecisions(j) {
    var list = (j.decisions || []).slice(0, 60);
    var rejected = list.filter(function (d) { return d.rejected; }).length;
    put('#decNote', list.length + ' latest · ' + rejected + ' rejected');
    rows('#decGrid', '#decEmpty', list, function (d) {
      var v = d.trade ? ['TRADE', 'trade'] : d.callout ? ['CALL', 'call'] : ['PASS', 'pass'];
      var why = d.rejected || (function () { try { return JSON.parse(d.reasons || '[]').join('; '); } catch (e) { return ''; } })();
      return '<tr><td>' + F.clock(d.at) + '</td><td class="sym">' + tokenLink(d.mint) + '</td><td><span class="verdict ' + v[1] + '">' + v[0] +
        '</span></td><td class="r">' + (isFinite(d.score) ? Math.round(d.score * 100) : DASH) + '</td><td class="txt">' + F.esc(why || DASH) + '</td></tr>';
    });
  }

  function renderHealth(h) {
    var src = h.sources;
    if (!src) return;
    if (src.source === 'fixture') {
      put('[data-src="pumpportal"]', 'FIXTURE REPLAY (not live)', 'down');
      put('[data-src="chain"]', DASH); put('[data-src="callouts"]', 'fixture');
      return;
    }
    var pp = src.pumpportal || {};
    put('[data-src="pumpportal"]', (pp.connected ? 'connected' : 'down') + ' · ' + F.num(pp.messages) + ' msgs · trades ' + (pp.tradeStream || '').split(' ')[0], pp.connected ? 'up' : 'down');
    put('[data-src="chain"]', src.chain || DASH);
    put('[data-src="callouts"]', 'unavailable (no public feed)');
  }

  function loadLedger() {
    if (!X.hasLedger) {
      put('#ledgerState', 'not set'); led('ledger', '');
      put('#workerState', 'via ledger');
      return;
    }
    X.ledger('/api/state').then(function (s) {
      put('#ledgerState', 'online'); led('ledger', 'on');
      renderState(s);
    }).catch(function () { put('#ledgerState', 'unreachable'); led('ledger', 'off'); });
    X.ledger('/api/positions').then(renderPositions).catch(function () {});
    X.ledger('/api/decisions').then(renderDecisions).catch(function () {});
    X.ledger('/api/health').then(renderHealth).catch(function () {});
  }

  stage();
  tick();
  loadMarket();
  loadLedger();
  X.launchBoard({ sol: function () { return state.sol; }, rows: 60 });
  setInterval(tick, 1000);
  setInterval(loadMarket, 30000);
  setInterval(loadLedger, 15000);
})();
