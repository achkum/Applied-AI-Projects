"""Subscription vs. non-subscription classifier.

Two-stage approach:
  1. Exact / partial alias match against the merchant catalog — high-confidence fast path.
  2. TF-IDF + Logistic Regression trained on (alias, is_subscription=True) plus a small
     set of generic negative examples — handles unseen descriptors.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from app.catalog import get_alias_category_pairs


@dataclass(slots=True)
class SubscriptionPrediction:
    is_subscription: bool
    confidence: float
    matched_alias: str | None = None


# Generic negative training examples (bank transactions that are NOT subscriptions).
_NEGATIVES = [
    "ICA SUPERMARKET",
    "HEMKÖP",
    "SYSTEMBOLAGET",
    "APOTEK HJÄRTAT",
    "PRESSBYRÅN",
    "BURGER KING",
    "MCDONALD'S",
    "PIZZERIA BELLISSIMA",
    "AXFOOD",
    "LIDL",
    "WILLYS",
    "COOP",
    "H&M",
    "ZARA",
    "IKEA",
    "ELGIGANTEN",
    "MEDIA MARKT",
    "BILTEMA",
    "TAXI",
    "SL RESERÄKNING",
    "SJ AB",
    "FLYGTAXI",
    "ATG",
    "APOTEKET AB",
    "KRONANS APOTEK",
    "BankGiro",
    "SWISH",
    "TRANSFERWISE",
    "REVOLUT",
    "ATM WITHDRAWAL",
    "INTERNETKÖP",
]

_NORMALIZE_RE = re.compile(r"[^a-z0-9 ]")


def _normalize(text: str) -> str:
    return _NORMALIZE_RE.sub(" ", text.lower()).strip()


@lru_cache(maxsize=1)
def _build_pipeline() -> tuple[Pipeline, list[str]]:
    pairs = get_alias_category_pairs()
    pos_aliases = [alias for alias, _ in pairs]

    texts = pos_aliases + _NEGATIVES
    labels = [1] * len(pos_aliases) + [0] * len(_NEGATIVES)

    pipe = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    max_features=8_000,
                    sublinear_tf=True,
                ),
            ),
            (
                "lr",
                LogisticRegression(
                    C=4.0,
                    max_iter=300,
                    class_weight="balanced",
                    random_state=42,
                ),
            ),
        ]
    )
    pipe.fit(texts, labels)
    return pipe, [_normalize(a) for a in pos_aliases]


class SubscriptionClassifier:
    def predict(self, description: str, amount_minor: int | None = None) -> SubscriptionPrediction:
        pipe, norm_aliases = _build_pipeline()

        norm_desc = _normalize(description)

        # Empty after normalization is never a subscription. Keep confidence
        # consistent with the API's predicted-class confidence semantics.
        if not norm_desc:
            return SubscriptionPrediction(
                is_subscription=False,
                confidence=1.0,
            )

        # Stage 1: exact match
        for alias in norm_aliases:
            if alias == norm_desc:
                return SubscriptionPrediction(
                    is_subscription=True,
                    confidence=0.99,
                    matched_alias=description,
                )

        # Stage 1b: partial match only when a catalog alias appears inside the
        # normalized description. A short input fragment must not match merely
        # because it is contained within a longer alias.
        for alias in norm_aliases:
            if len(alias) >= 5 and alias in norm_desc:
                return SubscriptionPrediction(
                    is_subscription=True,
                    confidence=0.90,
                    matched_alias=description,
                )

        # Stage 2: ML model
        proba: np.ndarray = pipe.predict_proba([description])[0]
        sub_prob = float(proba[1])
        return SubscriptionPrediction(
            is_subscription=sub_prob >= 0.5,
            confidence=round(sub_prob if sub_prob >= 0.5 else 1.0 - sub_prob, 4),
        )
