"""Redis-backed job queue for analysis tasks."""
import json
import os

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
QUEUE_KEY = "boardsight:analysis:queue"


def get_redis() -> redis.Redis:
    """Return a Redis client decoded to strings."""
    return redis.from_url(REDIS_URL, decode_responses=True)


def enqueue(
    job_id: str,
    pgn: str,
    depth: int,
    include_llm: bool,
    api_key: str | None,
) -> None:
    """Push a job payload to the right end of the queue list."""
    r = get_redis()
    r.rpush(
        QUEUE_KEY,
        json.dumps(
            {
                "job_id": job_id,
                "pgn": pgn,
                "depth": depth,
                "include_llm_takeaways": include_llm,
                "api_key": api_key,
            }
        ),
    )


def dequeue(timeout: int = 5) -> dict | None:
    """
    Block for up to *timeout* seconds waiting for a job.

    Returns the decoded job dict, or None on timeout.
    """
    r = get_redis()
    item = r.blpop(QUEUE_KEY, timeout=timeout)
    if item is None:
        return None
    # blpop returns (key, value)
    return json.loads(item[1])
