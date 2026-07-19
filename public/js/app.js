/**
 * TriviaApp — Main application controller
 * Routes between screens, manages game state, and handles all socket events.
 * Also owns the party layer: reactions, duel overlay, sound popover, music.
 */
(function () {
  'use strict';

  var REACTIONS = ['😂', '🔥', '😱', '👏', '😭', '❤️', '🤯', '💀'];

  var TriviaApp = {
    currentScreen: null,
    currentScreenData: null,
    gameState: {},

    // ──────────────────────────────────────────────────────────
    //  Initialization
    // ──────────────────────────────────────────────────────────

    init: async function () {
      // Initialize i18n (load translations)
      await window.TriviaI18n.init();

      // Update language toggle label
      this._updateLangToggle();

      // Language toggle button
      var langBtn = document.getElementById('langToggle');
      if (langBtn) {
        langBtn.addEventListener('click', function () {
          TriviaApp.toggleLanguage();
        });
      }

      // Sound engine + settings popover
      window.TriviaSound.init();
      this._setupSoundPopover();

      // Exit-party button
      var leaveBtn = document.getElementById('leavePartyBtn');
      if (leaveBtn) {
        leaveBtn.addEventListener('click', function () {
          TriviaApp.leaveParty();
        });
      }

      // Initialize Socket.io
      window.TriviaSocket.init();

      // Set up all socket event listeners
      this._setupSocketListeners();

      // Check for existing session (reconnection)
      var session = this._getSession();
      if (session && session.roomCode && session.sessionToken) {
        window.TriviaSocket.on('connect', function onFirstConnect() {
          window.TriviaSocket.off('connect', onFirstConnect);
          setTimeout(function () {
            window.TriviaSocket.emit('rejoin_room', {
              roomCode: session.roomCode,
              sessionToken: session.sessionToken
            });
          }, 500);
        });
      } else {
        this.showScreen('home');
      }
    },

    // ──────────────────────────────────────────────────────────
    //  Screen management
    // ──────────────────────────────────────────────────────────

    showScreen: function (name, data) {
      var screens = window.TriviaScreens;
      var screenMap = {
        home: screens.Home,
        lobby: screens.Lobby,
        question: screens.Question,
        reveal: screens.Reveal,
        leaderboard: screens.Leaderboard,
        gameover: screens.GameOver
      };

      var screen = screenMap[name];
      if (!screen) {
        console.error('[App] Unknown screen:', name);
        return;
      }

      // Destroy previous screen if it has a destroy method
      if (this.currentScreen && screenMap[this.currentScreen] && screenMap[this.currentScreen].destroy) {
        screenMap[this.currentScreen].destroy();
      }

      this.currentScreen = name;
      this.currentScreenData = data || {};

      var appEl = document.getElementById('app');
      if (!appEl) return;

      // Render new screen
      appEl.innerHTML = screen.render(data || {});

      // Initialize screen logic
      if (screen.init) {
        screen.init(data || {});
      }

      // Background music per screen (a paused question stays silent)
      if (name === 'home' || name === 'lobby') {
        window.TriviaSound.music('lobby');
      } else if (name === 'question') {
        window.TriviaSound.music(data && data.paused ? null : 'question');
      } else {
        window.TriviaSound.music(null);
      }

      // Exit-party chip only makes sense while inside a room
      this._updateLeaveButton();

      // Inline SVG icons
      if (window.lucide) {
        setTimeout(function () { lucide.createIcons(); }, 10);
      }
    },

    _updateLeaveButton: function () {
      var btn = document.getElementById('leavePartyBtn');
      if (btn) {
        btn.style.display = this.gameState.roomCode ? '' : 'none';
      }
    },

    /**
     * Leave the current party and return to the main page.
     * Mid-game we confirm first (accidental taps are brutal);
     * from the game-over screen we leave straight away.
     */
    leaveParty: function (skipConfirm) {
      var self = this;
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);

      if (!this.gameState.roomCode) {
        this.showScreen('home');
        return;
      }

      var doLeave = function () {
        window.TriviaSound.play('leave');
        window.TriviaSound.stopSpeaking();
        window.TriviaSocket.emit('leave_room');
        localStorage.removeItem('trivia_session');
        self.gameState = {};
        self.applyStageClass();
        self.showScreen('home');
      };

      if (skipConfirm) {
        doLeave();
        return;
      }

      // Confirm modal
      var modal = document.createElement('div');
      modal.className = 'powerup-modal';
      modal.id = 'leaveModal';
      modal.innerHTML =
        '<div class="glass-card powerup-modal-content" style="max-width:340px;">' +
          '<h3 class="text-center mb-3" style="display:flex;align-items:center;justify-content:center;gap:var(--space-2);">' +
            '<i data-lucide="log-out" style="width:20px;height:20px;color:var(--color-error);"></i>' +
            t('common.leave_party') +
          '</h3>' +
          '<p class="text-secondary text-center mb-4" style="font-size:var(--fs-sm);">' + t('common.leave_confirm') + '</p>' +
          '<div style="display:flex;gap:var(--space-2);">' +
            '<button class="btn btn-danger" id="leaveConfirmBtn" style="flex:1;">' + t('common.leave_party') + '</button>' +
            '<button class="btn btn-secondary" id="leaveCancelBtn" style="flex:1;">' + t('common.cancel') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      if (window.lucide) lucide.createIcons();

      var close = function () {
        if (modal.parentNode) modal.parentNode.removeChild(modal);
      };
      modal.querySelector('#leaveConfirmBtn').addEventListener('click', function () {
        close();
        doLeave();
      });
      modal.querySelector('#leaveCancelBtn').addEventListener('click', close);
      modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
      });
    },

    // ──────────────────────────────────────────────────────────
    //  Socket event listeners
    // ──────────────────────────────────────────────────────────

    _setupSocketListeners: function () {
      var self = this;
      var sock = window.TriviaSocket;

      // Room created (I'm the host)
      sock.on('room_created', function (data) {
        self.gameState = {
          roomCode: data.roomCode,
          playerId: data.player.id,
          sessionToken: data.sessionToken,
          isHost: true,
          qrCodeDataUrl: data.qrCodeDataUrl,
          joinUrl: data.joinUrl,
          player: data.player,
          players: data.roomState.players || [],
          settings: data.roomState.settings || {}
        };
        self._saveSession();
        self.applyStageClass();

        self.showScreen('lobby', {
          roomCode: data.roomCode,
          qrCodeDataUrl: data.qrCodeDataUrl,
          roomState: data.roomState,
          isHost: true
        });
      });

      // Room joined (I'm a player)
      sock.on('room_joined', function (data) {
        self.gameState = {
          roomCode: data.roomCode,
          playerId: data.player.id,
          sessionToken: data.sessionToken,
          isHost: false,
          player: data.player,
          players: data.roomState.players || [],
          settings: data.roomState.settings || {}
        };
        self._saveSession();
        self.applyStageClass();

        self.showScreen('lobby', {
          roomCode: data.roomCode,
          roomState: data.roomState,
          isHost: false
        });
      });

      // Player joined the room
      sock.on('player_joined', function (data) {
        if (self.gameState.players) {
          self.gameState.players.push(data.player);
        }
        if (self.currentScreen === 'lobby' && window.TriviaScreens.Lobby.onPlayerJoined) {
          window.TriviaScreens.Lobby.onPlayerJoined(data.player);
        }
      });

      // Player left or disconnected
      sock.on('player_left', function (data) {
        if (self.gameState.players) {
          self.gameState.players = self.gameState.players.filter(function (p) { return p.id !== data.playerId; });
        }
        if (self.currentScreen === 'lobby' && window.TriviaScreens.Lobby.onPlayerLeft) {
          window.TriviaScreens.Lobby.onPlayerLeft(data.playerId);
        }
      });

      // Player kicked
      sock.on('player_kicked', function (data) {
        if (self.gameState.players) {
          self.gameState.players = self.gameState.players.filter(function (p) { return p.id !== data.playerId; });
        }
        if (data.playerId === self.gameState.playerId) {
          // I was kicked
          localStorage.removeItem('trivia_session');
          self.gameState = {};
          self.showScreen('home');
          self.showToast(window.TriviaI18n.t('errors.kicked'), 'error');
        } else if (self.currentScreen === 'lobby' && window.TriviaScreens.Lobby.onPlayerLeft) {
          window.TriviaScreens.Lobby.onPlayerLeft(data.playerId);
        }
      });

      // Player profile or inventory updated (team, items, finish, elimination)
      sock.on('player_updated', function (data) {
        if (self.gameState.players) {
          for (var i = 0; i < self.gameState.players.length; i++) {
            if (self.gameState.players[i].id === data.player.id) {
              self.gameState.players[i] = data.player;
              break;
            }
          }
        }
        if (self.gameState.player && self.gameState.player.id === data.player.id) {
          self.gameState.player = data.player;
        }
        if (self.currentScreen === 'lobby' && window.TriviaScreens.Lobby.onPlayerUpdated) {
          window.TriviaScreens.Lobby.onPlayerUpdated(data.player);
        }
      });

      // Settings updated (re-render lobby for non-hosts with the full
      // player list from gameState — not scraped from the DOM)
      sock.on('settings_updated', function (data) {
        self.gameState.settings = data.settings;
        self.applyStageClass();
        if (self.currentScreen === 'lobby' && !self.gameState.isHost) {
          self.showScreen('lobby', {
            roomCode: self.gameState.roomCode,
            qrCodeDataUrl: self.gameState.qrCodeDataUrl,
            roomState: {
              settings: data.settings,
              players: self.gameState.players || [],
              hostId: self._findHostId()
            },
            isHost: false
          });
        }
      });

      // Survival: a player was eliminated
      sock.on('player_eliminated', function (data) {
        window.TriviaSound.play('eliminate');
        self._showElimOverlay(data);
        if (data.player && data.player.id === self.gameState.playerId) {
          if (self.gameState.player) self.gameState.player.isEliminated = true;
          self.showToast(window.TriviaI18n.t('survival.eliminated_you'), 'error');
        }
      });

      // Game starting (countdown)
      sock.on('game_starting', function (data) {
        window.TriviaSound.music(null);
        self._showCountdown(data.countdown || 3);
      });

      // Question started
      sock.on('question_started', function (data) {
        self.gameState.currentQuestionData = data;
        self.showScreen('question', data);
      });

      // Answer count update
      sock.on('answer_count', function (data) {
        if (self.currentScreen === 'question' && window.TriviaScreens.Question.updateAnswerCount) {
          window.TriviaScreens.Question.updateAnswerCount(data.answered, data.total);
        }
      });

      // Question ended — show reveal
      sock.on('question_ended', function (data) {
        if (window.TriviaScreens.Question.destroy) {
          window.TriviaScreens.Question.destroy();
        }

        self.showScreen('reveal', {
          questionData: self.gameState.currentQuestionData,
          revealData: data
        });
      });

      // Leaderboard updated
      sock.on('leaderboard_updated', function (data) {
        self.showScreen('leaderboard', data);
      });

      // Tiebreaker duel announced
      sock.on('tiebreaker_starting', function (data) {
        window.TriviaSound.music(null);
        window.TriviaSound.play('tiebreaker');
        self._showDuelOverlay(data.players || []);
      });

      // Game ended
      sock.on('game_ended', function (data) {
        if (window.TriviaScreens.Leaderboard.reset) {
          window.TriviaScreens.Leaderboard.reset();
        }
        self.showScreen('gameover', data);
      });

      // Emoji reaction from any player
      sock.on('reaction', function (data) {
        self._spawnReaction(data);
      });

      // Rejoin success
      sock.on('rejoin_success', function (data) {
        self.gameState = {
          roomCode: data.roomCode,
          playerId: data.player.id,
          sessionToken: data.sessionToken,
          isHost: data.player.isHost,
          qrCodeDataUrl: self.gameState.qrCodeDataUrl,
          player: data.player,
          players: data.roomState.players || [],
          settings: data.roomState.settings || {}
        };
        self._saveSession();
        self.applyStageClass();

        var roomState = data.roomState;

        switch (roomState.state) {
          case 'LOBBY':
            self.showScreen('lobby', {
              roomCode: data.roomCode,
              roomState: roomState,
              isHost: data.player.isHost,
              qrCodeDataUrl: self.gameState.qrCodeDataUrl
            });
            break;

          case 'QUESTION_ACTIVE':
            if (roomState.currentQuestion) {
              self.gameState.currentQuestionData = roomState.currentQuestion;
              self.showScreen('question', roomState.currentQuestion);
            }
            break;

          case 'REVEAL':
          case 'LEADERBOARD':
          case 'TIEBREAKER_INTRO':
            self.showScreen('leaderboard', {
              questionIndex: roomState.currentQuestionIndex || 0,
              totalQuestions: roomState.totalQuestions || 10,
              leaderboard: roomState.leaderboard || [],
              mode: roomState.mode || 'classic',
              teams: roomState.teams || null,
              targetScore: roomState.targetScore || null
            });
            break;

          case 'GAME_END':
            self.showScreen('gameover', {
              leaderboard: roomState.leaderboard || [],
              stats: roomState.stats || [],
              awards: roomState.awards || [],
              tiebreakerWinnerId: roomState.tiebreakerWinnerId || null,
              mode: roomState.mode || 'classic',
              teams: roomState.teams || null,
              winnerTeam: roomState.winnerTeam || null,
              targetScore: roomState.targetScore || null
            });
            break;

          default:
            self.showScreen('home');
        }

        self.showToast(window.TriviaI18n.t('common.connected'), 'success');
      });

      // Rematch started
      sock.on('rematch_started', function (data) {
        if (window.TriviaScreens.Leaderboard.reset) {
          window.TriviaScreens.Leaderboard.reset();
        }
        if (data.roomState && data.roomState.players) {
          self.gameState.players = data.roomState.players;
        }

        self.showScreen('lobby', {
          roomCode: self.gameState.roomCode,
          roomState: data.roomState,
          isHost: self.gameState.isHost,
          qrCodeDataUrl: self.gameState.qrCodeDataUrl
        });
      });

      // Host transferred
      sock.on('host_transferred', function (data) {
        if (data.newHostId === self.gameState.playerId) {
          self.gameState.isHost = true;
          // Mid-question promotion: re-render so the live control bar
          // appears (pause state survives via currentQuestionData).
          if (self.currentScreen === 'question' && self.gameState.currentQuestionData) {
            self.showScreen('question', self.gameState.currentQuestionData);
          }
        }
      });

      // Error
      sock.on('error', function (data) {
        var msg = data.message || 'unknown_error';
        var translated = window.TriviaI18n.t('errors.' + msg);
        // t() returns the key itself when missing — fall back to raw code
        if (translated === 'errors.' + msg) translated = msg;

        self.showToast(translated, 'error');

        if (msg === 'room_not_found' || msg === 'session_expired') {
          localStorage.removeItem('trivia_session');
          self.gameState = {};
          self.showScreen('home');
        }
      });
    },

    _findHostId: function () {
      var players = this.gameState.players || [];
      for (var i = 0; i < players.length; i++) {
        if (players[i].isHost) return players[i].id;
      }
      return null;
    },

    // ──────────────────────────────────────────────────────────
    //  Countdown overlay (3-2-1-GO)
    // ──────────────────────────────────────────────────────────

    _showCountdown: function (from) {
      var overlay = document.createElement('div');
      overlay.className = 'countdown-overlay';
      overlay.innerHTML = '<span class="countdown-number">' + from + '</span>';
      document.body.appendChild(overlay);
      window.TriviaSound.play('countTick');

      var current = from;
      var interval = setInterval(function () {
        current--;
        if (current > 0) {
          overlay.innerHTML = '<span class="countdown-number">' + current + '</span>';
          window.TriviaSound.play('countTick');
        } else if (current === 0) {
          overlay.innerHTML = '<span class="countdown-number" style="font-size:clamp(4rem,20vw,6rem);">🎮</span>';
          window.TriviaSound.play('countGo');
        } else {
          clearInterval(interval);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
      }, 1000);
    },

    // ──────────────────────────────────────────────────────────
    //  Tiebreaker duel overlay (جولة الحسم)
    // ──────────────────────────────────────────────────────────

    _showDuelOverlay: function (duelists) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var overlay = document.createElement('div');
      overlay.className = 'duel-overlay';

      var playersHtml = '';
      for (var i = 0; i < duelists.length; i++) {
        if (i > 0) playersHtml += '<span class="duel-vs">' + t('tiebreaker.vs') + '</span>';
        playersHtml += '<div class="duel-player">' +
          window.TriviaUtils.generateAvatarHTML(duelists[i].avatar, 'avatar-xl') +
          '<span class="player-name">' + window.TriviaUtils.escapeHtml(duelists[i].nickname) + '</span>' +
        '</div>';
      }

      overlay.innerHTML =
        '<div class="duel-title"><i data-lucide="swords"></i>' + t('tiebreaker.title') + '</div>' +
        '<p class="section-subheader" style="margin:0;">' + t('tiebreaker.subtitle') + '</p>' +
        '<div class="duel-versus">' + playersHtml + '</div>';

      document.body.appendChild(overlay);
      if (window.lucide) lucide.createIcons();

      setTimeout(function () {
        overlay.style.animation = 'fadeOut 300ms ease forwards';
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 320);
      }, 3000);
    },

    // ──────────────────────────────────────────────────────────
    //  Big-screen stage class + mode overlays
    // ──────────────────────────────────────────────────────────

    /** Toggle body.stage-mode when this device is the presenter screen. */
    applyStageClass: function () {
      var s = this.gameState.settings || {};
      var isStage = Boolean(s.displayMode && this.gameState.isHost);
      document.body.classList.toggle('stage-mode', isStage);
      this.applyTheme();
    },

    /** Apply the room's theme skin to the whole document. */
    applyTheme: function () {
      var s = this.gameState.settings || {};
      var theme = s.theme || 'neon';
      if (theme === 'neon') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
    },

    /** Survival: dramatic elimination overlay. */
    _showElimOverlay: function (data) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var p = data.player || {};
      var overlay = document.createElement('div');
      overlay.className = 'elim-overlay';
      overlay.innerHTML =
        '<div class="elim-title"><i data-lucide="skull"></i>' + t('survival.eliminated_title') + '</div>' +
        window.TriviaUtils.generateAvatarHTML(p.avatar || 'ghost', 'avatar-xl', 'mood-sad') +
        '<p class="fw-black fs-xl">' + window.TriviaUtils.escapeHtml(p.nickname || '') + '</p>' +
        '<span class="badge badge-duel">' + t('survival.rank').replace('{n}', data.rank) + '</span>';
      document.body.appendChild(overlay);
      if (window.lucide) lucide.createIcons();

      setTimeout(function () {
        overlay.style.animation = 'fadeOut 300ms ease forwards';
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 320);
      }, 2600);
    },

    /** Race: finish-line overlay (called from the reveal screen). */
    showFinishOverlay: function (finishedNow, t) {
      var overlay = document.createElement('div');
      overlay.className = 'finish-overlay';
      var html = '';
      for (var i = 0; i < finishedNow.length; i++) {
        var f = finishedNow[i];
        html += '<div class="finish-title">' +
          t('race.finished_title').replace('{player}', window.TriviaUtils.escapeHtml(f.nickname)) +
        '</div>' +
        window.TriviaUtils.generateAvatarHTML(f.avatar, 'avatar-xl', 'mood-happy') +
        '<span class="badge badge-gold"><i data-lucide="flag"></i> ' + t('race.finished_rank').replace('{n}', f.rank) + '</span>';
      }
      overlay.innerHTML = html;
      document.body.appendChild(overlay);
      if (window.lucide) lucide.createIcons();

      setTimeout(function () {
        overlay.style.animation = 'fadeOut 300ms ease forwards';
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 320);
      }, 2400);
    },

    // ──────────────────────────────────────────────────────────
    //  Emoji reactions
    // ──────────────────────────────────────────────────────────

    renderReactionBar: function () {
      var html = '<div class="reaction-bar animate-fade-in delay-300" id="reactionBar">';
      for (var i = 0; i < REACTIONS.length; i++) {
        html += '<button type="button" class="reaction-btn" data-emoji="' + REACTIONS[i] + '">' + REACTIONS[i] + '</button>';
      }
      html += '</div>';
      return html;
    },

    bindReactionBar: function () {
      document.querySelectorAll('.reaction-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          window.TriviaSocket.emit('send_reaction', { emoji: btn.getAttribute('data-emoji') });
        });
      });
    },

    _spawnReaction: function (data) {
      var layer = document.getElementById('reactionLayer');
      if (!layer) return;

      window.TriviaSound.play('reaction');

      var el = document.createElement('div');
      el.className = 'reaction-float';
      var x = 8 + Math.random() * 84; // vw
      el.style.insetInlineStart = x + 'vw';
      el.innerHTML = '<span>' + data.emoji + '</span>' +
        '<span class="reaction-name">' + window.TriviaUtils.escapeHtml(data.nickname || '') + '</span>';

      layer.appendChild(el);
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 2700);
    },

    // ──────────────────────────────────────────────────────────
    //  Sound settings popover
    // ──────────────────────────────────────────────────────────

    _setupSoundPopover: function () {
      var self = this;
      var btn = document.getElementById('soundToggle');
      if (!btn) return;

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var existing = document.getElementById('soundPop');
        if (existing) {
          existing.parentNode.removeChild(existing);
          return;
        }
        self._openSoundPopover();
      });

      this._refreshSoundButton();
    },

    _refreshSoundButton: function () {
      var btn = document.getElementById('soundToggle');
      if (!btn) return;
      var prefs = window.TriviaSound.getPrefs();
      var anyOn = prefs.sfx || prefs.music;
      btn.innerHTML = '<i data-lucide="' + (anyOn ? 'volume-2' : 'volume-x') + '"></i>';
      btn.classList.toggle('muted', !anyOn);
      if (window.lucide) lucide.createIcons();
    },

    _openSoundPopover: function () {
      var self = this;
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var prefs = window.TriviaSound.getPrefs();

      var voiceOn = prefs.voice === true ||
        (prefs.voice === 'auto' && this.gameState.isHost);

      var pop = document.createElement('div');
      pop.className = 'sound-pop';
      pop.id = 'soundPop';

      var rows = [
        { key: 'sfx', icon: 'zap', label: t('sound.sfx'), on: prefs.sfx },
        { key: 'music', icon: 'music', label: t('sound.music'), on: prefs.music }
      ];
      if (window.TriviaSound.voiceAvailable()) {
        rows.push({ key: 'voice', icon: 'mic', label: t('sound.voice'), on: voiceOn, hint: t('sound.voice_hint') });
      }

      var html = '';
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        html += '<button type="button" class="sound-row' + (r.on ? ' on' : '') + '" data-key="' + r.key + '">' +
          '<i data-lucide="' + r.icon + '"></i>' +
          '<span class="sound-label">' + r.label + '</span>' +
          '<span class="mini-switch"></span>' +
        '</button>';
      }
      pop.innerHTML = html;
      document.body.appendChild(pop);
      if (window.lucide) lucide.createIcons();

      pop.querySelectorAll('.sound-row').forEach(function (row) {
        row.addEventListener('click', function () {
          var key = row.getAttribute('data-key');
          var turningOn = !row.classList.contains('on');
          row.classList.toggle('on', turningOn);

          if (key === 'voice') {
            window.TriviaSound.setPref('voice', turningOn);
          } else {
            window.TriviaSound.setPref(key, turningOn);
            if (key === 'sfx' && turningOn) window.TriviaSound.play('pop');
          }
          self._refreshSoundButton();
        });
      });

      // Close when clicking elsewhere
      setTimeout(function () {
        var closer = function (ev) {
          if (!pop.contains(ev.target)) {
            if (pop.parentNode) pop.parentNode.removeChild(pop);
            document.removeEventListener('pointerdown', closer);
          }
        };
        document.addEventListener('pointerdown', closer);
      }, 10);
    },

    // ──────────────────────────────────────────────────────────
    //  Language toggle
    // ──────────────────────────────────────────────────────────

    toggleLanguage: function () {
      var current = window.TriviaI18n.getLang();
      window.TriviaI18n.setLang(current === 'ar' ? 'en' : 'ar');
    },

    onLanguageChange: function () {
      this._updateLangToggle();

      // Re-render current screen
      if (this.currentScreen && this.currentScreenData) {
        this.showScreen(this.currentScreen, this.currentScreenData);
      }
    },

    _updateLangToggle: function () {
      var label = document.getElementById('langLabel');
      if (label) {
        label.textContent = window.TriviaI18n.getLang() === 'ar' ? 'EN' : 'عربي';
      }
    },

    // ──────────────────────────────────────────────────────────
    //  Toast notifications
    // ──────────────────────────────────────────────────────────

    showToast: function (message, type) {
      type = type || 'info';
      var container = document.getElementById('toastContainer');
      if (!container) return;

      var toast = document.createElement('div');
      toast.className = 'toast toast-' + type;
      toast.textContent = message;

      container.appendChild(toast);

      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 3000);
    },

    // ──────────────────────────────────────────────────────────
    //  Session persistence
    // ──────────────────────────────────────────────────────────

    _saveSession: function () {
      try {
        localStorage.setItem('trivia_session', JSON.stringify({
          roomCode: this.gameState.roomCode,
          sessionToken: this.gameState.sessionToken,
          playerId: this.gameState.playerId
        }));
      } catch (e) {}
    },

    _getSession: function () {
      try {
        var raw = localStorage.getItem('trivia_session');
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
  };

  // Expose globally
  window.TriviaApp = TriviaApp;

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      TriviaApp.init();
    });
  } else {
    TriviaApp.init();
  }
})();
