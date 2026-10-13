/* PumpXBT — live data layer shared by the landing page and the terminal.
 * Three sources, all public and documented; a missing value is "—", never a
 * guess. Exposes window.PXF. */
(function () {
  'use strict';

  var DASH = '—';
  var C = window.PXBT || {};
  var WSOL = 'So11111111111111111111111111111111111111112';
  /* pump.fun curves start at 1.073B virtual tokens, and 793.1M of them are sold
   * along the curve. Both are protocol constants, used only to turn a launch
   * event's own reserves into curve progress. */
  var V_TOKENS_0 = 1073000000, REAL_TOKENS_0 = 793100000;

  /* ── formatting (mono, tabular, compact) ─────────────────────────────── */
  function ok(n) { return n !== null && n !== undefined && isFinite(n); }
  var F = {
    usd: function (n, dp) {
      if (!ok(n)) return DASH;
      var s = n < 0 ? '-' : '', a = Math.abs(n);
      if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
      if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
      if (a >= 1e4) return s + '$' + (a / 1e3).toFixed(1) + 'K';
      return s + '$' + a.toFixed(dp === undefined ? 2 : dp);
    },
    price: function (n) {
      if (!ok(n)) return DASH;
      if (n >= 1) return '$' + n.toFixed(3);
      if (n >= 0.001) return '$' + n.toFixed(5);
      var e = Math.floor(Math.log10(n));      // 0.0₅3403 style for micro prices
      var zeros = -e - 1;
      var sig = Math.round(n * Math.pow(10, -e + 3));
      return '$0.0' + String(zeros).replace(/\d/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }) + sig;
    },
    pct: function (n) { return ok(n) ? (n >= 0 ? '+' : '') + n.toFixed(2) + '%' : DASH; },
    sol: function (n, dp) { return ok(n) ? n.toFixed(dp === undefined ? 3 : dp) + ' SOL' : DASH; },
    num: function (n) {
      if (!ok(n)) return DASH;
      var a = Math.abs(n);
      if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
      if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
      if (a >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return String(Math.round(n));
    },
    ago: function (ms) {
      if (!ms) return DASH;
      var t = typeof ms === 'string' ? Date.parse(ms) : ms;
      if (!isFinite(t)) return DASH;
      var d = Math.max(0, Date.now() - t);
      if (d < 60e3) return Math.round(d / 1e3) + 's';
      if (d < 3600e3) return Math.round(d / 60e3) + 'm';
      if (d < 86400e3) return Math.round(d / 3600e3) + 'h';
      return Math.round(d / 86400e3) + 'd';
    },
    clock: function (ms) {
      var d = new Date(ms);
      return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (x) { return (x < 10 ? '0' : '') + x; }).join(':');
    },
    short: function (a) { return a && a.length > 10 ? a.slice(0, 4) + '…' + a.slice(-4) : (a || DASH); },
    esc: function (s) {
      return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
  };

  function getJson(url, timeoutMs) {
    var ac = 'AbortController' in window ? new AbortController() : null;
    var t = ac && setTimeout(function () { ac.abort(); }, timeoutMs || 9000);
    return fetch(url, ac ? { signal: ac.signal } : {}).then(function (r) {
      if (t) clearTimeout(t);
      return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status));
    }, function (e) { if (t) clearTimeout(t); throw e; });
  }

  /* ── DexScreener ─────────────────────────────────────────────────────── */
  function bestPair(pairs, mint) {
    var best = null;
    (pairs || []).forEach(function (p) {
      if (!p || !p.baseToken || p.baseToken.address !== mint) return;
      if (!best || ((p.liquidity && p.liquidity.usd) || 0) > ((best.liquidity && best.liquidity.usd) || 0)) best = p;
    });
    return best;
  }

  function quotes(mints) {
    if (!mints.length) return Promise.resolve({});
    return getJson('https://api.dexscreener.com/tokens/v1/solana/' + mints.map(encodeURIComponent).join(','))
      .then(function (pairs) {
        var out = {};
        mints.forEach(function (m) {
          var p = bestPair(pairs, m);
          out[m] = p ? {
            price: parseFloat(p.priceUsd),
            change: p.priceChange ? parseFloat(p.priceChange.h24) : null,
            mcap: p.marketCap || p.fdv || null,
            liq: p.liquidity ? p.liquidity.usd : null,
            vol24: p.volume ? p.volume.h24 : null,
            txns24: p.txns && p.txns.h24 ? (p.txns.h24.buys || 0) + (p.txns.h24.sells || 0) : null,
            dex: p.dexId, url: p.url
          } : null;
        });
        return out;
      });
  }

  /* ── PumpPortal launch stream (free: subscribeNewToken + subscribeMigration) ── */
  function launches(onEvent, onStatus) {
    var ws, stopped = false, backoff = 2000;
    function status(s) { if (onStatus) onStatus(s); }
    function connect() {
      if (stopped) return;
      status('connecting');
      try { ws = new WebSocket('wss://pumpportal.fun/api/data'); }
      catch (e) { status('offline'); return; }
      ws.onopen = function () {
        backoff = 2000;
        status('live');
        ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
        ws.send(JSON.stringify({ method: 'subscribeMigration' }));
      };
      ws.onmessage = function (e) {
        var m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (!m || !m.mint) return;
        if (m.txType === 'create') {
          var vTok = +m.vTokensInBondingCurve;
          onEvent({
            kind: 'create', at: Date.now(), mint: m.mint, symbol: m.symbol || '', name: m.name || '',
            mcapSol: +m.marketCapSol, devSol: +m.solAmount || 0, creator: m.traderPublicKey,
            progress: isFinite(vTok) ? Math.max(0, Math.min(1, (V_TOKENS_0 - vTok) / REAL_TOKENS_0)) : null
          });
        } else if (m.txType === 'migrate') {
          onEvent({ kind: 'migrate', at: Date.now(), mint: m.mint, pool: m.pool });
        }
      };
      ws.onclose = function () {
        if (stopped) return;
        status('offline');
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 60000);
      };
      ws.onerror = function () { /* onclose follows and handles the retry */ };
    }
    connect();
    return { stop: function () { stopped = true; if (ws) ws.close(); } };
  }

  /* ── PumpXBT ledger API (the bot) ────────────────────────────────────── */
  var api = (C.ledgerApi || '').replace(/\/$/, '');
  function ledger(path) {
    return api ? getJson(api + path, 10000) : Promise.reject(new Error('ledger api not configured'));
  }

  /* ── small DOM helpers ───────────────────────────────────────────────── */
  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  /** Set text; flash the element when the value actually changes. */
  function put(el, text, cls) {
    if (typeof el === 'string') el = $(el);
    if (!el) return;
    var changed = el.textContent !== text;
    el.textContent = text;
    el.classList.remove('up', 'down');
    if (cls) el.classList.add(cls);
    el.classList.toggle('is-dash', text === DASH);
    if (changed && text !== DASH && el.dataset.seen) {
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }
    el.dataset.seen = '1';
  }
  function led(name, cls) {
    $$('[data-led="' + name + '"]').forEach(function (el) { el.className = 'led ' + (cls || ''); });
  }

  /* ── launch board: tape + grid + session stats, shared by both pages ──
   * Expects #tape, #launchGrid, #launchEmpty, #launchState, #launchCount and
   * optionally #sRate/#sMig/#sDev/#sZero/#sTop. A creator column is rendered
   * when the grid's header has 7 columns. */
  function launchBoard(opts) {
    var L = { creates: [], migs: 0, first: 0, tapeDirty: false };
    var getSol = opts.sol;
    var grid = $('#launchGrid');
    var creatorCol = grid && grid.tHead.rows[0].cells.length > 6;

    function mcapText(e) {
      var s = getSol();
      return s && isFinite(e.mcapSol) ? F.usd(e.mcapSol * s, 0) : F.sol(e.mcapSol, 1);
    }

    function paintRow(e) {
      var tb = grid.tBodies[0];
      $('#launchEmpty').hidden = true;
      var tr = document.createElement('tr');
      tr.className = 'new';
      var link = '<a href="https://pump.fun/coin/' + encodeURIComponent(e.mint) + '" target="_blank" rel="noopener">';
      var html;
      if (e.kind === 'migrate') {
        html = '<td>' + F.clock(e.at) + '</td><td class="sym">' + link + F.esc(F.short(e.mint)) + '</a></td><td class="hide-sm"><span class="chip chip-paper">graduated → ' +
          F.esc(e.pool || 'amm') + '</span></td><td class="r">' + DASH + '</td><td class="r hide-sm">' + DASH + '</td><td class="r">100%</td>';
      } else {
        var pct = e.progress === null ? null : e.progress * 100;
        html = '<td>' + F.clock(e.at) + '</td><td class="sym">' + link + '$' + F.esc(e.symbol.slice(0, 12) || '?') + '</a></td><td class="hide-sm">' +
          F.esc(e.name.slice(0, 28)) + '</td><td class="r">' + mcapText(e) + '</td><td class="r hide-sm">' +
          (e.devSol > 0 ? F.sol(e.devSol, 2) : '<span class="rail-dim">none</span>') +
          '</td><td class="r"><span class="bar"><i style="width:' + (pct === null ? 0 : Math.max(2, pct)).toFixed(1) + '%"></i></span>' +
          (pct === null ? DASH : pct.toFixed(1) + '%') + '</td>';
      }
      if (creatorCol) html += '<td class="hide-sm">' + (e.creator ? '<a href="https://solscan.io/account/' + encodeURIComponent(e.creator) + '" target="_blank" rel="noopener">' + F.esc(F.short(e.creator)) + '</a>' : DASH) + '</td>';
      tr.innerHTML = html;
      tb.insertBefore(tr, tb.firstChild);
      while (tb.children.length > (opts.rows || 40)) tb.removeChild(tb.lastChild);
    }

    function stats() {
      var cs = L.creates.filter(function (e) { return e.kind === 'create'; });
      put('#launchCount', cs.length + ' seen');
      if (!$('#sRate')) return;
      var mins = (Date.now() - L.first) / 60000;
      put('#sRate', L.first && mins > 0.25 ? (cs.length / mins).toFixed(1) : DASH);
      put('#sMig', String(L.migs));
      var devs = cs.map(function (e) { return e.devSol; }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
      put('#sDev', devs.length ? F.sol(devs[Math.floor(devs.length / 2)], 2) : DASH);
      put('#sZero', cs.length ? Math.round(100 * (cs.length - devs.length) / cs.length) + '%' : DASH);
      var top = cs.reduce(function (b, e) { return !b || e.mcapSol > b.mcapSol ? e : b; }, null);
      put('#sTop', top ? '$' + top.symbol.slice(0, 10) + ' ' + mcapText(top) : DASH);
    }

    function paintTape() {
      if (!L.tapeDirty) return;
      L.tapeDirty = false;
      var items = L.creates.slice(0, 24).map(function (e) {
        if (e.kind === 'migrate') return '<span class="tape-item"><span class="mig">GRAD</span><b>' + F.esc(F.short(e.mint)) + '</b></span>';
        return '<span class="tape-item"><b>$' + F.esc(e.symbol.slice(0, 12) || '?') + '</b><span>' + mcapText(e) + '</span>' +
          (e.devSol > 0 ? '<span class="rail-dim">dev ' + e.devSol.toFixed(2) + '</span>' : '') + '</span>';
      }).join('');
      if (items) $('#tape').innerHTML = items + items;   // doubled for a seamless loop
    }

    function onEvent(e) {
      if (e.kind === 'migrate') L.migs++;
      else if (!L.first) L.first = Date.now();
      L.creates.unshift(e);
      if (L.creates.length > 300) L.creates.length = 300;
      L.tapeDirty = true;
      paintRow(e);
      stats();
      if (L.creates.length === 1) paintTape();
    }

    if ((C.feeds && C.feeds.launches === false) || !('WebSocket' in window)) {
      put('#launchState', 'off');
      $('#launchEmpty').textContent = 'Live launch feed is turned off.';
      return;
    }
    launches(onEvent, function (s) {
      put('#launchState', s);
      led('launches', s === 'live' ? 'on' : s === 'connecting' ? 'warn' : 'off');
      if (s === 'offline' && !L.creates.length) $('#launchEmpty').textContent = 'Launch stream unreachable. Retrying…';
    });
    setInterval(paintTape, 4000);
    setInterval(stats, 15000);
  }

  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.PXF = {
    DASH: DASH, WSOL: WSOL, F: F, quotes: quotes, launches: launches,
    ledger: ledger, hasLedger: !!api, $: $, $$: $$, put: put, led: led, launchBoard: launchBoard, reduced: reduced
  };
})();
