"""BoardSight backend — FastAPI application entry point."""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .auth import is_api_auth_enabled
from .routes import relay, analysis, commentary

_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

app = FastAPI(title="BoardSight API", version="1.0.0")

raw_origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8081")
allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(relay.router, tags=["relay"])
app.include_router(analysis.router, prefix="/v1/analysis", tags=["analysis"])
app.include_router(commentary.router, prefix="/v1", tags=["commentary"])


@app.get("/", tags=["health"])
async def root() -> dict:
    """Human and proxy-friendly root — avoids bare 404 on `/`; use for Coolify/HTTP checks."""
    return {
        "service": "boardsight-api",
        "version": "1.0.0",
        "docs": "/docs",
        "openapi": "/openapi.yaml",
        "health": "/health",
        "health_ready": "/health/ready",
    }


@app.get("/health", tags=["health"])
async def health() -> dict:
    """Basic liveness check — always returns 200 when the process is up."""
    return {
        "status": "ok",
        "version": "1.0.0",
        "api_auth_enabled": is_api_auth_enabled(),
        "board_api_key_configured": bool(os.getenv("BOARD_API_KEY", "").strip()),
    }


@app.get("/openapi.yaml", tags=["health"], response_model=None)
async def openapi_yaml():
    """Static OpenAPI 3 contract (same as ``backend/openapi.yaml`` in the repo)."""
    path = os.path.join(_BACKEND_ROOT, "openapi.yaml")
    if not os.path.isfile(path):
        return JSONResponse(status_code=404, content={"detail": "OpenAPI file not found"})
    return FileResponse(path, media_type="application/yaml", filename="openapi.yaml")


@app.get("/health/ready", tags=["health"])
async def health_ready() -> JSONResponse:
    """Readiness check — verifies Postgres and Redis connectivity.

    Returns 200 when both dependencies are reachable, 503 when either is down.
    """
    db_ok = False
    redis_ok = False

    # --- Postgres ---
    try:
        from api.db import init_db
        init_db()
        db_ok = True
    except Exception:
        db_ok = False

    # --- Redis ---
    try:
        from api.queue import get_redis
        get_redis().ping()
        redis_ok = True
    except Exception:
        redis_ok = False

    status = "ready" if (db_ok and redis_ok) else "degraded"
    http_status = 200 if (db_ok and redis_ok) else 503
    return JSONResponse(
        status_code=http_status,
        content={"db": db_ok, "redis": redis_ok, "status": status},
    )
