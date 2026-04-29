from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from .database import create_tables
from .routes.analysis import router as analysis_router
from .routes.relay import router as relay_router

API_KEY = os.environ.get("API_KEY", "")

app = FastAPI(
    title="BoardSight Analysis API",
    version="0.1.0",
    description="Post-game chess analysis service for BoardSight Chess",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten for production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_api_key(request: Request, call_next):
    if request.url.path in ("/health", "/docs", "/openapi.json", "/redoc"):
        return await call_next(request)
    key = request.headers.get("X-API-Key", "")
    if API_KEY and key != API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return await call_next(request)


@app.on_event("startup")
def on_startup():
    create_tables()


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}


app.include_router(analysis_router)
app.include_router(relay_router)
