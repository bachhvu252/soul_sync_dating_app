"""
app/services/sentiment_analyzer.py

Lightweight sentiment analysis for chat messages.

Uses a pre-trained pipeline from HuggingFace Transformers for accurate results.
Falls back to a simple keyword heuristic if the model fails to load (e.g., in
environments with restricted internet access).

Output:
  score : float in [-1, 1]  (negative = negative sentiment)
  label : 'positive' | 'neutral' | 'negative'

Inference is CPU-bound; callers should use asyncio.run_in_executor.
"""

from __future__ import annotations

POSITIVE_LABEL = "positive"
NEUTRAL_LABEL = "neutral"
NEGATIVE_LABEL = "negative"

# Score thresholds for label assignment
POSITIVE_THRESHOLD = 0.1
NEGATIVE_THRESHOLD = -0.1


def _label_from_score(score: float) -> str:
    if score >= POSITIVE_THRESHOLD:
        return POSITIVE_LABEL
    if score <= NEGATIVE_THRESHOLD:
        return NEGATIVE_LABEL
    return NEUTRAL_LABEL


class SentimentAnalyzer:
    """
    Wraps a HuggingFace sentiment pipeline.
    Falls back to a keyword heuristic if transformers are unavailable.
    """

    def __init__(self):
        self._pipeline = None
        try:
            from transformers import pipeline as hf_pipeline
            # distilbert-based model — fast and accurate enough for chat moderation
            self._pipeline = hf_pipeline(
                "sentiment-analysis",
                model="distilbert-base-uncased-finetuned-sst-2-english",
                truncation=True,
                max_length=512,
            )
            print("[SentimentAnalyzer] HuggingFace pipeline loaded.")
        except Exception as exc:
            print(f"[SentimentAnalyzer] Could not load HF pipeline ({exc}). Using heuristic fallback.")

    def analyze(self, text: str) -> dict:
        """
        Analyze a text string.
        Returns: { score: float[-1,1], label: str }
        """
        if self._pipeline:
            return self._analyze_hf(text)
        return self._analyze_heuristic(text)

    def _analyze_hf(self, text: str) -> dict:
        result = self._pipeline(text)[0]
        raw_score = result["score"]  # 0..1 confidence
        label_raw = result["label"].lower()  # 'positive' or 'negative'

        # Map to [-1, 1]
        if label_raw == "positive":
            score = raw_score
        else:
            score = -raw_score

        return {"score": round(score, 4), "label": _label_from_score(score)}

    def _analyze_heuristic(self, text: str) -> dict:
        """Very simple keyword-based fallback."""
        BAD_WORDS = {"hate", "terrible", "awful", "disgusting", "idiot", "stupid", "ugly", "freak"}
        GOOD_WORDS = {"love", "amazing", "wonderful", "great", "awesome", "beautiful", "happy"}

        words = set(text.lower().split())
        neg_hits = len(words & BAD_WORDS)
        pos_hits = len(words & GOOD_WORDS)

        if neg_hits > pos_hits:
            score = -0.5 * neg_hits
        elif pos_hits > neg_hits:
            score = 0.5 * pos_hits
        else:
            score = 0.0

        score = round(max(-1.0, min(1.0, score)), 4)
        return {"score": score, "label": _label_from_score(score)}
