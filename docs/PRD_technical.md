

More technical [[PRD]]
----

Great — here’s the refined technical spec **optimized for React Native** (iOS-first), with **native CV module**, **APIs**, **data models**, and a **lean architecture diagram** you can hand to engineers.

---

# Technical Spec — React Native (iOS-first), Device + Self-hosted Cloud Analysis

## 1) High-level architecture (React Native + Native CV)

```
┌─────────────────────────────── React Native App ───────────────────────────────┐
│ UI (RN)                                                                         │
│  - Scan/Calibrate Screen  - Live Game Screen  - Review Screen  - Game Library  │
│                                                                                 │
│ JS/TS Domain Layer                                                               │
│  - GameCore (rules+clock+PGN)  - State Machine  - Persistence  - API Client     │
│                                                                                 │
│ Native Modules (iOS-first)                                                      │
│  - CameraCapture (AVFoundation)                                                 │
│  - CVPipeline (board/piece/move candidates, confidence)                         │
│  - (Optional) OnDeviceStockfish Runner                                          │
└────────────────────────────────────────────────────────────────────────────────┘

             Optional Self-hosted Backend
┌────────────────────────────── Backend (Docker) ────────────────────────────────┐
│ API (FastAPI/Node/Go) ─ Auth (API Key/JWT)                                      │
│   ├─ /games, /moves, /analysis/jobs                                             │
│ Postgres (metadata)   Redis (job queue)   MinIO (optional uploads)             │
│ Analysis Workers: Stockfish (+ optional LLM explanations in your environment)   │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Key principle:** RN handles UX + game state + storage; **native module** owns **real-time camera/CV** to keep latency low.

---

## 2) React Native implementation choices (recommended)

### 2.1 RN framework & camera

- **react-native-vision-camera** for camera access + frame processors
    
- iOS native: AVFoundation + CoreML/TFLite + OpenCV (as needed)
    

### 2.2 Native integration style

- Use **TurboModules + JSI** (best performance) OR classic bridge (faster to ship MVP).
    
- **MVP recommendation:** start with classic bridge if speed is priority; migrate to JSI if you hit FPS bottlenecks.
    

### 2.3 On-device engine option

- Stockfish via native wrapper (iOS static lib) or JS WASM (WASM is simpler but slower on mobile).
    
- **MVP:** Cloud analysis first + optional “lite on-device” later.
    

---

## 3) Core module contracts (critical for maintainability)

### 3.1 CV Module Interface (RN ↔ Native)

Expose a minimal, stable interface:

**Native → RN events**

- `onBoardObservation(obs)`
    
- `onMoveCandidate(candidate)`
    
- `onPositionObservation(posObs)` (optional)
    

**RN → Native commands**

- `startSession(config)`
    
- `stopSession()`
    
- `pauseTracking(bool)`
    
- `setCalibration(calib)`
    
- `requestKeyFrame()` (optional, for debugging)
    

### 3.2 Data payloads (canonical)

These should be JSON-serializable (bridge-friendly).

```ts
// Board geometry + confidence
export type BoardObservation = {
  timestampMs: number;
  corners: [number, number][]; // 4 points
  orientationHint?: "white_bottom" | "black_bottom" | "unknown";
  confidence: number; // 0..1
};

// A move candidate proposed by CV
export type MoveCandidate = {
  timestampMs: number;
  fromSq: string; // "e2"
  toSq: string;   // "e4"
  flags?: {
    capture?: boolean;
    castle?: "K" | "Q" | "k" | "q";
    promotion?: "q" | "r" | "b" | "n";
    enPassant?: boolean;
  };
  confidence: number;  // 0..1
  evidence?: {
    deltaSquares?: string[];
    occlusion?: boolean;
  };
};

// Optional: per-frame position map (heavy; keep off by default)
export type PositionObservation = {
  timestampMs: number;
  fenLike?: string; // if you compute it
  occupancy?: Record<string, "empty" | "occupied">;
  confidence: number;
};
```

---

## 4) GameCore (JS/TS) — rules, clock, PGN

### 4.1 GameCore responsibilities

- Maintains canonical state:
    
    - current `FEN`
        
    - move list (UCI + SAN)
        
    - clock state (base + increment)
        
- Validates CV-proposed moves:
    
    - if legal & consistent → accept
        
    - if uncertain → request confirmation UI
        
- Applies corrections:
    
    - undo / edit last move / manual entry
        

### 4.2 Rules engine

Use a proven library:

- **chess.js** (JS) for legality + SAN generation
    
- Store canonical move in **UCI** + derived SAN
    

---

## 5) State machine (scan → play → review)

### 5.1 States

1. `idle`
    
2. `scan_board`
    
3. `calibrate`
    
4. `live_play`
    
5. `move_confirm` (low confidence / ambiguous)
    
6. `paused`
    
7. `game_end`
    
8. `analysis_pending`
    
9. `review_ready`
    

### 5.2 Transition rules (important)

- `scan_board` → `calibrate` when board confidence >= threshold for N frames
    
- `calibrate` → `live_play` when user confirms starting position (FEN locked)
    
- `live_play` → `move_confirm` when:
    
    - move confidence < threshold OR
        
    - multiple plausible moves OR
        
    - promotion/en-passant uncertain
        
- `move_confirm` → `live_play` after user confirms/edits
    
- `game_end` → `analysis_pending` when user taps “Analyze”
    
- `analysis_pending` → `review_ready` when analysis result saved
    

---

## 6) Persistence (local-first, cloud optional)

### 6.1 Local DB (recommended)

- **SQLite** via `react-native-quick-sqlite` or `expo-sqlite` (if Expo)
    
- Store games/moves/analysis locally, so app works offline.
    

### 6.2 Tables (minimal)

- `games`
    
- `moves`
    
- `analysis`
    

(Positions table optional; add later if needed for replay accuracy.)

---

## 7) API spec (self-hosted backend)

### 7.1 Auth

**API Key** is easiest for self-hosting:

- Header: `X-API-Key: <key>`
    

### 7.2 Endpoints (MVP)

- `POST /v1/analysis/jobs` (submit PGN + settings)
    
- `GET /v1/analysis/jobs/{jobId}` (status)
    
- `GET /v1/analysis/jobs/{jobId}/result` (analysis JSON)
    

Optional sync:

- `POST /v1/games`
    
- `POST /v1/games/{gameId}/moves:batch`
    
- `POST /v1/games/{gameId}/finish`
    

---

## 8) OpenAPI YAML (starter)

You can paste this into a backend repo and expand.

```yaml
openapi: 3.0.3
info:
  title: BoardSight Chess API
  version: 0.1.0
servers:
  - url: https://your-domain.example.com
paths:
  /v1/analysis/jobs:
    post:
      summary: Create analysis job
      security:
        - ApiKeyAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [pgn]
              properties:
                game_id: { type: string }
                pgn: { type: string }
                engine:
                  type: object
                  properties:
                    depth: { type: integer, default: 14 }
                    multipv: { type: integer, default: 1 }
                explanations:
                  type: object
                  properties:
                    mode: { type: string, enum: [off, template, llm], default: template }
      responses:
        "200":
          description: Job created
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id: { type: string }
                  status: { type: string, enum: [queued] }

  /v1/analysis/jobs/{job_id}:
    get:
      summary: Get job status
      security:
        - ApiKeyAuth: []
      parameters:
        - name: job_id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: Job status
          content:
            application/json:
              schema:
                type: object
                properties:
                  job_id: { type: string }
                  status: { type: string, enum: [queued, running, succeeded, failed] }
                  progress:
                    type: object
                    properties:
                      moves_done: { type: integer }
                      moves_total: { type: integer }

  /v1/analysis/jobs/{job_id}/result:
    get:
      summary: Get analysis result
      security:
        - ApiKeyAuth: []
      parameters:
        - name: job_id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: Analysis result
          content:
            application/json:
              schema:
                type: object
                properties:
                  analysis_id: { type: string }
                  game_id: { type: string }
                  mode: { type: string, enum: [device, cloud] }
                  engine:
                    type: object
                    properties:
                      name: { type: string }
                      depth: { type: integer }
                  summary:
                    type: object
                    properties:
                      blunders: { type: integer }
                      mistakes: { type: integer }
                      inaccuracies: { type: integer }
                      key_moments:
                        type: array
                        items: { type: integer }
                  per_move:
                    type: array
                    items:
                      type: object
                      properties:
                        ply: { type: integer }
                        eval_cp: { type: integer }
                        best_uci: { type: string }
                        classification: { type: string }
                  takeaways:
                    type: array
                    items: { type: string }

components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
```

---

## 9) Backend worker logic (Stockfish + optional LLM)

### 9.1 Job flow

1. API receives PGN → creates job in Postgres
    
2. Push job to Redis queue
    
3. Worker runs Stockfish evaluations:
    
    - per ply eval (`cp` or mate)
        
    - best line for “key moments”
        
    - classification based on eval swing thresholds
        
4. Optional LLM takes **structured engine outputs** → generates takeaways
    
5. Store final analysis; job status → `succeeded`
    

### 9.2 Classification heuristic (MVP)

- Compute `delta = eval_after - eval_before` (normalized for side-to-move)
    
- Thresholds:
    
    - `|delta| > 300cp` → blunder
        
    - `> 150cp` → mistake
        
    - `> 80cp` → inaccuracy
        

---

## 10) Repo & folder structure (RN app)

Suggested structure to keep clean boundaries:

```
/app
  /src
    /ui
      /screens (Scan, LiveGame, Review, Library)
      /components (Clock, MoveList, CalibOverlay, ConfirmMoveSheet)
    /domain
      /gamecore (rules, clock, move acceptance, PGN)
      /stateMachine
      /analysisRouter (device vs cloud)
    /native
      cvModule.ts (typed wrapper)
      camera.ts
    /data
      db.ts (sqlite)
      models.ts
      repositories.ts
    /api
      client.ts
      analysis.ts
```

---

## 11) iOS native module responsibilities (what to build first)

### MVP iOS native

- camera feed control (start/stop)
    
- board detection + stable grid
    
- “move candidate” detection + confidence
    
- (optional) ability to output debug overlays for dev builds
    

### Performance target (MVP)

- stable detection at ~15fps on mid-range iPhones
    
- move candidate latency: < 300ms after a completed move (practical target)
    

---

## 12) Configuration for analysis mode (device vs cloud)

### In-app settings

- `analysisModeDefault`: `cloud | device | ask`
    
- `cloudEndpointUrl`
    
- `apiKey`
    
- `enableLLMExplanations` (cloud only)
    

### AnalysisRouter logic

- if `device` and Stockfish available → run locally
    
- else → submit cloud job → poll → cache result
    

---

## 13) Docker Compose (self-hosted MVP stack)

Minimum stack:

- API service
    
- Worker service
    
- Postgres
    
- Redis
    
- (Optional) MinIO
    

If you want, I can draft the exact `docker-compose.yml` and a basic FastAPI skeleton.

---

# Next: pick 2 engineering decisions and I’ll lock the spec tightly

To finalize interfaces and remove ambiguity, choose:

1. **CV approach** for MVP:
    
    - **A:** board grid + occupancy diff → move candidates (simpler)
        
    - **B:** full piece classification every frame (harder, more robust long-term)
        
2. **Backend language** (for your self-hosted environment):
    
    - FastAPI (Python) / Node (Nest) / Go
        

If you don’t want to decide now: I’d default MVP to **A + FastAPI**.