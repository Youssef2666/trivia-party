/**
 * TriviaSound — WebAudio sound engine + voice announcer.
 *
 * Everything is synthesized in the browser (no audio files, fully offline):
 *   - SFX: ticks, pops, correct/wrong stingers, bell, golden chime, fanfare…
 *   - Music: lightweight generative loops (lobby groove / question tension)
 *   - Announcer: reads the question aloud via speechSynthesis (Arabic/English).
 *
 * The AudioContext unlocks on the first user gesture (mobile requirement).
 * Preferences persist in localStorage:
 *   sfx: true/false — music: true/false — voice: 'auto' | true | false
 *   ('auto' = only the host device announces, so 8 phones don't talk at once)
 */
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var sfxBus = null;
  var musicBus = null;
  var musicTimer = null;
  var musicStep = 0;
  var musicNext = 0;
  var currentLoop = null;

  var DEFAULT_PREFS = { sfx: true, music: true, voice: 'auto' };
  var prefs = loadPrefs();

  function loadPrefs() {
    try {
      var raw = localStorage.getItem('trivia_sound_prefs');
      var p = raw ? JSON.parse(raw) : {};
      return {
        sfx: typeof p.sfx === 'boolean' ? p.sfx : DEFAULT_PREFS.sfx,
        music: typeof p.music === 'boolean' ? p.music : DEFAULT_PREFS.music,
        voice: (p.voice === true || p.voice === false || p.voice === 'auto') ? p.voice : DEFAULT_PREFS.voice
      };
    } catch (e) {
      return { sfx: true, music: true, voice: 'auto' };
    }
  }

  function savePrefs() {
    try { localStorage.setItem('trivia_sound_prefs', JSON.stringify(prefs)); } catch (e) {}
  }

  // ────────────────────────────────────────────────────────────
  //  Context management
  // ────────────────────────────────────────────────────────────

  function ensureCtx() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return true;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;

    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = prefs.sfx ? 1 : 0;
    sfxBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = prefs.music ? 1 : 0;
    musicBus.connect(master);
    return true;
  }

  function unlock() {
    if (ensureCtx() && ctx.state === 'suspended') ctx.resume().catch(function () {});
    // If music was requested before unlock, start it now
    if (currentLoop && !musicTimer) startLoopTimer();
  }

  // ────────────────────────────────────────────────────────────
  //  Synth helpers
  // ────────────────────────────────────────────────────────────

  /** Schedule a simple enveloped oscillator. */
  function tone(o) {
    if (!ctx) return;
    var t = ctx.currentTime + (o.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + (o.dur || 0.2));

    var vol = o.vol !== undefined ? o.vol : 0.15;
    var attack = o.attack !== undefined ? o.attack : 0.008;
    var dur = o.dur || 0.2;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    var dest = o.bus || sfxBus;
    if (o.filterFreq) {
      var f = ctx.createBiquadFilter();
      f.type = o.filterType || 'lowpass';
      f.frequency.setValueAtTime(o.filterFreq, t);
      if (o.filterSlideTo) f.frequency.exponentialRampToValueAtTime(o.filterSlideTo, t + dur);
      osc.connect(g); g.connect(f); f.connect(dest);
    } else {
      osc.connect(g); g.connect(dest);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Schedule a filtered noise burst. */
  function noise(o) {
    if (!ctx) return;
    var t = ctx.currentTime + (o.delay || 0);
    var dur = o.dur || 0.2;
    var size = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, size, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = ctx.createGain();
    var vol = o.vol !== undefined ? o.vol : 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    var f = ctx.createBiquadFilter();
    f.type = o.filterType || 'bandpass';
    f.frequency.setValueAtTime(o.filterFreq || 2000, t);
    if (o.filterSlideTo) f.frequency.exponentialRampToValueAtTime(o.filterSlideTo, t + dur);
    f.Q.value = o.q || 0.8;

    src.connect(g); g.connect(f); f.connect(o.bus || sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ────────────────────────────────────────────────────────────
  //  SFX recipes
  // ────────────────────────────────────────────────────────────

  var SFX = {
    tap: function () {
      tone({ freq: 820, slideTo: 620, type: 'sine', dur: 0.06, vol: 0.08 });
    },
    pop: function () {
      tone({ freq: 320, slideTo: 640, type: 'sine', dur: 0.09, vol: 0.16 });
    },
    join: function () {
      tone({ freq: 523, type: 'triangle', dur: 0.1, vol: 0.14 });
      tone({ freq: 784, type: 'triangle', dur: 0.14, vol: 0.14, delay: 0.09 });
    },
    leave: function () {
      tone({ freq: 659, type: 'triangle', dur: 0.1, vol: 0.1 });
      tone({ freq: 392, type: 'triangle', dur: 0.16, vol: 0.1, delay: 0.09 });
    },
    countTick: function () {
      tone({ freq: 660, type: 'square', dur: 0.09, vol: 0.15, filterFreq: 1800 });
    },
    countGo: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, type: 'sawtooth', dur: 0.5, vol: 0.1, delay: i * 0.02, filterFreq: 2400 });
      });
      noise({ dur: 0.35, vol: 0.1, filterFreq: 3000, filterSlideTo: 800 });
    },
    questionIn: function () {
      tone({ freq: 180, slideTo: 760, type: 'sawtooth', dur: 0.32, vol: 0.08, filterFreq: 500, filterSlideTo: 2600 });
      noise({ dur: 0.3, vol: 0.07, filterFreq: 900, filterSlideTo: 3600 });
    },
    select: function () {
      tone({ freq: 500, slideTo: 740, type: 'sine', dur: 0.07, vol: 0.13 });
      tone({ freq: 990, type: 'sine', dur: 0.06, vol: 0.08, delay: 0.06 });
    },
    lastSeconds: function () {
      tone({ freq: 740, type: 'square', dur: 0.05, vol: 0.09, filterFreq: 1500 });
    },
    correct: function () {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.22, vol: 0.16, delay: i * 0.07 });
      });
      noise({ dur: 0.4, vol: 0.05, filterType: 'highpass', filterFreq: 6000, delay: 0.2 });
    },
    wrong: function () {
      tone({ freq: 220, slideTo: 150, type: 'sawtooth', dur: 0.4, vol: 0.13, filterFreq: 700 });
      tone({ freq: 110, slideTo: 70, type: 'sine', dur: 0.35, vol: 0.16, delay: 0.02 });
    },
    timeout: function () {
      tone({ freq: 330, slideTo: 240, type: 'triangle', dur: 0.3, vol: 0.12 });
      tone({ freq: 247, slideTo: 175, type: 'triangle', dur: 0.42, vol: 0.12, delay: 0.3 });
    },
    streak: function () {
      tone({ freq: 420, slideTo: 940, type: 'sine', dur: 0.28, vol: 0.13 });
      noise({ dur: 0.3, vol: 0.05, filterType: 'highpass', filterFreq: 5000, delay: 0.1 });
    },
    powerup: function () {
      tone({ freq: 700, slideTo: 1500, type: 'triangle', dur: 0.18, vol: 0.13 });
      tone({ freq: 1400, type: 'sine', dur: 0.1, vol: 0.08, delay: 0.16 });
      tone({ freq: 1900, type: 'sine', dur: 0.1, vol: 0.06, delay: 0.24 });
    },
    bell: function () {
      tone({ freq: 1318, type: 'triangle', dur: 0.9, vol: 0.2, attack: 0.004 });
      tone({ freq: 1975, type: 'sine', dur: 0.8, vol: 0.1, attack: 0.004 });
      tone({ freq: 3520, type: 'sine', dur: 0.35, vol: 0.05, attack: 0.004 });
    },
    golden: function () {
      [880, 1108, 1318, 1760, 2217].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.5, vol: 0.11, delay: i * 0.09 });
      });
      noise({ dur: 0.7, vol: 0.04, filterType: 'highpass', filterFreq: 7000, delay: 0.3 });
    },
    reveal: function () {
      noise({ dur: 0.18, vol: 0.14, filterFreq: 350, filterType: 'lowpass' });
      tone({ freq: 150, slideTo: 55, type: 'sine', dur: 0.16, vol: 0.2 });
    },
    swoosh: function () {
      noise({ dur: 0.3, vol: 0.09, filterFreq: 600, filterSlideTo: 3200 });
    },
    drumroll: function () {
      for (var i = 0; i < 22; i++) {
        noise({ dur: 0.045, vol: 0.07, filterFreq: 900 + (i % 3) * 250, delay: i * (0.085 - i * 0.0015) });
      }
    },
    fanfare: function () {
      var chords = [
        { fs: [392, 494, 587], t: 0, d: 0.32 },
        { fs: [440, 554, 659], t: 0.3, d: 0.32 },
        { fs: [523, 659, 784, 1047], t: 0.6, d: 1.1 }
      ];
      chords.forEach(function (c) {
        c.fs.forEach(function (f) {
          tone({ freq: f, type: 'sawtooth', dur: c.d, vol: 0.07, delay: c.t, filterFreq: 2600 });
          tone({ freq: f / 2, type: 'triangle', dur: c.d, vol: 0.07, delay: c.t });
        });
      });
      noise({ dur: 1.0, vol: 0.05, filterType: 'highpass', filterFreq: 5500, delay: 0.6 });
    },
    tiebreaker: function () {
      tone({ freq: 98, type: 'sawtooth', dur: 0.5, vol: 0.14, filterFreq: 420 });
      tone({ freq: 98, type: 'sawtooth', dur: 0.5, vol: 0.14, delay: 0.55, filterFreq: 420 });
      tone({ freq: 130.8, type: 'sawtooth', dur: 0.8, vol: 0.16, delay: 1.1, filterFreq: 520 });
      noise({ dur: 0.12, vol: 0.12, filterFreq: 300, delay: 0.0 });
      noise({ dur: 0.12, vol: 0.12, filterFreq: 300, delay: 0.55 });
    },
    reaction: function () {
      tone({ freq: 500 + Math.random() * 500, slideTo: 900 + Math.random() * 500, type: 'sine', dur: 0.08, vol: 0.06 });
    },
    rocket: function () {
      // launch whoosh → impact thud
      noise({ dur: 0.35, vol: 0.12, filterFreq: 700, filterSlideTo: 3800 });
      tone({ freq: 300, slideTo: 900, type: 'sawtooth', dur: 0.3, vol: 0.07, filterFreq: 1200 });
      noise({ dur: 0.25, vol: 0.16, filterFreq: 260, filterType: 'lowpass', delay: 0.34 });
      tone({ freq: 130, slideTo: 45, type: 'sine', dur: 0.3, vol: 0.2, delay: 0.34 });
    },
    shieldBlock: function () {
      // metallic clang
      tone({ freq: 1244, type: 'triangle', dur: 0.25, vol: 0.14, attack: 0.003 });
      tone({ freq: 1865, type: 'sine', dur: 0.18, vol: 0.08, attack: 0.003 });
      noise({ dur: 0.1, vol: 0.08, filterFreq: 5000, filterType: 'highpass' });
    },
    nitro: function () {
      // engine rev-up
      tone({ freq: 90, slideTo: 460, type: 'sawtooth', dur: 0.45, vol: 0.12, filterFreq: 900, filterSlideTo: 2600 });
      noise({ dur: 0.4, vol: 0.06, filterFreq: 1400, filterSlideTo: 4200 });
    },
    eliminate: function () {
      // dramatic elimination sting
      tone({ freq: 220, slideTo: 110, type: 'sawtooth', dur: 0.5, vol: 0.12, filterFreq: 800 });
      tone({ freq: 110, slideTo: 55, type: 'sine', dur: 0.7, vol: 0.16, delay: 0.15 });
      noise({ dur: 0.12, vol: 0.12, filterFreq: 300, filterType: 'lowpass', delay: 0.02 });
    },
    finish: function () {
      // checkered-flag stinger
      [659, 784, 988, 1319].forEach(function (f, i) {
        tone({ freq: f, type: 'triangle', dur: 0.18, vol: 0.14, delay: i * 0.06 });
      });
      noise({ dur: 0.5, vol: 0.06, filterType: 'highpass', filterFreq: 6000, delay: 0.2 });
      tone({ freq: 523, type: 'sawtooth', dur: 0.5, vol: 0.07, delay: 0.28, filterFreq: 2200 });
    },
    engine: function () {
      // the pack roars past — doppler-ish rev sweep
      tone({ freq: 70, slideTo: 210, type: 'sawtooth', dur: 0.8, vol: 0.09, filterFreq: 380, filterSlideTo: 1400 });
      tone({ freq: 105, slideTo: 320, type: 'sawtooth', dur: 0.8, vol: 0.05, delay: 0.08, filterFreq: 500, filterSlideTo: 1800 });
      noise({ dur: 0.85, vol: 0.05, filterFreq: 500, filterSlideTo: 2600 });
    },
    chaseStep: function () {
      // heavy hunter footstep — sub thud + rumble
      tone({ freq: 60, slideTo: 34, type: 'sine', dur: 0.35, vol: 0.26, attack: 0.004 });
      noise({ dur: 0.2, vol: 0.12, filterFreq: 180, filterType: 'lowpass' });
    },
    roar: function () {
      // the chaser's growl when the gap closes
      tone({ freq: 130, slideTo: 55, type: 'sawtooth', dur: 0.7, vol: 0.13, filterFreq: 420, filterSlideTo: 160 });
      tone({ freq: 90, slideTo: 40, type: 'square', dur: 0.65, vol: 0.07, delay: 0.05, filterFreq: 300 });
      noise({ dur: 0.6, vol: 0.08, filterFreq: 350, filterSlideTo: 120 });
    }
  };

  // ────────────────────────────────────────────────────────────
  //  Music loops (16-step patterns, lookahead scheduler)
  // ────────────────────────────────────────────────────────────

  var LOOPS = {
    // Chill lobby groove — Am pentatonic arp over a soft bass
    lobby: {
      bpm: 92,
      step: function (s, t) {
        var arp = [220, 262, 330, 392, 330, 262, 220, 196];
        if (s % 2 === 0) {
          mtone({ freq: arp[(s / 2) % 8], type: 'triangle', dur: 0.24, vol: 0.045, time: t, filterFreq: 1600 });
        }
        if (s % 8 === 0) {
          mtone({ freq: s % 16 === 0 ? 110 : 98, type: 'sine', dur: 0.5, vol: 0.07, time: t });
        }
        if (s % 4 === 2) {
          mnoise({ dur: 0.03, vol: 0.018, filterType: 'highpass', filterFreq: 8000, time: t });
        }
      }
    },
    // Tense question pulse — driving bass eighths + ticking hats
    question: {
      bpm: 126,
      step: function (s, t) {
        var bassLine = [110, 110, 110, 131, 110, 110, 98, 131];
        if (s % 2 === 0) {
          mtone({ freq: bassLine[(s / 2) % 8], type: 'sawtooth', dur: 0.16, vol: 0.05, time: t, filterFreq: 460 });
        }
        if (s % 4 === 0) {
          mnoise({ dur: 0.025, vol: 0.02, filterType: 'highpass', filterFreq: 9000, time: t });
        }
        if (s % 16 === 8) {
          mtone({ freq: 440, type: 'triangle', dur: 0.1, vol: 0.02, time: t });
        }
      }
    }
  };

  function mtone(o) {
    var t = o.time;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    if (o.filterFreq) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filterFreq;
      osc.connect(g); g.connect(f); f.connect(musicBus);
    } else {
      osc.connect(g); g.connect(musicBus);
    }
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  function mnoise(o) {
    var t = o.time;
    var size = Math.max(1, Math.floor(ctx.sampleRate * o.dur));
    var buf = ctx.createBuffer(1, size, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = ctx.createGain();
    g.gain.setValueAtTime(o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    var f = ctx.createBiquadFilter();
    f.type = o.filterType || 'highpass';
    f.frequency.value = o.filterFreq || 8000;
    src.connect(g); g.connect(f); f.connect(musicBus);
    src.start(t); src.stop(t + o.dur + 0.02);
  }

  function startLoopTimer() {
    if (!ctx || !currentLoop) return;
    stopLoopTimer();
    musicStep = 0;
    musicNext = ctx.currentTime + 0.1;
    musicTimer = setInterval(function () {
      if (!ctx || !currentLoop) return;
      var loop = LOOPS[currentLoop];
      if (!loop) return;
      var stepDur = 60 / loop.bpm / 4; // 16th notes
      while (musicNext < ctx.currentTime + 0.15) {
        loop.step(musicStep % 64, musicNext);
        musicNext += stepDur;
        musicStep++;
      }
    }, 40);
  }

  function stopLoopTimer() {
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  // ────────────────────────────────────────────────────────────
  //  Voice announcer (speechSynthesis)
  // ────────────────────────────────────────────────────────────

  var voices = [];
  function refreshVoices() {
    try { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; } catch (e) { voices = []; }
  }
  if (window.speechSynthesis) {
    refreshVoices();
    try { window.speechSynthesis.onvoiceschanged = refreshVoices; } catch (e) {}
  }

  function pickVoice(lang) {
    if (!voices.length) refreshVoices();
    var prefix = lang === 'ar' ? 'ar' : 'en';
    var exact = null, fallback = null;
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i];
      var vl = (v.lang || '').toLowerCase();
      if (vl.indexOf(prefix) === 0) {
        if (!exact) exact = v;
        if (v.localService && !fallback) fallback = v;
      }
    }
    return fallback || exact || null;
  }

  // ────────────────────────────────────────────────────────────
  //  Public API
  // ────────────────────────────────────────────────────────────

  var TriviaSound = {

    /** Call once at app start — arms the first-gesture unlock. */
    init: function () {
      var once = function () {
        unlock();
        document.removeEventListener('pointerdown', once);
        document.removeEventListener('keydown', once);
      };
      document.addEventListener('pointerdown', once);
      document.addEventListener('keydown', once);
    },

    play: function (name) {
      if (!prefs.sfx) return;
      if (!ensureCtx()) return;
      if (ctx.state === 'suspended') return; // not unlocked yet
      var fn = SFX[name];
      if (fn) {
        try { fn(); } catch (e) {}
      }
    },

    /** Start a music loop ('lobby' | 'question') or stop with null. */
    music: function (name) {
      currentLoop = name || null;
      if (!currentLoop) {
        stopLoopTimer();
        return;
      }
      if (!prefs.music) return;
      if (!ensureCtx() || ctx.state === 'suspended') return; // will start on unlock
      startLoopTimer();
    },

    // ── Announcer ──────────────────────────────────────────────
    speak: function (text, lang) {
      if (!window.speechSynthesis || !text) return;
      if (!this.isVoiceOn()) return;
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
        var v = pickVoice(lang);
        if (v) u.voice = v;
        u.rate = 1.0;
        u.pitch = 1.0;
        u.volume = 1.0;
        window.speechSynthesis.speak(u);
      } catch (e) {}
    },

    stopSpeaking: function () {
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
    },

    voiceAvailable: function () {
      return Boolean(window.speechSynthesis);
    },

    /** voice pref 'auto' → announce only on the host device. */
    isVoiceOn: function () {
      if (!window.speechSynthesis) return false;
      if (prefs.voice === true) return true;
      if (prefs.voice === false) return false;
      return Boolean(window.TriviaApp && window.TriviaApp.gameState && window.TriviaApp.gameState.isHost);
    },

    // ── Preferences ────────────────────────────────────────────
    getPrefs: function () {
      return { sfx: prefs.sfx, music: prefs.music, voice: prefs.voice };
    },

    setPref: function (key, value) {
      if (key === 'sfx') {
        prefs.sfx = Boolean(value);
        if (sfxBus) sfxBus.gain.value = prefs.sfx ? 1 : 0;
      } else if (key === 'music') {
        prefs.music = Boolean(value);
        if (musicBus) musicBus.gain.value = prefs.music ? 1 : 0;
        if (prefs.music && currentLoop) {
          if (ensureCtx() && ctx.state !== 'suspended') startLoopTimer();
        } else if (!prefs.music) {
          stopLoopTimer();
        }
      } else if (key === 'voice') {
        prefs.voice = value;
        if (!this.isVoiceOn()) this.stopSpeaking();
      }
      savePrefs();
    }
  };

  window.TriviaSound = TriviaSound;
})();
