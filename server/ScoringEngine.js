/**
 * ScoringEngine.js — All scoring logic for the trivia game.
 *
 * Every function is pure (no side-effects, no state).  The engine
 * is consumed by GameRoom when a question ends and results are
 * tallied for each player.
 *
 * Points formula
 * ──────────────
 *   base   = max(100, round(1000 × timeRemaining / totalTime))
 *   ranked = base × max(0.85, 1 − rank × 0.03)
 *   final  = round(ranked × difficultyMult × streakMult)
 *
 * Penalty formula
 * ───────────────
 *   penalty = −round(250 × difficultyMultiplier)
 *   (25 % of the maximum base — floor enforced in GameRoom)
 */

'use strict';

// ── Difficulty multipliers ─────────────────────────────────────
const DIFFICULTY_MULTIPLIERS = {
  easy:   1.0,
  medium: 1.5,
  hard:   2.0,
};

/**
 * Return the multiplier for the given difficulty string.
 * Falls back to 1.0 for unknown values.
 *
 * @param {string} difficulty - "easy" | "medium" | "hard"
 * @returns {number}
 */
function getDifficultyMultiplier(difficulty) {
  return DIFFICULTY_MULTIPLIERS[difficulty] || 1.0;
}

/**
 * Return the streak bonus multiplier.
 *   streak < 3  → 1.0  (no bonus)
 *   streak 3-4  → 1.1
 *   streak 5-6  → 1.2
 *   streak 7+   → 1.3
 *
 * @param {number} streak - consecutive correct answers *before* this one
 * @returns {number}
 */
function getStreakMultiplier(streak) {
  if (streak >= 7) return 1.3;
  if (streak >= 5) return 1.2;
  if (streak >= 3) return 1.1;
  return 1.0;
}

/**
 * Calculate points earned for a correct answer.
 *
 * @param {number} timeRemainingMs   - milliseconds left on the clock
 * @param {number} totalTimeMs       - total question timer (ms)
 * @param {number} correctAnswerRank - 0-indexed position among correct
 *                                      answers sorted by answer time
 * @param {string} difficulty        - "easy" | "medium" | "hard"
 * @param {number} currentStreak     - player's streak *before* this answer
 * @returns {number} positive integer (always ≥ 1 for a correct answer)
 */
function calculatePoints(
  timeRemainingMs,
  totalTimeMs,
  correctAnswerRank,
  difficulty,
  currentStreak
) {
  // Guard: totalTimeMs must be positive to avoid division by zero
  if (totalTimeMs <= 0) return 0;

  // 1. Speed-weighted base (100–1000)
  const ratio = Math.max(0, Math.min(1, timeRemainingMs / totalTimeMs));
  const base  = Math.max(100, Math.round(1000 * ratio));

  // 2. Rank discount — later correct answers get a small penalty
  const rankFactor = Math.max(0.85, 1 - correctAnswerRank * 0.03);

  // 3. Difficulty multiplier
  const diffMult = getDifficultyMultiplier(difficulty);

  // 4. Streak bonus
  const streakMult = getStreakMultiplier(currentStreak);

  // 5. Combine and round
  const points = Math.round(base * rankFactor * diffMult * streakMult);

  // Always award at least 1 point for a correct answer
  return Math.max(1, points);
}

/**
 * Calculate the penalty for a wrong answer (negative number).
 *
 * @param {number} totalTimeMs  - total question timer (ms), unused but
 *                                 kept for API symmetry / future tuning
 * @param {string} difficulty   - "easy" | "medium" | "hard"
 * @returns {number} negative integer (e.g. -250, -375, -500)
 */
function calculatePenalty(totalTimeMs, difficulty) {
  const diffMult = getDifficultyMultiplier(difficulty);
  return -Math.round(250 * diffMult);
}

// ── Export ──────────────────────────────────────────────────────
module.exports = {
  calculatePoints,
  calculatePenalty,
  getStreakMultiplier,
  getDifficultyMultiplier,
};
