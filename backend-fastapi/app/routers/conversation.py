"""
app/routers/conversation.py

POST /ai/starters — generate 3 personalised conversation starters for a new match.

Triggered automatically by the Node.js backend after a mutual match is created.
Starters are stored in `matches.starters_json` and displayed in the match modal.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request

from app.models.schemas import StartersRequest, StartersResponse
from app.services.conversation_ai import ConversationAI

router = APIRouter()

# Instantiate here (lazy singleton); in production this could also live on app.state
_ai = None


def _get_ai() -> ConversationAI:
    global _ai
    if _ai is None:
        _ai = ConversationAI()
    return _ai


@router.post("/starters", response_model=StartersResponse, summary="Generate conversation starters")
async def generate_starters(payload: StartersRequest, request: Request):
    """
    Generate 3 personalised openers based on both users' bios and shared interests.
    Uses OpenAI GPT-4o-mini if configured, otherwise falls back to templates.
    """
    ai = _get_ai()
    loop = asyncio.get_event_loop()

    starters = await asyncio.wait_for(
        loop.run_in_executor(
            None,
            ai.generate_starters,
            payload.profile1.model_dump(),
            payload.profile2.model_dump(),
        ),
        timeout=5.0,
    )

    return StartersResponse(starters=starters[:3])
