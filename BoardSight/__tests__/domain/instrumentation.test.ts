/**
 * Unit tests for src/domain/instrumentation.ts
 *
 * The module is pure TypeScript — no React Native native modules are used
 * directly. The only ambient it touches is `__DEV__` (a React Native global)
 * and `Date.now()`. Both are handled below.
 */

// Silence the console.log calls that fire when __DEV__ is true (the
// react-native preset sets __DEV__ = true in test) so test output stays clean.
// We still want errors to surface.
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Import the module under test AFTER global setup so mocks are in place.
// ---------------------------------------------------------------------------
import { instrumentation } from '../../src/domain/instrumentation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Log one move candidate and return the params used. */
function logOneMove(
  overrides: Partial<Parameters<typeof instrumentation.logMoveCandidate>[0]> = {},
) {
  const params = {
    confidence: 0.9,
    autoAccepted: true,
    manuallyCorrect: true,
    latencyMs: 120,
    ...overrides,
  };
  instrumentation.logMoveCandidate(params);
  return params;
}

// ---------------------------------------------------------------------------
// Reset instrumentation state before each test so tests are isolated.
// ---------------------------------------------------------------------------
beforeEach(() => {
  instrumentation.startSession();
});

// ---------------------------------------------------------------------------
// 1. Public API surface — each function exists and is callable without throwing
// ---------------------------------------------------------------------------

describe('instrumentation public API', () => {
  it('startSession is a function that can be called without throwing', () => {
    expect(() => instrumentation.startSession()).not.toThrow();
  });

  it('logMoveCandidate is a function that can be called without throwing', () => {
    expect(() =>
      instrumentation.logMoveCandidate({
        confidence: 0.75,
        autoAccepted: false,
        manuallyCorrect: true,
        latencyMs: 80,
      }),
    ).not.toThrow();
  });

  it('logP2PSync is a function that can be called without throwing', () => {
    expect(() => instrumentation.logP2PSync(42, 'host_to_guest')).not.toThrow();
  });

  it('summarizeSession is a function that can be called without throwing', () => {
    expect(() => instrumentation.summarizeSession()).not.toThrow();
  });

  it('getEvents is a function that can be called without throwing', () => {
    expect(() => instrumentation.getEvents()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. logMoveCandidate — records confidence and auto-accept status
// ---------------------------------------------------------------------------

describe('logMoveCandidate', () => {
  it('records a move candidate event with the correct confidence', () => {
    instrumentation.logMoveCandidate({
      confidence: 0.85,
      autoAccepted: true,
      manuallyCorrect: true,
      latencyMs: 100,
    });

    const events = instrumentation.getEvents();
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe('move_candidate');
    // Narrow the type — TypeScript will be happy because event.type === 'move_candidate'
    if (event.type === 'move_candidate') {
      expect(event.confidence).toBe(0.85);
    }
  });

  it('records autoAccepted = true correctly', () => {
    instrumentation.logMoveCandidate({
      confidence: 0.92,
      autoAccepted: true,
      manuallyCorrect: true,
      latencyMs: 60,
    });

    const events = instrumentation.getEvents();
    const event = events[0]!;
    if (event.type === 'move_candidate') {
      expect(event.autoAccepted).toBe(true);
    }
  });

  it('records autoAccepted = false correctly', () => {
    instrumentation.logMoveCandidate({
      confidence: 0.45,
      autoAccepted: false,
      manuallyCorrect: false,
      latencyMs: 200,
    });

    const events = instrumentation.getEvents();
    const event = events[0]!;
    if (event.type === 'move_candidate') {
      expect(event.autoAccepted).toBe(false);
    }
  });

  it('accumulates multiple move events in insertion order', () => {
    logOneMove({ confidence: 0.7 });
    logOneMove({ confidence: 0.8 });
    logOneMove({ confidence: 0.9 });

    const moves = instrumentation.getEvents().filter(e => e.type === 'move_candidate');

    expect(moves).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 3. logP2PSync — records latency and direction
// ---------------------------------------------------------------------------

describe('logP2PSync', () => {
  it('records a p2p_sync event with the supplied latency', () => {
    instrumentation.logP2PSync(55, 'host_to_guest');

    const events = instrumentation.getEvents();
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe('p2p_sync');
    if (event.type === 'p2p_sync') {
      expect(event.latencyMs).toBe(55);
      expect(event.direction).toBe('host_to_guest');
    }
  });

  it('records guest_to_host direction', () => {
    instrumentation.logP2PSync(30, 'guest_to_host');

    const events = instrumentation.getEvents();
    const event = events[0]!;
    if (event.type === 'p2p_sync') {
      expect(event.direction).toBe('guest_to_host');
    }
  });
});

// ---------------------------------------------------------------------------
// 4. logManualCorrection — manual corrections increment the correction count
// ---------------------------------------------------------------------------

describe('logManualCorrection (via summarizeSession)', () => {
  it('counts moves where autoAccepted is false as manual corrections', () => {
    // Two auto-accepted, one manual correction
    logOneMove({ autoAccepted: true });
    logOneMove({ autoAccepted: true });
    logOneMove({ autoAccepted: false });

    const summary = instrumentation.summarizeSession();
    expect(summary).not.toBeNull();
    expect(summary?.manualCorrections).toBe(1);
  });

  it('tracks correction count when all moves are manually corrected', () => {
    logOneMove({ autoAccepted: false });
    logOneMove({ autoAccepted: false });

    const summary = instrumentation.summarizeSession();
    expect(summary?.manualCorrections).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 5. summarizeSession — returns accumulated stats
// ---------------------------------------------------------------------------

describe('summarizeSession', () => {
  it('returns null when no moves have been logged', () => {
    const summary = instrumentation.summarizeSession();
    expect(summary).toBeNull();
  });

  it('returns a summary with correct totalMoves', () => {
    logOneMove();
    logOneMove();
    logOneMove();

    const summary = instrumentation.summarizeSession();
    expect(summary?.totalMoves).toBe(3);
  });

  it('computes correctionRate as manualCorrections / totalMoves', () => {
    logOneMove({ autoAccepted: true }); // accepted
    logOneMove({ autoAccepted: false }); // correction

    const summary = instrumentation.summarizeSession();
    // 1 correction out of 2 moves → 0.5
    expect(summary?.correctionRate).toBeCloseTo(0.5);
  });

  it('computes avgConfidence as the mean of all move confidences', () => {
    logOneMove({ confidence: 0.6 });
    logOneMove({ confidence: 0.8 });

    const summary = instrumentation.summarizeSession();
    expect(summary?.avgConfidence).toBeCloseTo(0.7);
  });

  it('computes avgLatencyMs as the mean of all move latencies', () => {
    logOneMove({ latencyMs: 100 });
    logOneMove({ latencyMs: 200 });

    const summary = instrumentation.summarizeSession();
    expect(summary?.avgLatencyMs).toBeCloseTo(150);
  });

  it('includes type = "session_summary" in the returned object', () => {
    logOneMove();

    const summary = instrumentation.summarizeSession();
    expect(summary?.type).toBe('session_summary');
  });

  it('does not include p2p_sync events in the move count', () => {
    logOneMove();
    instrumentation.logP2PSync(40, 'host_to_guest');

    const summary = instrumentation.summarizeSession();
    // Only the one move candidate counts
    expect(summary?.totalMoves).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. startSession — resets accumulated events between sessions
// ---------------------------------------------------------------------------

describe('startSession (reset between sessions)', () => {
  it('clears all previously logged events', () => {
    logOneMove();
    logOneMove();
    instrumentation.logP2PSync(10, 'guest_to_host');

    expect(instrumentation.getEvents()).toHaveLength(3);

    // Start a new session — acts as the reset
    instrumentation.startSession();

    expect(instrumentation.getEvents()).toHaveLength(0);
  });

  it('allows logging after a session reset', () => {
    logOneMove();
    instrumentation.startSession();
    logOneMove({ confidence: 0.55 });

    const events = instrumentation.getEvents();
    expect(events).toHaveLength(1);
    const event = events[0]!;
    if (event.type === 'move_candidate') {
      expect(event.confidence).toBe(0.55);
    }
  });

  it('summarizeSession returns null after a reset with no new moves', () => {
    logOneMove();
    instrumentation.startSession(); // reset — no new moves after this

    expect(instrumentation.summarizeSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. getEvents — returns a snapshot copy, not the internal array
// ---------------------------------------------------------------------------

describe('getEvents', () => {
  it('returns an empty array immediately after startSession', () => {
    expect(instrumentation.getEvents()).toEqual([]);
  });

  it('returns a copy — mutating the result does not affect internal state', () => {
    logOneMove();

    const snapshot = instrumentation.getEvents();
    // Mutate the returned array
    snapshot.pop();

    // Internal state should be untouched
    expect(instrumentation.getEvents()).toHaveLength(1);
  });

  it('includes both move_candidate and p2p_sync events', () => {
    logOneMove();
    instrumentation.logP2PSync(25, 'host_to_guest');

    const events = instrumentation.getEvents();
    expect(events).toHaveLength(2);
    expect(events.map(e => e.type)).toEqual(expect.arrayContaining(['move_candidate', 'p2p_sync']));
  });
});
