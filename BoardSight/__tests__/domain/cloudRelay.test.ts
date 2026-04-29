/**
 * CloudRelayManager unit tests.
 * Uses a manual WebSocket mock — no network required.
 */

import { CloudRelayManager } from '../../src/domain/multiplayer/cloudRelay';
import type { P2PCallbacks, P2PMessage } from '../../src/domain/multiplayer/p2p';

// ---------------------------------------------------------------------------
// Manual WebSocket mock
// ---------------------------------------------------------------------------

interface MockWs {
  url: string;
  readyState: number;
  sentMessages: string[];
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
  send: (data: string) => void;
  close: () => void;
  // Test helpers
  simulateOpen: () => void;
  simulateMessage: (data: unknown) => void;
  simulateClose: () => void;
  simulateError: (err?: unknown) => void;
}

let lastMockWs: MockWs | null = null;

class MockWebSocket implements MockWs {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  url: string;
  readyState = 0; // CONNECTING
  sentMessages: string[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    lastMockWs = this;
  }

  send(data: string) { this.sentMessages.push(data); }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
  simulateError(err: unknown = new Error('test error')) {
    this.onerror?.(err);
  }
}

// Install mock globally before all tests
beforeAll(() => {
  (globalThis as unknown as Record<string, unknown>).WebSocket = MockWebSocket;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://relay.example.com';
const SESSION_ID = 'sess-abc';

function makeCallbacks(): P2PCallbacks & { received: P2PMessage[] } {
  const received: P2PMessage[] = [];
  return {
    received,
    onConnect: jest.fn(),
    onDisconnect: jest.fn(),
    onMessage: jest.fn((msg: P2PMessage) => received.push(msg)),
  };
}

// ---------------------------------------------------------------------------
// connect() — URL construction
// ---------------------------------------------------------------------------

describe('CloudRelayManager — connect()', () => {
  it('builds correct wss:// URL for https base', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', makeCallbacks(), BASE_URL);
    expect(lastMockWs!.url).toBe(`wss://relay.example.com/ws/relay/${SESSION_ID}?role=host`);
  });

  it('builds correct ws:// URL for http base', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'guest', makeCallbacks(), 'http://relay.local:8000');
    expect(lastMockWs!.url).toBe(`ws://relay.local:8000/ws/relay/${SESSION_ID}?role=guest`);
  });

  it('uses spectate role in URL', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'spectate', makeCallbacks(), BASE_URL);
    expect(lastMockWs!.url).toContain('role=spectate');
  });

  it('does nothing when no relay URL is configured', async () => {
    const mgr = new CloudRelayManager();
    lastMockWs = null;
    await mgr.connect(SESSION_ID, 'host', makeCallbacks()); // no relayUrl
    expect(lastMockWs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// onopen / peer_joined / peer_disconnected callbacks
// ---------------------------------------------------------------------------

describe('CloudRelayManager — connection lifecycle', () => {
  it('calls onConnect when peer_joined is received', async () => {
    const cb = makeCallbacks();
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', cb, BASE_URL);

    lastMockWs!.simulateOpen();
    lastMockWs!.simulateMessage({ type: 'peer_joined' });

    expect(cb.onConnect).toHaveBeenCalledTimes(1);
  });

  it('calls onDisconnect when peer_disconnected is received', async () => {
    const cb = makeCallbacks();
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'guest', cb, BASE_URL);

    lastMockWs!.simulateOpen();
    lastMockWs!.simulateMessage({ type: 'peer_disconnected' });

    expect(cb.onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('spectator does NOT attempt reconnect on close', async () => {
    const cb = makeCallbacks();
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'spectate', cb, BASE_URL);

    const firstWs = lastMockWs!;
    firstWs.simulateOpen();
    firstWs.simulateClose();

    // Should NOT open a second socket
    expect(lastMockWs).toBe(firstWs);
    expect(cb.onDisconnect).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// relay message dispatch
// ---------------------------------------------------------------------------

describe('CloudRelayManager — relay message dispatch', () => {
  it('dispatches MOVE from relay payload', async () => {
    const cb = makeCallbacks();
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'guest', cb, BASE_URL);
    lastMockWs!.simulateOpen();

    const moveMsg: P2PMessage = { type: 'MOVE', san: 'e4', fen: 'rnbqkbnr/pp...', seq: 1 };
    lastMockWs!.simulateMessage({
      type: 'relay',
      payload: { type: 'move', move: moveMsg, clockState: { whiteMs: 300_000, blackMs: 300_000 } },
    });

    expect(cb.onMessage).toHaveBeenCalledWith(moveMsg);
  });

  it('dispatches CLOCK_SYNC from relay move payload with clockState', async () => {
    const cb = makeCallbacks();
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'guest', cb, BASE_URL);
    lastMockWs!.simulateOpen();

    const moveMsg: P2PMessage = { type: 'MOVE', san: 'e4', fen: 'rnb...', seq: 1 };
    lastMockWs!.simulateMessage({
      type: 'relay',
      payload: {
        type: 'move',
        move: moveMsg,
        clockState: { whiteMs: 200_000, blackMs: 180_000 },
      },
    });

    // Should have received both the MOVE and a CLOCK_SYNC
    const types = cb.received.map(m => m.type);
    expect(types).toContain('MOVE');
    expect(types).toContain('CLOCK_SYNC');

    const clockMsg = cb.received.find(m => m.type === 'CLOCK_SYNC') as any;
    expect(clockMsg.whiteMs).toBe(200_000);
    expect(clockMsg.blackMs).toBe(180_000);
  });

  it('dispatches CLOCK_SYNC from clockSync relay payload', async () => {
    const cb = makeCallbacks();
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', cb, BASE_URL);
    lastMockWs!.simulateOpen();

    lastMockWs!.simulateMessage({
      type: 'relay',
      payload: { type: 'clockSync', clockState: { whiteMs: 50_000, blackMs: 60_000 } },
    });

    const clockMsg = cb.received.find(m => m.type === 'CLOCK_SYNC') as any;
    expect(clockMsg).toBeDefined();
    expect(clockMsg.whiteMs).toBe(50_000);
  });

  it('ignores malformed JSON messages', async () => {
    const cb = makeCallbacks();
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', cb, BASE_URL);
    lastMockWs!.simulateOpen();

    lastMockWs!.onmessage?.({ data: 'not-json{{{' });
    expect(cb.onMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendMessage / sendMove / sendClockSync
// ---------------------------------------------------------------------------

describe('CloudRelayManager — sending', () => {
  it('sendMessage sends JSON to WebSocket', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', makeCallbacks(), BASE_URL);
    lastMockWs!.simulateOpen();

    const msg = { type: 'CLOCK_TAP', color: 'w' } as unknown as P2PMessage;
    mgr.sendMessage(msg);

    expect(lastMockWs!.sentMessages).toHaveLength(1);
    expect(JSON.parse(lastMockWs!.sentMessages[0]!)).toMatchObject({ type: 'CLOCK_TAP', color: 'w' });
  });

  it('sendMove wraps message in wire frame', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', makeCallbacks(), BASE_URL);
    lastMockWs!.simulateOpen();

    const moveMsg: P2PMessage & { type: 'MOVE' } = {
      type: 'MOVE', san: 'Nf3', fen: '...', seq: 2,
    };
    mgr.sendMove(moveMsg, { whiteMs: 100_000, blackMs: 200_000 });

    const sent = JSON.parse(lastMockWs!.sentMessages[0]!);
    expect(sent.type).toBe('move');
    expect(sent.move.san).toBe('Nf3');
    expect(sent.clockState.whiteMs).toBe(100_000);
  });

  it('sendClockSync sends clockSync frame', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', makeCallbacks(), BASE_URL);
    lastMockWs!.simulateOpen();

    mgr.sendClockSync({ whiteMs: 55_000, blackMs: 66_000 });

    const sent = JSON.parse(lastMockWs!.sentMessages[0]!);
    expect(sent.type).toBe('clockSync');
    expect(sent.clockState.whiteMs).toBe(55_000);
  });

  it('drops messages when not connected (readyState !== OPEN)', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', makeCallbacks(), BASE_URL);
    // Don't call simulateOpen — socket is in CONNECTING state

    mgr.sendMessage({ type: 'CLOCK_TAP', color: 'b' } as unknown as P2PMessage);
    expect(lastMockWs!.sentMessages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe('CloudRelayManager — getSession()', () => {
  it('returns null before connect', () => {
    const mgr = new CloudRelayManager();
    expect(mgr.getSession()).toBeNull();
  });

  it('returns session with correct role after connect', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'guest', makeCallbacks(), BASE_URL);

    const sess = mgr.getSession();
    expect(sess).not.toBeNull();
    expect(sess!.id).toBe(SESSION_ID);
    expect(sess!.role).toBe('guest');
  });

  it('returns null after disconnect', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', makeCallbacks(), BASE_URL);
    lastMockWs!.simulateOpen();
    mgr.disconnect();

    expect(mgr.getSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------

describe('CloudRelayManager — disconnect()', () => {
  it('closes the socket on disconnect', async () => {
    const mgr = new CloudRelayManager();
    await mgr.connect(SESSION_ID, 'host', makeCallbacks(), BASE_URL);
    lastMockWs!.simulateOpen();

    mgr.disconnect();
    expect(lastMockWs!.readyState).toBe(MockWebSocket.CLOSED);
  });
});
