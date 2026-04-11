"""
app/models/schemas.py — Pydantic request/response models for all AI endpoints.

All AI endpoints use strict Pydantic schemas so that callers get clear
validation errors and the OpenAPI docs are accurate.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── Shared ────────────────────────────────────────────────────────────────────

class ProfileSnapshot(BaseModel):
    """Minimal profile data sent by Node.js for AI processing."""
    user_id: str
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    bio: Optional[str] = ""
    location: Optional[str] = ""
    preferences_json: Optional[Dict[str, Any]] = {}
    embedding_vector: Optional[List[float]] = None


# ── Matching ──────────────────────────────────────────────────────────────────

class MatchScoreRequest(BaseModel):
    userId: str
    userProfile: ProfileSnapshot
    candidates: List[ProfileSnapshot]


class ScoredCandidate(BaseModel):
    user_id: str
    score: float = Field(..., ge=0.0, le=1.0, description="Compatibility score 0–1")
    profile: Optional[Dict[str, Any]] = None


class MatchScoreResponse(BaseModel):
    ranked: List[ScoredCandidate]


# ── Sentiment ─────────────────────────────────────────────────────────────────

class SentimentRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class SentimentResponse(BaseModel):
    score: float = Field(..., description="Float in [-1, 1]; negative = negative sentiment")
    label: str = Field(..., description="'positive' | 'neutral' | 'negative'")


# ── Conversation Starters ─────────────────────────────────────────────────────

class StartersRequest(BaseModel):
    profile1: ProfileSnapshot
    profile2: ProfileSnapshot


class StartersResponse(BaseModel):
    starters: List[str] = Field(..., max_length=3, description="3 personalized openers")
