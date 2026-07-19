/**
 * TriviaSocket — Socket.io connection manager
 * Wraps socket.io client with time synchronization,
 * reconnection handling, and connection state management.
 */
(function () {
  'use strict';

  var TriviaSocket = {
    socket: null,
    serverTimeOffset: 0,
    _timeSyncSamples: [],
    _timeSyncCount: 3,

    /**
     * Initialize the Socket.io connection and set up base event handlers.
     */
    init: function () {
      if (this.socket) {
        this.socket.disconnect();
      }

      this.socket = io({
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000
      });

      this._setupBaseHandlers();
    },

    /**
     * Set up connect, disconnect, reconnect, and error handlers.
     */
    _setupBaseHandlers: function () {
      var self = this;

      this.socket.on('connect', function () {
        console.log('[Socket] Connected:', self.socket.id);
        self._performTimeSync();

        // Show connected toast
        if (window.TriviaApp && typeof window.TriviaApp.showToast === 'function') {
          var t = window.TriviaI18n ? window.TriviaI18n.t('common.connected') : 'Connected';
          window.TriviaApp.showToast(t, 'success');
        }
      });

      this.socket.on('disconnect', function (reason) {
        console.log('[Socket] Disconnected:', reason);
        if (window.TriviaApp && typeof window.TriviaApp.showToast === 'function') {
          var t = window.TriviaI18n ? window.TriviaI18n.t('common.disconnected') : 'Disconnected';
          window.TriviaApp.showToast(t, 'error');
        }
      });

      this.socket.on('reconnecting', function (attemptNumber) {
        console.log('[Socket] Reconnecting, attempt:', attemptNumber);
        if (window.TriviaApp && typeof window.TriviaApp.showToast === 'function') {
          var t = window.TriviaI18n ? window.TriviaI18n.t('common.reconnecting') : 'Reconnecting...';
          window.TriviaApp.showToast(t, 'info');
        }
      });

      this.socket.on('reconnect', function () {
        console.log('[Socket] Reconnected');
        self._performTimeSync();

        // Attempt to rejoin room if we have a session
        var session = self._getStoredSession();
        if (session && session.roomCode && session.sessionToken) {
          self.emit('rejoin_room', {
            roomCode: session.roomCode,
            sessionToken: session.sessionToken
          });
        }
      });

      this.socket.on('connect_error', function (err) {
        console.error('[Socket] Connection error:', err.message);
      });
    },

    /**
     * Perform time synchronization with the server.
     * Sends 3 pings using Socket.io ack callbacks and averages the offset.
     */
    _performTimeSync: function () {
      this._timeSyncSamples = [];
      this._sendTimeSyncPing();
    },

    /**
     * Send a single time sync ping using Socket.io ack callback.
     */
    _sendTimeSyncPing: function () {
      if (!this.socket || !this.socket.connected) return;
      var self = this;
      var clientTime = Date.now();

      this.socket.emit('time_sync', { clientTime: clientTime }, function (data) {
        var now = Date.now();
        var roundTripTime = now - clientTime;
        var offset = data.serverTime - clientTime - (roundTripTime / 2);

        self._timeSyncSamples.push(offset);

        if (self._timeSyncSamples.length < self._timeSyncCount) {
          setTimeout(function () {
            self._sendTimeSyncPing();
          }, 100);
        } else {
          var sum = 0;
          for (var i = 0; i < self._timeSyncSamples.length; i++) {
            sum += self._timeSyncSamples[i];
          }
          self.serverTimeOffset = Math.round(sum / self._timeSyncSamples.length);
          console.log('[Socket] Time sync offset:', self.serverTimeOffset, 'ms');
        }
      });
    },

    /**
     * Retrieve stored session data from localStorage.
     */
    _getStoredSession: function () {
      try {
        var raw = localStorage.getItem('trivia_session');
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    /**
     * Emit an event to the server.
     */
    emit: function (event, data) {
      if (!this.socket) {
        console.error('[Socket] Not initialized');
        return;
      }
      this.socket.emit(event, data);
    },

    /**
     * Listen for a server event.
     */
    on: function (event, callback) {
      if (!this.socket) {
        console.error('[Socket] Not initialized');
        return;
      }
      this.socket.on(event, callback);
    },

    /**
     * Remove a listener for a server event.
     */
    off: function (event, callback) {
      if (!this.socket) return;
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    },

    /**
     * Get estimated current server time.
     */
    getServerTime: function () {
      return Date.now() + this.serverTimeOffset;
    },

    /**
     * Check if socket is currently connected.
     */
    isConnected: function () {
      return this.socket && this.socket.connected;
    }
  };

  window.TriviaSocket = TriviaSocket;
})();
