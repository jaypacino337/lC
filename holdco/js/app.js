/* ============================================================================
   HOLDCO — page behaviour. Mounts components from data.js, wires the
   application modal, and runs the understated reveal/count animations.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.HOLDCO, C = window.HC;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ── links from config ─────────────────────────────────────────────────── */
  $$('[data-link]').forEach(function (a) {
    var key = a.getAttribute('data-link');
    var url = D.links[key];
    if (url && url !== '#') { a.href = url; if (/^https?:/.test(url)) { a.target = '_blank'; a.rel = 'noopener'; } }
  });
  $('#year').textContent = new Date().getFullYear();

  /* ── hero stats ────────────────────────────────────────────────────────── */
  var m = D.metrics;
  $('#heroStats').innerHTML =
    C.statCard('Subsidiaries', m.subsidiaries, { count: true }) +
    C.statCard('Group revenue', m.groupRevenueUsd) +
    C.statCard('Treasury', m.treasuryUsd) +
    C.statCard('Applications', null, {
      text: D.meta.applicationsOpen ? 'OPEN' : 'CLOSED',
      textClass: D.meta.applicationsOpen ? 'fig pos' : 'fig'
    });

  /* ── portfolio ─────────────────────────────────────────────────────────── */
  $('#subsidiaryCards').innerHTML = D.subsidiaries.map(C.subsidiaryCard).join('');
  $('#loBadge').textContent = 'Status: ' +
    (D.subsidiaries[0] && D.subsidiaries[0].status ? D.subsidiaries[0].status : 'BETA');

  /* ── launch office checklist ───────────────────────────────────────────── */
  $('#subsGet').innerHTML = D.launchOffice.gets
    .map(function (g) { return '<li>' + C.esc(g) + '</li>'; }).join('');

  /* ── token utility ─────────────────────────────────────────────────────── */
  $('#utilityRows').innerHTML = D.token.map(C.utilityRow).join('');

  /* ── boardroom ─────────────────────────────────────────────────────────── */
  $('#agendaRows').innerHTML = D.boardroom.agendas.map(C.agendaRow).join('');

  /* ── financials ────────────────────────────────────────────────────────── */
  $('#finGrid').innerHTML =
    C.finCell('Group revenue', m.groupRevenueUsd) +
    C.finCell('Treasury', m.treasuryUsd) +
    C.finCell('Subsidiary revenue', m.subsidiaryRevenueUsd) +
    C.finCell('Operating expenses', m.operatingExpensesUsd) +
    C.finCell('Buybacks', m.buybacksUsd) +
    C.finCell('Development', m.developmentUsd);
  $('#allocTable').innerHTML = C.financialTable(D.allocations);

  /* ── roadmap ───────────────────────────────────────────────────────────── */
  $('#roadRows').innerHTML = D.roadmap.map(C.roadmapRow).join('');

  /* ── reveal on scroll — subtle, staggered per section, runs once ───────── */
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    $$('.rv').forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 6, 4) * 50 + 'ms';
      io.observe(el);
    });
  } else {
    $$('.rv').forEach(function (el) { el.classList.add('in'); });
  }

  /* ── mobile nav ────────────────────────────────────────────────────────── */
  var menuBtn = $('#menuBtn'), navLinks = $('#navLinks');
  menuBtn.addEventListener('click', function () {
    var open = navLinks.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  $$('#navLinks a').forEach(function (a) {
    a.addEventListener('click', function () {
      navLinks.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    });
  });

  /* ── application modal ─────────────────────────────────────────────────── */
  var modal = $('#applyModal'), scrim = $('#applyScrim');
  var form = $('#applyForm'), status = $('#applyStatus'), submitBtn = $('#applySubmit');
  var lastFocus = null;

  function openModal() {
    lastFocus = document.activeElement;
    modal.hidden = false; scrim.hidden = false;
    document.body.style.overflow = 'hidden';
    form.querySelector('input').focus();
  }
  function closeModal() {
    modal.hidden = true; scrim.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  $$('[data-open-apply]').forEach(function (b) { b.addEventListener('click', openModal); });
  $('#applyClose').addEventListener('click', closeModal);
  scrim.addEventListener('click', closeModal);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  function formData() {
    var d = {};
    ['company', 'category', 'concept', 'plan', 'links', 'contact'].forEach(function (k) {
      d[k] = (form.elements[k].value || '').trim();
    });
    d.submittedAt = new Date().toISOString();
    d.source = 'holdco-site';
    return d;
  }

  function applicationText(d) {
    return ['HOLDCO SUBSIDIARY APPLICATION',
      'Company:  ' + d.company,
      'Category: ' + d.category,
      'Concept:  ' + d.concept,
      '30 days:  ' + d.plan,
      'Links:    ' + (d.links || '—'),
      'Contact:  ' + d.contact].join('\n');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.className = 'form-status';
    if (!form.reportValidity()) return;

    var d = formData();
    var endpoint = (D.application.endpoint || '').trim();
    submitBtn.disabled = true;

    if (endpoint) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(d)
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        status.textContent = 'Application received. HOLDCO will review and respond.';
        status.classList.add('ok');
        form.reset();
      }).catch(function () {
        status.textContent = 'Could not submit right now — please try again shortly.';
      }).finally(function () { submitBtn.disabled = false; });
      return;
    }

    /* No endpoint configured: copy the application so it can be sent manually.
       Honest fallback — nothing pretends to have been "received". */
    var text = applicationText(d);
    var contact = D.application.contact ? ' Send it to ' + D.application.contact + '.' : '';
    var done = function () {
      status.textContent = 'Application copied to clipboard.' + contact;
      status.classList.add('ok');
      submitBtn.disabled = false;
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done, function () {
        status.textContent = 'Copy failed — select and copy your answers manually.';
        submitBtn.disabled = false;
      });
    } else { done(); }
  });
})();
