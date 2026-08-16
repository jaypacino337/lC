/* ============================================================================
   PumpXBT — behaviour.
   Renders everything driven by config.js, pulls live market data when a
   contract address is configured, and wires the scroll interactions.
   ========================================================================== */
(function () {
  'use strict';

  var C = window.PXBT;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── Formatting ─────────────────────────────────────────────────────────
   * Every formatter returns an em dash for null/undefined, so an unconfigured
   * field is visibly blank rather than silently rendering as zero. */
  var DASH = '—';

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return DASH;
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(2);
  }
  function price(n) {
    if (n === null || n === undefined || !isFinite(n)) return DASH;
    if (n >= 1) return '$' + n.toFixed(3);
    if (n >= 0.001) return '$' + n.toFixed(5);
    return '$' + n.toPrecision(3);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return DASH;
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function count(n) {
    if (n === null || n === undefined || !isFinite(n)) return DASH;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── Links ──────────────────────────────────────────────────────────────── */
  ['buyTop', 'buyHero', 'buyFoot'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.href = C.token.pumpUrl;
  });
  var xl = $('#xLink'); if (xl) xl.href = C.token.twitterUrl;
  $('#year').textContent = new Date().getFullYear();

  /* contract address + copy */
  var caBtn = $('#caBtn'), caText = $('#caText');
  var addr = (C.token.address || '').trim();
  if (addr) {
    caText.textContent = addr.slice(0, 4) + '…' + addr.slice(-4);
    caBtn.addEventListener('click', function () {
      navigator.clipboard && navigator.clipboard.writeText(addr).then(
        function () { toast('Contract address copied'); },
        function () { toast('Copy failed'); }
      );
    });
  } else {
    caText.textContent = 'CA soon';
    caBtn.addEventListener('click', function () { toast('Contract address not set yet'); });
  }

  var toastEl = $('#toast'), toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2200);
  }

  /* ── Treasury figures ───────────────────────────────────────────────────── */
  var T = C.treasury;
  var TREASURY_FMT = {
    valueUsd: usd, realisedPnlUsd: usd, feesRoutedUsd: usd, boughtBackUsd: usd,
    burnedTokens: count, burnedPctSupply: function (n) {
      return (n === null || n === undefined) ? DASH : n.toFixed(1) + '%';
    }
  };
  $$('[data-treasury]').forEach(function (el) {
    var k = el.getAttribute('data-treasury');
    el.textContent = (TREASURY_FMT[k] || String)(T[k]);
  });

  var burnBar = $('#burnBar');
  if (T.burnedPctSupply) {
    setTimeout(function () {
      burnBar.style.width = Math.max(0, Math.min(100, T.burnedPctSupply)) + '%';
    }, 400);
  }
  if (T.lastBurnTx) {
    var bt = $('#burnTx');
    bt.href = 'https://solscan.io/tx/' + T.lastBurnTx;
    bt.hidden = false;
  }

  /* ── Flywheel ───────────────────────────────────────────────────────────── */
  var stepsEl = $('#steps'), nodesEl = $('#wheelNodes');
  C.flywheel.forEach(function (s, i) {
    var li = document.createElement('li');
    li.className = 'step';
    li.innerHTML = '<div class="step-k">' + esc(s.k) + '</div>' +
      '<div><h3>' + esc(s.title) + '</h3><p>' + esc(s.body) + '</p></div>';
    stepsEl.appendChild(li);

    /* place the node on the circle, starting at 12 o'clock */
    var a = (i / C.flywheel.length) * Math.PI * 2 - Math.PI / 2;
    var n = document.createElement('div');
    n.className = 'wnode';
    n.style.left = (50 + Math.cos(a) * 40) + '%';
    n.style.top = (50 + Math.sin(a) * 40) + '%';
    n.textContent = s.k;
    nodesEl.appendChild(n);
  });

  var stepEls = $$('.step', stepsEl), nodeEls = $$('.wnode', nodesEl);

  /* highlight whichever step is nearest the middle of the viewport */
  function syncWheel() {
    var mid = window.innerHeight * 0.45, best = -1, bestD = Infinity;
    stepEls.forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      var d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    });
    stepEls.forEach(function (el, i) { el.classList.toggle('on', i === best); });
    nodeEls.forEach(function (el, i) { el.classList.toggle('on', i === best); });
  }

  /* ── Capability cards ───────────────────────────────────────────────────── */
  var ICONS = {
    signal:  '<path d="M3 17l5-6 4 4 4-7 5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    cluster: '<circle cx="6" cy="7" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="8" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8.5l7.5 .5M7.5 9.5l3.5 6M16.5 10.5l-3 5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    wave:    '<path d="M2 12c3-6 5 6 8 0s5 6 8 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    shield:  '<path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2.2 2.2L15.5 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    chart:   '<path d="M4 20V9M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    bolt:    '<path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
  };
  var capsEl = $('#caps');
  C.capabilities.forEach(function (c) {
    var d = document.createElement('article');
    d.className = 'card reveal';
    d.innerHTML = '<div class="card-ico"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      (ICONS[c.icon] || ICONS.signal) + '</svg></div>' +
      '<h3>' + esc(c.title) + '</h3><p>' + esc(c.body) + '</p>';
    capsEl.appendChild(d);
  });

  /* ── Callouts ───────────────────────────────────────────────────────────── */
  var listEl = $('#calloutList'), termState = $('#termState');
  if (C.callouts.sample) {
    termState.textContent = 'sample data';
    termState.classList.add('sample');
  }
  C.callouts.items.forEach(function (c) {
    var row = document.createElement('div');
    row.className = 'callout';
    row.innerHTML =
      '<span class="co-tick">$' + esc(c.ticker) + '</span>' +
      '<span class="co-note">' + esc(c.note) + '</span>' +
      '<span class="co-at">' + esc(c.at) + '</span>' +
      '<span class="co-status ' + esc(c.status) + '">' + esc(c.status) + '</span>';
    listEl.appendChild(row);
  });

  /* typed prompt line */
  var typeTarget = $('#termType');
  var TYPED = C.callouts.sample
    ? 'pumpxbt callouts --tail   # awaiting live feed'
    : 'pumpxbt callouts --tail';
  if (reduce) {
    typeTarget.textContent = TYPED;
  } else {
    var ti = 0;
    (function type() {
      typeTarget.textContent = TYPED.slice(0, ti++);
      if (ti <= TYPED.length) setTimeout(type, 34);
    })();
  }

  /* ── Roadmap ────────────────────────────────────────────────────────────── */
  var roadEl = $('#road');
  C.roadmap.forEach(function (r) {
    var d = document.createElement('article');
    d.className = 'rd reveal ' + r.state;
    d.innerHTML = '<div class="rd-phase">' +
      (r.state === 'live' ? '<span class="live-dot"></span>' : '') + esc(r.phase) + '</div>' +
      '<h3>' + esc(r.title) + '</h3><p>' + esc(r.body) + '</p>';
    roadEl.appendChild(d);
  });

  /* ── FAQ ────────────────────────────────────────────────────────────────── */
  var faqEl = $('#faqList');
  C.faq.forEach(function (f) {
    var d = document.createElement('details');
    d.className = 'qa';
    d.innerHTML = '<summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p>';
    faqEl.appendChild(d);
  });

  /* ── Ticker ─────────────────────────────────────────────────────────────── */
  function renderTicker(m) {
    var items = [
      ['PUMPXBT', m ? price(m.price) : DASH, ''],
      ['24H', m ? pct(m.change) : DASH, m && m.change >= 0 ? 'up' : (m ? 'down' : '')],
      ['MCAP', m ? usd(m.mcap) : DASH, ''],
      ['LIQ', m ? usd(m.liq) : DASH, ''],
      ['VOL 24H', m ? usd(m.vol) : DASH, ''],
      ['TREASURY', usd(T.valueUsd), ''],
      ['BURNED', count(T.burnedTokens), ''],
      ['AGENT', 'ONLINE', 'up']
    ];
    var html = items.map(function (i) {
      return '<span>' + i[0] + ' <b class="' + i[2] + '">' + i[1] + '</b></span>';
    }).join('');
    /* duplicated so the -50% marquee loops seamlessly */
    $('#tickerTrack').innerHTML = html + html;
  }
  renderTicker(null);

  /* ── Live market data ───────────────────────────────────────────────────
   * Dexscreener's public token endpoint, client-side. If there is no address
   * configured, or the request fails, every field stays as an em dash and the
   * note under the hero stats says why. */
  function setField(name, text, dir) {
    $$('[data-field="' + name + '"]').forEach(function (el) {
      el.textContent = text;
      el.classList.remove('up', 'down');
      if (dir) el.classList.add(dir);
    });
  }

  function loadMarket() {
    if (!C.liveData || !addr) return;
    $('#feedNote').textContent = 'Loading live market data…';

    fetch('https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(addr))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); })
      .then(function (j) {
        var pairs = (j && j.pairs) || [];
        if (!pairs.length) throw new Error('no pairs');
        /* deepest liquidity pool is the reference market */
        pairs.sort(function (a, b) {
          return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0);
        });
        var p = pairs[0];
        var m = {
          price: parseFloat(p.priceUsd),
          change: p.priceChange ? parseFloat(p.priceChange.h24) : null,
          mcap: p.marketCap || p.fdv || null,
          liq: p.liquidity ? p.liquidity.usd : null,
          vol: p.volume ? p.volume.h24 : null
        };
        var dir = m.change >= 0 ? 'up' : 'down';
        setField('price', price(m.price));
        setField('change', pct(m.change), dir);
        setField('changeChip', pct(m.change), dir);
        setField('mcap', usd(m.mcap));
        setField('liq', usd(m.liq));
        renderTicker(m);

        $('#feedNote').textContent = 'Live via Dexscreener · updated ' +
          new Date().toLocaleTimeString();
      })
      .catch(function () {
        $('#feedNote').textContent = 'Live market data unavailable right now.';
      });
  }

  loadMarket();
  if (C.liveData && addr) setInterval(loadMarket, 60000);

  /* ── Hero sparkline ─────────────────────────────────────────────────────
   * Decorative only — a deterministic drifting curve, never presented as
   * price history. Redrawn once; no data is implied. */
  (function spark() {
    var W = 600, H = 140, N = 60, seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var pts = [], y = H * 0.72;
    for (var i = 0; i <= N; i++) {
      y += (rnd() - 0.42) * 11;
      y = Math.max(16, Math.min(H - 10, y - i * 0.28));
      pts.push([(i / N) * W, y]);
    }
    var d = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }).join(' ');
    var line = $('#sparkLine'), area = $('#sparkArea');
    if (line) line.setAttribute('d', d);
    if (area) area.setAttribute('d', d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z');
  })();

  /* ── Scroll behaviour ───────────────────────────────────────────────────── */
  var nav = $('#nav');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      nav.classList.toggle('stuck', window.pageYOffset > 8);
      syncWheel();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', syncWheel);

  /* reveal on enter */
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal').forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 4, 3) * 60 + 'ms';
      io.observe(el);
    });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  /* mobile menu */
  var burger = $('#burger'), links = $('.nav-links');
  burger.addEventListener('click', function () {
    var open = links.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
  });
  $$('.nav-links a').forEach(function (a) {
    a.addEventListener('click', function () {
      links.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
    });
  });

  syncWheel();
})();
