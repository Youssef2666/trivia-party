/**
 * TriviaUtils — Shared utility functions
 * Provides formatting, animation, sanitization, and helper functions.
 */
(function () {
  'use strict';

  // Check if user prefers reduced motion
  var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TriviaUtils = {

    /**
     * Format milliseconds to MM:SS or just SS if under 60 seconds.
     */
    formatTime: function (ms) {
      var totalSeconds = Math.max(0, Math.ceil(ms / 1000));
      if (totalSeconds < 60) {
        return String(totalSeconds);
      }
      var minutes = Math.floor(totalSeconds / 60);
      var seconds = totalSeconds % 60;
      return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    },

    /**
     * Format points with sign: "+150" or "-50".
     */
    formatPoints: function (points) {
      if (points >= 0) return '+' + points;
      return String(points);
    },

    /**
     * Create a timer synced to server time.
     * Returns an object with getRemaining() to calculate time left.
     */
    createTimerSync: function (serverTimestamp, durationMs) {
      var offset = (window.TriviaSocket && window.TriviaSocket.serverTimeOffset) || 0;
      var serverNow = Date.now() + offset;
      var endTime = serverTimestamp + durationMs;
      // Calculate when the timer ends in local time
      var localEndTime = endTime - offset;

      return {
        getRemaining: function () {
          var remaining = localEndTime - Date.now();
          return Math.max(0, remaining);
        },
        getDuration: function () {
          return durationMs;
        },
        getProgress: function () {
          var remaining = localEndTime - Date.now();
          remaining = Math.max(0, remaining);
          return 1 - (remaining / durationMs);
        }
      };
    },

    /**
     * Escape HTML to prevent XSS in user-generated content.
     */
    escapeHtml: function (str) {
      if (!str) return '';
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    },

    /**
     * Generate HTML for a character avatar (animated SVG).
     * sizeClass: 'avatar-sm', 'avatar-md', 'avatar-lg', 'avatar-xl'
     * extraClass: optional mood/state classes (e.g. 'mood-happy')
     */
    generateAvatarHTML: function (avatarId, sizeClass, extraClass) {
      sizeClass = sizeClass || 'avatar-md';
      return '<div class="avatar ' + sizeClass + (extraClass ? ' ' + extraClass : '') + '">' +
        window.TriviaAvatars.svg(avatarId) +
        '</div>';
    },

    /**
     * Kahoot-style shape chip for an answer option (color-blind friendly).
     */
    optionShapeHTML: function (index) {
      var shapes = [
        '<polygon points="12 3 22 21 2 21"/>',                 // triangle
        '<polygon points="12 2 22 12 12 22 2 12"/>',           // diamond
        '<circle cx="12" cy="12" r="10"/>',                    // circle
        '<rect x="3" y="3" width="18" height="18" rx="3"/>'    // square
      ];
      return '<span class="option-shape"><svg viewBox="0 0 24 24">' +
        (shapes[index] || shapes[0]) + '</svg></span>';
    },

    /**
     * Haptic feedback on phones (silently ignored elsewhere).
     */
    vibrate: function (pattern) {
      try {
        if (navigator.vibrate) navigator.vibrate(pattern);
      } catch (e) {}
    },

    /**
     * Create a confetti particle animation inside a container.
     */
    createConfetti: function (container) {
      if (prefersReducedMotion || !container) return;

      var colors = [
        'hsl(265, 90%, 65%)',  // violet
        'hsl(350, 85%, 65%)',  // coral
        'hsl(160, 70%, 55%)',  // mint
        'hsl(45, 90%, 60%)',   // gold
        'hsl(220, 80%, 65%)',  // blue
        'hsl(30, 85%, 60%)'    // orange
      ];

      var particleCount = 60;

      for (var i = 0; i < particleCount; i++) {
        (function (index) {
          var particle = document.createElement('div');
          particle.className = 'confetti-particle';
          var color = colors[index % colors.length];
          var x = (Math.random() - 0.5) * 400;
          var delay = Math.random() * 0.5;
          var rotation = Math.random() * 720 - 360;
          var scale = 0.5 + Math.random() * 0.5;
          var shape = Math.random() > 0.5 ? '50%' : '2px';

          particle.style.cssText =
            'position:absolute;width:10px;height:10px;' +
            'background:' + color + ';' +
            'border-radius:' + shape + ';' +
            'left:50%;top:40%;' +
            'pointer-events:none;' +
            'animation:confetti-fall 1.5s ease-out ' + delay + 's forwards;' +
            '--confetti-x:' + x + 'px;' +
            '--confetti-r:' + rotation + 'deg;' +
            '--confetti-s:' + scale + ';' +
            'opacity:0;';

          container.appendChild(particle);

          // Clean up after animation
          setTimeout(function () {
            if (particle.parentNode) {
              particle.parentNode.removeChild(particle);
            }
          }, 2500);
        })(i);
      }
    },

    /**
     * Animate a numeric value counting up or down inside an element.
     */
    animateValue: function (element, start, end, duration) {
      if (!element) return;
      if (prefersReducedMotion) {
        element.textContent = end;
        return;
      }

      duration = duration || 800;
      var startTime = null;
      var diff = end - start;

      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var progress = Math.min((timestamp - startTime) / duration, 1);
        // Ease out cubic
        var eased = 1 - Math.pow(1 - progress, 3);
        var current = Math.round(start + diff * eased);
        element.textContent = current;

        if (progress < 1) {
          requestAnimationFrame(step);
        }
      }

      requestAnimationFrame(step);
    },

    /**
     * Standard debounce function.
     */
    debounce: function (fn, ms) {
      var timer;
      return function () {
        var ctx = this;
        var args = arguments;
        clearTimeout(timer);
        timer = setTimeout(function () {
          fn.apply(ctx, args);
        }, ms);
      };
    },

    /**
     * Get the CSS class for an option by its index (0–3).
     */
    getOptionClass: function (index) {
      var classes = ['option-a', 'option-b', 'option-c', 'option-d'];
      return classes[index] || 'option-a';
    },

    /**
     * Get the CSS variable name for an option color by index.
     */
    getOptionColor: function (index) {
      var vars = [
        '--color-option-a',
        '--color-option-b',
        '--color-option-c',
        '--color-option-d'
      ];
      return vars[index] || vars[0];
    },

    /**
     * Check if user prefers reduced motion.
     */
    prefersReducedMotion: function () {
      return prefersReducedMotion;
    }
  };

  window.TriviaUtils = TriviaUtils;
})();
