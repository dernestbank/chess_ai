"""Tests for the /health and /health/ready endpoints."""
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# GET /health — liveness
# ---------------------------------------------------------------------------

def test_health_returns_ok():
    """GET /health must return 200 with status 'ok' and a version string."""
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert data["version"] == "1.0.0"
    assert "api_auth_enabled" in data
    assert isinstance(data["api_auth_enabled"], bool)
    assert "board_api_key_configured" in data
    assert isinstance(data["board_api_key_configured"], bool)


def test_openapi_yaml_served():
    """GET /openapi.yaml returns the static spec file."""
    r = client.get("/openapi.yaml")
    assert r.status_code == 200
    assert "openapi:" in r.text
    assert "BoardSight API" in r.text


# ---------------------------------------------------------------------------
# GET /health/ready — readiness
# ---------------------------------------------------------------------------

def test_health_ready_returns_200_when_both_up():
    """GET /health/ready returns 200 + ready when DB and Redis both respond."""
    mock_redis = MagicMock()
    mock_redis.ping.return_value = True

    with patch("api.db.init_db") as mock_init_db, \
         patch("api.queue.get_redis", return_value=mock_redis):
        r = client.get("/health/ready")

    assert r.status_code == 200
    data = r.json()
    assert data["db"] is True
    assert data["redis"] is True
    assert data["status"] == "ready"


def test_health_ready_returns_503_when_db_fails():
    """GET /health/ready returns 503 + degraded when Postgres is unreachable."""
    mock_redis = MagicMock()
    mock_redis.ping.return_value = True

    with patch("api.db.init_db", side_effect=Exception("connection refused")), \
         patch("api.queue.get_redis", return_value=mock_redis):
        r = client.get("/health/ready")

    assert r.status_code == 503
    data = r.json()
    assert data["db"] is False
    assert data["redis"] is True
    assert data["status"] == "degraded"


def test_health_ready_returns_503_when_redis_fails():
    """GET /health/ready returns 503 + degraded when Redis is unreachable."""
    mock_redis = MagicMock()
    mock_redis.ping.side_effect = Exception("ECONNREFUSED")

    with patch("api.db.init_db"), \
         patch("api.queue.get_redis", return_value=mock_redis):
        r = client.get("/health/ready")

    assert r.status_code == 503
    data = r.json()
    assert data["db"] is True
    assert data["redis"] is False
    assert data["status"] == "degraded"


def test_health_ready_returns_503_when_both_fail():
    """GET /health/ready returns 503 + degraded when both dependencies are down."""
    mock_redis = MagicMock()
    mock_redis.ping.side_effect = Exception("ECONNREFUSED")

    with patch("api.db.init_db", side_effect=Exception("connection refused")), \
         patch("api.queue.get_redis", return_value=mock_redis):
        r = client.get("/health/ready")

    assert r.status_code == 503
    data = r.json()
    assert data["db"] is False
    assert data["redis"] is False
    assert data["status"] == "degraded"
