/**
 * TriviaMotion — shared motion core.
 *
 * 1. FPS-adaptive quality: a lightweight rAF probe measures real frame
 *    times and stamps <html data-quality="high|medium|low">. CSS sheds
 *    expensive effects (particles, sweeps, blurs) on weaker devices so
 *    the game stays smooth — jank kills the "realism" faster than any
 *    missing sparkle. Downgrades need 2 bad windows (hysteresis),
 *    upgrades need 3 good ones, so the tier never flaps.
 * 2. tween()/countUp(): rAF interpolation helpers with spring/ease
 *    curves for anything CSS transitions can't drive (numbers, canvas).
 *
 * Both honor prefers-reduced-motion live (not just at load).
 */
(function () {
  'use strict';

  var reducedQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function isReduced() {
    return Boolean(reducedQuery && reducedQuery.matches);
  }

  // ── Easing library ─────────────────────────────────────────────
  var EASE = {
    linear: function (t) { return t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    outQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    // Overshoots ~10% then settles — the "weighted UI" spring
    spring: function (t) {
      var c1 = 1.70158;
      var c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  };

  // ── FPS probe → data-quality tier ──────────────────────────────
  var WINDOW_FRAMES = 50;      // frames per measurement window
  var tier = 'high';
  var frameCount = 0;
  var windowStart = 0;
  var badStreak = 0;
  var goodStreak = 0;
  var probeRunning = false;

  function applyTier(next) {
    if (next === tier) return;
    tier = next;
    document.documentElement.setAttribute('data-quality', tier);
  }

  function probe(now) {
    if (document.hidden) {
      // Tab in background: frame times lie. Pause; visibilitychange restarts.
      probeRunning = false;
      return;
    }

    if (!windowStart) {
      windowStart = now;
      frameCount = 0;
    } else {
      frameCount++;
      if (frameCount >= WINDOW_FRAMES) {
        var fps = (frameCount * 1000) / (now - windowStart);
        windowStart = now;
        frameCount = 0;

        if (fps < 34) {
          badStreak++;
          goodStreak = 0;
          if (badStreak >= 2) applyTier('low');
          else if (tier === 'high') applyTier('medium');
        } else if (fps < 50) {
          badStreak = 0;
          goodStreak = 0;
          if (tier === 'high') applyTier('medium');
        } else {
          badStreak = 0;
          goodStreak++;
          if (goodStreak >= 3 && tier !== 'high') {
            applyTier(tier === 'low' ? 'medium' : 'high');
            goodStreak = 0;
          }
        }
      }
    }
    requestAnimationFrame(probe);
  }

  function startProbe() {
    if (probeRunning || isReduced()) return;
    probeRunning = true;
    windowStart = 0;
    requestAnimationFrame(probe);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) startProbe();
  });

  document.documentElement.setAttribute('data-quality', tier);
  startProbe();

  // ── Public API ─────────────────────────────────────────────────
  var TriviaMotion = {

    reduced: isReduced,

    /** Current quality tier: 'high' | 'medium' | 'low'. */
    quality: function () {
      return isReduced() ? 'low' : tier;
    },

    ease: EASE,

    /**
     * Animate a value with requestAnimationFrame.
     * opts: { from, to, duration, ease, onUpdate(value, t), onDone() }
     * Returns a cancel function. Reduced motion jumps straight to `to`.
     */
    tween: function (opts) {
      var from = opts.from || 0;
      var to = opts.to !== undefined ? opts.to : 1;
      var duration = opts.duration || 500;
      var ease = EASE[opts.ease] || EASE.outCubic;
      var cancelled = false;

      if (isReduced() || duration <= 0) {
        if (opts.onUpdate) opts.onUpdate(to, 1);
        if (opts.onDone) opts.onDone();
        return function () {};
      }

      var start = null;
      function frame(ts) {
        if (cancelled) return;
        if (!start) start = ts;
        var t = Math.min(1, (ts - start) / duration);
        var v = from + (to - from) * ease(t);
        if (opts.onUpdate) opts.onUpdate(v, t);
        if (t < 1) {
          requestAnimationFrame(frame);
        } else if (opts.onDone) {
          opts.onDone();
        }
      }
      requestAnimationFrame(frame);

      return function () { cancelled = true; };
    },

    /**
     * Count a number up/down inside an element with easing.
     * opts: { duration, ease, format(n) → string }
     */
    countUp: function (element, from, to, opts) {
      if (!element) return function () {};
      opts = opts || {};
      var format = opts.format || function (n) { return String(n); };
      return TriviaMotion.tween({
        from: from,
        to: to,
        duration: opts.duration || 900,
        ease: opts.ease || 'outQuint',
        onUpdate: function (v) { element.textContent = format(Math.round(v)); },
        onDone: function () { element.textContent = format(to); }
      });
    }
  };

  window.TriviaMotion = TriviaMotion;
})();
