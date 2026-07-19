# Trivia Party — Improvement Plan
### Usability + Realistic Visuals & Motion

> ملخص بالعربي: هذي خطة عملية لتحسين اللعبة في اتجاهين — (1) **سهولة الاستخدام** للمضيف واللاعبين، و(2) **واقعية الصورة والحركة** (أنيميشن، فيزياء، عمق ثلاثي الأبعاد، صوت متزامن). كل بند مرتّب حسب الأثر/الجهد، ومربوط بالملفّات الحقيقية في المشروع. الـ prompt الجاهز بالإنجليزي في ملف `BUILD-PROMPT.md`.

This plan is written to be handed directly to an AI coding agent (Cursor / Claude Code) alongside `BUILD-PROMPT.md`. It is grounded in the current code, not generic advice.

---

## 0. Where the project stands today (audit)

**Architecture (solid — do not rewrite):**
- Server-authoritative state machine in `server/GameRoom.js` (2135 lines): `LOBBY → STARTING → QUESTION_ACTIVE → REVEAL → LEADERBOARD → … → GAME_END`, plus special rounds (golden, bell, tiebreaker) and 5 modes (classic, teams, survival, race, chase).
- Central server timer prevents cheating; correct answer withheld until `REVEAL`.
- Pure scoring in `server/ScoringEngine.js` (speed + rank discount + difficulty + streak).
- Vanilla-JS frontend (`public/js/screens/*.js`), no framework, no CDN — works offline on LAN.
- 375+ questions across 9 categories (`server/questions/*.json`); bilingual AR/EN with full RTL.

**Visual/motion reality check (this is the gap the user cares about):**
- The "3D" race and chase are **CSS-perspective pseudo-3D** — `perspective: 560px; rotateX(); preserve-3d` in `public/css/race.css` and `chase.css`. There is **no canvas, no WebGL, no physics engine** anywhere (`grep` for `getContext`/`<canvas>` returns nothing).
- Motion is almost entirely **CSS `@keyframes`** (27 keyframes in `animations.css`) with only a little `requestAnimationFrame` (in `leaderboard.js`, `question.js`, `utils.js`).
- Avatars are **static SVG** with keyframe blink/bounce/droop (`av-blink`, `av-bounce`, `av-droop`).
- Only **5 `prefers-reduced-motion` guards** exist across the whole codebase — motion is not adaptive, and low-end phones can stutter with no fallback.
- Movement is **discrete/stepwise** (race positions jump on reveal; chase moves in whole board steps) — it reads as "snapping," not "moving."

**Usability reality check:**
- Host has **no live controls** while a question is running — no pause, no skip, no extend time, no "replace this question." Once `startGame` fires, the flow is on rails (`requestNext` only skips the leaderboard dwell).
- Settings all live in the lobby; a wrong choice means ending the game and starting over.
- Join flow is code + avatar + nickname; good, but no room-name preview, no "recently played with" list, no spectator link.
- No in-game help/legend for power-ups, items, or mode rules — new players learn by losing.
- Reconnection exists (60s window) but there's no clear UI affordance explaining it.

---

## 1. USABILITY improvements (prioritized)

### Tier A — highest impact, low/medium effort
1. **Live host control bar** (in-game). Add host-only controls during `QUESTION_ACTIVE` / `REVEAL`: **Pause/Resume**, **Skip question**, **+10s extend**, and **Replace question** (swap the current item for a fresh one from the pool). Server: new socket events (`host_pause`, `host_resume`, `host_skip`, `host_extend`, `host_replace`) validated against `hostId` + current `state`, pausing/adjusting `questionTimer` and re-emitting `question_started`/a `timer_adjusted` event. This is the single biggest "feels like a real host" upgrade.
2. **Setting presets / one-tap game modes.** Add 3–4 named presets in the lobby ("Family Night," "Quick 5," "Football Derby," "TV Show") that set mode + categories + timer + rounds + theme in one tap. Reduces the settings wall for casual hosts.
3. **In-lobby rules & power-up legend.** A collapsible "How to play" card per selected mode (classic vs race vs chase vs survival) with the power-up/item icons and what they do. Kills the "learn by losing" problem.
4. **Answer confirmation & lock feedback.** On the player phone, make the selected answer state unmistakable (big check, haptic `navigator.vibrate`, "Locked ✓" label). Today the ack is subtle. Also show a clear "waiting for others… 4/6 answered" state.
5. **Connection status affordance.** A persistent small pill ("Reconnecting… you keep your points") when the socket drops, tied to the existing 60s rejoin logic, so players don't panic and rejoin as a new person.

### Tier B — medium impact
6. **Spectator / cast link.** A read-only URL that shows only the stage (question + timer + stats) — great for a TV/projector and for streaming. The vision doc already lists this; it rides on the existing `displayMode`.
7. **Kick/mute reactions & name filter.** Server-side profanity/length filter on nicknames (already length-checked client-side; enforce on server in `joinRoom`). Add host toggle to mute the emoji layer if it gets spammy.
8. **Question difficulty/timer per-mode memory.** Persist the host's last-used settings in `localStorage` (a `trivia_profile`-style blob already exists for nickname/avatar — extend it) so repeat hosting is one tap.
9. **Post-game shareable result card** (Canvas → PNG) instead of text share — much higher re-share rate in group chats.

### Tier C — polish
10. **Onboarding coach-marks** the first time a player sees a new mode.
11. **Bigger tap targets & safe-area insets** for small phones (iOS notch / Android gesture bar): audit `components.css` answer buttons.
12. **Sound + reader controls** surfaced more clearly on the host device (reader on/off, volume) — the engine exists in `sound.js`.

---

## 2. REALISTIC VISUALS & MOTION (the user's main focus)

Goal: make movement, depth, and feedback feel **physical and broadcast-grade**, not "cartoon CSS snapping." Order matters — do the cheap wins before the heavy engine work.

### Tier A — cheap wins, big perceived realism (pure CSS/JS, no new deps)
1. **Interpolated (tweened) motion everywhere.** Replace discrete jumps with eased tweens driven by `requestAnimationFrame`:
   - Race cars should **glide** from old position to new over ~800ms with an ease-out curve, not snap on reveal (`race.css` / `race.js`).
   - Chase pawns should **walk** step-by-step with a settle bounce (`chase.css`).
   - Score numbers should **count up** (some count-up exists in `leaderboard.js` — extend it to all score displays and make it easing-based).
2. **Spring/tactile easing.** Swap linear/`ease` for spring-like `cubic-bezier` (e.g. overshoot `cubic-bezier(.34,1.56,.64,1)`) on answer buttons, cards, crowns, and reveals so UI elements feel weighted.
3. **Physics-based confetti & particles on `<canvas>`.** The win/celebration currently uses CSS `pillar-rise`/`crown-drop`. Add a lightweight canvas confetti with gravity, drag, and rotation for game-over and correct-answer bursts — the single most "real" upgrade for the money.
4. **Depth cues on the pseudo-3D track.** Add **motion parallax**, ground **shadows under cars/pawns**, a subtle **speed-blur** (CSS `filter: blur` scaled by delta) and **fog gradient** near the horizon so the existing `perspective` track reads as real distance. Camera should **ease-follow** the leader instead of a static view.
5. **Timer that breathes.** Make the countdown ring a smooth `requestAnimationFrame` sweep (not a stepped CSS animation) with a heartbeat scale-pulse in the last 5s synced to the existing tick sound (`timer-panic` keyframe already hints at this).

### Tier B — richer motion (still no heavy 3D engine)
6. **Rigged avatar reactions.** Drive the SVG avatars with more states: lean-in while thinking, fist-pump on correct, slump on wrong, nervous shake in the last seconds — extend `av-*` keyframes and trigger them from result events. Add per-avatar accent color glow.
7. **Sound-synced motion.** Tie key animations to the WebAudio events in `sound.js` (impact frame on "correct," a whoosh on car boost, a thud on rocket hit) so audio and motion land on the same frame — this is what makes it feel produced.
8. **Broadcast reveal choreography.** Stagger the answer reveal (dim wrong options, then punch-in the correct one, then bars grow) with proper timing curves, like a TV show reveal, instead of everything appearing at once (`reveal.js`).
9. **Screen-shake & impact flashes** (subtle, opt-out) on rocket hits, catches, and eliminations for weight.

### Tier C — optional true-3D upgrade (bigger effort, keep it behind a flag)
10. **Three.js race/chase renderer** (r128 via a single self-hosted file, staying CDN-free per the project's offline rule). Real 3D cars on a real track with lighting, real depth, and a chase camera. Ship it as an **opt-in "HD arena" toggle** with the current CSS version as the guaranteed fallback for weak devices. Do **not** make it the default — the offline/low-end promise is a core feature.

### Cross-cutting (do these alongside Tier A/B — non-negotiable for "realistic *and* usable")
- **Respect `prefers-reduced-motion` everywhere** (only 5 guards today). Every new animation needs a reduced-motion fallback.
- **FPS-adaptive quality.** Measure frame time with `requestAnimationFrame`; if it drops below ~45fps, automatically shed particles/blur/parallax (the vision doc explicitly wants this). Guarantees smoothness on cheap phones — jank is the #1 enemy of "realism."
- **GPU-friendly animation.** Animate only `transform`/`opacity`, add `will-change` deliberately, avoid layout-triggering properties, and cap devicePixelRatio for the confetti canvas.

---

## 3. Suggested sequencing (2 sprints)

**Sprint 1 — "Feels real, plays smooth" (visuals/motion + core UX):**
Interpolated motion (2.A.1), spring easing (2.A.2), canvas confetti (2.A.3), track depth cues (2.A.4), smooth timer (2.A.5), `prefers-reduced-motion` + FPS-adaptive pass (cross-cutting), plus the **live host control bar** (1.A.1) and **answer-lock feedback** (1.A.4).

**Sprint 2 — "Broadcast polish + retention":**
Rigged avatars (2.B.6), sound-synced motion (2.B.7), broadcast reveal choreography (2.B.8), spectator link (1.B.6), presets & rules legend (1.A.2/1.A.3), shareable result card (1.B.9). The optional Three.js "HD arena" (2.C.10) is a stretch goal behind a flag.

---

## 4. Guardrails (keep these true no matter what)
- **Server stays authoritative.** All timing/scoring/correctness decisions remain in `GameRoom.js`. Visual changes are client-only unless they add a host control, which must be host-validated server-side.
- **Offline-first / no CDN.** Any new asset (incl. a 3D lib) is self-hosted in `public/`.
- **Bilingual + RTL preserved.** Every new string goes through `i18n` and `lang/ar.json` + `lang/en.json`; test in RTL.
- **Backward-compatible events.** New socket events are additive; existing clients must not break mid-game.
- **Every change ships with a reduced-motion + low-FPS fallback.**
