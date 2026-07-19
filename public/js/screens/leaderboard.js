/**
 * Leaderboard Screen — mode-aware standings between questions:
 *   classic  → FLIP-animated ranking rows
 *   teams    → team total bars + rows with team dots
 *   survival → alive counter, eliminated rows crossed out
 *   race     → pseudo-3D race track with animated cars
 */
(function () {
  'use strict';

  window.TriviaScreens = window.TriviaScreens || {};

  window.TriviaScreens.Leaderboard = {
    previousPositions: null,
    prevProgress: null, // race: playerId → progress 0..1

    render: function (data) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var mode = data.mode || 'classic';
      var leaderboard = data.leaderboard || [];

      var questionProgress = (data.questionIndex + 1) + ' ' + t('game.of') + ' ' + data.totalQuestions;

      var html = '<div class="screen screen-wide" id="leaderboardScreen">' +
        '<h2 class="section-header animate-fade-in">' +
          (mode === 'race' ? '🏁 ' + t('race.track_title') : t('leaderboard.title')) +
        '</h2>' +
        '<p class="section-subheader animate-fade-in" style="margin-bottom:var(--space-3);">' +
          t('game.question') + ' ' + questionProgress +
        '</p>';

      if (mode === 'teams' && data.teams) {
        html += this._renderTeamBars(data.teams, t);
      }

      if (mode === 'survival') {
        var alive = data.aliveCount !== undefined
          ? data.aliveCount
          : leaderboard.filter(function (e) { return !e.isEliminated; }).length;
        html += '<div class="alive-pill animate-fade-in"><i data-lucide="skull"></i>' +
          t('survival.alive') + ': ' + alive + '</div>';
      }

      if (mode === 'race') {
        html += this._renderRaceTrack(data, t);
        html += this._renderRaceChips(leaderboard);
      } else if (mode === 'chase' && data.chase) {
        html += this._renderChaseBoard(data, t);
        html += this._renderChaseChips(data, t);
      } else {
        html += this._renderRows(leaderboard, mode, t);
      }

      // Host: next question button
      if (window.TriviaApp.gameState.isHost) {
        html += '<div class="mt-5 animate-fade-in delay-300">' +
          '<button class="btn btn-primary w-full" id="nextQuestionBtn">' +
            t('leaderboard.next') + ' <i data-lucide="arrow-left"></i>' +
          '</button>' +
        '</div>';
      }

      html += '</div>';
      return html;
    },

    _renderRows: function (leaderboard, mode, t) {
      var myId = window.TriviaApp.gameState.playerId;
      var html = '<div class="leaderboard-list" id="leaderboardList">';

      for (var i = 0; i < leaderboard.length; i++) {
        var entry = leaderboard[i];
        var isMe = entry.playerId === myId;
        var rankClass = '';
        if (!entry.isEliminated) {
          if (i === 0) rankClass = ' rank-1';
          else if (i === 1) rankClass = ' rank-2';
          else if (i === 2) rankClass = ' rank-3';
        }

        var changeClass = 'neutral';
        var changeText = '—';
        if (entry.lastPointsEarned > 0) {
          changeClass = 'positive';
          changeText = window.TriviaUtils.formatPoints(entry.lastPointsEarned) + ' ▲';
        } else if (entry.lastPointsEarned < 0) {
          changeClass = 'negative';
          changeText = window.TriviaUtils.formatPoints(entry.lastPointsEarned) + ' ▼';
        }

        html += '<div class="leaderboard-row' + rankClass + (isMe ? ' current-player' : '') +
          (entry.isEliminated ? ' eliminated' : '') + '" ' +
          'data-player-id="' + entry.playerId + '" ' +
          'style="animation:slideInUp 400ms ease ' + (i * 70) + 'ms backwards;">' +
          (i === 0 && !entry.isEliminated ? '<span class="rank-crown"><i data-lucide="crown"></i></span>' : '') +
          '<span class="rank-number">' + (i + 1) + '</span>' +
          '<div class="player-info">' +
            (mode === 'teams' && entry.team ? '<span class="team-dot team-' + entry.team + '"></span>' : '') +
            window.TriviaUtils.generateAvatarHTML(entry.avatar, 'avatar-sm') +
            '<span class="player-name">' + window.TriviaUtils.escapeHtml(entry.nickname) + '</span>' +
            (entry.isEliminated
              ? '<span class="elim-badge"><i data-lucide="skull"></i>' + t('survival.rank').replace('{n}', entry.eliminatedRank) + '</span>'
              : (entry.streak >= 3 ? '<span class="streak-chip"><i data-lucide="flame"></i>' + entry.streak + '</span>' : '')) +
          '</div>' +
          '<span class="player-score">' + entry.score + '</span>' +
          '<span class="points-change ' + changeClass + '">' + changeText + '</span>' +
        '</div>';
      }

      html += '</div>';
      return html;
    },

    _renderTeamBars: function (teams, t) {
      var max = Math.max(1, teams[0] ? teams[0].score : 1);
      var html = '<div class="team-bars animate-fade-in">';
      for (var i = 0; i < teams.length; i++) {
        var tm = teams[i];
        var pct = Math.max(6, Math.round((tm.score / max) * 100));
        html += '<div class="team-bar team-' + tm.team + '">' +
          '<div class="team-fill" data-width="' + pct + '" style="width:0;"></div>' +
          '<span class="team-name">' + t('teams.' + tm.team) + ' (' + tm.members.length + ')</span>' +
          '<span class="team-score">' + tm.score + '</span>' +
        '</div>';
      }
      html += '</div>';
      return html;
    },

    /** City skyline silhouette with lit windows (inline SVG). */
    _citySvg: function () {
      return '<svg viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="M0 70 L0 44 L16 44 L16 30 L30 30 L30 48 L44 48 L44 22 L52 22 L52 16 L60 16 L60 22 L68 22 L68 46 L84 46 L84 36 L100 36 L100 54 L116 54 L116 26 L124 26 L124 12 L130 12 L130 26 L140 26 L140 44 L158 44 L158 34 L172 34 L172 50 L186 50 L186 18 L196 18 L196 8 L202 8 L202 18 L212 18 L212 42 L228 42 L228 30 L244 30 L244 52 L258 52 L258 24 L270 24 L270 40 L284 40 L284 30 L298 30 L298 48 L314 48 L314 20 L322 20 L322 14 L330 14 L330 20 L338 20 L338 44 L354 44 L354 34 L368 34 L368 52 L384 52 L384 40 L400 40 L400 70 Z" fill="#0B0818"/>' +
        '<g fill="#FFD98A" opacity="0.75">' +
          '<rect x="20" y="36" width="3" height="3"/><rect x="47" y="28" width="3" height="3"/>' +
          '<rect x="55" y="20" width="3" height="3"/><rect x="88" y="42" width="3" height="3"/>' +
          '<rect x="119" y="32" width="3" height="3"/><rect x="126" y="18" width="3" height="3"/>' +
          '<rect x="162" y="40" width="3" height="3"/><rect x="190" y="26" width="3" height="3"/>' +
          '<rect x="198" y="13" width="3" height="3"/><rect x="232" y="36" width="3" height="3"/>' +
          '<rect x="262" y="30" width="3" height="3"/><rect x="288" y="35" width="3" height="3"/>' +
          '<rect x="317" y="26" width="3" height="3"/><rect x="358" y="40" width="3" height="3"/>' +
        '</g>' +
        '<g fill="#7CE0FF" opacity="0.55">' +
          '<rect x="49" y="34" width="3" height="3"/><rect x="121" y="40" width="3" height="3"/>' +
          '<rect x="192" y="34" width="3" height="3"/><rect x="260" y="44" width="3" height="3"/>' +
          '<rect x="320" y="34" width="3" height="3"/>' +
        '</g>' +
      '</svg>';
    },

    _renderRaceTrack: function (data, t) {
      var leaderboard = data.leaderboard || [];
      var target = data.targetScore || 5000;
      var laneCount = Math.max(2, Math.min(8, leaderboard.length));
      var myId = window.TriviaApp.gameState.playerId;
      var prev = this.prevProgress || {};

      var html = '<div class="gp-scene">' +
        // Sky: stars + moon + skyline + horizon glow
        '<div class="gp-sky">' +
          '<div class="gp-moon"></div>' +
          '<div class="gp-city">' + this._citySvg() + '</div>' +
          '<div class="gp-haze"></div>' +
        '</div>';

      // Camera flashes in the dark stands (deterministic scatter)
      for (var f = 0; f < 9; f++) {
        var fx = 4 + ((f * 47) % 92);
        var fy = 6 + ((f * 31) % 26);
        var fd = ((f * 733) % 4200) / 1000;
        html += '<span class="gp-flash" style="inset-inline-start:' + fx + '%;top:' + fy + '%;animation-delay:' + fd.toFixed(2) + 's;"></span>';
      }

      // 3D world
      html += '<div class="gp-world"><div class="gp-track" style="--lanes:' + laneCount + ';">' +
        '<div class="gp-rail gp-rail-l"></div>' +
        '<div class="gp-rail gp-rail-r"></div>';

      for (var s = 1; s < laneCount; s++) {
        html += '<div class="gp-sep" style="--i:' + s + ';animation-delay:-' + (s * 0.21).toFixed(2) + 's;"></div>';
      }

      html += '<div class="gp-startline"></div><div class="gp-finishband"></div>';

      // Cars — billboarded children of the plane
      for (var i = 0; i < leaderboard.length; i++) {
        var e = leaderboard[i];
        var progress = typeof e.progress === 'number' ? e.progress : Math.min(1, e.score / target);
        var startP = prev[e.playerId] !== undefined ? prev[e.playerId] : 0;
        var boosted = e.lastPointsEarned >= 400 || progress - startP > 0.12;
        var hit = e.lastPointsEarned < 0 || progress < startP - 0.01;
        var isMe = e.playerId === myId;
        var isLeader = i === 0 && leaderboard.length > 1;

        html += '<div class="gp-car' +
            (isMe ? ' me' : '') +
            (e.isFinished ? ' finished' : '') +
            (boosted ? ' will-boost' : '') +
            (hit ? ' will-hit' : '') + '" ' +
          'data-player-id="' + e.playerId + '" data-progress="' + progress.toFixed(4) + '" ' +
          'style="--lane:' + (i % laneCount) + ';--p:' + startP.toFixed(4) + ';--stagger:' + (i * 70) + 'ms;--sway:' + ((i * 0.7) % 3).toFixed(1) + 's;">' +
          '<div class="gp-car-inner">' +
            '<span class="gp-name">' + window.TriviaUtils.escapeHtml(e.nickname) + '</span>' +
            (isLeader && !e.isFinished ? '<span class="gp-crown"><i data-lucide="crown"></i></span>' : '') +
            '<span class="gp-driver">' + window.TriviaAvatars.svg(e.avatar) + '</span>' +
            window.TriviaAvatars.carSvg(e.avatar) +
            (e.shielded ? '<span class="gp-shield"></span>' : '') +
            (e.isFinished && e.finishRank ? '<span class="gp-rank">' + e.finishRank + '</span>' : '') +
          '</div>' +
        '</div>';
      }

      html += '</div></div>' +
        '<div class="gp-finish-sign">🏁 ' + t('race.target').replace('{n}', target) + '</div>' +
      '</div>';

      return html;
    },

    _renderRaceChips: function (leaderboard) {
      var myId = window.TriviaApp.gameState.playerId;
      var html = '<div class="gp-hud animate-fade-in delay-200">';
      for (var i = 0; i < leaderboard.length; i++) {
        var e = leaderboard[i];
        html += '<span class="gp-hud-chip' + (e.isFinished ? ' finished' : '') + (e.playerId === myId ? ' me' : '') + '">' +
          '<span class="gp-hud-rank">' + (e.isFinished && e.finishRank ? e.finishRank : (i + 1)) + '</span>' +
          window.TriviaUtils.generateAvatarHTML(e.avatar, 'avatar-sm') +
          '<span>' + window.TriviaUtils.escapeHtml(e.nickname) + '</span>' +
          '<b>' + e.score + '</b>' +
          (e.isFinished ? ' 🏁' : '') +
        '</span>';
      }
      html += '</div>';
      return html;
    },

    /**
     * The Escape Tunnel — runners climb a 3D board toward the SAFE gate
     * while the chaser's red mist wall rises from below.
     */
    _renderChaseBoard: function (data, t) {
      var chase = data.chase;
      var leaderboard = data.leaderboard || [];
      var myId = window.TriviaApp.gameState.playerId;
      var steps = chase.homeStep || 8;
      var prev = this.prevChase || { positions: {}, chaserPos: 0 };

      var runners = leaderboard.filter(function (e) { return !e.isChaser; });
      var chaserEntry = leaderboard.filter(function (e) { return e.isChaser; })[0] || null;
      var onBoard = runners.filter(function (e) { return !e.isHome; });
      var safe = runners.filter(function (e) { return e.isHome; });
      var laneCount = Math.max(2, Math.min(8, onBoard.length || 2));

      // danger: any live runner within 1 step of the wall
      var danger = onBoard.some(function (e) {
        return !e.isCaught && (e.chasePos - chase.chaserPos) <= 1;
      });

      var html = '<div class="ch-scene' + (danger ? ' danger' : '') + '" id="chScene">' +
        '<div class="ch-sky">' +
          '<div class="ch-gate"><div class="ch-gate-beam"></div></div>' +
          '<div class="ch-gate-sign">🏠 ' + t('chase.safe_zone') + '</div>' +
          '<div class="ch-safe-row">' +
            safe.map(function (e) {
              return '<span class="avatar" title="' + window.TriviaUtils.escapeHtml(e.nickname) + '">' +
                window.TriviaAvatars.svg(e.avatar) + '</span>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="ch-world"><div class="ch-board" style="--steps:' + steps + ';--lanes:' + laneCount + ';">';

      // Runners on the board (caught ones linger in the mist)
      for (var i = 0; i < onBoard.length; i++) {
        var e = onBoard[i];
        var p = Math.max(0, Math.min(1, e.chasePos / steps));
        var startP = prev.positions[e.playerId] !== undefined ? prev.positions[e.playerId] : p;
        var isMe = e.playerId === myId;
        var justCaught = e.isCaught && prev.caught && prev.caught[e.playerId] === false;

        html += '<div class="ch-runner' +
            (isMe ? ' me' : '') +
            (e.isCaught ? (justCaught ? ' caught-now' : ' caught') : '') + '" ' +
          'data-player-id="' + e.playerId + '" data-progress="' + p.toFixed(4) + '" ' +
          'style="--lane:' + (i % laneCount) + ';--p:' + startP.toFixed(4) + ';--stagger:' + (i * 60) + 'ms;--sway:' + ((i * 0.6) % 2.4).toFixed(1) + 's;">' +
          '<div class="ch-runner-inner">' +
            '<span class="ch-name">' + window.TriviaUtils.escapeHtml(e.nickname) + '</span>' +
            window.TriviaUtils.generateAvatarHTML(e.avatar, 'avatar-md') +
            '<span class="ch-step">' + e.chasePos + '/' + steps + '</span>' +
          '</div>' +
        '</div>';
      }

      // The chaser wall
      if (chaserEntry) {
        var wp = Math.max(0, Math.min(1, chase.chaserPos / steps));
        var wStart = prev.chaserPos !== undefined ? Math.max(0, Math.min(1, prev.chaserPos / steps)) : wp;
        html += '<div class="ch-wall" id="chWall" data-progress="' + wp.toFixed(4) + '" style="--p:' + wStart.toFixed(4) + ';">' +
          '<div class="ch-search"></div>' +
          '<div class="ch-chaser"><div class="ch-chaser-inner">' +
            '<span class="ch-chaser-label">💀 ' + window.TriviaUtils.escapeHtml(chaserEntry.nickname) + ' · ' + chase.chaserPos + '/' + steps + '</span>' +
            window.TriviaUtils.generateAvatarHTML(chaserEntry.avatar, 'avatar-lg') +
          '</div></div>' +
        '</div>';
      }

      html += '</div></div></div>';
      return html;
    },

    _renderChaseChips: function (data, t) {
      var chase = data.chase;
      var myId = window.TriviaApp.gameState.playerId;
      var html = '<div class="ch-hud animate-fade-in delay-200">';

      (data.leaderboard || []).forEach(function (e) {
        var cls = '';
        var note = '';
        if (e.isChaser) {
          cls = ' chaser-chip';
          note = '💀 ' + e.chasePos + '/' + chase.homeStep;
        } else if (e.isHome) {
          cls = ' safe';
          note = '🏠 #' + e.homeOrder;
        } else if (e.isCaught) {
          cls = ' caught';
          note = '💥';
        } else {
          var gap = e.chasePos - chase.chaserPos;
          cls = gap <= 1 ? ' gap-danger' : '';
          note = gap <= 1 ? t('chase.gap_one') : t('chase.gap').replace('{n}', gap);
        }
        html += '<span class="ch-hud-chip' + cls + (e.playerId === myId ? ' me' : '') + '">' +
          window.TriviaUtils.generateAvatarHTML(e.avatar, 'avatar-sm') +
          '<span>' + window.TriviaUtils.escapeHtml(e.nickname) + '</span>' +
          '<b>' + note + '</b>' +
        '</span>';
      });

      html += '</div>';
      return html;
    },

    /** Wall and runners glide to their new steps; quake if the wall moved. */
    _animateChase: function (data) {
      var self = this;
      var chase = data.chase;
      var steps = chase.homeStep || 8;
      var newState = { positions: {}, caught: {}, chaserPos: chase.chaserPos };
      var wallMoved = this.prevChase && chase.chaserPos > this.prevChase.chaserPos;

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.querySelectorAll('.ch-runner').forEach(function (r) {
            var p = parseFloat(r.getAttribute('data-progress')) || 0;
            var id = r.getAttribute('data-player-id');
            newState.positions[id] = p;
            newState.caught[id] = r.classList.contains('caught') || r.classList.contains('caught-now');
            r.style.setProperty('--p', p);
          });
          var wall = document.getElementById('chWall');
          if (wall) {
            wall.style.setProperty('--p', parseFloat(wall.getAttribute('data-progress')) || 0);
          }
          if (wallMoved) {
            var scene = document.getElementById('chScene');
            if (scene) {
              scene.classList.add('quake');
              setTimeout(function () { scene.classList.remove('quake'); }, 600);
            }
          }
          self.prevChase = newState;
        });
      });

      if (!this.prevChase) this.prevChase = newState;
    },

    init: function (data) {
      var mode = data.mode || 'classic';
      window.TriviaSound.play(mode === 'race' ? 'engine' : 'swoosh');

      if (mode === 'chase' && data.chase) {
        this._animateChase(data);
        // roar when the wall is breathing down someone's neck
        var anyDanger = (data.leaderboard || []).some(function (e) {
          return !e.isChaser && !e.isHome && !e.isCaught &&
            (e.chasePos - data.chase.chaserPos) <= 1;
        });
        if (anyDanger) {
          setTimeout(function () { window.TriviaSound.play('roar'); }, 700);
        }
      } else if (mode === 'race') {
        this._animateRace(data);
      } else {
        if (this.previousPositions) this._animateReRanking();
        this._storePositions();
      }

      // Team bars fill in
      setTimeout(function () {
        document.querySelectorAll('.team-fill').forEach(function (bar) {
          bar.style.width = bar.getAttribute('data-width') + '%';
        });
      }, 200);

      var nextBtn = document.getElementById('nextQuestionBtn');
      if (nextBtn) {
        nextBtn.addEventListener('click', function () {
          window.TriviaSound.play('tap');
          window.TriviaSocket.emit('request_next');
        });
      }

      if (window.lucide) lucide.createIcons();
    },

    /** Cars start at their previous position, then drive to the new one. */
    _animateRace: function (data) {
      var self = this;
      var newProgress = {};

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.querySelectorAll('.gp-car').forEach(function (car) {
            var p = parseFloat(car.getAttribute('data-progress')) || 0;
            newProgress[car.getAttribute('data-player-id')] = p;
            car.style.setProperty('--p', p);

            if (car.classList.contains('will-boost')) {
              car.classList.add('boost');
              setTimeout(function () { car.classList.remove('boost'); }, 1500);
            }
            if (car.classList.contains('will-hit')) {
              car.classList.add('hit');
              setTimeout(function () { car.classList.remove('hit'); }, 1100);
            }
          });
          self.prevProgress = newProgress;
        });
      });
    },

    _storePositions: function () {
      this.previousPositions = {};
      var rows = document.querySelectorAll('.leaderboard-row');
      rows.forEach(function (row) {
        var id = row.getAttribute('data-player-id');
        var rect = row.getBoundingClientRect();
        this.previousPositions[id] = rect.top;
      }.bind(this));
    },

    _animateReRanking: function () {
      var rows = document.querySelectorAll('.leaderboard-row');
      var prev = this.previousPositions;

      rows.forEach(function (row) {
        var id = row.getAttribute('data-player-id');
        if (prev[id] !== undefined) {
          var newRect = row.getBoundingClientRect();
          var deltaY = prev[id] - newRect.top;

          if (Math.abs(deltaY) > 1) {
            row.style.transform = 'translateY(' + deltaY + 'px)';
            row.style.transition = 'none';

            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                row.style.transition = 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)';
                row.style.transform = 'translateY(0)';
              });
            });
          }
        }
      });
    },

    reset: function () {
      this.previousPositions = null;
      this.prevProgress = null;
      this.prevChase = null;
    }
  };
})();
