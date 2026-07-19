/**
 * TriviaConfetti — canvas confetti with real physics.
 *
 * Replaces the old DOM-div confetti: every particle carries velocity,
 * gravity, air drag, spin and flutter, drawn on a single <canvas> so
 * hundreds of pieces cost one composited layer instead of hundreds of
 * absolutely-positioned divs.
 *
 * API (positions are viewport fractions 0..1):
 *   burst(x, y, opts)  — one radial pop (correct answer, finish line)
 *   celebrate(opts)    — game-over shower: side cannons + falling rain
 *   stop()             — clear everything immediately
 *
 * Honors prefers-reduced-motion (no-op) and TriviaMotion quality tiers
 * (fewer particles + lower devicePixelRatio cap on weak devices).
 * The rAF loop only runs while particles are alive; the canvas is
 * removed shortly after the last one dies.
 */
(function () {
  'use strict';

  var COLORS = [
    'hsl(265, 90%, 65%)',  // violet
    'hsl(350, 85%, 65%)',  // coral
    'hsl(160, 70%, 55%)',  // mint
    'hsl(45, 90%, 60%)',   // gold
    'hsl(220, 80%, 65%)',  // blue
    'hsl(30, 85%, 60%)'    // orange
  ];

  var GRAVITY = 1350;      // px/s²
  var DRAG = 0.16;         // per-second velocity decay factor

  var canvas = null;
  var ctx = null;
  var particles = [];
  var emitters = [];
  var rafId = null;
  var lastTs = 0;
  var removeTimer = null;

  function reduced() {
    return window.TriviaMotion ? window.TriviaMotion.reduced()
      : (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function quality() {
    return window.TriviaMotion ? window.TriviaMotion.quality() : 'high';
  }

  /** Particle budget multiplier for the current device tier. */
  function budget() {
    var q = quality();
    if (q === 'low') return 0.35;
    if (q === 'medium') return 0.65;
    return 1;
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    var dprCap = quality() === 'high' ? 2 : 1;
    var dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function removeCanvas() {
    if (!canvas) return;
    window.removeEventListener('resize', resize);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null;
    ctx = null;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Spawn one particle.
   * x/y px, angle rad, speed px/s.
   */
  function spawn(x, y, angle, speed, opts) {
    var shapeRoll = Math.random();
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: rand(6, 11) * (opts.scale || 1),
      color: (opts.colors || COLORS)[Math.floor(Math.random() * (opts.colors || COLORS).length)],
      shape: shapeRoll < 0.55 ? 'rect' : (shapeRoll < 0.85 ? 'circle' : 'ribbon'),
      rot: rand(0, Math.PI * 2),
      rotV: rand(-9, 9),              // spin rad/s
      flip: rand(0, Math.PI * 2),     // 3D tumble phase
      flipV: rand(4, 10),
      flutter: rand(40, 90),          // sideways air wobble px/s
      flutterPhase: rand(0, Math.PI * 2),
      life: 0,
      ttl: rand(opts.ttlMin || 1.6, opts.ttlMax || 2.6)
    });
  }

  function step(dt, now) {
    // Emitters (celebrate cannons) fire over time
    for (var e = emitters.length - 1; e >= 0; e--) {
      var em = emitters[e];
      em.acc += em.rate * dt;
      while (em.acc >= 1) {
        em.acc -= 1;
        spawn(em.x(), em.y(), em.angle + rand(-em.spread, em.spread), rand(em.speedMin, em.speedMax), em.opts);
      }
      em.left -= dt;
      if (em.left <= 0) emitters.splice(e, 1);
    }

    var drag = Math.pow(1 - DRAG, dt);
    var h = window.innerHeight;

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life += dt;
      if (p.life >= p.ttl || p.y > h + 30) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += GRAVITY * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += (p.vx + Math.sin(now * 0.001 * 2 + p.flutterPhase) * p.flutter) * dt;
      p.y += p.vy * dt;
      p.rot += p.rotV * dt;
      p.flip += p.flipV * dt;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var fade = p.ttl - p.life < 0.5 ? (p.ttl - p.life) / 0.5 : 1;
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // cos(flip) fakes the 3D tumble of a paper piece
      var squish = Math.cos(p.flip);
      if (p.shape === 'circle') {
        ctx.scale(1, Math.max(0.15, Math.abs(squish)));
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'ribbon') {
        ctx.scale(1, Math.max(0.2, Math.abs(squish)));
        ctx.fillRect(-p.size * 0.22, -p.size, p.size * 0.44, p.size * 2);
      } else {
        ctx.scale(1, squish); // rects flip through 0 — real card tumble
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function loop(ts) {
    if (!canvas) { rafId = null; return; }
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;

    step(dt, ts);
    draw();

    if (particles.length > 0 || emitters.length > 0) {
      rafId = requestAnimationFrame(loop);
    } else {
      rafId = null;
      // Idle: free the canvas soon (a follow-up burst cancels this)
      removeTimer = setTimeout(removeCanvas, 1500);
    }
  }

  function wake() {
    ensureCanvas();
    if (removeTimer) {
      clearTimeout(removeTimer);
      removeTimer = null;
    }
    if (!rafId) {
      lastTs = 0;
      rafId = requestAnimationFrame(loop);
    }
  }

  var TriviaConfetti = {

    /**
     * Radial burst at viewport fraction (x, y).
     * opts: { count, speed, scale, colors, spread }
     */
    burst: function (x, y, opts) {
      if (reduced()) return;
      opts = opts || {};
      wake();
      var px = (x !== undefined ? x : 0.5) * window.innerWidth;
      var py = (y !== undefined ? y : 0.4) * window.innerHeight;
      var count = Math.round((opts.count || 34) * budget());
      var base = opts.speed || 620;
      for (var i = 0; i < count; i++) {
        // Bias upward — bursts feel like pops, not explosions
        var angle = -Math.PI / 2 + rand(-(opts.spread || 1.1), opts.spread || 1.1);
        spawn(px, py, angle, rand(base * 0.35, base), opts);
      }
    },

    /**
     * Game-over shower: two side cannons + a rain curtain for ~2.2s.
     */
    celebrate: function (opts) {
      if (reduced()) return;
      opts = opts || {};
      wake();
      var b = budget();
      var dur = opts.duration || 2.2;

      emitters.push({
        x: function () { return -10; },
        y: function () { return window.innerHeight * rand(0.35, 0.65); },
        angle: -Math.PI * 0.28,
        spread: 0.28,
        speedMin: 750, speedMax: 1150,
        rate: 34 * b, acc: 0, left: dur,
        opts: { ttlMin: 2.0, ttlMax: 3.2, colors: opts.colors }
      });
      emitters.push({
        x: function () { return window.innerWidth + 10; },
        y: function () { return window.innerHeight * rand(0.35, 0.65); },
        angle: -Math.PI * 0.72,
        spread: 0.28,
        speedMin: 750, speedMax: 1150,
        rate: 34 * b, acc: 0, left: dur,
        opts: { ttlMin: 2.0, ttlMax: 3.2, colors: opts.colors }
      });
      emitters.push({
        x: function () { return window.innerWidth * Math.random(); },
        y: function () { return -14; },
        angle: Math.PI / 2,
        spread: 0.15,
        speedMin: 60, speedMax: 190,
        rate: 26 * b, acc: 0, left: dur * 1.25,
        opts: { ttlMin: 2.6, ttlMax: 3.8, colors: opts.colors }
      });
    },

    stop: function () {
      particles = [];
      emitters = [];
      if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  };

  window.TriviaConfetti = TriviaConfetti;
})();
