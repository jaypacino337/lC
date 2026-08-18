/* PumpXBT Terminal — free preview.
 * Reads the same config as the main site: market data via Dexscreener once a
 * contract address exists, everything else from the bot's read-only ledger API.
 * Nothing is ever invented: a missing feed renders as an awaiting state, and
 * paper-mode figures are labelled as simulated everywhere they appear. */
(function () {
  'use strict';

  var C = window.PXBT;
  var $ = function (s) { return document.querySelector(s); };
  var DASH = '—';

  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return DASH;
    var s = n < 0 ? '-' : '', a = Math.abs(n);
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'K';
    return s + '$' + a.toFixed(2);
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
  function ago(ms) {
    if (!ms) return DASH;
    var d = Date.now() - ms;
    if (d < 90e3) return 'just now';
    if (d < 3600e3) return Math.round(d / 60e3) + 'm ago';
    if (d < 86400e3) return Math.round(d / 3600e3) + 'h ago';
    return Math.round(d / 86400e3) + 'd ago';
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function shortMint(m) {
    return m && m.length > 10 ? m.slice(0, 4) + '…' + m.slice(-4) : (m || DASH);
  }
  function set(sel, text, cls) {
    var el = $(sel); if (!el) return;
    el.textContent = text;
    el.classList.remove('up', 'down');
    if (cls) el.classList.add(cls);
  }

  /* ── market strip (Dexscreener) ─────────────────────────────────────────── */
  function loadMarket() {
    var addr = (C.token.address || '').trim();
    if (!addr) return;
    fetch('https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(addr))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) {
        var pairs = (j && j.pairs) || [];
        if (!pairs.length) return;
        pairs.sort(function (a, b) {
          return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0);
        });
        var p = pairs[0];
        var ch = p.priceChange ? parseFloat(p.priceChange.h24) : null;
        set('[data-t="price"]', price(parseFloat(p.priceUsd)));
        set('[data-t="change"]', pct(ch), ch >= 0 ? 'up' : 'down');
        set('[data-t="mcap"]', usd(p.marketCap || p.fdv || null));
        set('[data-t="liq"]', usd(p.liquidity ? p.liquidity.usd : null));
      })
      .catch(function () {});
  }

  /* ── ledger feed ────────────────────────────────────────────────────────── */
  var api = (C.ledgerApi || '').replace(/\/$/, '');

  function get(path) {
    return fetch(api + path).then(function (r) {
      return r.ok ? r.json() : Promise.reject(new Error(r.status));
    });
  }

  function renderRows(tableSel, emptySel, rows, render) {
    var tbody = $(tableSel + ' tbody'), empty = $(emptySel);
    if (!rows || !rows.length) { tbody.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    tbody.innerHTML = rows.map(render).join('');
  }

  function badge(status) {
    return '<span class="tt-badge ' + esc(status) + '">' + esc(status) + '</span>';
  }

  function loadFeed() {
    if (!api) {
      $('#modeChip').textContent = 'feed offline';
      $('#modeChip').className = 'tnav-mode off';
      return;
    }

    get('/api/state').then(function (s) {
      var chip = $('#modeChip');
      chip.textContent = s.paper ? 'paper mode' : 'live';
      chip.className = 'tnav-mode ' + (s.paper ? 'paper' : 'live');
      $('#tdisclaimer').hidden = false;

      var totals = s.totals || {};
      set('#sumPnl', usd(s.portfolio && s.portfolio.realisedUsd),
        (s.portfolio && s.portfolio.realisedUsd >= 0) ? 'up' : 'down');
      $('#sumPnlNote').textContent = s.paper ? 'paper — simulated' : 'realised';
      set('#sumBuyback', totals.buyback ? usd(Math.abs(totals.buyback)) : DASH);
      set('#sumBurn', totals.burn ? usd(Math.abs(totals.burn)) : DASH);

      if (s.regime) {
        var label = { risk_on: 'RISK ON', neutral: 'NEUTRAL', risk_off: 'RISK OFF' }[s.regime.regime] || DASH;
        set('[data-t="regime"]', label,
          s.regime.regime === 'risk_on' ? 'up' : s.regime.regime === 'risk_off' ? 'down' : null);
      }
      if (s.learning && s.learning.winRate !== null && s.learning.winRate !== undefined) {
        set('[data-t="winrate"]', Math.round(s.learning.winRate * 100) + '%' +
          (s.paper ? ' (sim)' : ''));
      }
      $('#updated').textContent = 'updated ' + new Date().toLocaleTimeString();
    }).catch(function () {
      $('#modeChip').textContent = 'feed unreachable';
      $('#modeChip').className = 'tnav-mode off';
    });

    get('/api/callouts').then(function (j) {
      var rows = (j.ours || []).slice(0, 40);
      $('#calloutsNote').textContent = rows.length + ' recorded';
      renderRows('#calloutsTable', '#calloutsEmpty', rows, function (c) {
        return '<tr>' +
          '<td class="tt-sym">' + esc(shortMint(c.mint)) + '</td>' +
          '<td class="tt-text">' + esc(c.text) + '</td>' +
          '<td>' + (c.score !== null && c.score !== undefined ? Math.round(c.score * 100) + '/100' : DASH) + '</td>' +
          '<td>' + ago(c.created_at) + '</td>' +
          '<td>' + badge(c.status) + '</td></tr>';
      });
    }).catch(function () {});

    get('/api/positions').then(function (j) {
      var open = (j.open || []).map(function (p) { return { ...p, _open: true }; });
      var closed = (j.closed || []).slice(0, 25);
      var rows = open.concat(closed);
      $('#tradesNote').textContent = open.length + ' open · ' + closed.length + ' closed shown';
      renderRows('#tradesTable', '#tradesEmpty', rows, function (p) {
        var isOpen = p._open;
        var pnl = isOpen ? p.unrealisedUsd : p.realised_usd;
        var pnlCls = pnl > 0 ? 'tt-up' : pnl < 0 ? 'tt-down' : '';
        var status = isOpen ? (p.status || 'open')
          : (p.realised_usd > 0 ? 'closed-win' : 'loss');
        return '<tr>' +
          '<td class="tt-sym">' + esc(shortMint(p.mint)) + '</td>' +
          '<td>' + esc(p.kind || DASH) + '</td>' +
          '<td>' + usd(isOpen ? p.costUsd : p.cost_usd) + '</td>' +
          '<td>' + price(isOpen ? p.entryPrice : p.entry_price) + '</td>' +
          '<td>' + price(isOpen ? p.price : p.exit_price) + '</td>' +
          '<td class="' + pnlCls + '">' + usd(pnl) + '</td>' +
          '<td>' + badge(status) + '</td></tr>';
      });
    }).catch(function () {});

    get('/api/ledger').then(function (j) {
      var rows = (j.entries || []).filter(function (e) {
        return e.kind === 'fee_claim' || e.kind === 'buyback' || e.kind === 'burn' || e.kind === 'reward';
      }).slice(0, 40);
      var fees = (j.totals || []).find(function (t) { return t.kind === 'fee_claim'; });
      set('#sumFees', fees ? usd(fees.total) : DASH);
      renderRows('#ledgerTable', '#ledgerEmpty', rows, function (e) {
        return '<tr>' +
          '<td>' + ago(e.at) + '</td>' +
          '<td>' + badge(e.kind.replace('_', ' ')) + '</td>' +
          '<td>' + usd(e.usd) + '</td>' +
          '<td class="tt-text">' + esc(e.note || (e.ref ? e.ref.slice(0, 16) + '…' : '')) + '</td></tr>';
      });
    }).catch(function () {});
  }

  loadMarket();
  loadFeed();
  setInterval(loadMarket, 60000);
  setInterval(loadFeed, 30000);
})();
