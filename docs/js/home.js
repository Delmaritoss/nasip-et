/* Nasip Et home: page-local choreography. The engine stays untouched; this
   reads scroll position itself and drives the bespoke moves:
   1 the camera lowering onto the table, 3 plates settling on the rail,
   4 the testi cracking open (signature move), 5 plates landing on your table,
   6 the cloth pulled off the table to the lane. */
(function () {
  'use strict';
  var doc = document;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var vw = innerWidth, vh = innerHeight;
  var DPR = Math.min(1.5, window.devicePixelRatio || 1);
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var easeIn = function (t) { return t * t; };
  function pinnedP(el) {
    var r = el.getBoundingClientRect();
    var travel = Math.max(1, r.height - vh);
    return { p: clamp01(-r.top / travel), top: r.top, bottom: r.bottom, near: r.top < vh * 1.5 && r.bottom > -vh * 0.5 };
  }

  // A soft white puff, drawn once and stamped many times (steam and smoke).
  var puff = (function () {
    var c = doc.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  })();
  var flame = (function () {
    var c = doc.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,244,214,1)'); gr.addColorStop(0.25, 'rgba(255,184,77,0.85)');
    gr.addColorStop(0.6, 'rgba(232,96,28,0.35)'); gr.addColorStop(1, 'rgba(160,30,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  })();

  function sizeCanvas(cv) {
    var r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * DPR)); cv.height = Math.max(1, Math.round(r.height * DPR));
    return { w: r.width, h: r.height, ctx: cv.getContext('2d') };
  }

  // ===================================================== 1 · SEATED (camera)
  var seatedAct = doc.getElementById('seated');
  var seated = seatedAct && seatedAct.querySelector('[data-camera]');
  var cam = { items: [], focus: null, cloth: null, steam: null, parts: [] };

  function layoutSeated() {
    if (!seated) return;
    var sr = seated.getBoundingClientRect();
    cam.W = sr.width; cam.H = sr.height;
    cam.cloth = seated.querySelector('.seated__cloth');
    // Align the hero's own cloth with the table cloth behind it, so the two are one cloth at rest.
    var tile = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--tile')) || 168;
    cam.cloth.style.setProperty('--bx', (cam.W % tile) + 'px');
    cam.cloth.style.setProperty('--by', (cam.H % tile) + 'px');
    cam.items = [];
    seated.querySelectorAll('[data-h]').forEach(function (el) {
      if (el === cam.cloth) return;
      el.style.transform = 'none';
      var r = el.getBoundingClientRect();
      cam.items.push({ el: el, h: parseFloat(el.getAttribute('data-h')) || 0, x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 });
      if (el.hasAttribute('data-focus')) cam.focus = cam.items[cam.items.length - 1];
    });
    var sc = seated.querySelector('[data-steam]');
    if (sc) cam.steam = sizeCanvas(sc);
  }

  function drawSeated(p) {
    if (!seated || !cam.focus) return;
    var e = ease(p);
    var D = 1 - 0.6 * e;                        // camera height, 1 = at rest
    var Cx = cam.W / 2, Cy = cam.H / 2;
    var Fx = lerp(Cx, cam.focus.x, e), Fy = lerp(Cy, cam.focus.y, e);
    // the cloth: origin top-left of a 3x box placed at (-W, -H)
    var s0 = 1 / D, Ox = -cam.W, Oy = -cam.H;
    var Tx = Cx - Ox - s0 * (Fx - Ox), Ty = Cy - Oy - s0 * (Fy - Oy);
    cam.cloth.style.transform = 'translate3d(' + Tx.toFixed(2) + 'px,' + Ty.toFixed(2) + 'px,0) scale(' + s0.toFixed(4) + ')';
    cam.items.forEach(function (it) {
      var s = (1 - it.h) / (D - it.h);         // taller things grow faster: that is the depth
      var dx = Cx + (it.x - Fx) * s - it.x, dy = Cy + (it.y - Fy) * s - it.y;
      it.sx = it.x + dx; it.sy = it.y + dy; it.s = s;
      it.el.style.transform = 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(' + s.toFixed(4) + ')';
    });
    cam.e = e;
  }
  var haze = seated && seated.querySelector('[data-haze]');
  function hazeSeated(p, top) {
    if (!haze) return;
    var travel = seatedAct.offsetHeight - vh;
    var exit = clamp01(-(top + travel) / (vh * 0.5));     // 0 while pinned, 1 half a screen after
    haze.style.opacity = (clamp01((p - 0.74) / 0.22) * 0.96).toFixed(3);
    seated.style.opacity = (1 - exit).toFixed(3);
  }

  function stepSteam(dt) {
    var st = cam.steam; if (!st || !cam.focus) return;
    var g = st.ctx, e = cam.e || 0, W = st.w, H = st.h;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
    var f = cam.focus, fs = f.s || 1;
    // steam off the pide, plus the camera moving into it near the end
    var rate = 3 + 10 * e, near = clamp01((e - 0.5) / 0.5);
    for (var k = 0; k < rate * dt * 6; k++) {
      if (cam.parts.length > 160) break;
      var big = Math.random() < near * 0.6;
      cam.parts.push({
        x: (f.sx || f.x) + (Math.random() - 0.5) * 120 * fs, y: (f.sy || f.y) + (Math.random() - 0.5) * 40 * fs,
        vx: (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 10,
        r: (big ? 120 : 24) * (0.6 + Math.random() * 0.8) * fs, g: big ? 90 : 26,
        life: 0, max: 2.2 + Math.random() * 1.8, a: big ? 0.22 : 0.3
      });
    }
    for (var i = cam.parts.length - 1; i >= 0; i--) {
      var q = cam.parts[i];
      q.life += dt; if (q.life > q.max) { cam.parts.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.g * dt;
      var t = q.life / q.max, a = q.a * Math.sin(Math.PI * t);
      g.globalAlpha = a; g.drawImage(puff, q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
    }
    g.globalAlpha = 1;
  }

  // ======================================================== 3 · RAIL settle
  var railAct = doc.getElementById('oven');
  var dishes = railAct ? Array.prototype.slice.call(railAct.querySelectorAll('.dish')) : [];
  function drawRail() {
    dishes.forEach(function (d) {
      var r = d.getBoundingClientRect();
      d.style.setProperty('--settle', clamp01((vw - r.left) / (vw * 0.42)).toFixed(3));
    });
  }

  // ========================================================= 4 · TESTI crack
  var testiAct = doc.getElementById('testi');
  var testi = testiAct && {
    pot: testiAct.querySelector('.testi__pot'),
    lid: testiAct.querySelector('.pot__lid'),
    lidShadow: testiAct.querySelector('.pot__lid-shadow'),
    path: testiAct.querySelector('.pot__crack path'),
    fireCv: testiAct.querySelector('.pot__fire'),
    fire: null, sparks: [], smoke: [], p: 0
  };
  if (testi) {
    // The crack: a jagged ring round the neck, the way the knife goes round it.
    var pts = [], N = 56, R = 25.6, seed = 7;
    var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (var i = 0; i <= N; i++) {
      var a = -Math.PI * 0.62 + (i / N) * Math.PI * 2;
      var rr = R + (i % N === 0 ? 0 : (rnd() - 0.5) * 2.2);
      pts.push((50 + Math.cos(a) * rr).toFixed(2) + ' ' + (50 + Math.sin(a) * rr).toFixed(2));
    }
    testi.path.setAttribute('d', 'M' + pts.join(' L'));
  }

  function drawTesti(p) {
    var T = testi; if (!T) return;
    T.p = p;
    var c = ease(clamp01((p - 0.28) / 0.22));
    T.path.style.setProperty('--crack', (1 - c).toFixed(4));
    T.pot.style.setProperty('--seal', (1 - clamp01((p - 0.40) / 0.12)).toFixed(3));
    var shake = p > 0.44 && p < 0.53 ? Math.sin(p * 900) * 1.1 : 0;
    var l = easeIn(clamp01((p - 0.52) / 0.2));
    var narrow = vw < 760;
    var tx = l * (narrow ? 30 : 24) * vw / 100, ty = -l * (narrow ? 42 : 46) * vh / 100;
    T.lid.style.transform = 'translate3d(' + (tx + shake).toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) rotate(' + (l * 34).toFixed(2) + 'deg) scale(' + (1 + l * 2.6).toFixed(3) + ')';
    T.lid.style.opacity = (1 - clamp01((l - 0.8) / 0.2)).toFixed(3);
    var so = 0.65 * Math.min(1, l * 5) * (1 - l);
    T.lidShadow.style.opacity = so.toFixed(3);
    T.lidShadow.style.transform = 'translate3d(' + (l * 0.05 * vw).toFixed(1) + 'px,' + (l * 0.07 * vh).toFixed(1) + 'px,0) scale(' + (1 + l * 0.9).toFixed(3) + ')';
    T.pot.style.translate = shake ? (shake * 0.6).toFixed(2) + 'px 0' : '';
    // fire: a burst as the seal goes, then embers, then the stew steaming
    var burst = clamp01((p - 0.53) / 0.07);
    var fall = clamp01((p - 0.66) / 0.18);
    T.fireLevel = burst * lerp(1, 0.12, fall);
    T.steamLevel = clamp01((p - 0.68) / 0.15);
  }

  function stepFire(dt) {
    var T = testi; if (!T || !T.fire) return;
    var g = T.fire.ctx, W = T.fire.w, H = T.fire.h, cx = W / 2, cy = H / 2;
    var neck = W / 2.2 * 0.25;                  // the pot is 1/2.2 of the canvas; the neck is a quarter of it
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
    var lvl = T.fireLevel || 0, st = T.steamLevel || 0;
    var n = lvl * 90 * dt * 6;
    for (var k = 0; k < n && T.sparks.length < 220; k++) {
      var a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * neck * 0.9;
      T.sparks.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18 - 6,
        r: neck * (0.22 + Math.random() * 0.3), g: neck * (0.9 + Math.random()), life: 0, max: 0.45 + Math.random() * 0.5 });
    }
    for (var j = 0; j < st * 14 * dt * 6 && T.smoke.length < 90; j++) {
      var b = Math.random() * Math.PI * 2, r2 = Math.sqrt(Math.random()) * neck * 0.8;
      T.smoke.push({ x: cx + Math.cos(b) * r2, y: cy + Math.sin(b) * r2, vx: (Math.random() - 0.5) * 10, vy: -8 - Math.random() * 8,
        r: neck * 0.3, g: neck * 0.55, life: 0, max: 2 + Math.random() * 1.5 });
    }
    g.globalCompositeOperation = 'lighter';
    for (var i = T.sparks.length - 1; i >= 0; i--) {
      var s = T.sparks[i]; s.life += dt; if (s.life > s.max) { T.sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.g * dt;
      var t = s.life / s.max; g.globalAlpha = (1 - t) * (0.55 + lvl * 0.45);
      g.drawImage(flame, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    for (var m = T.smoke.length - 1; m >= 0; m--) {
      var q = T.smoke[m]; q.life += dt; if (q.life > q.max) { T.smoke.splice(m, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.g * dt;
      g.globalAlpha = 0.2 * Math.sin(Math.PI * q.life / q.max); g.drawImage(puff, q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
    }
    g.globalAlpha = 1;
  }

  // ===================================================== 5 · YOUR TABLE
  var mytable = doc.querySelector('[data-mytable]');
  var FOOD = { lahmacun: 'lahmacun', pide: 'pide', kebab: 'platter', specials: 'platter', testi: 'platter', fish: 'platter',
    meze: 'meze', salad: 'salad', 'soup-breakfast': 'soup', dessert: 'kunefe', durum: 'plate', pizza: 'plate', pasta: 'plate',
    fruit: 'salad', hookah: 'plate', 'hot-drinks': 'tea', 'cold-drinks': 'tea', mocktails: 'tea' };
  var SIZE = { pide: 1.5, platter: 1.25, tea: 0.62, lahmacun: 1.15, meze: 0.85, soup: 0.85 };
  var order = [];
  function plateSlot(i, W, H) {
    // sunflower packing from the middle of the cloth outward; past ~14 dishes they start to overlap, like a real full table
    var a = i * 2.39996 + 0.6, r = Math.min(1, Math.sqrt((i + 0.35) / 13));
    var ax = W > H ? 41 : 38, ay = W > H ? 40 : 42;
    return { x: 50 + Math.cos(a) * r * ax, y: 50 + Math.sin(a) * r * ay };
  }
  function syncTable(ev) {
    if (!mytable || !window.NasipTable) return;
    var st = window.NasipTable.state, M = window.NasipTable.menu;
    order = order.filter(function (id) { return st[id]; });
    Object.keys(st).forEach(function (id) { if (order.indexOf(id) === -1) order.push(id); });
    mytable.classList.toggle('has-food', order.length > 0);
    var W = mytable.clientWidth, H = mytable.clientHeight;
    mytable.querySelectorAll('.tplate').forEach(function (n) { if (!st[n.dataset.id]) n.remove(); });
    order.forEach(function (id, i) {
      var it = M[id]; var kind = FOOD[it.s] || 'plate';
      if (id === 'cold-drinks-ayran') kind = 'ayran';
      var n = mytable.querySelector('.tplate[data-id="' + id + '"]');
      if (!n) {
        n = doc.createElement('div'); n.className = 'tplate'; n.dataset.id = id;
        n.innerHTML = '<div class="food food--' + kind + '"><span lang="tr"></span></div><span class="tplate__qty"></span>';
        n.querySelector('span[lang]').textContent = it.tr;
        n.style.setProperty('--tw', 'calc(' + (SIZE[kind] || 1) + ' * var(--tbase, 9.5rem))');
        n.style.rotate = ((i * 47) % 24 - 12) + 'deg';
        mytable.appendChild(n);
      }
      var s = plateSlot(i, W, H);
      n.style.left = s.x + '%'; n.style.top = s.y + '%';
      var q = st[id];
      var badge = n.querySelector('.tplate__qty');
      badge.textContent = '× ' + q; badge.hidden = q < 2;
    });
  }
  doc.addEventListener('nasip:table', syncTable);

  // =========================================================== 6 · THE LANE
  var laneAct = doc.getElementById('find');
  var cloth = doc.getElementById('cloth');
  var fold = cloth && cloth.querySelector('.cloth__fold');
  var lane = doc.getElementById('lane');
  var laneFar = lane && lane.querySelector('.lane__far'), laneDoor = lane && lane.querySelector('.lane__door'), laneNear = lane && lane.querySelector('.lane__near');
  var laneStage = laneAct && laneAct.querySelector('[data-lane]');
  function drawLane(info) {
    // The pull starts while the stage is still sliding in (its top at 60% of the screen) and is done
    // 45% into the pin, so the transparent stage never shows a screen of bare cloth.
    var travel = Math.max(1, laneAct.offsetHeight - vh);
    var k = info.k !== undefined ? info.k : ease(clamp01((vh * 0.85 - info.top) / (vh * 0.85 + travel * 0.45)));
    cloth.style.transform = k ? 'translate3d(0,' + (-k * 112).toFixed(2) + '%,0) rotate(' + (-k * 2.4).toFixed(2) + 'deg)' : '';
    if (fold) fold.style.opacity = (Math.min(1, k * 5) * (1 - k * 0.6)).toFixed(3);
    lane.classList.toggle('is-near', info.top < vh * 1.2);
    // from the table up to eye level: the planes settle at their own rates
    if (laneFar) laneFar.style.transform = 'translate3d(0,' + ((1 - k) * 4).toFixed(2) + '%,0) scale(' + (1.12 - 0.12 * k).toFixed(4) + ')';
    if (laneDoor) laneDoor.style.transform = 'translate3d(0,' + ((1 - k) * 14).toFixed(2) + '%,0) scale(' + (1.2 - 0.2 * k).toFixed(4) + ')';
    if (laneNear) laneNear.style.transform = 'translate3d(0,' + ((1 - k) * 46).toFixed(2) + '%,0)';
    laneStage.style.setProperty('--night-in', clamp01((k - 0.55) / 0.35).toFixed(3));
    doc.body.classList.toggle('is-night', k > 0.55);
  }

  // ============================================================== loop
  var last = performance.now(), visible = true;
  doc.addEventListener('visibilitychange', function () { visible = !doc.hidden; last = performance.now(); });

  function layout() {
    vw = innerWidth; vh = innerHeight;
    layoutSeated();
    if (testi) testi.fire = sizeCanvas(testi.fireCv);
    syncTable();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (seatedAct) {
      var a = pinnedP(seatedAct);
      if (a.near) { drawSeated(reduce ? 0 : a.p); if (!reduce) { stepSteam(dt); hazeSeated(a.p, a.top); } }
    }
    if (railAct && !reduce) { var r = railAct.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) drawRail(); }
    if (testiAct) {
      var t = pinnedP(testiAct);
      if (t.near) { drawTesti(reduce ? 1 : t.p); if (!reduce) stepFire(dt); }
    }
    if (laneAct) {
      var f = pinnedP(laneAct);
      if (f.top < vh * 1.5) drawLane(reduce ? { k: f.top < vh * 0.3 ? 1 : 0, top: f.top } : f);
      else if (cloth.style.transform) drawLane({ k: 0, top: vh * 2 });
    }
  }

  var resizeT;
  addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(layout, 120); });
  function start() { layout(); requestAnimationFrame(frame); }
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(start); else addEventListener('load', start);
})();
