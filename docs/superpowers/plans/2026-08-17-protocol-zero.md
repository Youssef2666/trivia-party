# Protocol: Zero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a premium, server-authoritative, non-trivia party mode for a dedicated host display and 2–5 phone players.

**Architecture:** Keep the current Vanilla JS lobby and Socket.IO room/session system. Delegate the new mode to an isolated server engine, then route all connected devices into a React 19.2 + TypeScript 6 client built by Vite 8; the same client renders either the host stage or a private phone controller from role-filtered snapshots.

**Tech Stack:** Node.js 20.19+ (current workspace: 24.12), Express 5, Socket.IO 4, React 19.2, TypeScript 6, Vite 8, Motion 12, Node test runner, Vitest, Testing Library, Playwright, axe-core.

## Global Constraints

- The host device is always the shared display and is not one of the 2–5 contestants.
- A match contains exactly 6 crises selected from 12 authored scenarios and lasts approximately 10–15 minutes with production timings.
- Phones use buttons only: no text entry, drawing, microphone, camera, or user-generated content.
- The server owns roles, timers, action validation, randomization, resolution, and endings.
- Private role, directive, alignment, and action data must never appear in room-wide payloads.
- Arabic and English must both work, with full RTL/LTR behavior and bundled Cairo fonts.
- Functional text and controls meet WCAG AA; color is always paired with a symbol or text.
- Reduced Motion, sound-off, and haptics-off paths preserve all gameplay information.
- The Protocol Zero initial JavaScript route stays below 250KB gzip.
- Existing trivia modes and their event contracts must continue to work unchanged.

## File Structure

### Server

- `server/games/protocol-zero/content.js` — immutable bilingual roles, crises, actions, directives, and endings.
- `server/games/protocol-zero/ProtocolZeroEngine.js` — state machine, deadlines, privacy filtering, decisions, voting, resolution, and endings.
- `server/games/protocol-zero/createTransport.js` — adapts a `GameRoom` and Socket.IO to public/private engine emissions.
- `server/GameRoom.js` — validates the new mode, delegates lifecycle/state to the engine, and keeps existing modes untouched.
- `server/GameManager.js` — requests viewer-filtered snapshots during create/join/rejoin.
- `server/index.js` — routes namespaced `pz:` commands and enables connection-state recovery.

### Modern Client

- `games/protocol-zero/index.html` — Vite HTML entry.
- `games/protocol-zero/vite.config.ts` — React build to `public/games/protocol-zero/`.
- `games/protocol-zero/vitest.config.ts` — jsdom component-test configuration.
- `games/protocol-zero/src/main.tsx` — bootstrap, global styles, and root error boundary.
- `games/protocol-zero/src/App.tsx` — snapshot router for loading, stage, controller, reconnect, and ending states.
- `games/protocol-zero/src/contracts.ts` — event names and exact snapshot/payload TypeScript types.
- `games/protocol-zero/src/socket.ts` — connection, time sync, session rejoin, snapshot subscription, and commands.
- `games/protocol-zero/src/i18n.tsx` — local language state using `trivia_lang` and bilingual content helpers.
- `games/protocol-zero/src/audio.ts` — synthesized WebAudio cues plus independent persisted sound/haptics preferences.
- `games/protocol-zero/src/components/StageView.tsx` — public television composition.
- `games/protocol-zero/src/components/ControllerView.tsx` — private phone role/actions/voting composition.
- `games/protocol-zero/src/components/ReactorCore.tsx` — stability visualization with reduced-motion path.
- `games/protocol-zero/src/components/PhaseTimer.tsx` — server-deadline countdown.
- `games/protocol-zero/src/components/ConnectionOverlay.tsx` — recoverable disconnect and reload-required states.
- `games/protocol-zero/src/components/EndingView.tsx` — three endings and host rematch action.
- `games/protocol-zero/src/styles/tokens.css` — visual tokens and color/type/space contracts.
- `games/protocol-zero/src/styles/global.css` — responsive stage/controller layouts, safe areas, focus, and low-effects mode.

### Existing Client and Documentation

- `public/js/screens/lobby.js` — adds the mode card and hides irrelevant trivia settings for this mode.
- `public/js/app.js` — routes `pz:game_started` and `rematch_started` between legacy and modern clients.
- `public/lang/ar.json`, `public/lang/en.json` — lobby name, description, requirements, and validation copy.
- `.gitignore` — excludes `.superpowers/` and generated Protocol Zero build output.
- `README.md`, `docs/01-عن-المشروع.md` — new mode, Node floor, build/test commands, and host-display rule.

### Tests

- `tests/server/protocol-zero-content.test.js`
- `tests/server/protocol-zero-engine.test.js`
- `tests/server/protocol-zero-room-integration.test.js`
- `tests/server/protocol-zero-lobby-contract.test.js`
- `games/protocol-zero/src/__tests__/socket.test.ts`
- `games/protocol-zero/src/__tests__/ControllerView.test.tsx`
- `games/protocol-zero/src/__tests__/StageView.test.tsx`
- `games/protocol-zero/src/__tests__/App.test.tsx`
- `tests/e2e/protocol-zero.spec.ts`
- `tests/e2e/protocol-zero.visual.spec.ts`
- `playwright.config.ts`

---

### Task 1: Modern Build and Test Harness

**Files:**
- Create: `.gitignore`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `games/protocol-zero/index.html`
- Create: `games/protocol-zero/vite.config.ts`
- Create: `games/protocol-zero/vitest.config.ts`
- Create: `games/protocol-zero/src/main.tsx`
- Create: `games/protocol-zero/src/App.tsx`
- Create: `games/protocol-zero/src/__tests__/App.test.tsx`

**Interfaces:**
- Produces: `npm run build:protocol-zero`, `npm run test:server`, `npm run test:client`, and a static `/games/protocol-zero/` entry.
- Produces: `App(): JSX.Element`, initially rendering the branded loading shell used by later tasks.

- [ ] **Step 1: Write the failing client smoke test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../App'

describe('Protocol Zero shell', () => {
  it('renders an accessible loading status', () => {
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('PROTOCOL: ZERO')
  })
})
```

- [ ] **Step 2: Run the test and verify the harness is missing**

Run: `npm run test:client`

Expected: non-zero exit because the script/config/dependencies do not exist.

- [ ] **Step 3: Install exact toolchain families and add scripts**

Run:

```bash
npm install react@^19.2 react-dom@^19.2 motion@^12.43 socket.io-client@^4.8
npm install --save-dev vite@^8 @vitejs/plugin-react@^6 typescript@^6 vitest@^4 jsdom@^26 @testing-library/react@^16 @testing-library/jest-dom@^6 @types/react@^19 @types/react-dom@^19 @playwright/test@^1.55 @axe-core/playwright@^4.10
```

Add scripts:

```json
{
  "prestart": "npm run build:protocol-zero",
  "build:protocol-zero": "vite build --config games/protocol-zero/vite.config.ts",
  "test": "npm run test:server && npm run test:client",
  "test:server": "node --test tests/server/*.test.js",
  "test:client": "vitest run --config games/protocol-zero/vitest.config.ts",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 4: Implement the minimal Vite/React shell**

Configure Vite with root `games/protocol-zero`, base `/games/protocol-zero/`, React plugin, and output `../../public/games/protocol-zero` with `emptyOutDir: true`. Add `App` with `<main><p role="status">PROTOCOL: ZERO</p></main>` and bootstrap it from `main.tsx`.

- [ ] **Step 5: Add generated-file ignores**

```gitignore
.superpowers/
public/games/protocol-zero/
test-results/
playwright-report/
```

- [ ] **Step 6: Verify tests and production build**

Run: `npm run test:client && npm run build:protocol-zero`

Expected: one passing smoke test and `public/games/protocol-zero/index.html` generated successfully.

- [ ] **Step 7: Commit**

```bash
git add .gitignore package.json package-lock.json games/protocol-zero
git commit -m "build: add Protocol Zero React toolchain"
```

### Task 2: Authored Content and Deterministic Assignment

**Files:**
- Create: `server/games/protocol-zero/content.js`
- Create: `tests/server/protocol-zero-content.test.js`

**Interfaces:**
- Produces: `ROLES`, `CRISES`, `ENDINGS`, `selectCrises(rng, count)`, `assignRoles(players, rng)`, and `createDirective({ crisis, role, alignment, rng, anomaly })`.
- `assignRoles` returns `{ rolesByPlayerId: Map, infiltratorId: string|null }` and never chooses an infiltrator for two contestants.

- [ ] **Step 1: Write failing content-contract tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, CRISES, selectCrises, assignRoles } = require('../../server/games/protocol-zero/content');

test('ships five roles and twelve bilingual crises', () => {
  assert.equal(ROLES.length, 5);
  assert.equal(CRISES.length, 12);
  for (const crisis of CRISES) {
    assert.ok(crisis.title.ar && crisis.title.en);
    assert.equal(crisis.actions.length, 3);
  }
});

test('two players get unique crew roles and no infiltrator', () => {
  const result = assignRoles([{ id: 'a' }, { id: 'b' }], () => 0);
  assert.equal(result.infiltratorId, null);
  assert.notEqual(result.rolesByPlayerId.get('a'), result.rolesByPlayerId.get('b'));
});

test('three to five players get exactly one infiltrator', () => {
  const result = assignRoles([{ id: 'a' }, { id: 'b' }, { id: 'c' }], () => 0);
  assert.equal(result.infiltratorId, 'a');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:server`

Expected: module-not-found failure for `content.js`.

- [ ] **Step 3: Implement complete immutable content**

Create exactly five role records and twelve crisis records. Every crisis has stable IDs, Arabic/English title and description, three actions with bilingual labels, numeric `stability`/`trust` effects, a `neutralActionId`, and one explicit synergy rule. Freeze the exported arrays and objects. Implement Fisher-Yates selection with injected `rng`.

- [ ] **Step 4: Run tests and inspect duplicate IDs**

Run: `npm run test:server`

Expected: all content tests pass; add assertions that all role, crisis, and per-crisis action IDs are unique.

- [ ] **Step 5: Commit**

```bash
git add server/games/protocol-zero/content.js tests/server/protocol-zero-content.test.js
git commit -m "feat: add Protocol Zero authored content"
```

### Task 3: Private Snapshot and Match Bootstrap

**Files:**
- Create: `server/games/protocol-zero/ProtocolZeroEngine.js`
- Create: `tests/server/protocol-zero-engine.test.js`

**Interfaces:**
- Consumes: content exports from Task 2.
- Produces: `new ProtocolZeroEngine({ players, hostId, transport, rng, now, durations })`.
- Produces methods `start()`, `getSnapshot(viewerId)`, `destroy()`, and getter `state`.
- `transport` is `{ broadcast(event, payload), emitTo(playerId, event, payload) }`.
- The test file defines local `makePlayers(count)`, `makeTransport()`, and `makeEngine(count, overrides)` helpers before the tests below.
- Every snapshot contains `schemaVersion: 1`; the client refuses private commands for any other version.

- [ ] **Step 1: Write failing privacy/bootstrap tests**

```js
test('start creates six crises and a stage-safe public snapshot', () => {
  const engine = makeEngine(3);
  engine.start();
  const host = engine.getSnapshot('host');
  assert.equal(host.view, 'stage');
  assert.equal(host.totalRounds, 6);
  assert.equal(host.self, null);
  assert.equal(JSON.stringify(host).includes('infiltrator'), false);
});

test('player snapshot contains only that player private state', () => {
  const engine = makeEngine(3);
  engine.start();
  const first = engine.getSnapshot('p1');
  const second = engine.getSnapshot('p2');
  assert.equal(first.view, 'controller');
  assert.equal(first.self.playerId, 'p1');
  assert.notDeepEqual(first.self.directive, second.self.directive);
  assert.equal(first.players.find(player => player.playerId === 'p2').role, undefined);
  assert.equal(first.players.find(player => player.playerId === 'p2').alignment, undefined);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/server/protocol-zero-engine.test.js`

Expected: module-not-found failure for `ProtocolZeroEngine.js`.

- [ ] **Step 3: Implement bootstrap and role-filtered snapshots**

Use phases `BRIEFING`, `CRISIS`, `DECISION`, `REVEAL`, `INVESTIGATION`, `INVESTIGATION_REVEAL`, and `GAME_END`. Initialize stability/trust to 70, select six crises, assign roles, and create a per-player private state map. Public player records contain only `playerId`, `nickname`, `avatar`, `connected`, `confirmed`, and `quarantined`.

- [ ] **Step 4: Run privacy tests**

Run: `node --test tests/server/protocol-zero-engine.test.js`

Expected: bootstrap and private-snapshot tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/games/protocol-zero/ProtocolZeroEngine.js tests/server/protocol-zero-engine.test.js
git commit -m "feat: bootstrap Protocol Zero engine"
```

### Task 4: Decisions, Powers, Resolution, and Timers

**Files:**
- Modify: `server/games/protocol-zero/ProtocolZeroEngine.js`
- Modify: `tests/server/protocol-zero-engine.test.js`

**Interfaces:**
- Produces: `chooseAction(playerId, { actionId, usePower }): { ok: true } | { ok: false, reason: string }`.
- Produces: `advance()` for host/test-controlled safe phase advancement and internal scheduled transitions.
- Snapshot `self.actions` is the only accepted action-ID source for that viewer.
- The test file defines `fakeClock()` with `now()`, `setTimeout()`, `clearTimeout()`, and `expire()` so deadline tests never wait in real time.

- [ ] **Step 1: Add failing action-validation tests**

```js
test('accepts one legal decision and rejects duplicate, late, and forged decisions', () => {
  const clock = fakeClock();
  const engine = makeEngine(3, { clock });
  engine.start();
  engine.advance();
  engine.advance();
  const actionId = engine.getSnapshot('p1').self.actions[0].id;
  assert.deepEqual(engine.chooseAction('p1', { actionId, usePower: false }), { ok: true });
  assert.equal(engine.chooseAction('p1', { actionId, usePower: false }).reason, 'action_already_confirmed');
  assert.equal(engine.chooseAction('p2', { actionId: 'forged', usePower: false }).reason, 'invalid_action');
  clock.expire();
  assert.equal(engine.chooseAction('p3', { actionId: engine.getSnapshot('p3').self.actions[0].id }).reason, 'action_deadline_passed');
});
```

- [ ] **Step 2: Run and verify failures**

Run: `node --test tests/server/protocol-zero-engine.test.js`

Expected: missing `chooseAction` and transition behavior.

- [ ] **Step 3: Implement server deadlines and idempotent decisions**

Inject scheduler functions through `durations` and use one owned timer at a time. On deadline, fill every missing decision with that crisis's neutral action. Resolve all action effects, one synergy rule, infiltrator covert sabotage, quarantine power blocking, and these role powers: engineer doubles their positive stability effect; analyst receives a private sabotage-presence clue; navigator cancels the first negative stability effect; security vote counts double; medic restores 15 trust.

- [ ] **Step 4: Add and pass meter invariant tests**

Assert stability and trust are clamped to `0..100`, a power cannot be used twice, quarantined powers are rejected, and early resolution happens only after all contestants confirm.

Run: `node --test tests/server/protocol-zero-engine.test.js`

Expected: all engine decision tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/games/protocol-zero/ProtocolZeroEngine.js tests/server/protocol-zero-engine.test.js
git commit -m "feat: resolve Protocol Zero crisis decisions"
```

### Task 5: Investigation, Disconnect Fallback, and Endings

**Files:**
- Modify: `server/games/protocol-zero/ProtocolZeroEngine.js`
- Modify: `tests/server/protocol-zero-engine.test.js`

**Interfaces:**
- Produces: `castVote(playerId, { targetPlayerId, usePower })`, `setConnected(playerId, connected)`, and `setHostId(playerId)`.
- Produces ending IDs `full_rescue`, `unstable_escape`, or `infiltrator_victory`.

- [ ] **Step 1: Add failing investigation and ending tests**

```js
test('investigates after rounds two and four without eliminating anyone', () => {
  const engine = completedRoundEngine({ roundIndex: 1 });
  assert.equal(engine.state.phase, 'INVESTIGATION');
  for (const id of ['p1', 'p2', 'p3']) engine.castVote(id, { targetPlayerId: 'p2', usePower: false });
  assert.equal(engine.getSnapshot('host').players.find(p => p.playerId === 'p2').quarantined, true);
  assert.equal(engine.getSnapshot('p2').self.canAct, true);
});

test('missing disconnected decision becomes neutral without leaking alignment', () => {
  const engine = decisionEngine(3);
  engine.setConnected('p2', false);
  engine.advance();
  assert.equal(engine.getSnapshot('host').players.find(p => p.playerId === 'p2').confirmed, true);
  assert.equal(JSON.stringify(engine.getSnapshot('host')).includes('alignment'), false);
});
```

Define `completedRoundEngine(options)` and `decisionEngine(count)` as test-local helpers built from the Task 3 `makeEngine` helper; neither helper is production API.

- [ ] **Step 2: Run and verify failures**

Run: `node --test tests/server/protocol-zero-engine.test.js`

Expected: missing voting/connectivity/ending behavior.

- [ ] **Step 3: Implement voting and final resolution**

Validate connected contestants and legal targets, apply deterministic tie-breaking, quarantine for exactly one following crisis, keep all contestants active, and select endings: stability `>= 70` and trust `>= 60` gives full rescue; stability `> 0` gives unstable escape unless the infiltrator met corruption victory; stability `0` or completed infiltrator objective gives infiltrator victory. If the dedicated stage disconnects, finish the current atomic resolution and pause before entering the next interactive phase; `setHostId` resumes with the promoted stage and emits new snapshots.

- [ ] **Step 4: Pass full state-machine matrix**

Run: `node --test tests/server/protocol-zero-engine.test.js`

Expected: two-, three-, and five-player matches reach valid endings; investigation occurs exactly twice; no contestant is eliminated; `destroy()` clears the owned timer.

- [ ] **Step 5: Commit**

```bash
git add server/games/protocol-zero/ProtocolZeroEngine.js tests/server/protocol-zero-engine.test.js
git commit -m "feat: complete Protocol Zero match flow"
```

### Task 6: Socket.IO and GameRoom Integration

**Files:**
- Create: `server/games/protocol-zero/createTransport.js`
- Modify: `server/GameRoom.js`
- Modify: `server/GameManager.js`
- Modify: `server/index.js`
- Create: `tests/server/protocol-zero-room-integration.test.js`

**Interfaces:**
- Consumes: engine interface from Tasks 3–5.
- Produces GameRoom methods `chooseProtocolZeroAction`, `castProtocolZeroVote`, and viewer-aware `getState(viewerId)`.
- Produces GameRoom method `setProtocolZeroConnection(playerId, connected)` for `GameManager` reconnect/disconnect hooks.
- Produces socket commands `pz:choose_action` and `pz:cast_vote`; all rejection replies use `pz:command_rejected`.

- [ ] **Step 1: Write failing room integration tests**

Test that `updateSettings({ gameMode: 'protocol-zero' })` is accepted, `_isContestant(host)` is false in this mode, start rejects fewer than two or more than five contestants with explicit codes, start does not select trivia questions, and `getState('p1').protocolZero` contains only p1 private data.

- [ ] **Step 2: Run and verify failures**

Run: `node --test tests/server/protocol-zero-room-integration.test.js`

Expected: the new mode is rejected and no engine delegation exists.

- [ ] **Step 3: Add the transport and lifecycle delegation**

`createTransport(room)` broadcasts with `room.io.to(room.code).emit` and emits privately through `room.findSocket(playerId)`. `GameRoom.startGame` branches before question selection, builds the engine from connected non-host contestants, locks the room, and emits `pz:game_started`. `rematch`, `removePlayer`, `setProtocolZeroConnection`, `transferHost`, and `getState(viewerId)` delegate when the engine exists. `GameManager.handleReconnect` and `handleDisconnect` call the connection hook, including the dedicated host so the engine can pause at the next safe boundary when the stage is absent.

- [ ] **Step 4: Add namespaced command routing and recovery**

Enable Socket.IO `connectionStateRecovery` with a two-minute maximum and `skipMiddlewares: false`. Route action/vote events using the authenticated `socket.triviaPlayerId`, never a payload player ID. Reject commands whose `schemaVersion` is not `1`. Update `GameManager` create/join/rejoin emissions to call `room.getState(player.id)`. Preserve existing host transfer as the stage-promotion fallback and emit a fresh role-filtered snapshot after transfer.

- [ ] **Step 5: Run complete server regression suite**

Run: `npm run test:server`

Expected: all Protocol Zero and existing server tests pass with no question event emitted in the new mode.

- [ ] **Step 6: Commit**

```bash
git add server/GameRoom.js server/GameManager.js server/index.js server/games/protocol-zero/createTransport.js tests/server/protocol-zero-room-integration.test.js
git commit -m "feat: integrate Protocol Zero with party rooms"
```

### Task 7: Legacy Lobby Entry and Bilingual Mode Copy

**Files:**
- Modify: `public/js/screens/lobby.js`
- Modify: `public/js/app.js`
- Modify: `public/lang/ar.json`
- Modify: `public/lang/en.json`
- Create: `tests/server/protocol-zero-lobby-contract.test.js`

**Interfaces:**
- Produces mode ID `protocol-zero` in the existing setting payload.
- Produces navigation to `/games/protocol-zero/` on `pz:game_started`.
- Produces return navigation to `/` when `rematch_started` arrives inside the modern route.

- [ ] **Step 1: Write failing lobby contract tests**

Load both translation JSON files and assert `modes.protocol-zero`, `modes.protocol-zero_desc`, and `errors.protocol_zero_requires_2_to_5` are non-empty. Evaluate `lobby.js` with a minimal `window` stub, render a host lobby, and assert the HTML contains `data-mode="protocol-zero"`.

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/server/protocol-zero-lobby-contract.test.js`

Expected: missing translation keys and mode card.

- [ ] **Step 3: Add the premium mode card and mode-specific lobby panel**

Add the mode with a `radio-tower` icon. When selected, hide categories, difficulty, rounds, timer, scoring toggles, display toggle, and themes. Show bilingual copy explaining that the host becomes the display, exactly 2–5 phone contestants are required, and the match lasts 10–15 minutes.

- [ ] **Step 4: Add route handoff**

Listen for `pz:game_started`, stop legacy audio/speech, persist the current session, and call `window.location.assign('/games/protocol-zero/')`. Keep existing `game_starting` and trivia handlers unchanged.

- [ ] **Step 5: Run lobby and server regressions**

Run: `npm run test:server`

Expected: bilingual keys and rendered mode card pass; existing lobby modes remain in the rendered HTML.

- [ ] **Step 6: Commit**

```bash
git add public/js/screens/lobby.js public/js/app.js public/lang/ar.json public/lang/en.json tests/server/protocol-zero-lobby-contract.test.js
git commit -m "feat: add Protocol Zero lobby entry"
```

### Task 8: Typed Client Session, Socket, and Snapshot Router

**Files:**
- Create: `games/protocol-zero/src/contracts.ts`
- Create: `games/protocol-zero/src/socket.ts`
- Create: `games/protocol-zero/src/i18n.tsx`
- Create: `games/protocol-zero/src/audio.ts`
- Modify: `games/protocol-zero/src/App.tsx`
- Create: `games/protocol-zero/src/components/ConnectionOverlay.tsx`
- Create: `games/protocol-zero/src/__tests__/socket.test.ts`
- Modify: `games/protocol-zero/src/__tests__/App.test.tsx`

**Interfaces:**
- Produces `ProtocolZeroSnapshot`, `PrivatePlayerState`, `PublicPlayerState`, `CrisisAction`, and `EndingId` types matching server payload fields.
- Produces `createProtocolZeroSocket({ ioFactory, storage })` with `subscribe`, `chooseAction`, `castVote`, `requestRematch`, and `disconnect`.

- [ ] **Step 1: Write failing socket/session tests**

Mock the Socket.IO client and `localStorage`. Assert a connect reads `trivia_session`, emits `rejoin_room` with roomCode/sessionToken, converts `rejoin_success.roomState.protocolZero` into a snapshot notification, surfaces `pz:command_rejected`, and never sends playerId in action/vote payloads.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:client`

Expected: missing contracts/socket modules.

- [ ] **Step 3: Implement exact contracts and socket adapter**

Use discriminated `phase` and `view` unions. Track connection as `connecting | connected | recovering | failed | version_mismatch`. Perform three-sample time sync and expose `serverNow()` for `PhaseTimer`. On failed automatic recovery, emit `rejoin_room`; never clear `trivia_session` for a temporary disconnect. Compare `schemaVersion` to `1` before enabling commands.

- [ ] **Step 4: Implement language provider and App routing**

Use `trivia_lang`, set `<html lang dir>`, and provide a bilingual `t(ar, en)` helper. Route stage/controller based only on snapshot `view`; show `ConnectionOverlay` while preserving the last snapshot underneath.

- [ ] **Step 5: Run client tests**

Run: `npm run test:client`

Expected: socket, session, language, and loading/recovery tests pass.

- [ ] **Step 6: Commit**

```bash
git add games/protocol-zero/src
git commit -m "feat: connect Protocol Zero client state"
```

### Task 9: Phone Controller Experience

**Files:**
- Create: `games/protocol-zero/src/components/ControllerView.tsx`
- Create: `games/protocol-zero/src/components/PhaseTimer.tsx`
- Create: `games/protocol-zero/src/styles/tokens.css`
- Create: `games/protocol-zero/src/styles/global.css`
- Create: `games/protocol-zero/src/__tests__/ControllerView.test.tsx`
- Modify: `games/protocol-zero/src/main.tsx`

**Interfaces:**
- Consumes: controller snapshot and typed commands from Task 8.
- Produces one local selection that is mutable until Confirm; emits one confirmed command.

- [ ] **Step 1: Write failing controller interaction tests**

Render a decision snapshot, select the second action, change to the first, press Confirm, and assert exactly one `chooseAction({ actionId: firstId, usePower: false })`. Assert all actions are buttons, Confirm is disabled before selection and after confirmation, private directive is visible, infiltrator alignment is visible only in the private controller, and Arabic renders with RTL.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:client -- ControllerView`

Expected: missing component/styles.

- [ ] **Step 3: Implement controller states**

Implement role briefing, crisis directive, large action cards, power toggle when legal, confirmation, waiting/readiness, investigation voting, private reveal clue, and ending summary. Use `aria-pressed`, `aria-live`, visible focus, 48px minimum targets, safe-area padding, and optional `navigator.vibrate(18)` after confirmation. Add independent sound and haptics toggles; `audio.ts` synthesizes briefing, confirm, warning, reveal, and ending cues with WebAudio so no network assets are required.

- [ ] **Step 4: Add responsive and reduced-effects CSS**

Define the approved navy/mint/violet/coral tokens, bundled Cairo font faces, portrait layout from 320px, `prefers-reduced-motion`, `prefers-contrast`, and `.pz-low-effects` fallbacks. Apply low effects when reduced motion is enabled, `navigator.hardwareConcurrency <= 4`, or the user selects it. Avoid continuous blur animation on phones.

- [ ] **Step 5: Run tests and build**

Run: `npm run test:client && npm run build:protocol-zero`

Expected: controller tests pass and the production bundle builds without TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add games/protocol-zero/src/components games/protocol-zero/src/styles games/protocol-zero/src/main.tsx games/protocol-zero/src/__tests__
git commit -m "feat: build Protocol Zero phone controller"
```

### Task 10: Cinematic Stage, Reveals, and Endings

**Files:**
- Create: `games/protocol-zero/src/components/StageView.tsx`
- Create: `games/protocol-zero/src/components/ReactorCore.tsx`
- Create: `games/protocol-zero/src/components/EndingView.tsx`
- Create: `games/protocol-zero/src/__tests__/StageView.test.tsx`
- Modify: `games/protocol-zero/src/App.tsx`
- Modify: `games/protocol-zero/src/styles/global.css`

**Interfaces:**
- Consumes: stage snapshot with `self: null`.
- Produces public crisis, readiness, meters, investigation, reveal, and ending compositions.

- [ ] **Step 1: Write failing stage/privacy tests**

Render each public phase and assert crisis title, round `3 / 6`, stability/trust, readiness, and deadline are visible. Assert alignment/directive/action IDs never render. Render all three endings and assert the correct bilingual heading and host-only rematch button.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:client -- StageView`

Expected: missing stage/reactor/ending components.

- [ ] **Step 3: Implement the approved stage hierarchy**

Use Motion `AnimatePresence` for phase transitions, layout animation for readiness and meter changes, and an SVG reactor whose ring length reflects stability. Use `MotionConfig reducedMotion="user"`; reduced motion removes scale/translation and keeps opacity/color. Add anonymous resolution signals and never show individual choices.

- [ ] **Step 4: Implement endings and rematch**

Render full rescue, unstable escape, and infiltrator victory with distinct but accessible color/symbol systems. The host emits `rematch`; controllers show a waiting state. On `rematch_started`, navigate all devices to `/`.

- [ ] **Step 5: Run tests and build budget check**

Run: `npm run test:client && npm run build:protocol-zero`

Gzip generated JavaScript and assert the sum is below 256000 bytes.

- [ ] **Step 6: Commit**

```bash
git add games/protocol-zero/src
git commit -m "feat: build cinematic Protocol Zero stage"
```

### Task 11: Multiplayer E2E, Visual Regression, and Accessibility

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/protocol-zero.spec.ts`
- Create: `tests/e2e/protocol-zero.visual.spec.ts`
- Create: `tests/e2e/protocol-zero.visual.spec.ts-snapshots/*`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: complete LAN flow from lobby through rematch.
- Produces repeatable browser proof for stage + 2/3/5 controllers.

- [ ] **Step 1: Write failing two-player E2E flow**

Start the app with `PZ_TEST_TIMINGS=1` on port 3100. Create a room in one browser context, select Protocol Zero, join from two mobile contexts, start, assert all devices route to `/games/protocol-zero/`, confirm six rounds with legal buttons, complete both investigations, and assert one valid ending appears.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test:e2e -- --project=chromium tests/e2e/protocol-zero.spec.ts`

Expected: failing selectors or flow until stable `data-testid` hooks and test timings are complete.

- [ ] **Step 3: Complete 3/5-player, reconnect, and privacy scenarios**

Add tests that disconnect and reopen one controller during decision, verify its private snapshot returns, send a forged Socket.IO payload from the page and verify rejection, and confirm the stage DOM never contains any role alignment or directive text.

- [ ] **Step 4: Add axe and screenshot assertions**

Run axe against stage/controller briefing, decision, investigation, reconnect, and endings with zero serious/critical violations. Capture 1440×900 stage and 390×844 phone baselines in Arabic and English with animations disabled.

- [ ] **Step 5: Run full quality suite**

Run:

```bash
npm test
npm run build:protocol-zero
npm run test:e2e
```

Expected: all server, component, E2E, accessibility, and visual tests pass.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e package.json package-lock.json
git commit -m "test: verify Protocol Zero multiplayer experience"
```

### Task 12: Documentation and Final Regression

**Files:**
- Modify: `README.md`
- Modify: `docs/01-عن-المشروع.md`
- Modify: `docs/02-سجل-التطوير.md`

**Interfaces:**
- Produces exact Node requirement, run/build/test instructions, host-display rule, and Protocol Zero feature description.

- [ ] **Step 1: Update product and developer documentation**

Document Node 20.19+, `npm start`, `npm test`, `npm run test:e2e`, the dedicated host display, 2–5 phone contestants, six-crisis flow, and the isolated React architecture. Do not claim cloud, accounts, database persistence, or more than one non-trivia mode.

- [ ] **Step 2: Run placeholder and stale-copy scans**

Run:

```bash
rg -n "TBD|TODO|Node.js \(الإصدار 18|five modes|أنماط اللعب الخمسة" README.md docs games server public tests
```

Expected: no placeholders or stale five-mode/Node 18 claims remain; legitimate historical text is explicitly labeled historical.

- [ ] **Step 3: Run complete regression and inspect git diff**

Run:

```bash
npm test
npm run build:protocol-zero
npm run test:e2e
git diff --check
git status --short
```

Expected: all checks pass, no generated build output is tracked, and only intentional documentation/test artifacts remain.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/01-عن-المشروع.md docs/02-سجل-التطوير.md
git commit -m "docs: document Protocol Zero mode"
```
