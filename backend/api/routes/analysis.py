"""
POST /v1/analysis/jobs              — submit a game for analysis
GET  /v1/analysis/jobs/{job_id}     — poll for status + result
GET  /v1/analysis/jobs/{job_id}/result — fetch full result payload only
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..auth import require_api_key
from ..pgn_validate import validate_pgn_for_analysis

router = APIRouter(dependencies=[Depends(require_api_key)])

# In-memory fallback store — used when Postgres is unavailable (e.g. in tests)
_jobs: dict[str, dict] = {}


class AnalysisRequest(BaseModel):
    pgn: str
    depth: int = 18
    include_llm_takeaways: bool = False
    api_key: str | None = None


class AnalysisJob(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "error"]
    result: dict | None = None
    error: str | None = None


# ---------------------------------------------------------------------------
# Internal helpers — Postgres read/write with in-memory fallback
# ---------------------------------------------------------------------------

def _db_insert(job_id: str, pgn: str, depth: int) -> None:
    """Insert a new queued job row into Postgres."""
    from api.db import get_conn  # lazy import keeps startup fast

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO analysis_jobs (job_id, status, pgn, depth)
                VALUES (%s, 'queued', %s, %s)
                ON CONFLICT (job_id) DO NOTHING;
                """,
                (job_id, pgn, depth),
            )
        conn.commit()


def _db_update(job_id: str, status: str, result: dict | None = None, error: str | None = None) -> None:
    """Update job status (and optionally result/error) in Postgres."""
    from api.db import get_conn

    result_json = json.dumps(result) if result is not None else None
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE analysis_jobs
                SET status = %s,
                    result = %s::jsonb,
                    error  = %s,
                    updated_at = NOW()
                WHERE job_id = %s;
                """,
                (status, result_json, error, job_id),
            )
        conn.commit()


def _db_get(job_id: str) -> dict | None:
    """Fetch one job row from Postgres; returns None if not found."""
    from api.db import get_conn

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT job_id, status, result, error FROM analysis_jobs WHERE job_id = %s;",
                (job_id,),
            )
            row = cur.fetchone()
    if row is None:
        return None
    return dict(row)


# ---------------------------------------------------------------------------
# Background task (used when Redis/worker is unavailable)
# ---------------------------------------------------------------------------

async def _run_analysis(job_id: str, req: AnalysisRequest) -> None:
    """In-process fallback worker — called by BackgroundTasks when Redis is down."""
    # Mark running
    try:
        _db_update(job_id, "running")
    except Exception:
        _jobs[job_id]["status"] = "running"

    try:
        from ..worker.stockfish_worker import analyse_pgn

        result = await asyncio.get_event_loop().run_in_executor(
            None, analyse_pgn, req.pgn, req.depth
        )

        if req.include_llm_takeaways:
            try:
                from ..worker.llm_worker import generate_takeaways
                result["takeaways"] = await generate_takeaways(result, req.api_key)
            except Exception as exc:
                result["takeaways_error"] = str(exc)

        try:
            _db_update(job_id, "done", result=result)
        except Exception:
            pass
        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["result"] = result

    except Exception as exc:
        try:
            _db_update(job_id, "error", error=str(exc))
        except Exception:
            pass
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = str(exc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/jobs", status_code=201)
async def submit_job(req: AnalysisRequest, background_tasks: BackgroundTasks) -> AnalysisJob:
    try:
        validate_pgn_for_analysis(req.pgn)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    job_id = str(uuid.uuid4())

    # 1. Write initial row to Postgres
    try:
        _db_insert(job_id, req.pgn, req.depth)
    except Exception:
        pass  # DB unavailable — fall back to in-memory only

    # Always seed in-memory store so tests and the fallback worker can find it
    _jobs[job_id] = {"status": "queued", "result": None, "error": None}

    # 2. Enqueue to Redis for the standalone worker
    redis_ok = False
    try:
        from api.queue import enqueue
        enqueue(job_id, req.pgn, req.depth, req.include_llm_takeaways, req.api_key)
        redis_ok = True
    except Exception:
        pass  # Redis unavailable — fall through to in-process background task

    # 3. If Redis is down, run the analysis in-process as a background task
    if not redis_ok:
        background_tasks.add_task(_run_analysis, job_id, req)

    return AnalysisJob(job_id=job_id, status="queued")


@router.get("/jobs/{job_id}")
async def get_job(job_id: str) -> AnalysisJob:
    # Try Postgres first
    try:
        row = _db_get(job_id)
        if row is not None:
            return AnalysisJob(
                job_id=job_id,
                status=row["status"],
                result=row.get("result"),
                error=row.get("error"),
            )
    except Exception:
        pass  # DB unavailable — fall back to in-memory

    # Fallback: in-memory store
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return AnalysisJob(job_id=job_id, **job)


@router.get("/jobs/{job_id}/result")
async def get_job_result(job_id: str):
    """Return ONLY the full result payload.

    - 200 + {"result": <dict>} when the job is done.
    - 202 + {"status": "pending"}  when still queued/running.
    - 404 when the job_id is unknown.
    """
    row = None

    # Try Postgres first
    try:
        row = _db_get(job_id)
    except Exception:
        pass  # DB unavailable — fall back to in-memory

    if row is None:
        # Fallback: in-memory store
        mem = _jobs.get(job_id)
        if mem is None:
            raise HTTPException(status_code=404, detail="Job not found")
        row = {"status": mem["status"], "result": mem.get("result")}

    if row["status"] == "done":
        return JSONResponse(status_code=200, content={"result": row["result"]})

    # queued or running → 202 Accepted
    return JSONResponse(status_code=202, content={"status": "pending"})
