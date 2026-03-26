# PRD — Realtime Chess AI Agent (MVP)

## 1) Product overview

### Product name (working)

**BoardSight Chess** (placeholder)

### One-line description

A real-time chess companion that uses a phone camera to **recognize a physical board**, **auto-record moves**, run a **digital chess clock**, and generate **post-game analysis**.

### Elevator pitch

Players set up a phone to view an over-the-board chess game. The app detects the board and pieces, automatically tracks each move into PGN, optionally flags illegal moves, manages time controls, and produces a clean post-game analysis and shareable recap.

---

## 2) Goals & success metrics

### Goals (MVP)

1. Accurately track board state and moves in real-time using a single phone camera.
    
2. Provide reliable chess clock/timer functionality integrated with move recording.
    
3. Produce post-game review: move list + engine eval + key moments.
    
4. Enable easy export/sharing (PGN + summary).
    

### Non-goals (MVP)

- Tournament certification / official arbiter compliance
    
- Full live multiplayer remote play
    
- VR/AR glasses integration
    
- Proprietary hardware device integration
    
- Continuous “in-game coaching” beyond basic hints toggle (keep it minimal)
    

### Success metrics (first 90 days after launch)

- **Activation rate:** % of new users who successfully complete “first scan + record 10 moves”
    
- **Move tracking accuracy:** % moves correctly detected without manual correction
    
- **Session completion:** % recorded games that reach post-game summary
    
- **Share/export usage:** % games exported as PGN or shared
    
- **Retention:** week-1 retention for users who recorded at least 1 full game
    

---

## 3) Target users & use cases

### Primary users

1. **Casual players** playing OTB at home/campus.
    
2. **Chess club players** who want to record games quickly.
    
3. **Content creators** who want a clean recap and analysis.
    

### MVP use cases

- Record a casual OTB game hands-free.
    
- Use the app as a clock and move logger.
    
- Review the game afterwards with annotated insights.
    
- Export PGN to Lichess/Chess.com/Stockfish/etc.
    

---

## 4) Core user stories (MVP)

1. **As a player**, I want the app to scan my physical board and confirm it understands the starting position.
    
2. **As a player**, I want moves automatically recorded as I play.
    
3. **As a player**, I want to correct a move if the app gets it wrong (quickly).
    
4. **As a player**, I want a built-in clock (with increment) so I don’t need separate hardware.
    
5. **As a player**, I want post-game analysis showing mistakes, blunders, and best lines.
    
6. **As a player**, I want to export PGN and share a summary.
    

---

## 5) MVP feature scope (what we ship)

## A) Board scanning & calibration (Required)

**Description:** Detect board grid, orientation, and pieces. Establish a stable baseline position.

**Requirements**

- Camera setup guide: “place phone here” overlay.
    
- Board detection: find 8x8 grid; confirm orientation (white at bottom).
    
- Piece detection: initial piece placement recognition.
    
- Calibration step: user confirms/edits starting position if needed.
    
- Lighting guidance prompts (too dark / glare).
    

**Acceptance criteria**

- User can complete scan + confirmation in under 60 seconds.
    
- App produces a valid FEN from scan.
    
- If scan confidence < threshold, app requests adjustment.
    

---

## B) Real-time move tracking & notation (Required)

**Description:** Track board state and convert physical moves into digital moves.

**Requirements**

- Detect move changes between frames (piece moved from square A to B).
    
- Handle captures.
    
- Handle castling.
    
- Handle en passant (initially via inference + fallback to manual confirm if uncertain).
    
- Detect promotion (prompt user if uncertain).
    
- Maintain a move list with timestamps.
    
- Output PGN at end.
    

**Manual correction tools (MVP-critical)**

- “Confirm move” when confidence is low (tap highlight squares).
    
- “Edit last move” (choose from-to squares).
    
- “Takeback/undo” with confirmation.
    
- “Pause tracking” toggle.
    

**Acceptance criteria**

- For a standard game in good lighting, >90% of moves are auto-recorded without manual fix in internal testing conditions (define test protocol).
    
- User can correct any move in under 10 seconds.
    

---

## C) Chess clock / timer (Required)

**Description:** Built-in clock synchronized with moves.

**Requirements**

- Time controls: bullet/blitz/rapid presets + custom (base time + increment).
    
- Start/pause/resume.
    
- Tap to switch turns (large button).
    
- Optional “auto-switch on detected move” (only if reliable; otherwise keep manual).
    
- Flag fall indicator.
    
- Time-stamped moves.
    

**Acceptance criteria**

- Clock never desyncs or loses state when screen locks briefly (handle OS backgrounding).
    
- When a move is recorded, the move timestamp matches active player time state.
    

---

## D) Post-game analysis (Required)

**Description:** After the game, provide analysis using an engine + AI explanations.

**Requirements**

- Game summary: result (manual input if unknown), number of moves, time control.
    
- Engine evaluation per move (basic).
    
- Identify key moments: blunders/mistakes/best moves.
    
- Provide 3–5 “learning takeaways” in plain language.
    
- Show suggested better line for each major mistake (limit depth to keep fast).
    
- “Replay mode” with scrubber through moves.
    

**Acceptance criteria**

- Analysis completes within acceptable time (target: <30 sec on device or via server).
    
- Users can tap a mistake and see recommended move + short explanation.
    

---

## E) Export & sharing (Required)

**Description:** Make the output portable and social.

**Requirements**

- Export PGN (share sheet).
    
- Copy PGN to clipboard.
    
- Export a simple “game recap” image/card: players, result, key moments.
    
- Save games locally; basic game library.
    

**Acceptance criteria**

- PGN exports are valid and importable into common chess tools.
    

---

## F) Modes (MVP)

For MVP, keep it lean:

- **Referee mode (lightweight):** illegal move _warnings_ when confident (do not be overly strict).
    
- **Teacher mode (minimal):** optional “hint” button (not constant coaching).
    
- **Commentator mode (basic):** after-move short narration in review, not constant live talk.
    

(You can label these in UI as “Assist Level: Off / Light / On” to avoid complexity.)

---

## 6) UX / Screens (MVP flow)

### Screen 1: Onboarding

- “What you need”: phone stand recommended, good lighting
    
- Permissions: camera, storage
    
- Quick demo video (optional)
    

### Screen 2: Start Game

- Choose mode: Record + Clock (default)
    
- Time control selection
    
- Player names (optional)
    
- Color orientation (white at bottom / black at bottom)
    

### Screen 3: Scan & Calibrate

- Live camera overlay grid
    
- Confidence indicators
    
- “Confirm position” → shows detected board with editable pieces
    

### Screen 4: Live Game

- Top: evaluation indicator (optional, can be off)
    
- Middle: clock + turn switch
    
- Bottom: last move + move list
    
- Buttons: Pause, Undo, Edit last, End game
    

### Screen 5: Post-game Review

- Summary card
    
- Move list + eval
    
- Key moments
    
- Replay board
    
- Export / share
    

### Screen 6: Game Library

- Saved games
    
- Search by date/opponent/time control
    
- Export anytime
    

---

## 7) Functional requirements (detailed)

### Computer vision pipeline (MVP baseline)

- Board detection (grid corners)
    
- Square mapping & homography transform
    
- Piece classification (or state-difference approach)
    
- Temporal smoothing to reduce jitter
    
- Confidence scoring for moves
    

### Data formats

- Store: FEN snapshots per move (optional), PGN final
    
- Game metadata: time control, date, player names, result
    

### Offline vs online (recommendation)

- MVP can be **hybrid**:
    
    - On-device detection & logging
        
    - Engine analysis either on-device (Stockfish) OR cloud for speed
        
- If cloud: must support “queue and notify when ready” inside app (no background promises; just in-app status)
    

---

## 8) Non-functional requirements

### Performance

- Live detection must run at usable FPS (target: 15–30 fps depending device).
    
- Battery use: provide “low power mode” (lower frame rate).
    

### Reliability

- Autosave during game.
    
- Recoverable session if app closes.
    

### Privacy & security

- Camera feed processed locally by default.
    
- If any upload is required (analysis), explicit opt-in and clear notice.
    
- No default storage of raw video unless user enables.
    

### Accessibility

- Large clock fonts
    
- High contrast mode
    
- Voice readout (optional later)
    

---

## 9) Edge cases & constraints (MVP handling)

- Poor lighting/glare → prompt user to adjust
    
- Non-standard piece sets → allow calibration and “piece style” selection later
    
- Hands occluding board → tolerate short occlusions via smoothing
    
- Fast blitz moves → encourage “clock tap” and allow quick edit
    
- Promotions, en passant → prompt when uncertain
    
- Illegal move detection: warn only when highly confident to avoid false accusations
    

---

## 10) Dependencies & build plan

### Suggested technical approach (high level)

- Mobile: Flutter / React Native / native (your choice)
    
- CV: OpenCV + on-device ML model (TensorFlow Lite / CoreML)
    
- Engine: Stockfish (on-device) or server-side
    
- Sync (later): Bluetooth / WebRTC / local network (not MVP)
    

---

## 11) MVP milestones

### M0 — Prototype

- Board detection + manual move input + PGN export
    

### M1 — Vision MVP

- Auto move detection (basic) + correction tools
    

### M2 — Clock integration

- Time controls + game session stability
    

### M3 — Post-game analysis

- Engine eval + key moments + replay
    

### M4 — Share & polish

- Game library + recap card + onboarding
    

---

## 12) Out of scope (Post-MVP roadmap)

- Two-phone live syncing (secondary timer switcher)
    
- Remote live play / spectator mode
    
- Hardware IoT clock integration
    
- AR glasses integration (Meta)
    
- VR training environment
    
- “Patented” device program
    

---

## 13) QA & testing plan (MVP)

- Test environments:
    
    - 3 lighting conditions (bright, normal, dim)
        
    - 3 board designs (classic, high-contrast, patterned)
        
    - 2 piece styles
        
- Game pace:
    
    - slow (10+5), blitz (5+0)
        
- Metrics to log:
    
    - move confidence distribution
        
    - number of manual corrections per game
        
    - time between move and detection
        

---

## 14) MVP deliverables checklist

-  Onboarding + permissions
    
-  Scan & calibration
    
-  Live tracking + move list + correction tools
    
-  Chess clock with presets + custom
    
-  Post-game analysis + replay
    
-  Export PGN + recap share card
    
-  Game library (local)
    

---

