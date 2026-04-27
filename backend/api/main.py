"""BoardSight backend — FastAPI application entry point."""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routes import relay, analysis, commentary

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


@app.get("/health", tags=["health"])
async def health() -> dict:
    """Basic liveness check — always returns 200 when the process is up."""
    return {"status": "ok", "version": "1.0.0"}


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
