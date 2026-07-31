/* LONGDOG — world data: scale, zones, comparisons, milestones, formatting.
 * No dependencies. Loaded before dog.js and app.js. */
(function (global) {
  'use strict';

  /* ── Scale ──────────────────────────────────────────────────────────────
   * The camera zooms out as you go: metres-per-pixel doubles every DOUBLE px
   * of scrolling. Depth is the integral of that, so it stays smooth and the
   * first screenful still reads at a human scale (~200 px per metre).
   *
   *   mpp(v) = M0 * 2^(v/DOUBLE)
   *   depth(v) = C * (2^(v/DOUBLE) - 1),  C = M0 * DOUBLE / ln2
   */
  var M0 = 1 / 200;        // metres per pixel at the top of the page
  var DOUBLE = 16000;      // pixels of scroll per doubling of the scale
  var C = (M0 * DOUBLE) / Math.LN2;

  function depthAt(v) { return C * (Math.pow(2, v / DOUBLE) - 1); }
  function scrollAt(d) { return DOUBLE * Math.log2(d / C + 1); }
  function mppAt(v) { return M0 * Math.pow(2, v / DOUBLE); }

  /* ── Zones ──────────────────────────────────────────────────────────────
   * `from` is the depth in metres where the zone begins. Colours are the top
   * and bottom stops of the sky gradient; app.js cross-fades between them.
   * `decor` lists the shapes that may spawn while the zone is on screen. */
  var ZONES = [
    { name: 'The Backyard',        from: 0,      top: '#bfe6ff', bot: '#e8f6df', ink: '#2c3b2a', decor: ['cloud', 'cloud', 'cloud', 'bird', 'moth'] },
    { name: 'The Topsoil',         from: 12,     top: '#c9a97c', bot: '#7f5f3e', ink: '#fbeedd', decor: ['root', 'worm', 'pebble', 'pebble'] },
    { name: 'Pipes & Wires',       from: 60,     top: '#4d4b58', bot: '#2f2e39', ink: '#e6e4f0', decor: ['pipe', 'brick', 'brick', 'wire'] },
    { name: 'The Old Layers',      from: 400,    top: '#6d4b3a', bot: '#3f2a21', ink: '#f6e3d2', decor: ['bone', 'fossil', 'pebble'] },
    { name: 'Crystal Hollows',     from: 3000,   top: '#2b3b60', bot: '#141d34', ink: '#dfe9ff', decor: ['crystal', 'crystal', 'glow'] },
    { name: 'Magma',               from: 25000,  top: '#6d1d11', bot: '#b8400f', ink: '#ffe7c8', decor: ['ember', 'ember', 'bubble'] },
    { name: 'The Core',            from: 150000, top: '#ffbe1a', bot: '#ff5f00', ink: '#4a1f00', decor: ['ember', 'glow', 'bubble'] },
    { name: 'Somewhere Else',      from: 1e6,    top: '#0d1330', bot: '#04060f', ink: '#dfe6ff', decor: ['star', 'star', 'star', 'planet'] },
    { name: 'The Long Dark',       from: 1e10,   top: '#05060d', bot: '#000000', ink: '#cfd6ff', decor: ['star', 'star', 'planet', 'glow'] }
  ];

  function zoneAt(d) {
    for (var i = ZONES.length - 1; i >= 0; i--) if (d >= ZONES[i].from) return i;
    return 0;
  }

  /* ── Comparisons ────────────────────────────────────────────────────────
   * Pick the unit that lands in a readable range, so the caption always says
   * something a human can picture. */
  var UNITS = [
    { m: 0.4,       one: 'a normal dachshund',  many: 'dachshunds' },
    { m: 1.75,      one: 'a person',            many: 'people' },
    { m: 5.5,       one: 'a giraffe',           many: 'giraffes' },
    { m: 11,        one: 'a school bus',        many: 'school buses' },
    { m: 25,        one: 'a blue whale',        many: 'blue whales' },
    { m: 105,       one: 'a football pitch',    many: 'football pitches' },
    { m: 330,       one: 'the Eiffel Tower',    many: 'Eiffel Towers' },
    { m: 828,       one: 'the Burj Khalifa',    many: 'Burj Khalifas' },
    { m: 8849,      one: 'Mount Everest',       many: 'Mount Everests' },
    { m: 42195,     one: 'a marathon',          many: 'marathons' },
    { m: 12742e3,   one: 'the whole Earth',     many: 'Earths' },
    { m: 384400e3,  one: 'a trip to the Moon',  many: 'trips to the Moon' },
    { m: 1.496e11,  one: 'the Earth–Sun gap',   many: 'Earth–Sun gaps' },
    { m: 9.461e15,  one: 'a light-year',        many: 'light-years' }
  ];

  function comparison(d) {
    if (d < 0.35) return 'not yet a dog';
    var u = UNITS[0];
    for (var i = 0; i < UNITS.length; i++) if (d / UNITS[i].m >= 1) u = UNITS[i];
    var n = d / u.m;
    if (n < 1.15) return 'about ' + u.one;
    return '≈ ' + trim(n) + ' ' + u.many;
  }

  function trim(n) {
    if (n >= 100) return String(Math.round(n));
    if (n >= 10) return n.toFixed(1).replace(/\.0$/, '');
    return n.toFixed(1);
  }

  /* ── Length formatting ──────────────────────────────────────────────────
   * Steps up through units so the readout never turns into scientific soup. */
  function fmt(d) {
    if (d < 10) return d.toFixed(2) + ' m';
    if (d < 1000) return group(d.toFixed(0)) + ' m';
    if (d < 1e6) return group((d / 1e3).toFixed(d < 1e5 ? 2 : 0)) + ' km';
    if (d < 1e9) return group((d / 1e3).toFixed(0)) + ' km';
    if (d < 1.496e11) return group((d / 1e6).toFixed(1)) + ' million km';
    if (d < 9.461e15) return group((d / 1.496e11).toFixed(2)) + ' AU';
    return group((d / 9.461e15).toFixed(2)) + ' light-years';
  }

  function group(s) {
    var p = String(s).split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.');
  }

  /* ── Milestones ─────────────────────────────────────────────────────────
   * `at` is depth in metres. `id` is stable — it is the localStorage key. */
  var MILESTONES = [
    { id: 'dog',      at: 0.4,      name: 'A Normal Dog',        note: 'Standard issue. Nothing to see here.' },
    { id: 'metre',    at: 1,        name: 'One Whole Metre',     note: 'Officially a long dog.' },
    { id: 'person',   at: 1.75,     name: 'Taller Than You',     note: 'If you stood him up. Please do not.' },
    { id: 'giraffe',  at: 5.5,      name: 'Giraffe Grade',       note: 'Neck for neck.' },
    { id: 'bus',      at: 11,       name: 'School Bus',          note: 'He would need two parking spaces.' },
    { id: 'whale',    at: 25,       name: 'Blue Whale',          note: 'The largest animal that ever lived. And him.' },
    { id: 'pitch',    at: 105,      name: 'Full Pitch',          note: 'Goal line to goal line, all dog.' },
    { id: 'eiffel',   at: 330,      name: 'Eiffel-Adjacent',     note: 'Only one of them is a dog.' },
    { id: 'burj',     at: 828,      name: 'Tallest Building',    note: 'Structurally, he is mostly middle.' },
    { id: 'km',       at: 1000,     name: 'One Kilometre',       note: 'A dog you could get lost in.' },
    { id: 'everest',  at: 8849,     name: 'Everest',             note: 'Sea level to summit, wagging.' },
    { id: 'marathon', at: 42195,    name: 'Marathon Dog',        note: '42.195 km. He did not run any of it.' },
    { id: 'channel',  at: 34e3 * 3, name: 'Cross-Country',       note: 'Border to border in one dog.' },
    { id: 'mm',       at: 1e6,      name: 'One Megametre',       note: 'A million metres of dog.' },
    { id: 'earth',    at: 12742e3,  name: 'Earth Diameter',      note: 'In one ear and out the other side.' },
    { id: 'moon',     at: 384400e3, name: 'To the Moon',         note: 'Head here. Hind legs there.' },
    { id: 'au',       at: 1.496e11, name: 'One AU',              note: 'Sunlight takes eight minutes. He is already there.' },
    { id: 'ly',       at: 9.461e15, name: 'A Light-Year',        note: 'Still no sign of the tail.' },
    { id: 'ly1000',   at: 9.461e18, name: 'A Thousand Light-Years', note: 'You are being very thorough about this.' }
  ];

  /* Deeds — earned by doing things rather than by scrolling. */
  var DEEDS = [
    { id: 'turbo',  name: 'Stretch Assist',   note: 'Used the stretch button. No judgement.' },
    { id: 'home',   name: 'Good Boy',         note: 'Went all the way back to say hello.' },
    { id: 'sound',  name: 'Bark Enabled',     note: 'Turned the sound on.' },
    { id: 'share',  name: 'Word of Mouth',    note: 'Told somebody about the dog.' },
    { id: 'tail',   name: 'The Tail Hunt',    note: 'Looked for the tail. It is not there.' },
    { id: 'boop',   name: 'Boop',             note: 'Booped the nose.' }
  ];

  global.LD = {
    M0: M0, DOUBLE: DOUBLE,
    depthAt: depthAt, scrollAt: scrollAt, mppAt: mppAt,
    ZONES: ZONES, zoneAt: zoneAt,
    comparison: comparison, fmt: fmt, group: group,
    MILESTONES: MILESTONES, DEEDS: DEEDS
  };
})(window);
