"""
app/routers/matching.py

POST /ai/match/score — rank candidate profiles by compatibility score.

The ML model is loaded at startup and accessed via `request.app.state.matcher`.
CPU-bound inference is dispatched to a thread pool executor so the async
event loop is never blocked.
"""

from __future__ import annotations

import asyncio
from typing import List

from fastapi import APIRouter, Request

from app.models.schemas import MatchScoreRequest, MatchScoreResponse, ScoredCandidate

router = APIRouter()


@router.post("/score", response_model=MatchScoreResponse, summary="Rank candidates by AI compatibility")
async def score_candidates(payload: MatchScoreRequest, request: Request):
    """
    Accepts a user's profile and a list of candidate profiles.
    Returns candidates ranked by compatibility score (highest first).
    Responds within 3 seconds or raises a timeout.
    """
    matcher = request.app.state.matcher
    loop = asyncio.get_event_loop()

    # Run CPU-bound scoring in a thread pool to not block the event loop
    ranked_raw = await asyncio.wait_for(
        loop.run_in_executor(
            None,
            matcher.rank,
            payload.userProfile.model_dump(),
            [c.model_dump() for c in payload.candidates],
        ),
        timeout=3.0,
    )

    ranked = [
        ScoredCandidate(
            user_id=item["user_id"],
            score=item["score"],
            profile=item.get("profile"),
        )
        for item in ranked_raw
    ]

    return MatchScoreResponse(ranked=ranked)
