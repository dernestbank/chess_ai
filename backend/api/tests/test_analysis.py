"""Tests for the analysis job endpoints."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

from api.main import app

client = TestClient(app)

SAMPLE_PGN = """[Event "Test"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0"""


def test_submit_job_returns_201():
    r = client.post("/v1/analysis/jobs", json={"pgn": SAMPLE_PGN, "depth": 5})
    assert r.status_code == 201
    data = r.json()
    assert "job_id" in data
    assert data["status"] == "queued"


def test_get_job_unknown_returns_404():
    r = client.get("/v1/analysis/jobs/nonexistent-id")
    assert r.status_code == 404


def test_get_job_after_submit():
    r = client.post("/v1/analysis/jobs", json={"pgn": SAMPLE_PGN, "depth": 5})
    job_id = r.json()["job_id"]
    r2 = client.get(f"/v1/analysis/jobs/{job_id}")
    assert r2.status_code == 200
    assert r2.json()["job_id"] == job_id


def test_analysis_with_mocked_stockfish():
    """Full analysis pipeline with stockfish mocked out."""
    mock_result = {
        "moves": [
            {
                "move_number": 1, "color": "white", "san": "e4",
                "fen_after": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
                "eval_before": {"score_cp": 20, "best_move": "e2e4", "mate": None},
                "eval_after": {"score_cp": 20, "best_move": "e7e5", "mate": None},
                "classification": "good",
                "eval_delta": 0,
            }
        ],
        "summary": {
            "blunders": 0, "mistakes": 0, "inaccuracies": 0,
            "white_accuracy": 98.0, "black_accuracy": 97.0,
        }
    }

    with patch("api.worker.stockfish_worker.analyse_pgn", return_value=mock_result):
        import time
        r = client.post(
            "/v1/analysis/jobs",
            json={"pgn": SAMPLE_PGN, "depth": 5, "include_llm_takeaways": False}
        )
        job_id = r.json()["job_id"]

        # Poll briefly (background tasks run synchronously in TestClient)
        for _ in range(20):
            r2 = client.get(f"/v1/analysis/jobs/{job_id}")
            if r2.json()["status"] in ("done", "error"):
                break
            time.sleep(0.05)

        data = r2.json()
        assert data["status"] == "done"
        assert data["result"]["summary"]["blunders"] == 0


def test_result_endpoint_unknown_job_returns_404():
    """GET /result for an unknown job_id must return 404."""
    r = client.get("/v1/analysis/jobs/does-not-exist/result")
    assert r.status_code == 404


def test_result_endpoint_returns_202_while_queued():
    """GET /result returns 202 while the job is still queued/running."""
    r = client.post("/v1/analysis/jobs", json={"pgn": SAMPLE_PGN, "depth": 5})
    assert r.status_code == 201
    job_id = r.json()["job_id"]

    # Immediately query before background task has a chance to finish
    # Force the in-memory state back to 'queued' to simulate a pending job
    from api.routes.analysis import _jobs
    _jobs[job_id]["status"] = "queued"

    r2 = client.get(f"/v1/analysis/jobs/{job_id}/result")
    assert r2.status_code == 202
    assert r2.json()["status"] == "pending"


def test_result_endpoint_returns_200_when_done():
    """GET /result returns 200 + {result: ...} once the job is marked done."""
    r = client.post("/v1/analysis/jobs", json={"pgn": SAMPLE_PGN, "depth": 5})
    assert r.status_code == 201
    job_id = r.json()["job_id"]

    # Simulate the worker completing the job
    from api.routes.analysis import _jobs
    mock_result = {
        "moves": [],
        "summary": {
            "blunders": 0, "mistakes": 0, "inaccuracies": 0,
            "white_accuracy": 100.0, "black_accuracy": 100.0,
        },
    }
    _jobs[job_id]["status"] = "done"
    _jobs[job_id]["result"] = mock_result

    r2 = client.get(f"/v1/analysis/jobs/{job_id}/result")
    assert r2.status_code == 200
    data = r2.json()
    assert "result" in data
    assert data["result"]["summary"]["blunders"] == 0


def test_commentary_endpoint():
    """POST /v1/commentary returns a comment string."""
    mock_comment = AsyncMock(return_value="A solid central pawn move.")
    with patch("api.worker.llm_worker.comment_on_move", mock_comment):
        r = client.post(
            "/v1/commentary",
            json={"fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", "move": "e4"}
        )
        assert r.status_code == 200
        assert "comment" in r.json()


def test_commentary_falls_back_on_error():
    """If LLM throws, commentary endpoint returns a canned phrase (not 500)."""
    mock_comment = AsyncMock(side_effect=RuntimeError("no key"))
    with patch("api.worker.llm_worker.comment_on_move", mock_comment):
        r = client.post(
            "/v1/commentary",
            json={"fen": "startpos", "move": "e4"}
        )
        assert r.status_code == 200
        assert len(r.json()["comment"]) > 0


def test_post_job_redis_enqueue():
    """POST /jobs must call enqueue with a payload that contains the pgn and depth."""
    # The lazy import inside submit_job does `from api.queue import enqueue`, so
    # we patch the function at its definition site (api.queue.enqueue).
    with patch("api.queue.enqueue") as mock_enqueue:
        r = client.post(
            "/v1/analysis/jobs",
            json={"pgn": SAMPLE_PGN, "depth": 12},
        )

    assert r.status_code == 201
    # enqueue should have been called exactly once
    mock_enqueue.assert_called_once()
    call_kwargs = mock_enqueue.call_args

    # enqueue signature: (job_id, pgn, depth, include_llm, api_key)
    # Accept either positional or keyword invocation
    positional = call_kwargs[0]  # tuple of positional args
    keyword = call_kwargs[1]     # dict of keyword args

    # Merge them by position for easier assertions
    all_args = list(positional) + list(keyword.values())
    passed_pgn = positional[1] if len(positional) > 1 else keyword.get("pgn")
    passed_depth = positional[2] if len(positional) > 2 else keyword.get("depth")

    assert passed_pgn == SAMPLE_PGN
    assert passed_depth == 12


def test_job_status_transitions():
    """Injecting a job directly into _jobs must be reflected in GET /jobs/{id}."""
    from api.routes.analysis import _jobs

    # Inject a synthetic job in a known state
    synthetic_id = "test-transition-job-id"
    _jobs[synthetic_id] = {"status": "running", "result": None, "error": None}

    try:
        r = client.get(f"/v1/analysis/jobs/{synthetic_id}")
        assert r.status_code == 200
        data = r.json()
        assert data["job_id"] == synthetic_id
        assert data["status"] == "running"

        # Simulate worker completing the job
        _jobs[synthetic_id]["status"] = "done"
        _jobs[synthetic_id]["result"] = {"moves": [], "summary": {}}

        r2 = client.get(f"/v1/analysis/jobs/{synthetic_id}")
        assert r2.status_code == 200
        assert r2.json()["status"] == "done"
    finally:
        # Clean up so this synthetic entry does not leak into other tests
        _jobs.pop(synthetic_id, None)


def test_auth_enabled_blocks_missing_key(monkeypatch):
    monkeypatch.setenv("API_AUTH_ENABLED", "true")
    monkeypatch.setenv("BOARD_API_KEY", "test-secret")

    r = client.post("/v1/analysis/jobs", json={"pgn": SAMPLE_PGN, "depth": 5})
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid or missing API key"


def test_auth_enabled_allows_valid_key(monkeypatch):
    monkeypatch.setenv("API_AUTH_ENABLED", "true")
    monkeypatch.setenv("BOARD_API_KEY", "test-secret")

    r = client.post(
        "/v1/analysis/jobs",
        headers={"X-API-Key": "test-secret"},
        json={"pgn": SAMPLE_PGN, "depth": 5},
    )
    assert r.status_code == 201


def test_commentary_requires_key_when_enabled(monkeypatch):
    monkeypatch.setenv("API_AUTH_ENABLED", "true")
    monkeypatch.setenv("BOARD_API_KEY", "test-secret")

    r = client.post("/v1/commentary", json={"fen": "startpos", "move": "e4"})
    assert r.status_code == 401
