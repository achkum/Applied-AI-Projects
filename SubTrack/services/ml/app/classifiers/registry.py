"""Lazy singleton accessors for classifiers."""

from __future__ import annotations

from functools import lru_cache

from app.classifiers.category import CategoryClassifier
from app.classifiers.subscription import SubscriptionClassifier


@lru_cache(maxsize=1)
def get_subscription_clf() -> SubscriptionClassifier:
    return SubscriptionClassifier()


@lru_cache(maxsize=1)
def get_category_clf() -> CategoryClassifier:
    return CategoryClassifier()
