/**
 * Lightweight instrumentation logger.
 * Tracks move detection quality, latency, and P2P sync metrics.
 * Logs to console in development; hook up to a crash reporter for production.
 */

interface MoveDetectionEvent {
  type: 'move_candidate';
  confidence: number;
  autoAccepted: boolean;
  manuallyCorrect: boolean;
  latencyMs: number; // frame capture → JS event
  timestamp: number;
}

interface P2PSyncEvent {
  type: 'p2p_sync';
  latencyMs: number; // host move → guest display (approximation)
  direction: 'host_to_guest' | 'guest_to_host';
  timestamp: number;
}

interface SessionSummary {
  type: 'session_summary';
  totalMoves: number;
  autoAccepted: number;
  manualCorrections: number;
  correctionRate: number; // 0-1
  avgConfidence: number;
  avgLatencyMs: number;
  timestamp: number;
}

type InstrumentationEvent = MoveDetectionEvent | P2PSyncEvent | SessionSummary;

class Instrumentation {
  private _events: InstrumentationEvent[] = [];
  private _sessionStart = 0;

  startSession(): void {
    this._events = [];
    this._sessionStart = Date.now();
  }

  logMoveCandidate(params: {
    confidence: number;
    autoAccepted: boolean;
    manuallyCorrect: boolean;
    latencyMs: number;
  }): void {
    this._events.push({
      type: 'move_candidate',
      ...params,
      timestamp: Date.now(),
    });

    if (__DEV__) {
      const symbol = params.autoAccepted ? '✓' : params.manuallyCorrect ? '✎' : '✗';
      console.log(
        `[CV] ${symbol} conf=${(params.confidence * 100).toFixed(0)}% lat=${params.latencyMs}ms`,
      );
    }
  }

  logP2PSync(latencyMs: number, direction: 'host_to_guest' | 'guest_to_host'): void {
    this._events.push({ type: 'p2p_sync', latencyMs, direction, timestamp: Date.now() });
    if (__DEV__) {
      console.log(`[P2P] sync ${direction} ${latencyMs}ms`);
    }
  }

  summarizeSession(): SessionSummary | null {
    const moves = this._events.filter(
      (e): e is MoveDetectionEvent => e.type === 'move_candidate',
    );
    if (moves.length === 0) return null;

    const totalMoves = moves.length;
    const autoAccepted = moves.filter(m => m.autoAccepted).length;
    const manualCorrections = moves.filter(m => !m.autoAccepted).length;
    const correctionRate = manualCorrections / totalMoves;
    const avgConfidence = moves.reduce((s, m) => s + m.confidence, 0) / totalMoves;
    const avgLatencyMs = moves.reduce((s, m) => s + m.latencyMs, 0) / totalMoves;

    const summary: SessionSummary = {
      type: 'session_summary',
      totalMoves,
      autoAccepted,
      manualCorrections,
      correctionRate,
      avgConfidence,
      avgLatencyMs,
      timestamp: Date.now(),
    };

    if (__DEV__) {
      console.log(
        `[Instrumentation] Session summary: ${totalMoves} moves, ` +
          `${(correctionRate * 100).toFixed(1)}% corrections, ` +
          `avg conf ${(avgConfidence * 100).toFixed(0)}%, ` +
          `avg lat ${avgLatencyMs.toFixed(0)}ms`,
      );
    }

    return summary;
  }

  getEvents(): InstrumentationEvent[] {
    return [...this._events];
  }
}

export const instrumentation = new Instrumentation();
