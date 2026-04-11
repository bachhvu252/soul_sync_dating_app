"""
app/services/conversation_ai.py

Generate 3 personalised conversation starters for a new match.

Strategy:
  1. If OPENAI_API_KEY is set, use GPT-4o-mini for creative, personalised starters.
  2. Otherwise, fall back to a template-based generator using shared interests.

Output: list of 3 strings.
"""

from __future__ import annotations

import os
import random
from typing import Any, Dict, List, Optional


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def _extract_interests(profile: Dict[str, Any]) -> List[str]:
    prefs = profile.get("preferences_json") or {}
    return prefs.get("interests", [])


def _shared_interests(p1: Dict[str, Any], p2: Dict[str, Any]) -> List[str]:
    set1 = set(i.lower() for i in _extract_interests(p1))
    set2 = set(i.lower() for i in _extract_interests(p2))
    return list(set1 & set2)


# Template starters used when OpenAI is not available
_GENERIC_STARTERS = [
    "What's something you've been really excited about lately?",
    "If you could travel anywhere tomorrow, where would you go?",
    "What's the best meal you've had recently?",
    "Do you have any hidden talents?",
    "What's your idea of a perfect weekend?",
    "Are you more of a morning person or night owl?",
    "What's the last book or show that really got you hooked?",
]


class ConversationAI:
    """
    Generates personalised conversation starters for two matched profiles.
    Uses OpenAI GPT if configured, otherwise falls back to templates.
    """

    def __init__(self):
        self._client = None
        if OPENAI_API_KEY:
            try:
                from openai import OpenAI
                self._client = OpenAI(api_key=OPENAI_API_KEY)
                print("[ConversationAI] OpenAI client ready.")
            except Exception as exc:
                print(f"[ConversationAI] OpenAI init failed ({exc}). Using template fallback.")

    def generate_starters(
        self,
        profile1: Dict[str, Any],
        profile2: Dict[str, Any],
    ) -> List[str]:
        if self._client:
            return self._generate_openai(profile1, profile2)
        return self._generate_template(profile1, profile2)

    def _generate_openai(self, profile1: Dict[str, Any], profile2: Dict[str, Any]) -> List[str]:
        shared = _shared_interests(profile1, profile2)
        bio1 = profile1.get("bio", "")
        bio2 = profile2.get("bio", "")
        name1 = profile1.get("name", "User A")
        name2 = profile2.get("name", "User B")

        shared_str = ", ".join(shared[:5]) if shared else "general topics"

        prompt = (
            f"Two people just matched on a dating app.\n"
            f"Person 1 ({name1}) bio: {bio1[:300]}\n"
            f"Person 2 ({name2}) bio: {bio2[:300]}\n"
            f"Shared interests: {shared_str}\n\n"
            "Generate exactly 3 short, fun, personalised conversation starter questions "
            "that would help them connect. Return only the 3 questions, one per line, "
            "no numbering or extra text."
        )

        try:
            response = self._client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.8,
                timeout=5.0,
            )
            text = response.choices[0].message.content.strip()
            starters = [line.strip() for line in text.split("\n") if line.strip()][:3]
            if len(starters) < 1:
                raise ValueError("Empty response")
            return starters
        except Exception as exc:
            print(f"[ConversationAI] OpenAI call failed ({exc}). Using template fallback.")
            return self._generate_template(profile1, profile2)

    def _generate_template(self, profile1: Dict[str, Any], profile2: Dict[str, Any]) -> List[str]:
        shared = _shared_interests(profile1, profile2)
        starters = []

        # Interest-based starters
        for interest in shared[:2]:
            starters.append(f"I see you're into {interest} too — what got you started with it?")

        # Fill remaining with generic starters
        remaining = random.sample(_GENERIC_STARTERS, k=max(0, 3 - len(starters)))
        starters.extend(remaining)

        return starters[:3]
