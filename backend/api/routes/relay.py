"""
WebSocket relay for BoardSight multiplayer.

Roles:
  host     — creates a session, sends/receives moves
  guest    — joins a session, sends/receives moves
  spectate — joins read-only; receives all forwarded messages but cannot send

Wire protocol (JSON frames):
  Client → Server:
    { type: "MOVE",       move: {from,to,promotion?}, clockState: {...} }
    { type: "CLOCK_SYNC", clockState: {...} }
    { type: "CORRECTION_REQUEST" }
    { type: "CORRECTION_APPROVED", fen: str }
    { type: "CORRECTION_DENIED" }
    { type: "GAME_OVER",  result: str }
    { type: "CHAT",       text: str }           # future

  Server → Client:
    { type: "peer_joined" }
    { type: "peer_disconnected" }
    { type: <forwarded-from-peer> }             # any client frame forwarded verbatim
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

log = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Session registry
# ---------------------------------------------------------------------------

@dataclass
class Session:
    code: str
    host: Optional[WebSocket] = None
    guest: Optional[WebSocket] = None
    spectators: list[WebSocket] = field(default_factory=list)

    def peer_of(self, ws: WebSocket) -> Optional[WebSocket]:
        if ws is self.host:
            return self.guest
        if ws is self.guest:
            return self.host
        return None  # spectators have no peer

    def both_connected(self) -> bool:
        return self.host is not None and self.guest is not None

    def remove(self, ws: WebSocket) -> None:
        if ws is self.host:
            self.host = None
        elif ws is self.guest:
            self.guest = None
        elif ws in self.spectators:
            self.spectators.remove(ws)

    async def broadcast_to_spectators(self, data: str) -> None:
        dead: list[WebSocket] = []
        for spec in list(self.spectators):
            try:
                await spec.send_text(data)
            except Exception:
                dead.append(spec)
        for d in dead:
            self.spectators.remove(d)


# In-memory session store — keyed by session code (6-char uppercase)
_sessions: dict[str, Session] = {}


def _get_or_create(code: str) -> Session:
    if code not in _sessions:
        _sessions[code] = Session(code=code)
    return _sessions[code]


def _cleanup(code: str) -> None:
    sess = _sessions.get(code)
    if sess and sess.host is None and sess.guest is None and not sess.spectators:
        del _sessions[code]
        log.debug("Session %s removed", code)


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket("/ws/relay/{code}")
async def relay_endpoint(websocket: WebSocket, code: str) -> None:
    """
    Query params:
      ?role=host | guest | spectate
    """
    await websocket.accept()

    role: str = websocket.query_params.get("role", "")
    if role not in ("host", "guest", "spectate"):
        await websocket.close(code=4000, reason="role must be host, guest, or spectate")
        return

    sess = _get_or_create(code)

    # Slot assignment
    if role == "host":
        if sess.host is not None:
            await websocket.close(code=4001, reason="host slot taken")
            return
        sess.host = websocket
    elif role == "guest":
        if sess.guest is not None:
            await websocket.close(code=4001, reason="guest slot taken")
            return
        sess.guest = websocket
    else:  # spectate
        sess.spectators.append(websocket)

    log.info("Session %s: %s connected (%d spectators)", code, role, len(sess.spectators))

    # Notify peer (host↔guest) that the other side joined
    if role in ("host", "guest"):
        peer = sess.peer_of(websocket)
        if peer is not None:
            try:
                await peer.send_text(json.dumps({"type": "peer_joined"}))
            except Exception:
                pass
        # If both are now connected, tell spectators
        if sess.both_connected():
            await sess.broadcast_to_spectators(json.dumps({"type": "peer_joined"}))

    # Spectator joining an active session immediately learns both sides are up
    if role == "spectate" and sess.both_connected():
        try:
            await websocket.send_text(json.dumps({"type": "peer_joined"}))
        except Exception:
            pass

    try:
        while True:
            raw = await websocket.receive_text()

            # Spectators are read-only — ignore anything they send
            if role == "spectate":
                continue

            # Forward to peer
            peer = sess.peer_of(websocket)
            if peer is not None:
                try:
                    await peer.send_text(raw)
                except Exception:
                    log.warning("Session %s: failed to forward to peer", code)

            # Also forward to all spectators
            await sess.broadcast_to_spectators(raw)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.error("Session %s relay error: %s", code, exc)
    finally:
        sess.remove(websocket)
        log.info("Session %s: %s disconnected", code, role)

        if role in ("host", "guest"):
            # Notify remaining peer and spectators
            peer = sess.peer_of(websocket)  # already removed, so peer_of returns None — notify directly
            remaining = sess.guest if role == "host" else sess.host
            if remaining is not None:
                try:
                    await remaining.send_text(json.dumps({"type": "peer_disconnected"}))
                except Exception:
                    pass
            await sess.broadcast_to_spectators(json.dumps({"type": "peer_disconnected"}))

        _cleanup(code)
