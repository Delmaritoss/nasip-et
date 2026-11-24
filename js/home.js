/* Nasip Et V2 home: page-local choreography (the engine stays untouched).
   1 the lamps light one by one, sway with the hand and with the scroll, and the camera
     lowers past them into the red room; 2 photos drift inside their arches;
   4 the walking map draws itself; 5 the terrace lights come on. */
(function () {
  'use strict';
  var doc = document;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = matchMedia('(max-width: 760px)');
  var de = document.documentElement;
  var vw = de.clientWidth, vh = innerHeight;
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var smooth = function (a, b, v) { return ease(clamp01((v - a) / (b - a))); };
  function pinned(el) {
    var r = el.getBoundingClientRect();
    return { p: clamp01(-r.top / Math.max(1, r.height - vh)), top: r.top, bottom: r.bottom, travel: r.height - vh };
  }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

  // ============================================================ 1 · LAMPS
  var heroAct = doc.getElementById('lamps');
  var hero = heroAct && heroAct.querySelector('[data-hero]');
  var room = hero && hero.querySelector('.hero__room');
  var shade = hero && hero.querySelector('.hero__shade');
  var copy = hero && hero.querySelector('.hero__copy');
  var canvas = hero && hero.querySelector('.hero__light');
  var ctx = canvas && canvas.getContext('2d');
  var DPR = Math.min(1.25, window.devicePixelRatio || 1);
  var GLOBE = 0.70;                          // the globe centre sits at 70% of the render's height
  var RATE = { far: 0.16, mid: 0.42, near: 1.05 };   // how fast each depth rises as the camera lowers
  var SWAY = { far: 0.5, mid: 1, near: 1.6 };
  var lamps = [];
  var t0 = performance.now();

  if (hero) {
    hero.querySelectorAll('.lamp').forEach(function (el, i) {
      var depth = el.getAttribute('data-depth');
      var rgb = hexRgb(el.getAttribute('data-glow') || '#ffcc77');
      var dots = [];
      var n = depth === 'mid' ? 30 : depth === 'far' ? 14 : 0;
      for (var k = 0; k < n; k++) {
        dots.push({ a: Math.random() * Math.PI * 2, r: 1.4 + Math.pow(Math.random(), 0.7) * 3.6, s: 1.2 + Math.random() * 2.6,
          c: Math.random() < 0.3 ? [255, 236, 200] : rgb, o: 0.35 + Math.random() * 0.65 });
      }
      lamps.push({
        el: el, on: el.querySelector('.lamp__on'), depth: depth, order: +el.getAttribute('data-order') || i + 1,
        rgb: rgb, dots: dots, angle: (Math.random() - 0.5) * 0.02, vel: 0, phase: Math.random() * 6.28, lit: reduce ? 1 : 0
      });
    });
  }

  function layoutLamps() {
    var mob = phone.matches;
    var L = mob ? vw * 0.30 : Math.min(vw * 0.12, vh * 0.21);
    lamps.forEach(function (l) {
      var e = l.el;
      var x = +(mob && e.hasAttribute('data-mx') ? e.getAttribute('data-mx') : e.getAttribute('data-x'));
      var hang = +(mob && e.hasAttribute('data-mhang') ? e.getAttribute('data-mhang') : e.getAttribute('data-hang'));
      var s = +(mob && e.hasAttribute('data-ms') ? e.getAttribute('data-ms') : e.getAttribute('data-s'));
      l.w = s * L; l.h = l.w * 1218 / 520;
      l.left = x / 100 * vw - l.w / 2;
      l.top = Math.min(0, hang / 100 * vh - GLOBE * l.h);    // never leave a gap above the chain
      e.style.width = l.w + 'px';
      l.hidden = mob && e.hasAttribute('data-mhide');
    });
    if (canvas) { canvas.width = Math.round(vw * DPR); canvas.height = Math.round(vh * DPR); }
  }

  // a bulb warming up: up, a stutter, then steady
  function lightCurve(t) {
    if (t <= 0) return 0;
    if (t < 0.07) return t / 0.07 * 0.75;
    if (t < 0.16) return 0.75 - (t - 0.07) / 0.09 * 0.6;
    if (t < 0.42) return 0.15 + (t - 0.16) / 0.26 * 0.85;
    return 1;
  }

  // the pointer pushes the lamps near it; they swing back on a damped spring
  var lastPX = null, lastPT = 0, lastY = scrollY, lastYT = performance.now();
  addEventListener('pointermove', function (e) {
    if (reduce || e.pointerType === 'touch') return;
    var now = performance.now();
    if (lastPX !== null) {
      var vx = (e.clientX - lastPX) / Math.max(8, now - lastPT);
      lamps.forEach(function (l) {
        var cx = l.left + l.w / 2;
        var near = Math.max(0, 1 - Math.abs(e.clientX - cx) / (vw * 0.35));
        l.vel += vx * 0.012 * near * SWAY[l.depth];
      });
    }
    lastPX = e.clientX; lastPT = now;
  }, { passive: true });

  var awake = false;
  function drawHero(info, dt, now) {
    var t = (now - t0) / 1000;
    var p = reduce ? 0 : info.p;
    var e = ease(p);
    // scroll speed is a push too, so the lamps swing on phones as well
    var sv = (scrollY - lastY) / Math.max(1, now - lastYT); lastY = scrollY; lastYT = now;
    var litSum = 0, n = 0;
    lamps.forEach(function (l) {
      if (l.hidden) return;
      if (!reduce) {
        l.lit = lightCurve(t - 0.35 - (l.order - 1) * 0.2);
        l.vel += -sv * 0.004 * SWAY[l.depth];
        var breeze = Math.sin(t * 0.7 + l.phase) * 0.0035 * SWAY[l.depth];
        var acc = -16 * (l.angle - breeze) - 2.1 * l.vel;
        l.vel += acc * dt; l.angle += l.vel * dt;
        l.angle = Math.max(-0.12, Math.min(0.12, l.angle));
      }
      litSum += l.lit; n++;
      var dy = -e * RATE[l.depth] * vh;
      var sc = l.depth === 'near' ? 1 + e * 0.3 : 1;
      l.y = l.top + dy;
      l.el.style.transform = 'translate3d(' + l.left.toFixed(1) + 'px,' + l.y.toFixed(1) + 'px,0) rotate(' + (l.angle * 57.3).toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
      l.on.style.opacity = l.lit.toFixed(3);
    });
    var avg = n ? litSum / n : 1;
    if (!awake && (avg > 0.25 || reduce)) { awake = true; hero.classList.add('is-awake'); }
    // the room: dark until the lamps are on, then it opens up as the camera comes down (first third),
    // then the film walks you in under the chandeliers (the rest)
    var down = ease(clamp01(p / 0.34));
    var open = smooth(0.06, 0.3, p);
    shade.style.opacity = ((1 - 0.3 * avg) * (1 - 0.9 * open)).toFixed(3);
    room.style.transform = 'scale(' + (1.2 - 0.2 * down).toFixed(4) + ')';
    copy.style.transform = 'translate3d(0,' + (-down * 0.42 * vh).toFixed(1) + 'px,0)';
    copy.style.opacity = (1 - smooth(0.05, 0.2, p)).toFixed(3);
    scrubFilm(p);
    if (ctx) drawLight(down);
  }

  // ---- the owner's film of the room, scrubbed by the hand. Fetched as a blob so seeking never waits
  // on the network; the playhead is lerped and seeks are coalesced, like the engine's own clips.
  var film = hero && hero.querySelector('.hero__film');
  var fs = { want: false, loading: false, ready: false, dur: 0, cur: 0, shown: false };
  function loadFilm() {
    if (!film || fs.loading || reduce) return;
    fs.loading = true;
    var src = phone.matches ? film.getAttribute('data-film-m') : film.getAttribute('data-film');
    fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
      film.src = URL.createObjectURL(b);
      film.addEventListener('loadedmetadata', function () {
        fs.dur = film.duration || 0;
        // iOS shows no frame for a muted video that was never played: play once, then pause
        var go = function () { fs.ready = true; };
        var pr = film.play(); if (pr && pr.then) pr.then(function () { film.pause(); go(); }, go); else { film.pause(); go(); }
      }, { once: true });
      film.addEventListener('seeked', function () { if (!fs.shown) { fs.shown = true; film.classList.add('is-ready'); } });
      film.load();
    }).catch(function () { fs.loading = false; });
  }
  function scrubFilm(p) {
    if (!film || reduce) return;
    if (!fs.loading && p > 0.02) loadFilm();
    if (!fs.ready || !fs.dur) return;
    var target = smooth(0.28, 1, p) * (fs.dur - 0.05);
    fs.cur += (target - fs.cur) * 0.2;
    if (Math.abs(fs.cur - film.currentTime) > 0.012 && !film.seeking) film.currentTime = fs.cur;
    else if (!fs.shown && !film.seeking) film.currentTime = Math.max(0.001, fs.cur);
  }
  if (film && !reduce) setTimeout(loadFilm, 2200);     // after the lamps have lit, not before

  function drawLight(e) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'lighter';
    lamps.forEach(function (l) {
      if (l.hidden || l.lit <= 0.01) return;
      var d = GLOBE * l.h;
      var gx = l.left + l.w / 2 - Math.sin(l.angle) * d, gy = l.y + Math.cos(l.angle) * d;
      if (gy < -l.h || gy > vh + l.h) return;
      var R = l.w * (l.depth === 'near' ? 1.1 : 1.9);
      var a = (l.depth === 'far' ? 0.22 : l.depth === 'mid' ? 0.34 : 0.18) * l.lit;
      var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
      g.addColorStop(0, 'rgba(' + l.rgb + ',' + a + ')'); g.addColorStop(0.35, 'rgba(' + l.rgb + ',' + (a * 0.35) + ')'); g.addColorStop(1, 'rgba(' + l.rgb + ',0)');
      ctx.fillStyle = g; ctx.fillRect(gx - R, gy - R, R * 2, R * 2);
      // the coloured spots a mosaic lamp throws on the walls; they swing wider than the lamp does
      var gr = l.w * 0.36;
      for (var i = 0; i < l.dots.length; i++) {
        var dot = l.dots[i];
        var ang = dot.a + l.angle * 3.2;
        var x = gx + Math.cos(ang) * dot.r * gr * 1.6, y = gy + Math.sin(ang) * dot.r * gr;
        var al = l.lit * dot.o * 0.5 * (1 - dot.r / 5.5) * (1 - e * 0.6);
        if (al <= 0.01) continue;
        ctx.fillStyle = 'rgba(' + dot.c + ',' + al.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x, y, dot.s, 0, 6.283); ctx.fill();
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  // ============================================================= 2 · ROOM
  var roomAct = doc.getElementById('room');
  var arches = roomAct ? Array.prototype.slice.call(roomAct.querySelectorAll('.arch')) : [];
  function drawRoom() {
    arches.forEach(function (a) {
      var r = a.getBoundingClientRect();
      var c = (r.left + r.width / 2 - vw / 2) / vw;          // -1 .. 1 across the screen
      a.style.setProperty('--drift', (c * -9).toFixed(2) + '%');
    });
  }

  // ============================================================= 4 · WALK
  var walkAct = doc.getElementById('walk');
  var routes = walkAct ? walkAct.querySelectorAll('.walk__route') : [];
  var stops = walkAct ? walkAct.querySelectorAll('[data-at]') : [];
  function drawWalk(p) {
    routes.forEach(function (r) {
      var k = r.getAttribute('data-route');
      if (k === 'a') r.style.setProperty('--d', (1 - smooth(0.08, 0.55, p)).toFixed(4));
      if (k === 'b') r.style.setProperty('--d', (1 - smooth(0.22, 0.86, p)).toFixed(4));
      if (k === 'c') r.style.setProperty('--d-op', smooth(0.14, 0.3, p).toFixed(3));
    });
    stops.forEach(function (s) { s.classList.toggle('is-on', p >= +s.getAttribute('data-at')); });
  }

  // 5 · the sign at the end is an engine scrub act: nothing to drive here.

  // ============================================================= loop
  var last = performance.now(), visible = true;
  doc.addEventListener('visibilitychange', function () { visible = !doc.hidden; last = performance.now(); });
  function layout() { vw = de.clientWidth; vh = innerHeight; layoutLamps(); }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (heroAct) { var h = pinned(heroAct); if (h.bottom > -vh * 0.2) drawHero(h, dt, now); }
    if (roomAct && !reduce) { var r = roomAct.getBoundingClientRect(); if (r.top < vh && r.bottom > 0) drawRoom(); }
    if (walkAct) { var w = pinned(walkAct); if (w.top < vh && w.bottom > 0) drawWalk(reduce ? 1 : w.p); }
  }
  var rt;
  addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 120); });
  addEventListener('load', layout);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(layout);
  layout();
  // review hook: ?shot=<viewport-heights> opens the page already scrolled there (used for screenshots)
  var shot = /[?&]shot=([\d.]+)/.exec(location.search);
  if (shot) {
    // headless capture: lamps already lit, frames driven by a timer (virtual time does not tick rAF reliably)
    t0 = performance.now() - 60000;
    doc.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, parseFloat(shot[1]) * vh);
    setInterval(function () { frame(performance.now()); }, 16);
  }
  requestAnimationFrame(frame);
})();
