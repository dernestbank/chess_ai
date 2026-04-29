"""
WebSocket relay for cloud-based BoardSight multiplayer sessions.
Two clients join a named session; messages are forwarded to the peer.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/v1/relay", tags=["relay"])
logger = logging.getLogger(__name__)

# session_id -> {role: WebSocket}  (role = "host" or "guest")
_sessions: Dict[str, Dict[str, WebSocket]] = {}
_session_locks: Dict[str, asyncio.Lock] = {}


def _get_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]


async def _send_json(ws: WebSocket, data: dict) -> None:
    try:
        await ws.send_text(json.dumps(data))
    except Exception:
        pass


@router.websocket("/{session_id}/{role}")
async def relay_endpoint(websocket: WebSocket, session_id: str, role: str):
    """
    Connect as host or guest to a named relay session.
    Messages sent here are forwarded to the peer.

    URL: ws://host/v1/relay/{sessionId}/{role}
    role must be "host" or "guest"
    """
    if role not in ("host", "guest"):
        await websocket.close(code=4000, reason="role must be host or guest")
        return

    await websocket.accept()
    lock = _get_lock(session_id)

    async with lock:
        if session_id not in _sessions:
            _sessions[session_id] = {}
        session = _sessions[session_id]

        if role in session:
            # Slot already taken
            await _send_json(websocket, {"type": "error", "message": f"{role} slot already occupied"})
            await websocket.close(code=4001)
            return

        session[role] = websocket
        peer_role = "guest" if role == "host" else "host"
        peer_ws: Optional[WebSocket] = session.get(peer_role)

    await _send_json(websocket, {"type": "connected", "role": role, "session": session_id})

    if peer_ws:
        await _send_json(peer_ws, {"type": "peer_joined", "role": role})
        await _send_json(websocket, {"type": "peer_joined", "role": peer_role})

    logger.info("relay: %s joined session %s", role, session_id)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            # Forward to peer
            async with lock:
                peer_ws = _sessions.get(session_id, {}).get(peer_role)

            if peer_ws:
                await _send_json(peer_ws, {"type": "relay", "from": role, "payload": msg})
            else:
                await _send_json(websocket, {"type": "no_peer"})

    except WebSocketDisconnect:
        logger.info("relay: %s disconnected from session %s", role, session_id)
    finally:
        async with lock:
            session = _sessions.get(session_id, {})
            session.pop(role, None)
            if not session:
                _sessions.pop(session_id, None)
                _session_locks.pop(session_id, None)

        # Notify peer of disconnect
        async with _get_lock(session_id) if session_id in _session_locks else asyncio.Lock():
            peer_ws = _sessions.get(session_id, {}).get(peer_role)
            if peer_ws:
                await _send_json(peer_ws, {"type": "peer_disconnected", "role": role})
