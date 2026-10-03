"""Category classifier: maps a subscription description to a catalog category.

Trained on (alias, category) pairs from merchants.yaml.  Uses char_wb n-gram
TF-IDF + Logistic Regression — same vectoriser strategy as the subscription
classifier for consistency.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from app.catalog import get_alias_category_pairs, get_canonical_names


@dataclass(slots=True)
class CategoryPrediction:
    category: str
    confidence: float
    top3: list[tuple[str, float]] = field(default_factory=list)


@lru_cache(maxsize=1)
def _build_pipeline() -> Pipeline:
    pairs = get_alias_category_pairs() + get_canonical_names()
    texts = [alias for alias, _ in pairs]
    labels = [cat for _, cat in pairs]

    pipe = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    max_features=10_000,
                    sublinear_tf=True,
                ),
            ),
            (
                "lr",
                LogisticRegression(
                    C=5.0,
                    max_iter=500,
                    class_weight="balanced",
                    random_state=42,
                    solver="lbfgs",
                ),
            ),
        ]
    )
    pipe.fit(texts, labels)
    return pipe


class CategoryClassifier:
    def predict(self, description: str) -> CategoryPrediction:
        pipe = _build_pipeline()
        proba: np.ndarray = pipe.predict_proba([description])[0]
        classes: list[str] = list(pipe.classes_)

        ranked = sorted(zip(classes, proba.tolist()), key=lambda x: -x[1])
        top_cat, top_prob = ranked[0]
        top3 = [(c, round(p, 4)) for c, p in ranked[:3]]

        return CategoryPrediction(
            category=top_cat,
            confidence=round(float(top_prob), 4),
            top3=top3,
        )
