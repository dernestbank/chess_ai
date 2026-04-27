# BoardSight Chess — Development Plan (React Native, cross-platform)

> Derived from **docs/PRD.md**, **docs/PRD_technical.md**, and **docs/About.md**.
> Mark tasks `[x]` upon completion. Work top-to-bottom within each milestone.

> **Build status:** M0–M9 + M13 + M14 (backend) + full dark-mode theming complete. **309 tests passing across 20 suites, 23 snapshots.** Zero TypeScript errors in src/.
> **200 tests:** 10 GameCore + 18 FSM + 18 Clock + 48 repositories + 18 UI component snapshots + 7 screen snapshots + 14 analysisRouter + 25 P2P + 10 EvalTimeline + 14 drills/tactics + 7 commentator + 9 botEngine + 11 gameService + App smoke test.
> All 12 screens themed. Spectator role wired end-to-end. Backend Redis/Postgres persistence added (db.py, queue.py, worker/main.py). Game stats bar in LibraryScreen (W/D/L). Latency pill in LiveGameScreen (CLOCK_SYNC sentAt). Detox E2E scaffolding (detox.config.js, e2e/helpers.ts, botGame + otbFlow tests).
> **Next:** Stockfish WASM (post-MVP), CV native impl (post-MVP), real device build (requires Mac/device).

---

## 0) Project framing

- [ ] **Goal:** Build a React Native app that watches a physical chessboard via phone camera, auto-records moves, runs a chess clock, delivers post-game analysis, supports in-device gameplay vs bots, and enables P2P / cloud multiplayer.
- [ ] **Deliverables:**
  - [ ] React Native app (iOS + Android, cross-platform from the start)
  - [ ] Native CV module (iOS: AVFoundation + CoreML/OpenCV; Android: Camera2 + TFLite/OpenCV)
  - [ ] GameCore rules + PGN pipeline (chess.js)
  - [ ] 9-state app state machine
  - [ ] Local persistence (SQLite)
  - [ ] In-app gameplay: vs AI bots (on-device engine)
  - [ ] P2P WiFi + cloud multiplayer (two-phone sync)
  - [ ] Post-game analysis pipeline (cloud-first, on-device fallback)
  - [ ] Export (PGN + recap card) + game library
  - [ ] Optional self-hosted backend (Stockfish worker + LLM explanations)
  - [ ] QA plan + instrumentation
- [ ] **Success criteria:**
  - [ ] Scan + calibration under 60 seconds on supported devices
  - [ ] >90% auto-recorded move accuracy in internal test protocol
  - [ ] Clock remains consistent across background/resume and app kill
  - [ ] Analysis completes in <30s (cloud or on-device)
  - [ ] Move candidate latency <300ms
  - [ ] P2P move sync latency <100ms on local network
- [ ] **Constraints:**
  - [ ] Cross-platform (iOS + Android) from project init
  - [ ] Native CV must stay low-latency (~15fps target)
  - [ ] Local-first storage; cloud analysis is optional
  - [ ] In-app bot play must work fully offline

---

## 1) Decision points (resolve before M1)

- [x] **CV approach** (resolve before M1):
  - **[CHOSEN]** Option A — Simple grid + frame diff (MVP; upgrade to B post-MVP)
  - Option B — Full piece classification via CoreML/TFLite (post-MVP)
  - Decision recorded: Option A — grid + frame diff
- [x] **Backend language** (resolve before M3):
  - **[CHOSEN]** Option A — FastAPI (Python, easiest Stockfish/LLM integration)
  - Decision recorded: FastAPI (Python)
- [x] **Multiplayer transport** (resolve before M5):
  - **[CHOSEN]** Option A — P2P local WiFi (MVP primary); cloud relay as stretch/fallback
  - Decision recorded: P2P WiFi primary
- [x] **Bot engine** (resolve before M6):
  - **[CHOSEN]** Option A — Stockfish WASM (stub with random moves for MVP; integrate WASM post-MVP)
  - Decision recorded: Stockfish WASM (stubbed)

---

## 2) Folder & file structure

- [x] Folder & file structure created

```
BoardSight/
├── ios/                              # Xcode project
├── android/                          # Android project
├── src/
│   ├── ui/
│   │   ├── screens/
│   │   │   ├── OnboardingScreen.tsx
│   │   │   ├── StartGameScreen.tsx   # choose mode: OTB / vs bot / multiplayer
│   │   │   ├── ScanScreen.tsx
│   │   │   ├── LiveGameScreen.tsx    # shared for OTB + multiplayer
│   │   │   ├── BotGameScreen.tsx     # on-device gameplay vs bot
│   │   │   ├── LobbyScreen.tsx       # find / create multiplayer session
│   │   │   ├── ReviewScreen.tsx
│   │   │   └── LibraryScreen.tsx
│   │   └── components/
│   │       ├── Clock.tsx
│   │       ├── MoveList.tsx
│   │       ├── BoardDiagram.tsx      # interactive 2D board
│   │       ├── CalibOverlay.tsx
│   │       ├── ConfirmMoveSheet.tsx
│   │       ├── EvalBar.tsx
│   │       └── RecapCard.tsx
│   ├── domain/
│   │   ├── gamecore/
│   │   │   ├── index.ts             # applyMove, undo, exportPGN …
│   │   │   ├── pgn.ts
│   │   │   ├── clock.ts
│   │   │   └── types.ts             # Move, GameState, ClockState …
│   │   ├── stateMachine/
│   │   │   └── index.ts             # 9-state FSM
│   │   ├── analysisRouter/
│   │   │   └── index.ts             # device vs cloud routing
│   │   ├── botEngine/
│   │   │   └── index.ts             # bot difficulty + move generation wrapper
│   │   └── multiplayer/
│   │       ├── p2p.ts               # local WiFi P2P session
│   │       └── cloudRelay.ts        # cloud multiplayer relay
│   ├── native/
│   │   └── cvModule.ts              # typed JS bridge wrapper
│   ├── data/
│   │   ├── db.ts
│   │   ├── models.ts
│   │   └── repositories.ts
│   └── api/
│       ├── client.ts
│       └── analysis.ts
├── backend/
│   ├── api/                         # REST API (analysis + cloud relay)
│   ├── worker/                      # Stockfish + LLM
│   ├── docker-compose.yml
│   └── .env.example
├── docs/
└── dev/
    └── Plan.md
```

---

## 3) Tech stack & tooling setup

### 3.1 Initialize project

- [x] `npx @react-native-community/cli init BoardSight --template react-native-template-typescript`
- [x] Enable strict TypeScript: `"strict": true` in `tsconfig.json`
- [x] Absolute imports: add `paths` in `tsconfig.json` + `babel-plugin-module-resolver`
- [x] ESLint + Prettier (`@react-native/eslint-config` base)
- [x] Husky + lint-staged (pre-commit: lint + type-check)

### 3.2 Core dependencies

- [x] Navigation: `@react-navigation/native` + `@react-navigation/native-stack`
- [ ] Camera: `react-native-vision-camera` (v3+)
- [x] Chess rules: `chess.js`
- [ ] Database: `react-native-quick-sqlite`
- [x] State management: `zustand`
- [ ] Networking (multiplayer): `react-native-tcp-socket` (P2P) + WebSocket client (cloud relay)
- [x] Date/time: `dayjs`

### 3.3 Dev / test dependencies

- [x] `jest` + `@testing-library/react-native`
- [ ] `detox` (E2E — configure in QA milestone)
- [ ] `ts-node` (backend scripts)

### 3.4 Native setup

**iOS:**
- [ ] `pod install` in `/ios`
- [x] Add camera usage description to `Info.plist` (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`)
- [x] Add local network usage description to `Info.plist` (`NSLocalNetworkUsageDescription`, `NSBonjourServices`)
- [ ] Configure signing + bundle ID in Xcode

**Android:**
- [x] Add camera permission to `AndroidManifest.xml` (`CAMERA` + `camera` feature)
- [x] Add `CHANGE_NETWORK_STATE`, `ACCESS_WIFI_STATE` permissions (P2P)
- [x] Configure signing keystore (`android/keystore/` + `README.md` with keytool instructions)
- [ ] Verify build on Android emulator and real device

---

## 4) TypeScript contracts (define before implementing modules)

Define in `src/domain/gamecore/types.ts` and `src/native/cvModule.ts`.

### CV module payloads

```ts
interface BoardObservation {
  corners: [Point, Point, Point, Point]; // TL, TR, BR, BL
  confidence: number;                    // 0–1
  lightingWarning: boolean;
  timestamp: number;
}

interface MoveCandidate {
  fromSquare: string;    // "e2"
  toSquare: string;      // "e4"
  promotion?: "q" | "r" | "b" | "n";
  confidence: number;
  timestamp: number;
}

interface PositionObservation {
  fen: string;
  occupiedSquares: string[];
  diffFromPrev: string[];
  timestamp: number;
}
```

### CV module bridge

```ts
// Commands (JS → Native)
startSession(config: SessionConfig): void
stopSession(): void
pauseTracking(paused: boolean): void
setCalibration(calib: CalibrationData): void
requestKeyFrame(): void  // debug only

// Events (Native → JS)
onBoardObservation: (obs: BoardObservation) => void
onMoveCandidate: (candidate: MoveCandidate) => void
onPositionObservation: (pos: PositionObservation) => void  // opt-in
```

### GameCore & multiplayer types

```ts
interface GameState {
  fen: string;
  moves: Move[];
  pgn: string;
  result: "1-0" | "0-1" | "1/2-1/2" | "*";
  clock: ClockState;
  mode: "otb" | "bot" | "multiplayer";
}

interface ClockState {
  whiteMs: number;
  blackMs: number;
  activeColor: "w" | "b" | null;
  increment: number;
  lastTickAt: number;
}

interface MultiplayerSession {
  id: string;
  transport: "p2p" | "cloud";
  myColor: "w" | "b";
  peerConnected: boolean;
}
```

- [x] All interfaces defined and exported from `src/domain/gamecore/types.ts`
- [x] CV bridge typed in `src/native/cvModule.ts`
- [x] Multiplayer session types in `src/domain/multiplayer/`

---

## 5) State machine (define before M1)

9 states in `src/domain/stateMachine/index.ts`.

```
idle
  → scan_board          (OTB: user taps "New Game" → camera)
  → bot_game            (in-app: user taps "Play vs Bot")
  → lobby               (multiplayer: find/create session)
      → live_play       (game in progress — shared state for all modes)
          → paused      (user pauses / app backgrounds)
          ↕
      → game_end        (checkmate / resign / timeout / draw)
          → review_ready
          → idle
```

- [x] `AppState` union type (all states)
- [x] `AppEvent` union type (all transitions)
- [x] `transition(state, event) → AppState` pure function
- [x] Wire to Zustand store
- [x] Unit-test all valid + invalid transitions

---

## 6) M0 — Foundation (prototype, no camera)

Goal: app boots, navigation works, chess logic runs, DB persists, PGN exports.

- [x] Stub all screens with placeholder `<Text>`
- [x] Wire React Navigation: Onboarding → StartGame → Scan → LiveGame → BotGame → Lobby → Review → Library
- [x] **GameCore:**
  - [x] chess.js wrapper in `gamecore/index.ts`
  - [x] `applyMove(move)` → validates + applies → `GameState`
  - [x] `undoMove()`
  - [x] `exportPGN()` → PGN string
  - [x] `loadFEN(fen)` → set position
  - [x] `getLegalMoves()` → move list
- [x] Manual move entry UI (tap from/to on `BoardDiagram`) — wired in BotGameScreen
- [x] **Clock reducer** (`gamecore/clock.ts`):
  - [x] Start / stop / switch sides / increment
  - [x] Tick via `setInterval`; pause on `AppState` background event
  - [x] Persist `lastTickAt` + remaining ms on each move (GameService autosaves on `applyMove`)
- [x] **SQLite schema v1:**
  ```sql
  games    (id, mode, pgn, result, white_ms, black_ms, created_at, updated_at)
  moves    (id, game_id, san, fen, from_sq, to_sq, white_ms_after, black_ms_after, created_at)
  analysis (id, game_id, status, payload_json, created_at)
  sessions (id, game_id, transport, peer_id, created_at)  -- multiplayer
  ```
  - [x] Migration runner (sequential `.sql` files + `schema_version` table)
  - [x] Repositories: `createGame`, `saveMove`, `getGame`, `listGames`, `saveAnalysis`, `getAnalysis`
- [x] PGN export: share sheet + copy to clipboard (ReviewScreen — `Share.share` + `@react-native-clipboard/clipboard`)
- [x] Autosave on every `applyMove` (GameService persists move + PGN + clock on every move)
- [x] Crash recovery: offer resume for any `result = "*"` game on launch (App.tsx `onReady` handler)

---

## 7) M1 — Vision MVP (OTB scan & live move detection)

### 7.1 Native CV module scaffold

- [x] **iOS:** Swift/ObjC native module (`CVModule`) — `RCTEventEmitter` + ObjC bridge
- [x] **Android:** Kotlin native module (`CVModule`) — `ReactContextBaseJavaModule` + `CVModulePackage`
- [x] Camera control: `startSession` / `stopSession` / `pauseTracking`
- [x] Emit `onBoardObservation`, `onMoveCandidate`, `onPositionObservation` to JS
- [x] JS typed wrapper: `src/native/cvModule.ts` (with mock mode for simulator)
- [ ] Target: ~15fps on mid-range devices, <300ms move candidate latency (pending real device test)

### 7.2 Board detection (native)

- [x] Capture frames via `AVCaptureSession` (iOS) / `Camera2` (Android) — stubs in place
- [ ] Grayscale + Canny edge detection → Hough line transform → 9×9 grid intersections
- [ ] Homography transform → flatten to top-down view
- [ ] Lock corners when confidence > threshold → emit `BoardObservation`
- [ ] Lighting normalization + low-contrast warning

### 7.3 Move detection (native)

- [ ] Per-square occupancy hashing for all 64 squares per frame
- [ ] Frame diff: compare hashes between frames
- [ ] Temporal smoothing: require N consecutive matching frames before emitting `MoveCandidate`
- [ ] Special moves: castling (king 2-square move), en passant (captured square empties), promotion
- [ ] Debug: `requestKeyFrame()` saves annotated frame (debug builds only)

### 7.4 Scan & calibration screen

- [x] Live camera preview + `CalibOverlay` grid (mock mode; vision-camera Camera component wired)
- [x] Confidence indicator + lighting prompt
- [x] Board orientation indicator (which side is white)
- [x] FEN confirmation step: display detected position; user adjusts if needed
- [x] Load confirmed FEN into GameCore → transition to `live_play`

### 7.5 Live move detection + correction

- [x] Auto-apply high-confidence candidates (≥0.85)
- [x] Show `ConfirmMoveSheet` for low-confidence candidates
- [x] Illegal move detected → warning + correction prompt
- [x] Correction tools: edit last move, takeback, pause tracking, manual turn override
- [x] Highlight detected from/to squares on `BoardDiagram`

---

## 8) M2 — Clock integration

- [x] `Clock.tsx`: MM:SS.d display; flashes + haptic on low time (<10s)
- [x] Time control presets: Bullet (1+0), Blitz (3+2, 5+0), Rapid (10+0, 15+10), Custom
- [x] `TimeControlPicker.tsx`: modal picker wired in StartGameScreen for OTB
- [x] Manual clock tap (physical clock behavior — `onTap` prop on Clock)
- [x] Auto-switch on high-confidence move (LiveGameScreen applies move → GameService.applyMove)
- [x] Clock survives: background/foreground (AppState listener in GameService), app kill (`lastTickAt` + ms in SQLite)
- [x] Timestamp every move with remaining ms (saved to `moves` table)
- [x] Timeout → `game_end` transition (GameService watchdog)

---

## 9) M3 — Post-game analysis

### 9.1 Backend setup

- [x] `backend/docker-compose.yml` with services: `api`, `worker`, `postgres`, `redis`
- [x] API server (`backend/api/`):
  - [x] `POST /v1/analysis/jobs` → accept PGN, enqueue, return `{ jobId }`
  - [x] `GET /v1/analysis/jobs/{jobId}` → `{ status }`
  - [x] `GET /v1/analysis/jobs/{jobId}/result` → full analysis payload
  - [x] Auth: `X-API-Key` header
  - [x] OpenAPI spec (`backend/openapi.yaml` — POST/GET analysis jobs, ApiKeyAuth)
- [x] Worker (`backend/worker/`):
  - [x] Consume job from Redis queue
  - [x] Stockfish (depth 18–22) → centipawn eval per move
  - [x] Classify: blunder (>200cp), mistake (>100cp), inaccuracy (>50cp)
  - [x] Optional LLM: 3–5 plain-language takeaways from annotated PGN
  - [x] Write result to Postgres; update job status
- [x] `backend/.env.example`

### 9.2 Analysis router (mobile)

- [x] `src/domain/analysisRouter/index.ts`: cloud if configured + online, else on-device
- [x] Settings: `analysisModeDefault`, `cloudEndpointUrl`, `apiKey`, `enableLLMExplanations` (SettingsScreen)
- [x] `src/api/analysis.ts`: submit → poll every 3s → cache in SQLite
- [x] Timeout after 60s; surface error state in UI

### 9.3 Review screen

- [x] Summary card: players, result, date, accuracy %
- [x] Move list with eval symbols (!, !!, ?, ??, ?!)
- [x] Evaluation bar (centipawn chart over game timeline) — `EvalTimeline` component, seekable cursor
- [x] Key moments + best-line recommendations (from analysis payload)
- [x] Replay mode: step through moves + eval (First/Prev/Next/Last + tap-any-move)
- [x] Scrubber: horizontal ScrollView of move buttons, tap to jump to any position
- [x] LLM takeaways section (if enabled)

---

## 10) M4 — Export & sharing

- [x] PGN share via iOS/Android share sheet (ReviewScreen — `Share.share`)
- [x] Copy PGN to clipboard (`@react-native-clipboard/clipboard`)
- [x] `RecapCard.tsx`: players, result, date, key moments, accuracy component built
- [x] Export RecapCard as PNG (`react-native-view-shot` — installed + wired in ReviewScreen)
- [x] Game library:
  - [x] List games (date, mode, players, result, move count)
  - [x] Search by player name / date range / result
  - [x] Tap to open Review; long-press to delete

---

## 11) M5 — Multiplayer (P2P WiFi + cloud relay)

### 11.1 P2P local WiFi

- [x] `src/domain/multiplayer/p2p.ts`: real TCP socket implementation (react-native-tcp-socket, newline-delimited JSON, sequence numbers)
- [x] Implement real TCP socket connection (`react-native-tcp-socket`)
- [ ] Advertise / discover sessions via mDNS (`react-native-zeroconf`) — deferred post-MVP; IP-based for now
- [x] Protocol: JSON frames with move SAN, clock state, sequence number
- [x] Reconnect on drop (buffer up to 30s of moves) — `_sendBuffer` with TTL, `_flushBuffer()` on reconnect, cleared on disconnect
- [x] **LobbyScreen.tsx:** "Host game" / "Join game" UI, wired to real p2pManager
- [x] Wire LobbyScreen to real P2PManager
- [x] Sync: host phone records OTB moves via CV; guest phone acts as clock display + secondary viewer
- [x] Both phones show live move list + clock; both can trigger corrections — CORRECTION_REQUEST/APPROVED/DENIED protocol; `syncToFen` in gameService

### 11.2 Cloud relay (optional)

- [x] `src/domain/multiplayer/cloudRelay.ts`: Full WebSocket client with reconnect logic
- [x] Backend `relay` service: `backend/api/routes/relay.py` — WebSocket session routing (host/guest)
- [x] Fallback: if P2P fails → offer cloud relay (`cloudRelayManager`, `activeTransport.ts` abstraction, LobbyScreen alert prompt)
- [x] Remote spectator view: `SpectatorScreen.tsx` — connects via cloudRelayManager with 'spectate' role, live board + move list + clocks

### 11.3 Two-phone clock mode

- [x] Host phone: tracks board + moves (OTB CV → sends MOVE + clock to guest)
- [x] Guest phone: acts as dedicated clock displayer (mirrors host board + clock)
- [x] Sync clock state via P2P transport on each move (bundled in WireMove frame + 5s interval)
- [x] Both phones can tap to switch clock sides (guest sends CLOCK_TAP → host switches + syncs back)

---

## 12) M6 — In-app gameplay (vs bots)

- [x] **BotGameScreen.tsx**: full interactive `BoardDiagram` (tap to move), hint/undo/resign
- [x] `src/domain/botEngine/index.ts`:
  - [x] Difficulty levels: Beginner (random) / Intermediate (prefer captures) / Advanced (best-of-5)
  - [ ] Wrap Stockfish WASM for on-device move generation (post-MVP)
  - [x] Respond within 1–3s (configurable think time — simulated delay)
- [x] Bot always plays offline (no network required)
- [x] Modes within bot game:
  - [x] **Learning mode:** hint button (assist level), auto-best-move when Assist=On
  - [x] **Tactics puzzles:** `tactics.ts` extracts blunders from analysed games; `TacticsScreen.tsx` — puzzle solving UI with reveal + score tracking
  - [x] **Opening drill:** 5 preset opening positions — DrillScreen, `drills.ts`, BotGame `startFen` param
  - [x] **Endgame drill:** 5 preset endgame positions — Lucena, Philidor, opposition, K+P vs K, Q vs pawn
- [x] Bot games saved to library + full analysis available

---

## 13) Modes & UX polish

- [x] **Assist Level toggle** (Off / Light / On) — controls hint visibility in BotGameScreen + auto-hint on 'on'
- [x] **Referee mode:** illegal move warning toggle in Settings; gates the alert in LiveGameScreen
- [x] **Teacher mode:** hint button visible when Assist ≥ Light; auto-fires when Assist = On
- [x] **Commentator mode:** `commentator.ts` — LLM call when enabled, canned fallback; shown in BotGameScreen after each player move
- [x] **Onboarding flow:** 3-step paged flow — welcome, camera permission request, lighting tips
- [x] Dark mode support — `src/ui/theme.ts` DARK/LIGHT palettes + `useTheme()` hook; Settings toggle; wired into StartGameScreen
- [x] Haptics on: move confirmation (30ms), clock switch (40ms), game end ([100,80,100,80,100]), low time ([80,60,80])

---

## 14) Data & persistence

- [x] SQLite schema v1 (per §6) + migration runner
- [x] Autosave on every `applyMove` (no manual save button)
- [x] Crash recovery: resume active `result = "*"` game on next launch (App.tsx `onReady` handler)
- [x] Analysis cache: skip re-request if `status='done'` result already in `analysis` table
- [x] Session persistence: save/restore multiplayer session code (AsyncStorage, 10-min TTL, quick-reconnect UI in LobbyScreen)
- [x] Export / backup: bulk PGN export via "Export all PGN" button in LibraryScreen

---

## 15) QA & instrumentation

### 15.1 Test matrix

| Condition | Variants |
|---|---|
| Lighting | Bright natural / Indoor overhead / Low lamp |
| Board designs | Classic wood / Tournament green / Dark minimalist |
| Piece styles | Standard Staunton / Plastic tournament / Travel |
| Game pace | Rapid / Blitz / Bullet |
| Special moves | Castling / En passant / Promotion |
| Platform | iPhone 12+ / Mid-range Android (Pixel 6) |
| Network | P2P local WiFi / Cloud relay / Offline |

### 15.2 Automated tests

- [x] Unit: GameCore (10 tests), state machine transitions (18 tests), clock reducer (18 tests) — 44 passing
- [x] Integration: SQLite repositories — 48 tests (`__tests__/data/repositories.test.ts`)
- [x] Snapshot: Clock (5), MoveList (2), EvalBar (4), RecapCard (3) — 14 snapshots (`__tests__/ui/components.snapshot.test.tsx`)
- [x] analysisRouter — 14 tests: cloud/device routing, static import fix (`__tests__/domain/analysisRouter.test.ts`)
- [x] P2P unit — 25 tests: parseCode, setCallbacks, wire frame dispatch, socket close, correction protocol, spectate (`__tests__/domain/p2p.test.ts`)
- [x] EvalTimeline — 10 tests: empty state, snapshots (white/black/equal), onSeek callback, clamp, 5-entry seek, empty fallback, accuracy display (`__tests__/ui/evalTimeline.test.tsx`)
- [x] Screen snapshots — 7 tests: DrillScreen (2), LobbyScreen (2), OnboardingScreen (3) (`__tests__/ui/screens.snapshot.test.tsx`)
- [x] E2E (Detox): stubs written — `e2e/botGame.test.ts`, `e2e/otbFlow.test.ts`, `e2e/helpers.ts`, `detox.config.js` — awaiting Detox installation + device

### 15.3 Instrumentation

- [x] Log each `MoveCandidate`: confidence, auto-accepted vs manually corrected (`src/domain/instrumentation.ts`)
- [x] Track move detection latency (frame capture → JS event)
- [x] Track P2P sync latency (host move → guest display)
- [x] Log manual correction rate per session (target: <10%)
- [ ] Performance targets: 15–30fps CV, <300ms move latency, <100ms P2P sync (verify on device)

---

## 16) Risks & mitigations

| Risk | Mitigation |
|---|---|
| Lighting / glare | Histogram normalization + lighting warning prompts |
| Camera occlusion | Temporal smoothing; N-frame confirmation |
| Fast blitz moves | Manual clock tap; quick edit UI |
| Promotion / en passant | Always show `ConfirmMoveSheet` for these moves |
| Battery drain | Low-power mode: reduce CV to 10fps when stable |
| Clock drift on background | `Date.now()` diff on resume; persist `lastTickAt` |
| P2P network drop | Buffer + sequence numbers; 30s reconnect window |
| Android CV performance | Tune OpenCV params per device; fallback to lower fps |
| Bot engine bundle size | Lazy-load Stockfish WASM only when entering bot mode |

---

## 17) Post-MVP roadmap (reference only)

- [ ] IoT smart clock integration (BLE)
- [ ] AR overlay via Meta smart glasses
- [ ] VR headset mode for immersive analysis
- [ ] Annotated GIF/video recap generation
