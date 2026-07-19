/**
 * Question Screen — question, timer, answers, power-ups / race items.
 * Variants: normal · guess (numeric) · buzzer (big-screen phones) ·
 * stage (big-screen host) · spectator (duel / eliminated / finished).
 */
(function () {
  'use strict';

  window.TriviaScreens = window.TriviaScreens || {};

  window.TriviaScreens.Question = {
    hasAnswered: false,
    timerRAF: null,
    timerSync: null,
    lastTickSecond: null,
    isSpectator: false,

    render: function (data) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var lang = window.TriviaI18n.getLang();
      var questionText = data.question[lang] || data.question.ar || data.question.en || '';
      var circumference = 2 * Math.PI * 40;
      var gs = window.TriviaApp.gameState;
      var myId = gs.playerId;
      var special = data.special || null;
      var isGuess = data.type === 'guess';
      var mode = data.mode || (gs.settings && gs.settings.gameMode) || 'classic';
      var settings = gs.settings || {};
      var isStage = Boolean(settings.displayMode && gs.isHost);
      var isBuzzer = Boolean(settings.displayMode && !gs.isHost);
      var me = gs.player || {};

      // Spectators: duel bystanders, the eliminated, race finishers,
      // caught runners and escaped runners
      var duelSpectator = special === 'tiebreaker' &&
        data.eligibleIds && data.eligibleIds.indexOf(myId) === -1;
      this.isSpectator = !isStage && (duelSpectator || me.isEliminated === true ||
        me.isFinished === true || me.isCaught === true || me.isHome === true);
      var spectatorText = duelSpectator ? t('game.spectator')
        : me.isEliminated ? t('survival.eliminated_you')
        : me.isCaught ? t('chase.you_caught')
        : me.isHome ? t('chase.you_home')
        : me.isFinished ? t('race.you_finished') : '';

      // Progress bar
      var progress = Math.min(100, ((data.questionIndex + 1) / data.totalQuestions) * 100);
      var counterText = special === 'tiebreaker'
        ? t('tiebreaker.title')
        : t('game.question') + ' ' + (data.questionIndex + 1) + ' ' + t('game.of') + ' ' + data.totalQuestions;

      // ── Special banner ──
      var bannerHtml = '';
      if (special === 'golden') {
        bannerHtml = '<div class="special-banner special-golden"><i data-lucide="star"></i>' + t('game.golden_round') + '</div>';
      } else if (special === 'bell') {
        bannerHtml = '<div class="special-banner special-bell"><i data-lucide="bell"></i>' + t('game.bell_round') + '</div>';
      } else if (special === 'tiebreaker') {
        bannerHtml = '<div class="special-banner special-tiebreaker"><i data-lucide="swords"></i>' + t('game.tiebreaker_round') + '</div>';
      } else if (isGuess) {
        bannerHtml = '<div class="special-banner special-guess"><i data-lucide="target"></i>' + t('guess.title') + ' — ' + t('guess.subtitle') + '</div>';
      } else if (mode === 'chase' && me.isChaser) {
        bannerHtml = '<div class="special-banner special-chaser"><i data-lucide="crosshair"></i>' + t('chase.you_are_chaser') + '</div>';
      }

      // ── Race target line ──
      var raceLine = '';
      if (mode === 'race' && data.targetScore) {
        raceLine = '<p class="text-center fs-xs text-muted" style="margin-bottom:var(--space-2);">' +
          '🏁 ' + t('race.target').replace('{n}', data.targetScore) + '</p>';
      }

      // ── Action bar: race items OR classic power-ups ──
      var actionsHtml = '';
      if (!isStage && !this.isSpectator && special !== 'tiebreaker') {
        if (mode === 'chase') {
          actionsHtml = '<div class="items-container chase-tools animate-slide-up delay-100">' +
            '<button class="item-btn" data-type="sprint"' + (me.sprintUsed ? ' disabled' : '') + '>' +
              '<i data-lucide="zap"></i>' +
              '<span>' + t('chase.sprint') + ' — ' + t('chase.sprint_desc') + '</span>' +
            '</button>' +
          '</div>';
        } else if (mode === 'race') {
          var items = me.items || { rocket: 0, shield: 0, nitro: 0 };
          var defs = [
            { type: 'rocket', icon: 'rocket', label: t('race.rocket') },
            { type: 'shield', icon: 'shield', label: t('race.shield') },
            { type: 'nitro', icon: 'gauge', label: t('race.nitro') }
          ];
          actionsHtml = '<div class="items-container animate-slide-up delay-100">';
          for (var d = 0; d < defs.length; d++) {
            var it = defs[d];
            var count = items[it.type] || 0;
            actionsHtml += '<button class="item-btn" data-type="' + it.type + '"' + (count > 0 ? '' : ' disabled') + '>' +
              '<i data-lucide="' + it.icon + '"></i>' +
              '<span>' + it.label + '</span>' +
              (count > 0 ? '<span class="item-count">' + count + '</span>' : '') +
            '</button>';
          }
          actionsHtml += '</div>';
        } else {
          var powerups = me.powerups || { fifty_fifty: 0, freeze: 0, double: 0, steal: 0 };
          var isTF = !isGuess && data.options.length < 4;
          var types = [
            { type: 'fifty_fifty', icon: 'help-circle', label: t('powerups.fifty_fifty'), blocked: isTF || isGuess },
            { type: 'freeze', icon: 'snowflake', label: t('powerups.freeze'), blocked: false },
            { type: 'double', icon: 'zap', label: t('powerups.double'), blocked: false },
            { type: 'steal', icon: 'users', label: t('powerups.steal'), blocked: isGuess }
          ];
          actionsHtml = '<div class="powerups-container animate-slide-up delay-100">';
          for (var k = 0; k < types.length; k++) {
            var tObj = types[k];
            var available = powerups[tObj.type] > 0 && !tObj.blocked;
            actionsHtml += '<button class="powerup-btn" data-type="' + tObj.type + '"' + (available ? '' : ' disabled') + '>' +
              '<i data-lucide="' + tObj.icon + '"></i>' +
              '<span>' + tObj.label + '</span>' +
            '</button>';
          }
          actionsHtml += '</div>';
        }
      }

      var html = '<div class="screen' + (special === 'golden' ? ' theme-golden' : '') + (isStage ? ' screen-wide' : '') + '" id="questionScreen">' +
        '<div class="progress-bar mb-4">' +
          '<div class="progress-bar-fill" style="width:' + progress + '%;"></div>' +
        '</div>' +

        bannerHtml + raceLine +

        // Top bar
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4);gap:var(--space-2);flex-wrap:wrap;">' +
          '<span style="font-size:var(--fs-sm);font-weight:var(--fw-semibold);color:var(--text-secondary);">' +
            counterText +
          '</span>' +
          '<div style="display:flex;gap:var(--space-2);">' +
            '<span class="badge badge-category">' + t('categories.' + data.category) + '</span>' +
            '<span class="badge badge-' + data.difficulty + '">' + t('difficulty.' + data.difficulty) + '</span>' +
          '</div>' +
        '</div>' +

        // Timer
        '<div class="timer-container mb-4 animate-bounce-in" id="timerContainer">' +
          '<svg class="timer-ring" viewBox="0 0 92 92">' +
            '<defs>' +
              '<linearGradient id="timerGradient" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="hsl(262, 92%, 66%)"/>' +
                '<stop offset="1" stop-color="hsl(340, 90%, 64%)"/>' +
              '</linearGradient>' +
            '</defs>' +
            '<circle class="timer-ring-bg" cx="46" cy="46" r="40"></circle>' +
            '<circle class="timer-ring-progress" id="timerProgress" cx="46" cy="46" r="40" ' +
              'stroke-dasharray="' + circumference + '" stroke-dashoffset="0"></circle>' +
          '</svg>' +
          '<span class="timer-number" id="timerNumber">' + Math.ceil(data.durationMs / 1000) + '</span>' +
        '</div>';

      // ── Question text (buzzer phones skip it for choice questions) ──
      var showQuestionText = !isBuzzer || isGuess;
      if (showQuestionText) {
        html += '<div class="glass-card card-beam mb-4 animate-slide-up" style="text-align:center;">' +
          '<p class="' + (isStage ? 'stage-question-text' : '') + '" style="font-size:var(--fs-xl);font-weight:var(--fw-bold);line-height:var(--lh-relaxed);">' +
            window.TriviaUtils.escapeHtml(questionText) +
          '</p>' +
        '</div>';
      } else {
        html += '<div class="stage-hint mb-3"><i data-lucide="tv"></i>' + t('display.buzzer_hint') + '</div>';
      }

      html += (this.isSpectator
        ? '<div class="spectator-note"><i data-lucide="eye"></i>' + spectatorText + '</div>'
        : actionsHtml);

      // ── Answer area ──
      if (isGuess) {
        if (isStage) {
          html += '<div class="stage-answer-counter">' +
            '<span class="stage-count"><span id="answeredNum">0</span>/<span id="answeredTotal">?</span></span>' +
            '<span class="text-secondary fs-sm">' + t('game.answered') + '</span>' +
          '</div>';
        } else {
          var unit = data.unit ? (data.unit[lang] || data.unit.ar || '') : '';
          html += '<div class="guess-panel animate-slide-up delay-200">' +
            '<input type="text" inputmode="numeric" pattern="[0-9]*" class="guess-input" id="guessInput" placeholder="' + t('guess.placeholder') + '"' + (this.isSpectator ? ' disabled' : '') + '>' +
            (unit ? '<span class="guess-unit">' + window.TriviaUtils.escapeHtml(unit) + '</span>' : '') +
            '<button class="btn btn-primary btn-lg w-full" id="guessSubmit"' + (this.isSpectator ? ' disabled' : '') + '>' +
              '<i data-lucide="target"></i> ' + t('guess.submit') +
            '</button>' +
          '</div>';
        }
      } else if (isStage) {
        // Stage: big live counter + read-only option reference
        html += '<div class="stage-answer-counter">' +
            '<span class="stage-count"><span id="answeredNum">0</span>/<span id="answeredTotal">?</span></span>' +
            '<span class="text-secondary fs-sm">' + t('game.answered') + '</span>' +
          '</div>' +
          '<div class="options-grid stage-options' + (data.options.length < 4 ? ' options-tf' : '') + '">';
        for (var s = 0; s < data.options.length; s++) {
          var sText = data.options[s][lang] || data.options[s].ar || '';
          html += '<button class="option-btn ' + window.TriviaUtils.getOptionClass(s) + '">' +
            window.TriviaUtils.optionShapeHTML(s) +
            '<span class="option-label">' + window.TriviaUtils.escapeHtml(sText) + '</span>' +
          '</button>';
        }
        html += '</div>';
      } else if (isBuzzer) {
        // Buzzer: giant shape pads (T/F keeps its two labels)
        var isTF2 = data.options.length < 4;
        html += '<div class="buzzer-grid' + (isTF2 ? ' options-tf' : '') + ' animate-slide-up delay-200" id="optionsGrid">';
        for (var b = 0; b < data.options.length; b++) {
          var bText = data.options[b][lang] || data.options[b].ar || '';
          html += '<button class="buzzer-btn option-' + 'abcd'[b] + (this.isSpectator ? ' disabled' : '') + '" data-index="' + b + '">' +
            '<svg viewBox="0 0 24 24">' + this._shapePath(b) + '</svg>' +
            (isTF2 ? '<span>' + window.TriviaUtils.escapeHtml(bText) + '</span>' : '') +
          '</button>';
        }
        html += '</div>';
      } else {
        html += '<div class="options-grid' + (data.options.length < 4 ? ' options-tf' : '') + ' animate-slide-up delay-200" id="optionsGrid">';
        for (var i = 0; i < data.options.length; i++) {
          var optionText = data.options[i][lang] || data.options[i].ar || data.options[i].en || '';
          html += '<button class="option-btn ' + window.TriviaUtils.getOptionClass(i) + (this.isSpectator ? ' disabled' : '') + '" data-index="' + i + '">' +
            window.TriviaUtils.optionShapeHTML(i) +
            '<span class="option-label">' + window.TriviaUtils.escapeHtml(optionText) + '</span>' +
          '</button>';
        }
        html += '</div>';
      }

      // Answer count (non-stage — the stage has the big counter)
      if (!isStage) {
        html += '<div class="answer-count" id="answerCount" style="visibility:hidden;">' +
          '<span id="answeredNum">0</span>/<span id="answeredTotal">0</span> ' + t('game.answered') +
        '</div>' +
        '<div class="waiting-indicator" id="waitingIndicator" style="display:none;">' +
          '<span>' + t('game.waiting_others') + '</span>' +
          '<div class="waiting-dots"><span></span><span></span><span></span></div>' +
        '</div>';
      }

      html += window.TriviaApp.renderReactionBar();
      html += '</div>';
      return html;
    },

    _shapePath: function (index) {
      var shapes = [
        '<polygon points="12 3 22 21 2 21"/>',
        '<polygon points="12 2 22 12 12 22 2 12"/>',
        '<circle cx="12" cy="12" r="10"/>',
        '<rect x="3" y="3" width="18" height="18" rx="3"/>'
      ];
      return shapes[index] || shapes[0];
    },

    init: function (data) {
      var self = this;
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      this.hasAnswered = false;
      this.lastTickSecond = null;
      var powerupUsedThisRound = false;
      var itemUsedThisRound = false;
      var isGuess = data.type === 'guess';
      var gs = window.TriviaApp.gameState;
      var isStage = Boolean(gs.settings && gs.settings.displayMode && gs.isHost);

      this.timerSync = window.TriviaUtils.createTimerSync(data.serverTimestamp, data.durationMs);

      // Entry sounds + announcer (skip when rejoining mid-question)
      var elapsed = Date.now() - (data.serverTimestamp - (window.TriviaSocket.serverTimeOffset || 0));
      if (elapsed < 2500) {
        if (data.special === 'bell') window.TriviaSound.play('bell');
        else if (data.special === 'golden') window.TriviaSound.play('golden');
        else window.TriviaSound.play('questionIn');

        var lang = window.TriviaI18n.getLang();
        var qText = data.question[lang] || data.question.ar || '';
        window.TriviaSound.speak(qText, lang);
      }

      this._startTimer(data.durationMs);

      // ── Answer handlers ──
      if (!this.isSpectator && !isStage) {
        if (isGuess) {
          var input = document.getElementById('guessInput');
          var submit = document.getElementById('guessSubmit');
          var sendGuess = function () {
            if (self.hasAnswered) return;
            var v = parseFloat((input.value || '').replace(/[^\d.-]/g, ''));
            if (!isFinite(v)) return;
            self.hasAnswered = true;
            window.TriviaSound.play('select');
            window.TriviaUtils.vibrate(18);
            input.disabled = true;
            submit.disabled = true;
            self._disableAllPowerups();
            var waiting = document.getElementById('waitingIndicator');
            if (waiting) waiting.style.display = '';
            window.TriviaSocket.emit('submit_answer', { guess: v });
          };
          if (input) {
            input.addEventListener('input', function () {
              this.value = this.value.replace(/[^\d.-]/g, '');
            });
            input.addEventListener('keydown', function (e) {
              if (e.key === 'Enter') sendGuess();
            });
            setTimeout(function () { try { input.focus(); } catch (e) {} }, 350);
          }
          if (submit) submit.addEventListener('click', sendGuess);
        } else {
          document.querySelectorAll('#optionsGrid [data-index]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              self._onOptionClick(parseInt(btn.getAttribute('data-index'), 10));
            });
          });
        }
      }

      // ── Power-up handlers ──
      document.querySelectorAll('.powerup-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (self.hasAnswered || powerupUsedThisRound) return;
          var type = btn.getAttribute('data-type');

          if (type === 'steal') {
            self._showTargetModal(t('powerups.steal_modal_title'), t('powerups.steal_select_target'), function (targetId) {
              powerupUsedThisRound = true;
              btn.classList.add('active');
              self._disableAllPowerups();
              window.TriviaSound.play('powerup');
              window.TriviaSocket.emit('use_powerup', { type: type, targetId: targetId });
            });
          } else {
            powerupUsedThisRound = true;
            btn.classList.add('active');
            self._disableAllPowerups();
            window.TriviaSound.play('powerup');
            window.TriviaSocket.emit('use_powerup', { type: type });
          }
        });
      });

      // ── Race item handlers ──
      document.querySelectorAll('.item-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (itemUsedThisRound) return;
          var type = btn.getAttribute('data-type');

          var useIt = function (targetId) {
            itemUsedThisRound = true;
            btn.classList.add('active');
            document.querySelectorAll('.item-btn').forEach(function (b) { b.disabled = true; });
            if (type === 'rocket') window.TriviaSound.play('rocket');
            else if (type === 'nitro') window.TriviaSound.play('nitro');
            else window.TriviaSound.play('powerup');
            window.TriviaSocket.emit('use_item', { type: type, targetId: targetId || null });
          };

          if (type === 'rocket') {
            self._showTargetModal(t('race.rocket') + ' 🚀', t('race.rocket_pick'), useIt);
          } else {
            useIt(null);
          }
        });
      });

      // Power-up socket responses
      window.TriviaSocket.on('powerup_result', function (res) {
        if (res.type === 'fifty_fifty') {
          (res.removeIndices || []).forEach(function (idx) {
            var optBtn = document.querySelector('#optionsGrid [data-index="' + idx + '"]');
            if (optBtn) {
              optBtn.classList.add('dimmed');
              optBtn.classList.add('disabled');
            }
          });
        } else if (res.type === 'freeze') {
          self.timerSync = window.TriviaUtils.createTimerSync(data.serverTimestamp + 5000, data.durationMs);
        }
      });

      window.TriviaApp.bindReactionBar();

      if (window.lucide) lucide.createIcons();
    },

    _startTimer: function (durationMs) {
      var self = this;
      var circumference = 2 * Math.PI * 40;
      var progressEl = document.getElementById('timerProgress');
      var numberEl = document.getElementById('timerNumber');
      var containerEl = document.getElementById('timerContainer');
      var vignette = document.getElementById('dangerVignette');

      function tick() {
        if (!self.timerSync) return;

        var remaining = self.timerSync.getRemaining();
        var progress = self.timerSync.getProgress();

        if (progressEl) {
          progressEl.setAttribute('stroke-dashoffset', circumference * progress);
          progressEl.classList.remove('warning', 'danger');
          if (remaining < 5000) progressEl.classList.add('danger');
          else if (remaining < 10000) progressEl.classList.add('warning');
        }

        var inDanger = remaining > 0 && remaining < 5000;
        if (containerEl) containerEl.classList.toggle('danger-pulse', inDanger);
        if (vignette) vignette.classList.toggle('on', inDanger);

        var second = Math.ceil(remaining / 1000);
        if (inDanger && second !== self.lastTickSecond && !self.hasAnswered) {
          self.lastTickSecond = second;
          window.TriviaSound.play('lastSeconds');
        }

        if (numberEl) numberEl.textContent = second;

        if (remaining > 0) {
          self.timerRAF = requestAnimationFrame(tick);
        } else if (vignette) {
          vignette.classList.remove('on');
        }
      }

      this.timerRAF = requestAnimationFrame(tick);
    },

    _onOptionClick: function (index) {
      if (this.hasAnswered || this.isSpectator) return;
      this.hasAnswered = true;

      window.TriviaSound.play('select');
      window.TriviaUtils.vibrate(18);

      this._disableAllPowerups();

      document.querySelectorAll('#optionsGrid [data-index]').forEach(function (btn) {
        var btnIndex = parseInt(btn.getAttribute('data-index'), 10);
        if (btnIndex === index) btn.classList.add('selected');
        btn.classList.add('disabled');
      });

      var waiting = document.getElementById('waitingIndicator');
      if (waiting) waiting.style.display = '';

      window.TriviaSocket.emit('submit_answer', { optionIndex: index });
    },

    _disableAllPowerups: function () {
      document.querySelectorAll('.powerup-btn').forEach(function (btn) {
        btn.disabled = true;
      });
    },

    /** Pick-a-player modal (steal power-up + rocket item). */
    _showTargetModal: function (title, subtitle, callback) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);

      var players = window.TriviaApp.gameState.players || [];
      var myId = window.TriviaApp.gameState.playerId;
      var settings = window.TriviaApp.gameState.settings || {};
      var otherPlayers = players.filter(function (p) {
        if (p.id === myId || p.isConnected === false || p.isEliminated) return false;
        if (settings.displayMode && p.isHost) return false;
        return true;
      });

      var modalHtml = '<div class="powerup-modal" id="targetModal">' +
        '<div class="glass-card powerup-modal-content">' +
          '<h3 class="text-center mb-3">' + title + '</h3>' +
          '<p class="text-secondary text-center mb-4" style="font-size:var(--fs-sm);">' + subtitle + '</p>' +
          '<div class="target-list">';

      if (otherPlayers.length === 0) {
        modalHtml += '<p class="text-muted text-center" style="font-size:var(--fs-sm);">' + t('lobby.waiting') + '</p>';
      } else {
        for (var i = 0; i < otherPlayers.length; i++) {
          var op = otherPlayers[i];
          modalHtml += '<button class="target-btn" data-id="' + op.id + '">' +
            window.TriviaUtils.generateAvatarHTML(op.avatar, 'avatar-sm') +
            '<span class="player-name">' + window.TriviaUtils.escapeHtml(op.nickname) + '</span>' +
            '<span class="player-score">' + (op.score || 0) + '</span>' +
          '</button>';
        }
      }

      modalHtml += '</div>' +
          '<button class="btn btn-secondary w-full" id="closeTargetModal">' + t('common.close') + '</button>' +
        '</div>' +
      '</div>';

      var div = document.createElement('div');
      div.innerHTML = modalHtml;
      var modalEl = div.firstChild;
      document.body.appendChild(modalEl);

      modalEl.querySelectorAll('.target-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          callback(btn.getAttribute('data-id'));
          if (modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
        });
      });

      var closeBtn = modalEl.querySelector('#closeTargetModal');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          if (modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
        });
      }

      if (window.lucide) lucide.createIcons();
    },

    updateAnswerCount: function (answered, total) {
      var countEl = document.getElementById('answerCount');
      var numEl = document.getElementById('answeredNum');
      var totalEl = document.getElementById('answeredTotal');

      if (countEl) countEl.style.visibility = 'visible';
      if (numEl) numEl.textContent = answered;
      if (totalEl) totalEl.textContent = total;
    },

    destroy: function () {
      window.TriviaSocket.off('powerup_result');
      window.TriviaSound.stopSpeaking();
      if (this.timerRAF) {
        cancelAnimationFrame(this.timerRAF);
        this.timerRAF = null;
      }
      var vignette = document.getElementById('dangerVignette');
      if (vignette) vignette.classList.remove('on');
      var modal = document.getElementById('targetModal');
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      this.timerSync = null;
      this.hasAnswered = false;
      this.isSpectator = false;
      this.lastTickSecond = null;
    }
  };
})();
