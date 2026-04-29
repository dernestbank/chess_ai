/**
 * P2P WiFi session manager.
 * Uses react-native-tcp-socket for TCP connections on port 54321.
 * Session "code" is the host's IP address (the guest types it in directly).
 */

import TcpSocket from 'react-native-tcp-socket';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface P2PSession {
  id: string;
  role: 'host' | 'guest' | 'spectate';
  peerConnected: boolean;
}

export type P2PMessage =
  | { type: 'MOVE'; san: string; fen: string; seq: number }
  | { type: 'CLOCK_SYNC'; whiteMs: number; blackMs: number; sentAt?: number }
  | { type: 'CLOCK_TAP' }              // guest → host: manual clock tap request
  | { type: 'CORRECTION_REQUEST' }     // guest → host: request to undo last move
  | { type: 'CORRECTION_APPROVED'; fen: string } // host → guest: undo approved, here is new FEN
  | { type: 'CORRECTION_DENIED' }      // host → guest: undo denied
  | { type: 'GAME_OVER'; result: string }
  | { type: 'PING' }
  | { type: 'PONG' };

export interface P2PCallbacks {
  onMessage: (msg: P2PMessage) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

// ─── Internal wire frame types ────────────────────────────────────────────────

interface WireMove {
  type: 'move';
  move: P2PMessage & { type: 'MOVE' };
  clockState: { whiteMs: number; blackMs: number };
  seq: number;
}

interface WireClockSync {
  type: 'clockSync';
  clockState: { whiteMs: number; blackMs: number };
  sentAt?: number;
}

type WireFrame = WireMove | WireClockSync;

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT = 54321;

// ─── P2PManager ───────────────────────────────────────────────────────────────

/**
 * P2PManager handles local WiFi sessions between two phones.
 *
 * Architecture:
 *   Host : listen on TCP port 54321, show device IP as "session code"
 *   Guest: type host IP, connect to host IP:54321
 *   Protocol: newline-delimited JSON frames with sequence numbers
 */
const BUFFER_TTL_MS = 30_000; // keep buffered frames for up to 30 seconds

interface BufferedFrame {
  raw: string;    // newline-terminated JSON string
  at: number;     // epoch ms when buffered
}

export class P2PManager {
  // Public-ish state
  private _session: P2PSession | null = null;
  private _callbacks: P2PCallbacks | null = null;

  // TCP handles
  private _server: ReturnType<typeof TcpSocket.createServer> | null = null;
  private _socket: ReturnType<typeof TcpSocket.createConnection> | null = null;

  // Framing
  private _recvBuffer = '';

  // Sequencing
  private _seq = 0;

  // Track intentional vs unexpected disconnects
  private _connected = false;
  private _intentionalClose = false;

  // Reconnect buffer — frames queued while disconnected (max 30s TTL)
  private _sendBuffer: BufferedFrame[] = [];

  // ── Host ──────────────────────────────────────────────────────────────────

  /**
   * Start hosting. Creates a TCP server, waits for one client.
   * Returns a P2PSession whose `id` is the server's local IP address
   * (this is what the guest needs to type in).
   */
  async startHost(callbacks: P2PCallbacks): Promise<P2PSession> {
    this._callbacks = callbacks;
    this._intentionalClose = false;

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const server = TcpSocket.createServer((clientSocket: any) => {
        // Accept exactly one client; stop listening after first connection
        server.close();

        this._socket = clientSocket;
        this._connected = true;

        if (this._session) {
          this._session.peerConnected = true;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        clientSocket.on('data', (data: any) => {
          this._handleData(typeof data === 'string' ? data : (data as any).toString('utf8') as string);
        });

        clientSocket.on('close', () => {
          this._handleSocketClose();
        });

        clientSocket.on('error', (err: Error) => {
          console.error('[P2PManager] client socket error:', err.message);
        });

        this._flushBuffer();
        this._callbacks?.onConnect();
      });

      server.on('error', (err: Error) => {
        console.error('[P2PManager] server error:', err.message);
        reject(err);
      });

      server.listen({ port: PORT, host: '0.0.0.0' }, () => {
        // Retrieve the local address the server bound to
        const addr = server.address();
        const ip: string =
          addr && typeof addr === 'object' && addr.address
            ? addr.address === '0.0.0.0'
              ? this._getLocalIP()
              : addr.address
            : this._getLocalIP();

        this._server = server;
        this._session = {
          id: ip, // "code" the guest types in
          role: 'host',
          peerConnected: false,
        };

        resolve(this._session);
      });
    });
  }

  // ── Guest ─────────────────────────────────────────────────────────────────

  /**
   * Join a session. `code` is the host's IP address (or `IP:PORT`).
   * Connects TCP socket to host at port 54321.
   */
  async joinSession(code: string, callbacks: P2PCallbacks): Promise<P2PSession> {
    this._callbacks = callbacks;
    this._intentionalClose = false;

    const { host, port } = this._parseCode(code);

    return new Promise((resolve, reject) => {
      const socket = TcpSocket.createConnection({ host, port }, () => {
        this._connected = true;

        if (this._session) {
          this._session.peerConnected = true;
        }

        this._flushBuffer();
        this._callbacks?.onConnect();
        resolve(this._session!);
      });

      this._session = {
        id: code,
        role: 'guest',
        peerConnected: false,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on('data', (data: any) => {
        this._handleData(typeof data === 'string' ? data : (data as any).toString('utf8') as string);
      });

      socket.on('close', () => {
        this._handleSocketClose();
      });

      socket.on('error', (err: Error) => {
        console.error('[P2PManager] socket error:', err.message);
        reject(err);
      });

      this._socket = socket;
    });
  }

  // ── Sending ───────────────────────────────────────────────────────────────

  /**
   * Send a chess move + clock snapshot to the peer.
   */
  sendMove(
    move: P2PMessage & { type: 'MOVE' },
    clockState: { whiteMs: number; blackMs: number },
  ): void {
    const frame: WireMove = {
      type: 'move',
      move,
      clockState,
      seq: this._seq++,
    };
    this._sendFrame(frame);
  }

  /**
   * Send a clock synchronisation update to the peer.
   */
  sendClockSync(clockState: { whiteMs: number; blackMs: number }): void {
    const frame: WireClockSync = {
      type: 'clockSync',
      clockState,
      sentAt: Date.now(),
    };
    this._sendFrame(frame);
  }

  /**
   * Legacy helper kept for API compatibility.
   * Routes MOVE → sendMove, CLOCK_SYNC → sendClockSync.
   */
  sendMessage(msg: P2PMessage): void {
    if (msg.type === 'MOVE') {
      this.sendMove(msg, { whiteMs: 0, blackMs: 0 });
    } else if (msg.type === 'CLOCK_SYNC') {
      this.sendClockSync({ whiteMs: msg.whiteMs, blackMs: msg.blackMs });
    } else {
      // PING / PONG / GAME_OVER — send as-is wrapped in a generic frame
      this._sendRaw(JSON.stringify(msg) + '\n');
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  /** Tear down socket and server, reset all state. */
  disconnect(): void {
    this._intentionalClose = true;
    this._connected = false;

    try {
      this._socket?.destroy();
    } catch (_) {}

    try {
      this._server?.close();
    } catch (_) {}

    this._socket = null;
    this._server = null;
    this._session = null;
    this._callbacks = null;
    this._recvBuffer = '';
    this._seq = 0;
    this._sendBuffer = [];
  }

  // ── Accessors / mutators ──────────────────────────────────────────────────

  getSession(): P2PSession | null {
    return this._session;
  }

  /**
   * Replace the callbacks for an existing session.
   * Used when the LiveGameScreen mounts and needs to own the message handlers.
   */
  setCallbacks(callbacks: P2PCallbacks): void {
    this._callbacks = callbacks;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /** Serialize a wire frame and write it to the socket. */
  private _sendFrame(frame: WireFrame): void {
    this._sendRaw(JSON.stringify(frame) + '\n');
  }

  private _sendRaw(raw: string): void {
    if (!this._socket || !this._connected) {
      // Buffer the frame for up to 30s — will be flushed on reconnect
      this._sendBuffer.push({ raw, at: Date.now() });
      return;
    }
    this._socket.write(raw, 'utf8');
  }

  /**
   * Flush buffered frames that are still within TTL to the newly connected socket.
   * Called immediately after a socket connect event fires.
   */
  private _flushBuffer(): void {
    const now = Date.now();
    const fresh = this._sendBuffer.filter(f => now - f.at < BUFFER_TTL_MS);
    this._sendBuffer = [];
    for (const f of fresh) {
      this._socket?.write(f.raw, 'utf8');
    }
    if (fresh.length > 0) {
      console.log(`[P2PManager] flushed ${fresh.length} buffered frame(s) on reconnect`);
    }
  }

  /**
   * Accumulate incoming bytes, split on newlines, parse each complete line.
   */
  private _handleData(chunk: string): void {
    this._recvBuffer += chunk;

    const lines = this._recvBuffer.split('\n');
    // The last element is either empty (trailing newline) or a partial line
    this._recvBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const frame = JSON.parse(trimmed) as WireFrame | P2PMessage;
        this._dispatchFrame(frame);
      } catch (err) {
        console.warn('[P2PManager] failed to parse frame:', trimmed, err);
      }
    }
  }

  /** Map wire frames to P2PMessage callbacks. */
  private _dispatchFrame(frame: WireFrame | P2PMessage): void {
    if (!this._callbacks) return;

    // Wire frames from sendMove / sendClockSync
    if ('type' in frame) {
      if (frame.type === 'move') {
        const wf = frame as WireMove;
        this._callbacks.onMessage(wf.move);
        // Also fire a clock sync if bundled
        if (wf.clockState) {
          this._callbacks.onMessage({
            type: 'CLOCK_SYNC',
            whiteMs: wf.clockState.whiteMs,
            blackMs: wf.clockState.blackMs,
          });
        }
        return;
      }

      if (frame.type === 'clockSync') {
        const wf = frame as WireClockSync;
        this._callbacks.onMessage({
          type: 'CLOCK_SYNC',
          whiteMs: wf.clockState.whiteMs,
          blackMs: wf.clockState.blackMs,
          sentAt: wf.sentAt,
        });
        return;
      }

      // Raw P2PMessage (PING, PONG, GAME_OVER, MOVE, CLOCK_SYNC)
      this._callbacks.onMessage(frame as P2PMessage);
    }
  }

  /** Called when the TCP socket closes. */
  private _handleSocketClose(): void {
    if (this._connected && !this._intentionalClose) {
      this._connected = false;
      if (this._session) {
        this._session.peerConnected = false;
      }
      this._callbacks?.onDisconnect();
    }
    this._connected = false;
  }

  /**
   * Parse a session code into { host, port }.
   * Accepts plain IP ("192.168.1.5") or "IP:PORT" ("192.168.1.5:54321").
   */
  private _parseCode(code: string): { host: string; port: number } {
    const trimmed = code.trim();
    const colonIdx = trimmed.lastIndexOf(':');

    // Distinguish IPv6 (many colons) from IP:PORT
    if (colonIdx > 0 && !trimmed.includes('[')) {
      const maybePort = parseInt(trimmed.slice(colonIdx + 1), 10);
      if (!isNaN(maybePort)) {
        return { host: trimmed.slice(0, colonIdx), port: maybePort };
      }
    }

    return { host: trimmed, port: PORT };
  }

  /**
   * Best-effort local IP resolution.
   * react-native-tcp-socket binds to 0.0.0.0; actual IP must be obtained
   * via a platform API (NetworkInfo) in production. This fallback is a
   * placeholder so the code compiles without additional dependencies.
   */
  private _getLocalIP(): string {
    // In production, replace with:
    //   import { NetworkInfo } from 'react-native-network-info';
    //   return await NetworkInfo.getIPV4Address();
    return '0.0.0.0';
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const p2pManager = new P2PManager();
