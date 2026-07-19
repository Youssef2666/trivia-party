/**
 * index.js — Express + Socket.io entry point for the trivia party game.
 *
 * Serves the static frontend, sets up WebSocket event routing,
 * and auto-detects the LAN IP for easy local network access.
 */

'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const GameManager = require('./GameManager');

// ── Configuration ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// ── Auto-detect LAN IP ─────────────────────────────────────────
function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal & non-IPv4
      if (iface.internal || iface.family !== 'IPv4') continue;
      return iface.address;
    }
  }
  return 'localhost';
}

const LAN_IP = getLanIP();
const BASE_URL = `http://${LAN_IP}:${PORT}`;

// ── Express app ────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Serve static files from public/
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Socket.io ──────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*', // LAN access — open CORS
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// ── Game Manager ───────────────────────────────────────────────
const gameManager = new GameManager(io, BASE_URL);

// ── Socket event routing ───────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── Time sync (for client-server clock offset estimation) ──
  socket.on('time_sync', (data, callback) => {
    if (typeof callback === 'function') {
      callback({ serverTime: Date.now(), clientTime: data.clientTime });
    }
  });

  // ── Create room ───────────────────────────────────────────
  socket.on('create_room', async (data) => {
    try {
      await gameManager.createRoom(socket, {
        nickname: data.nickname || 'Host',
        avatar: data.avatar || 'user',
      });
    } catch (err) {
      console.error('[Error] create_room:', err.message);
      socket.emit('error', { message: 'create_room_failed' });
    }
  });

  // ── Join room ─────────────────────────────────────────────
  socket.on('join_room', (data) => {
    try {
      gameManager.joinRoom(socket, {
        roomCode: data.roomCode || '',
        nickname: data.nickname || 'Player',
        avatar: data.avatar || 'user',
      });
    } catch (err) {
      console.error('[Error] join_room:', err.message);
      socket.emit('error', { message: 'join_room_failed' });
    }
  });

  // ── Rejoin room (reconnection) ────────────────────────────
  socket.on('rejoin_room', (data) => {
    try {
      gameManager.handleReconnect(socket, {
        roomCode: data.roomCode || '',
        sessionToken: data.sessionToken || '',
      });
    } catch (err) {
      console.error('[Error] rejoin_room:', err.message);
      socket.emit('error', { message: 'rejoin_failed' });
    }
  });

  // ── Update settings (host only) ──────────────────────────
  socket.on('update_settings', (data) => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.updateSettings(data.settings || {}, socket.triviaPlayerId);
    }
  });

  // ── Kick player (host only) ──────────────────────────────
  socket.on('kick_player', (data) => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.kickPlayer(data.playerId, socket.triviaPlayerId);
    }
  });

  // ── Start game (host only) ───────────────────────────────
  socket.on('start_game', () => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.startGame(socket.triviaPlayerId);
    }
  });

  // ── Submit answer (choice: {optionIndex} — guess: {guess}) ─
  socket.on('submit_answer', (data) => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.submitAnswer(socket.triviaPlayerId, data || {});
    }
  });

  // ── Use power-up ───────────────────────────────────────────
  socket.on('use_powerup', (data) => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.usePowerup(socket.triviaPlayerId, data.type, data.targetId, socket);
    }
  });

  // ── Use race item (rocket / shield / nitro) ───────────────
  socket.on('use_item', (data) => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.useItem(socket.triviaPlayerId, data.type, data.targetId, socket);
    }
  });

  // ── Assign team (host only, teams mode) ───────────────────
  socket.on('assign_team', (data) => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.assignTeam(data.playerId, socket.triviaPlayerId);
    }
  });

  // ── Assign chaser (host only, chase mode) ─────────────────
  socket.on('assign_chaser', (data) => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.assignChaser(data.playerId, socket.triviaPlayerId);
    }
  });

  // ── Emoji reaction (any player, rate-limited server-side) ─
  socket.on('send_reaction', (data) => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.sendReaction(socket.triviaPlayerId, (data && data.emoji) || '');
    }
  });

  // ── Request next question (host manual advance) ──────────
  socket.on('request_next', () => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.requestNext(socket.triviaPlayerId);
    }
  });

  // ── Live host controls (during an active question) ────────
  socket.on('host_pause', () => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) room.pauseQuestion(socket.triviaPlayerId);
  });

  socket.on('host_resume', () => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) room.resumeQuestion(socket.triviaPlayerId);
  });

  socket.on('host_extend', () => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) room.extendQuestion(socket.triviaPlayerId);
  });

  socket.on('host_skip', () => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) room.skipQuestion(socket.triviaPlayerId);
  });

  socket.on('host_replace', () => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) room.replaceQuestion(socket.triviaPlayerId);
  });

  // ── Rematch ───────────────────────────────────────────────
  socket.on('rematch', () => {
    const room = gameManager.getRoom(socket.triviaRoomCode);
    if (room) {
      room.rematch(socket.triviaPlayerId);
    }
  });

  // ── Explicit leave (exit-party button) ────────────────────
  socket.on('leave_room', () => {
    gameManager.leaveRoom(socket);
  });

  // ── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
    gameManager.handleDisconnect(socket);
  });
});

// ── Start server ───────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║         🎮  TRIVIA PARTY  🎮                  ║');
  console.log('╠════════════════════════════════════════════════╣');
  console.log(`║  Local:   http://localhost:${PORT}              ║`);
  console.log(`║  Network: ${BASE_URL.padEnd(35)}║`);
  console.log('╠════════════════════════════════════════════════╣');
  console.log('║  Share the Network URL with your friends!      ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('');
});

// ── Graceful shutdown ──────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  gameManager.destroy();
  server.close(() => process.exit(0));
});
