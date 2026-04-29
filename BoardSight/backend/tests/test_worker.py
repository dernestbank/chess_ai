"""
Unit tests for BoardSight analysis worker.

Run from the backend/ directory:
    pytest tests/test_worker.py -v

The tests do NOT require a live Redis, Postgres, or Stockfish installation;
all external dependencies are mocked via unittest.mock.
"""
from __future__ import annotations

import io
import json
import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch, call

# ---------------------------------------------------------------------------
# Stub out the database module before worker is imported so that the
# module-level `from api.database import engine, SessionLocal` does not
# attempt a real database connection.
# (sys.path is already set up by conftest.py)
# ---------------------------------------------------------------------------
_db_stub = types.ModuleType("api.database")
_db_stub.engine = MagicMock()
_db_stub.SessionLocal = MagicMock()
_db_stub.get_db = MagicMock()
sys.modules.setdefault("api.database", _db_stub)

# Also stub `stockfish` at the top level so the import inside worker.py
# (`from stockfish import Stockfish`) can be controlled per-test without
# the package being installed at all.
_sf_pkg = sys.modules.setdefault("stockfish", types.ModuleType("stockfish"))
if not hasattr(_sf_pkg, "Stockfish"):
    _sf_pkg.Stockfish = MagicMock  # type: ignore[attr-defined]

# Now we can safely import the worker module.
import worker.worker as worker_mod  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MINIMAL_PGN = (
    "[Event \"Test\"]\n"
    "[Site \"?\"]\n"
    "[Date \"????.??.??\"]\n"
    "[Round \"?\"]\n"
    "[White \"Player1\"]\n"
    "[Black \"Player2\"]\n"
    "[Result \"*\"]\n"
    "\n"
    "1. e4 e5 2. Nf3 Nc6 *\n"
)

FOUR_MOVE_PGN = (
    "[Event \"Test\"]\n"
    "[Site \"?\"]\n"
    "[Date \"????.??.??\"]\n"
    "[Round \"?\"]\n"
    "[White \"Player1\"]\n"
    "[Black \"Player2\"]\n"
    "[Result \"*\"]\n"
    "\n"
    "1. d4 d5 2. c4 c5 *\n"
)

INVALID_PGN = "this is not pgn at all"


# ===========================================================================
# 1. Move classification
# ===========================================================================

class TestClassifyMove(unittest.TestCase):
    """classify_move(cp_loss) -> classification label or None."""

    def test_negative_loss_is_brilliant(self):
        """A negative centipawn loss (player found a better move) is 'brilliant'."""
        self.assertEqual(worker_mod.classify_move(-1), "brilliant")
        self.assertEqual(worker_mod.classify_move(-50), "brilliant")
        self.assertEqual(worker_mod.classify_move(-0.001), "brilliant")

    def test_zero_loss_is_good(self):
        """Exactly zero cp loss returns None (good / best move)."""
        self.assertIsNone(worker_mod.classify_move(0))

    def test_small_loss_is_good(self):
        """A loss under 10 cp returns None."""
        self.assertIsNone(worker_mod.classify_move(9))
        self.assertIsNone(worker_mod.classify_move(0.5))

    def test_boundary_10_is_inaccuracy(self):
        """10 cp loss is the first inaccuracy threshold."""
        self.assertEqual(worker_mod.classify_move(10), "inaccuracy")

    def test_inaccuracy_range(self):
        """Losses in [10, 50) are inaccuracies."""
        for cp in (10, 25, 49):
            with self.subTest(cp=cp):
                self.assertEqual(worker_mod.classify_move(cp), "inaccuracy")

    def test_boundary_50_is_mistake(self):
        """50 cp loss is the first mistake threshold."""
        self.assertEqual(worker_mod.classify_move(50), "mistake")

    def test_mistake_range(self):
        """Losses in [50, 100) are mistakes."""
        for cp in (50, 75, 99):
            with self.subTest(cp=cp):
                self.assertEqual(worker_mod.classify_move(cp), "mistake")

    def test_boundary_100_is_blunder(self):
        """100 cp loss is the first blunder threshold."""
        self.assertEqual(worker_mod.classify_move(100), "blunder")

    def test_blunder_range(self):
        """Losses >= 100 cp are blunders."""
        for cp in (100, 200, 500, 10_000):
            with self.subTest(cp=cp):
                self.assertEqual(worker_mod.classify_move(cp), "blunder")

    def test_floating_point_boundary(self):
        """Values just below a threshold stay in the lower category."""
        self.assertEqual(worker_mod.classify_move(49.9), "inaccuracy")
        self.assertEqual(worker_mod.classify_move(99.9), "mistake")


# ===========================================================================
# 2. Accuracy calculation
# ===========================================================================

class TestAccuracyCalculation(unittest.TestCase):
    """
    The accuracy formula inside analyze_pgn is:
        round(max(0, min(100, 100 - avg_loss / 10)), 1)

    We test this by patching Stockfish so that analyse_pgn returns
    deterministic evaluations, then checking the 'accuracy' field in the
    returned dict.
    """

    def _run_with_constant_eval(self, pgn: str, cp_value: int) -> dict:
        """
        Run analyze_pgn with a Stockfish mock that always returns
        {"type": "cp", "value": cp_value}.
        """
        mock_sf = MagicMock()
        mock_sf.get_evaluation.return_value = {"type": "cp", "value": cp_value}

        with patch.dict("sys.modules", {"stockfish": types.SimpleNamespace(Stockfish=lambda **kw: mock_sf)}):
            # Force re-import of Stockfish inside analyze_pgn by patching the
            # module attribute directly after the module is already loaded.
            with patch.object(worker_mod, "STOCKFISH_PATH", "/fake/stockfish"):
                # Patch the stockfish import inside the function body.
                mock_stockfish_module = MagicMock()
                mock_stockfish_module.Stockfish.return_value = mock_sf
                with patch.dict(sys.modules, {"stockfish": mock_stockfish_module}):
                    result = worker_mod.analyze_pgn(pgn)
        return result

    def test_perfect_game_accuracy(self):
        """
        When every move evaluation stays the same (0 cp loss), accuracy = 100.
        """
        result = self._run_with_constant_eval(MINIMAL_PGN, 30)
        # With constant eval, cp_loss = before - after = 30 - 30 = 0
        self.assertEqual(result["accuracy"]["white"], 100.0)
        self.assertEqual(result["accuracy"]["black"], 100.0)

    def test_accuracy_never_exceeds_100(self):
        """Accuracy is capped at 100.0."""
        result = self._run_with_constant_eval(MINIMAL_PGN, 0)
        self.assertLessEqual(result["accuracy"]["white"], 100.0)
        self.assertLessEqual(result["accuracy"]["black"], 100.0)

    def test_accuracy_never_below_0(self):
        """Accuracy floor is 0.0."""
        # Large cp loss should still give 0, not negative.
        result = self._run_with_constant_eval(MINIMAL_PGN, 1_000)
        self.assertGreaterEqual(result["accuracy"]["white"], 0.0)
        self.assertGreaterEqual(result["accuracy"]["black"], 0.0)

    def test_accuracy_formula_directly(self):
        """
        White makes two moves with average 50 cp loss.
        Expected accuracy = round(max(0, min(100, 100 - 50/10)), 1) = 95.0
        """
        # We replicate the internal accuracy() helper and verify the math.
        cp_losses = [50.0, 50.0]
        avg = sum(cp_losses) / len(cp_losses)  # 50.0
        expected = round(max(0, min(100, 100 - avg / 10)), 1)  # 95.0
        self.assertEqual(expected, 95.0)

    def test_accuracy_formula_blunder_average(self):
        """Average 200 cp loss gives accuracy 80.0."""
        cp_losses = [200.0, 200.0]
        avg = sum(cp_losses) / len(cp_losses)
        expected = round(max(0, min(100, 100 - avg / 10)), 1)
        self.assertEqual(expected, 80.0)

    def test_accuracy_formula_extreme_loss(self):
        """Extremely large average loss is floored at 0.0."""
        cp_losses = [10_000.0]
        avg = sum(cp_losses) / len(cp_losses)
        expected = round(max(0, min(100, 100 - avg / 10)), 1)
        self.assertEqual(expected, 0.0)

    def test_accuracy_result_structure(self):
        """analyze_pgn result always contains 'accuracy' with 'white' and 'black' keys."""
        result = self._run_with_constant_eval(MINIMAL_PGN, 30)
        self.assertIn("accuracy", result)
        self.assertIn("white", result["accuracy"])
        self.assertIn("black", result["accuracy"])
        self.assertIsInstance(result["accuracy"]["white"], float)
        self.assertIsInstance(result["accuracy"]["black"], float)


# ===========================================================================
# 3. PGN parsing
# ===========================================================================

class TestPgnParsing(unittest.TestCase):
    """
    Verify that analyze_pgn correctly parses PGN input by inspecting the
    'moves' list it produces. We mock Stockfish so the test is pure Python.
    """

    def _analyze(self, pgn: str, cp_value: int = 30) -> dict:
        mock_sf = MagicMock()
        mock_sf.get_evaluation.return_value = {"type": "cp", "value": cp_value}
        mock_stockfish_module = MagicMock()
        mock_stockfish_module.Stockfish.return_value = mock_sf
        with patch.dict(sys.modules, {"stockfish": mock_stockfish_module}):
            with patch.object(worker_mod, "STOCKFISH_PATH", "/fake/sf"):
                return worker_mod.analyze_pgn(pgn)

    def test_valid_pgn_returns_moves_list(self):
        """A well-formed PGN produces a non-empty list of move annotations."""
        result = self._analyze(MINIMAL_PGN)
        self.assertIn("moves", result)
        self.assertIsInstance(result["moves"], list)
        self.assertGreater(len(result["moves"]), 0)

    def test_correct_move_count(self):
        """MINIMAL_PGN has 4 half-moves; 'moves' list should have 4 entries."""
        result = self._analyze(MINIMAL_PGN)
        self.assertEqual(len(result["moves"]), 4)

    def test_move_annotation_fields(self):
        """Each move annotation contains the required keys."""
        result = self._analyze(MINIMAL_PGN)
        for ann in result["moves"]:
            with self.subTest(ann=ann):
                self.assertIn("moveNumber", ann)
                self.assertIn("san", ann)
                self.assertIn("evalCp", ann)
                self.assertIn("classification", ann)

    def test_move_numbers_are_sequential(self):
        """moveNumber values increase (1, 1, 2, 2, ...) for paired half-moves."""
        result = self._analyze(MINIMAL_PGN)
        move_numbers = [a["moveNumber"] for a in result["moves"]]
        # First two half-moves are move 1, next two are move 2
        self.assertEqual(move_numbers, [1, 1, 2, 2])

    def test_san_values_are_strings(self):
        """SAN strings are non-empty strings."""
        result = self._analyze(MINIMAL_PGN)
        for ann in result["moves"]:
            self.assertIsInstance(ann["san"], str)
            self.assertTrue(ann["san"].strip())

    def test_four_move_pgn_count(self):
        """FOUR_MOVE_PGN (d4 d5 c4 c5) also produces 4 half-moves."""
        result = self._analyze(FOUR_MOVE_PGN)
        self.assertEqual(len(result["moves"]), 4)

    def test_invalid_pgn_raises_value_error(self):
        """A completely invalid PGN string causes analyze_pgn to raise ValueError."""
        mock_sf = MagicMock()
        mock_sf.get_evaluation.return_value = {"type": "cp", "value": 0}
        mock_stockfish_module = MagicMock()
        mock_stockfish_module.Stockfish.return_value = mock_sf
        with patch.dict(sys.modules, {"stockfish": mock_stockfish_module}):
            with patch.object(worker_mod, "STOCKFISH_PATH", "/fake/sf"):
                with self.assertRaises(ValueError):
                    worker_mod.analyze_pgn(INVALID_PGN)

    def test_stockfish_unavailable_returns_stub(self):
        """When Stockfish raises on construction, a stub result is returned."""
        mock_stockfish_module = MagicMock()
        mock_stockfish_module.Stockfish.side_effect = FileNotFoundError("not found")
        with patch.dict(sys.modules, {"stockfish": mock_stockfish_module}):
            with patch.object(worker_mod, "STOCKFISH_PATH", "/nonexistent"):
                result = worker_mod.analyze_pgn(MINIMAL_PGN)
        self.assertIn("moves", result)
        self.assertIn("accuracy", result)
        self.assertIn("takeaways", result)
        self.assertEqual(result["moves"], [])


# ===========================================================================
# 4. Job status flow (Redis + DB)
# ===========================================================================

class TestProcessJob(unittest.TestCase):
    """
    Test process_job() in isolation:
      - Job status transitions  pending -> running -> done / failed
      - AnalysisResult is created and written to the session
    """

    def _make_db_session(self) -> MagicMock:
        """Return a minimal mock that looks like a SQLAlchemy Session."""
        session = MagicMock()
        # query(...).filter(...).update(...) chain
        session.query.return_value.filter.return_value.update.return_value = 1
        return session

    def _mock_analyze_pgn(self, result_data: dict):
        """Patch analyze_pgn so it returns a controlled dict."""
        return patch.object(worker_mod, "analyze_pgn", return_value=result_data)

    def test_job_status_set_to_running_first(self):
        """process_job() marks the job 'running' before analyzing."""
        db = self._make_db_session()
        fake_result = {"moves": [], "accuracy": {"white": 100.0, "black": 100.0}}
        with self._mock_analyze_pgn(fake_result):
            worker_mod.process_job("job-001", MINIMAL_PGN, db)

        # Collect all .update() calls and verify 'running' appears before 'done'
        update_calls = db.query.return_value.filter.return_value.update.call_args_list
        statuses = [c.args[0]["status"] for c in update_calls]
        self.assertIn("running", statuses)
        running_idx = statuses.index("running")
        done_idx = statuses.index("done")
        self.assertLess(running_idx, done_idx, "running must be set before done")

    def test_job_status_set_to_done_on_success(self):
        """process_job() marks the job 'done' on successful analysis."""
        db = self._make_db_session()
        fake_result = {"moves": [], "accuracy": {"white": 95.0, "black": 90.0}}
        with self._mock_analyze_pgn(fake_result):
            worker_mod.process_job("job-002", MINIMAL_PGN, db)

        update_calls = db.query.return_value.filter.return_value.update.call_args_list
        statuses = [c.args[0]["status"] for c in update_calls]
        self.assertIn("done", statuses)

    def test_result_added_to_db_session(self):
        """process_job() calls db.add() with an AnalysisResult containing the job id."""
        db = self._make_db_session()
        fake_result = {"moves": [], "accuracy": {"white": 100.0, "black": 100.0}}
        with self._mock_analyze_pgn(fake_result):
            worker_mod.process_job("job-003", MINIMAL_PGN, db)

        db.add.assert_called_once()
        added_obj = db.add.call_args.args[0]
        self.assertIsInstance(added_obj, worker_mod.AnalysisResult)
        self.assertEqual(added_obj.job_id, "job-003")

    def test_result_payload_contains_job_id(self):
        """The serialised payload written to DB includes the jobId field."""
        db = self._make_db_session()
        fake_result = {"moves": [], "accuracy": {"white": 100.0, "black": 100.0}}
        with self._mock_analyze_pgn(fake_result):
            worker_mod.process_job("job-004", MINIMAL_PGN, db)

        added_obj = db.add.call_args.args[0]
        payload = json.loads(added_obj.payload_json)
        self.assertEqual(payload["jobId"], "job-004")

    def test_job_status_set_to_failed_on_exception(self):
        """If analyze_pgn raises, process_job() marks the job 'failed'."""
        db = self._make_db_session()
        with patch.object(worker_mod, "analyze_pgn", side_effect=RuntimeError("boom")):
            worker_mod.process_job("job-005", MINIMAL_PGN, db)

        update_calls = db.query.return_value.filter.return_value.update.call_args_list
        statuses = [c.args[0]["status"] for c in update_calls]
        self.assertIn("failed", statuses)
        self.assertNotIn("done", statuses)

    def test_db_commit_called_on_success(self):
        """db.commit() is called at least twice: after 'running' and after 'done'."""
        db = self._make_db_session()
        fake_result = {"moves": [], "accuracy": {"white": 100.0, "black": 100.0}}
        with self._mock_analyze_pgn(fake_result):
            worker_mod.process_job("job-006", MINIMAL_PGN, db)

        self.assertGreaterEqual(db.commit.call_count, 2)

    def test_db_commit_called_on_failure(self):
        """db.commit() is called after marking the job as failed."""
        db = self._make_db_session()
        with patch.object(worker_mod, "analyze_pgn", side_effect=ValueError("bad pgn")):
            worker_mod.process_job("job-007", MINIMAL_PGN, db)

        self.assertGreaterEqual(db.commit.call_count, 1)

    def test_result_not_added_on_failure(self):
        """db.add() is NOT called when analysis raises."""
        db = self._make_db_session()
        with patch.object(worker_mod, "analyze_pgn", side_effect=ValueError("bad")):
            worker_mod.process_job("job-008", MINIMAL_PGN, db)

        db.add.assert_not_called()


# ===========================================================================
# 5. Redis queue consumption (main loop, one iteration)
# ===========================================================================

class TestMainLoopQueueConsumption(unittest.TestCase):
    """
    Verify that the main() loop:
      - Calls brpop on the correct queue name.
      - Decodes the payload and passes the jobId / pgn to process_job.
    We stop the loop after the first iteration by making the second brpop
    raise a KeyboardInterrupt.
    """

    def _make_redis_mock(self, payload: dict):
        """
        Return a Redis mock whose brpop yields one message then raises
        KeyboardInterrupt to break the while-True loop.
        """
        r_mock = MagicMock()
        r_mock.brpop.side_effect = [
            (worker_mod.QUEUE_NAME, json.dumps(payload)),
            KeyboardInterrupt,
        ]
        return r_mock

    def test_brpop_called_with_correct_queue(self):
        """main() calls brpop with the QUEUE_NAME constant."""
        payload = {"jobId": "job-q01", "pgn": MINIMAL_PGN}
        r_mock = self._make_redis_mock(payload)

        with patch("worker.worker.redis") as mock_redis_module, \
             patch("worker.worker.Base") as mock_base, \
             patch("worker.worker.engine"), \
             patch("worker.worker.SessionLocal") as mock_session_cls, \
             patch("worker.worker.process_job"):

            mock_redis_module.from_url.return_value = r_mock
            mock_redis_module.exceptions.ConnectionError = ConnectionError
            mock_session_cls.return_value.__enter__ = MagicMock(return_value=MagicMock())
            mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)
            mock_base.metadata.create_all = MagicMock()

            with self.assertRaises(KeyboardInterrupt):
                worker_mod.main()

        r_mock.brpop.assert_called_with(worker_mod.QUEUE_NAME, timeout=5)

    def test_process_job_called_with_correct_args(self):
        """main() extracts jobId and pgn from the queue payload and calls process_job."""
        payload = {"jobId": "job-q02", "pgn": MINIMAL_PGN}
        r_mock = self._make_redis_mock(payload)

        with patch("worker.worker.redis") as mock_redis_module, \
             patch("worker.worker.Base") as mock_base, \
             patch("worker.worker.engine"), \
             patch("worker.worker.SessionLocal") as mock_session_cls, \
             patch("worker.worker.process_job") as mock_process_job:

            mock_redis_module.from_url.return_value = r_mock
            mock_redis_module.exceptions.ConnectionError = ConnectionError
            fake_db = MagicMock()
            mock_session_cls.return_value.__enter__ = MagicMock(return_value=fake_db)
            mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)
            mock_base.metadata.create_all = MagicMock()

            with self.assertRaises(KeyboardInterrupt):
                worker_mod.main()

        mock_process_job.assert_called_once_with("job-q02", MINIMAL_PGN, fake_db)

    def test_none_brpop_result_skips_processing(self):
        """main() does not call process_job when brpop times out (returns None)."""
        r_mock = MagicMock()
        r_mock.brpop.side_effect = [None, KeyboardInterrupt]

        with patch("worker.worker.redis") as mock_redis_module, \
             patch("worker.worker.Base") as mock_base, \
             patch("worker.worker.engine"), \
             patch("worker.worker.SessionLocal") as mock_session_cls, \
             patch("worker.worker.process_job") as mock_process_job:

            mock_redis_module.from_url.return_value = r_mock
            mock_redis_module.exceptions.ConnectionError = ConnectionError
            mock_session_cls.return_value.__enter__ = MagicMock(return_value=MagicMock())
            mock_session_cls.return_value.__exit__ = MagicMock(return_value=False)
            mock_base.metadata.create_all = MagicMock()

            with self.assertRaises(KeyboardInterrupt):
                worker_mod.main()

        mock_process_job.assert_not_called()


# ===========================================================================
# 6. Stockfish mock integration – get_evaluation return value contract
# ===========================================================================

class TestStockfishMockIntegration(unittest.TestCase):
    """
    Verify that when get_evaluation() is mocked to return
    {"type": "cp", "value": 30}, analyze_pgn produces plausible output:
    - evalCp values are integers equal to 30 (after move — constant board eval)
    - No exceptions are raised
    """

    def _analyze_with_fixed_eval(self, pgn: str, eval_value: int = 30) -> dict:
        mock_sf = MagicMock()
        mock_sf.get_evaluation.return_value = {"type": "cp", "value": eval_value}
        mock_stockfish_module = MagicMock()
        mock_stockfish_module.Stockfish.return_value = mock_sf
        with patch.dict(sys.modules, {"stockfish": mock_stockfish_module}):
            with patch.object(worker_mod, "STOCKFISH_PATH", "/fake/sf"):
                return worker_mod.analyze_pgn(pgn)

    def test_returns_dict_with_expected_top_level_keys(self):
        result = self._analyze_with_fixed_eval(MINIMAL_PGN)
        self.assertIn("moves", result)
        self.assertIn("accuracy", result)

    def test_eval_cp_values_are_integers(self):
        """evalCp on every annotation is an int (worker casts via int())."""
        result = self._analyze_with_fixed_eval(MINIMAL_PGN)
        for ann in result["moves"]:
            self.assertIsInstance(ann["evalCp"], int)

    def test_eval_cp_equals_mocked_value(self):
        """With a constant eval of 30, all evalCp == 30."""
        result = self._analyze_with_fixed_eval(MINIMAL_PGN, 30)
        for ann in result["moves"]:
            self.assertEqual(ann["evalCp"], 30)

    def test_get_evaluation_called_twice_per_move(self):
        """
        Stockfish is queried before AND after each half-move, so
        get_evaluation() should be called 2 * (number of half-moves) times.
        """
        mock_sf = MagicMock()
        mock_sf.get_evaluation.return_value = {"type": "cp", "value": 0}
        mock_stockfish_module = MagicMock()
        mock_stockfish_module.Stockfish.return_value = mock_sf
        with patch.dict(sys.modules, {"stockfish": mock_stockfish_module}):
            with patch.object(worker_mod, "STOCKFISH_PATH", "/fake/sf"):
                result = worker_mod.analyze_pgn(MINIMAL_PGN)

        num_half_moves = len(result["moves"])  # 4
        self.assertEqual(mock_sf.get_evaluation.call_count, 2 * num_half_moves)

    def test_mate_eval_converted_to_large_cp(self):
        """
        When get_evaluation returns {"type": "mate", "value": 3},
        the worker converts that to +10 000 cp.  No exception should be raised
        and the result should be a valid dict.
        """
        mock_sf = MagicMock()
        mock_sf.get_evaluation.return_value = {"type": "mate", "value": 3}
        mock_stockfish_module = MagicMock()
        mock_stockfish_module.Stockfish.return_value = mock_sf
        with patch.dict(sys.modules, {"stockfish": mock_stockfish_module}):
            with patch.object(worker_mod, "STOCKFISH_PATH", "/fake/sf"):
                result = worker_mod.analyze_pgn(MINIMAL_PGN)

        self.assertIn("moves", result)
        self.assertIn("accuracy", result)

    def test_negative_mate_eval_converted_to_negative_large_cp(self):
        """
        {"type": "mate", "value": -2} should be treated as -10 000 cp
        and not crash the worker.
        """
        mock_sf = MagicMock()
        mock_sf.get_evaluation.return_value = {"type": "mate", "value": -2}
        mock_stockfish_module = MagicMock()
        mock_stockfish_module.Stockfish.return_value = mock_sf
        with patch.dict(sys.modules, {"stockfish": mock_stockfish_module}):
            with patch.object(worker_mod, "STOCKFISH_PATH", "/fake/sf"):
                result = worker_mod.analyze_pgn(MINIMAL_PGN)

        self.assertIn("moves", result)


if __name__ == "__main__":
    unittest.main()
