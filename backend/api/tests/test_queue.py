"""Unit tests for api.queue — enqueue and dequeue helpers."""
import json
from unittest.mock import MagicMock, patch

import pytest

import api.queue as queue_module

QUEUE_KEY = queue_module.QUEUE_KEY

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def mock_redis():
    """Return a MagicMock redis client and patch redis.from_url to return it."""
    client = MagicMock()
    with patch("api.queue.redis.from_url", return_value=client):
        yield client


# ---------------------------------------------------------------------------
# enqueue
# ---------------------------------------------------------------------------

class TestEnqueue:
    def test_enqueue_calls_rpush(self, mock_redis):
        """enqueue must push a JSON blob to the correct queue key."""
        queue_module.enqueue(
            job_id="abc-123",
            pgn="1. e4 e5",
            depth=18,
            include_llm=False,
            api_key=None,
        )

        mock_redis.rpush.assert_called_once()
        call_args = mock_redis.rpush.call_args
        # First positional arg is the queue key
        assert call_args[0][0] == QUEUE_KEY

    def test_enqueue_payload_contains_pgn_and_depth(self, mock_redis):
        """The JSON blob pushed to Redis must contain pgn, depth, and job_id."""
        queue_module.enqueue(
            job_id="job-xyz",
            pgn="1. d4 d5",
            depth=20,
            include_llm=True,
            api_key="sk-test",
        )

        raw_payload: str = mock_redis.rpush.call_args[0][1]
        payload = json.loads(raw_payload)

        assert payload["job_id"] == "job-xyz"
        assert payload["pgn"] == "1. d4 d5"
        assert payload["depth"] == 20
        assert payload["include_llm_takeaways"] is True
        assert payload["api_key"] == "sk-test"

    def test_enqueue_none_api_key_serialises(self, mock_redis):
        """enqueue must not raise when api_key is None."""
        queue_module.enqueue(
            job_id="j1",
            pgn="1. e4",
            depth=5,
            include_llm=False,
            api_key=None,
        )

        raw_payload: str = mock_redis.rpush.call_args[0][1]
        payload = json.loads(raw_payload)
        assert payload["api_key"] is None


# ---------------------------------------------------------------------------
# dequeue
# ---------------------------------------------------------------------------

class TestDequeue:
    def test_dequeue_returns_dict_on_data(self, mock_redis):
        """dequeue must decode the BLPOP value and return a dict."""
        job_data = {"job_id": "j2", "pgn": "1. e4", "depth": 10}
        # blpop returns (key_bytes, value_bytes) tuple
        mock_redis.blpop.return_value = (
            QUEUE_KEY.encode(),
            json.dumps(job_data).encode(),
        )

        result = queue_module.dequeue(timeout=5)

        mock_redis.blpop.assert_called_once_with(QUEUE_KEY, timeout=5)
        assert result == job_data

    def test_dequeue_returns_none_on_timeout(self, mock_redis):
        """dequeue must return None when blpop times out (returns None)."""
        mock_redis.blpop.return_value = None

        result = queue_module.dequeue(timeout=1)

        assert result is None

    def test_dequeue_uses_correct_timeout(self, mock_redis):
        """dequeue must forward the caller's timeout value to blpop."""
        mock_redis.blpop.return_value = None

        queue_module.dequeue(timeout=30)

        mock_redis.blpop.assert_called_once_with(QUEUE_KEY, timeout=30)

    def test_dequeue_default_timeout(self, mock_redis):
        """dequeue default timeout is 5 seconds."""
        mock_redis.blpop.return_value = None

        queue_module.dequeue()

        mock_redis.blpop.assert_called_once_with(QUEUE_KEY, timeout=5)
