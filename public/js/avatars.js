/**
 * TriviaAvatars — hand-crafted animated SVG character avatars.
 *
 * 20 characters, each a self-contained inline SVG (no external assets):
 *   - per-character gradient tile + flat-design mascot
 *   - shared "face rig" (eyes / cheeks / mouth) so every character can
 *     blink (CSS animation on .av-eyes) and switch expressions:
 *       wrapper class .mood-happy → open smile, .mood-sad → frown
 *   - legacy icon ids from v1 (user/cat/dog/...) map to new characters,
 *     unknown ids hash deterministically to a character.
 *
 * Usage:  TriviaAvatars.svg('fox')          → '<svg …>…</svg>'
 *         TriviaAvatars.ids()               → ['cat','dog',…]
 *         TriviaAvatars.info('fox')         → { id, ar, en }
 */
(function () {
  'use strict';

  var LINE = '#2B2140'; // universal dark line/eye color

  // ────────────────────────────────────────────────────────────
  //  Shared face rig
  // ────────────────────────────────────────────────────────────

  /**
   * Build the face (eyes + cheeks + mouths) at the given rig position.
   * opts: { eyeY, mouthY, eyeDX, eyeR, line, sclera, cheeks, cheekY }
   */
  function face(opts) {
    var o = opts || {};
    var eyeY = o.eyeY !== undefined ? o.eyeY : 58;
    var mouthY = o.mouthY !== undefined ? o.mouthY : 71;
    var dx = o.eyeDX !== undefined ? o.eyeDX : 11;
    var r = o.eyeR !== undefined ? o.eyeR : 4.6;
    var line = o.line || LINE;
    var lx = 60 - dx;
    var rx = 60 + dx;
    var s = '';

    // Optional white sclera behind eyes (for dark faces)
    if (o.sclera) {
      s += '<circle cx="' + lx + '" cy="' + eyeY + '" r="' + (r + 3.2) + '" fill="#FFFFFF"/>' +
           '<circle cx="' + rx + '" cy="' + eyeY + '" r="' + (r + 3.2) + '" fill="#FFFFFF"/>';
    }

    // Eyes (blink via CSS on .av-eyes)
    s += '<g class="av-eyes">' +
      '<circle cx="' + lx + '" cy="' + eyeY + '" r="' + r + '" fill="' + line + '"/>' +
      '<circle cx="' + (lx - r * 0.32) + '" cy="' + (eyeY - r * 0.36) + '" r="' + (r * 0.34) + '" fill="#FFFFFF" opacity="0.95"/>' +
      '<circle cx="' + rx + '" cy="' + eyeY + '" r="' + r + '" fill="' + line + '"/>' +
      '<circle cx="' + (rx - r * 0.32) + '" cy="' + (eyeY - r * 0.36) + '" r="' + (r * 0.34) + '" fill="#FFFFFF" opacity="0.95"/>' +
      '</g>';

    // Cheeks
    if (o.cheeks !== false) {
      var cy = o.cheekY !== undefined ? o.cheekY : (eyeY + 8);
      s += '<ellipse cx="' + (lx - 8) + '" cy="' + cy + '" rx="4.6" ry="2.8" fill="#FF8FA3" opacity="0.4"/>' +
           '<ellipse cx="' + (rx + 8) + '" cy="' + cy + '" rx="4.6" ry="2.8" fill="#FF8FA3" opacity="0.4"/>';
    }

    // Mouth set — idle smile / happy open / sad frown
    var my = mouthY;
    s += '<g class="av-m m-idle">' +
      '<path d="M53 ' + my + ' Q60 ' + (my + 6) + ' 67 ' + my + '" stroke="' + line + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '</g>' +
      '<g class="av-m m-happy">' +
      '<path d="M50 ' + (my - 1) + ' Q60 ' + (my + 13) + ' 70 ' + (my - 1) + ' Z" fill="' + line + '"/>' +
      '<path d="M55 ' + (my + 4.5) + ' Q60 ' + (my + 9) + ' 65 ' + (my + 4.5) + ' Z" fill="#FF7B9C"/>' +
      '</g>' +
      '<g class="av-m m-sad">' +
      '<path d="M53 ' + (my + 5) + ' Q60 ' + (my - 2) + ' 67 ' + (my + 5) + '" stroke="' + line + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '</g>';

    return s;
  }

  function tile(id, c1, c2, extraDefs) {
    return '<defs>' +
      '<linearGradient id="avg-' + id + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/>' +
      '</linearGradient>' + (extraDefs || '') +
      '</defs>' +
      '<rect x="2" y="2" width="116" height="116" rx="30" fill="url(#avg-' + id + ')"/>' +
      '<rect x="2" y="2" width="116" height="116" rx="30" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/>';
  }

  // Soft ground shadow under the character
  function shadow() {
    return '<ellipse cx="60" cy="103" rx="26" ry="5" fill="rgba(0,0,0,0.18)"/>';
  }

  // ────────────────────────────────────────────────────────────
  //  Characters
  //  Each entry: { ar, en, g:[c1,c2], draw() → svg body string }
  // ────────────────────────────────────────────────────────────

  var CHARACTERS = {

    cat: {
      ar: 'قط', en: 'Cat', g: ['#FF9A62', '#FF5E7E'],
      draw: function () {
        var fur = '#FFE3C2';
        return '<path d="M34 46 L30 24 L48 36 Z" fill="' + fur + '"/>' +
          '<path d="M36 42 L34 30 L45 37 Z" fill="#FF9FB2"/>' +
          '<path d="M86 46 L90 24 L72 36 Z" fill="' + fur + '"/>' +
          '<path d="M84 42 L86 30 L75 37 Z" fill="#FF9FB2"/>' +
          '<circle cx="60" cy="64" r="31" fill="' + fur + '"/>' +
          '<circle cx="48" cy="46" r="6" fill="#FFFFFF" opacity="0.5"/>' +
          '<path d="M24 60 L38 63 M24 70 L38 69" stroke="' + LINE + '" stroke-width="2" stroke-linecap="round" opacity="0.55"/>' +
          '<path d="M96 60 L82 63 M96 70 L82 69" stroke="' + LINE + '" stroke-width="2" stroke-linecap="round" opacity="0.55"/>' +
          '<path d="M57 64 L63 64 L60 67 Z" fill="#FF7B9C"/>' +
          face({ eyeY: 57, mouthY: 71 });
      }
    },

    dog: {
      ar: 'كلب', en: 'Dog', g: ['#FFC470', '#FF8C42'],
      draw: function () {
        var fur = '#D9A878';
        return '<ellipse cx="31" cy="56" rx="10" ry="17" fill="#8A5A44" transform="rotate(14 31 56)"/>' +
          '<ellipse cx="89" cy="56" rx="10" ry="17" fill="#8A5A44" transform="rotate(-14 89 56)"/>' +
          '<circle cx="60" cy="64" r="31" fill="' + fur + '"/>' +
          '<circle cx="48" cy="46" r="6" fill="#FFFFFF" opacity="0.45"/>' +
          '<ellipse cx="60" cy="72" rx="13" ry="10" fill="#F2DCC1"/>' +
          '<ellipse cx="60" cy="65" rx="5" ry="3.6" fill="' + LINE + '"/>' +
          face({ eyeY: 56, mouthY: 74, cheekY: 66 });
      }
    },

    panda: {
      ar: 'باندا', en: 'Panda', g: ['#7BE0AD', '#2FB98B'],
      draw: function () {
        return '<circle cx="35" cy="40" r="11" fill="' + LINE + '"/>' +
          '<circle cx="85" cy="40" r="11" fill="' + LINE + '"/>' +
          '<circle cx="60" cy="64" r="31" fill="#FFF9F2"/>' +
          '<ellipse cx="49" cy="57" rx="9" ry="11" fill="#4A4160" transform="rotate(-12 49 57)"/>' +
          '<ellipse cx="71" cy="57" rx="9" ry="11" fill="#4A4160" transform="rotate(12 71 57)"/>' +
          '<ellipse cx="60" cy="70" rx="4.6" ry="3.4" fill="' + LINE + '"/>' +
          face({ eyeY: 57, mouthY: 76, sclera: true, cheekY: 70 });
      }
    },

    fox: {
      ar: 'ثعلب', en: 'Fox', g: ['#FF8A4C', '#F4536E'],
      draw: function () {
        var fur = '#FF9E5E';
        return '<path d="M32 52 L26 22 L52 34 Z" fill="' + fur + '"/>' +
          '<path d="M35 46 L31 29 L46 36 Z" fill="' + LINE + '" opacity="0.75"/>' +
          '<path d="M88 52 L94 22 L68 34 Z" fill="' + fur + '"/>' +
          '<path d="M85 46 L89 29 L74 36 Z" fill="' + LINE + '" opacity="0.75"/>' +
          '<circle cx="60" cy="64" r="31" fill="' + fur + '"/>' +
          '<path d="M35 70 Q60 96 85 70 Q77 88 60 88 Q43 88 35 70 Z" fill="#FFF2E2"/>' +
          '<ellipse cx="60" cy="72" rx="4.4" ry="3.4" fill="' + LINE + '"/>' +
          face({ eyeY: 56, mouthY: 77, cheekY: 66 });
      }
    },

    koala: {
      ar: 'كوالا', en: 'Koala', g: ['#9BE7C4', '#4FB3D9'],
      draw: function () {
        var fur = '#B9B4C7';
        return '<circle cx="30" cy="46" r="15" fill="' + fur + '"/>' +
          '<circle cx="30" cy="46" r="8.5" fill="#F5A3B7"/>' +
          '<circle cx="90" cy="46" r="15" fill="' + fur + '"/>' +
          '<circle cx="90" cy="46" r="8.5" fill="#F5A3B7"/>' +
          '<circle cx="60" cy="64" r="30" fill="' + fur + '"/>' +
          '<circle cx="49" cy="47" r="5" fill="#FFFFFF" opacity="0.35"/>' +
          '<ellipse cx="60" cy="66" rx="7" ry="9" fill="' + LINE + '"/>' +
          face({ eyeY: 55, mouthY: 78, cheekY: 64 });
      }
    },

    lion: {
      ar: 'أسد', en: 'Lion', g: ['#FFC93C', '#FF7B33'],
      draw: function () {
        var mane = '#C9761E';
        var s = '';
        for (var a = 0; a < 8; a++) {
          var ang = (Math.PI * 2 * a) / 8 + 0.39;
          var mx = 60 + Math.cos(ang) * 30;
          var my2 = 62 + Math.sin(ang) * 30;
          s += '<circle cx="' + mx.toFixed(1) + '" cy="' + my2.toFixed(1) + '" r="12" fill="' + mane + '"/>';
        }
        s += '<circle cx="60" cy="62" r="27" fill="#FFD98E"/>' +
          '<circle cx="50" cy="47" r="5" fill="#FFFFFF" opacity="0.5"/>' +
          '<path d="M56.5 66 L63.5 66 L60 70 Z" fill="#A85B28"/>' +
          face({ eyeY: 56, mouthY: 73 });
        return s;
      }
    },

    owl: {
      ar: 'بومة', en: 'Owl', g: ['#8D7BFF', '#5D5FEF'],
      draw: function () {
        var body = '#B98A5E';
        return '<path d="M34 42 L28 26 L46 34 Z" fill="' + body + '"/>' +
          '<path d="M86 42 L92 26 L74 34 Z" fill="' + body + '"/>' +
          '<circle cx="60" cy="64" r="31" fill="' + body + '"/>' +
          '<path d="M35 72 Q60 92 85 72 L85 80 Q60 100 35 80 Z" fill="#EAD9C2"/>' +
          '<circle cx="49" cy="58" r="10.5" fill="#F6EBDD"/>' +
          '<circle cx="71" cy="58" r="10.5" fill="#F6EBDD"/>' +
          '<path d="M56 66 L64 66 L60 73 Z" fill="#FF9838"/>' +
          face({ eyeY: 58, mouthY: 78, cheeks: false });
      }
    },

    penguin: {
      ar: 'بطريق', en: 'Penguin', g: ['#6DC7FF', '#3D6BFD'],
      draw: function () {
        return '<ellipse cx="60" cy="66" rx="31" ry="33" fill="#3A3E5B"/>' +
          '<ellipse cx="60" cy="63" rx="23" ry="22" fill="#FFFFFF"/>' +
          '<path d="M55 66 L65 66 L60 73 Z" fill="#FF9838"/>' +
          '<ellipse cx="34" cy="76" rx="6" ry="12" fill="#3A3E5B" transform="rotate(18 34 76)"/>' +
          '<ellipse cx="86" cy="76" rx="6" ry="12" fill="#3A3E5B" transform="rotate(-18 86 76)"/>' +
          face({ eyeY: 57, mouthY: 75, cheekY: 67 });
      }
    },

    frog: {
      ar: 'ضفدع', en: 'Frog', g: ['#7ED957', '#2BA84A'],
      draw: function () {
        var skin = '#86D96C';
        return '<circle cx="44" cy="38" r="10" fill="' + skin + '"/>' +
          '<circle cx="76" cy="38" r="10" fill="' + skin + '"/>' +
          '<path d="M30 64 Q30 36 60 36 Q90 36 90 64 Q90 90 60 90 Q30 90 30 64 Z" fill="' + skin + '"/>' +
          '<circle cx="60" cy="60" r="1" fill="none"/>' +
          '<circle cx="55" cy="62" r="1.8" fill="' + LINE + '" opacity="0.7"/>' +
          '<circle cx="65" cy="62" r="1.8" fill="' + LINE + '" opacity="0.7"/>' +
          face({ eyeY: 40, mouthY: 72, eyeDX: 16, cheekY: 58 });
      }
    },

    octopus: {
      ar: 'أخطبوط', en: 'Octopus', g: ['#C77DFF', '#7C3AED'],
      draw: function () {
        var skin = '#C9A0F0';
        var s = '<path d="M28 66 Q28 32 60 32 Q92 32 92 66 L92 84 Q92 92 84 92 Q60 84 36 92 Q28 92 28 84 Z" fill="' + skin + '"/>';
        for (var i = 0; i < 4; i++) {
          var x = 36 + i * 16;
          s += '<circle cx="' + x + '" cy="92" r="8" fill="' + skin + '"/>' +
               '<circle cx="' + x + '" cy="93.5" r="3.4" fill="#9D6DD8"/>';
        }
        s += '<circle cx="47" cy="44" r="6" fill="#FFFFFF" opacity="0.4"/>' +
          face({ eyeY: 58, mouthY: 72 });
        return s;
      }
    },

    shark: {
      ar: 'قرش', en: 'Shark', g: ['#5EA9FF', '#2D53DF'],
      draw: function () {
        var skin = '#8FB8D8';
        return '<path d="M60 12 L74 38 L48 38 Z" fill="' + skin + '"/>' +
          '<circle cx="60" cy="66" r="30" fill="' + skin + '"/>' +
          '<path d="M33 74 Q60 96 87 74 Q80 92 60 92 Q40 92 33 74 Z" fill="#F2F7FB"/>' +
          '<path d="M30 58 Q34 61 30 64 M90 58 Q86 61 90 64" stroke="#5F87A8" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
          face({ eyeY: 58, mouthY: 74, cheekY: 68 });
      }
    },

    dino: {
      ar: 'ديناصور', en: 'Dino', g: ['#3EDBB4', '#0F9B77'],
      draw: function () {
        var skin = '#6FE0A8';
        var spikes = '#2FBF8F';
        return '<path d="M40 34 Q45 22 52 33 Z" fill="' + spikes + '"/>' +
          '<path d="M54 30 Q60 17 67 30 Z" fill="' + spikes + '"/>' +
          '<path d="M69 33 Q76 22 80 35 Z" fill="' + spikes + '"/>' +
          '<circle cx="60" cy="64" r="31" fill="' + skin + '"/>' +
          '<circle cx="48" cy="46" r="6" fill="#FFFFFF" opacity="0.4"/>' +
          '<circle cx="55" cy="68" r="1.9" fill="' + LINE + '" opacity="0.7"/>' +
          '<circle cx="65" cy="68" r="1.9" fill="' + LINE + '" opacity="0.7"/>' +
          face({ eyeY: 56, mouthY: 76 });
      }
    },

    unicorn: {
      ar: 'يونيكورن', en: 'Unicorn', g: ['#FFA3D7', '#8B5CF6'],
      draw: function () {
        return '<path d="M54 30 L60 6 L66 30 Z" fill="#FFC93C"/>' +
          '<path d="M56.5 22 L63.5 18 M55.5 27 L64.5 23" stroke="#E8960C" stroke-width="2.4" stroke-linecap="round"/>' +
          '<path d="M38 42 L32 26 L48 33 Z" fill="#FFF6FA"/>' +
          '<path d="M82 42 L88 26 L72 33 Z" fill="#FFF6FA"/>' +
          '<circle cx="83" cy="52" r="9" fill="#C77DFF"/>' +
          '<circle cx="89" cy="64" r="8" fill="#FF8FC9"/>' +
          '<circle cx="86" cy="76" r="7" fill="#7CC4FF"/>' +
          '<circle cx="60" cy="64" r="30" fill="#FFF6FA"/>' +
          '<circle cx="48" cy="47" r="5.6" fill="#FFFFFF"/>' +
          face({ eyeY: 57, mouthY: 72 });
      }
    },

    ghost: {
      ar: 'شبح', en: 'Ghost', g: ['#A78BFA', '#5B21B6'],
      draw: function () {
        return '<path d="M32 62 Q32 30 60 30 Q88 30 88 62 L88 88 L79 81 L70 89 L60 82 L50 89 L41 81 L32 88 Z" fill="#FFFFFF" opacity="0.97"/>' +
          '<circle cx="48" cy="42" r="6" fill="#F1EAFE"/>' +
          face({ eyeY: 56, mouthY: 70 });
      }
    },

    robot: {
      ar: 'روبوت', en: 'Robot', g: ['#67E8F9', '#2563EB'],
      draw: function () {
        return '<line x1="60" y1="20" x2="60" y2="34" stroke="#9AA7BD" stroke-width="3.4" stroke-linecap="round"/>' +
          '<circle cx="60" cy="17" r="5" fill="#FF5E7E"/>' +
          '<rect x="22" y="54" width="8" height="18" rx="4" fill="#9AA7BD"/>' +
          '<rect x="90" y="54" width="8" height="18" rx="4" fill="#9AA7BD"/>' +
          '<rect x="28" y="34" width="64" height="58" rx="16" fill="#D7DEEA"/>' +
          '<rect x="35" y="41" width="50" height="44" rx="11" fill="#F2F6FB"/>' +
          '<circle cx="36" cy="88" r="2" fill="#9AA7BD"/>' +
          '<circle cx="84" cy="88" r="2" fill="#9AA7BD"/>' +
          face({ eyeY: 58, mouthY: 72, cheekY: 68 });
      }
    },

    alien: {
      ar: 'فضائي', en: 'Alien', g: ['#96F97B', '#0D9488'],
      draw: function () {
        return '<line x1="42" y1="30" x2="48" y2="40" stroke="#5CBF4E" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="41" cy="27" r="4" fill="#FFDD57"/>' +
          '<line x1="78" y1="30" x2="72" y2="40" stroke="#5CBF4E" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="79" cy="27" r="4" fill="#FFDD57"/>' +
          '<path d="M30 60 Q30 34 60 34 Q90 34 90 60 Q90 86 60 92 Q30 86 30 60 Z" fill="#9AE66E"/>' +
          '<circle cx="47" cy="46" r="6" fill="#FFFFFF" opacity="0.4"/>' +
          face({ eyeY: 58, mouthY: 76, eyeDX: 14, eyeR: 7, cheekY: 70 });
      }
    },

    astro: {
      ar: 'رائد فضاء', en: 'Astronaut', g: ['#2E3A8C', '#10173F'],
      draw: function () {
        return '<circle cx="22" cy="24" r="1.8" fill="#FFFFFF" opacity="0.9"/>' +
          '<circle cx="99" cy="33" r="1.4" fill="#FFFFFF" opacity="0.7"/>' +
          '<circle cx="90" cy="15" r="1.8" fill="#FFFFFF" opacity="0.8"/>' +
          '<circle cx="28" cy="95" r="1.5" fill="#FFFFFF" opacity="0.6"/>' +
          '<circle cx="103" cy="90" r="1.8" fill="#FFFFFF" opacity="0.8"/>' +
          '<circle cx="60" cy="62" r="32" fill="#EDF1F9"/>' +
          '<circle cx="60" cy="62" r="24" fill="#BFE3FF"/>' +
          '<circle cx="60" cy="64" r="21" fill="#FFDDBC"/>' +
          face({ eyeY: 60, mouthY: 73 }) +
          '<path d="M40 49 Q60 36 80 49" stroke="#FFFFFF" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.55"/>' +
          '<rect x="48" y="92" width="24" height="8" rx="4" fill="#9AA7BD"/>';
      }
    },

    ninja: {
      ar: 'نينجا', en: 'Ninja', g: ['#3F3B52', '#141122'],
      draw: function () {
        return '<circle cx="60" cy="64" r="31" fill="#3A3E5B"/>' +
          '<path d="M89 52 L108 44 L104 56 L110 64 L90 62 Z" fill="#FF5E7E"/>' +
          '<rect x="34" y="48" width="52" height="20" rx="10" fill="#FFDDBC"/>' +
          '<path d="M31 46 Q60 38 89 46" stroke="#FF5E7E" stroke-width="6" fill="none" stroke-linecap="round"/>' +
          face({ eyeY: 58, mouthY: 76, cheekY: 62 });
      }
    },

    wizard: {
      ar: 'ساحر', en: 'Wizard', g: ['#7C5CFF', '#3B0764'],
      draw: function () {
        return '<circle cx="60" cy="66" r="27" fill="#FFDDBC"/>' +
          '<path d="M36 76 Q36 96 60 96 Q84 96 84 76 Q84 88 60 88 Q36 88 36 76 Z" fill="#F5F5FA"/>' +
          '<path d="M40 74 Q45 86 60 86 Q75 86 80 74 L80 82 Q74 92 60 92 Q46 92 40 82 Z" fill="#FFFFFF"/>' +
          '<path d="M26 46 L60 8 L74 46 Q60 54 26 46 Z" fill="#5B3DF5"/>' +
          '<path d="M22 46 Q60 58 78 44 L82 50 Q60 62 18 52 Z" fill="#4C2ED9"/>' +
          '<path d="M62 22 L64 27 L69 27 L65 30 L67 35 L62 32 L58 35 L59 30 L55 27 L60 27 Z" fill="#FFDD57"/>' +
          face({ eyeY: 60, mouthY: 72, cheekY: 66 });
      }
    },

    bee: {
      ar: 'نحلة', en: 'Bee', g: ['#FFD23E', '#FF7B33'],
      draw: function () {
        return '<line x1="46" y1="30" x2="41" y2="20" stroke="' + LINE + '" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="40" cy="17" r="3.6" fill="' + LINE + '"/>' +
          '<line x1="74" y1="30" x2="79" y2="20" stroke="' + LINE + '" stroke-width="3" stroke-linecap="round"/>' +
          '<circle cx="80" cy="17" r="3.6" fill="' + LINE + '"/>' +
          '<ellipse cx="26" cy="46" rx="13" ry="8" fill="#FFFFFF" opacity="0.75" transform="rotate(-24 26 46)"/>' +
          '<ellipse cx="94" cy="46" rx="13" ry="8" fill="#FFFFFF" opacity="0.75" transform="rotate(24 94 46)"/>' +
          '<circle cx="60" cy="64" r="30" fill="#FFD34D"/>' +
          '<path d="M31 55 Q60 47 89 55 L89 64 Q60 56 31 64 Z" fill="' + LINE + '" opacity="0.85"/>' +
          '<path d="M33 76 Q60 68 87 76 L84 84 Q60 78 36 84 Z" fill="' + LINE + '" opacity="0.85"/>' +
          face({ eyeY: 60, mouthY: 74, cheekY: 68 });
      }
    }
  };

  // Legacy v1 icon-name → character mapping (old sessions keep working)
  var LEGACY = {
    user: 'astro', bird: 'owl', fish: 'shark', star: 'bee',
    heart: 'unicorn', crown: 'lion', flame: 'fox', zap: 'robot',
    rocket: 'astro'
  };

  var IDS = Object.keys(CHARACTERS);

  function resolve(id) {
    if (CHARACTERS[id]) return id;
    if (LEGACY[id]) return LEGACY[id];
    // Deterministic hash → stable character for unknown ids
    var h = 0;
    var s = String(id || 'x');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return IDS[h % IDS.length];
  }

  window.TriviaAvatars = {
    ids: function () { return IDS.slice(); },

    info: function (id) {
      var rid = resolve(id);
      var c = CHARACTERS[rid];
      return { id: rid, ar: c.ar, en: c.en };
    },

    /**
     * Luxury rear-view race car in the character's colors (race mode).
     * We chase the cars toward the horizon, so we see: rear wing,
     * glowing tail-light bar, exhausts (with boost flames), fat tires,
     * neon underglow. The driver's avatar peeks over the cockpit (HTML).
     */
    carSvg: function (id) {
      var rid = resolve(id);
      var c = CHARACTERS[rid];
      var g0 = c.g[0];
      var g1 = c.g[1];
      return '<svg class="t-car" viewBox="0 0 140 118" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<defs>' +
          '<linearGradient id="carg-' + rid + '" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0" stop-color="' + g0 + '"/><stop offset="1" stop-color="' + g1 + '"/>' +
          '</linearGradient>' +
          '<radialGradient id="carglow-' + rid + '" cx="0.5" cy="0.5" r="0.5">' +
            '<stop offset="0" stop-color="' + g0 + '" stop-opacity="0.85"/>' +
            '<stop offset="1" stop-color="' + g0 + '" stop-opacity="0"/>' +
          '</radialGradient>' +
          '<linearGradient id="carwing-' + rid + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#2E2749"/><stop offset="1" stop-color="#151027"/>' +
          '</linearGradient>' +
        '</defs>' +

        // speed lines (hidden until .boost)
        '<g class="car-speedlines">' +
          '<rect x="8" y="46" width="5" height="52" rx="2.5" fill="#FFFFFF" opacity="0.5" transform="skewY(8)"/>' +
          '<rect x="127" y="38" width="5" height="52" rx="2.5" fill="#FFFFFF" opacity="0.5" transform="skewY(-8)"/>' +
        '</g>' +

        // neon underglow
        '<ellipse class="car-underglow" cx="70" cy="106" rx="56" ry="11" fill="url(#carglow-' + rid + ')"/>' +

        // exhaust flames (hidden until .boost)
        '<g class="car-flames">' +
          '<path d="M40 100 L46 118 L52 100 Z" fill="#FFB020"/>' +
          '<path d="M43 100 L46 111 L49 100 Z" fill="#FFF3C4"/>' +
          '<path d="M88 100 L94 118 L100 100 Z" fill="#FF6B35"/>' +
          '<path d="M91 100 L94 111 L97 100 Z" fill="#FFF3C4"/>' +
        '</g>' +

        // rear tires
        '<rect x="4" y="62" width="26" height="42" rx="9" fill="#120E20"/>' +
        '<rect x="8" y="68" width="18" height="3" rx="1.5" fill="#2A2342"/>' +
        '<rect x="8" y="78" width="18" height="3" rx="1.5" fill="#2A2342"/>' +
        '<rect x="8" y="88" width="18" height="3" rx="1.5" fill="#2A2342"/>' +
        '<rect x="110" y="62" width="26" height="42" rx="9" fill="#120E20"/>' +
        '<rect x="114" y="68" width="18" height="3" rx="1.5" fill="#2A2342"/>' +
        '<rect x="114" y="78" width="18" height="3" rx="1.5" fill="#2A2342"/>' +
        '<rect x="114" y="88" width="18" height="3" rx="1.5" fill="#2A2342"/>' +

        // wing struts + beam + endplates
        '<rect x="50" y="26" width="7" height="22" rx="3" fill="#1A1430"/>' +
        '<rect x="83" y="26" width="7" height="22" rx="3" fill="#1A1430"/>' +
        '<rect x="30" y="14" width="80" height="12" rx="6" fill="url(#carwing-' + rid + ')"/>' +
        '<rect x="33" y="16" width="74" height="3" rx="1.5" fill="#FFFFFF" opacity="0.35"/>' +
        '<rect x="24" y="10" width="8" height="20" rx="4" fill="' + g1 + '"/>' +
        '<rect x="108" y="10" width="8" height="20" rx="4" fill="' + g1 + '"/>' +

        // body (wide, low, muscular)
        '<path d="M26 102 L23 74 Q23 54 46 48 L94 48 Q117 54 117 74 L114 102 Q70 110 26 102 Z" ' +
          'fill="url(#carg-' + rid + ')"/>' +
        // roof line / cockpit hump
        '<path d="M50 48 Q70 36 90 48 L86 54 Q70 45 54 54 Z" fill="' + g1 + '"/>' +
        // metallic sheen
        '<path d="M30 70 Q34 56 48 51 L60 50 Q42 60 38 78 Z" fill="#FFFFFF" opacity="0.22"/>' +
        '<path d="M110 70 Q106 56 92 51 L84 50 Q100 60 104 78 Z" fill="#FFFFFF" opacity="0.1"/>' +

        // rear window
        '<path d="M52 56 Q70 47 88 56 L84 66 Q70 60 56 66 Z" fill="#0F1B33" opacity="0.9"/>' +
        '<path d="M55 57 Q64 52 72 53 L69 58 Q61 58 57 61 Z" fill="#3E6FA8" opacity="0.6"/>' +

        // tail-light bar (glowing) + brake dots
        '<rect class="car-tailglow" x="30" y="72" width="80" height="16" rx="8" fill="#FF2D55" opacity="0.35"/>' +
        '<rect class="car-tail" x="34" y="75" width="72" height="10" rx="5" fill="#FF3B60"/>' +
        '<rect x="38" y="77.5" width="26" height="5" rx="2.5" fill="#FFB3C2" opacity="0.9"/>' +
        '<rect x="76" y="77.5" width="26" height="5" rx="2.5" fill="#FFB3C2" opacity="0.9"/>' +

        // diffuser + fins
        '<path d="M34 102 L106 102 L101 92 L39 92 Z" fill="#0F0C1C" opacity="0.9"/>' +
        '<rect x="52" y="92" width="3" height="10" fill="#241C3C"/>' +
        '<rect x="68" y="92" width="3" height="10" fill="#241C3C"/>' +
        '<rect x="84" y="92" width="3" height="10" fill="#241C3C"/>' +

        // exhaust tips
        '<circle cx="46" cy="97" r="6" fill="#0D0A18" stroke="#8E86A8" stroke-width="2"/>' +
        '<circle cx="94" cy="97" r="6" fill="#0D0A18" stroke="#8E86A8" stroke-width="2"/>' +

        // plate
        '<rect x="60" y="90" width="20" height="8" rx="2" fill="#F5F0DC" opacity="0.9"/>' +
        '</svg>';
    },

    /** Full inline SVG for a character (blink delay derived from id). */
    svg: function (id) {
      var rid = resolve(id);
      var c = CHARACTERS[rid];
      var h = 0;
      for (var i = 0; i < rid.length; i++) h = (h * 31 + rid.charCodeAt(i)) >>> 0;
      var delay = (h % 37) / 10; // 0–3.6s stagger so a room doesn't blink in unison
      return '<svg class="t-av" viewBox="0 0 120 120" style="--blink-delay:' + delay + 's" ' +
        'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + c.en + '">' +
        tile(rid, c.g[0], c.g[1]) + shadow() + c.draw() +
        '</svg>';
    }
  };
})();
