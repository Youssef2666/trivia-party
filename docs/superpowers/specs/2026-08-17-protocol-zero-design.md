# Protocol: Zero — Design Specification

**Date:** 2026-08-17  
**Status:** Approved for implementation  
**Product:** Trivia Party / party-game platform  
**Players:** 2–5  
**Session length:** 10–15 minutes

## Purpose

Add one premium, non-trivia party-game mode that proves the product can expand beyond questions without rewriting or destabilizing the five existing modes. The mode must reduce repetition by mixing cooperation, secret information, social deception, and cinematic decisions while keeping phone interaction limited to simple buttons.

UI/UX quality is the primary success criterion. A working but visually generic, confusing, inaccessible, or fragile implementation is not acceptable.

## Game Concept

Protocol: Zero places the players on a failing space station. The crew must survive six crises while protecting two shared resources:

- **Reactor stability:** determines whether the station survives.
- **Trust:** controls clue quality, coordination benefits, and the final outcome.

The shared display presents the current crisis, countdown, crew readiness, shared meters, and cinematic consequences. Each phone privately presents the player's role, private instruction, and two or three large action buttons. Players discuss the crisis, choose secretly, and then watch the aggregated result on the shared display. Individual choices are not disclosed unless a game effect explicitly reveals them.

### Match Loop

1. **Briefing:** Assign roles, show the shared objective, and privately explain each player's power.
2. **Crisis intro:** The display presents the next failure and the current station state.
3. **Discussion:** Players have a short period to talk before private choices lock.
4. **Secret decision:** Each phone chooses one role-aware action and confirms it.
5. **Resolution:** The server evaluates the combined actions, applies role and corruption effects, and emits a cinematic reveal.
6. **Investigation:** After every second crisis, players vote on one suspect. Quarantine disables only that player's special power for the next crisis; nobody is eliminated.
7. **Finale:** The sixth crisis branches according to stability, trust, prior sacrifices, and corruption progress.

### Player-Count Rules

- **Two players — Anomaly rules:** Both players are crew. The system injects misleading or conflicting private instructions so they must decide what to trust without making one human traitor obvious.
- **Three to five players — Infiltrator rules:** Exactly one player is the secret infiltrator. Their legal action set overlaps with crew actions so sabotage is deniable. The infiltrator wins by causing station failure or meeting the corruption objective without being contained.

### Roles

The first release contains five roles, one per possible player slot:

- **Energy Engineer:** Manipulates reactor stability and emergency power.
- **Systems Analyst:** Inspects logs and improves the reliability of clues.
- **Navigator:** Changes crisis order or mitigates a future crisis.
- **Security Officer:** Scans suspicious actions and controls quarantine strength.
- **Field Medic:** Protects a role power or restores trust after a failed crisis.

Each role has one clearly labeled power usable once per match. The power must never require typing, drawing, microphone, or camera access.

### Content Scope

- 12 authored crisis scenarios; 6 are selected per match.
- Role-aware action variants for every crisis.
- 5 roles and 5 one-use role powers.
- Investigation after crises 2 and 4.
- 3 ending classes: full rescue, unstable escape, and infiltrator victory.
- Arabic and English copy with full RTL/LTR behavior.

Random selection uses a seeded random source so server tests can reproduce every outcome.

## UI/UX Design

### Information Architecture

Information is deliberately split by device:

- **Shared display:** public state, crisis narrative, countdown, readiness, results, and dramatic transitions.
- **Player phone:** private role, private instruction, available actions, confirmation, connection state, and personal feedback.

The display must never reveal private instructions or the infiltrator. The phone must not duplicate public visual noise that is already visible on the display.

### Visual Direction

The approved direction is a restrained cinematic science-fiction control room:

- Near-black navy background with mint/cyan for safe state, violet for system state, and coral-red for danger.
- A central reactor visualization is the dominant shared-display object.
- Typography uses the bundled Cairo family for Arabic and Latin to preserve offline operation.
- Glass and glow are used to establish depth, but every decorative effect must support hierarchy or state.
- Color is always paired with a symbol and text label.

### Interaction Rules

- Phone actions use large touch targets with explicit selected and confirmed states.
- A player may change selection until pressing Confirm or until the server deadline expires.
- Confirmation triggers optional light haptic feedback; it never reveals the decision to other players.
- The display shows readiness, not choice content.
- No player is removed from participation at any point.
- All motion has a reduced-motion alternative that keeps opacity and color feedback while removing large transforms and continuous effects.
- Sound and haptics are optional and independently controllable.

### Responsive and Accessibility Requirements

- Support current mobile portrait viewports from 320 CSS pixels wide.
- Support shared displays from laptop sizes through 16:9 televisions.
- Respect safe-area insets and browser UI on iOS and Android.
- Meet WCAG AA contrast for functional text and controls.
- Provide visible keyboard focus and semantic button/status markup.
- Preserve meaning without color and with sound disabled.

## Technical Architecture

Protocol: Zero is a modern, isolated game package rather than a rewrite of the existing frontend.

### Client

- React 19.2 and TypeScript 6 for the new mode only.
- Vite 8 builds static assets into `public/games/protocol-zero/`.
- Motion 12 handles state, layout, and reveal transitions with a global reduced-motion policy.
- One React application renders either `StageView` or `ControllerView` from the authenticated player/session state.
- The existing room code and session token in `trivia_session` are reused; no second join flow is introduced.

### Server

- The existing Express and Socket.IO server remains the process entry point.
- A new isolated `ProtocolZeroEngine` owns the mode state machine. Protocol Zero logic is not added to the already-large `GameRoom.js` beyond a small mode delegation boundary.
- The server owns roles, deadlines, action validation, randomization, crisis resolution, and ending selection.
- Clients send intents only and cannot calculate or submit outcomes.

### Event Boundary

All mode-specific events use a `pz:` prefix. The initial contract includes:

- `pz:game_started`
- `pz:round_started`
- `pz:choose_action`
- `pz:action_accepted`
- `pz:round_reveal`
- `pz:investigation_started`
- `pz:cast_vote`
- `pz:investigation_reveal`
- `pz:state_snapshot`
- `pz:game_ended`

Payload validation rejects unknown action IDs, invalid targets, wrong phases, duplicate confirmed actions, late actions, and attempts to use another player's role power.

### Data Flow

1. The existing lobby starts the room with `gameMode: "protocol-zero"`.
2. The server creates a Protocol Zero engine and emits the game-start route signal.
3. Clients enter the React application and re-authenticate with the existing session token.
4. The server returns a role-filtered snapshot: public state plus only that player's private state.
5. Clients render from snapshots and incremental `pz:` events.
6. On every decision, the server validates the intent, records it idempotently, and acknowledges acceptance.
7. The server resolves the phase once the deadline arrives or all eligible players confirm.

## Failure Handling

- **Temporary player disconnect:** Preserve their private state for the existing reconnect window. If the decision deadline passes, apply the documented neutral action without revealing their role.
- **Reconnect:** Attempt Socket.IO connection-state recovery, then always support a role-filtered `pz:state_snapshot` fallback because automatic recovery is not guaranteed.
- **Shared display disconnect:** Finish the current atomic server transition, then pause at the next safe phase boundary. The host can promote another connected device as the display.
- **Duplicate or late command:** Return a typed rejection reason and keep the authoritative snapshot unchanged.
- **Malformed or unauthorized payload:** Reject without broadcasting private information or crashing the room.
- **Animation or audio failure:** Gameplay remains fully usable; presentation effects are progressive enhancement.
- **Client version mismatch:** Show a reload-required screen before accepting private actions.

## Testing and Quality Gates

### Server and State Machine

- Deterministic unit tests for every game phase, role powers, anomaly instructions, infiltrator outcomes, quarantines, and three endings.
- Property-oriented invariants: no private state in public payloads, one accepted action per player per phase, valid meter ranges, and no eliminated participant.
- Socket integration tests with 2, 3, and 5 players.
- Explicit tests for duplicate, late, forged, malformed, and unauthorized actions.
- Reconnect tests before selection, after confirmation, during reveal, and during investigation.

### Client

- Component tests for controller choice/confirmation, countdown, connection overlay, role privacy, and reduced motion.
- Full Arabic RTL and English LTR coverage.
- Multi-context browser tests that run a stage plus 2, 3, and 5 phones in one match.
- Screenshot visual regression for briefing, crisis, confirmed action, reveal, investigation, reconnect, and all endings.
- Accessibility checks for names, roles, focus order, contrast, and non-color state cues.

### Performance

- Target 60fps for ordinary transitions on supported phones.
- Avoid main-thread tasks longer than 100ms during interaction and reveal.
- Set an initial JavaScript bundle budget of 250KB gzip for the Protocol Zero entry route.
- Reduce particles, blur, and continuous glow on low-performance devices while preserving information and timing.

## Non-Goals

- Rewriting the five existing trivia modes in React.
- Adding accounts, cloud hosting, databases, matchmaking, or public internet rooms.
- Open text, drawing, voice, camera, or user-generated content.
- More than one new game mode in this implementation.
- Monetization, progression, cosmetics, or a marketplace.

## Acceptance Criteria

The feature is complete when a host can select Protocol: Zero in the existing lobby, 2–5 players can finish a six-crisis match using only button controls, disconnects recover safely, private role data never leaks, Arabic and English experiences are complete, the approved stage/controller visual system is implemented, and all automated quality gates pass.

## Technology References

- [React versions](https://react.dev/versions)
- [Vite 8 release and Node requirements](https://main.vite.dev/blog/announcing-vite8)
- [Motion for React](https://motion.dev/docs/react)
- [Motion reduced-motion support](https://motion.dev/docs/react-use-reduced-motion)
- [Socket.IO connection-state recovery](https://socket.io/docs/v4/connection-state-recovery)
