/**
 * Cloud WebSocket relay for cross-internet multiplayer.
 * Connects to backend /v1/relay/{sessionId}/{role}.
 * Falls back to this when P2P WiFi is unavailable.
 */

import { P2PCallbacks, P2PMessage, P2PSession } from './p2p';

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECTS = 5;

export class CloudRelayManager {
  private ws: WebSocket | null = null;
  private callbacks: P2PCallbacks | null = null;
  private relayUrl: string | null = null;
  private sessionId: string | null = null;
  private role: 'host' | 'guest' | 'spectate' | null = null;
  private reconnectCount = 0;
  private shouldReconnect = false;

  async connect(
    sessionId: string,
    role: 'host' | 'guest' | 'spectate',
    callbacks: P2PCallbacks,
    relayUrl?: string,
  ): Promise<void> {
    this.callbacks = callbacks;
    this.sessionId = sessionId;
    this.role = role;
    // Spectators don't need to reconnect — they're read-only observers
    this.shouldReconnect = role !== 'spectate';
    this.reconnectCount = 0;

    const base = relayUrl ?? this.relayUrl;
    if (!base) {
      console.warn('[CloudRelay] No relay URL configured');
      return;
    }
    // Convert http(s):// to ws(s)://
    this.relayUrl = base.replace(/^http/, 'ws');
    this._openSocket();
  }

  private _openSocket(): void {
    if (!this.relayUrl || !this.sessionId || !this.role) { return; }

    const url = `${this.relayUrl}/ws/relay/${this.sessionId}?role=${this.role}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectCount = 0;
      console.log('[CloudRelay] Connected as', this.role);
    };

    ws.onmessage = (event: Event & { data?: unknown }) => {
      let data: any;
      try {
        data = JSON.parse(event.data as string);  // eslint-disable-line @typescript-eslint/no-explicit-any
      } catch {
        return;
      }

      switch (data.type) {
        case 'connected':
          // Server confirmed connection
          break;
        case 'peer_joined':
          this.callbacks?.onConnect();
          break;
        case 'peer_disconnected':
          this.callbacks?.onDisconnect();
          break;
        case 'relay': {
          const payload = data.payload;
          if (!payload) break;
          // Unwrap wire frames forwarded by the backend relay
          if (payload.type === 'move' && payload.move) {
            this.callbacks?.onMessage(payload.move as P2PMessage);
            if (payload.clockState) {
              this.callbacks?.onMessage({
                type: 'CLOCK_SYNC',
                whiteMs: payload.clockState.whiteMs,
                blackMs: payload.clockState.blackMs,
              } as P2PMessage);
            }
          } else if (payload.type === 'clockSync' && payload.clockState) {
            this.callbacks?.onMessage({
              type: 'CLOCK_SYNC',
              whiteMs: payload.clockState.whiteMs,
              blackMs: payload.clockState.blackMs,
            } as P2PMessage);
          } else {
            this.callbacks?.onMessage(payload as P2PMessage);
          }
          break;
        }
        default:
          break;
      }
    };

    ws.onerror = (err) => {
      console.warn('[CloudRelay] WebSocket error:', err);
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect && this.reconnectCount < MAX_RECONNECTS) {
        this.reconnectCount++;
        console.log(`[CloudRelay] Reconnecting (${this.reconnectCount}/${MAX_RECONNECTS})…`);
        setTimeout(() => this._openSocket(), RECONNECT_DELAY_MS);
      } else if (this.shouldReconnect) {
        console.warn('[CloudRelay] Max reconnects reached');
        this.callbacks?.onDisconnect();
      }
    };
  }

  setCallbacks(callbacks: P2PCallbacks): void {
    this.callbacks = callbacks;
  }

  getSession(): P2PSession | null {
    if (!this.sessionId || !this.role) { return null; }
    return {
      id: this.sessionId,
      role: this.role,  // 'host' | 'guest' | 'spectate'
      peerConnected: this.ws?.readyState === WebSocket.OPEN,
    };
  }

  sendMessage(msg: P2PMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[CloudRelay] Not connected — dropping message:', msg.type);
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  sendMove(move: P2PMessage & { type: 'MOVE' }, clockState: { whiteMs: number; blackMs: number }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { return; }
    this.ws.send(JSON.stringify({ type: 'move', move, clockState, seq: 0 }));
  }

  sendClockSync(clockState: { whiteMs: number; blackMs: number }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { return; }
    this.ws.send(JSON.stringify({ type: 'clockSync', clockState }));
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
    this.callbacks = null;
    this.sessionId = null;
    this.role = null;
  }
}

export const cloudRelayManager = new CloudRelayManager();
