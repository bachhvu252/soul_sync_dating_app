"""
app/services/matching_engine.py

Compatibility scoring between a query user and a list of candidate profiles.

Algorithm:
  1. Embedding cosine similarity — bio text vectorized via sentence-transformers.
  2. Interest overlap — Jaccard similarity of interest tags.
  3. Activity recency — placeholder (1.0 until real login timestamps flow through).

Final score: weighted sum, clamped to [0, 1].

Inference is CPU-bound; callers should run it via asyncio.run_in_executor.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.preprocessing import normalize


MODEL_NAME = os.getenv("SENTENCE_TRANSFORMER_MODEL", "all-MiniLM-L6-v2")

# Scoring weights
W_EMBEDDING = 0.5
W_INTERESTS = 0.3
W_ACTIVITY = 0.2


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    if np.linalg.norm(va) == 0 or np.linalg.norm(vb) == 0:
        return 0.0
    return float(np.dot(va, vb) / (np.linalg.norm(va) * np.linalg.norm(vb)))


def _jaccard(set_a: List[str], set_b: List[str]) -> float:
    """Jaccard similarity between two interest tag lists."""
    a = set(s.lower() for s in (set_a or []))
    b = set(s.lower() for s in (set_b or []))
    if not a and not b:
        return 0.5  # neutral if both empty
    union = a | b
    return len(a & b) / len(union) if union else 0.0


class MatchingEngine:
    """
    Loads the sentence-transformer model on init and exposes a `rank` method.
    Instantiate once at startup and reuse across requests.
    """

    def __init__(self):
        print(f"[MatchingEngine] Loading model: {MODEL_NAME}")
        self.model = SentenceTransformer(MODEL_NAME)
        print("[MatchingEngine] Model loaded.")

    def _get_or_encode(self, profile: Dict[str, Any]) -> Optional[List[float]]:
        """
        Return existing embedding if present, or encode the bio text.
        Encoding is done inline here; in production you'd cache results.
        """
        if profile.get("embedding_vector"):
            return profile["embedding_vector"]
        bio = (profile.get("bio") or "").strip()
        if not bio:
            return None
        vector = self.model.encode(bio, normalize_embeddings=True)
        return vector.tolist()

    def rank(
        self,
        user_profile: Dict[str, Any],
        candidates: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Score each candidate against the user profile and return sorted list.

        Returns:
            List of dicts: { user_id, score, profile }
        """
        user_vec = self._get_or_encode(user_profile)
        user_interests = (user_profile.get("preferences_json") or {}).get("interests", [])

        scored = []
        for candidate in candidates:
            cand_vec = self._get_or_encode(candidate)
            cand_interests = (candidate.get("preferences_json") or {}).get("interests", [])

            # Embedding similarity
            if user_vec and cand_vec:
                embed_score = max(0.0, _cosine_similarity(user_vec, cand_vec))
            else:
                embed_score = 0.5  # neutral when no bio

            # Interest overlap
            interest_score = _jaccard(user_interests, cand_interests)

            # Activity score (placeholder)
            activity_score = 1.0

            total = (
                W_EMBEDDING * embed_score
                + W_INTERESTS * interest_score
                + W_ACTIVITY * activity_score
            )
            total = round(min(1.0, max(0.0, total)), 4)

            scored.append({
                "user_id": candidate.get("user_id"),
                "score": total,
                "profile": candidate,
            })

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored
