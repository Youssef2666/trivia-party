/**
 * Home Screen — Landing page with create/join party options.
 */
(function () {
  'use strict';

  // Fun random nicknames (AR/EN) for the dice button
  var RANDOM_NAMES = {
    ar: ['الصقر', 'العقل المدبر', 'نجم الليلة', 'أبو النقاط', 'الأسطورة', 'البرق', 'ملك التخمين', 'الدكتور', 'المايسترو', 'الوحش', 'صائد الجوائز', 'الفهد', 'العبقري', 'كابتن تريفيا', 'الذيب', 'المفكر'],
    en: ['The Falcon', 'Mastermind', 'Tonight’s Star', 'Point Hunter', 'The Legend', 'Lightning', 'Guess King', 'The Doctor', 'Maestro', 'The Beast', 'Prize Hunter', 'Cheetah', 'Genius', 'Captain Trivia', 'The Wolf', 'Thinker']
  };

  window.TriviaScreens = window.TriviaScreens || {};

  window.TriviaScreens.Home = {
    selectedAvatar: null,
    activeTab: 'create', // 'create' or 'join'

    _avatarGrid: function (gridId) {
      var ids = window.TriviaAvatars.ids();
      var html = '<div class="avatar-selector" id="' + gridId + '">';
      for (var i = 0; i < ids.length; i++) {
        var info = window.TriviaAvatars.info(ids[i]);
        html += '<button type="button" class="avatar-option" data-avatar="' + ids[i] + '" title="' + info.ar + ' | ' + info.en + '">' +
          window.TriviaAvatars.svg(ids[i]) +
          '</button>';
      }
      html += '</div>';
      return html;
    },

    _floaters: function () {
      // Decorative floating characters behind the hero
      var picks = [
        { id: 'fox', style: 'top:-10px; inset-inline-start:4%; animation-delay:0s;' },
        { id: 'robot', style: 'top:30px; inset-inline-end:6%; animation-delay:1.2s;' },
        { id: 'panda', style: 'top:-26px; inset-inline-end:26%; animation-delay:0.6s; width:38px; height:38px;' },
        { id: 'ghost', style: 'top:44px; inset-inline-start:18%; animation-delay:1.8s; width:34px; height:34px;' }
      ];
      var html = '';
      for (var i = 0; i < picks.length; i++) {
        html += '<div class="home-float" style="' + picks[i].style + '">' +
          window.TriviaAvatars.svg(picks[i].id) + '</div>';
      }
      return html;
    },

    render: function () {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);

      return '<div class="screen" id="homeScreen">' +
        // Hero
        '<div class="text-center mb-5 home-hero">' +
          this._floaters() +
          '<div class="home-logo-row animate-fade-in">' +
            '<h1 class="home-title">' + t('home.title') + '</h1>' +
          '</div>' +
          '<p class="section-subheader animate-fade-in delay-100" style="margin-bottom:0;">' + t('home.subtitle') + '</p>' +
        '</div>' +

        // Tab buttons
        '<div class="tab-buttons mb-4 animate-fade-in delay-200">' +
          '<button class="tab-btn active" data-tab="create">' + t('home.create_party') + '</button>' +
          '<button class="tab-btn" data-tab="join">' + t('home.join_party') + '</button>' +
        '</div>' +

        // Create tab
        '<div class="glass-card card-beam animate-slide-up delay-200" id="createTab">' +
          '<div class="settings-group mb-4">' +
            '<label class="settings-label">' + t('home.nickname') + '</label>' +
            '<div class="nickname-row">' +
              '<input type="text" class="input-field" id="createNickname" placeholder="' + t('home.nickname_placeholder') + '" maxlength="15" autocomplete="off">' +
              '<button type="button" class="dice-btn" data-target="createNickname" title="' + t('home.random_name') + '"><i data-lucide="dice"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="settings-group mb-4">' +
            '<label class="settings-label">' + t('home.choose_avatar') + '</label>' +
            this._avatarGrid('createAvatarGrid') +
          '</div>' +
          '<button class="btn btn-primary btn-lg w-full" id="createBtn">' +
            '<i data-lucide="plus-circle"></i> ' + t('home.create') +
          '</button>' +
        '</div>' +

        // Join tab (hidden by default)
        '<div class="glass-card card-beam animate-slide-up delay-200" id="joinTab" style="display:none;">' +
          '<div class="settings-group mb-4">' +
            '<label class="settings-label">' + t('home.nickname') + '</label>' +
            '<div class="nickname-row">' +
              '<input type="text" class="input-field" id="joinNickname" placeholder="' + t('home.nickname_placeholder') + '" maxlength="15" autocomplete="off">' +
              '<button type="button" class="dice-btn" data-target="joinNickname" title="' + t('home.random_name') + '"><i data-lucide="dice"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="settings-group mb-4">' +
            '<label class="settings-label">' + t('home.choose_avatar') + '</label>' +
            this._avatarGrid('joinAvatarGrid') +
          '</div>' +
          '<div class="settings-group mb-4">' +
            '<label class="settings-label">' + t('home.room_code') + '</label>' +
            '<input type="text" class="input-field input-field-lg" id="joinRoomCode" placeholder="••••••" maxlength="6" autocomplete="off">' +
          '</div>' +
          '<button class="btn btn-primary btn-lg w-full" id="joinBtn">' +
            '<i data-lucide="log-in"></i> ' + t('home.join') +
          '</button>' +
        '</div>' +
      '</div>';
    },

    init: function (data) {
      var self = this;
      this.activeTab = 'create';

      // Restore last used avatar/nickname for fast repeat play
      var savedProfile = null;
      try { savedProfile = JSON.parse(localStorage.getItem('trivia_profile') || 'null'); } catch (e) {}
      if (savedProfile) {
        if (savedProfile.nickname) {
          var cn = document.getElementById('createNickname');
          var jn = document.getElementById('joinNickname');
          if (cn) cn.value = savedProfile.nickname;
          if (jn) jn.value = savedProfile.nickname;
        }
        if (savedProfile.avatar) this._selectAvatar(savedProfile.avatar);
      }

      // Check URL for join code
      var urlParams = new URLSearchParams(window.location.search);
      var joinCode = urlParams.get('join');
      if (joinCode) {
        this.activeTab = 'join';
        setTimeout(function () {
          self._switchTab('join');
          var codeInput = document.getElementById('joinRoomCode');
          if (codeInput) codeInput.value = joinCode.toUpperCase();
        }, 50);
      }

      // Tab switching
      document.querySelectorAll('.tab-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          window.TriviaSound.play('tap');
          self._switchTab(btn.getAttribute('data-tab'));
        });
      });

      // Avatar selection for both grids
      document.querySelectorAll('.avatar-option').forEach(function (option) {
        option.addEventListener('click', function () {
          window.TriviaSound.play('pop');
          self._selectAvatar(option.getAttribute('data-avatar'));
        });
      });

      // Random name dice
      document.querySelectorAll('.dice-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          window.TriviaSound.play('tap');
          var lang = window.TriviaI18n.getLang();
          var pool = RANDOM_NAMES[lang] || RANDOM_NAMES.ar;
          var name = pool[Math.floor(Math.random() * pool.length)];
          var input = document.getElementById(btn.getAttribute('data-target'));
          if (input) input.value = name;
          // Mirror into the other tab's field for convenience
          var otherId = btn.getAttribute('data-target') === 'createNickname' ? 'joinNickname' : 'createNickname';
          var other = document.getElementById(otherId);
          if (other) other.value = name;
        });
      });

      // Create button
      var createBtn = document.getElementById('createBtn');
      if (createBtn) {
        createBtn.addEventListener('click', function () { self._handleCreate(); });
      }

      // Join button
      var joinBtn = document.getElementById('joinBtn');
      if (joinBtn) {
        joinBtn.addEventListener('click', function () { self._handleJoin(); });
      }

      // Room code input: auto-uppercase, enter to join
      var codeInput = document.getElementById('joinRoomCode');
      if (codeInput) {
        codeInput.addEventListener('input', function () {
          this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
        codeInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') self._handleJoin();
        });
      }

      // Enter key on nickname fields
      var createNick = document.getElementById('createNickname');
      if (createNick) {
        createNick.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') self._handleCreate();
        });
      }

      var joinNick = document.getElementById('joinNickname');
      if (joinNick) {
        joinNick.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            var ci = document.getElementById('joinRoomCode');
            if (ci) ci.focus();
          }
        });
      }

      if (window.lucide) lucide.createIcons();
    },

    _selectAvatar: function (avatar) {
      this.selectedAvatar = avatar;
      document.querySelectorAll('.avatar-option').forEach(function (o) {
        o.classList.toggle('selected', o.getAttribute('data-avatar') === avatar);
      });
    },

    _switchTab: function (tab) {
      this.activeTab = tab;
      var createTab = document.getElementById('createTab');
      var joinTab = document.getElementById('joinTab');

      document.querySelectorAll('.tab-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
      });

      if (tab === 'create') {
        createTab.style.display = '';
        joinTab.style.display = 'none';
      } else {
        createTab.style.display = 'none';
        joinTab.style.display = '';
      }
    },

    _validate: function (nickname) {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var name = (nickname || '').trim();

      if (name.length < 2 || name.length > 15) {
        window.TriviaApp.showToast(t('home.nickname_error'), 'error');
        return false;
      }
      if (!this.selectedAvatar) {
        window.TriviaApp.showToast(t('home.avatar_error'), 'error');
        return false;
      }
      return true;
    },

    _saveProfile: function (nickname) {
      try {
        localStorage.setItem('trivia_profile', JSON.stringify({
          nickname: nickname,
          avatar: this.selectedAvatar
        }));
      } catch (e) {}
    },

    _handleCreate: function () {
      var nickname = (document.getElementById('createNickname').value || '').trim();
      if (!this._validate(nickname)) return;

      this._saveProfile(nickname);
      window.TriviaSound.play('tap');
      window.TriviaSocket.emit('create_room', {
        nickname: nickname,
        avatar: this.selectedAvatar
      });
    },

    _handleJoin: function () {
      var t = window.TriviaI18n.t.bind(window.TriviaI18n);
      var nickname = (document.getElementById('joinNickname').value || '').trim();
      if (!this._validate(nickname)) return;

      var code = (document.getElementById('joinRoomCode').value || '').trim();
      if (code.length !== 6) {
        window.TriviaApp.showToast(t('home.room_code_error'), 'error');
        return;
      }

      this._saveProfile(nickname);
      window.TriviaSound.play('tap');
      window.TriviaSocket.emit('join_room', {
        roomCode: code,
        nickname: nickname,
        avatar: this.selectedAvatar
      });
    }
  };
})();
