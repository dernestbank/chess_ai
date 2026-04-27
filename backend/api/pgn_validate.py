"""Fast PGN checks before analysis jobs are queued."""
from __future__ import annotations

import io

import chess
import chess.pgn

MAX_PGN_CHARS = 500_000


def validate_pgn_for_analysis(pgn: str) -> None:
    """Ensure *pgn* parses and the mainline is legal.

    Raises ``ValueError`` with a short message if validation fails.
    """
    if not pgn or not str(pgn).strip():
        raise ValueError("PGN is empty")

    text = str(pgn)
    if len(text) > MAX_PGN_CHARS:
        raise ValueError(f"PGN exceeds maximum length ({MAX_PGN_CHARS} characters)")

    game = chess.pgn.read_game(io.StringIO(text))
    if game is None:
        raise ValueError("No chess game found in PGN")

    board = game.board()
    for move in game.mainline_moves():
        board.push(move)
