"""
app/main.py — FastAPI AI Service entry point.

Mounts all AI routers and loads ML models once at startup so they are
shared across all requests without re-loading on every call.

CPU-bound inference is dispatched to a thread pool via
`asyncio.run_in_executor` to avoid blocking the event loop.

Startup:
    uvicorn app.main:app --reload --port 8001
"""

from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os

from app.routers import matching, sentiment, conversation
from app.services.matching_engine import MatchingEngine
from app.services.sentiment_analyzer import SentimentAnalyzer

load_dotenv(dotenv_path="../../.env.local", override=False)

INTERNAL_SECRET = os.getenv("INTERNAL_API_SECRET", "")


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load ML models once at startup; release on shutdown."""
    print("[FastAPI] Loading ML models…")
    app.state.matcher = MatchingEngine()
    app.state.sentiment = SentimentAnalyzer()
    print("[FastAPI] Models ready.")
    yield
    print("[FastAPI] Shutting down.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SoulSync AI Service",
    version="1.0.0",
    description="AI matching, sentiment analysis, and conversation starters.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],  # Only Node.js backend
    allow_methods=["POST"],
    allow_headers=["*"],
)


# ── Internal secret guard ─────────────────────────────────────────────────────

@app.middleware("http")
async def verify_internal_secret(request: Request, call_next):
    """
    Reject requests without the correct internal API secret.
    Skip check on health endpoint and if secret is not configured.
    """
    if request.url.path == "/health" or not INTERNAL_SECRET:
        return await call_next(request)

    header = request.headers.get("X-Internal-Secret", "")
    if header != INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

    return await call_next(request)


# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(matching.router, prefix="/ai/match", tags=["Matching"])
app.include_router(sentiment.router, prefix="/ai", tags=["Sentiment"])
app.include_router(conversation.router, prefix="/ai", tags=["Conversation"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "soulsync-fastapi"}
