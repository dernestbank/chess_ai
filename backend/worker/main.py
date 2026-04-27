#!/usr/bin/env python3
"""Standalone analysis worker — consumes from Redis queue, writes to Postgres."""
from __future__ import annotations

import json
import logging
import signal
import sys

# When running inside Docker the package root is /app; locally it may differ.
sys.path.insert(0, "/app")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

running = True


def _stop(sig, frame) -> None:  # noqa: ANN001
    global running
    running = False
    log.info("Worker shutting down (signal %s)…", sig)


signal.signal(signal.SIGTERM, _stop)
signal.signal(signal.SIGINT, _stop)


def _set_status(job_id: str, status: str, result: dict | None = None, error: str | None = None) -> None:
    """Update the job row in Postgres."""
    from api.db import get_conn

    result_json = json.dumps(result) if result is not None else None
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE analysis_jobs
                SET status     = %s,
                    result     = %s::jsonb,
                    error      = %s,
                    updated_at = NOW()
                WHERE job_id = %s;
                """,
                (status, result_json, error, job_id),
            )
        conn.commit()


def _process(job: dict) -> None:
    """Run analysis for one job dict and persist the outcome."""
    job_id: str = job["job_id"]
    pgn: str = job["pgn"]
    depth: int = job.get("depth", 18)
    include_llm: bool = job.get("include_llm_takeaways", False)
    api_key: str | None = job.get("api_key")

    log.info("Processing job %s (depth=%d, llm=%s)", job_id, depth, include_llm)

    try:
        _set_status(job_id, "running")
    except Exception as exc:
        log.warning("Could not mark job %s as running: %s", job_id, exc)

    try:
        from api.worker.stockfish_worker import analyse_pgn

        result = analyse_pgn(pgn, depth)

        if include_llm:
            try:
                import asyncio
                from api.worker.llm_worker import generate_takeaways

                result["takeaways"] = asyncio.run(generate_takeaways(result, api_key))
            except Exception as exc:
                log.warning("LLM takeaways failed for job %s: %s", job_id, exc)
                result["takeaways_error"] = str(exc)

        _set_status(job_id, "done", result=result)
        log.info("Job %s completed successfully", job_id)

    except Exception as exc:
        log.error("Job %s failed: %s", job_id, exc, exc_info=True)
        try:
            _set_status(job_id, "error", error=str(exc))
        except Exception as db_exc:
            log.error("Failed to persist error for job %s: %s", job_id, db_exc)


def main() -> None:
    from api.db import init_db
    from api.queue import dequeue

    log.info("Initialising database schema…")
    init_db()
    log.info("Worker started — waiting for jobs on Redis queue")

    while running:
        try:
            job = dequeue(timeout=5)
        except Exception as exc:
            log.error("Redis error during dequeue: %s", exc)
            continue

        if job is None:
            # Timeout — loop again to check `running` flag
            continue

        _process(job)

    log.info("Worker stopped cleanly")


if __name__ == "__main__":
    main()
