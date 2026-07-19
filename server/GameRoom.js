/**
 * GameRoom.js — Server-authoritative state machine for a single game room.
 *
 * States: LOBBY → STARTING → QUESTION_ACTIVE → REVEAL → LEADERBOARD → (loop) → GAME_END
 *
 * All timing, scoring, and correctness is decided here.
 * Clients never see the correct answer until the REVEAL phase.
 */

'use strict';

const ScoringEngine = require('./ScoringEngine');
const allQuestions = require('./questions');

class GameRoom {
  /**
   * @param {string} code - Room code
   * @param {import('socket.io').Server} io - Socket.io server
   */
  constructor(code, io) {
    this.code = code;
    this.io = io;

    // ── Players ────────────────────────────────────────────────
    this.players = new Map(); // playerId → Player
    this.hostId = null;

    // ── State ──────────────────────────────────────────────────
    this.state = 'LOBBY';
    this.locked = false;
    this.lastActivity = Date.now();

    // ── Settings ───────────────────────────────────────────────
    this.settings = {
      categories: ['science', 'history', 'geography', 'pop_culture', 'sports', 'technology', 'arab_world', 'general', 'football'],
      difficultyMode: 'progressive', // progressive | random | easy | medium | hard
      roundCount: 10,
      timerDuration: 20000, // ms
      penaltyEnabled: true,
      goldenEnabled: true,     // آخر سؤال ذهبي: نقاط ×2 وبدون خصم (classic/teams)
      bellEnabled: true,       // جولة الجرس: أسرع إجابة صحيحة تخطف كل النقاط
      guessEnabled: true,      // جولات التخمين: أقرب رقم يفوز
      gameMode: 'classic',     // classic | teams | survival | race | chase
      targetScore: 5000,       // race: خط النهاية
      chaseHeadStart: 3,       // chase: خطوات الأمان الأولى للهاربين
      eliminationEvery: 2,     // survival: إقصاء كل N أسئلة
      displayMode: false,      // شاشة العرض: المضيف مقدّم لا لاعب
      theme: 'neon',           // السمة: neon | ramadan | stadium | retro
    };

    // ── Game state ─────────────────────────────────────────────
    this.questions = [];           // selected & shuffled questions for this game
    this.currentQuestionIndex = -1;
    this.currentQuestion = null;   // the question object with shuffled options
    this.currentCorrectIndex = -1; // correct index AFTER shuffling
    this.currentAnswers = new Map(); // playerId → { optionIndex, timestamp }
    this.currentPowerups = new Map(); // playerId → { type, targetId }
    this.questionStartTime = 0;
    this.questionTimer = null;
    this.revealTimer = null;
    this.leaderboardTimer = null;
    this.startingTimer = null;

    // ── Live host controls (pause / +10s / skip / replace) ─────
    this.questionDurationMs = this.settings.timerDuration; // effective duration incl. extensions
    this.isPaused = false;
    this.pausedRemainingMs = 0;

    // ── Special rounds (تحدي الثلاثين-inspired) ────────────────
    this.bellIndex = -1;             // index of the bell round question (-1 = none)
    this.currentSpecial = null;      // null | 'golden' | 'bell' | 'tiebreaker'
    this.tiebreaker = null;          // { eligibleIds: [], round: n } while a decider duel runs
    this.tiebreakerWinnerId = null;
    this.tiebreakerDone = false;     // guards against re-entering the duel
    this._usedTiebreakerQs = [];

    // ── Mode state ─────────────────────────────────────────────
    this.currentItems = new Map();   // race: playerId → { type, targetId } this question
    this.finishedCount = 0;          // race: how many crossed the line
    this.winnerTeam = null;          // teams: set at game end

    // ── Chase (المطاردة) ───────────────────────────────────────
    this.chaserId = null;            // who hunts
    this.chaseHomeStep = 8;          // board length (headStart + 5)
    this.homeCount = 0;              // escape order counter
    this.caughtCount = 0;            // catch order counter
    this.chaserWon = false;          // set at game end
  }

  // ──────────────────────────────────────────────────────────────
  //  Player management
  // ──────────────────────────────────────────────────────────────

  addPlayer(player, socket) {
    this.players.set(player.id, player);
    socket.join(this.code);

    if (player.isHost) {
      this.hostId = player.id;
    }

    this.lastActivity = Date.now();
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.lastActivity = Date.now();
  }

  getPlayerCount() {
    return this.players.size;
  }

  getConnectedPlayers() {
    return Array.from(this.players.values()).filter(p => p.isConnected);
  }

  findPlayerBySessionToken(token) {
    for (const player of this.players.values()) {
      if (player.sessionToken === token) return player;
    }
    return null;
  }

  transferHost() {
    const connected = this.getConnectedPlayers();
    if (connected.length > 0) {
      const newHost = connected[0];
      // Remove host status from old host
      for (const p of this.players.values()) p.isHost = false;
      newHost.isHost = true;
      this.hostId = newHost.id;

      this.io.to(this.code).emit('host_transferred', {
        newHostId: newHost.id,
        nickname: newHost.nickname,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Host controls
  // ──────────────────────────────────────────────────────────────

  kickPlayer(playerId, requesterId) {
    if (requesterId !== this.hostId) return;
    if (this.state !== 'LOBBY') return;
    if (playerId === this.hostId) return; // can't kick yourself

    const player = this.players.get(playerId);
    if (!player) return;

    this.players.delete(playerId);

    this.io.to(this.code).emit('player_kicked', {
      playerId,
      nickname: player.nickname,
    });

    // Disconnect their socket
    const sockets = this.io.sockets.sockets;
    for (const [, s] of sockets) {
      if (s.triviaPlayerId === playerId) {
        s.leave(this.code);
        s.triviaRoomCode = null;
        s.triviaPlayerId = null;
        break;
      }
    }
  }

  updateSettings(newSettings, requesterId) {
    if (requesterId !== this.hostId) return;
    if (this.state !== 'LOBBY') return;

    // Merge only valid settings
    if (newSettings.categories && Array.isArray(newSettings.categories)) {
      this.settings.categories = newSettings.categories;
    }
    if (['progressive', 'random', 'easy', 'medium', 'hard'].includes(newSettings.difficultyMode)) {
      this.settings.difficultyMode = newSettings.difficultyMode;
    }
    if ([5, 10, 15, 20].includes(newSettings.roundCount)) {
      this.settings.roundCount = newSettings.roundCount;
    }
    if ([10000, 15000, 20000, 30000].includes(newSettings.timerDuration)) {
      this.settings.timerDuration = newSettings.timerDuration;
    }
    if (typeof newSettings.penaltyEnabled === 'boolean') {
      this.settings.penaltyEnabled = newSettings.penaltyEnabled;
    }
    if (typeof newSettings.goldenEnabled === 'boolean') {
      this.settings.goldenEnabled = newSettings.goldenEnabled;
    }
    if (typeof newSettings.bellEnabled === 'boolean') {
      this.settings.bellEnabled = newSettings.bellEnabled;
    }
    if (typeof newSettings.guessEnabled === 'boolean') {
      this.settings.guessEnabled = newSettings.guessEnabled;
    }
    if (['classic', 'teams', 'survival', 'race', 'chase'].includes(newSettings.gameMode)) {
      this.settings.gameMode = newSettings.gameMode;
      if (newSettings.gameMode === 'teams') this._autoAssignTeams();
    }
    if ([3000, 5000, 8000].includes(newSettings.targetScore)) {
      this.settings.targetScore = newSettings.targetScore;
    }
    if ([2, 3, 4].includes(newSettings.chaseHeadStart)) {
      this.settings.chaseHeadStart = newSettings.chaseHeadStart;
    }
    if ([1, 2, 3].includes(newSettings.eliminationEvery)) {
      this.settings.eliminationEvery = newSettings.eliminationEvery;
    }
    if (typeof newSettings.displayMode === 'boolean') {
      this.settings.displayMode = newSettings.displayMode;
      if (this.settings.gameMode === 'teams') this._autoAssignTeams();
    }
    if (['neon', 'ramadan', 'stadium', 'retro'].includes(newSettings.theme)) {
      this.settings.theme = newSettings.theme;
    }

    this.io.to(this.code).emit('settings_updated', { settings: this.settings });
    this.lastActivity = Date.now();
  }

  // ──────────────────────────────────────────────────────────────
  //  Teams (وضع الفرق)
  // ──────────────────────────────────────────────────────────────

  /** Is this player a contestant? (display-mode host is a presenter, not a player) */
  _isContestant(p) {
    return !(this.settings.displayMode && p.isHost);
  }

  /** Fill missing team assignments, balancing red/blue. */
  _autoAssignTeams() {
    let red = 0;
    let blue = 0;
    for (const p of this.players.values()) {
      if (!this._isContestant(p)) { p.team = null; continue; }
      if (p.team === 'red') red++;
      else if (p.team === 'blue') blue++;
    }
    for (const p of this.players.values()) {
      if (!this._isContestant(p)) continue;
      if (p.team !== 'red' && p.team !== 'blue') {
        if (red <= blue) { p.team = 'red'; red++; }
        else { p.team = 'blue'; blue++; }
      }
    }
    this._broadcastRoster();
  }

  _broadcastRoster() {
    for (const p of this.players.values()) {
      this.io.to(this.code).emit('player_updated', { player: p.toPublic() });
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Chase (المطاردة) — chaser assignment
  // ──────────────────────────────────────────────────────────────

  /** Host taps a player to crown them the Chaser (tap again to unset). */
  assignChaser(playerId, requesterId) {
    if (requesterId !== this.hostId) return;
    if (this.state !== 'LOBBY') return;
    if (this.settings.gameMode !== 'chase') return;

    const target = this.players.get(playerId);
    if (!target || !this._isContestant(target)) return;

    const wasChaser = target.isChaser;
    for (const p of this.players.values()) p.isChaser = false;
    target.isChaser = !wasChaser;
    this.chaserId = target.isChaser ? playerId : null;

    this._broadcastRoster();
    this.lastActivity = Date.now();
  }

  /** Host taps a player card to flip their team (lobby only). */
  assignTeam(playerId, requesterId) {
    if (requesterId !== this.hostId) return;
    if (this.state !== 'LOBBY') return;
    if (this.settings.gameMode !== 'teams') return;

    const player = this.players.get(playerId);
    if (!player || !this._isContestant(player)) return;

    player.team = player.team === 'red' ? 'blue' : 'red';
    this.io.to(this.code).emit('player_updated', { player: player.toPublic() });
    this.lastActivity = Date.now();
  }

  /** Live team totals from member scores. */
  getTeamScores() {
    const teams = { red: { team: 'red', score: 0, members: [] }, blue: { team: 'blue', score: 0, members: [] } };
    for (const p of this.players.values()) {
      if (!this._isContestant(p)) continue;
      const t = teams[p.team];
      if (!t) continue;
      t.score += p.score;
      t.members.push(p.toPublic());
    }
    for (const key of ['red', 'blue']) {
      teams[key].members.sort((a, b) => b.score - a.score);
    }
    return [teams.red, teams.blue].sort((a, b) => b.score - a.score);
  }

  // ──────────────────────────────────────────────────────────────
  //  Emoji reactions (party layer — any state, rate-limited)
  // ──────────────────────────────────────────────────────────────

  sendReaction(playerId, emoji) {
    const ALLOWED = ['😂', '🔥', '😱', '👏', '😭', '❤️', '🤯', '💀'];
    if (ALLOWED.indexOf(emoji) === -1) return;

    const player = this.players.get(playerId);
    if (!player || !player.isConnected) return;

    // Rate limit: one reaction per 800ms per player
    const now = Date.now();
    if (now - player.lastReactionAt < 800) return;
    player.lastReactionAt = now;
    player.reactionsSent += 1;

    this.io.to(this.code).emit('reaction', {
      playerId: player.id,
      nickname: player.nickname,
      avatar: player.avatar,
      emoji,
    });
  }

  // ──────────────────────────────────────────────────────────────
  //  Game lifecycle
  // ──────────────────────────────────────────────────────────────

  startGame(requesterId) {
    if (requesterId !== this.hostId) return;
    if (this.state !== 'LOBBY') return;

    // Contestants = connected players minus a display-mode presenter host
    const contestants = this.getConnectedPlayers().filter(p => this._isContestant(p));
    if (contestants.length < 2) return;

    if (this.settings.gameMode === 'teams') {
      this._autoAssignTeams();
      const red = contestants.filter(p => p.team === 'red').length;
      const blue = contestants.filter(p => p.team === 'blue').length;
      if (red < 1 || blue < 1) {
        this.io.to(this.code).emit('error', { message: 'teams_unbalanced' });
        return;
      }
    }

    if (this.settings.gameMode === 'chase') {
      const chaser = this.players.get(this.chaserId);
      if (!chaser || !contestants.includes(chaser)) {
        this.io.to(this.code).emit('error', { message: 'chaser_required' });
        return;
      }
    }

    // Reset mode state
    this.currentItems = new Map();
    this.finishedCount = 0;
    this.winnerTeam = null;
    this.homeCount = 0;
    this.caughtCount = 0;
    this.chaserWon = false;

    // Select questions
    this.selectQuestions();

    if (this.questions.length === 0) {
      this.io.to(this.code).emit('error', { message: 'no_questions_available' });
      return;
    }

    // Lock room
    this.locked = true;
    this.state = 'STARTING';
    this.currentQuestionIndex = -1;
    this.currentSpecial = null;
    this.tiebreaker = null;
    this.tiebreakerWinnerId = null;
    this.tiebreakerDone = false;
    this._usedTiebreakerQs = [];

    // Reset all player scores
    for (const player of this.players.values()) {
      player.resetForNewGame();
    }

    // Chase: place everyone on the board (runners get their head start)
    if (this.settings.gameMode === 'chase') {
      this.chaseHomeStep = this.settings.chaseHeadStart + 5;
      for (const p of contestants) {
        p.chasePos = p.isChaser ? 0 : this.settings.chaseHeadStart;
      }
      this._broadcastRoster();
    }

    // Countdown 3-2-1
    this.io.to(this.code).emit('game_starting', { countdown: 3 });

    this.startingTimer = setTimeout(() => {
      this.startNextQuestion();
    }, 3500); // 3.5s for the 3-2-1-GO animation

    this.lastActivity = Date.now();
  }

  /** How many questions this game needs, given the mode. */
  _plannedQuestionCount() {
    const mode = this.settings.gameMode;
    if (mode === 'survival') {
      // Exactly (contestants - 1) eliminations, one every N questions
      const alive = this.getConnectedPlayers().filter(p => this._isContestant(p)).length;
      return Math.min(30, Math.max(2, this.settings.eliminationEvery * Math.max(1, alive - 1)));
    }
    if (mode === 'race') return 30; // safety cap — the race usually ends earlier
    if (mode === 'chase') return 20; // cap — survivors at the cap escape
    return this.settings.roundCount;
  }

  selectQuestions() {
    // Filter by selected categories (guess questions are drawn separately)
    let pool = allQuestions.filter(q =>
      q.type !== 'guess' && this.settings.categories.includes(q.category)
    );

    // Filter by difficulty mode if fixed
    if (['easy', 'medium', 'hard'].includes(this.settings.difficultyMode)) {
      pool = pool.filter(q => q.difficulty === this.settings.difficultyMode);
    }

    // Shuffle the pool
    this.shuffleArray(pool);

    // Take the right number of questions
    const count = Math.min(this._plannedQuestionCount(), pool.length);

    if (this.settings.difficultyMode === 'progressive' && pool.length >= count) {
      // Sort: easy first, then medium, then hard
      const easy = pool.filter(q => q.difficulty === 'easy');
      const medium = pool.filter(q => q.difficulty === 'medium');
      const hard = pool.filter(q => q.difficulty === 'hard');

      this.shuffleArray(easy);
      this.shuffleArray(medium);
      this.shuffleArray(hard);

      // Distribute: first third easy, middle third medium, last third hard
      const third = Math.ceil(count / 3);
      const selected = [
        ...easy.slice(0, third),
        ...medium.slice(0, third),
        ...hard.slice(0, count - 2 * third),
      ];

      // Pad if we don't have enough of a difficulty
      while (selected.length < count && pool.length > selected.length) {
        const remaining = pool.filter(q => !selected.includes(q));
        if (remaining.length === 0) break;
        selected.push(remaining[0]);
      }

      this.questions = selected.slice(0, count);
    } else {
      this.questions = pool.slice(0, count);
    }

    // ── Bell round position ────────────────────────────────────
    // One winner-takes-all question somewhere in the middle third of the
    // game (never the first or the golden last question). Needs ≥5 rounds.
    this.bellIndex = -1;
    const n = this.questions.length;
    if (this.settings.bellEnabled && n >= 5 && this.settings.gameMode !== 'chase') {
      const from = Math.max(1, Math.floor(n / 3));
      const to = Math.max(from + 1, Math.floor((2 * n) / 3)); // exclusive
      this.bellIndex = from + Math.floor(Math.random() * (to - from));
      if (this.bellIndex >= n - 1) this.bellIndex = n - 2; // keep off the finale
    }

    // ── Guess rounds (تخمين) ───────────────────────────────────
    // Swap ~1 in 5 questions for a numeric-guess question — never the
    // opener, the bell round, or the golden finale.
    if (this.settings.guessEnabled && n >= 4 && this.settings.gameMode !== 'chase') {
      const guessPool = allQuestions.filter(q => q.type === 'guess');
      this.shuffleArray(guessPool);
      const wanted = Math.min(guessPool.length, Math.floor(n / 5) || (n >= 4 ? 1 : 0));
      const goldenIdx = (this._goldenApplies() && n >= 3) ? n - 1 : -1;

      const slots = [];
      for (let i = 1; i < n; i++) {
        if (i !== this.bellIndex && i !== goldenIdx) slots.push(i);
      }
      this.shuffleArray(slots);
      for (let s = 0, placed = 0; s < slots.length && placed < wanted; s++, placed++) {
        this.questions[slots[s]] = guessPool[placed];
      }
    }
  }

  /** The golden finale only makes sense with a known last question. */
  _goldenApplies() {
    return this.settings.goldenEnabled &&
      (this.settings.gameMode === 'classic' || this.settings.gameMode === 'teams');
  }

  startNextQuestion() {
    this.currentQuestionIndex++;

    if (this.currentQuestionIndex >= this.questions.length) {
      this.endGame();
      return;
    }

    const q = this.questions[this.currentQuestionIndex];

    // Which special round is this? (golden finale / bell round)
    let special = null;
    if (this.currentQuestionIndex === this.bellIndex && q.type !== 'guess') {
      special = 'bell';
    } else if (
      this._goldenApplies() &&
      this.questions.length >= 3 &&
      this.currentQuestionIndex === this.questions.length - 1
    ) {
      special = 'golden';
    }

    this._launchQuestion(q, {
      special,
      questionIndex: this.currentQuestionIndex,
      totalQuestions: this.questions.length,
    });
  }

  /**
   * Shared launcher for normal, special, tiebreaker, and guess questions.
   * Supports 2-option (true/false), 4-option, and numeric-guess questions.
   */
  _launchQuestion(q, meta) {
    const isGuess = q.type === 'guess';
    let shuffledOptions = [];

    if (isGuess) {
      this.currentCorrectIndex = -1;
    } else {
      const indices = q.options.map((_, i) => i);
      this.shuffleArray(indices);
      shuffledOptions = indices.map(i => q.options[i]);
      this.currentCorrectIndex = indices.indexOf(q.correctIndex);
    }

    this.currentSpecial = meta.special || null;

    this.currentQuestion = {
      type: isGuess ? 'guess' : 'choice',
      category: q.category,
      difficulty: q.difficulty,
      question: q.question,
      options: shuffledOptions,
      special: this.currentSpecial,
      answerValue: isGuess ? q.answer : null, // server-side secret
      unit: isGuess ? (q.unit || null) : null,
    };

    this.currentAnswers = new Map();
    this.currentPowerups = new Map();
    this.currentItems = new Map();
    this.questionStartTime = Date.now();
    this.questionDurationMs = this.settings.timerDuration;
    this.isPaused = false;
    this.pausedRemainingMs = 0;
    this.state = 'QUESTION_ACTIVE';

    // Broadcast question (WITHOUT the correct answer!)
    this.io.to(this.code).emit('question_started', {
      questionIndex: meta.questionIndex,
      totalQuestions: meta.totalQuestions,
      type: this.currentQuestion.type,
      category: q.category,
      difficulty: q.difficulty,
      question: q.question,
      options: shuffledOptions,
      unit: this.currentQuestion.unit,
      serverTimestamp: this.questionStartTime,
      durationMs: this.questionDurationMs,
      special: this.currentSpecial,
      eligibleIds: this.tiebreaker ? this.tiebreaker.eligibleIds : null,
      mode: this.settings.gameMode,
      targetScore: this.settings.gameMode === 'race' ? this.settings.targetScore : null,
    });

    // Start server-side timer
    this.questionTimer = setTimeout(() => {
      this.endQuestion();
    }, this.questionDurationMs);

    this.lastActivity = Date.now();
  }

  // ──────────────────────────────────────────────────────────────
  //  Answer submission
  // ──────────────────────────────────────────────────────────────

  /** Connected contestant who is still racing/surviving/running (may answer). */
  _isActiveContestant(p) {
    return p.isConnected && !p.isEliminated && !p.isFinished &&
      !p.isCaught && !p.isHome && this._isContestant(p);
  }

  submitAnswer(playerId, answer) {
    // Validate state (a paused question accepts nothing)
    if (this.state !== 'QUESTION_ACTIVE' || this.isPaused) return;

    const player = this.players.get(playerId);
    if (!player || !this._isActiveContestant(player)) return;

    // During a tiebreaker only the tied finalists may answer
    if (this.tiebreaker && this.tiebreaker.eligibleIds.indexOf(playerId) === -1) return;

    // Enforce exactly one answer per question
    if (this.currentAnswers.has(playerId)) return;

    // Accept both legacy `optionIndex` numbers and `{ optionIndex }` / `{ guess }` payloads
    const isGuess = this.currentQuestion && this.currentQuestion.type === 'guess';

    if (isGuess) {
      const raw = (answer && typeof answer === 'object') ? answer.guess : answer;
      const num = Number(raw);
      if (!isFinite(num)) return;
      this.currentAnswers.set(playerId, {
        guess: Math.round(Math.max(-1e9, Math.min(1e9, num))),
        timestamp: Date.now(),
      });
    } else {
      const optionIndex = (answer && typeof answer === 'object') ? answer.optionIndex : answer;
      const optionCount = this.currentQuestion ? this.currentQuestion.options.length : 4;
      if (typeof optionIndex !== 'number' || optionIndex < 0 || optionIndex >= optionCount) return;
      this.currentAnswers.set(playerId, {
        optionIndex,
        timestamp: Date.now(),
      });
    }

    // Ack privately to the submitter
    const playerSocket = this.findSocket(playerId);
    if (playerSocket) {
      playerSocket.emit('answer_acked', { questionIndex: this.currentQuestionIndex });
    }

    // Broadcast updated answer count (no details — just the count)
    const answered = this.currentAnswers.size;
    const total = this._getAnswerEligiblePlayers().length;
    this.io.to(this.code).emit('answer_count', { answered, total });

    // Check if all connected players have answered
    this.checkAllAnswered();

    this.lastActivity = Date.now();
  }

  /** Connected players allowed to answer the current question. */
  _getAnswerEligiblePlayers() {
    const active = this.getConnectedPlayers().filter(p => this._isActiveContestant(p));
    if (!this.tiebreaker) return active;
    return active.filter(p => this.tiebreaker.eligibleIds.indexOf(p.id) !== -1);
  }

  checkAllAnswered() {
    if (this.isPaused) return; // resume re-checks — never end a frozen question

    const eligible = this._getAnswerEligiblePlayers();
    const allAnswered = eligible.length > 0 && eligible.every(p => this.currentAnswers.has(p.id));

    if (allAnswered && this.state === 'QUESTION_ACTIVE') {
      // Clear the timer and end immediately
      clearTimeout(this.questionTimer);
      this.endQuestion();
    }
  }

  usePowerup(playerId, type, targetId, socket) {
    if (this.state !== 'QUESTION_ACTIVE' || this.isPaused) return;

    // No power-ups in the decider duel — pure skill
    if (this.tiebreaker) return;

    // Race and chase have their own tools instead of classic power-ups
    if (this.settings.gameMode === 'race' || this.settings.gameMode === 'chase') {
      socket.emit('error', { message: 'powerup_not_available' });
      return;
    }

    const player = this.players.get(playerId);
    if (!player || !this._isActiveContestant(player)) return;

    const isGuess = this.currentQuestion && this.currentQuestion.type === 'guess';

    // 50/50 needs 4 options; 50/50 and steal make no sense on guess rounds
    if (type === 'fifty_fifty' && this.currentQuestion &&
        (isGuess || this.currentQuestion.options.length < 4)) {
      socket.emit('error', { message: 'powerup_not_available' });
      return;
    }
    if (type === 'steal' && isGuess) {
      socket.emit('error', { message: 'powerup_not_available' });
      return;
    }

    // Has player already answered?
    if (this.currentAnswers.has(playerId)) return;

    // Has player already used a power-up on this question?
    if (this.currentPowerups.has(playerId)) {
      socket.emit('error', { message: 'powerup_already_used_this_round' });
      return;
    }

    // Does player have the power-up?
    if (!player.hasPowerup(type)) {
      socket.emit('error', { message: 'powerup_depleted' });
      return;
    }

    // Specific logic per power-up type validation
    if (type === 'steal') {
      const target = this.players.get(targetId);
      if (!target || targetId === playerId) {
        socket.emit('error', { message: 'invalid_steal_target' });
        return;
      }
    }

    // Consume power-up
    if (!player.usePowerup(type)) {
      socket.emit('error', { message: 'powerup_activation_failed' });
      return;
    }

    // Record the usage
    if (type === 'fifty_fifty') {
      const incorrectIndices = [];
      for (let i = 0; i < 4; i++) {
        if (i !== this.currentCorrectIndex) {
          incorrectIndices.push(i);
        }
      }
      this.shuffleArray(incorrectIndices);
      const removeIndices = incorrectIndices.slice(0, 2);

      this.currentPowerups.set(playerId, { type });
      socket.emit('powerup_result', { type: 'fifty_fifty', removeIndices });
    } else if (type === 'freeze') {
      this.currentPowerups.set(playerId, { type });
      socket.emit('powerup_result', { type: 'freeze' });
    } else if (type === 'double') {
      this.currentPowerups.set(playerId, { type });
      socket.emit('powerup_result', { type: 'double' });
    } else if (type === 'steal') {
      this.currentPowerups.set(playerId, { type, targetId });
      socket.emit('powerup_result', { type: 'steal', targetId });
    }

    // Broadcast updated player public state to update their powerup UI indicator
    this.io.to(this.code).emit('player_updated', { player: player.toPublic() });

    this.lastActivity = Date.now();
  }

  // ──────────────────────────────────────────────────────────────
  //  Race items (سباق المضمار) — rocket / shield / nitro
  // ──────────────────────────────────────────────────────────────

  useItem(playerId, type, targetId, socket) {
    if (this.state !== 'QUESTION_ACTIVE' || this.isPaused) return;
    if (this.tiebreaker) return;

    const player = this.players.get(playerId);
    if (!player || !this._isActiveContestant(player)) return;

    // Chase: the only tool is the one-time Sprint (double step if correct)
    if (this.settings.gameMode === 'chase') {
      if (type !== 'sprint') return;
      if (this.currentItems.has(playerId)) {
        socket.emit('error', { message: 'item_already_used' });
        return;
      }
      if (player.sprintUsed) {
        socket.emit('error', { message: 'item_depleted' });
        return;
      }
      player.sprintUsed = true;
      this.currentItems.set(playerId, { type: 'sprint', targetId: null });
      socket.emit('item_result', { type: 'sprint', targetId: null });
      this.io.to(this.code).emit('player_updated', { player: player.toPublic() });
      this.lastActivity = Date.now();
      return;
    }

    if (this.settings.gameMode !== 'race') return;

    if (!['rocket', 'shield', 'nitro'].includes(type)) return;

    // One item per question per player
    if (this.currentItems.has(playerId)) {
      socket.emit('error', { message: 'item_already_used' });
      return;
    }
    if (!player.items[type] || player.items[type] <= 0) {
      socket.emit('error', { message: 'item_depleted' });
      return;
    }

    if (type === 'rocket') {
      const target = this.players.get(targetId);
      if (!target || targetId === playerId || target.isEliminated || !this._isContestant(target)) {
        socket.emit('error', { message: 'invalid_target' });
        return;
      }
    }

    player.items[type] -= 1;
    this.currentItems.set(playerId, { type, targetId: targetId || null });

    // Shields arm instantly and persist until they absorb a rocket
    if (type === 'shield') player.shielded = true;

    socket.emit('item_result', { type, targetId: targetId || null });
    this.io.to(this.code).emit('player_updated', { player: player.toPublic() });
    this.lastActivity = Date.now();
  }

  /** Apply queued nitros and rockets after base scoring. Returns effect log. */
  _resolveItems(playerResults) {
    if (this.settings.gameMode !== 'race' || this.currentItems.size === 0) return [];
    const effects = [];

    for (const [pid, it] of this.currentItems) {
      if (it.type !== 'nitro') continue;
      const p = this.players.get(pid);
      if (!p) continue;
      p.score += 250;
      effects.push({ type: 'nitro', from: p.nickname, fromId: pid, amount: 250 });
    }

    for (const [pid, it] of this.currentItems) {
      if (it.type !== 'rocket') continue;
      const attacker = this.players.get(pid);
      const target = this.players.get(it.targetId);
      if (!attacker || !target) continue;

      if (target.shielded) {
        target.shielded = false;
        effects.push({ type: 'rocket', blocked: true, from: attacker.nickname, fromId: pid, to: target.nickname, toId: target.id, amount: 0 });
      } else {
        const loss = Math.min(300, target.score);
        target.score -= loss;
        attacker.rocketsLanded += 1;
        effects.push({ type: 'rocket', blocked: false, from: attacker.nickname, fromId: pid, to: target.nickname, toId: target.id, amount: loss });
      }
    }

    for (const [pid, it] of this.currentItems) {
      if (it.type !== 'shield') continue;
      const p = this.players.get(pid);
      if (p) effects.push({ type: 'shield', from: p.nickname, fromId: pid });
    }

    // Sync reveal entries with post-item scores
    for (const r of playerResults) {
      const p = this.players.get(r.playerId);
      if (p) r.newScore = p.score;
    }
    return effects;
  }

  /** Correct answers have a 45% chance to earn a random race item. */
  _awardItems(playerResults) {
    if (this.settings.gameMode !== 'race') return;
    for (const r of playerResults) {
      if (!r.isCorrect) continue;
      const p = this.players.get(r.playerId);
      if (!p || p.isFinished || p.isEliminated) continue;
      if (Math.random() >= 0.45) continue;
      const roll = Math.random();
      const type = roll < 0.4 ? 'rocket' : (roll < 0.75 ? 'nitro' : 'shield');
      if (p.items[type] >= 2) continue; // pocket limit
      p.items[type] += 1;
      r.itemAwarded = type;
      this.io.to(this.code).emit('player_updated', { player: p.toPublic() });
    }
  }

  /** Race: lock finish ranks for everyone who crossed the target line. */
  _checkRaceFinishes(playerResults) {
    if (this.settings.gameMode !== 'race') return [];
    const target = this.settings.targetScore;
    const crossers = [];
    for (const p of this.players.values()) {
      if (!this._isContestant(p) || p.isEliminated || p.isFinished) continue;
      if (p.score >= target) crossers.push(p);
    }
    // Same-question crossers rank by overshoot (bigger lead first)
    crossers.sort((a, b) => b.score - a.score);

    const finishedNow = [];
    for (const p of crossers) {
      this.finishedCount += 1;
      p.isFinished = true;
      p.finishRank = this.finishedCount;
      finishedNow.push({ playerId: p.id, nickname: p.nickname, avatar: p.avatar, rank: p.finishRank, score: p.score });
      const r = playerResults.find(x => x.playerId === p.id);
      if (r) r.finishedNow = p.finishRank;
      this.io.to(this.code).emit('player_updated', { player: p.toPublic() });
    }
    return finishedNow;
  }

  // ──────────────────────────────────────────────────────────────
  //  Chase resolution (المطاردة) — steps, catches, escapes
  // ──────────────────────────────────────────────────────────────

  _endChaseQuestion() {
    clearTimeout(this.questionTimer);
    this.state = 'REVEAL';

    const totalTime = this.questionDurationMs;
    const chaser = this.players.get(this.chaserId) || null;
    const homeStep = this.chaseHomeStep;
    const playerResults = [];
    const homeNow = [];
    const caughtNow = [];

    // 1) Grade everyone still on the board (runners + chaser)
    for (const p of this.players.values()) {
      if (!this._isActiveContestant(p)) continue;

      const a = this.currentAnswers.get(p.id);
      const isCorrect = Boolean(a) && a.optionIndex === this.currentCorrectIndex;
      const sprint = this.currentItems.get(p.id)?.type === 'sprint';
      const steps = isCorrect ? (sprint ? 2 : 1) : 0;

      p.addAnswer({
        questionIndex: this.currentQuestionIndex,
        chosenOption: a ? a.optionIndex : -1,
        isCorrect,
        timeMs: a ? a.timestamp - this.questionStartTime : totalTime,
        pointsEarned: 0,
      });

      playerResults.push({
        playerId: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        chosenOption: a ? a.optionIndex : -1,
        isCorrect,
        pointsEarned: 0,
        newScore: p.score,
        streak: p.streak,
        answerTimeMs: a ? a.timestamp - this.questionStartTime : totalTime,
        powerupUsed: null,
        isChaser: p.isChaser,
        stepsGained: steps,
        sprintUsed: sprint,
      });
    }

    // 2) Runners move first — reaching home means SAFE, even if the
    //    chaser passes them this same turn (TV rule)
    for (const r of playerResults) {
      if (r.isChaser) continue;
      const p = this.players.get(r.playerId);
      p.chasePos = Math.min(homeStep, p.chasePos + r.stepsGained);
      r.newPos = p.chasePos;

      if (p.chasePos >= homeStep) {
        p.isHome = true;
        this.homeCount += 1;
        p.homeOrder = this.homeCount;
        r.homeNow = p.homeOrder;
        homeNow.push({ playerId: p.id, nickname: p.nickname, avatar: p.avatar, order: p.homeOrder });
      }
    }

    // 3) The chaser pounces — any runner at or behind them is caught
    if (chaser) {
      const cr = playerResults.find(r => r.playerId === chaser.id);
      chaser.chasePos += cr ? cr.stepsGained : 0;
      if (cr) cr.newPos = chaser.chasePos;

      for (const r of playerResults) {
        if (r.isChaser || r.homeNow) continue;
        const p = this.players.get(r.playerId);
        if (p.isHome || p.isCaught) continue;
        if (p.chasePos <= chaser.chasePos) {
          p.isCaught = true;
          this.caughtCount += 1;
          p.caughtOrder = this.caughtCount;
          r.caughtNow = p.caughtOrder;
          caughtNow.push({ playerId: p.id, nickname: p.nickname, avatar: p.avatar, order: p.caughtOrder });
        }
      }
    }

    // 4) Sync clients' player objects (spectator switches, positions)
    for (const r of playerResults) {
      const p = this.players.get(r.playerId);
      if (p) this.io.to(this.code).emit('player_updated', { player: p.toPublic() });
    }

    this.io.to(this.code).emit('question_ended', {
      questionIndex: this.currentQuestionIndex,
      type: 'choice',
      correctIndex: this.currentCorrectIndex,
      playerResults,
      special: this.currentSpecial,
      itemEffects: [],
      finishedNow: [],
      chase: {
        chaserId: this.chaserId,
        chaserPos: chaser ? chaser.chasePos : 0,
        homeStep,
        headStart: this.settings.chaseHeadStart,
        homeNow,
        caughtNow,
      },
    });

    this.revealTimer = setTimeout(() => {
      this.showLeaderboard();
    }, 4500);

    this.lastActivity = Date.now();
  }

  /** Active runners still on the board (not the chaser). */
  _activeRunners() {
    return Array.from(this.players.values()).filter(p =>
      this._isContestant(p) && !p.isChaser && !p.isCaught && !p.isHome && !p.isEliminated
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Guess rounds (التخمين) — closest number wins
  // ──────────────────────────────────────────────────────────────

  _endGuessQuestion() {
    clearTimeout(this.questionTimer);
    this.state = 'REVEAL';

    const answer = this.currentQuestion.answerValue;
    const totalTime = this.questionDurationMs;

    const entries = [];
    for (const [pid, a] of this.currentAnswers) {
      const p = this.players.get(pid);
      if (!p) continue;
      entries.push({ player: p, guess: a.guess, diff: Math.abs(a.guess - answer), timestamp: a.timestamp });
    }
    entries.sort((x, y) => x.diff - y.diff || x.timestamp - y.timestamp);

    const playerResults = [];

    entries.forEach((e, rank) => {
      // 1000 → 780 → 608 → … floor 150; exact hit +250
      let points = Math.max(150, Math.round(1000 * Math.pow(0.78, rank)));
      if (e.diff === 0) points += 250;

      const usedDouble = this.currentPowerups.get(e.player.id)?.type === 'double';
      if (usedDouble) points *= 2;

      // Guesses extend the streak only for the winner and never break it
      const prevStreak = e.player.streak;
      e.player.addAnswer({
        questionIndex: this.currentQuestionIndex,
        chosenOption: -2,
        isCorrect: rank === 0,
        timeMs: e.timestamp - this.questionStartTime,
        pointsEarned: points,
      });
      if (rank !== 0) e.player.streak = prevStreak;

      const powerup = this.currentPowerups.get(e.player.id);
      playerResults.push({
        playerId: e.player.id,
        nickname: e.player.nickname,
        avatar: e.player.avatar,
        chosenOption: -2,
        guess: e.guess,
        diff: e.diff,
        guessRank: rank + 1,
        isCorrect: rank === 0,
        pointsEarned: points,
        newScore: e.player.score,
        streak: e.player.streak,
        answerTimeMs: e.timestamp - this.questionStartTime,
        powerupUsed: powerup ? { type: powerup.type, targetId: powerup.targetId } : null,
      });
    });

    // Active contestants who never guessed: 0 points, streak preserved
    for (const player of this.players.values()) {
      if (!this._isActiveContestant(player)) continue;
      if (this.currentAnswers.has(player.id)) continue;

      const prevStreak = player.streak;
      player.addAnswer({
        questionIndex: this.currentQuestionIndex,
        chosenOption: -1,
        isCorrect: false,
        timeMs: totalTime,
        pointsEarned: 0,
      });
      player.streak = prevStreak;

      playerResults.push({
        playerId: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        chosenOption: -1,
        guess: null,
        diff: null,
        guessRank: null,
        isCorrect: false,
        pointsEarned: 0,
        newScore: player.score,
        streak: player.streak,
        answerTimeMs: totalTime,
        powerupUsed: null,
      });
    }

    const itemEffects = this._resolveItems(playerResults);
    this._awardItems(playerResults);
    const finishedNow = this._checkRaceFinishes(playerResults);

    this.io.to(this.code).emit('question_ended', {
      questionIndex: this.currentQuestionIndex,
      type: 'guess',
      correctIndex: -1,
      answerValue: answer,
      unit: this.currentQuestion.unit,
      playerResults,
      special: this.currentSpecial,
      itemEffects,
      finishedNow,
    });

    // Guess reveals carry more info — give people a beat longer
    this.revealTimer = setTimeout(() => {
      this.showLeaderboard();
    }, 5000);

    this.lastActivity = Date.now();
  }

  // ──────────────────────────────────────────────────────────────
  //  Question resolution
  // ──────────────────────────────────────────────────────────────

  endQuestion() {
    if (this.state !== 'QUESTION_ACTIVE') return;

    // The decider duel has its own resolution path
    if (this.tiebreaker) {
      this._endTiebreakerQuestion();
      return;
    }

    // Guess rounds resolve by closeness, not correctness
    if (this.currentQuestion && this.currentQuestion.type === 'guess') {
      this._endGuessQuestion();
      return;
    }

    // Chase resolves as board steps, not points
    if (this.settings.gameMode === 'chase') {
      this._endChaseQuestion();
      return;
    }

    clearTimeout(this.questionTimer);
    this.state = 'REVEAL';

    const totalTime = this.questionDurationMs;
    const difficulty = this.questions[this.currentQuestionIndex].difficulty;

    // Sort correct answers by time (fastest first) for ranking
    const correctAnswers = [];
    const wrongAnswers = [];

    for (const [playerId, answer] of this.currentAnswers) {
      const isCorrect = answer.optionIndex === this.currentCorrectIndex;
      if (isCorrect) {
        correctAnswers.push({ playerId, ...answer, isCorrect: true });
      } else {
        wrongAnswers.push({ playerId, ...answer, isCorrect: false });
      }
    }

    // Sort correct answers by timestamp (fastest first)
    correctAnswers.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate points for each player
    const playerResults = [];

    // Correct answers — speed-weighted with rank discount
    correctAnswers.forEach((ans, rank) => {
      const player = this.players.get(ans.playerId);
      if (!player) return;

      // ── Apply Freeze Power-up ──
      let answerTime = ans.timestamp - this.questionStartTime;
      const usedFreeze = this.currentPowerups.get(ans.playerId)?.type === 'freeze';
      if (usedFreeze) {
        answerTime = Math.max(0, answerTime - 5000);
      }

      const timeRemaining = Math.max(0, totalTime - answerTime);
      let points = ScoringEngine.calculatePoints(
        timeRemaining,
        totalTime,
        rank,
        difficulty,
        player.streak
      );

      // ── Apply Double Power-up ──
      const usedDouble = this.currentPowerups.get(ans.playerId)?.type === 'double';
      if (usedDouble) {
        points *= 2;
      }

      // ── Special rounds (تحدي الثلاثين) ──
      // Golden finale: gains doubled. Bell round: fastest correct answer
      // takes an amplified pot, every other correct answer scores nothing
      // (their streak survives — they were right, just not first).
      const isBellWinner = this.currentSpecial === 'bell' && rank === 0;
      if (this.currentSpecial === 'golden') {
        points *= 2;
      } else if (this.currentSpecial === 'bell') {
        points = isBellWinner ? Math.round(points * 1.5) : 0;
      }

      player.addAnswer({
        questionIndex: this.currentQuestionIndex,
        chosenOption: ans.optionIndex,
        isCorrect: true,
        timeMs: ans.timestamp - this.questionStartTime,
        pointsEarned: points,
      });

      const powerup = this.currentPowerups.get(ans.playerId);
      playerResults.push({
        playerId: ans.playerId,
        nickname: player.nickname,
        avatar: player.avatar,
        chosenOption: ans.optionIndex,
        isCorrect: true,
        pointsEarned: points,
        newScore: player.score,
        streak: player.streak,
        answerTimeMs: ans.timestamp - this.questionStartTime,
        powerupUsed: powerup ? { type: powerup.type, targetId: powerup.targetId } : null,
        bellWinner: isBellWinner || undefined,
      });
    });

    // Wrong answers — penalty (the golden finale is risk-free: no penalty)
    wrongAnswers.forEach(ans => {
      const player = this.players.get(ans.playerId);
      if (!player) return;

      let penalty = (this.settings.penaltyEnabled && this.currentSpecial !== 'golden')
        ? ScoringEngine.calculatePenalty(totalTime, difficulty)
        : 0;

      // ── Apply Double Power-up ──
      const usedDouble = this.currentPowerups.get(ans.playerId)?.type === 'double';
      if (usedDouble) {
        penalty *= 2;
      }

      player.addAnswer({
        questionIndex: this.currentQuestionIndex,
        chosenOption: ans.optionIndex,
        isCorrect: false,
        timeMs: ans.timestamp - this.questionStartTime,
        pointsEarned: penalty,
      });

      const powerup = this.currentPowerups.get(ans.playerId);
      playerResults.push({
        playerId: ans.playerId,
        nickname: player.nickname,
        avatar: player.avatar,
        chosenOption: ans.optionIndex,
        isCorrect: false,
        pointsEarned: penalty,
        newScore: player.score,
        streak: 0,
        answerTimeMs: ans.timestamp - this.questionStartTime,
        powerupUsed: powerup ? { type: powerup.type, targetId: powerup.targetId } : null,
      });
    });

    // Active players who didn't answer (timeout) — 0 points, streak reset.
    // Spectators (eliminated / finished / presenter host) stay out of it.
    for (const player of this.players.values()) {
      if (!this._isActiveContestant(player)) continue;
      if (!this.currentAnswers.has(player.id)) {
        player.addAnswer({
          questionIndex: this.currentQuestionIndex,
          chosenOption: -1,
          isCorrect: false,
          timeMs: totalTime,
          pointsEarned: 0,
        });

        const powerup = this.currentPowerups.get(player.id);
        playerResults.push({
          playerId: player.id,
          nickname: player.nickname,
          avatar: player.avatar,
          chosenOption: -1,
          isCorrect: false,
          pointsEarned: 0,
          newScore: player.score,
          streak: 0,
          answerTimeMs: totalTime,
          powerupUsed: powerup ? { type: powerup.type, targetId: powerup.targetId } : null,
        });
      }
    }

    // ── Apply Steal Power-up ──
    for (const [playerId, powerup] of this.currentPowerups) {
      if (powerup.type === 'steal') {
        const attacker = this.players.get(playerId);
        const target = this.players.get(powerup.targetId);

        // Did the attacker answer correctly?
        const attackerAns = this.currentAnswers.get(playerId);
        const attackerCorrect = attackerAns && attackerAns.optionIndex === this.currentCorrectIndex;

        if (attackerCorrect && attacker && target) {
          const stealAmount = Math.min(150, target.score);
          if (stealAmount > 0) {
            target.score -= stealAmount;
            attacker.score += stealAmount;

            // Update in-memory answer lists so final scores match
            const attackerLastAnswer = attacker.answers[attacker.answers.length - 1];
            if (attackerLastAnswer) attackerLastAnswer.pointsEarned += stealAmount;

            const targetLastAnswer = target.answers[target.answers.length - 1];
            if (targetLastAnswer) targetLastAnswer.pointsEarned -= stealAmount;

            // Update playerResults scores to show the final state after steal
            const attackerResult = playerResults.find(r => r.playerId === playerId);
            if (attackerResult) {
              attackerResult.pointsEarned += stealAmount;
              attackerResult.newScore = attacker.score;
              attackerResult.stolenAmount = stealAmount;
            }

            const targetResult = playerResults.find(r => r.playerId === powerup.targetId);
            if (targetResult) {
              targetResult.pointsEarned -= stealAmount;
              targetResult.newScore = target.score;
              targetResult.stolenBy = attacker.nickname;
            }
          }
        }
      }
    }

    // ── Race layer: nitros/rockets land, items drop, finishers lock ──
    const itemEffects = this._resolveItems(playerResults);
    this._awardItems(playerResults);
    const finishedNow = this._checkRaceFinishes(playerResults);

    // Broadcast reveal
    this.io.to(this.code).emit('question_ended', {
      questionIndex: this.currentQuestionIndex,
      type: 'choice',
      correctIndex: this.currentCorrectIndex,
      playerResults,
      special: this.currentSpecial,
      itemEffects,
      finishedNow,
    });

    // After 4 seconds, show leaderboard
    this.revealTimer = setTimeout(() => {
      this.showLeaderboard();
    }, 4000);
  }

  // ──────────────────────────────────────────────────────────────
  //  Leaderboard
  // ──────────────────────────────────────────────────────────────

  showLeaderboard() {
    this.state = 'LEADERBOARD';
    const mode = this.settings.gameMode;

    const payload = {
      questionIndex: this.currentQuestionIndex,
      totalQuestions: this.questions.length,
      mode,
    };

    if (mode === 'teams') payload.teams = this.getTeamScores();
    if (mode === 'race') payload.targetScore = this.settings.targetScore;
    if (mode === 'chase') {
      const chaser = this.players.get(this.chaserId);
      payload.chase = {
        chaserId: this.chaserId,
        chaserPos: chaser ? chaser.chasePos : 0,
        homeStep: this.chaseHomeStep,
        headStart: this.settings.chaseHeadStart,
      };
    }

    // Survival: the axe falls after the board is settled
    if (mode === 'survival') {
      payload.eliminatedNow = this._runElimination();
      payload.aliveCount = this._aliveContestants().length;
    }

    payload.leaderboard = this.getLeaderboard();

    this.io.to(this.code).emit('leaderboard_updated', payload);

    // Auto-advance (race track & eliminations deserve a longer look)
    const dwell = (mode === 'race' || mode === 'survival') ? 6000 : 5000;
    this.leaderboardTimer = setTimeout(() => {
      this._advanceAfterLeaderboard();
    }, dwell);

    this.lastActivity = Date.now();
  }

  _aliveContestants() {
    return Array.from(this.players.values()).filter(p => this._isContestant(p) && !p.isEliminated);
  }

  /** Survival: eliminate the weakest contestant every N questions. */
  _runElimination() {
    if ((this.currentQuestionIndex + 1) % this.settings.eliminationEvery !== 0) return null;

    const alive = this._aliveContestants();
    if (alive.length <= 1) return null;

    alive.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      const ac = a.answers.filter(x => x.isCorrect).length;
      const bc = b.answers.filter(x => x.isCorrect).length;
      if (ac !== bc) return ac - bc;
      const fastest = (p) => {
        const times = p.answers.filter(x => x.isCorrect).map(x => x.timeMs);
        return times.length ? Math.min(...times) : Infinity;
      };
      return fastest(b) - fastest(a); // slower best answer goes first
    });

    const loser = alive[0];
    loser.isEliminated = true;
    loser.eliminatedRank = alive.length; // rank locks: 5 alive → they finish 5th

    const info = { player: loser.toPublic(), rank: loser.eliminatedRank };
    this.io.to(this.code).emit('player_eliminated', info);
    return info;
  }

  /** Decide what comes after the leaderboard, per mode. */
  _advanceAfterLeaderboard() {
    const mode = this.settings.gameMode;

    if (mode === 'survival' && this._aliveContestants().length <= 1) {
      this.endGame();
      return;
    }

    if (mode === 'race') {
      const unfinished = this._aliveContestants().filter(p => !p.isFinished);
      if (unfinished.length <= 1) {
        // Nobody left to race against — rank the straggler and celebrate
        for (const p of unfinished) {
          this.finishedCount += 1;
          p.isFinished = true;
          p.finishRank = this.finishedCount;
        }
        this.endGame();
        return;
      }
    }

    if (mode === 'chase') {
      const chaserAlive = this.players.has(this.chaserId) &&
        this._isContestant(this.players.get(this.chaserId));
      // The hunt ends when every runner is caught or safe — or the
      // chaser vanished from the room entirely
      if (this._activeRunners().length === 0 || !chaserAlive) {
        this.endGame();
        return;
      }
    }

    this.startNextQuestion();
  }

  getLeaderboard() {
    const mode = this.settings.gameMode;
    const players = Array.from(this.players.values()).filter(p => this._isContestant(p));

    players.sort((a, b) => {
      if (mode === 'race') {
        const ar = a.finishRank || Infinity;
        const br = b.finishRank || Infinity;
        if (ar !== br) return ar - br;       // finishers first, by finish order
        return b.score - a.score;
      }
      if (mode === 'survival') {
        if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
        if (a.isEliminated && b.isEliminated) return a.eliminatedRank - b.eliminatedRank;
        return b.score - a.score;
      }
      if (mode === 'chase') {
        // Chaser: first if they caught everyone, otherwise pinned last
        if (a.isChaser !== b.isChaser) {
          if (this.chaserWon) return a.isChaser ? -1 : 1;
          return a.isChaser ? 1 : -1;
        }
        if (a.isHome !== b.isHome) return a.isHome ? -1 : 1;
        if (a.isHome && b.isHome) return a.homeOrder - b.homeOrder;
        if (a.isCaught !== b.isCaught) return a.isCaught ? 1 : -1;
        if (a.isCaught && b.isCaught) return b.caughtOrder - a.caughtOrder; // later catch = better
        return b.chasePos - a.chasePos;
      }
      return b.score - a.score;
    });

    return players.map((p, index) => {
      const lastAnswer = p.answers[p.answers.length - 1];
      return {
        rank: index + 1,
        playerId: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        streak: p.streak,
        isConnected: p.isConnected,
        lastPointsEarned: lastAnswer ? lastAnswer.pointsEarned : 0,
        team: p.team,
        isEliminated: p.isEliminated,
        eliminatedRank: p.eliminatedRank,
        isFinished: p.isFinished,
        finishRank: p.finishRank,
        items: p.items,
        shielded: p.shielded,
        progress: mode === 'race' ? Math.min(1, p.score / this.settings.targetScore) : undefined,
        isChaser: p.isChaser,
        chasePos: p.chasePos,
        isCaught: p.isCaught,
        isHome: p.isHome,
        homeOrder: p.homeOrder,
        caughtOrder: p.caughtOrder,
        sprintUsed: p.sprintUsed,
      };
    });
  }

  // ──────────────────────────────────────────────────────────────
  //  Skip leaderboard (host manual advance)
  // ──────────────────────────────────────────────────────────────

  requestNext(requesterId) {
    if (requesterId !== this.hostId) return;
    if (this.state !== 'LEADERBOARD') return;

    clearTimeout(this.leaderboardTimer);
    this._advanceAfterLeaderboard();
  }

  // ──────────────────────────────────────────────────────────────
  //  Live host controls — pause / resume / +10s / skip / replace
  //  All of them are host-only and only touch a running question.
  // ──────────────────────────────────────────────────────────────

  _canHostControl(requesterId) {
    return requesterId === this.hostId && this.state === 'QUESTION_ACTIVE';
  }

  pauseQuestion(requesterId) {
    if (!this._canHostControl(requesterId) || this.isPaused) return;

    clearTimeout(this.questionTimer);
    this.isPaused = true;
    this.pausedRemainingMs = Math.max(0,
      (this.questionStartTime + this.questionDurationMs) - Date.now());

    this.io.to(this.code).emit('question_paused', {
      remainingMs: this.pausedRemainingMs,
    });
    this.lastActivity = Date.now();
  }

  resumeQuestion(requesterId) {
    if (!this._canHostControl(requesterId) || !this.isPaused) return;

    // Shift the reference clock so paused time counts against nobody:
    // scoring reads (timestamp − questionStartTime), so the start time and
    // every already-recorded answer move forward by the pause length.
    const newStart = Date.now() - (this.questionDurationMs - this.pausedRemainingMs);
    const shift = newStart - this.questionStartTime;
    this.questionStartTime = newStart;
    for (const a of this.currentAnswers.values()) a.timestamp += shift;

    this.isPaused = false;
    const remaining = Math.max(250, this.pausedRemainingMs);
    this.pausedRemainingMs = 0;
    this.questionTimer = setTimeout(() => {
      this.endQuestion();
    }, remaining);

    this.io.to(this.code).emit('question_resumed', {
      serverTimestamp: this.questionStartTime,
      durationMs: this.questionDurationMs,
    });

    // Everyone may have answered while the room sat frozen (disconnects)
    this.checkAllAnswered();
    this.lastActivity = Date.now();
  }

  extendQuestion(requesterId) {
    if (!this._canHostControl(requesterId)) return;
    if (this.questionDurationMs - this.settings.timerDuration >= 60000) return; // sanity cap

    this.questionDurationMs += 10000;

    if (this.isPaused) {
      this.pausedRemainingMs += 10000;
      this.io.to(this.code).emit('question_paused', {
        remainingMs: this.pausedRemainingMs,
      });
    } else {
      clearTimeout(this.questionTimer);
      const remaining = Math.max(250,
        (this.questionStartTime + this.questionDurationMs) - Date.now());
      this.questionTimer = setTimeout(() => {
        this.endQuestion();
      }, remaining);

      this.io.to(this.code).emit('timer_adjusted', {
        serverTimestamp: this.questionStartTime,
        durationMs: this.questionDurationMs,
        addedMs: 10000,
      });
    }
    this.lastActivity = Date.now();
  }

  skipQuestion(requesterId) {
    if (!this._canHostControl(requesterId)) return;

    clearTimeout(this.questionTimer);
    if (this.isPaused) {
      this.isPaused = false;
      this.pausedRemainingMs = 0;
    }
    this.endQuestion();
    this.lastActivity = Date.now();
  }

  /** Swap the running question for a fresh one; refunds burned power-ups. */
  replaceQuestion(requesterId) {
    if (!this._canHostControl(requesterId)) return;
    if (this.tiebreaker) return; // the duel draws its own questions

    const current = this.questions[this.currentQuestionIndex];
    const isGuess = current.type === 'guess';

    // Fresh unused question of the same kind, preferring the same difficulty
    const used = new Set([...this.questions, ...this._usedTiebreakerQs]);
    let pool = allQuestions.filter(q => !used.has(q) &&
      (isGuess
        ? q.type === 'guess'
        : q.type !== 'guess' && this.settings.categories.includes(q.category)));
    const sameDiff = pool.filter(q => q.difficulty === current.difficulty);
    if (sameDiff.length > 0) pool = sameDiff;

    if (pool.length === 0) {
      const hostSocket = this.findSocket(requesterId);
      if (hostSocket) hostSocket.emit('error', { message: 'no_replacement_available' });
      return;
    }

    // Refund anything burned on the discarded question
    for (const [pid, pu] of this.currentPowerups) {
      const p = this.players.get(pid);
      if (!p) continue;
      p.powerups[pu.type] = 1;
      p.powerupsUsedCount = Math.max(0, p.powerupsUsedCount - 1);
      this.io.to(this.code).emit('player_updated', { player: p.toPublic() });
    }
    for (const [pid, it] of this.currentItems) {
      const p = this.players.get(pid);
      if (!p) continue;
      if (it.type === 'sprint') {
        p.sprintUsed = false;
      } else if (p.items[it.type] !== undefined) {
        p.items[it.type] += 1;
        if (it.type === 'shield') p.shielded = false;
      }
      this.io.to(this.code).emit('player_updated', { player: p.toPublic() });
    }

    const q = pool[Math.floor(Math.random() * pool.length)];
    this.questions[this.currentQuestionIndex] = q;

    clearTimeout(this.questionTimer);
    this.isPaused = false;
    this.pausedRemainingMs = 0;

    this.io.to(this.code).emit('question_replaced', {
      questionIndex: this.currentQuestionIndex,
    });
    this._launchQuestion(q, {
      special: this.currentSpecial,
      questionIndex: this.currentQuestionIndex,
      totalQuestions: this.questions.length,
    });
  }

  // ──────────────────────────────────────────────────────────────
  //  Game end
  // ──────────────────────────────────────────────────────────────

  endGame() {
    clearTimeout(this.questionTimer);
    clearTimeout(this.revealTimer);
    clearTimeout(this.leaderboardTimer);

    // ── جولة الحسم — sudden-death decider ─────────────────────
    // Classic: tied top players duel. Teams: tied teams send their top
    // scorers to duel for the crown. Race/survival can't tie by design.
    if (!this.tiebreaker && !this.tiebreakerDone) {
      const mode = this.settings.gameMode;

      if (mode === 'classic') {
        const lb = this.getLeaderboard();
        if (lb.length >= 2 && lb[0].score > 0 && lb[0].score === lb[1].score) {
          const topScore = lb[0].score;
          const tiedIds = lb
            .filter(e => e.score === topScore)
            .map(e => e.playerId)
            .filter(id => {
              const p = this.players.get(id);
              return p && p.isConnected;
            });

          if (tiedIds.length >= 2) {
            this._startTiebreaker(tiedIds);
            return;
          }
        }
      } else if (mode === 'teams') {
        const teams = this.getTeamScores();
        if (teams.length === 2 && teams[0].score > 0 && teams[0].score === teams[1].score) {
          const champions = teams
            .map(t => t.members.find(m => {
              const p = this.players.get(m.id);
              return p && p.isConnected;
            }))
            .filter(Boolean)
            .map(m => m.id);

          if (champions.length === 2) {
            this._startTiebreaker(champions);
            return;
          }
        }
      }
      this.tiebreakerDone = true;
    }

    this.state = 'GAME_END';

    const mode = this.settings.gameMode;
    if (mode === 'teams') {
      this.winnerTeam = this.getTeamScores()[0].team;
    }

    if (mode === 'chase') {
      // Runners still on the board at the cap escape with their lives
      for (const p of this._activeRunners()) {
        p.isHome = true;
        this.homeCount += 1;
        p.homeOrder = this.homeCount;
      }
      const runners = Array.from(this.players.values())
        .filter(p => this._isContestant(p) && !p.isChaser);
      this.chaserWon = runners.length > 0 && runners.every(p => p.isCaught);
    }

    const finalResults = this.computeFinalStats();

    this.io.to(this.code).emit('game_ended', {
      mode,
      leaderboard: this.getLeaderboard(),
      stats: finalResults,
      awards: this.computeAwards(finalResults),
      tiebreakerWinnerId: this.tiebreakerWinnerId,
      teams: mode === 'teams' ? this.getTeamScores() : null,
      winnerTeam: this.winnerTeam,
      targetScore: mode === 'race' ? this.settings.targetScore : null,
      chase: mode === 'chase'
        ? { chaserId: this.chaserId, chaserWon: this.chaserWon, homeStep: this.chaseHomeStep }
        : null,
    });

    this.lastActivity = Date.now();
  }

  // ──────────────────────────────────────────────────────────────
  //  Decider duel (جولة الحسم)
  // ──────────────────────────────────────────────────────────────

  _startTiebreaker(tiedIds) {
    this.tiebreaker = { eligibleIds: tiedIds, round: 1 };

    const duelists = tiedIds.map(id => {
      const p = this.players.get(id);
      return { playerId: id, nickname: p.nickname, avatar: p.avatar, score: p.score };
    });

    this.state = 'TIEBREAKER_INTRO';
    this.io.to(this.code).emit('tiebreaker_starting', { players: duelists, countdown: 3 });

    this.startingTimer = setTimeout(() => {
      this._startTiebreakerQuestion();
    }, 3500);

    this.lastActivity = Date.now();
  }

  _pickTiebreakerQuestion() {
    this._usedTiebreakerQs = this._usedTiebreakerQs || [];
    const used = new Set([...this.questions, ...this._usedTiebreakerQs]);

    // Prefer unused hard 4-option questions; degrade gracefully.
    // (Guess questions carry no options array — they never qualify.)
    const isChoice4 = q => q.type !== 'guess' && Array.isArray(q.options) && q.options.length === 4;
    let pool = allQuestions.filter(q => !used.has(q) && isChoice4(q));
    const hard = pool.filter(q => q.difficulty === 'hard');
    if (hard.length > 0) pool = hard;
    if (pool.length === 0) pool = allQuestions.filter(isChoice4);
    if (pool.length === 0) return null;

    const q = pool[Math.floor(Math.random() * pool.length)];
    this._usedTiebreakerQs.push(q);
    return q;
  }

  _startTiebreakerQuestion() {
    const q = this._pickTiebreakerQuestion();
    if (!q || !this.tiebreaker) {
      this.tiebreakerDone = true;
      this.tiebreaker = null;
      this.endGame();
      return;
    }

    this._launchQuestion(q, {
      special: 'tiebreaker',
      questionIndex: this.currentQuestionIndex,
      totalQuestions: this.questions.length,
    });
  }

  _endTiebreakerQuestion() {
    clearTimeout(this.questionTimer);
    this.state = 'REVEAL';

    // Fastest correct answer among the duelists wins
    let winner = null;
    let winnerTime = Infinity;
    for (const [pid, ans] of this.currentAnswers) {
      if (ans.optionIndex === this.currentCorrectIndex && ans.timestamp < winnerTime) {
        const p = this.players.get(pid);
        if (p) {
          winner = p;
          winnerTime = ans.timestamp;
        }
      }
    }

    // Build reveal results for the duelists (no answer-history mutation —
    // the duel must not distort accuracy/awards stats)
    const playerResults = [];
    for (const pid of this.tiebreaker.eligibleIds) {
      const p = this.players.get(pid);
      if (!p) continue;
      const ans = this.currentAnswers.get(pid);
      const isCorrect = Boolean(ans) && ans.optionIndex === this.currentCorrectIndex;

      playerResults.push({
        playerId: pid,
        nickname: p.nickname,
        avatar: p.avatar,
        chosenOption: ans ? ans.optionIndex : -1,
        isCorrect,
        pointsEarned: 0,
        newScore: p.score,
        streak: p.streak,
        answerTimeMs: ans ? ans.timestamp - this.questionStartTime : this.questionDurationMs,
        powerupUsed: null,
      });
    }

    if (winner) {
      winner.score += 50; // decider bonus — breaks the tie visibly
      this.tiebreakerWinnerId = winner.id;
      const r = playerResults.find(x => x.playerId === winner.id);
      if (r) {
        r.pointsEarned = 50;
        r.newScore = winner.score;
        r.tiebreakerWinner = true;
      }
    }

    this.io.to(this.code).emit('question_ended', {
      questionIndex: this.currentQuestionIndex,
      correctIndex: this.currentCorrectIndex,
      playerResults,
      special: 'tiebreaker',
      tiebreakerWinner: winner
        ? { playerId: winner.id, nickname: winner.nickname, avatar: winner.avatar }
        : null,
    });

    this.revealTimer = setTimeout(() => {
      if (winner || this.tiebreaker.round >= 3) {
        // Duel decided (or 3 dry rounds → accept co-champions)
        this.tiebreakerDone = true;
        this.tiebreaker = null;
        this.currentSpecial = null;
        this.endGame();
      } else {
        this.tiebreaker.round += 1;
        this._startTiebreakerQuestion();
      }
    }, 4000);

    this.lastActivity = Date.now();
  }

  // ──────────────────────────────────────────────────────────────
  //  Awards (جوائز نهاية الحفلة)
  // ──────────────────────────────────────────────────────────────

  computeAwards(stats) {
    const awards = [];

    // أسرع إصبع — fastest correct answer of the night
    const withCorrect = stats.filter(s => s.fastestAnswerMs !== null);
    if (withCorrect.length > 0) {
      const fastest = withCorrect.reduce((a, b) => (b.fastestAnswerMs < a.fastestAnswerMs ? b : a));
      awards.push({
        type: 'speed_demon',
        playerId: fastest.playerId,
        nickname: fastest.nickname,
        avatar: fastest.avatar,
        value: (fastest.fastestAnswerMs / 1000).toFixed(1) + 's',
      });
    }

    // القنّاص — best accuracy (min 50% and at least one correct)
    const byAccuracy = stats
      .filter(s => s.totalCorrect > 0 && s.accuracy >= 50)
      .sort((a, b) => b.accuracy - a.accuracy || b.score - a.score);
    if (byAccuracy.length > 0) {
      awards.push({
        type: 'sharpshooter',
        playerId: byAccuracy[0].playerId,
        nickname: byAccuracy[0].nickname,
        avatar: byAccuracy[0].avatar,
        value: byAccuracy[0].accuracy + '%',
      });
    }

    // ملك السلسلة — longest streak (min 3)
    const byStreak = stats
      .filter(s => s.longestStreak >= 3)
      .sort((a, b) => b.longestStreak - a.longestStreak);
    if (byStreak.length > 0) {
      awards.push({
        type: 'streak_master',
        playerId: byStreak[0].playerId,
        nickname: byStreak[0].nickname,
        avatar: byStreak[0].avatar,
        value: '×' + byStreak[0].longestStreak,
      });
    }

    // جوائز المطاردة — the apex chaser & the escape king
    if (this.settings.gameMode === 'chase') {
      const chaser = this.players.get(this.chaserId);
      if (chaser && this.chaserWon) {
        awards.push({
          type: 'predator',
          playerId: chaser.id,
          nickname: chaser.nickname,
          avatar: chaser.avatar,
          value: '×' + this.caughtCount,
        });
      }
      let firstHome = null;
      for (const p of this.players.values()) {
        if (p.homeOrder === 1) { firstHome = p; break; }
      }
      if (firstHome) {
        awards.push({
          type: 'escape_artist',
          playerId: firstHome.id,
          nickname: firstHome.nickname,
          avatar: firstHome.avatar,
          value: '#1',
        });
      }
    }

    // مدمّر المضمار — most rocket hits (race mode, min 1)
    if (this.settings.gameMode === 'race') {
      let demo = null;
      for (const p of this.players.values()) {
        if (!this._isContestant(p)) continue;
        if (p.rocketsLanded >= 1 && (!demo || p.rocketsLanded > demo.rocketsLanded)) {
          demo = p;
        }
      }
      if (demo) {
        awards.push({
          type: 'demolition',
          playerId: demo.id,
          nickname: demo.nickname,
          avatar: demo.avatar,
          value: '×' + demo.rocketsLanded,
        });
      }
    }

    // المخطّط — most power-ups burned (min 2)
    let tactician = null;
    for (const p of this.players.values()) {
      if (!this._isContestant(p)) continue;
      if (p.powerupsUsedCount >= 2 && (!tactician || p.powerupsUsedCount > tactician.powerupsUsedCount)) {
        tactician = p;
      }
    }
    if (tactician) {
      awards.push({
        type: 'tactician',
        playerId: tactician.id,
        nickname: tactician.nickname,
        avatar: tactician.avatar,
        value: '×' + tactician.powerupsUsedCount,
      });
    }

    // نجم التفاعل — most emoji reactions (min 5)
    let entertainer = null;
    for (const p of this.players.values()) {
      if (!this._isContestant(p)) continue;
      if (p.reactionsSent >= 5 && (!entertainer || p.reactionsSent > entertainer.reactionsSent)) {
        entertainer = p;
      }
    }
    if (entertainer) {
      awards.push({
        type: 'entertainer',
        playerId: entertainer.id,
        nickname: entertainer.nickname,
        avatar: entertainer.avatar,
        value: '×' + entertainer.reactionsSent,
      });
    }

    return awards;
  }

  computeFinalStats() {
    const stats = [];

    for (const player of this.players.values()) {
      if (!this._isContestant(player)) continue;
      const answers = player.answers;
      const correct = answers.filter(a => a.isCorrect);
      const accuracy = answers.length > 0
        ? Math.round((correct.length / answers.length) * 100)
        : 0;

      const fastestAnswer = correct.length > 0
        ? Math.min(...correct.map(a => a.timeMs))
        : null;

      // Calculate longest streak
      let longestStreak = 0;
      let currentStreak = 0;
      for (const a of answers) {
        if (a.isCorrect) {
          currentStreak++;
          longestStreak = Math.max(longestStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      }

      stats.push({
        playerId: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        score: player.score,
        accuracy,
        fastestAnswerMs: fastestAnswer,
        longestStreak,
        totalCorrect: correct.length,
        totalQuestions: answers.length,
        team: player.team,
        finishRank: player.finishRank,
        eliminatedRank: player.eliminatedRank,
        rocketsLanded: player.rocketsLanded,
      });
    }

    // Sort by score descending
    stats.sort((a, b) => b.score - a.score);
    return stats;
  }

  // ──────────────────────────────────────────────────────────────
  //  Rematch
  // ──────────────────────────────────────────────────────────────

  rematch(requesterId) {
    if (requesterId !== this.hostId) return;
    if (this.state !== 'GAME_END') return;

    // Clear all timers
    clearTimeout(this.questionTimer);
    clearTimeout(this.revealTimer);
    clearTimeout(this.leaderboardTimer);
    clearTimeout(this.startingTimer);

    // Reset state
    this.state = 'LOBBY';
    this.locked = false;
    this.currentQuestionIndex = -1;
    this.currentQuestion = null;
    this.currentCorrectIndex = -1;
    this.currentAnswers = new Map();
    this.questions = [];
    this.bellIndex = -1;
    this.currentSpecial = null;
    this.tiebreaker = null;
    this.tiebreakerWinnerId = null;
    this.tiebreakerDone = false;
    this._usedTiebreakerQs = [];
    this.currentItems = new Map();
    this.finishedCount = 0;
    this.winnerTeam = null;
    this.homeCount = 0;
    this.caughtCount = 0;
    this.chaserWon = false;
    this.isPaused = false;
    this.pausedRemainingMs = 0;

    // Reset all player scores
    for (const player of this.players.values()) {
      player.resetForNewGame();
    }

    this.io.to(this.code).emit('rematch_started', {
      roomState: this.getState(),
    });

    this.lastActivity = Date.now();
  }

  // ──────────────────────────────────────────────────────────────
  //  State snapshot (for reconnection / initial join)
  // ──────────────────────────────────────────────────────────────

  getState() {
    const players = [];
    for (const p of this.players.values()) {
      players.push(p.toPublic());
    }

    const state = {
      code: this.code,
      state: this.state,
      locked: this.locked,
      settings: this.settings,
      players,
      hostId: this.hostId,
    };

    state.mode = this.settings.gameMode;

    // Include current game info if in-game
    if (this.state === 'QUESTION_ACTIVE' && this.currentQuestion) {
      state.currentQuestion = {
        questionIndex: this.currentQuestionIndex,
        totalQuestions: this.questions.length,
        type: this.currentQuestion.type,
        category: this.currentQuestion.category,
        difficulty: this.currentQuestion.difficulty,
        question: this.currentQuestion.question,
        options: this.currentQuestion.options,
        unit: this.currentQuestion.unit,
        serverTimestamp: this.questionStartTime,
        durationMs: this.questionDurationMs,
        paused: this.isPaused,
        pausedRemainingMs: this.pausedRemainingMs,
        answeredCount: this.currentAnswers.size,
        special: this.currentSpecial,
        eligibleIds: this.tiebreaker ? this.tiebreaker.eligibleIds : null,
        mode: this.settings.gameMode,
        targetScore: this.settings.gameMode === 'race' ? this.settings.targetScore : null,
      };
    }

    if (this.state === 'LEADERBOARD' || this.state === 'REVEAL' || this.state === 'TIEBREAKER_INTRO') {
      state.leaderboard = this.getLeaderboard();
      state.currentQuestionIndex = this.currentQuestionIndex;
      state.totalQuestions = this.questions.length;
      if (this.settings.gameMode === 'teams') state.teams = this.getTeamScores();
      if (this.settings.gameMode === 'race') state.targetScore = this.settings.targetScore;
      if (this.settings.gameMode === 'chase') {
        const ch = this.players.get(this.chaserId);
        state.chase = {
          chaserId: this.chaserId,
          chaserPos: ch ? ch.chasePos : 0,
          homeStep: this.chaseHomeStep,
          headStart: this.settings.chaseHeadStart,
        };
      }
    }

    if (this.state === 'GAME_END') {
      state.leaderboard = this.getLeaderboard();
      state.stats = this.computeFinalStats();
      state.awards = this.computeAwards(state.stats);
      state.tiebreakerWinnerId = this.tiebreakerWinnerId;
      state.teams = this.settings.gameMode === 'teams' ? this.getTeamScores() : null;
      state.winnerTeam = this.winnerTeam;
      state.targetScore = this.settings.gameMode === 'race' ? this.settings.targetScore : null;
      state.chase = this.settings.gameMode === 'chase'
        ? { chaserId: this.chaserId, chaserWon: this.chaserWon, homeStep: this.chaseHomeStep }
        : null;
    }

    return state;
  }

  // ──────────────────────────────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────────────────────────────

  findSocket(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;

    const socket = this.io.sockets.sockets.get(player.socketId);
    return socket || null;
  }

  shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

module.exports = GameRoom;
