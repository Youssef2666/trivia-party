/**
 * Player.js — Player data model for the trivia party game.
 *
 * Each player gets a unique id (public) and a sessionToken (private,
 * used for reconnection). The model tracks scoring, answer history,
 * streaks, and connection state.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

class Player {
  /**
   * @param {Object} opts
   * @param {string} opts.nickname  - Display name (2-20 chars, trimmed)
   * @param {string} opts.avatar    - Icon name string (e.g. "cat", "robot")
   * @param {boolean} opts.isHost   - Whether this player created the room
   */
  constructor({ nickname, avatar, isHost = false }) {
    // ── Identity ──────────────────────────────────────────────
    this.id           = uuidv4();
    this.sessionToken = uuidv4();   // kept secret — never broadcast

    // ── Profile ───────────────────────────────────────────────
    this.nickname = (nickname || 'Player').trim().substring(0, 20);
    this.avatar   = avatar || 'default';

    // ── Socket binding ────────────────────────────────────────
    this.socketId = null;

    // ── Scoring ───────────────────────────────────────────────
    this.score  = 0;              // cumulative points (floor 0)
    this.streak = 0;              // consecutive correct answers

    // ── Answer history ────────────────────────────────────────
    // Each entry: { questionIndex, chosenOption, isCorrect, timeMs, pointsEarned }
    this.answers = [];

    // ── Room role ─────────────────────────────────────────────
    this.isHost = Boolean(isHost);

    // ── Connection state ──────────────────────────────────────
    // ── Connection state ──────────────────────────────────────
    this.isConnected    = true;
    this.disconnectedAt = null;    // timestamp (ms) or null

    // ── Power-ups ─────────────────────────────────────────────
    this.powerups = {
      fifty_fifty: 1,
      freeze: 1,
      double: 1,
      steal: 1
    };

    // ── Fun-stats counters (awards) ───────────────────────────
    this.powerupsUsedCount = 0;
    this.reactionsSent = 0;
    this.lastReactionAt = 0;   // rate-limit timestamp (ms)

    // ── Game modes ────────────────────────────────────────────
    this.team = null;            // 'red' | 'blue' (teams mode)
    this.isEliminated = false;   // survival mode
    this.eliminatedRank = null;  // final rank locked at elimination
    this.isFinished = false;     // race mode — crossed the target
    this.finishRank = null;      // finish order (1 = winner)
    this.shielded = false;       // race: armed shield blocks next rocket
    this.rocketsLanded = 0;      // race: successful rocket hits (award)
    this.items = { rocket: 0, shield: 0, nitro: 0 }; // race inventory

    // ── Chase mode (المطاردة) ─────────────────────────────────
    this.isChaser = false;       // the hunter (persists across rematches)
    this.chasePos = 0;           // steps up the board
    this.isCaught = false;       // runner caught by the chaser
    this.isHome = false;         // runner reached safety
    this.homeOrder = null;       // 1 = first to safety
    this.caughtOrder = null;     // 1 = first caught
    this.sprintUsed = false;     // one-time double-step burned?
  }

  // ────────────────────────────────────────────────────────────
  //  Public serialisation — strips sessionToken so it is safe
  //  to broadcast to every client in the room.
  // ────────────────────────────────────────────────────────────
  toPublic() {
    return {
      id:             this.id,
      nickname:       this.nickname,
      avatar:         this.avatar,
      score:          this.score,
      streak:         this.streak,
      answers:        this.answers,
      isHost:         this.isHost,
      isConnected:    this.isConnected,
      disconnectedAt: this.disconnectedAt,
      powerups:       this.powerups,
      team:           this.team,
      isEliminated:   this.isEliminated,
      eliminatedRank: this.eliminatedRank,
      isFinished:     this.isFinished,
      finishRank:     this.finishRank,
      shielded:       this.shielded,
      items:          this.items,
      isChaser:       this.isChaser,
      chasePos:       this.chasePos,
      isCaught:       this.isCaught,
      isHome:         this.isHome,
      homeOrder:      this.homeOrder,
      caughtOrder:    this.caughtOrder,
      sprintUsed:     this.sprintUsed,
    };
  }

  // ────────────────────────────────────────────────────────────
  //  Record a single answer.
  //  @param {Object} answer
  //    { questionIndex, chosenOption, isCorrect, timeMs, pointsEarned }
  // ────────────────────────────────────────────────────────────
  addAnswer(answer) {
    this.answers.push({
      questionIndex: answer.questionIndex,
      chosenOption:  answer.chosenOption,
      isCorrect:     Boolean(answer.isCorrect),
      timeMs:        answer.timeMs,
      pointsEarned:  answer.pointsEarned,
    });

    // Update streak
    if (answer.isCorrect) {
      this.streak += 1;
    } else {
      this.streak = 0;
    }

    // Update cumulative score (never below 0)
    this.score = Math.max(0, this.score + answer.pointsEarned);
  }

  // ────────────────────────────────────────────────────────────
  //  Power-ups Inventory Helpers
  // ────────────────────────────────────────────────────────────
  hasPowerup(type) {
    return this.powerups[type] && this.powerups[type] > 0;
  }

  usePowerup(type) {
    if (this.hasPowerup(type)) {
      this.powerups[type] = 0;
      this.powerupsUsedCount += 1;
      return true;
    }
    return false;
  }

  // ────────────────────────────────────────────────────────────
  //  Reset transient game data so the player can start a new
  //  game in the same room (rematch).
  // ────────────────────────────────────────────────────────────
  resetForNewGame() {
    this.score   = 0;
    this.streak  = 0;
    this.answers = [];
    this.powerups = {
      fifty_fifty: 1,
      freeze: 1,
      double: 1,
      steal: 1
    };
    this.powerupsUsedCount = 0;
    this.reactionsSent = 0;
    // Mode state (team + chaser assignments survive rematches on purpose)
    this.isEliminated = false;
    this.eliminatedRank = null;
    this.isFinished = false;
    this.finishRank = null;
    this.shielded = false;
    this.rocketsLanded = 0;
    this.items = { rocket: 0, shield: 0, nitro: 0 };
    this.chasePos = 0;
    this.isCaught = false;
    this.isHome = false;
    this.homeOrder = null;
    this.caughtOrder = null;
    this.sprintUsed = false;
  }
}

module.exports = Player;
