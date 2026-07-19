/**
 * Reveal Screen — result + avatar mood, distribution bars, guess board,
 * race item effects, bell/golden/tiebreaker/finish-line moments.
 */
(function () {
  'use strict';

  window.TriviaScreens = window.TriviaScreens || {};

  window.TriviaScreens.Reveal = {

    render: function (data) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var lang = window.TriviaI18n.getLang();
      var questionData = data.questionData;
      var revealData = data.revealData;
      var gs = window.TriviaApp.gameState;
      var myId = gs.playerId;
      var special = revealData.special || null;
      var isGuess = revealData.type === 'guess';
      var settings = gs.settings || {};
      var isStage = Boolean(settings.displayMode && gs.isHost);
      var isBuzzer = Boolean(settings.displayMode && !gs.isHost);

      var questionText = questionData.question[lang] || questionData.question.ar || '';

      // Find my result
      var myResult = null;
      for (var i = 0; i < revealData.playerResults.length; i++) {
        if (revealData.playerResults[i].playerId === myId) {
          myResult = revealData.playerResults[i];
          break;
        }
      }

      var myAvatar = (gs.player || {}).avatar || 'cat';
      var hideHero = isStage || (special === 'tiebreaker' && !myResult) || (!myResult && !isGuess && special !== 'tiebreaker' && (gs.player || {}).isEliminated) || (!myResult && (gs.player || {}).isFinished);

      var html = '<div class="screen' + (special === 'golden' ? ' theme-golden' : '') + (isStage ? ' screen-wide' : '') + '" id="revealScreen">';

      // ── Hero: my avatar reacting ──
      if (!hideHero) {
        var resultClass, resultText, resultIcon, mood;
        if (isGuess) {
          if (!myResult || myResult.guess === null || myResult.guess === undefined) {
            resultClass = 'color-warning'; resultText = t('guess.no_guess'); resultIcon = 'clock'; mood = 'mood-sad';
          } else if (myResult.guessRank === 1) {
            resultClass = 'color-success'; resultText = t('guess.closest'); resultIcon = 'target'; mood = 'mood-happy';
          } else {
            resultClass = 'color-warning';
            resultText = t('guess.your_guess') + ': ' + myResult.guess;
            resultIcon = 'target';
            mood = '';
          }
        } else if (!myResult || myResult.chosenOption === -1) {
          resultClass = 'color-warning'; resultText = t('reveal.timeout'); resultIcon = 'clock'; mood = 'mood-sad';
        } else if (myResult.isCorrect) {
          resultClass = 'color-success'; resultText = t('reveal.correct'); resultIcon = 'check-circle'; mood = 'mood-happy';
        } else {
          resultClass = 'color-error'; resultText = t('reveal.wrong'); resultIcon = 'x-circle'; mood = 'mood-sad';
        }

        html += '<div class="reveal-hero text-center mb-4 animate-bounce-in">' +
          window.TriviaUtils.generateAvatarHTML(myAvatar, 'avatar-xl', mood) +
          '<h2 style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--fs-2xl);font-weight:var(--fw-black);color:var(--' + resultClass + ');">' +
            (resultIcon ? '<i data-lucide="' + resultIcon + '" style="width:26px;height:26px;"></i>' : '') +
            resultText +
          '</h2>';

        if (myResult && myResult.pointsEarned !== 0) {
          var pointsClass = myResult.pointsEarned > 0 ? 'positive' : 'negative';
          html += '<div class="score-popup ' + pointsClass + '" id="pointsDisplay">' +
            window.TriviaUtils.formatPoints(myResult.pointsEarned) +
          '</div>';
          if (special === 'golden' && myResult.isCorrect) {
            html += '<span class="badge badge-gold"><i data-lucide="star"></i> ' + t('reveal.golden_applied') + '</span>';
          }
          if (isGuess && myResult.diff === 0) {
            html += '<span class="badge badge-gold"><i data-lucide="target"></i> ' + t('guess.exact') + '</span>';
          }
        }

        if (myResult && myResult.streak >= 3) {
          html += '<div class="streak-indicator">🔥 ' + myResult.streak + ' ' + t('reveal.streak') + '</div>';
        }

        html += '</div>';
      }

      // ── Special outcome banners ──
      if (special === 'bell') {
        var bellWinner = null;
        for (var b = 0; b < revealData.playerResults.length; b++) {
          if (revealData.playerResults[b].bellWinner) { bellWinner = revealData.playerResults[b]; break; }
        }
        html += '<div class="bell-winner-banner"><i data-lucide="bell"></i>' +
          (bellWinner
            ? t('reveal.bell_winner').replace('{player}', window.TriviaUtils.escapeHtml(bellWinner.nickname))
            : t('reveal.bell_no_winner')) +
          '</div>';
      }

      if (special === 'tiebreaker') {
        html += '<div class="bell-winner-banner" style="border-color:var(--color-error);background:var(--color-error-soft);color:var(--color-error);">' +
          '<i data-lucide="swords"></i>' +
          (revealData.tiebreakerWinner
            ? t('tiebreaker.winner').replace('{player}', window.TriviaUtils.escapeHtml(revealData.tiebreakerWinner.nickname))
            : t('tiebreaker.no_winner')) +
          '</div>';
      }

      // ── Question recap ──
      html += '<div class="glass-card mb-4 animate-fade-in delay-100" style="padding:var(--space-3) var(--space-4);margin-top:var(--space-3);">' +
          '<p style="font-size:var(--fs-base);color:var(--text-secondary);text-align:center;">' +
            window.TriviaUtils.escapeHtml(questionText) +
          '</p>' +
        '</div>';

      // ── Body: guess board OR options + distribution ──
      if (isGuess) {
        html += this._renderGuessBoard(revealData, myId, t, lang);
      } else {
        // Options with correct/wrong highlighting (buzzer phones skip this)
        if (!isBuzzer) {
          html += '<div class="options-grid' + (questionData.options.length < 4 ? ' options-tf' : '') + ' animate-fade-in delay-200" style="pointer-events:none;">';
          for (var j = 0; j < questionData.options.length; j++) {
            var optionText = questionData.options[j][lang] || questionData.options[j].ar || '';
            var optionClass = window.TriviaUtils.getOptionClass(j);
            var stateClass = '';
            var icon = '';

            if (j === revealData.correctIndex) {
              stateClass = ' correct';
              icon = '<i data-lucide="check" class="option-icon"></i>';
            } else if (myResult && j === myResult.chosenOption) {
              stateClass = ' wrong animate-shake';
              icon = '<i data-lucide="x" class="option-icon"></i>';
            } else {
              stateClass = ' dimmed';
            }

            html += '<button class="option-btn ' + optionClass + stateClass + '">' +
              window.TriviaUtils.optionShapeHTML(j) +
              '<span class="option-label">' + icon + window.TriviaUtils.escapeHtml(optionText) + '</span>' +
            '</button>';
          }
          html += '</div>';

          html += this._renderDistribution(questionData, revealData, myResult, t);
        } else if (myResult && myResult.chosenOption >= 0) {
          // Buzzer: just show whether my shape was the right one
          var correctText = questionData.options[revealData.correctIndex];
          html += '<div class="glass-card text-center animate-fade-in delay-200" style="padding:var(--space-3);">' +
            '<p class="settings-label">' + t('reveal.correct_answer') + '</p>' +
            '<p class="fw-black fs-xl" style="color:var(--color-success);">' +
              window.TriviaUtils.escapeHtml(correctText[lang] || correctText.ar || '') +
            '</p>' +
          '</div>';
        }
      }

      // ── Chase events: catches + escapes ──
      var chase = revealData.chase || null;
      if (chase) {
        for (var hn = 0; hn < (chase.homeNow || []).length; hn++) {
          html += '<div class="bell-winner-banner" style="border-color:hsl(150,80%,50%);background:hsla(150,80%,50%,0.12);color:hsl(150,85%,60%);">' +
            '<i data-lucide="flag"></i>' +
            t('chase.home').replace('{player}', window.TriviaUtils.escapeHtml(chase.homeNow[hn].nickname)) +
          '</div>';
        }
        for (var cn = 0; cn < (chase.caughtNow || []).length; cn++) {
          html += '<div class="bell-winner-banner" style="border-color:var(--color-error);background:var(--color-error-soft);color:var(--color-error);">' +
            '<i data-lucide="crosshair"></i>' +
            t('chase.caught').replace('{player}', window.TriviaUtils.escapeHtml(chase.caughtNow[cn].nickname)) +
          '</div>';
        }
      }

      // ── Race item effects log ──
      var fx = revealData.itemEffects || [];
      if (fx.length > 0) {
        html += '<div class="reveal-powerups animate-fade-in delay-300">';
        for (var x = 0; x < fx.length; x++) {
          var ef = fx[x];
          var line = '';
          var ficon = 'zap';
          if (ef.type === 'rocket' && ef.blocked) {
            ficon = 'shield';
            line = t('race.rocket_blocked').replace('{to}', window.TriviaUtils.escapeHtml(ef.to)).replace('{from}', window.TriviaUtils.escapeHtml(ef.from));
          } else if (ef.type === 'rocket') {
            ficon = 'rocket';
            line = t('race.rocket_hit').replace('{from}', window.TriviaUtils.escapeHtml(ef.from)).replace('{to}', window.TriviaUtils.escapeHtml(ef.to)).replace('{n}', ef.amount);
          } else if (ef.type === 'nitro') {
            ficon = 'gauge';
            line = t('race.nitro_used').replace('{player}', window.TriviaUtils.escapeHtml(ef.from));
          } else if (ef.type === 'shield') {
            ficon = 'shield';
            line = t('race.shield_armed').replace('{player}', window.TriviaUtils.escapeHtml(ef.from));
          }
          html += '<div class="item-log-item"><i data-lucide="' + ficon + '"></i><span>' + line + '</span></div>';
        }
        html += '</div>';
      }

      // ── Item pickups (race loot) ──
      var pickups = revealData.playerResults.filter(function (r) { return r.itemAwarded; });
      if (pickups.length > 0) {
        html += '<div class="reveal-powerups animate-fade-in delay-300">';
        for (var pu = 0; pu < pickups.length; pu++) {
          var pk = pickups[pu];
          html += '<div class="powerup-log-item">' +
            '<i data-lucide="' + (pk.itemAwarded === 'rocket' ? 'rocket' : pk.itemAwarded === 'shield' ? 'shield' : 'gauge') + '"></i>' +
            '<span>' + t('race.item_awarded')
              .replace('{player}', window.TriviaUtils.escapeHtml(pk.nickname))
              .replace('{item}', t('race.' + pk.itemAwarded)) + '</span>' +
          '</div>';
        }
        html += '</div>';
      }

      // ── Player results strip ──
      if (!isBuzzer) {
        html += '<div class="result-strip animate-fade-in delay-300">';
        for (var k = 0; k < revealData.playerResults.length; k++) {
          var pr = revealData.playerResults[k];
          var avatarClass = pr.isCorrect ? 'correct-player' : 'wrong-player';
          html += '<div class="avatar ' + avatarClass + '" title="' +
            window.TriviaUtils.escapeHtml(pr.nickname) + '">' +
            window.TriviaAvatars.svg(pr.avatar) +
          '</div>';
        }
        html += '</div>';
      }

      // ── Power-up logs ──
      var powerupLogsHtml = '<div class="reveal-powerups animate-fade-in delay-300">';
      var anyPowerup = false;

      for (var l = 0; l < revealData.playerResults.length; l++) {
        var pr2 = revealData.playerResults[l];
        if (pr2.powerupUsed) {
          anyPowerup = true;
          var name = window.TriviaUtils.escapeHtml(pr2.nickname);
          var typeLabel = t('powerups.' + pr2.powerupUsed.type);
          var picon = 'zap';

          if (pr2.powerupUsed.type === 'fifty_fifty') picon = 'help-circle';
          else if (pr2.powerupUsed.type === 'freeze') picon = 'snowflake';
          else if (pr2.powerupUsed.type === 'steal') picon = 'users';

          if (pr2.powerupUsed.type === 'steal' && pr2.stolenAmount > 0) {
            var targetName = '';
            for (var m = 0; m < revealData.playerResults.length; m++) {
              if (revealData.playerResults[m].playerId === pr2.powerupUsed.targetId) {
                targetName = window.TriviaUtils.escapeHtml(revealData.playerResults[m].nickname);
                break;
              }
            }
            powerupLogsHtml += '<div class="powerup-log-item">' +
              '<i data-lucide="users" style="color:var(--color-warning);"></i>' +
              '<span>' + t('reveal.powerup_steal_used').replace('{player}', name).replace('{target}', targetName) + '</span>' +
            '</div>';
          } else {
            powerupLogsHtml += '<div class="powerup-log-item">' +
              '<i data-lucide="' + picon + '"></i>' +
              '<span>' + t('reveal.powerup_used').replace('{player}', name).replace('{powerup}', typeLabel) + '</span>' +
            '</div>';
          }
        }
      }
      powerupLogsHtml += '</div>';

      if (anyPowerup) html += powerupLogsHtml;

      html += '</div>';
      return html;
    },

    _renderGuessBoard: function (revealData, myId, t, lang) {
      var unit = revealData.unit ? (revealData.unit[lang] || revealData.unit.ar || '') : '';
      var html = '<div class="text-center animate-fade-in delay-100 mb-4">' +
        '<p class="settings-label">' + t('guess.correct_number') + '</p>' +
        '<div class="guess-answer-hero">' + revealData.answerValue + '</div>' +
        (unit ? '<span class="guess-unit">' + window.TriviaUtils.escapeHtml(unit) + '</span>' : '') +
      '</div>';

      var guessed = revealData.playerResults
        .filter(function (r) { return r.guess !== null && r.guess !== undefined; })
        .sort(function (a, b) { return a.guessRank - b.guessRank; });

      if (guessed.length > 0) {
        html += '<div class="guess-list animate-fade-in delay-200">';
        for (var i = 0; i < guessed.length; i++) {
          var g = guessed[i];
          var isMe = g.playerId === myId;
          html += '<div class="guess-row' + (g.guessRank === 1 ? ' closest' : '') + '">' +
            window.TriviaUtils.generateAvatarHTML(g.avatar, 'avatar-sm') +
            '<span class="player-name' + (isMe ? ' text-accent' : '') + '">' + window.TriviaUtils.escapeHtml(g.nickname) + '</span>' +
            '<span class="guess-value">' + g.guess + '</span>' +
            '<span class="guess-diff">±' + g.diff + '</span>' +
            '<span class="guess-points">+' + g.pointsEarned + '</span>' +
          '</div>';
        }
        html += '</div>';
      }
      return html;
    },

    _renderDistribution: function (questionData, revealData, myResult, t) {
      var counts = [];
      for (var i = 0; i < questionData.options.length; i++) counts.push(0);
      var totalAnswered = 0;

      for (var r = 0; r < revealData.playerResults.length; r++) {
        var c = revealData.playerResults[r].chosenOption;
        if (typeof c === 'number' && c >= 0 && c < counts.length) {
          counts[c]++;
          totalAnswered++;
        }
      }

      if (totalAnswered === 0) return '';

      var optionVars = ['--option-a', '--option-b', '--option-c', '--option-d'];
      var html = '<div class="glass-card animate-fade-in delay-300" style="padding:var(--space-3) var(--space-4);margin-top:var(--space-3);">' +
        '<p class="settings-label" style="margin-bottom:var(--space-2);">' + t('reveal.distribution') + '</p>' +
        '<div class="dist-list">';

      for (var d = 0; d < counts.length; d++) {
        var pct = Math.round((counts[d] / totalAnswered) * 100);
        var isCorrect = d === revealData.correctIndex;
        var isMine = myResult && myResult.chosenOption === d;

        html += '<div class="dist-row' + (isCorrect ? ' dist-correct' : '') + '">' +
          '<span class="dist-shape" style="background:var(' + optionVars[d] + ');">' +
            window.TriviaUtils.optionShapeHTML(d).replace('class="option-shape"', 'class="dist-inner-shape" style="display:inline-flex;"') +
          '</span>' +
          '<div class="dist-track">' +
            '<div class="dist-fill" data-width="' + pct + '" style="background:var(' + optionVars[d] + ');"></div>' +
          '</div>' +
          '<span class="dist-count">' + counts[d] + '</span>' +
          (isMine ? '<span class="dist-you">' + t('reveal.you_marker') + '</span>' : '') +
        '</div>';
      }

      html += '</div></div>';
      return html;
    },

    init: function (data) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var revealData = data.revealData;
      var special = revealData.special || null;
      var isGuess = revealData.type === 'guess';
      var myId = window.TriviaApp.gameState.playerId;
      var myResult = null;
      for (var i = 0; i < revealData.playerResults.length; i++) {
        if (revealData.playerResults[i].playerId === myId) {
          myResult = revealData.playerResults[i];
          break;
        }
      }

      // ── Sounds + haptics ──
      window.TriviaSound.play('reveal');
      if (myResult) {
        if (isGuess) {
          setTimeout(function () {
            window.TriviaSound.play(myResult.guessRank === 1 ? 'correct' : 'swoosh');
          }, 250);
        } else if (myResult.chosenOption === -1) {
          setTimeout(function () { window.TriviaSound.play('timeout'); }, 250);
        } else if (myResult.isCorrect) {
          setTimeout(function () {
            window.TriviaSound.play('correct');
            if (myResult.streak >= 3) window.TriviaSound.play('streak');
          }, 250);
          window.TriviaUtils.vibrate(35);
        } else {
          setTimeout(function () { window.TriviaSound.play('wrong'); }, 250);
          window.TriviaUtils.vibrate([60, 40, 60]);
        }
      }

      // Race: item sounds
      var fx = revealData.itemEffects || [];
      fx.forEach(function (ef, idx) {
        setTimeout(function () {
          if (ef.type === 'rocket' && ef.blocked) window.TriviaSound.play('shieldBlock');
          else if (ef.type === 'rocket') window.TriviaSound.play('rocket');
          else if (ef.type === 'nitro') window.TriviaSound.play('nitro');
        }, 500 + idx * 450);
      });

      // Race: finish-line celebrations
      var finishedNow = revealData.finishedNow || [];
      if (finishedNow.length > 0) {
        setTimeout(function () {
          window.TriviaSound.play('finish');
          window.TriviaApp.showFinishOverlay(finishedNow, t);
        }, 900);
      }

      if (special === 'tiebreaker' && revealData.tiebreakerWinner) {
        setTimeout(function () { window.TriviaSound.play('fanfare'); }, 600);
      }

      // Chase: booms for the hunter's steps, stings for catches, chimes for escapes
      var chase = revealData.chase || null;
      if (chase) {
        var chaserRes = revealData.playerResults.filter(function (r) { return r.isChaser; })[0];
        if (chaserRes && chaserRes.stepsGained > 0) {
          for (var st = 0; st < chaserRes.stepsGained; st++) {
            setTimeout(function () { window.TriviaSound.play('chaseStep'); }, 700 + st * 350);
          }
        }
        (chase.caughtNow || []).forEach(function (c, i) {
          setTimeout(function () { window.TriviaSound.play('eliminate'); }, 1400 + i * 400);
          if (c.playerId === myId) window.TriviaUtils.vibrate([90, 60, 90, 60, 140]);
        });
        (chase.homeNow || []).forEach(function (h, i) {
          setTimeout(function () { window.TriviaSound.play('finish'); }, 1200 + i * 350);
          if (h.playerId === myId) window.TriviaUtils.vibrate(50);
        });
      }

      // Animate distribution bars
      setTimeout(function () {
        document.querySelectorAll('.dist-fill').forEach(function (bar) {
          bar.style.width = bar.getAttribute('data-width') + '%';
        });
      }, 350);

      // Animate points counting
      if (myResult && myResult.pointsEarned !== 0) {
        var el = document.getElementById('pointsDisplay');
        if (el) {
          window.TriviaUtils.animateValue(el, 0, myResult.pointsEarned, 800);
          setTimeout(function () {
            if (el) el.textContent = window.TriviaUtils.formatPoints(myResult.pointsEarned);
          }, 850);
        }
      }

      if (window.lucide) lucide.createIcons();
    }
  };
})();
