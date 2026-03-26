# BoardSight Chess — Development Plan (React Native, cross-platform)

> Derived from **docs/PRD.md**, **docs/PRD_technical.md**, and **docs/About.md**.
> Mark tasks `[x]` upon completion. Work top-to-bottom within each milestone.

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

- [ ] **CV approach** (resolve before M1):
  - Option A — Simple grid + frame diff (faster to ship, lower accuracy)
  - Option B — Full piece classification via CoreML/TFLite model (higher accuracy, more ML work)
  - Decision recorded: ___
- [ ] **Backend language** (resolve before M3):
  - Option A — FastAPI (Python, easy Stockfish/LLM integration)
  - Option B — Node.js (same language as RN, fast to write)
  - Option C — Go (best performance, most work)
  - Decision recorded: ___
- [ ] **Multiplayer transport** (resolve before M5):
  - Option A — P2P local WiFi only (simpler, no server needed for sync)
  - Option B — Cloud relay (works across internet, needs backend)
  - Option C — Both (P2P primary, cloud fallback)
  - Decision recorded: ___
- [ ] **Bot engine** (resolve before M6):
  - Option A — Stockfish WASM / native (strong, larger bundle)
  - Option B — Lc0 on-device (experimental)
  - Option C — Cloud engine call (requires connectivity)
  - Decision recorded: ___

---

## 2) Folder & file structure

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

- [ ] `npx @react-native-community/cli init BoardSight --template react-native-template-typescript`
- [ ] Enable strict TypeScript: `"strict": true` in `tsconfig.json`
- [ ] Absolute imports: add `paths` in `tsconfig.json` + `babel-plugin-module-resolver`
- [ ] ESLint + Prettier (`@react-native/eslint-config` base)
- [ ] Husky + lint-staged (pre-commit: lint + type-check)

### 3.2 Core dependencies

- [ ] Navigation: `@react-navigation/native` + `@react-navigation/native-stack`
- [ ] Camera: `react-native-vision-camera` (v3+)
- [ ] Chess rules: `chess.js`
- [ ] Database: `react-native-quick-sqlite`
- [ ] State management: `zustand`
- [ ] Networking (multiplayer): `react-native-tcp-socket` (P2P) + WebSocket client (cloud relay)
- [ ] Date/time: `dayjs`

### 3.3 Dev / test dependencies

- [ ] `jest` + `@testing-library/react-native`
- [ ] `detox` (E2E — configure in QA milestone)
- [ ] `ts-node` (backend scripts)

### 3.4 Native setup

**iOS:**
- [ ] `pod install` in `/ios`
- [ ] Add camera usage description to `Info.plist`
- [ ] Add local network usage description to `Info.plist` (for P2P)
- [ ] Configure signing + bundle ID in Xcode

**Android:**
- [ ] Add camera permission to `AndroidManifest.xml`
- [ ] Add `CHANGE_NETWORK_STATE`, `ACCESS_WIFI_STATE` permissions (P2P)
- [ ] Configure signing keystore (`android/keystore/`)
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

- [ ] All interfaces defined and exported from `src/domain/gamecore/types.ts`
- [ ] CV bridge typed in `src/native/cvModule.ts`
- [ ] Multiplayer session types in `src/domain/multiplayer/`

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

- [ ] `AppState` union type (all states)
- [ ] `AppEvent` union type (all transitions)
- [ ] `transition(state, event) → AppState` pure function
- [ ] Wire to Zustand store
- [ ] Unit-test all valid + invalid transitions

---

## 6) M0 — Foundation (prototype, no camera)

Goal: app boots, navigation works, chess logic runs, DB persists, PGN exports.

- [ ] Stub all screens with placeholder `<Text>`
- [ ] Wire React Navigation: Onboarding → StartGame → Scan → LiveGame → BotGame → Lobby → Review → Library
- [ ] **GameCore:**
  - [ ] chess.js wrapper in `gamecore/index.ts`
  - [ ] `applyMove(move)` → validates + applies → `GameState`
  - [ ] `undoMove()`
  - [ ] `exportPGN()` → PGN string
  - [ ] `loadFEN(fen)` → set position
  - [ ] `getLegalMoves()` → move list
- [ ] Manual move entry UI (tap from/to on `BoardDiagram`)
- [ ] **Clock reducer** (`gamecore/clock.ts`):
  - [ ] Start / stop / switch sides / increment
  - [ ] Tick via `setInterval`; pause on `AppState` background event
  - [ ] Persist `lastTickAt` + remaining ms on each move
- [ ] **SQLite schema v1:**
  ```sql
  games    (id, mode, pgn, result, white_ms, black_ms, created_at, updated_at)
  moves    (id, game_id, san, fen, from_sq, to_sq, white_ms_after, black_ms_after, created_at)
  analysis (id, game_id, status, payload_json, created_at)
  sessions (id, game_id, transport, peer_id, created_at)  -- multiplayer
  ```
  - [ ] Migration runner (sequential `.sql` files + `schema_version` table)
  - [ ] Repositories: `createGame`, `saveMove`, `getGame`, `listGames`, `saveAnalysis`, `getAnalysis`
- [ ] PGN export: share sheet + copy to clipboard
- [ ] Autosave on every `applyMove`
- [ ] Crash recovery: offer resume for any `result = "*"` game on launch

---

## 7) M1 — Vision MVP (OTB scan & live move detection)

### 7.1 Native CV module scaffold

- [ ] **iOS:** Swift/ObjC native module (`CVModule`) — bridge or TurboModule
- [ ] **Android:** Kotlin native module (`CVModule`) — same JS interface
- [ ] Camera control: `startSession` / `stopSession` / `pauseTracking`
- [ ] Emit `onBoardObservation`, `onMoveCandidate`, `onPositionObservation` to JS
- [ ] JS typed wrapper: `src/native/cvModule.ts`
- [ ] Target: ~15fps on mid-range devices, <300ms move candidate latency

### 7.2 Board detection (native)

- [ ] Capture frames via `AVCaptureSession` (iOS) / `Camera2` (Android)
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

- [ ] Live camera preview + `CalibOverlay` grid
- [ ] Confidence indicator + lighting prompt
- [ ] Board orientation indicator (which side is white)
- [ ] FEN confirmation step: display detected position; user adjusts if needed
- [ ] Load confirmed FEN into GameCore → transition to `live_play`

### 7.5 Live move detection + correction

- [ ] Auto-apply high-confidence candidates (≥0.85)
- [ ] Show `ConfirmMoveSheet` for low-confidence candidates
- [ ] Illegal move detected → warning + correction prompt
- [ ] Correction tools: edit last move, takeback, pause tracking, manual turn override
- [ ] Highlight detected from/to squares on `BoardDiagram`

---

## 8) M2 — Clock integration

- [ ] `Clock.tsx`: MM:SS.d display; flashes + haptic on low time (<10s)
- [ ] Time control presets: Bullet (1+0), Blitz (3+2, 5+0), Rapid (10+0, 15+10), Custom
- [ ] Manual clock tap (physical clock behavior)
- [ ] Auto-switch on high-confidence move (configurable threshold)
- [ ] Clock survives: background/foreground, app kill, device lock
- [ ] Timestamp every move with remaining ms (saved to `moves` table)
- [ ] Timeout → `game_end` transition

---

## 9) M3 — Post-game analysis

### 9.1 Backend setup

- [ ] `backend/docker-compose.yml` with services: `api`, `worker`, `postgres`, `redis`
- [ ] API server (`backend/api/`):
  - [ ] `POST /v1/analysis/jobs` → accept PGN, enqueue, return `{ jobId }`
  - [ ] `GET /v1/analysis/jobs/{jobId}` → `{ status }`
  - [ ] `GET /v1/analysis/jobs/{jobId}/result` → full analysis payload
  - [ ] Auth: `X-API-Key` header
  - [ ] OpenAPI spec (`backend/openapi.yaml`)
- [ ] Worker (`backend/worker/`):
  - [ ] Consume job from Redis queue
  - [ ] Stockfish (depth 18–22) → centipawn eval per move
  - [ ] Classify: blunder (>200cp), mistake (>100cp), inaccuracy (>50cp)
  - [ ] Optional LLM: 3–5 plain-language takeaways from annotated PGN
  - [ ] Write result to Postgres; update job status
- [ ] `backend/.env.example`

### 9.2 Analysis router (mobile)

- [ ] `src/domain/analysisRouter/index.ts`: cloud if configured + online, else on-device
- [ ] Settings: `analysisModeDefault`, `cloudEndpointUrl`, `apiKey`, `enableLLMExplanations`
- [ ] `src/api/analysis.ts`: submit → poll every 3s → cache in SQLite
- [ ] Timeout after 60s; surface error state in UI

### 9.3 Review screen

- [ ] Summary card: players, result, date, accuracy %
- [ ] Move list with eval symbols (!, !!, ?, ??, ?!)
- [ ] Evaluation bar (centipawn chart over game timeline)
- [ ] Key moments + best-line recommendations
- [ ] Replay mode: step through moves + eval
- [ ] Scrubber: drag to any move
- [ ] LLM takeaways section (if enabled)

---

## 10) M4 — Export & sharing

- [ ] PGN share via iOS/Android share sheet
- [ ] Copy PGN to clipboard
- [ ] `RecapCard.tsx`: players, result, date, key moments, accuracy → export as PNG (`react-native-view-shot`)
- [ ] Game library:
  - [ ] List games (date, mode, players, result, move count)
  - [ ] Search by player name / date range / result
  - [ ] Tap to open Review; swipe to delete

---

## 11) M5 — Multiplayer (P2P WiFi + cloud relay)

### 11.1 P2P local WiFi

- [ ] Implement `src/domain/multiplayer/p2p.ts`:
  - [ ] Advertise / discover sessions via mDNS (`react-native-zeroconf` or custom UDP broadcast)
  - [ ] TCP socket connection between two phones (`react-native-tcp-socket`)
  - [ ] Protocol: JSON frames with move SAN, clock state, sequence number
  - [ ] Reconnect on drop (buffer up to 30s of moves)
- [ ] **LobbyScreen.tsx:**
  - [ ] "Host game" → show session code / QR
  - [ ] "Join game" → scan QR or enter code
  - [ ] Connection status indicator
- [ ] Sync: host phone records OTB moves; guest phone acts as clock display + secondary viewer
- [ ] Both phones show live move list + clock; both can trigger corrections

### 11.2 Cloud relay (optional)

- [ ] Backend `relay` service: WebSocket server for session routing
- [ ] `src/domain/multiplayer/cloudRelay.ts`: WebSocket client, reconnect logic
- [ ] Fallback: if P2P fails → offer cloud relay (requires server)
- [ ] Remote spectator view: read-only stream of live PGN

### 11.3 Two-phone clock mode

- [ ] Host phone: tracks board + moves
- [ ] Guest phone: acts as dedicated clock switcher
- [ ] Sync clock state via P2P transport on each move
- [ ] Both phones can tap to switch clock sides

---

## 12) M6 — In-app gameplay (vs bots)

- [ ] **BotGameScreen.tsx**: full interactive `BoardDiagram` (tap to move)
- [ ] `src/domain/botEngine/index.ts`:
  - [ ] Wrap Stockfish WASM (or native binary) for on-device move generation
  - [ ] Difficulty levels: Beginner (depth 1–3) / Intermediate (depth 8) / Advanced (depth 18)
  - [ ] Respond within 1–3s (configurable think time)
- [ ] Bot always plays offline (no network required)
- [ ] Modes within bot game:
  - [ ] **Learning mode:** show hint button (best move highlight)
  - [ ] **Tactics puzzles:** generate from user's own game mistakes (post-analysis)
  - [ ] **Opening drill:** practice specific opening lines
  - [ ] **Endgame drill:** preset positions
- [ ] Bot games saved to library + full analysis available

---

## 13) Modes & UX polish

- [ ] **Assist Level toggle** (Off / Light / On) — controls hint visibility across all modes
- [ ] **Referee mode:** illegal move warnings on high-confidence detections only
- [ ] **Teacher mode:** optional hint button (top engine move if Assist ≥ Light)
- [ ] **Commentator mode:** short natural-language comment after each move (LLM, if enabled)
- [ ] **Onboarding flow:** camera permissions + lighting tips + scan demo
- [ ] Dark mode support
- [ ] Haptics on: move confirmation, clock switch, game end

---

## 14) Data & persistence

- [ ] SQLite schema v1 (per §6) + migration runner
- [ ] Autosave on every `applyMove` (no manual save button)
- [ ] Crash recovery: resume active `result = "*"` game on next launch
- [ ] Analysis cache: skip re-request if result already in `analysis` table
- [ ] Session persistence: save/restore multiplayer session ID for reconnect
- [ ] Export / backup: bulk PGN export of all games

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

- [ ] Unit: GameCore (`applyMove`, `undo`, `exportPGN`), state machine transitions, clock reducer
- [ ] Integration: SQLite repositories (in-memory DB), P2P protocol framing
- [ ] Snapshot: Clock, MoveList, RecapCard, EvalBar
- [ ] E2E (Detox): Scan → calibrate → manual moves → export PGN; Bot game → resign → review

### 15.3 Instrumentation

- [ ] Log each `MoveCandidate`: confidence, auto-accepted vs manually corrected
- [ ] Track move detection latency (frame capture → JS event)
- [ ] Track P2P sync latency (host move → guest display)
- [ ] Log manual correction rate per session (target: <10%)
- [ ] Performance targets: 15–30fps CV, <300ms move latency, <100ms P2P sync

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
