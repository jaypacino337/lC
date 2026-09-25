/* ============================================================================
   SLUDGE — the brewer. Deterministic coin generator + procedural blob art.

   This is the interactive demo: describe a coin (or let the vat decide) and it
   names it, draws it and writes the case — all client-side, all seeded, so the
   same input always brews the same coin. NOTHING IS DEPLOYED. The UI says so;
   this file contains no network calls at all.
   ========================================================================== */
(function (global) {
  'use strict';

  /* mulberry32 over a string hash — same trick as the rest of the repo */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var pick = function (r, arr) { return arr[Math.floor(r() * arr.length)]; };

  /* ── word banks ─────────────────────────────────────────────────────────── */
  var GOO = ['SLOP', 'GRIME', 'OOZE', 'MUCK', 'DRIP', 'GUNK', 'SCUM', 'BOG',
             'CRUD', 'SILT', 'GLOP', 'MIRE', 'SPEW', 'GLORP', 'SMEAR', 'FUNK'];
  var TAIL = ['LORD', 'BOY', 'WIF', 'INU', 'CORE', 'MAXX', 'ROT', 'JUICE',
              'FACE', 'ZILLA', 'GREMLIN', 'ENJOYER', 'GOBLIN', 'UNIT', 'FIEND'];
  var VIBE = ['terminal', 'feral', 'load-bearing', 'unregulated', 'nutrient-rich',
              'weaponized', 'artisanal', 'biohazardous', 'free-range', 'industrial'];
  var PLACE = ['the trenches', 'the group chat', 'a drainage ditch', 'the timeline',
               'the vat', 'a portable toilet at a hackathon', 'the mempool',
               'an abandoned Denny’s', 'the discord', 'a wet cardboard box'];
  var CASE1 = [
    '{N} is what leaks out when {P} floods.',
    '{N} was found alive in {P}. It refuses to leave.',
    'Every cycle produces one {V} coin. {N} is this one.',
    '{N} is {V} sludge from {P}. That is the whole thesis.',
    'You don’t buy {N}. {N} accumulates on you.',
    'Scientists pulled {N} out of {P} and it started trading.'
  ];

  function tickerFrom(r, name) {
    var letters = name.replace(/[^A-Z]/g, '');
    var len = 4 + Math.floor(r() * 3);
    if (letters.length <= len) return letters || 'SLDG';
    /* keep first letters + consonants — tickers hate vowels */
    var out = letters[0];
    for (var i = 1; i < letters.length && out.length < len; i++) {
      if (!/[AEIOU]/.test(letters[i]) || r() < 0.25) out += letters[i];
    }
    return out;
  }

  /**
   * Brew a coin. `prompt` may be empty (the vat decides). `nonce` re-rolls.
   * Deterministic: same prompt + nonce → same coin, same blob.
   */
  function brew(prompt, nonce) {
    var clean = (prompt || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 60);
    var seed = hash(clean + '::' + (nonce | 0));
    var r = rng(seed);

    var name;
    if (clean) {
      /* fold the user's strongest word into the name */
      var words = clean.replace(/[^A-Z ]/g, '').split(' ').filter(Boolean);
      var word = words.sort(function (a, b) { return b.length - a.length; })[0] || pick(r, GOO);
      name = r() < 0.5 ? pick(r, GOO) + word : word + pick(r, TAIL);
    } else {
      name = pick(r, GOO) + (r() < 0.35 ? pick(r, GOO) : '') + pick(r, TAIL);
    }
    if (name.length > 14) name = name.slice(0, 14);

    var thesis = pick(r, CASE1)
      .replace('{N}', '$' + name)
      .replace('{P}', pick(r, PLACE))
      .replace('{V}', pick(r, VIBE));

    return {
      name: name,
      ticker: tickerFrom(r, name),
      thesis: thesis,
      viscosity: (60 + Math.floor(r() * 39)) + '%',   // flavor stats, clearly fake
      toxicity: (r() < 0.5 ? 'HIGH' : 'EXTREME'),
      seed: seed
    };
  }

  /* ── procedural blob ─────────────────────────────────────────────────────
     A wobbling goo circle with drips and a face, drawn from the coin's seed
     so every coin has its own creature. Canvas, ~2ms, no assets. */
  function drawBlob(canvas, seed) {
    var r = rng(seed ^ 0x9e3779b9);
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H * 0.44, R = W * 0.30;
    ctx.clearRect(0, 0, W, H);

    /* body: radius perturbed around the circle */
    var pts = [], N = 14, i;
    var wob = 0.10 + r() * 0.14;
    for (i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2;
      var rad = R * (1 + (r() - 0.5) * 2 * wob);
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 1.05]);
    }
    ctx.beginPath();
    ctx.moveTo((pts[0][0] + pts[N - 1][0]) / 2, (pts[0][1] + pts[N - 1][1]) / 2);
    for (i = 0; i < N; i++) {
      var p = pts[i], q = pts[(i + 1) % N];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();

    var grad = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.2, cx, cy, R * 1.5);
    grad.addColorStop(0, '#d6ff3d');
    grad.addColorStop(0.55, '#9ee800');
    grad.addColorStop(1, '#4c7a00');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#0c0f0a'; ctx.stroke();

    /* drips */
    var drips = 2 + Math.floor(r() * 3);
    for (i = 0; i < drips; i++) {
      var dx = cx + (r() - 0.5) * R * 1.5;
      var top = cy + R * 0.8, len = R * (0.35 + r() * 0.8), w = 7 + r() * 12;
      ctx.beginPath();
      ctx.moveTo(dx - w / 2, top);
      ctx.quadraticCurveTo(dx - w / 2, top + len * 0.7, dx, top + len);
      ctx.quadraticCurveTo(dx + w / 2, top + len * 0.7, dx + w / 2, top);
      ctx.closePath();
      ctx.fillStyle = '#86c400'; ctx.fill();
      ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath();
      ctx.arc(dx, top + len + 9 + r() * 14, 4 + r() * 4, 0, Math.PI * 2);
      ctx.fillStyle = '#9ee800'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    }

    /* face */
    var eyeY = cy - R * 0.12, gap = R * (0.38 + r() * 0.14), er = R * (0.16 + r() * 0.07);
    var deadEye = r() < 0.22;                       // one X eye sometimes
    [-1, 1].forEach(function (side, idx) {
      var ex = cx + side * gap;
      if (deadEye && idx === 0) {
        ctx.lineWidth = 6; ctx.strokeStyle = '#0c0f0a'; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - er * .7, eyeY - er * .7); ctx.lineTo(ex + er * .7, eyeY + er * .7);
        ctx.moveTo(ex + er * .7, eyeY - er * .7); ctx.lineTo(ex - er * .7, eyeY + er * .7);
        ctx.stroke();
        return;
      }
      ctx.beginPath(); ctx.ellipse(ex, eyeY, er, er * 1.25, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f4ffe0'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#0c0f0a'; ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex + (r() - 0.5) * er * 0.7, eyeY + (r() - 0.5) * er * 0.6, er * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = '#0c0f0a'; ctx.fill();
    });

    /* mouth: wavy, judgmental */
    ctx.beginPath();
    var my = cy + R * (0.32 + r() * 0.1), mw = R * (0.5 + r() * 0.3);
    ctx.moveTo(cx - mw / 2, my);
    ctx.quadraticCurveTo(cx - mw / 6, my + (r() - 0.3) * 16, cx, my);
    ctx.quadraticCurveTo(cx + mw / 6, my + (r() - 0.3) * 16, cx + mw / 2, my);
    ctx.lineWidth = 5; ctx.strokeStyle = '#0c0f0a'; ctx.lineCap = 'round'; ctx.stroke();
  }

  global.BREWER = { brew: brew, drawBlob: drawBlob, hash: hash };
})(window);
