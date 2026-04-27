"""Unit tests for worker/main.py and api/worker/stockfish_worker.py.

All external dependencies (Stockfish binary, Postgres, Redis) are mocked out
so these tests run in any environment without infrastructure.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch, call

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_conn():
    """Return a MagicMock that behaves as a psycopg2 connection context manager."""
    mock_cursor = MagicMock()
    mock_conn = MagicMock()
    # Support `with get_conn() as conn:` — __enter__ returns the connection itself
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    # Support `with conn.cursor() as cur:`
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn, mock_cursor


# ---------------------------------------------------------------------------
# Tests for worker/main.py — _process()
# ---------------------------------------------------------------------------

class TestWorkerProcess:
    """Tests for the _process() function in worker/main.py."""

    def test_worker_processes_job_from_queue(self):
        """_process must call _set_status('done') when analyse_pgn succeeds."""
        import worker.main as worker_main  # noqa: PLC0415

        job = {
            "job_id": "job-abc",
            "pgn": "1. e4 e5",
            "depth": 12,
            "include_llm_takeaways": False,
            "api_key": None,
        }
        mock_result = {
            "moves": [],
            "summary": {
                "blunders": 0,
                "mistakes": 0,
                "inaccuracies": 0,
                "white_accuracy": 100.0,
                "black_accuracy": 100.0,
            },
        }
        mock_conn, mock_cursor = _make_mock_conn()

        with patch("api.db.get_conn", return_value=mock_conn), \
             patch("api.worker.stockfish_worker.analyse_pgn", return_value=mock_result) as mock_analyse:

            worker_main._process(job)

        # analyse_pgn must have been called with the pgn and depth from the job
        mock_analyse.assert_called_once_with("1. e4 e5", 12)

        # cursor.execute must have been called at least twice:
        # once to mark 'running', once to mark 'done'
        assert mock_cursor.execute.call_count >= 2

        # The final status update must be 'done'
        last_call_args = mock_cursor.execute.call_args_list[-1][0]
        sql: str = last_call_args[0]
        params: tuple = last_call_args[1]
        assert "UPDATE analysis_jobs" in sql
        assert params[0] == "done"
        # result JSON should be present (not None)
        assert params[1] is not None
        assert params[3] == "job-abc"

    def test_worker_marks_error_on_exception(self):
        """_process must call _set_status('error', ...) when analyse_pgn raises."""
        import worker.main as worker_main  # noqa: PLC0415

        job = {
            "job_id": "job-err",
            "pgn": "bad pgn",
            "depth": 5,
            "include_llm_takeaways": False,
            "api_key": None,
        }
        mock_conn, mock_cursor = _make_mock_conn()

        with patch("api.db.get_conn", return_value=mock_conn), \
             patch(
                 "api.worker.stockfish_worker.analyse_pgn",
                 side_effect=RuntimeError("stockfish not found"),
             ):

            worker_main._process(job)

        # At least two execute calls: 'running' then 'error'
        assert mock_cursor.execute.call_count >= 2

        last_call_args = mock_cursor.execute.call_args_list[-1][0]
        sql: str = last_call_args[0]
        params: tuple = last_call_args[1]
        assert "UPDATE analysis_jobs" in sql
        # First parameter is the status — must be 'error'
        assert params[0] == "error"
        # Third parameter is the error message
        assert "stockfish not found" in params[2]
        assert params[3] == "job-err"


# ---------------------------------------------------------------------------
# Tests for worker/main.py — main() loop
# ---------------------------------------------------------------------------

class TestWorkerMain:
    """Tests for the main() entry-point loop in worker/main.py."""

    def test_worker_exits_on_sigterm(self):
        """main() must exit cleanly when the `running` flag is set to False.

        We simulate SIGTERM by patching dequeue to flip `running` to False
        after the first call, then return None so the loop exits immediately.
        """
        import worker.main as worker_main  # noqa: PLC0415

        call_count = 0

        def fake_dequeue(timeout=5):
            nonlocal call_count
            call_count += 1
            # On the first call, simulate signal receipt by clearing the flag
            worker_main.running = False
            return None  # no job — loop sees running=False and exits

        with patch("api.db.init_db"), \
             patch("api.queue.dequeue", side_effect=fake_dequeue):

            # Ensure the flag starts as True
            worker_main.running = True
            worker_main.main()

        # dequeue was called at least once before the loop stopped
        assert call_count >= 1
        # running flag is now False (as set by fake_dequeue)
        assert worker_main.running is False


# ---------------------------------------------------------------------------
# Tests for api/worker/stockfish_worker.py — _classify()
# ---------------------------------------------------------------------------

class TestStockfishWorkerClassify:
    """Tests for the _classify() helper in stockfish_worker.py.

    Classification thresholds (centipawn loss):
      >= 300  → 'blunder'
      >= 100  → 'mistake'
      >= 50   → 'inaccuracy'
      <  50   → 'good'
      None    → 'good'
    """

    def _classify(self, delta):
        from api.worker.stockfish_worker import _classify  # noqa: PLC0415
        return _classify(delta)

    def test_stockfish_worker_classify_blunder(self):
        """cp_loss >= 300 must be classified as 'blunder'."""
        assert self._classify(300) == "blunder"
        assert self._classify(500) == "blunder"
        assert self._classify(1000) == "blunder"

    def test_stockfish_worker_classify_mistake(self):
        """cp_loss in range [100, 299] must be classified as 'mistake'."""
        assert self._classify(100) == "mistake"
        assert self._classify(150) == "mistake"
        assert self._classify(299) == "mistake"

    def test_stockfish_worker_classify_inaccuracy(self):
        """cp_loss in range [50, 99] must be classified as 'inaccuracy'."""
        assert self._classify(50) == "inaccuracy"
        assert self._classify(75) == "inaccuracy"
        assert self._classify(99) == "inaccuracy"

    def test_stockfish_worker_classify_good(self):
        """cp_loss <= 49 (or None) must be classified as 'good'."""
        assert self._classify(0) == "good"
        assert self._classify(25) == "good"
        assert self._classify(49) == "good"
        assert self._classify(None) == "good"
        # Negative delta (player gained eval) is also 'good'
        assert self._classify(-50) == "good"
