"""
app/routers/sentiment.py

POST /ai/sentiment — analyze the sentiment of a chat message.

Called asynchronously by the Node.js backend after saving a message.
The resulting score is stored in `messages.sentiment_score` for moderation
and is never exposed to end users.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Request

from app.models.schemas import SentimentRequest, SentimentResponse

router = APIRouter()


@router.post("/sentiment", response_model=SentimentResponse, summary="Analyze message sentiment")
async def analyze_sentiment(payload: SentimentRequest, request: Request):
    """
    Returns a sentiment score in [-1, 1] and a label ('positive', 'neutral', 'negative').
    Inference is offloaded to a thread pool to keep the event loop free.
    """
    analyzer = request.app.state.sentiment
    loop = asyncio.get_event_loop()

    result = await asyncio.wait_for(
        loop.run_in_executor(None, analyzer.analyze, payload.text),
        timeout=3.0,
    )

    return SentimentResponse(score=result["score"], label=result["label"])
