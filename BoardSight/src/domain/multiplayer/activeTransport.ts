/**
 * Active multiplayer transport selector.
 *
 * Lets LiveGameScreen switch between P2P TCP and cloud WebSocket relay
 * without hard-coding the transport type at call sites.
 */

import { P2PCallbacks, P2PMessage, P2PSession, p2pManager } from './p2p';
import { cloudRelayManager } from './cloudRelay';

export type TransportType = 'p2p' | 'cloud';

export interface MultiplayerTransport {
  setCallbacks(cb: P2PCallbacks): void;
  sendMessage(msg: P2PMessage): void;
  sendMove(move: P2PMessage & { type: 'MOVE' }, clock: { whiteMs: number; blackMs: number }): void;
  sendClockSync(clock: { whiteMs: number; blackMs: number }): void;
  disconnect(): void;
  getSession(): P2PSession | null;
}

let _type: TransportType = 'p2p';

export function setTransportType(t: TransportType): void {
  _type = t;
}

export function getTransportType(): TransportType {
  return _type;
}

export function getTransport(): MultiplayerTransport {
  return _type === 'cloud' ? cloudRelayManager : p2pManager;
}
