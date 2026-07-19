/**
 * GameManager.js — Manages all active game rooms.
 *
 * Singleton that handles room creation, joining, disconnection,
 * reconnection, and periodic cleanup of stale rooms.
 */

'use strict';

const GameRoom = require('./GameRoom');
const Player = require('./Player');
const QRCode = require('qrcode');

// Characters for room codes — no ambiguous chars (O/0/I/1/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

class GameManager {
  /**
   * @param {import('socket.io').Server} io - Socket.io server instance
   * @param {string} baseUrl - Base URL for QR codes (e.g. "http://192.168.1.5:3000")
   */
  constructor(io, baseUrl) {
    this.io = io;
    this.baseUrl = baseUrl;
    this.rooms = new Map(); // roomCode → GameRoom

    // Periodic cleanup of stale rooms every 5 minutes
    this._cleanupInterval = setInterval(() => this.cleanupStaleRooms(), 5 * 60 * 1000);
  }

  // ──────────────────────────────────────────────────────────────
  //  Room code generation
  // ──────────────────────────────────────────────────────────────
  generateRoomCode() {
    let code;
    let attempts = 0;
    do {
      code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      attempts++;
      // Safety valve — if somehow we're colliding a lot
      if (attempts > 100) throw new Error('Unable to generate unique room code');
    } while (this.rooms.has(code));
    return code;
  }

  // ──────────────────────────────────────────────────────────────
  //  Create a new room
  // ──────────────────────────────────────────────────────────────
  async createRoom(socket, { nickname, avatar }) {
    const code = this.generateRoomCode();

    // Create host player
    const host = new Player({ nickname, avatar, isHost: true });
    host.socketId = socket.id;

    // Create room
    const room = new GameRoom(code, this.io);
    room.addPlayer(host, socket);
    this.rooms.set(code, room);

    // Store session info on the socket for later lookups
    socket.triviaRoomCode = code;
    socket.triviaPlayerId = host.id;
    socket.triviaSessionToken = host.sessionToken;

    // Generate QR code data URL
    const joinUrl = `${this.baseUrl}?join=${code}`;
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(joinUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
    } catch (err) {
      console.error('QR code generation failed:', err.message);
    }

    // Emit to the creating socket
    socket.emit('room_created', {
      roomCode: code,
      qrCodeDataUrl: qrDataUrl,
      joinUrl,
      player: host.toPublic(),
      sessionToken: host.sessionToken,
      roomState: room.getState(),
    });

    console.log(`[Room ${code}] Created by "${host.nickname}"`);
    return room;
  }

  // ──────────────────────────────────────────────────────────────
  //  Join an existing room
  // ──────────────────────────────────────────────────────────────
  joinRoom(socket, { roomCode, nickname, avatar }) {
    const code = (roomCode || '').toUpperCase().trim();
    const room = this.rooms.get(code);

    if (!room) {
      socket.emit('error', { message: 'room_not_found' });
      return null;
    }
    if (room.locked) {
      socket.emit('error', { message: 'room_locked' });
      return null;
    }
    if (room.state !== 'LOBBY') {
      socket.emit('error', { message: 'game_already_started' });
      return null;
    }
    if (room.getPlayerCount() >= 20) {
      socket.emit('error', { message: 'room_full' });
      return null;
    }

    const player = new Player({ nickname, avatar, isHost: false });
    player.socketId = socket.id;

    room.addPlayer(player, socket);

    // Teams mode: drop the newcomer into the smaller team
    if (room.settings.gameMode === 'teams') {
      room._autoAssignTeams();
    }

    // Store session on socket
    socket.triviaRoomCode = code;
    socket.triviaPlayerId = player.id;
    socket.triviaSessionToken = player.sessionToken;

    // Emit to the joining socket
    socket.emit('room_joined', {
      roomCode: code,
      player: player.toPublic(),
      sessionToken: player.sessionToken,
      roomState: room.getState(),
    });

    // Broadcast to the room (except the joiner)
    socket.to(code).emit('player_joined', { player: player.toPublic() });

    console.log(`[Room ${code}] "${player.nickname}" joined (${room.getPlayerCount()} players)`);
    return room;
  }

  // ──────────────────────────────────────────────────────────────
  //  Reconnection
  // ──────────────────────────────────────────────────────────────
  handleReconnect(socket, { roomCode, sessionToken }) {
    const code = (roomCode || '').toUpperCase().trim();
    const room = this.rooms.get(code);

    if (!room) {
      socket.emit('error', { message: 'room_not_found' });
      return;
    }

    const player = room.findPlayerBySessionToken(sessionToken);
    if (!player) {
      socket.emit('error', { message: 'session_expired' });
      return;
    }

    // Restore connection
    player.socketId = socket.id;
    player.isConnected = true;
    player.disconnectedAt = null;
    socket.join(code);

    socket.triviaRoomCode = code;
    socket.triviaPlayerId = player.id;
    socket.triviaSessionToken = player.sessionToken;

    // Send full state to reconnected player
    socket.emit('rejoin_success', {
      roomCode: code,
      player: player.toPublic(),
      sessionToken: player.sessionToken,
      roomState: room.getState(),
    });

    // Notify others
    socket.to(code).emit('player_reconnected', { playerId: player.id });

    console.log(`[Room ${code}] "${player.nickname}" reconnected`);
  }

  // ──────────────────────────────────────────────────────────────
  //  Explicit leave (exit-party button)
  // ──────────────────────────────────────────────────────────────
  leaveRoom(socket) {
    const code = socket.triviaRoomCode;
    const playerId = socket.triviaPlayerId;
    if (!code || !playerId) return;

    const room = this.rooms.get(code);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player) return;

    const wasHost = player.isHost;
    room.removePlayer(playerId);
    socket.leave(code);
    socket.triviaRoomCode = null;
    socket.triviaPlayerId = null;
    socket.triviaSessionToken = null;

    this.io.to(code).emit('player_left', {
      playerId,
      nickname: player.nickname,
      reason: 'left',
    });

    if (room.getPlayerCount() === 0) {
      this.rooms.delete(code);
      console.log(`[Room ${code}] Deleted (last player left)`);
    } else {
      if (wasHost) room.transferHost();
      if (room.state === 'QUESTION_ACTIVE') room.checkAllAnswered();
    }

    console.log(`[Room ${code}] "${player.nickname}" left the party`);
  }

  // ──────────────────────────────────────────────────────────────
  //  Disconnection
  // ──────────────────────────────────────────────────────────────
  handleDisconnect(socket) {
    const code = socket.triviaRoomCode;
    const playerId = socket.triviaPlayerId;

    if (!code || !playerId) return;

    const room = this.rooms.get(code);
    if (!room) return;

    const player = room.players.get(playerId);
    if (!player) return;

    player.isConnected = false;
    player.disconnectedAt = Date.now();

    // Notify others
    this.io.to(code).emit('player_left', {
      playerId: player.id,
      nickname: player.nickname,
      reason: 'disconnected',
    });

    // If in lobby, remove after a short delay
    // If in game, keep for grace period (60s)
    const gracePeriod = room.state === 'LOBBY' ? 10000 : 60000;

    setTimeout(() => {
      // Check if still disconnected
      if (player.disconnectedAt && !player.isConnected) {
        room.removePlayer(playerId);
        console.log(`[Room ${code}] "${player.nickname}" removed after grace period`);

        // If room is now empty, clean it up
        if (room.getPlayerCount() === 0) {
          this.rooms.delete(code);
          console.log(`[Room ${code}] Deleted (empty)`);
        } else if (player.isHost) {
          // Transfer host to next player
          room.transferHost();
        }
      }
    }, gracePeriod);

    // If in active question and all connected players have answered, end early
    if (room.state === 'QUESTION_ACTIVE') {
      room.checkAllAnswered();
    }

    console.log(`[Room ${code}] "${player.nickname}" disconnected`);
  }

  // ──────────────────────────────────────────────────────────────
  //  Get room by code
  // ──────────────────────────────────────────────────────────────
  getRoom(code) {
    return this.rooms.get((code || '').toUpperCase().trim()) || null;
  }

  // ──────────────────────────────────────────────────────────────
  //  Cleanup stale rooms (no activity for 30 min)
  // ──────────────────────────────────────────────────────────────
  cleanupStaleRooms() {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity > staleThreshold) {
        this.rooms.delete(code);
        console.log(`[Room ${code}] Cleaned up (stale)`);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Shutdown
  // ──────────────────────────────────────────────────────────────
  destroy() {
    clearInterval(this._cleanupInterval);
    this.rooms.clear();
  }
}

module.exports = GameManager;
