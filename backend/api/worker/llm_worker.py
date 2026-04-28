"""
LLM worker — move commentary and game takeaways.

Provider is selected with ``LLM_PROVIDER`` (anthropic, openai, openrouter, gemini).
Uses API keys on the server; consumer ChatGPT OAuth / browser sessions are not supported.
"""
from __future__ import annotations

import os
from typing import Any

from .llm_providers import complete_user_text, normalize_provider, resolve_api_key

CANNED_COMMENTS = [
    "An interesting choice.",
    "The position remains complex.",
    "Both sides have active chances.",
    "A natural developing move.",
    "Maintaining the tension.",
    "A precise response to the position.",
    "Keeping the initiative.",
]

CANNED_TAKEAWAYS = [
    "Focus on piece activity in the middlegame.",
    "Endgame precision was key.",
    "Opening preparation made a difference.",
]


def _provider() -> str:
    return normalize_provider(os.getenv("LLM_PROVIDER"))


async def comment_on_move(fen: str, move: str, api_key: str | None = None) -> str:
    """Return a one-sentence natural language comment on the move."""
    prov = _provider()
    key = resolve_api_key(prov, api_key)
    if not key:
        return _canned(fen)

    user_text = (
        f"Chess position (FEN): {fen}\n"
        f"The move played was: {move}\n"
        "Give a single concise sentence (≤20 words) commenting on this move "
        "for a beginner player. No preamble."
    )

    try:
        text = await complete_user_text(
            provider=prov,
            api_key=key,
            user_text=user_text,
            max_tokens=80,
        )
        return text if text else _canned(fen)
    except Exception:
        return _canned(fen)


async def generate_takeaways(analysis: dict[str, Any], api_key: str | None = None) -> list[str]:
    """Return 3 bullet-point takeaways from a completed game analysis."""
    prov = _provider()
    key = resolve_api_key(prov, api_key)
    if not key:
        return CANNED_TAKEAWAYS

    summary = analysis.get("summary", {})
    blunders = summary.get("blunders", 0)
    mistakes = summary.get("mistakes", 0)
    white_acc = summary.get("white_accuracy", 0)
    black_acc = summary.get("black_accuracy", 0)

    user_text = (
        f"Chess game analysis summary:\n"
        f"White accuracy: {white_acc:.1f}%, Black accuracy: {black_acc:.1f}%\n"
        f"Blunders: {blunders}, Mistakes: {mistakes}\n\n"
        "Give exactly 3 concise bullet-point takeaways for the player (≤15 words each). "
        "Start each with '• '. No other text."
    )

    try:
        text = await complete_user_text(
            provider=prov,
            api_key=key,
            user_text=user_text,
            max_tokens=150,
        )
        lines = [
            ln.lstrip("•• ").strip()
            for ln in text.strip().splitlines()
            if ln.strip()
        ]
        return lines[:3] if lines else CANNED_TAKEAWAYS
    except Exception:
        return CANNED_TAKEAWAYS


def _canned(fen: str) -> str:
    import hashlib

    idx = int(hashlib.md5(fen.encode()).hexdigest(), 16) % len(CANNED_COMMENTS)
    return CANNED_COMMENTS[idx]
