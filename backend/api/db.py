"""Postgres connection helpers for BoardSight backend."""
import os

import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://boardsight:boardsight@localhost:5432/boardsight",
)


def get_conn():
    """Return a new psycopg2 connection with RealDictCursor as the default cursor."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def init_db() -> None:
    """Create the analysis_jobs table if it does not already exist."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS analysis_jobs (
                    job_id     TEXT PRIMARY KEY,
                    status     TEXT NOT NULL DEFAULT 'queued',
                    pgn        TEXT NOT NULL,
                    depth      INTEGER NOT NULL DEFAULT 18,
                    result     JSONB,
                    error      TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                """
            )
        conn.commit()
