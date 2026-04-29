/**
 * Unit tests for the active-transport selector (domain/multiplayer/activeTransport.ts).
 *
 * Both p2p and cloudRelay modules are fully mocked so no sockets are created.
 * Tests verify that getTransport() dispatches to whichever transport is active,
 * and that the selector itself is a safe, stateless indirection layer.
 */

import {
  setTransportType,
  getTransportType,
  getTransport,
  type TransportType,
  type MultiplayerTransport,
} from '../../src/domain/multiplayer/activeTransport';
import type { P2PCallbacks, P2PMessage, P2PSession } from '../../src/domain/multiplayer/p2p';

// ---------------------------------------------------------------------------
// Mock both transport modules
// ---------------------------------------------------------------------------

jest.mock('../../src/domain/multiplayer/p2p', () => {
  const mockP2P: MultiplayerTransport = {
    setCallbacks: jest.fn(),
    sendMessage: jest.fn(),
    sendMove: jest.fn(),
    sendClockSync: jest.fn(),
    disconnect: jest.fn(),
    getSession: jest.fn().mockReturnValue(null),
  };
  return {
    p2pManager: mockP2P,
    // Re-export types as values so TypeScript is satisfied at runtime
    P2PManager: jest.fn(),
  };
});

jest.mock('../../src/domain/multiplayer/cloudRelay', () => {
  const mockCloud: MultiplayerTransport = {
    setCallbacks: jest.fn(),
    sendMessage: jest.fn(),
    sendMove: jest.fn(),
    sendClockSync: jest.fn(),
    disconnect: jest.fn(),
    getSession: jest.fn().mockReturnValue(null),
  };
  return {
    cloudRelayManager: mockCloud,
    CloudRelayManager: jest.fn(),
  };
});

// Pull the mocked singletons out once — they are stable objects
import { p2pManager } from '../../src/domain/multiplayer/p2p';
import { cloudRelayManager } from '../../src/domain/multiplayer/cloudRelay';

const mockP2P = p2pManager as unknown as jest.Mocked<MultiplayerTransport>;
const mockCloud = cloudRelayManager as unknown as jest.Mocked<MultiplayerTransport>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(id: string, role: 'host' | 'guest' | 'spectate'): P2PSession {
  return { id, role, peerConnected: true };
}

function makeCallbacks(): P2PCallbacks {
  return {
    onMessage: jest.fn(),
    onConnect: jest.fn(),
    onDisconnect: jest.fn(),
  };
}

const MOVE_MSG: P2PMessage = { type: 'MOVE', san: 'e4', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', seq: 1 };

// ---------------------------------------------------------------------------
// Reset shared module-level state and mock call counts before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Always start tests from the default 'p2p' state
  setTransportType('p2p');

  jest.clearAllMocks();

  // Default getSession() → null for both; individual tests override as needed
  mockP2P.getSession.mockReturnValue(null);
  mockCloud.getSession.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// getTransportType / setTransportType
// ---------------------------------------------------------------------------

describe('activeTransport — setTransportType / getTransportType', () => {
  it('defaults to "p2p" on module load', () => {
    expect(getTransportType()).toBe('p2p');
  });

  it('switches to "cloud" and back to "p2p"', () => {
    setTransportType('cloud');
    expect(getTransportType()).toBe('cloud');

    setTransportType('p2p');
    expect(getTransportType()).toBe('p2p');
  });
});

// ---------------------------------------------------------------------------
// getTransport() returns the correct singleton
// ---------------------------------------------------------------------------

describe('activeTransport — getTransport()', () => {
  it('returns p2pManager when transport type is "p2p"', () => {
    setTransportType('p2p');
    expect(getTransport()).toBe(mockP2P);
  });

  it('returns cloudRelayManager when transport type is "cloud"', () => {
    setTransportType('cloud');
    expect(getTransport()).toBe(mockCloud);
  });
});

// ---------------------------------------------------------------------------
// sendMessage forwarding
// ---------------------------------------------------------------------------

describe('activeTransport — sendMessage forwarding', () => {
  it('forwards sendMessage to p2pManager when active transport is p2p', () => {
    setTransportType('p2p');
    getTransport().sendMessage(MOVE_MSG);

    expect(mockP2P.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockP2P.sendMessage).toHaveBeenCalledWith(MOVE_MSG);
    expect(mockCloud.sendMessage).not.toHaveBeenCalled();
  });

  it('forwards sendMessage to cloudRelayManager when active transport is cloud', () => {
    setTransportType('cloud');
    getTransport().sendMessage(MOVE_MSG);

    expect(mockCloud.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockCloud.sendMessage).toHaveBeenCalledWith(MOVE_MSG);
    expect(mockP2P.sendMessage).not.toHaveBeenCalled();
  });

  it('is a safe no-op (does not throw) when called before any explicit transport selection', () => {
    // Module default is 'p2p' — getTransport() always returns a valid object,
    // so calling sendMessage at startup must never throw even if the underlying
    // mock returns undefined (as jest.fn() does by default).
    setTransportType('p2p');
    expect(() => getTransport().sendMessage({ type: 'PING' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getSession forwarding
// ---------------------------------------------------------------------------

describe('activeTransport — getSession forwarding', () => {
  it('returns p2pManager session when transport is p2p', () => {
    const session = makeSession('192.168.1.10', 'host');
    mockP2P.getSession.mockReturnValue(session);

    setTransportType('p2p');
    const result = getTransport().getSession();

    expect(result).toBe(session);
    expect(mockCloud.getSession).not.toHaveBeenCalled();
  });

  it('returns cloudRelayManager session when transport is cloud', () => {
    const session = makeSession('sess-xyz', 'guest');
    mockCloud.getSession.mockReturnValue(session);

    setTransportType('cloud');
    const result = getTransport().getSession();

    expect(result).toBe(session);
    expect(mockP2P.getSession).not.toHaveBeenCalled();
  });

  it('returns null when active transport has no session', () => {
    mockP2P.getSession.mockReturnValue(null);
    setTransportType('p2p');
    expect(getTransport().getSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setCallbacks forwarding
// ---------------------------------------------------------------------------

describe('activeTransport — setCallbacks forwarding', () => {
  it('forwards setCallbacks to p2pManager when transport is p2p', () => {
    setTransportType('p2p');
    const cb = makeCallbacks();
    getTransport().setCallbacks(cb);

    expect(mockP2P.setCallbacks).toHaveBeenCalledWith(cb);
    expect(mockCloud.setCallbacks).not.toHaveBeenCalled();
  });

  it('forwards setCallbacks to cloudRelayManager when transport is cloud', () => {
    setTransportType('cloud');
    const cb = makeCallbacks();
    getTransport().setCallbacks(cb);

    expect(mockCloud.setCallbacks).toHaveBeenCalledWith(cb);
    expect(mockP2P.setCallbacks).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Transport switching — the caller is responsible for disconnecting the old
// transport before switching.  These tests confirm that after setTransportType()
// the selector redirects all calls to the new transport and that callers who
// follow the disconnect-then-switch pattern work correctly.
// ---------------------------------------------------------------------------

describe('activeTransport — transport switching', () => {
  it('after switching p2p → cloud, getTransport() targets cloudRelayManager', () => {
    setTransportType('p2p');
    expect(getTransport()).toBe(mockP2P);

    setTransportType('cloud');
    expect(getTransport()).toBe(mockCloud);
  });

  it('after switching cloud → p2p, getTransport() targets p2pManager', () => {
    setTransportType('cloud');
    expect(getTransport()).toBe(mockCloud);

    setTransportType('p2p');
    expect(getTransport()).toBe(mockP2P);
  });

  it('disconnect() on old transport + switch does not affect new transport', () => {
    // Simulate caller pattern: disconnect old, switch, use new
    setTransportType('p2p');
    getTransport().disconnect();           // teardown p2p
    setTransportType('cloud');
    getTransport().sendMessage(MOVE_MSG);  // use cloud

    expect(mockP2P.disconnect).toHaveBeenCalledTimes(1);
    expect(mockCloud.sendMessage).toHaveBeenCalledWith(MOVE_MSG);
    // p2p must not have received the message
    expect(mockP2P.sendMessage).not.toHaveBeenCalled();
  });

  it('getSession() after switch reflects only the new transport session', () => {
    const p2pSession = makeSession('192.168.0.5', 'host');
    const cloudSession = makeSession('sess-abc', 'guest');

    mockP2P.getSession.mockReturnValue(p2pSession);
    mockCloud.getSession.mockReturnValue(cloudSession);

    setTransportType('p2p');
    expect(getTransport().getSession()).toBe(p2pSession);

    setTransportType('cloud');
    expect(getTransport().getSession()).toBe(cloudSession);
  });
});

// ---------------------------------------------------------------------------
// sendMove / sendClockSync forwarding (wire-frame helpers)
// ---------------------------------------------------------------------------

describe('activeTransport — sendMove and sendClockSync forwarding', () => {
  const moveMsg: P2PMessage & { type: 'MOVE' } = {
    type: 'MOVE', san: 'Nf3', fen: '...', seq: 3,
  };
  const clock = { whiteMs: 180_000, blackMs: 175_000 };

  it('forwards sendMove to p2pManager when transport is p2p', () => {
    setTransportType('p2p');
    getTransport().sendMove(moveMsg, clock);

    expect(mockP2P.sendMove).toHaveBeenCalledWith(moveMsg, clock);
    expect(mockCloud.sendMove).not.toHaveBeenCalled();
  });

  it('forwards sendMove to cloudRelayManager when transport is cloud', () => {
    setTransportType('cloud');
    getTransport().sendMove(moveMsg, clock);

    expect(mockCloud.sendMove).toHaveBeenCalledWith(moveMsg, clock);
    expect(mockP2P.sendMove).not.toHaveBeenCalled();
  });

  it('forwards sendClockSync to the active transport', () => {
    setTransportType('cloud');
    getTransport().sendClockSync(clock);

    expect(mockCloud.sendClockSync).toHaveBeenCalledWith(clock);
    expect(mockP2P.sendClockSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// disconnect() forwarding
// ---------------------------------------------------------------------------

describe('activeTransport — disconnect() forwarding', () => {
  it('forwards disconnect() to p2pManager when transport is p2p', () => {
    setTransportType('p2p');
    getTransport().disconnect();

    expect(mockP2P.disconnect).toHaveBeenCalledTimes(1);
    expect(mockCloud.disconnect).not.toHaveBeenCalled();
  });

  it('forwards disconnect() to cloudRelayManager when transport is cloud', () => {
    setTransportType('cloud');
    getTransport().disconnect();

    expect(mockCloud.disconnect).toHaveBeenCalledTimes(1);
    expect(mockP2P.disconnect).not.toHaveBeenCalled();
  });
});
