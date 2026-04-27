"""
POST /v1/commentary  — get a natural-language comment for a chess move.

Request:  { fen: str, move: str }   (move in SAN or UCI)
Response: { comment: str }
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

from ..auth import require_api_key

router = APIRouter(dependencies=[Depends(require_api_key)])

CANNED = [
    "An interesting choice.",
    "The position remains complex.",
    "Both sides have chances.",
    "A natural developing move.",
    "Maintaining the tension.",
]


class CommentaryRequest(BaseModel):
    fen: str
    move: str


class CommentaryResponse(BaseModel):
    comment: str


@router.post("/commentary")
async def get_commentary(
    body: CommentaryRequest,
    x_api_key: str | None = Header(default=None),
) -> CommentaryResponse:
    try:
        from ..worker.llm_worker import comment_on_move
        comment = await comment_on_move(body.fen, body.move, x_api_key)
        return CommentaryResponse(comment=comment)
    except Exception as exc:
        # Fall back to canned phrase rather than erroring the client
        import hashlib
        idx = int(hashlib.md5(body.fen.encode()).hexdigest(), 16) % len(CANNED)
        return CommentaryResponse(comment=CANNED[idx])
