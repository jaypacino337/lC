/* ============================================================================
   HOLDCO — reusable render components.

   Pure functions: data in, HTML string out. app.js mounts them; data.js feeds
   them. When live data arrives (Supabase / onchain), swap the data source and
   every surface re-renders from the same components.

   Honesty is enforced here, not left to the data:
   - money(null)  -> "—"   (unknown is never displayed as zero)
   - money(0)     -> "$0"  (zero is a real, honest number)
   - positive figures get the green .pos class; zero and unknown never do
   ========================================================================== */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var sign = n < 0 ? '−' : '';
    var a = Math.abs(n);
    var s;
    if (a >= 1e9) s = '$' + (a / 1e9).toFixed(2) + 'B';
    else if (a >= 1e6) s = '$' + (a / 1e6).toFixed(2) + 'M';
    else if (a >= 1e4) s = '$' + Math.round(a).toLocaleString('en-US');
    else s = '$' + a.toLocaleString('en-US');
    return sign + s;
  }

  function figClass(n) { return n > 0 ? 'fig pos' : 'fig'; }

  function dateStr(iso) {
    if (!iso) return '—';
    var d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  /* ── status badge ──────────────────────────────────────────────────────── */
  function badge(status) {
    var s = String(status || '').toUpperCase();
    var cls = s === 'LIVE' ? 'live' : s === 'BETA' ? 'beta' : 'planned';
    var dot = (s === 'LIVE' || s === 'BETA') ? '<i></i>' : '';
    return '<span class="badge ' + cls + '">' + dot + esc(s || 'PLANNED') + '</span>';
  }

  /* ── stat card (hero row + financial grid) ─────────────────────────────── */
  function statCard(label, value, opts) {
    var o = opts || {};
    var display, cls = 'fig';
    if (o.text) {                      // non-numeric stat, e.g. APPLICATIONS: OPEN
      display = esc(o.text);
      cls = o.textClass || '';
    } else if (o.count) {              // integer count, zero-padded like a register
      display = String(value ?? 0).padStart(2, '0');
    } else {
      display = money(value);
      cls = figClass(value);
    }
    return '<div class="stat rv"><dt class="lbl">' + esc(label) + '</dt>' +
      '<dd class="' + cls + '" data-count="' + (o.count ? (value ?? 0) : '') + '">' + display + '</dd>' +
      (o.sub ? '<div class="sub">' + esc(o.sub) + '</div>' : '') + '</div>';
  }

  function finCell(label, value) {
    return '<div class="fin-cell rv"><dt class="lbl">' + esc(label) + '</dt>' +
      '<dd class="' + figClass(value) + '">' + money(value) + '</dd></div>';
  }

  /* ── subsidiary card ───────────────────────────────────────────────────── */
  function subsidiaryCard(c) {
    return '<article class="co-card rv">' +
      '<div class="co-card-top"><h3>' + esc(c.name) + '</h3>' + badge(c.status) + '</div>' +
      '<p class="blurb">' + esc(c.blurb) + '</p>' +
      '<div class="co-meta">' +
        '<div><span class="lbl">Status</span><span class="val">' + esc(c.status) + '</span></div>' +
        '<div><span class="lbl">Category</span><span class="val">' + esc(c.category) + '</span></div>' +
        '<div><span class="lbl">Revenue</span><span class="val ' + figClass(c.revenueUsd) + '">' + money(c.revenueUsd) + '</span></div>' +
        '<div><span class="lbl">Launch date</span><span class="val">' + dateStr(c.launch) + '</span></div>' +
      '</div></article>';
  }

  /* ── financial allocation table ────────────────────────────────────────── */
  function financialTable(rows) {
    var head = '<thead><tr>' +
      '<th>Date</th><th>Company</th><th>Type</th>' +
      '<th class="amount">Amount</th><th>Transaction</th></tr></thead>';

    if (!rows || !rows.length) {
      return '<table class="fintable">' + head + '</table>' +
        '<div class="table-empty">No financial activity recorded yet.</div>';
    }
    var body = rows.map(function (r) {
      return '<tr class="rv"><td>' + esc(dateStr(r.date)) + '</td>' +
        '<td>' + esc(r.company) + '</td>' +
        '<td>' + esc(r.type) + '</td>' +
        '<td class="amount ' + figClass(r.amountUsd) + '">' + money(r.amountUsd) + '</td>' +
        '<td>' + (r.tx
          ? '<a href="' + esc(r.tx) + '" target="_blank" rel="noopener">View ↗</a>'
          : '—') + '</td></tr>';
    }).join('');
    return '<table class="fintable">' + head + '<tbody>' + body + '</tbody></table>';
  }

  /* ── agenda row ────────────────────────────────────────────────────────── */
  function agendaRow(a) {
    return '<div class="agenda-row rv">' +
      '<span class="id">' + esc(a.id) + '</span>' +
      '<span class="t">' + esc(a.title) + '</span>' +
      badge(a.status) + '</div>';
  }

  /* ── roadmap row ───────────────────────────────────────────────────────── */
  function roadmapRow(r) {
    return '<div class="road-row rv">' +
      '<span class="n">' + esc(r.n) + '</span>' +
      '<span class="t">' + esc(r.title) + '</span>' +
      '<span class="b">' + esc(r.body) + '</span>' +
      badge(r.status) + '</div>';
  }

  /* ── utility row ───────────────────────────────────────────────────────── */
  function utilityRow(u) {
    return '<div class="u-row rv"><h3>' + esc(u.title) + '</h3><p>' + esc(u.body) + '</p></div>';
  }

  global.HC = {
    esc: esc, money: money, dateStr: dateStr,
    badge: badge, statCard: statCard, finCell: finCell,
    subsidiaryCard: subsidiaryCard, financialTable: financialTable,
    agendaRow: agendaRow, roadmapRow: roadmapRow, utilityRow: utilityRow
  };
})(window);
