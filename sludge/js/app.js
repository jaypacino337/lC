/* SLUDGE — page wiring: links, loop, brewer + launch kit, live narratives, scorer. */
(function () {
  'use strict';

  var C = window.SLUDGE, B = window.BREWER;
  var $ = function (s) { return document.querySelector(s); };
  var API = (C.api || '/api/sludge').replace(/\/$/, '');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getJSON(path) {
    return fetch(API + path, { headers: { accept: 'application/json' } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  function usd(v) {
    if (v == null) return '—';
    var a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function age(h) {
    if (h == null) return '—';
    if (h < 1) return Math.round(h * 60) + 'm';
    if (h < 48) return Math.round(h) + 'h';
    return Math.round(h / 24) + 'd';
  }
  function ratio(x) { return x == null ? '—' : (x >= 10 ? Math.round(x) : x.toFixed(1)) + '×'; }
  function clock(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  var toastT;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, 1800);
  }
  function copy(text, label) {
    var done = function () { toast((label || 'Copied') + ' ✓'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed — select it by hand'); }
      document.body.removeChild(ta);
    }
  }

  /* ── links, year, token state ─────────────────────────────────────────── */
  document.querySelectorAll('[data-link]').forEach(function (a) {
    var url = C.links[a.getAttribute('data-link')];
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.hidden = false; }
  });
  $('#year').textContent = new Date().getFullYear();

  var ca = C.token.address;
  if (ca) {
    var pill = $('#caPill');
    pill.disabled = false;
    pill.textContent = 'CA ' + ca.slice(0, 4) + '…' + ca.slice(-4);
    pill.title = 'Copy contract address';
    pill.addEventListener('click', function () { copy(ca, 'Contract address copied'); });
    var buy = $('#buyBtn');
    buy.textContent = 'BUY $' + C.token.symbol;
    if (!C.links.buy) { buy.href = 'https://pump.fun/coin/' + ca; buy.target = '_blank'; buy.rel = 'noopener'; }
    $('#tokenStatus').textContent = '$' + C.token.symbol + ' contract: ' + ca;
  }
  if (C.stage === 'live' && ca) $('#hazardBar').hidden = true;

  /* ── the loop ─────────────────────────────────────────────────────────── */
  $('#loopGrid').innerHTML = C.loop.map(function (s, i) {
    var st = (s.status || 'PLANNED').toUpperCase();
    return '<div class="loop-card"><div class="loop-top"><span class="n">STEP 0' + (i + 1) + '</span>' +
      '<span class="badge badge-' + st.toLowerCase() + '">' + esc(st) + '</span></div>' +
      '<h3>' + esc(s.k) + '</h3><p>' + esc(s.body) + '</p></div>';
  }).join('');

  /* ── brewer state ─────────────────────────────────────────────────────── */
  var input = $('#brewInput'), out = $('#brewOut');
  var againBtn = $('#againBtn');
  var lastPrompt = '', nonce = 0, lastSeed = null, current = null;

  /* ── live narratives (CRAWL + DISTILL) ────────────────────────────────── */
  var narratives = [], narrMeta = null;
  var narrReady = getJSON('/crawl').then(function (j) {
    narratives = (j.narratives || []).filter(function (n) { return n.word; });
    narrMeta = j;
    if (!narratives.length) throw new Error('empty');
    $('#narrStatus').textContent = 'from ' + j.coinsRead + ' coins on pump.fun + DexScreener · ' + clock(j.generatedAt);
    $('#narrChips').innerHTML = narratives.slice(0, 10).map(function (n, i) {
      return '<button type="button" class="chip" data-i="' + i + '" title="in ' + n.count + ' coins: ' +
        esc(n.examples.join(', ')) + '">' + esc(n.word) + ' <span>' + n.count + '</span></button>';
    }).join('');
    $('#heroPulse').innerHTML = '<span class="dot"></span>RECURRING ON PUMP.FUN RIGHT NOW: <b>' +
      narratives.slice(0, 3).map(function (n) { return esc(n.word.toUpperCase()); }).join(' · ') + '</b>';
    $('#heroPulse').hidden = false;
  }).catch(function () {
    narratives = [];
    $('#narrStatus').textContent = 'live feed unavailable — brewing from the vat’s own word bank';
  });

  $('#narrChips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip');
    if (!b) return;
    var n = narratives[+b.getAttribute('data-i')];
    if (!n) return;
    input.value = n.word;
    lastPrompt = n.word; lastSeed = n; nonce = 0;
    show(B.brew(n.word, 0));
  });

  /* ── brewer + launch kit ──────────────────────────────────────────────── */
  function show(coin) {
    current = coin;
    $('#coinName').textContent = coin.name;
    $('#coinTicker').textContent = '$' + coin.ticker;
    $('#coinThesis').textContent = coin.thesis;
    $('#specimenTag').textContent = 'SPECIMEN #' + String(coin.seed % 10000).padStart(4, '0');
    if (lastSeed && narrMeta) {
      $('#coinSeed').innerHTML = '“' + esc(lastSeed.word) + '” — recurring in ' + lastSeed.count +
        ' different coins (' + esc(lastSeed.examples.join(', ')) + ') read at ' + esc(clock(narrMeta.generatedAt));
      $('#seedRow').hidden = false;
    } else $('#seedRow').hidden = true;
    B.drawBlob($('#blobCanvas'), coin.seed);

    out.hidden = true;                 // retrigger the plop animation
    void out.offsetWidth;
    out.hidden = false;
    againBtn.hidden = false;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('#brewBtn').addEventListener('click', function () {
    lastPrompt = input.value; nonce = 0; lastSeed = null;
    show(B.brew(lastPrompt, nonce));
  });
  $('#randomBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    narrReady.then(function () {
      btn.disabled = false;
      nonce = (Math.random() * 1e6) | 0;
      if (narratives.length) {
        /* weighted pick from the top live narratives */
        var pool = narratives.slice(0, 8), tot = 0, i;
        for (i = 0; i < pool.length; i++) tot += pool[i].weight;
        var x = Math.random() * tot;
        for (i = 0; i < pool.length - 1 && (x -= pool[i].weight) > 0; i++);
        lastSeed = pool[i];
        lastPrompt = lastSeed.word;
      } else { lastSeed = null; lastPrompt = ''; }
      input.value = lastPrompt;
      show(B.brew(lastPrompt, nonce));
    });
  });
  againBtn.addEventListener('click', function () {
    nonce++;
    show(B.brew(lastPrompt, nonce));
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#brewBtn').click(); }
  });

  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!current) return;
      var k = b.getAttribute('data-copy');
      if (k === 'name') copy(current.name, 'Name copied');
      else if (k === 'ticker') copy(current.ticker, 'Ticker copied');
      else if (k === 'thesis') copy(current.thesis, 'Description copied');
      else copy('Name: ' + current.name + '\nTicker: ' + current.ticker + '\nDescription: ' + current.thesis, 'Launch kit copied');
    });
  });
  $('#dlBtn').addEventListener('click', function () {
    if (!current) return;
    var name = current.ticker.toLowerCase();
    B.blobPNG(current.seed, function (blob) {
      if (!blob) return toast('Your browser refused to export the image');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sludge-' + name + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('Image saved');
    });
  });

  /* ── scorer ───────────────────────────────────────────────────────────── */
  var verdictClass = { KEEPS: 'v-keep', SIMMERING: 'v-simmer', DISSOLVES: 'v-dissolve', UNSCORED: 'v-simmer' };
  var boardRows = [], boardAt = null;

  function card(s) {
    var m = s.metrics || {};
    var parts = (s.parts || []).map(function (p) {
      var pct = p.max ? Math.max(0, p.points) / p.max * 100 : 0;
      var neg = p.points < 0;
      return '<li class="part' + (neg ? ' neg' : '') + '"><span class="pk">' + esc(p.k) + '</span>' +
        '<span class="bar"><i style="width:' + (neg ? 100 : pct.toFixed(0)) + '%"></i></span>' +
        '<span class="pp">' + (p.points > 0 ? '+' : '') + p.points + (p.max ? '/' + p.max : '') + '</span>' +
        '<span class="pd">' + esc(p.detail) + '</span></li>';
    }).join('');
    var flags = (s.flags || []).map(function (f) {
      return '<li class="flag flag-' + esc(f.level) + '">' + esc(f.text) + '</li>';
    }).join('');
    var links = [];
    if (s.pairUrl) links.push('<a href="' + esc(s.pairUrl) + '" target="_blank" rel="noopener">DexScreener ↗</a>');
    if (s.pumpUrl) links.push('<a href="' + esc(s.pumpUrl) + '" target="_blank" rel="noopener">pump.fun ↗</a>');
    var chg = m.priceChange24h;
    return '<div class="sc-top">' +
        '<div class="sc-dial ' + verdictClass[s.verdict] + '"><b>' + (s.score == null ? '—' : s.score) + '</b><span>/100</span></div>' +
        '<div class="sc-id"><strong>$' + esc(s.symbol) + '</strong><span class="sc-name">' + esc(s.name) + '</span>' +
        '<span class="verdict ' + verdictClass[s.verdict] + '">' + esc(s.verdict) + '</span>' +
        '<code class="mint" title="' + esc(s.mint) + '">' + esc(s.mint) + '</code></div>' +
        '<button class="sc-close" type="button" aria-label="Close breakdown">×</button>' +
      '</div>' +
      '<div class="sc-stats">' +
        '<div><span class="lbl">VOL 24H</span><b>' + usd(m.volume24h) + '</b></div>' +
        '<div><span class="lbl">LIQUIDITY</span><b>' + usd(m.liquidityUsd) + '</b></div>' +
        '<div><span class="lbl">MCAP</span><b>' + usd(m.marketCapUsd) + '</b></div>' +
        '<div><span class="lbl">MCAP/LIQ</span><b>' + ratio(m.mcapToLiq) + '</b></div>' +
        '<div><span class="lbl">AGE</span><b>' + age(m.ageHours) + '</b></div>' +
        '<div><span class="lbl">PRICE 24H</span><b>' + (chg == null ? '—' : (chg > 0 ? '+' : '') + chg + '%') + '</b></div>' +
      '</div>' +
      (flags ? '<ul class="flags">' + flags + '</ul>' : '') +
      '<ul class="parts">' + parts + '</ul>' +
      '<p class="sc-foot">' + links.join(' · ') + (links.length ? ' · ' : '') +
        'scored ' + esc(clock(s.generatedAt || boardAt)) + ' on its deepest pool (' + esc(s.dex || '?') + '). Not advice.</p>';
  }
  function showCard(s) {
    var el = $('#scoreCard');
    el.innerHTML = card(s);
    el.hidden = false;
    el.querySelector('.sc-close').addEventListener('click', function () { el.hidden = true; });
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('#scoreForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var mint = $('#mintInput').value.trim();
    var err = $('#scoreErr'), btn = $('#scoreBtn');
    err.hidden = true;
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      err.textContent = 'That doesn’t look like a Solana mint address (32–44 base58 characters).';
      err.hidden = false; return;
    }
    btn.disabled = true; btn.textContent = 'STIRRING…';
    getJSON('/score?mint=' + encodeURIComponent(mint)).then(showCard, function (x) {
      err.textContent = x.message || 'Scoring failed.';
      err.hidden = false;
    }).then(function () { btn.disabled = false; btn.textContent = 'SCORE IT'; });
  });

  /* ── the board ────────────────────────────────────────────────────────── */
  function loadBoard() {
    $('#boardMeta').textContent = 'loading…';
    getJSON('/board?limit=25').then(function (j) {
      boardRows = j.rows || []; boardAt = j.generatedAt;
      $('#boardMeta').textContent = j.scored + ' of ' + j.coinsRead + ' coins scored · ' + clock(j.generatedAt);
      if (!boardRows.length) throw new Error('No coins could be scored right now.');
      $('#boardEmpty').hidden = true;
      $('#boardRows').innerHTML = boardRows.map(function (r, i) {
        var m = r.metrics;
        var red = (r.flags || []).some(function (f) { return f.level === 'red'; });
        return '<tr tabindex="0" data-i="' + i + '">' +
          '<td class="dim">' + (i + 1) + '</td>' +
          '<td class="coin"><b>$' + esc(r.symbol) + '</b><small class="mint-s">' + esc(r.mint.slice(0, 4) + '…' + r.mint.slice(-4)) + '</small>' + (red ? ' <span class="redot" title="red flag">●</span>' : '') +
            (r.list === 'live' ? ' <span class="live">LIVE</span>' : '') + '</td>' +
          '<td class="num"><b>' + r.score + '</b></td>' +
          '<td><span class="verdict ' + verdictClass[r.verdict] + '">' + r.verdict + '</span></td>' +
          '<td class="num">' + usd(m.volume24h) + '</td>' +
          '<td class="num">' + usd(m.liquidityUsd) + '</td>' +
          '<td class="num">' + usd(m.marketCapUsd) + '</td>' +
          '<td class="num' + (m.mcapToLiq > 60 ? ' hot' : '') + '">' + ratio(m.mcapToLiq) + '</td>' +
          '<td class="num">' + age(m.ageHours) + '</td></tr>';
      }).join('');
    }).catch(function (e) {
      $('#boardRows').innerHTML = '';
      $('#boardEmpty').hidden = false;
      $('#boardEmptyText').textContent = 'LIVE DATA UNAVAILABLE — ' + String(e.message || 'the feed did not answer').toUpperCase();
      $('#boardMeta').textContent = 'offline';
    });
  }
  function pickRow(e) {
    var tr = e.target.closest('tr[data-i]');
    if (!tr || (e.type === 'keydown' && e.key !== 'Enter')) return;
    showCard(boardRows[+tr.getAttribute('data-i')]);
  }
  $('#boardRows').addEventListener('click', pickRow);
  $('#boardRows').addEventListener('keydown', pickRow);
  $('#boardRefresh').addEventListener('click', loadBoard);
  loadBoard();
})();
