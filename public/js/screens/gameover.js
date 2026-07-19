/**
 * Game Over Screen — mode-aware podium + spotlight + confetti + fanfare,
 * team banners, party awards, stats table, share results, rematch.
 */
(function () {
  'use strict';

  var AWARD_ICONS = {
    speed_demon: 'timer',
    sharpshooter: 'target',
    streak_master: 'flame',
    tactician: 'zap',
    entertainer: 'smile',
    demolition: 'rocket'
  };

  window.TriviaScreens = window.TriviaScreens || {};

  window.TriviaScreens.GameOver = {

    render: function (data) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var mode = data.mode || 'classic';
      var stats = data.stats || [];
      var awards = data.awards || [];
      var isHost = window.TriviaApp.gameState.isHost;

      // Podium/table order comes from the mode-ranked leaderboard;
      // per-player stats are looked up by id.
      var statsById = {};
      for (var s0 = 0; s0 < stats.length; s0++) statsById[stats[s0].playerId] = stats[s0];
      var ranking = (data.leaderboard && data.leaderboard.length ? data.leaderboard : stats)
        .map(function (e) {
          return Object.assign({}, statsById[e.playerId] || {}, e);
        });

      var first = ranking[0] || null;
      var second = ranking[1] || null;
      var third = ranking[2] || null;

      var html = '<div class="screen screen-wide" id="gameOverScreen">' +
        '<h2 class="section-header animate-fade-in">' + t('gameover.title') + '</h2>';

      // ── Teams: winner banner + totals ──
      if (mode === 'teams' && data.teams) {
        var wt = data.winnerTeam || data.teams[0].team;
        html += '<p class="section-subheader animate-fade-in" style="font-weight:var(--fw-black);color:' +
          (wt === 'red' ? 'hsl(354,84%,66%)' : 'hsl(215,90%,68%)') + ';">' +
          t('teams.winner').replace('{team}', t('teams.' + wt)) +
        '</p>' +
        '<div class="team-bars animate-fade-in">';
        var maxT = Math.max(1, data.teams[0].score);
        for (var tb = 0; tb < data.teams.length; tb++) {
          var tm = data.teams[tb];
          html += '<div class="team-bar team-' + tm.team + '">' +
            '<div class="team-fill" style="width:' + Math.max(6, Math.round((tm.score / maxT) * 100)) + '%;"></div>' +
            '<span class="team-name">' + t('teams.' + tm.team) + '</span>' +
            '<span class="team-score">' + tm.score + '</span>' +
          '</div>';
        }
        html += '</div>';
      }

      if (mode === 'race' && data.targetScore) {
        html += '<p class="section-subheader animate-fade-in">🏁 ' +
          t('race.target').replace('{n}', data.targetScore) + '</p>';
      }

      if (mode === 'chase' && data.chase) {
        var escaped = ranking.filter(function (e) { return e.isHome; }).length;
        html += '<p class="section-subheader animate-fade-in" style="font-weight:var(--fw-black);color:' +
          (data.chase.chaserWon ? 'var(--color-error)' : 'hsl(150,85%,60%)') + ';">' +
          (data.chase.chaserWon
            ? t('chase.chaser_won')
            : t('chase.runners_won').replace('{n}', escaped)) +
        '</p>';
      }

      html += '<div class="confetti-container" id="confettiContainer"></div>' +
        '<div class="podium">';

      var rankTag = function (entry) {
        if (mode === 'race' && entry.finishRank) return ' 🏁';
        if (mode === 'chase' && entry.isChaser) return ' 💀';
        if (mode === 'chase' && entry.isHome) return ' 🏠';
        return '';
      };

      if (second) {
        html += '<div class="podium-place podium-2nd">' +
          window.TriviaUtils.generateAvatarHTML(second.avatar, 'avatar-lg', 'mood-happy') +
          '<span class="podium-name">' + window.TriviaUtils.escapeHtml(second.nickname) + rankTag(second) + '</span>' +
          '<div class="podium-pillar">' +
            '<span class="podium-rank">2</span>' +
            '<span class="podium-score">' + second.score + '</span>' +
          '</div>' +
        '</div>';
      }

      if (first) {
        html += '<div class="podium-place podium-1st">' +
          '<div class="avatar-wrap">' +
            '<span class="podium-crown"><i data-lucide="crown"></i></span>' +
            window.TriviaUtils.generateAvatarHTML(first.avatar, 'avatar-xl', 'mood-happy') +
          '</div>' +
          '<span class="podium-name">' + window.TriviaUtils.escapeHtml(first.nickname) + rankTag(first) + '</span>' +
          '<div class="podium-pillar">' +
            '<span class="podium-rank">1</span>' +
            '<span class="podium-score">' + first.score + '</span>' +
          '</div>' +
        '</div>';
      }

      if (third) {
        html += '<div class="podium-place podium-3rd">' +
          window.TriviaUtils.generateAvatarHTML(third.avatar, 'avatar-lg') +
          '<span class="podium-name">' + window.TriviaUtils.escapeHtml(third.nickname) + rankTag(third) + '</span>' +
          '<div class="podium-pillar">' +
            '<span class="podium-rank">3</span>' +
            '<span class="podium-score">' + third.score + '</span>' +
          '</div>' +
        '</div>';
      }

      html += '</div>';

      // ── Party awards ──
      if (awards.length > 0) {
        html += '<div class="mb-4 animate-fade-in delay-300">' +
          '<h3 class="section-header" style="font-size:var(--fs-lg);margin-top:var(--space-4);">' +
            '🏅 ' + t('gameover.awards') +
          '</h3>' +
          '<div class="awards-grid">';

        for (var a = 0; a < awards.length; a++) {
          var aw = awards[a];
          html += '<div class="award-card" style="animation-delay:' + (400 + a * 120) + 'ms;">' +
            '<div class="award-icon"><i data-lucide="' + (AWARD_ICONS[aw.type] || 'award') + '"></i></div>' +
            '<span class="award-title">' + t('awards.' + aw.type) + '</span>' +
            '<div class="award-player">' +
              window.TriviaUtils.generateAvatarHTML(aw.avatar, 'avatar-sm') +
              '<span class="truncate">' + window.TriviaUtils.escapeHtml(aw.nickname) + '</span>' +
            '</div>' +
            '<span class="award-value">' + t('awards.' + aw.type + '_desc') + ' · ' + window.TriviaUtils.escapeHtml(String(aw.value)) + '</span>' +
          '</div>';
        }

        html += '</div></div>';
      }

      // ── Stats table ──
      html += '<div class="glass-card animate-fade-in delay-300">' +
          '<h3 style="font-size:var(--fs-lg);font-weight:var(--fw-bold);margin-bottom:var(--space-4);text-align:center;">' +
            t('gameover.stats') +
          '</h3>' +
          '<div style="overflow-x:auto;">' +
            '<table class="stats-table">' +
              '<thead><tr>' +
                '<th>#</th>' +
                '<th>' + t('gameover.name') + '</th>' +
                '<th>' + t('leaderboard.score') + '</th>' +
                '<th>' + t('gameover.accuracy') + '</th>' +
                '<th>' + t('gameover.fastest') + '</th>' +
                '<th>' + t('gameover.streak') + '</th>' +
              '</tr></thead>' +
              '<tbody>';

      var myId = window.TriviaApp.gameState.playerId;
      for (var i = 0; i < ranking.length; i++) {
        var s = ranking[i];
        var isMe = s.playerId === myId;
        var fastest = (s.fastestAnswerMs !== null && s.fastestAnswerMs !== undefined)
          ? (s.fastestAnswerMs / 1000).toFixed(1) + 's'
          : '—';
        var isDuelWinner = data.tiebreakerWinnerId && s.playerId === data.tiebreakerWinnerId;

        html += '<tr' + (isMe ? ' style="color:var(--accent-primary-strong);"' : '') + '>' +
          '<td>' + (i + 1) + '</td>' +
          '<td style="display:flex;align-items:center;gap:var(--space-2);">' +
            (mode === 'teams' && s.team ? '<span class="team-dot team-' + s.team + '"></span>' : '') +
            window.TriviaUtils.generateAvatarHTML(s.avatar, 'avatar-sm') +
            '<span>' + window.TriviaUtils.escapeHtml(s.nickname) + (isDuelWinner ? ' ⚔️' : '') +
              (mode === 'chase' && s.isChaser ? ' 💀' : '') + (mode === 'chase' && s.isHome ? ' 🏠' : '') + '</span>' +
          '</td>' +
          '<td style="font-weight:var(--fw-black);">' + s.score + '</td>' +
          '<td>' + (s.accuracy !== undefined ? s.accuracy + '%' : '—') + '</td>' +
          '<td>' + fastest + '</td>' +
          '<td>' + (s.longestStreak > 0 ? '🔥 ' + s.longestStreak : '—') + '</td>' +
        '</tr>';
      }

      html += '</tbody></table></div></div>' +

        '<div style="display:flex;gap:var(--space-3);margin-top:var(--space-5);flex-wrap:wrap;" class="animate-fade-in delay-500">';

      if (isHost) {
        html += '<button class="btn btn-primary btn-lg" id="rematchBtn" style="flex:1;min-width:140px;">' +
          '<i data-lucide="rotate-ccw"></i> ' + t('gameover.rematch') +
        '</button>';
      }

      html += '<button class="btn btn-secondary btn-lg" id="shareBtn" style="flex:1;min-width:140px;">' +
          '<i data-lucide="share-2"></i> ' + t('gameover.share') +
        '</button>' +
        '<button class="btn btn-secondary btn-lg" id="leaveBtn" style="flex:1;min-width:140px;">' +
          '<i data-lucide="log-out"></i> ' + t('gameover.leave') +
        '</button>' +
        '</div>' +

        window.TriviaApp.renderReactionBar() +

      '</div>';

      return html;
    },

    init: function (data) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var mode = data.mode || 'classic';

      window.TriviaSound.play('drumroll');
      setTimeout(function () {
        window.TriviaSound.play('fanfare');
        var container = document.getElementById('confettiContainer');
        if (container) {
          window.TriviaUtils.createConfetti(container);
        }
      }, 1100);

      var rematchBtn = document.getElementById('rematchBtn');
      if (rematchBtn) {
        rematchBtn.addEventListener('click', function () {
          window.TriviaSound.play('tap');
          window.TriviaSocket.emit('rematch');
        });
      }

      var shareBtn = document.getElementById('shareBtn');
      if (shareBtn) {
        shareBtn.addEventListener('click', function () {
          var text = buildShareText();
          if (navigator.share) {
            navigator.share({ title: t('gameover.share_title'), text: text }).catch(function () {});
          } else {
            navigator.clipboard.writeText(text).then(function () {
              window.TriviaApp.showToast(t('gameover.share_copied'), 'success');
            }).catch(function () {});
          }
        });
      }

      function buildShareText() {
        var order = (data.leaderboard && data.leaderboard.length ? data.leaderboard : data.stats) || [];
        var medals = ['🥇', '🥈', '🥉'];
        var lines = [t('gameover.share_title')];
        if (mode === 'teams' && data.winnerTeam) {
          lines.push(t('teams.winner').replace('{team}', t('teams.' + data.winnerTeam)));
        }
        for (var i = 0; i < order.length; i++) {
          var m = medals[i] || (' ' + (i + 1) + '.');
          lines.push(m + ' ' + order[i].nickname + ' — ' + order[i].score);
        }
        return lines.join('\n');
      }

      var leaveBtn = document.getElementById('leaveBtn');
      if (leaveBtn) {
        leaveBtn.addEventListener('click', function () {
          window.TriviaApp.leaveParty(true);
        });
      }

      window.TriviaApp.bindReactionBar();

      if (window.lucide) lucide.createIcons();
    }
  };
})();
