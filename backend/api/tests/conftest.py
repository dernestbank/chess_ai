"""Shared pytest fixtures for the BoardSight backend test suite."""
import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture(scope="session")
def client() -> TestClient:
    """Return a synchronous HTTPX TestClient wrapping the FastAPI app.

    Scope is "session" so a single client instance is reused across all
    tests in a pytest run — background tasks execute synchronously inside
    TestClient, so every test gets a clean call without real concurrency.
    """
    with TestClient(app) as c:
        yield c
