/**
 * Unit tests for src/native/cvModule.ts (CVModule class, mock mode).
 *
 * In Jest (Node.js), NativeModules.CVModuleNative is undefined, so all tests
 * run in MOCK mode — no native bridge involved.
 * We use fake timers to control the setInterval without waiting 2s per tick.
 */

// ---------------------------------------------------------------------------
// Suppress the "[CVModule] Native module not found" warning in test output
// ---------------------------------------------------------------------------
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('[CVModule]')) return;
    originalWarn(...args);
  };
});
afterAll(() => { console.warn = originalWarn; });

import { CVModule } from '../../src/native/cvModule';
import type { BoardObservation, MoveCandidate, CVSessionConfig } from '../../src/native/cvModule';

const DEFAULT_CONFIG: CVSessionConfig = { boardOrientation: 'white-bottom' };

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// startSession — mock mode board observations
// ---------------------------------------------------------------------------

describe('CVModule.startSession() — mock mode', () => {
  it('fires onBoardObservation after the first timer tick', () => {
    const mod = new CVModule();
    const onBoardObs = jest.fn<void, [BoardObservation]>();

    mod.startSession(DEFAULT_CONFIG, { onBoardObservation: onBoardObs });
    expect(onBoardObs).not.toHaveBeenCalled(); // not yet

    jest.advanceTimersByTime(2000); // first tick
    expect(onBoardObs).toHaveBeenCalledTimes(1);

    const obs = onBoardObs.mock.calls[0]![0];
    expect(obs.confidence).toBeCloseTo(0.92);
    expect(obs.corners).toHaveLength(4);
    expect(obs.lightingWarning).toBe(false);
    expect(typeof obs.timestamp).toBe('number');
  });

  it('fires onBoardObservation on every subsequent tick', () => {
    const mod = new CVModule();
    const onBoardObs = jest.fn<void, [BoardObservation]>();

    mod.startSession(DEFAULT_CONFIG, { onBoardObservation: onBoardObs });

    jest.advanceTimersByTime(8000); // 4 ticks
    expect(onBoardObs).toHaveBeenCalledTimes(4);
  });

  it('fires onMoveCandidate on every 5th tick', () => {
    const mod = new CVModule();
    const onMoveCandidate = jest.fn<void, [MoveCandidate]>();

    mod.startSession(DEFAULT_CONFIG, { onMoveCandidate });

    jest.advanceTimersByTime(10000); // 5 ticks — 5th fires move candidate
    expect(onMoveCandidate).toHaveBeenCalledTimes(1);

    const cand = onMoveCandidate.mock.calls[0]![0];
    expect(typeof cand.fromSquare).toBe('string');
    expect(typeof cand.toSquare).toBe('string');
    expect(cand.confidence).toBeGreaterThan(0);
  });

  it('does not fire callbacks if they are not provided', () => {
    const mod = new CVModule();
    // No callbacks — should not throw
    expect(() => {
      mod.startSession(DEFAULT_CONFIG, {});
      jest.advanceTimersByTime(10000);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// stopSession — clears the mock timer
// ---------------------------------------------------------------------------

describe('CVModule.stopSession()', () => {
  it('stops firing callbacks after stopSession()', () => {
    const mod = new CVModule();
    const onBoardObs = jest.fn<void, [BoardObservation]>();

    mod.startSession(DEFAULT_CONFIG, { onBoardObservation: onBoardObs });
    jest.advanceTimersByTime(2000); // first tick
    expect(onBoardObs).toHaveBeenCalledTimes(1);

    mod.stopSession();
    jest.advanceTimersByTime(10000); // would be 5 more ticks if running
    expect(onBoardObs).toHaveBeenCalledTimes(1); // still 1
  });
});

// ---------------------------------------------------------------------------
// startSession called twice — cleanup before starting
// ---------------------------------------------------------------------------

describe('CVModule — re-entrant startSession', () => {
  it('starting a second session clears the first timer', () => {
    const mod = new CVModule();
    const obs1 = jest.fn<void, [BoardObservation]>();
    const obs2 = jest.fn<void, [BoardObservation]>();

    mod.startSession(DEFAULT_CONFIG, { onBoardObservation: obs1 });
    jest.advanceTimersByTime(2000); // first tick — obs1 called once
    expect(obs1).toHaveBeenCalledTimes(1);

    // Start a new session — should stop the old timer
    mod.startSession(DEFAULT_CONFIG, { onBoardObservation: obs2 });
    jest.advanceTimersByTime(4000); // 2 more ticks — obs1 should NOT fire again
    expect(obs1).toHaveBeenCalledTimes(1); // no change
    expect(obs2).toHaveBeenCalledTimes(2); // two ticks on second session
  });
});

// ---------------------------------------------------------------------------
// BoardObservation shape
// ---------------------------------------------------------------------------

describe('BoardObservation shape', () => {
  it('corners are an array of 4 {x,y} points', () => {
    const mod = new CVModule();
    const obs: BoardObservation[] = [];
    mod.startSession(DEFAULT_CONFIG, { onBoardObservation: (o) => obs.push(o) });
    jest.advanceTimersByTime(2000);
    mod.stopSession();

    const corners = obs[0]!.corners;
    expect(corners).toHaveLength(4);
    corners.forEach(pt => {
      expect(typeof pt.x).toBe('number');
      expect(typeof pt.y).toBe('number');
    });
  });

  it('has a timestamp close to Date.now()', () => {
    const mod = new CVModule();
    const obs: BoardObservation[] = [];
    const before = Date.now();
    mod.startSession(DEFAULT_CONFIG, { onBoardObservation: (o) => obs.push(o) });
    jest.advanceTimersByTime(2000);
    mod.stopSession();

    expect(obs[0]!.timestamp).toBeGreaterThanOrEqual(before);
  });
});
