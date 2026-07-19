/**
 * Lobby Screen — Room code, QR, player tiles, mode selector, host settings.
 */
(function () {
  'use strict';

  var ALL_CATEGORIES = ['football', 'science', 'history', 'geography', 'pop_culture', 'sports', 'technology', 'arab_world', 'general'];
  var MODES = [
    { id: 'classic', icon: 'star' },
    { id: 'teams', icon: 'users' },
    { id: 'survival', icon: 'skull' },
    { id: 'race', icon: 'flag' },
    { id: 'chase', icon: 'crosshair' }
  ];
  var THEMES = ['neon', 'ramadan', 'stadium', 'retro'];

  window.TriviaScreens = window.TriviaScreens || {};

  window.TriviaScreens.Lobby = {

    render: function (data) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var roomState = data.roomState || {};
      var isHost = data.isHost;
      var players = roomState.players || [];
      var settings = roomState.settings || {};
      var mode = settings.gameMode || 'classic';

      var playerCards = this._renderPlayerCards(players, isHost, roomState.hostId, settings);

      var html = '<div class="screen screen-wide" id="lobbyScreen">' +
        // Room code + QR
        '<div class="text-center mb-4 animate-fade-in">' +
          '<p class="settings-label">' + t('lobby.room_code') + '</p>' +
          '<div class="room-code" id="roomCode" title="' + t('lobby.share_code') + '">' +
            window.TriviaUtils.escapeHtml(data.roomCode) +
          '</div>' +
          (data.qrCodeDataUrl
            ? '<div class="qr-container mt-4" style="margin:var(--space-3) auto 0;"><img src="' + data.qrCodeDataUrl + '" alt="QR Code"></div>'
            : '') +
          '<p class="section-subheader mt-4" style="margin-bottom:var(--space-2);">' + t('lobby.share_code') + '</p>' +
          '<button class="btn btn-secondary btn-sm" id="copyLinkBtn"><i data-lucide="link"></i> ' + t('lobby.copy_link') + '</button>' +
        '</div>' +

        '<div class="divider"></div>';

      // ── Mode selector ──
      html += '<div class="mb-4 animate-slide-up delay-100">' +
        '<p class="settings-label" style="margin-bottom:var(--space-2);">' + t('modes.title') + '</p>' +
        '<div class="mode-grid" id="modeGrid">';
      for (var m = 0; m < MODES.length; m++) {
        var mo = MODES[m];
        html += '<div class="mode-card' + (mode === mo.id ? ' active' : '') + (isHost ? '' : ' locked') + '" data-mode="' + mo.id + '">' +
          '<i data-lucide="' + mo.icon + '"></i>' +
          '<span class="mode-name">' + t('modes.' + mo.id) + '</span>' +
          '<span class="mode-desc">' + t('modes.' + mo.id + '_desc') + '</span>' +
        '</div>';
      }
      html += '</div></div>';

      // ── Chase hint ──
      if (mode === 'chase') {
        var chaserP = null;
        for (var cp = 0; cp < players.length; cp++) {
          if (players[cp].isChaser) { chaserP = players[cp]; break; }
        }
        html += '<div class="team-legend animate-fade-in">' +
          '<span class="team-chip" style="background:hsla(350,90%,58%,0.15);color:hsl(350,95%,70%);">' +
            (chaserP
              ? t('chase.chaser_is').replace('{player}', window.TriviaUtils.escapeHtml(chaserP.nickname))
              : t('chase.name') + ' 💀') +
          '</span>' +
        '</div>' +
        (isHost ? '<p class="text-center text-muted fs-xs mb-3">' + t('chase.assign_hint') + '</p>' : '');
      }

      // ── Teams legend ──
      if (mode === 'teams') {
        html += '<div class="team-legend animate-fade-in">' +
          '<span class="team-chip team-red">' + t('teams.red') + '</span>' +
          '<span class="team-chip team-blue">' + t('teams.blue') + '</span>' +
        '</div>' +
        (isHost ? '<p class="text-center text-muted fs-xs mb-3">' + t('teams.assign_hint') + '</p>' : '');
      }

      // ── Players ──
      html += '<div class="mb-4 animate-slide-up delay-100">' +
          '<h2 class="section-header" style="font-size:var(--fs-xl);">' +
            t('lobby.players') + ' <span class="badge badge-category" id="playerCount">' + players.length + '</span>' +
          '</h2>' +
          '<div class="player-grid" id="playerGrid">' + playerCards + '</div>' +
        '</div>';

      // ── Host settings ──
      if (isHost) {
        html += '<div class="divider"></div>' +
          '<div class="glass-card animate-slide-up delay-200">' +
            '<h3 style="font-size:var(--fs-lg);font-weight:var(--fw-bold);margin-bottom:var(--space-4);">' + t('lobby.settings') + '</h3>' +
            '<div class="settings-panel">' +
              // Categories
              '<div class="settings-group">' +
                '<label class="settings-label">' + t('lobby.categories') + '</label>' +
                '<div class="category-grid" id="categoryGrid">' +
                  this._renderCategories(settings.categories || []) +
                '</div>' +
              '</div>' +
              // Difficulty
              '<div class="settings-group">' +
                '<label class="settings-label">' + t('lobby.difficulty') + '</label>' +
                '<select class="settings-select" id="difficultySelect">' +
                  '<option value="progressive"' + (settings.difficultyMode === 'progressive' ? ' selected' : '') + '>' + t('difficulty.progressive') + '</option>' +
                  '<option value="random"' + (settings.difficultyMode === 'random' ? ' selected' : '') + '>' + t('difficulty.random') + '</option>' +
                  '<option value="easy"' + (settings.difficultyMode === 'easy' ? ' selected' : '') + '>' + t('difficulty.easy') + '</option>' +
                  '<option value="medium"' + (settings.difficultyMode === 'medium' ? ' selected' : '') + '>' + t('difficulty.medium') + '</option>' +
                  '<option value="hard"' + (settings.difficultyMode === 'hard' ? ' selected' : '') + '>' + t('difficulty.hard') + '</option>' +
                '</select>' +
              '</div>';

        // Rounds (classic/teams) | eliminationEvery (survival) | targetScore (race)
        if (mode === 'classic' || mode === 'teams') {
          html += '<div class="settings-group">' +
              '<label class="settings-label">' + t('lobby.rounds') + '</label>' +
              '<select class="settings-select" id="roundsSelect">' +
                '<option value="5"' + (settings.roundCount === 5 ? ' selected' : '') + '>5 ' + t('common.round') + '</option>' +
                '<option value="10"' + (settings.roundCount === 10 ? ' selected' : '') + '>10 ' + t('common.round') + '</option>' +
                '<option value="15"' + (settings.roundCount === 15 ? ' selected' : '') + '>15 ' + t('common.round') + '</option>' +
                '<option value="20"' + (settings.roundCount === 20 ? ' selected' : '') + '>20 ' + t('common.round') + '</option>' +
              '</select>' +
            '</div>';
        } else if (mode === 'survival') {
          html += '<div class="settings-group">' +
              '<label class="settings-label">' + t('modes.survival') + '</label>' +
              '<select class="settings-select" id="elimSelect">' +
                '<option value="1"' + (settings.eliminationEvery === 1 ? ' selected' : '') + '>' + t('survival.eliminated_title') + ' — 1 ' + t('common.round') + '</option>' +
                '<option value="2"' + (settings.eliminationEvery === 2 ? ' selected' : '') + '>' + t('survival.eliminated_title') + ' — 2 ' + t('common.round') + '</option>' +
                '<option value="3"' + (settings.eliminationEvery === 3 ? ' selected' : '') + '>' + t('survival.eliminated_title') + ' — 3 ' + t('common.round') + '</option>' +
              '</select>' +
            '</div>';
        } else if (mode === 'chase') {
          html += '<div class="settings-group">' +
              '<label class="settings-label">' + t('chase.head_start') + '</label>' +
              '<select class="settings-select" id="headStartSelect">' +
                '<option value="2"' + (settings.chaseHeadStart === 2 ? ' selected' : '') + '>2</option>' +
                '<option value="3"' + (settings.chaseHeadStart === 3 ? ' selected' : '') + '>3</option>' +
                '<option value="4"' + (settings.chaseHeadStart === 4 ? ' selected' : '') + '>4</option>' +
              '</select>' +
            '</div>';
        } else if (mode === 'race') {
          html += '<div class="settings-group">' +
              '<label class="settings-label">' + t('race.track_title') + '</label>' +
              '<select class="settings-select" id="targetSelect">' +
                '<option value="3000"' + (settings.targetScore === 3000 ? ' selected' : '') + '>3000</option>' +
                '<option value="5000"' + (settings.targetScore === 5000 ? ' selected' : '') + '>5000</option>' +
                '<option value="8000"' + (settings.targetScore === 8000 ? ' selected' : '') + '>8000</option>' +
              '</select>' +
            '</div>';
        }

        // Timer
        html += '<div class="settings-group">' +
                '<label class="settings-label">' + t('lobby.timer') + '</label>' +
                '<select class="settings-select" id="timerSelect">' +
                  '<option value="10000"' + (settings.timerDuration === 10000 ? ' selected' : '') + '>10 ' + t('common.seconds') + '</option>' +
                  '<option value="15000"' + (settings.timerDuration === 15000 ? ' selected' : '') + '>15 ' + t('common.seconds') + '</option>' +
                  '<option value="20000"' + (settings.timerDuration === 20000 ? ' selected' : '') + '>20 ' + t('common.seconds') + '</option>' +
                  '<option value="30000"' + (settings.timerDuration === 30000 ? ' selected' : '') + '>30 ' + t('common.seconds') + '</option>' +
                '</select>' +
              '</div>' +

              // Toggles
              '<div class="settings-checkbox">' +
                '<input type="checkbox" id="penaltyToggle"' + (settings.penaltyEnabled !== false ? ' checked' : '') + '>' +
                '<label for="penaltyToggle">' + t('lobby.penalty') + '</label>' +
              '</div>';

        if (mode === 'classic' || mode === 'teams') {
          html += '<div class="settings-checkbox">' +
              '<input type="checkbox" id="goldenToggle"' + (settings.goldenEnabled !== false ? ' checked' : '') + '>' +
              '<label for="goldenToggle"><i data-lucide="star"></i>' + t('lobby.golden_toggle') + '</label>' +
            '</div>';
        }

        if (mode !== 'chase') {
          html += '<div class="settings-checkbox">' +
                '<input type="checkbox" id="bellToggle"' + (settings.bellEnabled !== false ? ' checked' : '') + '>' +
                '<label for="bellToggle"><i data-lucide="bell"></i>' + t('lobby.bell_toggle') + '</label>' +
              '</div>' +
              '<div class="settings-checkbox">' +
                '<input type="checkbox" id="guessToggle"' + (settings.guessEnabled !== false ? ' checked' : '') + '>' +
                '<label for="guessToggle"><i data-lucide="target"></i>' + t('guess.title') + '</label>' +
              '</div>';
        }
        html += 
              '<div class="settings-checkbox">' +
                '<input type="checkbox" id="displayToggle"' + (settings.displayMode === true ? ' checked' : '') + '>' +
                '<label for="displayToggle"><i data-lucide="tv"></i>' + t('display.toggle') + '</label>' +
              '</div>' +
              '<div class="settings-group">' +
                '<label class="settings-label"><i data-lucide="palette" style="width:13px;height:13px;"></i> ' + t('themes.title') + '</label>' +
                '<div class="theme-grid" id="themeGrid">' +
                  THEMES.map(function (th) {
                    return '<div class="theme-card' + ((settings.theme || 'neon') === th ? ' active' : '') + '" data-theme-id="' + th + '">' +
                      '<span class="theme-swatch sw-' + th + '"></span>' +
                      '<span>' + t('themes.' + th) + '</span>' +
                    '</div>';
                  }).join('') +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // Start button
          '<div class="mt-5 animate-slide-up delay-300">' +
            '<button class="btn btn-primary btn-lg w-full" id="startGameBtn"' +
              (players.length < 2 ? ' disabled' : '') + '>' +
              '<i data-lucide="play"></i> ' + t('lobby.start_game') +
            '</button>' +
            (players.length < 2
              ? '<p class="text-center" style="color:var(--text-muted);font-size:var(--fs-sm);margin-top:var(--space-2);">' + t('lobby.min_players') + '</p>'
              : '') +
            (settings.displayMode ? '<p class="text-center text-muted fs-xs mt-2">' + t('display.hint') + '</p>' : '') +
          '</div>';
      } else {
        html += '<div class="waiting-indicator animate-fade-in delay-200">' +
          '<span>' + t('lobby.waiting') + '</span>' +
          '<div class="waiting-dots"><span></span><span></span><span></span></div>' +
        '</div>';
      }

      html += window.TriviaApp.renderReactionBar();
      html += '</div>';
      return html;
    },

    init: function (data) {
      var self = this;
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var settings = (data.roomState && data.roomState.settings) || {};
      var mode = settings.gameMode || 'classic';

      // Room code click to copy
      var roomCodeEl = document.getElementById('roomCode');
      if (roomCodeEl) {
        roomCodeEl.addEventListener('click', function () {
          navigator.clipboard.writeText(data.roomCode).then(function () {
            window.TriviaApp.showToast(t('lobby.copied'), 'success');
          }).catch(function () {});
        });
      }

      // Copy invite link
      var copyLinkBtn = document.getElementById('copyLinkBtn');
      if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', function () {
          window.TriviaSound.play('tap');
          var url = window.TriviaApp.gameState.joinUrl ||
            (window.location.origin + '?join=' + data.roomCode);
          navigator.clipboard.writeText(url).then(function () {
            window.TriviaApp.showToast(t('lobby.link_copied'), 'success');
          }).catch(function () {});
        });
      }

      window.TriviaApp.bindReactionBar();

      if (data.isHost) {
        // Mode cards
        document.querySelectorAll('.mode-card').forEach(function (card) {
          card.addEventListener('click', function () {
            var newMode = card.getAttribute('data-mode');
            if (newMode === mode) return;
            window.TriviaSound.play('tap');
            self._emitSettings({ gameMode: newMode });
            // Host doesn't get settings_updated re-render — refresh locally
            var st = window.TriviaApp.gameState.settings || settings;
            st.gameMode = newMode;
            window.TriviaApp.showScreen('lobby', {
              roomCode: data.roomCode,
              qrCodeDataUrl: data.qrCodeDataUrl,
              roomState: {
                settings: st,
                players: window.TriviaApp.gameState.players || [],
                hostId: window.TriviaApp.gameState.playerId
              },
              isHost: true
            });
          });
        });

        // Settings change handlers
        ['difficultySelect', 'roundsSelect', 'timerSelect', 'elimSelect', 'targetSelect', 'headStartSelect',
         'penaltyToggle', 'goldenToggle', 'bellToggle', 'guessToggle', 'displayToggle'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) {
            el.addEventListener('change', function () {
              window.TriviaSound.play('tap');
              self._emitSettings({});
            });
          }
        });

        // Category chips
        document.querySelectorAll('.category-chip').forEach(function (chip) {
          chip.addEventListener('click', function () {
            window.TriviaSound.play('tap');
            chip.classList.toggle('active');
            self._emitSettings({});
          });
        });

        // Start game button
        var startBtn = document.getElementById('startGameBtn');
        if (startBtn) {
          startBtn.addEventListener('click', function () {
            window.TriviaSocket.emit('start_game');
          });
        }

        // Theme cards
        document.querySelectorAll('.theme-card').forEach(function (card) {
          card.addEventListener('click', function () {
            window.TriviaSound.play('tap');
            document.querySelectorAll('.theme-card').forEach(function (c) { c.classList.remove('active'); });
            card.classList.add('active');
            self._emitSettings({ theme: card.getAttribute('data-theme-id') });
            window.TriviaApp.applyTheme();
          });
        });

        // Chaser assignment: tap a player card
        if (mode === 'chase') {
          document.querySelectorAll('.player-card.chaser-pickable').forEach(function (card) {
            card.addEventListener('click', function () {
              window.TriviaSound.play('tap');
              window.TriviaSocket.emit('assign_chaser', { playerId: card.getAttribute('data-player-id') });
            });
          });
        }

        // Team switching: tap a player card
        if (mode === 'teams') {
          document.querySelectorAll('.player-card.team-pickable').forEach(function (card) {
            card.addEventListener('click', function () {
              window.TriviaSound.play('tap');
              window.TriviaSocket.emit('assign_team', { playerId: card.getAttribute('data-player-id') });
            });
          });
        }

        // Kick buttons
        document.querySelectorAll('.kick-btn').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var playerId = btn.getAttribute('data-player-id');
            if (playerId) {
              window.TriviaSocket.emit('kick_player', { playerId: playerId });
            }
          });
        });
      }

      if (window.lucide) lucide.createIcons();
    },

    _renderPlayerCards: function (players, isHost, hostId, settings) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var myId = window.TriviaApp.gameState.playerId;
      var mode = (settings && settings.gameMode) || 'classic';
      var displayMode = Boolean(settings && settings.displayMode);
      var html = '';

      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        var isMe = p.id === myId;
        var isPlayerHost = p.id === hostId || p.isHost;
        var isPresenter = displayMode && isPlayerHost;
        var teamClass = (mode === 'teams' && !isPresenter && p.team) ? ' team-' + p.team : '';
        var pickable = mode === 'teams' && isHost && !isPresenter;
        var chaserPickable = mode === 'chase' && isHost && !isPresenter;
        var chaserClass = (mode === 'chase' && p.isChaser) ? ' chaser' : '';

        html += '<div class="player-card' + teamClass + chaserClass + (pickable ? ' team-pickable' : '') + (chaserPickable ? ' team-pickable chaser-pickable' : '') + '" data-player-id="' + p.id + '" style="animation-delay:' + (i * 70) + 'ms;">' +
          window.TriviaUtils.generateAvatarHTML(p.avatar, 'avatar-lg') +
          '<span class="player-name">' + window.TriviaUtils.escapeHtml(p.nickname) + '</span>';

        if (mode === 'chase' && p.isChaser) {
          html += '<span class="badge chaser-badge"><i data-lucide="crosshair"></i> ' + t('chase.name') + '</span>';
        }
        if (isPresenter) {
          html += '<span class="badge badge-host"><i data-lucide="tv"></i> ' + t('lobby.host') + '</span>';
        } else if (isPlayerHost) {
          html += '<span class="badge badge-host"><i data-lucide="crown"></i> ' + t('lobby.host') + '</span>';
        } else if (isMe) {
          html += '<span class="badge badge-category">' + t('lobby.you') + '</span>';
        }

        if (isHost && !isPlayerHost && !isMe) {
          html += '<button class="kick-btn" data-player-id="' + p.id + '" title="' + t('lobby.kick') + '"><i data-lucide="x"></i></button>';
        }

        html += '</div>';
      }
      return html;
    },

    _renderCategories: function (activeCategories) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var html = '';

      for (var i = 0; i < ALL_CATEGORIES.length; i++) {
        var cat = ALL_CATEGORIES[i];
        var isActive = activeCategories.indexOf(cat) !== -1;
        html += '<div class="category-chip' + (isActive ? ' active' : '') + '" data-category="' + cat + '">' +
          t('categories.' + cat) +
        '</div>';
      }
      return html;
    },

    _emitSettings: function (overrides) {
      var activeCategories = [];
      document.querySelectorAll('.category-chip.active').forEach(function (chip) {
        activeCategories.push(chip.getAttribute('data-category'));
      });

      if (activeCategories.length === 0) {
        activeCategories = ALL_CATEGORIES.slice();
        document.querySelectorAll('.category-chip').forEach(function (chip) {
          chip.classList.add('active');
        });
      }

      var read = function (id, fallback) {
        var el = document.getElementById(id);
        return el ? el.value : fallback;
      };
      var readCheck = function (id, fallback) {
        var el = document.getElementById(id);
        return el ? el.checked : fallback;
      };

      var current = window.TriviaApp.gameState.settings || {};
      var settings = {
        categories: activeCategories,
        difficultyMode: read('difficultySelect', current.difficultyMode || 'progressive'),
        roundCount: parseInt(read('roundsSelect', current.roundCount || 10), 10),
        timerDuration: parseInt(read('timerSelect', current.timerDuration || 20000), 10),
        eliminationEvery: parseInt(read('elimSelect', current.eliminationEvery || 2), 10),
        targetScore: parseInt(read('targetSelect', current.targetScore || 5000), 10),
        chaseHeadStart: parseInt(read('headStartSelect', current.chaseHeadStart || 3), 10),
        theme: current.theme || 'neon',
        penaltyEnabled: readCheck('penaltyToggle', current.penaltyEnabled !== false),
        goldenEnabled: readCheck('goldenToggle', current.goldenEnabled !== false),
        bellEnabled: readCheck('bellToggle', current.bellEnabled !== false),
        guessEnabled: readCheck('guessToggle', current.guessEnabled !== false),
        displayMode: readCheck('displayToggle', current.displayMode === true),
        gameMode: current.gameMode || 'classic'
      };
      if (overrides) {
        for (var k in overrides) settings[k] = overrides[k];
      }

      // Keep local copy fresh (host doesn't re-render on settings_updated)
      window.TriviaApp.gameState.settings = settings;
      window.TriviaApp.applyStageClass();

      window.TriviaSocket.emit('update_settings', { settings: settings });
    },

    /** Live team/chaser updates when the host reassigns players. */
    onPlayerUpdated: function (player) {
      var card = document.querySelector('.player-card[data-player-id="' + player.id + '"]');
      if (!card) return;
      card.classList.remove('team-red', 'team-blue');
      if (player.team) card.classList.add('team-' + player.team);
      var settings = window.TriviaApp.gameState.settings || {};
      if (settings.gameMode === 'chase') {
        card.classList.toggle('chaser', player.isChaser === true);
        var badge = card.querySelector('.chaser-badge');
        if (player.isChaser && !badge) {
          var t2 = window.TriviaI18n.t.bind(window.TriviaI18n);
          var span = document.createElement('span');
          span.className = 'badge chaser-badge';
          span.innerHTML = '<i data-lucide="crosshair"></i> ' + t2('chase.name');
          card.appendChild(span);
          if (window.lucide) lucide.createIcons();
        } else if (!player.isChaser && badge) {
          badge.parentNode.removeChild(badge);
        }
      }
    },

    onPlayerJoined: function (player) {
      var grid = document.getElementById('playerGrid');
      var countEl = document.getElementById('playerCount');
      var startBtn = document.getElementById('startGameBtn');

      window.TriviaSound.play('join');

      if (grid) {
        var t = window.TriviaI18n.t.bind(window.TriviaI18n);
        var settings = window.TriviaApp.gameState.settings || {};
        var card = document.createElement('div');
        var teamClass = (settings.gameMode === 'teams' && player.team) ? ' team-' + player.team : '';
        var pickable = settings.gameMode === 'teams' && window.TriviaApp.gameState.isHost;
        card.className = 'player-card' + teamClass + (pickable ? ' team-pickable' : '');
        card.setAttribute('data-player-id', player.id);
        card.innerHTML = window.TriviaUtils.generateAvatarHTML(player.avatar, 'avatar-lg') +
          '<span class="player-name">' + window.TriviaUtils.escapeHtml(player.nickname) + '</span>';

        if (window.TriviaApp.gameState.isHost) {
          card.innerHTML += '<button class="kick-btn" data-player-id="' + player.id + '" title="' + t('lobby.kick') + '"><i data-lucide="x"></i></button>';
          var kickBtn = card.querySelector('.kick-btn');
          if (kickBtn) {
            kickBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              window.TriviaSocket.emit('kick_player', { playerId: player.id });
            });
          }
          if (pickable) {
            card.addEventListener('click', function () {
              window.TriviaSound.play('tap');
              window.TriviaSocket.emit('assign_team', { playerId: player.id });
            });
          }
        }

        grid.appendChild(card);
        if (window.lucide) lucide.createIcons();
      }

      var count = document.querySelectorAll('.player-card').length;
      if (countEl) countEl.textContent = count;
      if (startBtn) startBtn.disabled = count < 2;
    },

    onPlayerLeft: function (playerId) {
      var card = document.querySelector('.player-card[data-player-id="' + playerId + '"]');
      window.TriviaSound.play('leave');
      if (card) {
        card.style.animation = 'fadeOut 300ms ease forwards';
        setTimeout(function () {
          if (card.parentNode) card.parentNode.removeChild(card);
          var countEl = document.getElementById('playerCount');
          var startBtn = document.getElementById('startGameBtn');
          var count = document.querySelectorAll('.player-card').length;
          if (countEl) countEl.textContent = count;
          if (startBtn) startBtn.disabled = count < 2;
        }, 300);
      }
    }
  };
})();
