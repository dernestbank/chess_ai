/**
 * Unit tests for P2PManager (domain/multiplayer/p2p.ts).
 *
 * react-native-tcp-socket is mapped to __mocks__/react-native-tcp-socket.js
 * via jest.config.js, so no real TCP sockets are created.
 */

import { P2PManager, P2PMessage, P2PCallbacks } from '../../src/domain/multiplayer/p2p';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCallbacks(): { cb: P2PCallbacks; received: P2PMessage[] } {
  const received: P2PMessage[] = [];
  const cb: P2PCallbacks = {
    onMessage: jest.fn(msg => {
      received.push(msg);
    }),
    onConnect: jest.fn(),
    onDisconnect: jest.fn(),
  };
  return { cb, received };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('P2PManager – setCallbacks', () => {
  it('replaces the callback object', () => {
    const manager = new P2PManager();
    const { cb: cb1 } = makeCallbacks();
    const { cb: cb2 } = makeCallbacks();

    manager.setCallbacks(cb1);
    manager.setCallbacks(cb2);

    // trigger internal _handleData to confirm cb2 is used
    (manager as any)._callbacks.onConnect();
    expect(cb2.onConnect).toHaveBeenCalledTimes(1);
    expect(cb1.onConnect).not.toHaveBeenCalled();
  });
});

describe('P2PManager – disconnect', () => {
  it('clears session and callbacks after disconnect()', () => {
    const manager = new P2PManager();
    const { cb } = makeCallbacks();
    manager.setCallbacks(cb);
    manager.disconnect();
    expect(manager.getSession()).toBeNull();
    // callbacks should be cleared — _callbacks is null
    expect((manager as any)._callbacks).toBeNull();
  });
});

describe('P2PManager – _parseCode', () => {
  let manager: P2PManager;
  beforeEach(() => {
    manager = new P2PManager();
  });

  it('parses plain IP as host with default port', () => {
    const result = (manager as any)._parseCode('192.168.1.5');
    expect(result).toEqual({ host: '192.168.1.5', port: 54321 });
  });

  it('parses IP:PORT format', () => {
    const result = (manager as any)._parseCode('192.168.1.5:12345');
    expect(result).toEqual({ host: '192.168.1.5', port: 12345 });
  });

  it('trims whitespace from code', () => {
    const result = (manager as any)._parseCode('  10.0.0.1  ');
    expect(result.host).toBe('10.0.0.1');
  });

  it('uses default port when only IP given', () => {
    const result = (manager as any)._parseCode('10.0.0.1');
    expect(result.port).toBe(54321);
  });
});

describe('P2PManager – _handleData / _dispatchFrame', () => {
  let manager: P2PManager;
  let received: P2PMessage[];

  beforeEach(() => {
    manager = new P2PManager();
    const { cb, received: r } = makeCallbacks();
    received = r;
    manager.setCallbacks(cb);
  });

  it('dispatches a WireMove frame as MOVE + CLOCK_SYNC', () => {
    const frame = JSON.stringify({
      type: 'move',
      move: { type: 'MOVE', san: 'e2e4', fen: 'start', seq: 0 },
      clockState: { whiteMs: 180000, blackMs: 180000 },
      seq: 0,
    });
    (manager as any)._handleData(frame + '\n');

    expect(received).toHaveLength(2);
    expect(received[0]!.type).toBe('MOVE');
    expect(received[1]!.type).toBe('CLOCK_SYNC');
    expect((received[1]! as any).whiteMs).toBe(180000);
  });

  it('dispatches a WireClockSync frame as CLOCK_SYNC', () => {
    const frame = JSON.stringify({
      type: 'clockSync',
      clockState: { whiteMs: 60000, blackMs: 59000 },
    });
    (manager as any)._handleData(frame + '\n');

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('CLOCK_SYNC');
    expect((received[0]! as any).whiteMs).toBe(60000);
    expect((received[0]! as any).blackMs).toBe(59000);
  });

  it('dispatches a raw GAME_OVER message', () => {
    const frame = JSON.stringify({ type: 'GAME_OVER', result: '1-0' });
    (manager as any)._handleData(frame + '\n');

    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('GAME_OVER');
    expect((received[0]! as any).result).toBe('1-0');
  });

  it('dispatches PING message', () => {
    const frame = JSON.stringify({ type: 'PING' });
    (manager as any)._handleData(frame + '\n');
    expect(received[0]!.type).toBe('PING');
  });

  it('handles partial frames (multi-chunk delivery)', () => {
    const frame = JSON.stringify({ type: 'PING' });
    const half = frame.length / 2;
    (manager as any)._handleData(frame.slice(0, half));
    expect(received).toHaveLength(0); // incomplete — not dispatched yet
    (manager as any)._handleData(frame.slice(half) + '\n');
    expect(received).toHaveLength(1);
  });

  it('handles multiple frames in one chunk', () => {
    const f1 = JSON.stringify({ type: 'PING' });
    const f2 = JSON.stringify({ type: 'PONG' });
    (manager as any)._handleData(f1 + '\n' + f2 + '\n');
    expect(received[0]!.type).toBe('PING');
    expect(received[1]!.type).toBe('PONG');
  });

  it('does not crash on malformed JSON', () => {
    expect(() => {
      (manager as any)._handleData('this is not json\n');
    }).not.toThrow();
  });
});

describe('P2PManager – _handleSocketClose', () => {
  it('fires onDisconnect only when connected + not intentional', () => {
    const manager = new P2PManager();
    const { cb } = makeCallbacks();
    manager.setCallbacks(cb);

    // Simulate connected state
    (manager as any)._connected = true;
    (manager as any)._intentionalClose = false;
    (manager as any)._session = { id: '192.168.1.1', role: 'guest', peerConnected: true };

    (manager as any)._handleSocketClose();

    expect(cb.onDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onDisconnect when disconnect() was intentional', () => {
    const manager = new P2PManager();
    const { cb } = makeCallbacks();
    manager.setCallbacks(cb);

    (manager as any)._connected = true;
    (manager as any)._intentionalClose = true;

    (manager as any)._handleSocketClose();

    expect(cb.onDisconnect).not.toHaveBeenCalled();
  });

  it('does NOT fire onDisconnect when not connected', () => {
    const manager = new P2PManager();
    const { cb } = makeCallbacks();
    manager.setCallbacks(cb);

    (manager as any)._connected = false;
    (manager as any)._intentionalClose = false;

    (manager as any)._handleSocketClose();

    expect(cb.onDisconnect).not.toHaveBeenCalled();
  });
});

describe('P2PManager – reconnect buffer', () => {
  it('buffers frames sent while disconnected', () => {
    const manager = new P2PManager();
    (manager as any)._connected = false;

    (manager as any)._sendRaw('{"type":"PING"}\n');
    (manager as any)._sendRaw('{"type":"PONG"}\n');

    const buf: { raw: string; at: number }[] = (manager as any)._sendBuffer;
    expect(buf).toHaveLength(2);
    expect(buf[0]!.raw).toBe('{"type":"PING"}\n');
  });

  it('flushes fresh buffer frames on reconnect (_flushBuffer)', () => {
    const manager = new P2PManager();
    // Pre-fill the buffer with a recent frame
    (manager as any)._sendBuffer = [{ raw: '{"type":"PING"}\n', at: Date.now() }];

    // Set up a mock socket
    const writeMock = jest.fn();
    (manager as any)._socket = { write: writeMock };
    (manager as any)._connected = true;

    (manager as any)._flushBuffer();

    expect(writeMock).toHaveBeenCalledWith('{"type":"PING"}\n', 'utf8');
    expect((manager as any)._sendBuffer).toHaveLength(0);
  });

  it('discards stale buffer frames older than TTL', () => {
    const manager = new P2PManager();
    const STALE = Date.now() - 31_000; // 31 seconds ago
    (manager as any)._sendBuffer = [{ raw: '{"type":"PING"}\n', at: STALE }];

    const writeMock = jest.fn();
    (manager as any)._socket = { write: writeMock };

    (manager as any)._flushBuffer();

    expect(writeMock).not.toHaveBeenCalled();
    expect((manager as any)._sendBuffer).toHaveLength(0);
  });

  it('clears send buffer on intentional disconnect()', () => {
    const manager = new P2PManager();
    (manager as any)._sendBuffer = [{ raw: 'x\n', at: Date.now() }];
    manager.disconnect();
    expect((manager as any)._sendBuffer).toHaveLength(0);
  });
});

describe('P2PManager – correction protocol messages', () => {
  let manager: P2PManager;
  let received: P2PMessage[];

  beforeEach(() => {
    manager = new P2PManager();
    const { cb, received: r } = makeCallbacks();
    received = r;
    manager.setCallbacks(cb);
  });

  it('dispatches CORRECTION_REQUEST', () => {
    const frame = JSON.stringify({ type: 'CORRECTION_REQUEST' });
    (manager as any)._handleData(frame + '\n');
    expect(received[0]!.type).toBe('CORRECTION_REQUEST');
  });

  it('dispatches CORRECTION_APPROVED with fen', () => {
    const frame = JSON.stringify({
      type: 'CORRECTION_APPROVED',
      fen: 'rnbqkbnr/8/8/8/8/8/8/RNBQKBNR w KQkq - 0 1',
    });
    (manager as any)._handleData(frame + '\n');
    expect(received[0]!.type).toBe('CORRECTION_APPROVED');
    expect((received[0]! as any).fen).toContain('RNBQKBNR');
  });

  it('dispatches CORRECTION_DENIED', () => {
    const frame = JSON.stringify({ type: 'CORRECTION_DENIED' });
    (manager as any)._handleData(frame + '\n');
    expect(received[0]!.type).toBe('CORRECTION_DENIED');
  });
});

describe('P2PManager – getSession', () => {
  it('returns null before any session starts', () => {
    const manager = new P2PManager();
    expect(manager.getSession()).toBeNull();
  });

  it('returns null after disconnect()', () => {
    const manager = new P2PManager();
    (manager as any)._session = { id: 'test', role: 'host', peerConnected: false };
    manager.disconnect();
    expect(manager.getSession()).toBeNull();
  });
});
