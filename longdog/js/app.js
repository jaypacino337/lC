/* LONGDOG — engine.
 *
 * The page never actually gets taller. `.runway` is a fixed 2-span strip and
 * the scroll position is recycled inside it: whenever you pass 1.5 spans the
 * position drops back a span and the same distance is added to `loop`. Every
 * visible layer is positioned from `v = loop + scrollY`, so the recycle is
 * invisible and the dog has no maximum length.
 */
(function () {
  'use strict';

  var D = window.LD, Dog = window.LDDog;

  var SPAN = 6000;                 // px per recycle step
  var CHUNK = 420;                 // decor chunk size, in layer space
  var LAYERS = [0.50, 0.72, 1.00]; // parallax factors
  var STORE = 'longdog:v1';

  var el = {
    sky: document.getElementById('sky'),
    decor: document.getElementById('decor'),
    dog: document.getElementById('dog'),
    body: document.getElementById('dogBody'),
    front: document.getElementById('dogFront'),
    hero: document.getElementById('hero'),
    len: document.getElementById('len'),
    cmp: document.getElementById('cmp'),
    zone: document.getElementById('zone').querySelector('span'),
    ruler: document.getElementById('ruler'),
    runway: document.getElementById('runway'),
    toasts: document.getElementById('toasts'),
    panel: document.getElementById('panel'),
    scrim: document.getElementById('scrim'),
    badges: document.getElementById('badges'),
    best: document.getElementById('best'),
    tally: document.getElementById('tally')
  };

  var vw = 0, vh = 0;
  var loop = 0, v = 0;
  var HERO = 0;      // where the head sits on the opening screen
  var ORIGIN = 0;    // virtual y where the tube starts — depth is measured from here
  var baseFit = 1;   // keeps head + chest inside short viewports
  var queued = false;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Saved state ────────────────────────────────────────────────────────── */
  var save = { earned: [], best: 0 };
  try {
    var raw = localStorage.getItem(STORE);
    if (raw) {
      var p = JSON.parse(raw);
      if (p && Array.isArray(p.earned)) save = { earned: p.earned, best: +p.best || 0 };
    }
  } catch (e) { /* private mode: run without persistence */ }

  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) {}
  }
  function has(id) { return save.earned.indexOf(id) !== -1; }

  /* ── Build the dog ──────────────────────────────────────────────────────── */
  el.front.innerHTML = Dog.front();
  el.body.style.backgroundImage = Dog.bodyTile();

  /* ── Colour helpers ─────────────────────────────────────────────────────── */
  function hex(c) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  }
  function mix(a, b, t) {
    var x = hex(a), y = hex(b);
    return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' +
                    Math.round(x[1] + (y[1] - x[1]) * t) + ',' +
                    Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }
  function lum(c) { var x = hex(c); return (0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2]) / 255; }

  /* ── Sizing ─────────────────────────────────────────────────────────────── */
  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    el.runway.style.height = (SPAN * 2 + vh) + 'px';

    HERO = Math.round(vh * 0.28);
    baseFit = Math.max(0.5, Math.min(1,
      (vh * 0.90 - HERO) / Dog.FRONT_H,          // head + chest fit above the fold
      (vw * 0.52) / Dog.BODY_W                   // …and the tube never eats the phone
    ));
    ORIGIN = HERO + Dog.FRONT_H * baseFit;
    render(true);
  }

  /* How far the camera has pulled back. Full size at the top, easing outward. */
  function zoomAt(vv) { return baseFit * (0.42 + 0.58 * Math.exp(-vv / 45000)); }

  /* Depth, in metres, of the point sitting `y` pixels down the screen. */
  function depthOf(y) { return D.depthAt(Math.max(0, v + y - ORIGIN)); }

  /* ── Scroll recycling ───────────────────────────────────────────────────── */
  function readScroll() {
    var y = window.pageYOffset;
    if (y > SPAN * 1.5) {
      window.scrollTo(0, y - SPAN);
      loop += SPAN;
      y -= SPAN;
    } else if (y < SPAN * 0.5 && loop >= SPAN) {
      window.scrollTo(0, y + SPAN);
      loop -= SPAN;
      y += SPAN;
    }
    v = loop + y;
  }

  function goTo(target) {          // absolute virtual position
    target = Math.max(0, target);
    var y = target % SPAN + SPAN;  // land mid-runway so both directions have room
    loop = target - y;
    if (loop < 0) { y += loop; loop = 0; }
    window.scrollTo(0, y);
    v = target;
    render(true);
  }

  /* ── Decor pool ─────────────────────────────────────────────────────────── */
  var live = {};              // key "layer:chunk" -> [element]
  var shownZone = D.ZONES[0]; // the zone currently on screen, set in render()

  var SIZES = {
    cloud:   [120, 260, 34, 60], bird:    [22, 40, 12, 20],   moth:   [5, 10, 5, 10],
    grass:   [16, 34, 26, 60],   root:    [50, 130, 8, 16],   worm:   [26, 60, 7, 12],
    pebble:  [14, 44, 12, 34],   pipe:    [22, 40, 90, 210],  brick:  [34, 60, 16, 26],
    wire:    [70, 190, 4, 7],    bone:    [30, 70, 10, 18],   fossil: [26, 60, 26, 60],
    crystal: [22, 54, 44, 110],  glow:    [40, 110, 40, 110], ember:  [8, 22, 8, 22],
    bubble:  [12, 34, 12, 34],   star:    [2, 4.5, 2, 4.5],   planet: [40, 120, 40, 120]
  };

  /* shapes that must stay circular rather than take an independent height */
  var ROUND = {
    planet: 1, star: 1, moth: 1, glow: 1, ember: 1, bubble: 1, fossil: 1, pebble: 1
  };

  function rand(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function spawnChunk(li, c) {
    var p = LAYERS[li];
    var r = rand(c * 7919 + li * 104729 + 11);
    var n = 1 + Math.floor(r() * (li === 2 ? 2 : 3));
    var items = [];

    for (var i = 0; i < n; i++) {
      var layerY = (c + r()) * CHUNK;
      /* Decor follows whatever the sky is currently showing. Keying it to the
       * layer's own parallax depth spawns pipes into the fossil beds, and
       * keying it to the raw threshold lags the cross-fade. */
      var type = shownZone.decor[Math.floor(r() * shownZone.decor.length)];
      var s = SIZES[type] || [20, 40, 20, 40];

      var w = s[0] + r() * (s[1] - s[0]);
      var h = ROUND[type] ? w : s[2] + r() * (s[3] - s[2]);

      /* keep clear of the dog: pick a side, then a spot in the margin */
      var half = (Dog.BODY_W * zoomAt(v)) / 2 + 46;
      var room = Math.max(30, vw / 2 - half - w);
      var x = vw / 2 + (r() < 0.5 ? -1 : 1) * (half + r() * room) - w / 2;

      var d = document.createElement('div');
      d.className = 'd d-' + type;
      d.style.width = w.toFixed(1) + 'px';
      d.style.height = h.toFixed(1) + 'px';
      d.style.opacity = (type === 'star' ? 1 : 0.55 + r() * 0.45) * (li === 0 ? 0.68 : 1);
      d.style.animationDelay = (-r() * 4).toFixed(2) + 's';
      d._x = x;
      d._y = layerY;
      d._p = p;
      d._rot = type === 'fossil' || type === 'pebble' || type === 'brick' || type === 'crystal'
        ? (r() * 60 - 30).toFixed(1) : 0;
      el.decor.appendChild(d);
      items.push(d);
    }
    live[li + ':' + c] = items;
  }

  function updateDecor() {
    var keep = {};

    for (var li = 0; li < LAYERS.length; li++) {
      var p = LAYERS[li];
      var top = v * p - 260;
      var bot = v * p + vh + 260;
      var c0 = Math.floor(top / CHUNK), c1 = Math.floor(bot / CHUNK);

      for (var c = c0; c <= c1; c++) {
        if (c < 0) continue;
        var key = li + ':' + c;
        keep[key] = true;
        if (!live[key]) spawnChunk(li, c);
      }
    }

    for (var k in live) {
      if (!keep[k]) {
        var arr = live[k];
        for (var i = 0; i < arr.length; i++) el.decor.removeChild(arr[i]);
        delete live[k];
      } else {
        var items = live[k];
        for (var j = 0; j < items.length; j++) {
          var d = items[j];
          d.style.transform = 'translate3d(' + d._x.toFixed(1) + 'px,' +
            (d._y - v * d._p).toFixed(1) + 'px,0)' + (d._rot ? ' rotate(' + d._rot + 'deg)' : '');
        }
      }
    }
  }

  /* ── Ruler ──────────────────────────────────────────────────────────────── */
  var lastRuler = '';

  function niceStep(x) {
    var pow = Math.pow(10, Math.floor(Math.log10(x)));
    var f = x / pow;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
  }

  function updateRuler() {
    var dTop = depthOf(0), dBot = depthOf(vh);
    var step = niceStep((dBot - dTop) / 5);
    if (!isFinite(step) || step <= 0) return;

    var out = '', count = 0;
    var minor = step / 5;
    var start = Math.ceil(dTop / minor) * minor;

    for (var d = start; d <= dBot && count < 60; d += minor, count++) {
      var y = D.scrollAt(d) + ORIGIN - v;
      if (y < 4 || y > vh - 4) continue;
      var major = Math.abs(d / step - Math.round(d / step)) < 1e-6;
      out += '<div class="tick' + (major ? '' : ' minor') + '" style="top:' + y.toFixed(1) + 'px">' +
        (major ? '<span>' + D.fmt(d) + '</span>' : '') + '</div>';
    }
    if (out !== lastRuler) { el.ruler.innerHTML = out; lastRuler = out; }
  }

  /* ── Milestones ─────────────────────────────────────────────────────────── */
  var toastQueue = [], toasting = false;

  function award(id, name, note) {
    if (has(id)) return;
    save.earned.push(id);
    persist();
    renderBadges();
    el.tally.classList.remove('pop');
    void el.tally.offsetWidth;
    el.tally.classList.add('pop');
    toastQueue.push({ name: name, note: note });
    drainToasts();
  }

  function drainToasts() {
    if (toasting || !toastQueue.length) return;
    toasting = true;
    var t = toastQueue.shift();

    var node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = '<div class="medal" aria-hidden="true">★</div><div>' +
      '<b></b><small></small></div>';
    node.querySelector('b').textContent = t.name;
    node.querySelector('small').textContent = t.note;
    el.toasts.appendChild(node);
    ding();

    var hold = toastQueue.length > 1 ? 1100 : (reduce ? 1800 : 2600);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
        toasting = false;
        drainToasts();
      }, 450);
    }, hold);
  }

  function checkMilestones(d) {
    /* Nothing fires on the opening frame — the first screen is just the dog. */
    if (v <= 0) return;
    for (var i = 0; i < D.MILESTONES.length; i++) {
      var m = D.MILESTONES[i];
      if (d >= m.at && !has(m.id)) award(m.id, m.name, m.note);
    }
    if (d > save.best) { save.best = d; el.best.textContent = D.fmt(d); persist(); }
  }

  function renderBadges() {
    var out = '';
    var all = D.MILESTONES.map(function (m) {
      return { id: m.id, name: m.name, note: m.note, at: D.fmt(m.at) };
    }).concat(D.DEEDS.map(function (x) {
      return { id: x.id, name: x.name, note: x.note, at: '' };
    }));

    for (var i = 0; i < all.length; i++) {
      var a = all[i], on = has(a.id);
      out += '<li class="badge' + (on ? ' on' : '') + '">' +
        '<div class="medal" aria-hidden="true">' + (on ? '★' : '·') + '</div>' +
        '<div><b>' + esc(a.name) + '</b>' +
        '<small>' + esc(on ? a.note : (a.at ? 'Not there yet.' : 'Not done yet.')) + '</small></div>' +
        (a.at ? '<div class="at">' + a.at + '</div>' : '') + '</li>';
    }
    el.badges.innerHTML = out;
    el.tally.textContent = save.earned.length;
    el.tally.hidden = save.earned.length === 0;
    el.best.textContent = D.fmt(save.best);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  var lastZone = null;

  function render(force) {
    var z = zoomAt(v);
    var frontTop = HERO - v;
    var frontBottom = frontTop + Dog.FRONT_H * z;

    el.front.style.transform = 'translate3d(0,' + frontTop.toFixed(1) + 'px,0) scale(' + z.toFixed(4) + ')';

    /* Whole-pixel tile height: a fractional repeat leaves a visible seam line
     * every tile once the tube is wide and flat. */
    var bodyTop = Math.max(0, frontBottom);
    var tileH = Math.max(1, Math.round(Dog.TILE_H * z));
    var bodyW = Math.round(Dog.BODY_W * z);
    var off = (frontBottom - bodyTop) % tileH;
    el.body.style.top = bodyTop.toFixed(1) + 'px';
    el.body.style.height = Math.max(0, vh - bodyTop).toFixed(1) + 'px';
    el.body.style.width = bodyW + 'px';
    el.body.style.backgroundSize = bodyW + 'px ' + tileH + 'px';
    el.body.style.backgroundPosition = 'center ' + off.toFixed(1) + 'px';

    /* sky + palette, cross-faded across the zone boundary */
    var d = depthOf(vh * 0.5);
    var i = D.zoneAt(d);
    var a = D.ZONES[i], b = D.ZONES[i + 1] || a, t = 0;
    if (b !== a) {
      /* A screen spans only a few percent of its own depth once zoomed out, so
       * the fade band has to hug the boundary or the sky changes zones long
       * before the label does. */
      var lo = b.from * 0.85;
      t = Math.max(0, Math.min(1, (d - lo) / (b.from - lo)));
      t = t * t * (3 - 2 * t);
    }
    var top = mix(a.top, b.top, t), bot = mix(a.bot, b.bot, t), ink = mix(a.ink, b.ink, t);
    el.sky.style.setProperty('--sky-top', top);
    el.sky.style.setProperty('--sky-bot', bot);
    document.documentElement.style.setProperty('--ink', ink);
    document.documentElement.style.setProperty('--sky-top', top);
    document.documentElement.style.setProperty('--sky-bot', bot);

    /* the dog picks up the light of wherever he currently is */
    var light = 0.62 + 0.38 * lum(bot);
    el.dog.style.filter = 'brightness(' + light.toFixed(3) + ')';

    /* the chip and the decor both follow the sky, not the raw threshold */
    shownZone = t > 0.5 ? b : a;
    if (shownZone !== lastZone || force) {
      lastZone = shownZone;
      el.zone.textContent = shownZone.name;
      document.querySelector('meta[name=theme-color]').setAttribute('content', top);
    }

    /* HUD — the dog is as long as the depth at the bottom edge of the view */
    var len = depthOf(vh);
    el.len.textContent = D.fmt(len);
    el.cmp.textContent = D.comparison(len);

    var heroFade = Math.max(0, 1 - v / (vh * 0.5));
    el.hero.style.opacity = heroFade;
    el.hero.style.visibility = heroFade <= 0.01 ? 'hidden' : 'visible';

    updateDecor();
    updateRuler();
    checkMilestones(len);
  }

  function requestRender() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; readScroll(); render(false); });
  }

  /* ── Sound (synthesised, off until asked for) ───────────────────────────── */
  var ctx = null, soundOn = false;

  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function bark() {
    var c = soundOn && audio(); if (!c) return;
    var t = c.currentTime;
    var o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.16);
    f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(f); f.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.22);
  }

  function ding() {
    var c = soundOn && audio(); if (!c) return;
    [784, 1175].forEach(function (hz, k) {
      var t = c.currentTime + k * 0.09;
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(hz, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.34);
    });
  }

  /* ── Auto-stretch ───────────────────────────────────────────────────────── */
  var stretching = false, stretchV = 0, stretchRAF = 0, stretchUntil = 0;

  function stretchTick() {
    if (!stretching && performance.now() > stretchUntil) {
      stretchV *= 0.9;
      if (stretchV < 1) { stretchRAF = 0; return; }
    } else {
      stretchV = Math.min(stretchV * 1.055 + 6, 220);
    }
    window.scrollBy(0, stretchV);
    requestRender();
    stretchRAF = requestAnimationFrame(stretchTick);
  }

  function startStretch(ms) {
    stretchUntil = ms ? performance.now() + ms : 0;
    stretching = !ms;
    if (stretchV < 8) stretchV = 8;
    if (!stretchRAF) stretchRAF = requestAnimationFrame(stretchTick);
    award('turbo', deed('turbo').name, deed('turbo').note);
  }
  function stopStretch() { stretching = false; }
  function deed(id) {
    for (var i = 0; i < D.DEEDS.length; i++) if (D.DEEDS[i].id === id) return D.DEEDS[i];
    return { name: '', note: '' };
  }

  /* ── Wiring ─────────────────────────────────────────────────────────────── */
  window.addEventListener('scroll', requestRender, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('orientationchange', measure);

  var stretchBtn = document.getElementById('turbo');
  ['pointerdown'].forEach(function (ev) {
    stretchBtn.addEventListener(ev, function (e) {
      e.preventDefault();
      stretchBtn.classList.add('pressing');
      startStretch(0);
    });
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    stretchBtn.addEventListener(ev, function () {
      stretchBtn.classList.remove('pressing');
      stopStretch();
    });
  });

  document.getElementById('tailBtn').addEventListener('click', function () {
    startStretch(2600);
    setTimeout(function () {
      var d = deed('tail');
      if (!has('tail')) award('tail', d.name, d.note);
      else {
        toastQueue.push({ name: 'Still no tail', note: 'He continues. That is the whole thing.' });
        drainToasts();
      }
    }, 3200);
  });

  document.getElementById('topBtn').addEventListener('click', backToHead);
  document.getElementById('brandLink').addEventListener('click', function (e) {
    e.preventDefault(); backToHead();
  });

  function backToHead() {
    stopStretch();
    stretchV = 0;
    goTo(0);
    var d = deed('home');
    award('home', d.name, d.note);
    bark();
  }

  var soundBtn = document.getElementById('soundBtn');
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) {
      audio();
      bark();
      var d = deed('sound');
      award('sound', d.name, d.note);
    }
  });

  document.getElementById('shareBtn').addEventListener('click', function () {
    var text = 'My LONGDOG reached ' + D.fmt(save.best) + '. He is still going.';
    var url = location.href.split('#')[0] + '#' + Math.round(save.best);
    var d = deed('share');
    var done = function (msg) {
      toastQueue.push({ name: msg, note: text });
      drainToasts();
      award('share', d.name, d.note);
    };
    if (navigator.share) {
      navigator.share({ title: 'LONGDOG', text: text, url: url }).then(function () {
        award('share', d.name, d.note);
      }, function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + ' ' + url).then(function () {
        done('Copied to clipboard');
      }, function () { done('Could not copy'); });
    } else {
      done('Tell them yourself');
    }
  });

  /* panel */
  var panelOpen = false;
  function togglePanel(open) {
    panelOpen = open;
    el.panel.hidden = !open;
    el.scrim.hidden = !open;
    if (open) { renderBadges(); el.panel.querySelector('.panel-close').focus(); }
  }
  document.getElementById('badgesBtn').addEventListener('click', function () { togglePanel(!panelOpen); });
  document.getElementById('panelClose').addEventListener('click', function () { togglePanel(false); });
  el.scrim.addEventListener('click', function () { togglePanel(false); });

  /* nose boop */
  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'ldNose') {
      el.front.classList.remove('booped');
      void el.front.offsetWidth;
      el.front.classList.add('booped');
      bark();
      var d = deed('boop');
      award('boop', d.name, d.note);
    }
  });

  /* eyes follow the pointer */
  if (!reduce && matchMedia('(pointer: fine)').matches) {
    var pl = document.getElementById('ldPupilL'), pr = document.getElementById('ldPupilR');
    window.addEventListener('pointermove', function (e) {
      if (!pl || !pr) return;
      var dx = Math.max(-1, Math.min(1, (e.clientX - vw / 2) / (vw / 2))) * 6;
      var dy = Math.max(-1, Math.min(1, (e.clientY - vh * 0.25) / (vh / 2))) * 4;
      var t = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      pl.style.transform = t; pr.style.transform = t;
    }, { passive: true });
  }

  /* keyboard */
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === 'escape' && panelOpen) { togglePanel(false); return; }
    if (k === 'm') { e.preventDefault(); togglePanel(!panelOpen); }
    else if (k === 's') { e.preventDefault(); soundBtn.click(); }
    else if (k === 't' && !e.repeat) { e.preventDefault(); startStretch(0); }
    else if (k === 'home') { e.preventDefault(); backToHead(); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.key.toLowerCase() === 't') stopStretch();
  });

  /* ── Deep links ─────────────────────────────────────────────────────────
   * "#1200" drops you in at 1200 metres of dog, so a shared link arrives at
   * the length it is bragging about. */
  function atLength(m) { goTo(Math.max(0, D.scrollAt(m) + ORIGIN - vh)); }

  function fromHash() {
    var m = parseFloat((location.hash || '').replace('#', ''));
    if (isFinite(m) && m > 0) { atLength(m); return true; }
    return false;
  }
  window.addEventListener('hashchange', fromHash);

  /* ── Go ─────────────────────────────────────────────────────────────────── */
  if (window.pageYOffset > 0) window.scrollTo(0, 0);
  renderBadges();
  measure();
  fromHash();
  requestRender();

  window.LONGDOG = { goTo: goTo, at: atLength, get v() { return v; } };
})();
