/* PumpXBT landing page: renders config content and wires the live feeds.
 * Every figure comes from feeds.js. Nothing here invents a number. */
(function () {
  'use strict';

  var C = window.PXBT, X = window.PXF, F = X.F, $ = X.$, $$ = X.$$, put = X.put, DASH = X.DASH;
  var state = { sol: null, ledger: null, paper: C.stage !== 'live' };

  /* ── static content from config ─────────────────────────────────────── */
  function renderContent() {
    $('#caps').innerHTML = C.capabilities.map(function (c) {
      return '<article class="cap reveal"><span class="code">' + F.esc(c.code) + '</span><h3>' + F.esc(c.title) +
        '</h3><p>' + F.esc(c.body) + '</p></article>';
    }).join('');

    var by = { worker: ['worker', 'chip-ok'], agent: ['agent · paper', 'chip-paper'], treasury: ['manual', 'chip-warn'] };
    $('#pipe').innerHTML = C.flywheel.map(function (s) {
      var tag = by[s.by] || [s.by, ''];
      return '<li class="reveal"><div class="p-top"><span class="p-k">' + F.esc(s.k) + '</span><span class="chip ' + tag[1] + '">' +
        F.esc(tag[0]) + '</span></div><h3>' + F.esc(s.title) + '</h3><p>' + F.esc(s.body) +
        '</p><div class="p-metric"><span>' + F.esc(METRIC_LABEL[s.metric] || 'live') + '</span><b class="num" data-metric="' +
        F.esc(s.metric) + '">—</b></div></li>';
    }).join('');

    var cls = { live: 'chip-ok', progress: 'chip-paper', next: 'chip-warn', soon: '' };
    $('#road').innerHTML = C.roadmap.map(function (r) {
      return '<article class="road-item reveal"><span class="chip ' + (cls[r.state] || '') + '">' + F.esc(r.phase) +
        '</span><h3>' + F.esc(r.title) + '</h3><p>' + F.esc(r.body) + '</p></article>';
    }).join('');

    $('#faqList').innerHTML = C.faq.map(function (f) {
      return '<details class="reveal"><summary>' + F.esc(f.q) + '</summary><p>' + F.esc(f.a) + '</p></details>';
    }).join('');

    var buy = C.token.pumpUrl || 'https://pump.fun';
    ['#buyHero', '#buyFoot'].forEach(function (s) { $(s).href = buy; });
    $('#xLink').href = C.token.twitterUrl || 'https://x.com';
    $('#year').textContent = new Date().getFullYear();
    if (C.token.address) $('#caText').textContent = F.short(C.token.address);
  }

  var METRIC_LABEL = { claimable: 'claimable', agentMode: 'mode', callouts: 'logged', treasury: 'treasury', burned: 'burned' };

  /* ── chrome: nav, CA copy, reveals, spotlight ───────────────────────── */
  function chrome() {
    var burger = $('#burger'), links = $('#navLinks');
    burger.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
    });
    $$('#navLinks a').forEach(function (a) {
      a.addEventListener('click', function () { links.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); });
    });
    var nav = $('#nav');
    window.addEventListener('scroll', function () { nav.classList.toggle('scrolled', window.scrollY > 8); }, { passive: true });

    $('#caBtn').addEventListener('click', function () {
      if (!C.token.address) return toast('Contract address not published yet');
      (navigator.clipboard ? navigator.clipboard.writeText(C.token.address) : Promise.reject())
        .then(function () { toast('Contract address copied'); }, function () { toast(C.token.address); });
    });

    if ('IntersectionObserver' in window && !X.reduced) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      $$('.reveal').forEach(function (el, i) {
        el.style.transitionDelay = (i % 6) * 60 + 'ms';
        io.observe(el);
      });
    } else {
      $$('.reveal').forEach(function (el) { el.classList.add('in'); });
    }

    $$('.cap').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });
  }

  var toastT;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  var led = X.led;

  /* ── stage ──────────────────────────────────────────────────────────── */
  function renderStage() {
    var paper = state.paper;
    put('#stageLabel', C.stage === 'prelaunch' ? 'PRE-LAUNCH' : paper ? 'PAPER' : 'LIVE');
    $('#stageNote').textContent = paper ? 'agent fills are simulated' : 'agent trades real funds';
    led('stage', paper ? 'paper' : 'on');
  }

  /* ── market: SOL + PUMPXBT (DexScreener) ────────────────────────────── */
  function loadMarket() {
    if (!C.feeds.market) return;
    var mints = [X.WSOL];
    if (C.token.address) mints.push(C.token.address);
    X.quotes(mints).then(function (q) {
      var sol = q[X.WSOL];
      state.sol = sol ? sol.price : state.sol;
      put('#solPx', F.usd(state.sol));
      var t = C.token.address ? q[C.token.address] : null;
      if (!C.token.address) return;
      if (!t) { $('#quoteSrc').textContent = 'no pair yet'; return; }
      $('#quoteSrc').textContent = t.dex || 'dexscreener';
      $('#quoteSrc').className = 'chip chip-ok';
      put('[data-q="price"]', F.price(t.price));
      put('[data-q="change"]', F.pct(t.change), t.change >= 0 ? 'up' : 'down');
      put('[data-q="mcap"]', F.usd(t.mcap));
      put('[data-q="liq"]', F.usd(t.liq));
      put('[data-q="vol24"]', F.usd(t.vol24));
      put('[data-q="txns24"]', F.num(t.txns24));
      $('#quoteNote').textContent = 'DexScreener · ' + (t.dex || '') + ' · refreshed ' + F.clock(Date.now());
    }).catch(function () { /* keep last values; dashes stay dashes */ });
  }

  /* ── ledger API: flywheel + agent ───────────────────────────────────── */
  function loadLedger() {
    if (!X.hasLedger) { put('#ledgerState', 'not set'); led('ledger', ''); return; }
    X.ledger('/api/state').then(function (s) {
      state.ledger = s;
      state.paper = s.paper !== false;
      put('#ledgerState', 'online'); led('ledger', 'on');
      renderStage();
      renderFlywheel(s.flywheel || {}, s);
      renderCallouts((s.callouts && s.callouts.ours) || []);
    }).catch(function () {
      put('#ledgerState', 'unreachable'); led('ledger', 'off');
    });
  }

  function renderFlywheel(fw, s) {
    var ch = fw.chain || {}, wk = fw.worker || {}, h = wk.health;
    var solUsd = function (v) { return state.sol && v !== null && v !== undefined ? ' · ' + F.usd(v * state.sol) : ''; };

    put('[data-fw="treasury"]', F.sol(ch.treasurySol, 3));
    $$('[data-fw="burned"]').forEach(function (el) { put(el, F.num(ch.burnedTokens)); });
    $$('[data-fw="burnedPct"]').forEach(function (el) {
      put(el, ch.burnedPctSupply === null || ch.burnedPctSupply === undefined ? DASH : ch.burnedPctSupply.toFixed(2) + '%');
    });
    put('[data-fw="supply"]', F.num(ch.supply));
    put('[data-fw="curve"]', ch.curve ? (ch.curve.complete ? 'GRADUATED' : (ch.curve.progress * 100).toFixed(1) + '%') : DASH);
    $$('[data-fw="claimable"]').forEach(function (el) { put(el, F.sol(ch.claimableSol, 4)); });
    $('#burnBar').style.width = Math.min(100, Math.max(0, ch.burnedPctSupply || 0)) + '%';

    if (h) {
      put('[data-fw="cycles"]', String(h.cycles));
      put('[data-fw="workerMode"]', (h.live ? 'LIVE' : 'DRY RUN') + (h.intervalMinutes ? ' · every ' + h.intervalMinutes + 'm' : '') + (h.failures ? ' · ' + h.failures + ' failed' : ''));
      put('[data-fw="last"]', h.last ? F.ago(h.last.finishedAt) + ' ago' : DASH, h.last ? (h.last.ok ? 'up' : 'down') : null);
      put('[data-fw="lastNote"]', h.last ? (h.last.ok ? 'cycle ok' : 'failed: ' + (h.last.error || 'error')) : 'no cycle yet');
      put('[data-fw="workerShort"]', h.live ? 'LIVE' : 'DRY RUN');
    } else {
      put('[data-fw="workerMode"]', wk.configured ? 'worker unreachable' : 'worker not connected');
      put('[data-fw="workerShort"]', wk.configured ? 'unreachable' : DASH);
    }

    var pnl = s.portfolio ? s.portfolio.realisedUsd : null;
    put('[data-ag="pnl"]', F.usd(pnl), pnl > 0 ? 'up' : pnl < 0 ? 'down' : null);
    put('[data-ag="pnlNote"]', s.paper ? 'SIMULATED · paper fills' : 'realised');

    var m = {
      claimable: F.sol(ch.claimableSol, 4) + solUsd(ch.claimableSol),
      agentMode: s.paper ? 'PAPER' : 'LIVE',
      callouts: s.callouts ? String((s.callouts.ours || []).length) : DASH,
      treasury: F.sol(ch.treasurySol, 3),
      burned: F.num(ch.burnedTokens)
    };
    Object.keys(m).forEach(function (k) { put('[data-metric="' + k + '"]', m[k]); });
  }

  function renderCallouts(rows) {
    var chip = $('#calloutsChip');
    chip.textContent = state.paper ? 'paper · simulated' : 'live';
    chip.className = 'chip ' + (state.paper ? 'chip-paper' : 'chip-ok');
    var tb = $('#calloutGrid tbody');
    $('#calloutEmpty').hidden = rows.length > 0;
    tb.innerHTML = rows.slice(0, 10).map(function (c) {
      return '<tr><td>' + F.ago(c.created_at) + '</td><td class="sym"><a href="https://pump.fun/coin/' + encodeURIComponent(c.mint) +
        '" target="_blank" rel="noopener">' + F.esc(F.short(c.mint)) + '</a></td><td class="txt">' + F.esc(c.text) + '</td><td class="r">' +
        (c.score !== null && c.score !== undefined ? Math.round(c.score * 100) : DASH) + '</td><td class="r"><span class="chip">' +
        F.esc(c.status) + '</span></td></tr>';
    }).join('');
  }

  renderContent();
  chrome();
  renderStage();
  loadMarket();
  loadLedger();
  X.launchBoard({ sol: function () { return state.sol; } });
  setInterval(loadMarket, 30000);
  setInterval(loadLedger, 30000);
})();
