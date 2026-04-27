"""Unit tests for api.pgn_validate."""
import pytest

from api.pgn_validate import MAX_PGN_CHARS, validate_pgn_for_analysis


def test_rejects_empty():
    with pytest.raises(ValueError, match="empty"):
        validate_pgn_for_analysis("")
    with pytest.raises(ValueError, match="empty"):
        validate_pgn_for_analysis("   \n")


def test_rejects_oversize():
    with pytest.raises(ValueError, match="maximum length"):
        validate_pgn_for_analysis("x" * (MAX_PGN_CHARS + 1))


def test_rejects_unparseable():
    with pytest.raises(ValueError, match="No chess game"):
        validate_pgn_for_analysis("%%%% not a pgn %%%%")


def test_accepts_minimal_game():
    validate_pgn_for_analysis("1. e4 e5 *")


def test_accepts_sample_with_headers():
    pgn = """[Event "T"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0"""
    validate_pgn_for_analysis(pgn)
