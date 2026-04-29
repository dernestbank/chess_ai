import { NativeEventEmitter, NativeModules } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Point {
  x: number;
  y: number;
}

export interface BoardObservation {
  /** Corners in order: top-left, top-right, bottom-right, bottom-left */
  corners: [Point, Point, Point, Point];
  confidence: number; // 0–1
  lightingWarning: boolean;
  timestamp: number; // ms epoch
}

export interface MoveCandidate {
  fromSquare: string; // e.g. "e2"
  toSquare: string;   // e.g. "e4"
  promotion?: 'q' | 'r' | 'b' | 'n';
  confidence: number; // 0–1
  timestamp: number;
}

export interface PositionObservation {
  fen: string;
  occupiedSquares: string[];
  diffFromPrev: string[];
  timestamp: number;
}

export interface CalibrationData {
  corners: [Point, Point, Point, Point];
  boardOrientation: 'white-bottom' | 'black-bottom';
}

export interface CVSessionConfig {
  boardOrientation: 'white-bottom' | 'black-bottom';
  targetFps?: number;           // default 15
  enablePositionObs?: boolean;  // default false (expensive)
  confidenceThreshold?: number; // default 0.85
}

export interface CVModuleCallbacks {
  onBoardObservation?: (obs: BoardObservation) => void;
  onMoveCandidate?: (candidate: MoveCandidate) => void;
  onPositionObservation?: (pos: PositionObservation) => void;
}

// ---------------------------------------------------------------------------
// Native module binding
// ---------------------------------------------------------------------------
const NativeCV = NativeModules.CVModuleNative as {
  startSession: (config: CVSessionConfig) => void;
  stopSession: () => void;
  pauseTracking: (paused: boolean) => void;
  setCalibration: (calib: CalibrationData) => void;
  requestKeyFrame: () => void;
} | null;

const MOCK_MODE = !NativeCV;

if (MOCK_MODE) {
  console.warn(
    '[CVModule] Native module CVModuleNative not found — running in MOCK mode. ' +
    'Mock events will fire every 2s for simulator testing.',
  );
}

// ---------------------------------------------------------------------------
// CVModule class
// ---------------------------------------------------------------------------
export class CVModule {
  private emitter: NativeEventEmitter | null = null;
  private subscriptions: ReturnType<NativeEventEmitter['addListener']>[] = [];
  private mockTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: CVModuleCallbacks = {};
  private mockSeq = 0;

  constructor() {
    if (NativeCV) {
      this.emitter = new NativeEventEmitter(NativeModules.CVModuleNative);
    }
  }

  startSession(config: CVSessionConfig, callbacks: CVModuleCallbacks): void {
    this.cleanup();
    this.callbacks = callbacks;

    if (NativeCV) {
      NativeCV.startSession(config);
      if (callbacks.onBoardObservation) {
        this.subscriptions.push(
          this.emitter!.addListener('onBoardObservation', callbacks.onBoardObservation),
        );
      }
      if (callbacks.onMoveCandidate) {
        this.subscriptions.push(
          this.emitter!.addListener('onMoveCandidate', callbacks.onMoveCandidate),
        );
      }
      if (callbacks.onPositionObservation) {
        this.subscriptions.push(
          this.emitter!.addListener('onPositionObservation', callbacks.onPositionObservation),
        );
      }
    } else {
      // Mock mode: emit fake board observations periodically
      this.mockTimer = setInterval(() => {
        const obs: BoardObservation = {
          corners: [
            { x: 50, y: 50 },
            { x: 350, y: 50 },
            { x: 350, y: 350 },
            { x: 50, y: 350 },
          ],
          confidence: 0.92,
          lightingWarning: false,
          timestamp: Date.now(),
        };
        callbacks.onBoardObservation?.(obs);

        // Emit a mock move candidate on every 5th tick
        this.mockSeq++;
        if (this.mockSeq % 5 === 0) {
          const mockMoves = [
            { from: 'e2', to: 'e4' },
            { from: 'e7', to: 'e5' },
            { from: 'g1', to: 'f3' },
            { from: 'b8', to: 'c6' },
          ];
          const pick = mockMoves[Math.floor(Math.random() * mockMoves.length)];
          if (!pick) { return; }
          const candidate: MoveCandidate = {
            fromSquare: pick.from,
            toSquare: pick.to,
            confidence: 0.91,
            timestamp: Date.now(),
          };
          callbacks.onMoveCandidate?.(candidate);
        }
      }, 2000);
    }
  }

  stopSession(): void {
    this.cleanup();
    NativeCV?.stopSession();
  }

  pauseTracking(paused: boolean): void {
    NativeCV?.pauseTracking(paused);
    if (MOCK_MODE) {
      if (paused) {
        this.stopMockTimer();
      } else if (this.callbacks.onBoardObservation || this.callbacks.onMoveCandidate) {
        // Resume mock timer
        this.startSession(
          { boardOrientation: 'white-bottom' },
          this.callbacks,
        );
      }
    }
  }

  setCalibration(calib: CalibrationData): void {
    NativeCV?.setCalibration(calib);
  }

  /** Debug only — saves annotated frame to photo library in native debug builds. */
  requestKeyFrame(): void {
    if (__DEV__) {
      NativeCV?.requestKeyFrame();
    }
  }

  private cleanup(): void {
    this.subscriptions.forEach(sub => sub.remove());
    this.subscriptions = [];
    this.stopMockTimer();
  }

  private stopMockTimer(): void {
    if (this.mockTimer !== null) {
      clearInterval(this.mockTimer);
      this.mockTimer = null;
    }
  }
}

/** Singleton — import and use this throughout the app. */
export const cvModule = new CVModule();
