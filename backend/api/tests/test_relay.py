"""
Tests for the WebSocket relay endpoint.
Uses FastAPI TestClient's websocket_connect.
"""
import json
import pytest
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_relay_rejects_unknown_role():
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/relay/TEST01?role=admin") as ws:
            ws.receive_json()


def test_relay_rejects_no_role():
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/relay/TEST02") as ws:
            ws.receive_json()


def test_host_connects_alone():
    """Host can connect and wait without error."""
    with client.websocket_connect("/ws/relay/ROOM01?role=host") as ws:
        # No message expected while waiting for guest
        import threading, time
        results = []

        def recv():
            try:
                msg = ws.receive_json()
                results.append(msg)
            except Exception:
                pass

        t = threading.Thread(target=recv, daemon=True)
        t.start()
        time.sleep(0.05)
        # Still waiting — no peer_joined yet


def test_host_and_guest_get_peer_joined():
    """Host receives peer_joined when guest connects (and vice versa)."""
    with client.websocket_connect("/ws/relay/ROOM02?role=host") as host_ws:
        with client.websocket_connect("/ws/relay/ROOM02?role=guest") as guest_ws:
            # Host should get peer_joined
            msg = host_ws.receive_json()
            assert msg["type"] == "peer_joined"


def test_move_forwarded_host_to_guest():
    """Move sent by host is forwarded to guest."""
    move_frame = {"type": "MOVE", "move": {"from": "e2", "to": "e4"}, "clockState": {}}
    with client.websocket_connect("/ws/relay/ROOM03?role=host") as host_ws:
        with client.websocket_connect("/ws/relay/ROOM03?role=guest") as guest_ws:
            host_ws.receive_json()  # peer_joined
            host_ws.send_json(move_frame)
            received = guest_ws.receive_json()
            assert received["type"] == "MOVE"
            assert received["move"]["from"] == "e2"


def test_move_forwarded_guest_to_host():
    """Move sent by guest is forwarded to host."""
    move_frame = {"type": "MOVE", "move": {"from": "e7", "to": "e5"}, "clockState": {}}
    with client.websocket_connect("/ws/relay/ROOM04?role=host") as host_ws:
        with client.websocket_connect("/ws/relay/ROOM04?role=guest") as guest_ws:
            host_ws.receive_json()  # peer_joined
            guest_ws.send_json(move_frame)
            received = host_ws.receive_json()
            assert received["type"] == "MOVE"
            assert received["move"]["from"] == "e7"


def test_spectator_receives_move():
    """Spectators receive moves forwarded by host."""
    move_frame = {"type": "MOVE", "move": {"from": "d2", "to": "d4"}, "clockState": {}}
    with client.websocket_connect("/ws/relay/ROOM05?role=host") as host_ws:
        with client.websocket_connect("/ws/relay/ROOM05?role=guest") as guest_ws:
            host_ws.receive_json()  # peer_joined (guest joined)
            with client.websocket_connect("/ws/relay/ROOM05?role=spectate") as spec_ws:
                # Spectator should immediately get peer_joined (both already connected)
                joined = spec_ws.receive_json()
                assert joined["type"] == "peer_joined"
                # Host sends a move
                host_ws.send_json(move_frame)
                # Guest receives
                guest_ws.receive_json()
                # Spectator also receives
                spec_msg = spec_ws.receive_json()
                assert spec_msg["type"] == "MOVE"


def test_spectator_cannot_send_messages():
    """Messages sent by spectator are silently ignored (not forwarded to host/guest)."""
    import threading, time

    spam = {"type": "MOVE", "move": {"from": "a2", "to": "a4"}, "clockState": {}}

    received_by_host = []

    with client.websocket_connect("/ws/relay/ROOM06?role=host") as host_ws:
        with client.websocket_connect("/ws/relay/ROOM06?role=guest") as guest_ws:
            host_ws.receive_json()  # peer_joined
            with client.websocket_connect("/ws/relay/ROOM06?role=spectate") as spec_ws:
                spec_ws.receive_json()  # peer_joined
                spec_ws.send_json(spam)

                # Give relay time to process
                time.sleep(0.05)

                # Host should NOT have received anything from spectator
                # (no message arrives — test by sending a real move and checking order)
                real_move = {"type": "MOVE", "move": {"from": "e2", "to": "e4"}, "clockState": {}}
                host_ws.send_json(real_move)
                msg = guest_ws.receive_json()
                assert msg["type"] == "MOVE"
                assert msg["move"]["from"] == "e2"  # Only the real host move, not spectator spam


def test_duplicate_host_rejected():
    """Second host connection to same room is rejected."""
    with client.websocket_connect("/ws/relay/ROOM07?role=host") as _:
        with pytest.raises(Exception):
            with client.websocket_connect("/ws/relay/ROOM07?role=host") as ws2:
                ws2.receive_json()


def test_correction_request_forwarded():
    """CORRECTION_REQUEST from guest reaches host."""
    with client.websocket_connect("/ws/relay/ROOM08?role=host") as host_ws:
        with client.websocket_connect("/ws/relay/ROOM08?role=guest") as guest_ws:
            host_ws.receive_json()  # peer_joined
            guest_ws.send_json({"type": "CORRECTION_REQUEST"})
            msg = host_ws.receive_json()
            assert msg["type"] == "CORRECTION_REQUEST"


def test_peer_disconnected_notified():
    """When guest disconnects, host receives peer_disconnected."""
    import time
    with client.websocket_connect("/ws/relay/ROOM09?role=host") as host_ws:
        with client.websocket_connect("/ws/relay/ROOM09?role=guest") as guest_ws:
            host_ws.receive_json()  # peer_joined
        # guest_ws exited — disconnected
        time.sleep(0.05)
        msg = host_ws.receive_json()
        assert msg["type"] == "peer_disconnected"
