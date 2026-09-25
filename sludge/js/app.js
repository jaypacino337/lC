/* SLUDGE — page wiring: mounts the loop and vat from config, runs the brewer. */
(function () {
  'use strict';

  var C = window.SLUDGE, B = window.BREWER;
  var $ = function (s) { return document.querySelector(s); };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* links + year + CA pill */
  document.querySelectorAll('[data-link]').forEach(function (a) {
    var url = C.links[a.getAttribute('data-link')];
    if (url && url !== '#') { a.href = url; a.target = '_blank'; a.rel = 'noopener'; }
  });
  $('#year').textContent = new Date().getFullYear();
  if (C.token.address) {
    $('#caPill').textContent = C.token.address.slice(0, 4) + '…' + C.token.address.slice(-4);
  }

  /* stage bar — hidden only when the launcher is genuinely live */
  if (C.stage === 'live') $('#hazardBar').hidden = true;

  /* the loop */
  $('#loopGrid').innerHTML = C.loop.map(function (s, i) {
    return '<div class="loop-card"><span class="n">STEP 0' + (i + 1) + '</span>' +
      '<h3>' + esc(s.k) + '</h3><p>' + esc(s.body) + '</p></div>';
  }).join('');

  /* the vat table — real batches only, never demo rows */
  if (C.batches.length) {
    $('#vatEmpty').hidden = true;
    $('#vatRows').innerHTML = C.batches.map(function (b) {
      return '<tr><td>' + esc(b.batch) + '</td><td>$' + esc(b.coin) + '</td>' +
        '<td>' + esc(b.brewed) + '</td><td>' + esc(b.score) + '</td>' +
        '<td>' + esc(b.verdict) + '</td></tr>';
    }).join('');
  }

  /* ── brewer ─────────────────────────────────────────────────────────────── */
  var input = $('#brewInput'), out = $('#brewOut');
  var againBtn = $('#againBtn');
  var lastPrompt = '', nonce = 0;

  function show(coin) {
    $('#coinName').textContent = '$' + coin.name;
    $('#coinTicker').textContent = coin.ticker;
    $('#coinThesis').textContent = coin.thesis;
    $('#coinVisc').textContent = coin.viscosity;
    $('#coinTox').textContent = coin.toxicity;
    $('#specimenTag').textContent = 'SPECIMEN #' + String(coin.seed % 10000).padStart(4, '0');
    B.drawBlob($('#blobCanvas'), coin.seed);

    out.hidden = true;                 // retrigger the plop animation
    void out.offsetWidth;
    out.hidden = false;
    againBtn.hidden = false;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('#brewBtn').addEventListener('click', function () {
    lastPrompt = input.value; nonce = 0;
    show(B.brew(lastPrompt, nonce));
  });
  $('#randomBtn').addEventListener('click', function () {
    lastPrompt = ''; nonce = (Math.random() * 1e6) | 0;
    input.value = '';
    show(B.brew('', nonce));
  });
  againBtn.addEventListener('click', function () {
    nonce++;
    show(B.brew(lastPrompt, nonce));
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#brewBtn').click(); }
  });
})();
