"""
Stockfish analysis worker.

Parses a PGN, evaluates each position to `depth`, returns per-move eval list.
Requires `stockfish` binary on PATH (or set STOCKFISH_PATH env var).
"""
from __future__ import annotations

import os
import subprocess
import tempfile
from typing import Any


def _stockfish_bin() -> str:
    return os.environ.get("STOCKFISH_PATH", "stockfish")


def _uci_timeout_sec() -> int:
    raw = os.environ.get("STOCKFISH_UCI_TIMEOUT_SEC", "120")
    try:
        return max(5, int(raw))
    except ValueError:
        return 120


def _uci_eval(fen: str, depth: int) -> dict:
    """Run stockfish on one position, return {score_cp, best_move, mate}."""
    sf = _stockfish_bin()
    commands = f"position fen {fen}\ngo depth {depth}\n"
    try:
        proc = subprocess.run(
            [sf],
            input=commands,
            capture_output=True,
            text=True,
            timeout=_uci_timeout_sec(),
        )
        output = proc.stdout
    except FileNotFoundError:
        raise RuntimeError(
            f"Stockfish binary not found at '{sf}'. "
            "Install stockfish or set STOCKFISH_PATH."
        )

    score_cp: int | None = None
    best_move: str | None = None
    mate: int | None = None

    for line in output.splitlines():
        if "score cp" in line:
            parts = line.split()
            idx = parts.index("cp")
            score_cp = int(parts[idx + 1])
        if "score mate" in line:
            parts = line.split()
            idx = parts.index("mate")
            mate = int(parts[idx + 1])
        if line.startswith("bestmove"):
            parts = line.split()
            best_move = parts[1] if len(parts) > 1 else None

    return {"score_cp": score_cp, "best_move": best_move, "mate": mate}


def analyse_pgn(pgn: str, depth: int = 18) -> dict[str, Any]:
    """
    Parse a PGN and return analysis for each position.

    Returns:
        {
          "moves": [
            {
              "move_number": int,
              "color": "white" | "black",
              "san": str,
              "fen_after": str,
              "eval_before": {score_cp, best_move, mate},
              "eval_after":  {score_cp, best_move, mate},
              "classification": "blunder"|"mistake"|"inaccuracy"|"good"|"best",
              "eval_delta": int,   # centipawn loss (positive = worse for mover)
            },
            ...
          ],
          "summary": {
            "blunders": int, "mistakes": int, "inaccuracies": int,
            "white_accuracy": float, "black_accuracy": float,
          }
        }
    """
    try:
        import chess
        import chess.pgn
        import io

        game = chess.pgn.read_game(io.StringIO(pgn))
        if game is None:
            raise ValueError("Invalid PGN")

        board = game.board()
        moves_analysis: list[dict] = []
        node = game

        move_number = 0
        white_loss_total = 0
        black_loss_total = 0
        white_moves = 0
        black_moves = 0
        counts = {"blunder": 0, "mistake": 0, "inaccuracy": 0}

        while node.variations:
            next_node = node.variations[0]
            move = next_node.move

            fen_before = board.fen()
            color = "white" if board.turn == chess.WHITE else "black"
            san = board.san(move)
            move_number_full = board.fullmove_number

            # Eval before the move
            eval_before = _uci_eval(fen_before, depth)

            board.push(move)
            fen_after = board.fen()

            # Eval after the move (from mover's perspective: negate)
            eval_raw = _uci_eval(fen_after, depth)
            # eval_after is from the NEW side to move — negate for mover's perspective
            eval_after_cp = (
                -eval_raw["score_cp"] if eval_raw["score_cp"] is not None else None
            )

            # Delta: how much worse for mover (positive = lost eval)
            delta: int | None = None
            if eval_before["score_cp"] is not None and eval_after_cp is not None:
                if color == "white":
                    delta = eval_before["score_cp"] - eval_after_cp
                else:
                    delta = -(eval_before["score_cp"]) - (-eval_after_cp)
                    delta = -delta  # loss for black

            classification = _classify(delta)
            if classification in counts:
                counts[classification] += 1

            if color == "white":
                white_loss_total += max(0, delta or 0)
                white_moves += 1
            else:
                black_loss_total += max(0, delta or 0)
                black_moves += 1

            moves_analysis.append(
                {
                    "move_number": move_number_full,
                    "color": color,
                    "san": san,
                    "fen_after": fen_after,
                    "eval_before": eval_before,
                    "eval_after": {"score_cp": eval_after_cp, "best_move": eval_raw["best_move"], "mate": eval_raw["mate"]},
                    "classification": classification,
                    "eval_delta": delta,
                }
            )

            node = next_node

        white_accuracy = _accuracy(white_loss_total, white_moves)
        black_accuracy = _accuracy(black_loss_total, black_moves)

        return {
            "moves": moves_analysis,
            "summary": {
                "blunders": counts["blunder"],
                "mistakes": counts["mistake"],
                "inaccuracies": counts["inaccuracy"],
                "white_accuracy": white_accuracy,
                "black_accuracy": black_accuracy,
            },
        }

    except ImportError:
        raise RuntimeError("python-chess not installed. Run: pip install chess")


def _classify(delta: int | None) -> str:
    if delta is None:
        return "good"
    if delta >= 300:
        return "blunder"
    if delta >= 100:
        return "mistake"
    if delta >= 50:
        return "inaccuracy"
    return "good"


def _accuracy(total_loss: int, move_count: int) -> float:
    if move_count == 0:
        return 100.0
    # Simple accuracy: 100 - avg_centipawn_loss / 10, clamped 0-100
    avg = total_loss / move_count
    return max(0.0, min(100.0, 100.0 - avg / 10.0))
