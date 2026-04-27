"""Authentication helpers for API key-protected routes."""
from __future__ import annotations

import os

from fastapi import Header, HTTPException, WebSocket, status


def _is_enabled() -> bool:
    """Whether API key auth is enabled for protected routes."""
    return os.getenv("API_AUTH_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Validate X-API-Key when auth is enabled.

    When `API_AUTH_ENABLED` is false, this check is skipped to keep local
    development friction low.
    """
    if not _is_enabled():
        return

    expected = os.getenv("BOARD_API_KEY", "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server auth is enabled but BOARD_API_KEY is not configured",
        )

    if x_api_key != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


def websocket_api_key_authorized(websocket: WebSocket) -> bool:
    """Return True if the WebSocket may proceed (same key as REST when auth is on).

    Reads ``api_key`` from the query string, or ``X-API-Key`` on the upgrade request.
    """
    if not _is_enabled():
        return True

    expected = os.getenv("BOARD_API_KEY", "").strip()
    if not expected:
        return False

    got = websocket.query_params.get("api_key") or websocket.headers.get("x-api-key")
    return bool(got) and got == expected
