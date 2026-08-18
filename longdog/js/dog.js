/* LONGDOG — the dog itself. Everything here is drawn as SVG markup at runtime,
 * so the whole site ships with zero image requests. */
(function (global) {
  'use strict';

  var FRONT_W = 440;   // head + chest artboard width
  var FRONT_H = 560;   // …and height. The body starts where this ends.
  var BODY_W = 236;    // width of the tube
  var TILE_H = 1200;   // vertical repeat of the fur pattern

  /* Small deterministic PRNG so the dapple markings are the same every visit. */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ── The tube ───────────────────────────────────────────────────────────
   * One seamless tile: a cylinder gradient, soft fur chevrons at a divisor of
   * the tile height, and dapple spots kept clear of the seam. */
  function bodyTile() {
    var r = rng(20260731);
    var spots = '';
    for (var i = 0; i < 26; i++) {
      var cx = 26 + r() * (BODY_W - 52);
      var cy = 70 + r() * (TILE_H - 140);
      var rx = 9 + r() * 22;
      var ry = rx * (0.55 + r() * 0.5);
      var rot = (r() * 60 - 30).toFixed(1);
      spots += '<ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' + rx.toFixed(1) +
        '" ry="' + ry.toFixed(1) + '" transform="rotate(' + rot + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) +
        ')" fill="#6f3c19" opacity="' + (0.10 + r() * 0.13).toFixed(2) + '"/>';
    }

    var chevrons = '';
    for (var y = 0; y < TILE_H; y += 48) {
      chevrons += '<path d="M0 ' + y + ' Q' + (BODY_W / 2) + ' ' + (y + 15) + ' ' + BODY_W + ' ' + y +
        '" fill="none" stroke="#7a4520" stroke-width="1.6" opacity="0.10"/>';
    }

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + BODY_W + '" height="' + TILE_H + '" viewBox="0 0 ' + BODY_W + ' ' + TILE_H + '">' +
      '<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#7e4520"/>' +
      '<stop offset="0.10" stop-color="#a15c2b"/>' +
      '<stop offset="0.34" stop-color="#cd8244"/>' +
      '<stop offset="0.46" stop-color="#e4a466"/>' +
      '<stop offset="0.62" stop-color="#c87c3f"/>' +
      '<stop offset="0.88" stop-color="#985325"/>' +
      '<stop offset="1" stop-color="#6f3c19"/>' +
      '</linearGradient></defs>' +
      /* bled 2px past the artboard: an exact-fit rect blends with transparency
         at the tile edge and leaves a seam line every repeat once scaled down */
      '<rect x="-2" y="-2" width="' + (BODY_W + 4) + '" height="' + (TILE_H + 4) + '" fill="url(#c)"/>' +
      spots + chevrons +
      '</svg>';

    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  }

  /* ── Head and chest ─────────────────────────────────────────────────────
   * Front view: floppy ears down the sides, tan points over the eyes, a collar
   * and two front paws where the tube takes over. Eyes and eyelids carry ids so
   * app.js can make him blink and follow the pointer. */
  function front() {
    return '' +
'<svg class="front-svg" viewBox="0 0 ' + FRONT_W + ' ' + FRONT_H + '" width="' + FRONT_W + '" height="' + FRONT_H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A dachshund, seen head-on">' +
'<defs>' +
  '<radialGradient id="ldHead" cx="0.42" cy="0.32" r="0.78">' +
    '<stop offset="0" stop-color="#e8ab6e"/><stop offset="0.55" stop-color="#cb7f42"/><stop offset="1" stop-color="#9a5626"/>' +
  '</radialGradient>' +
  '<linearGradient id="ldEar" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#6b3a1a"/><stop offset="0.55" stop-color="#4f2a13"/><stop offset="1" stop-color="#381c0d"/>' +
  '</linearGradient>' +
  '<linearGradient id="ldChest" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#7e4520"/><stop offset="0.12" stop-color="#a75f2c"/><stop offset="0.44" stop-color="#e2a264"/>' +
    '<stop offset="0.64" stop-color="#c67b3e"/><stop offset="1" stop-color="#6f3c19"/>' +
  '</linearGradient>' +
  '<linearGradient id="ldCollar" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#a52f24"/><stop offset="0.45" stop-color="#e35141"/><stop offset="1" stop-color="#8d2419"/>' +
  '</linearGradient>' +
  '<radialGradient id="ldMuzzle" cx="0.5" cy="0.3" r="0.75">' +
    '<stop offset="0" stop-color="#f2c894"/><stop offset="1" stop-color="#d79a5d"/>' +
  '</radialGradient>' +
'</defs>' +

/* chest + front legs — drawn first so the head overlaps them */
/* the chest tapers into the tube so there is no shoulder step at the join */
'<path d="M92 300h256v196l-10 64H102l-10-64z" fill="url(#ldChest)"/>' +
'<path d="M100 342c-26 6-42 26-46 54-3 22 2 44 10 66l40-14z" fill="#8d4f22"/>' +
'<path d="M340 342c26 6 42 26 46 54 3 22-2 44-10 66l-40-14z" fill="#8d4f22"/>' +
'<path d="M64 452c-14 22-16 44-6 62 8 14 26 18 40 10l16-10-14-62z" fill="#c98046"/>' +
'<path d="M376 452c14 22 16 44 6 62-8 14-26 18-40 10l-16-10 14-62z" fill="#c98046"/>' +
'<path d="M78 500c3 8 10 13 19 14M362 500c-3 8-10 13-19 14" fill="none" stroke="#8a5228" stroke-width="3.5" stroke-linecap="round" opacity="0.4"/>' +

/* collar */
'<rect x="88" y="300" width="264" height="40" rx="10" fill="url(#ldCollar)"/>' +
'<rect x="88" y="300" width="264" height="12" rx="6" fill="#ffffff" opacity="0.16"/>' +
'<circle cx="220" cy="356" r="20" fill="#f0b93f"/>' +
'<circle cx="220" cy="356" r="20" fill="none" stroke="#b9832a" stroke-width="3"/>' +
'<path d="M213 350h14M213 358h10" stroke="#8d6320" stroke-width="3" stroke-linecap="round" fill="none"/>' +

/* ears, behind the skull */
'<path d="M112 118c-34 6-56 40-58 92-2 54 10 106 30 140 12 20 34 24 48 8 12-14 14-38 10-66-6-44-10-88-6-124 2-24-8-53-24-50z" fill="url(#ldEar)"/>' +
'<path d="M328 118c34 6 56 40 58 92 2 54-10 106-30 140-12 20-34 24-48 8-12-14-14-38-10-66 6-44 10-88 6-124-2-24 8-53 24-50z" fill="url(#ldEar)"/>' +
'<path d="M120 150c-16 22-22 62-18 104" stroke="#7d4620" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.45"/>' +
'<path d="M320 150c16 22 22 62 18 104" stroke="#7d4620" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.45"/>' +

/* skull */
'<path d="M220 36c-64 0-112 44-112 112 0 78 44 138 112 138s112-60 112-138c0-68-48-112-112-112z" fill="url(#ldHead)"/>' +

/* tan eyebrow points */
'<ellipse cx="172" cy="122" rx="15" ry="10" fill="#e8b478" opacity="0.85"/>' +
'<ellipse cx="268" cy="122" rx="15" ry="10" fill="#e8b478" opacity="0.85"/>' +

/* eyes */
'<g class="eye">' +
  '<ellipse cx="172" cy="152" rx="21" ry="23" fill="#2a1a10"/>' +
  '<circle id="ldPupilL" cx="172" cy="152" r="9" fill="#0b0705"/>' +
  '<circle cx="165" cy="144" r="6.5" fill="#fff" opacity="0.9"/>' +
  '<circle cx="179" cy="161" r="3" fill="#fff" opacity="0.45"/>' +
  '<path id="ldLidL" d="M149 152a23 23 0 0 1 46 0z" fill="#cb7f42" style="transform-origin:172px 129px"/>' +
'</g>' +
'<g class="eye">' +
  '<ellipse cx="268" cy="152" rx="21" ry="23" fill="#2a1a10"/>' +
  '<circle id="ldPupilR" cx="268" cy="152" r="9" fill="#0b0705"/>' +
  '<circle cx="261" cy="144" r="6.5" fill="#fff" opacity="0.9"/>' +
  '<circle cx="275" cy="161" r="3" fill="#fff" opacity="0.45"/>' +
  '<path id="ldLidR" d="M245 152a23 23 0 0 1 46 0z" fill="#cb7f42" style="transform-origin:268px 129px"/>' +
'</g>' +

/* muzzle */
'<ellipse cx="220" cy="228" rx="70" ry="54" fill="url(#ldMuzzle)"/>' +
'<ellipse cx="220" cy="212" rx="70" ry="40" fill="#e9b378" opacity="0.5"/>' +
'<path id="ldNose" d="M192 196c0-12 12-20 28-20s28 8 28 20c0 16-14 28-28 28s-28-12-28-28z" fill="#241610"/>' +
'<ellipse cx="209" cy="190" rx="9" ry="5" fill="#fff" opacity="0.28"/>' +
'<path d="M220 224v14" stroke="#8a5c33" stroke-width="4" stroke-linecap="round" fill="none"/>' +
'<path d="M220 238c-6 14-22 16-30 6M220 238c6 14 22 16 30 6" stroke="#8a5c33" stroke-width="4.5" stroke-linecap="round" fill="none"/>' +
'<circle cx="186" cy="236" r="2.4" fill="#a97b4d" opacity="0.6"/>' +
'<circle cx="196" cy="248" r="2.4" fill="#a97b4d" opacity="0.6"/>' +
'<circle cx="254" cy="236" r="2.4" fill="#a97b4d" opacity="0.6"/>' +
'<circle cx="244" cy="248" r="2.4" fill="#a97b4d" opacity="0.6"/>' +
'</svg>';
  }

  global.LDDog = {
    FRONT_W: FRONT_W, FRONT_H: FRONT_H, BODY_W: BODY_W, TILE_H: TILE_H,
    bodyTile: bodyTile, front: front
  };
})(window);
