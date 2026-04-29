"""
BoardSight Analysis Worker

Consumes jobs from Redis queue, evaluates each position with Stockfish,
classifies moves, optionally generates LLM takeaways, writes results to Postgres.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import chess
import chess.pgn
import io
import redis
import sqlalchemy as sa
from sqlalchemy.orm import Session

# Add parent dir to path for shared models
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api.models import AnalysisJob, AnalysisResult, Base
from api.database import engine, SessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
QUEUE_NAME = "analysis_jobs"
STOCKFISH_PATH = os.environ.get("STOCKFISH_PATH", "/usr/games/stockfish")
STOCKFISH_DEPTH = int(os.environ.get("STOCKFISH_DEPTH", "20"))
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
TIMEOUT_S = int(os.environ.get("ANALYSIS_TIMEOUT_S", "120"))


def classify_move(cp_loss: float) -> str | None:
    """Classify a move based on centipawn loss."""
    if cp_loss < 0:
        return "brilliant"
    if cp_loss < 10:
        return None  # good / best
    if cp_loss < 50:
        return "inaccuracy"
    if cp_loss < 100:
        return "mistake"
    return "blunder"


def analyze_pgn(pgn: str) -> dict[str, Any]:
    """Run Stockfish analysis on a PGN, return structured result."""
    try:
        from stockfish import Stockfish
        sf = Stockfish(path=STOCKFISH_PATH, depth=STOCKFISH_DEPTH)
    except Exception as e:
        log.warning("Stockfish not available: %s — returning stub result", e)
        return _stub_result(pgn)

    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        raise ValueError("Invalid PGN")

    board = game.board()
    move_annotations: list[dict] = []
    prev_eval: float | None = None
    white_cp_losses: list[float] = []
    black_cp_losses: list[float] = []

    for move_num, node in enumerate(game.mainline()):
        move = node.move
        sf.set_fen_position(board.fen())
        before_eval_info = sf.get_evaluation()
        before_cp: float = before_eval_info.get("value", 0)
        if before_eval_info.get("type") == "mate":
            before_cp = 10_000 if before_eval_info["value"] > 0 else -10_000

        color = board.turn  # chess.WHITE or chess.BLACK
        board.push(move)

        sf.set_fen_position(board.fen())
        after_eval_info = sf.get_evaluation()
        after_cp: float = after_eval_info.get("value", 0)
        if after_eval_info.get("type") == "mate":
            after_cp = 10_000 if after_eval_info["value"] > 0 else -10_000

        # From white's perspective
        if color == chess.WHITE:
            cp_loss = before_cp - after_cp
            white_cp_losses.append(max(0, cp_loss))
        else:
            cp_loss = after_cp - before_cp
            black_cp_losses.append(max(0, cp_loss))

        classification = classify_move(max(0, cp_loss))

        move_annotations.append({
            "moveNumber": move_num // 2 + 1,
            "san": node.san(),
            "evalCp": int(after_cp),
            "classification": classification,
        })

    def accuracy(cp_losses: list[float]) -> float:
        if not cp_losses:
            return 100.0
        avg_loss = sum(cp_losses) / len(cp_losses)
        # Simple accuracy formula (approximation)
        return round(max(0, min(100, 100 - avg_loss / 10)), 1)

    result: dict[str, Any] = {
        "moves": move_annotations,
        "accuracy": {
            "white": accuracy(white_cp_losses),
            "black": accuracy(black_cp_losses),
        },
    }

    if OPENAI_API_KEY:
        result["takeaways"] = _get_llm_takeaways(pgn, move_annotations)

    return result


def _stub_result(pgn: str) -> dict[str, Any]:
    """Return a stub result when Stockfish is unavailable."""
    return {
        "moves": [],
        "accuracy": {"white": 0.0, "black": 0.0},
        "takeaways": ["Analysis unavailable — Stockfish not configured."],
    }


def _get_llm_takeaways(pgn: str, annotations: list[dict]) -> list[str]:
    """Call OpenAI to generate natural-language takeaways. Returns [] on failure."""
    try:
        import httpx
        blunders = [a for a in annotations if a.get("classification") == "blunder"]
        prompt = (
            f"Here is a chess game in PGN:\n\n{pgn}\n\n"
            f"Key mistakes: {json.dumps(blunders[:5])}\n\n"
            "Give 3-5 concise, plain-language takeaways for the players to improve."
        )
        res = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 300,
            },
            timeout=30,
        )
        res.raise_for_status()
        content = res.json()["choices"][0]["message"]["content"]
        return [line.strip("- ").strip() for line in content.strip().split("\n") if line.strip()]
    except Exception as e:
        log.warning("LLM takeaways failed: %s", e)
        return []


def process_job(job_id: str, pgn: str, db: Session) -> None:
    db.query(AnalysisJob).filter(AnalysisJob.id == job_id).update({"status": "running"})
    db.commit()

    try:
        result_data = analyze_pgn(pgn)
        result = AnalysisResult(
            job_id=job_id,
            payload_json=json.dumps({**result_data, "jobId": job_id}),
        )
        db.add(result)
        db.query(AnalysisJob).filter(AnalysisJob.id == job_id).update({"status": "done"})
        db.commit()
        log.info("Job %s completed", job_id)
    except Exception as e:
        log.error("Job %s failed: %s", job_id, e)
        db.query(AnalysisJob).filter(AnalysisJob.id == job_id).update({"status": "failed"})
        db.commit()


def main() -> None:
    log.info("Worker starting — listening on queue '%s'", QUEUE_NAME)
    r = redis.from_url(REDIS_URL, decode_responses=True)
    Base.metadata.create_all(bind=engine)

    while True:
        try:
            item = r.brpop(QUEUE_NAME, timeout=5)
            if item is None:
                continue
            _, payload = item
            data = json.loads(payload)
            job_id = data["jobId"]
            pgn = data["pgn"]
            log.info("Processing job %s", job_id)

            with SessionLocal() as db:
                process_job(job_id, pgn, db)

        except redis.exceptions.ConnectionError as e:
            log.error("Redis connection error: %s — retrying in 5s", e)
            time.sleep(5)
        except Exception as e:
            log.exception("Unexpected error: %s", e)
            time.sleep(1)


if __name__ == "__main__":
    main()
