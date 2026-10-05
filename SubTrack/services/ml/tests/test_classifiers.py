"""Tests for subscription and category classifiers and the /ml/v1/classify endpoint."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.classifiers.subscription import SubscriptionClassifier
import app.classifiers.subscription as subscription_module
from app.classifiers.category import CategoryClassifier
from app.catalog import get_alias_category_pairs, get_canonical_names

client = TestClient(app)

# ─── catalog ──────────────────────────────────────────────────────────────────

def test_alias_category_pairs_nonempty() -> None:
    pairs = get_alias_category_pairs()
    assert len(pairs) > 10


def test_alias_category_pairs_are_strings() -> None:
    for alias, cat in get_alias_category_pairs():
        assert isinstance(alias, str) and len(alias) > 0
        assert isinstance(cat, str) and len(cat) > 0


def test_canonical_names_nonempty() -> None:
    names = get_canonical_names()
    assert len(names) > 10


# ─── subscription classifier ─────────────────────────────────────────────────

@pytest.fixture(scope="module")
def sub_clf() -> SubscriptionClassifier:
    return SubscriptionClassifier()


def test_subscription_known_alias_is_subscription(sub_clf: SubscriptionClassifier) -> None:
    result = sub_clf.predict("NETFLIX")
    assert result.is_subscription is True
    assert result.confidence >= 0.85


def test_subscription_known_alias_confidence_high(sub_clf: SubscriptionClassifier) -> None:
    result = sub_clf.predict("SPOTIFY")
    assert result.is_subscription is True
    assert result.confidence >= 0.85


def test_subscription_grocery_is_not_subscription(sub_clf: SubscriptionClassifier) -> None:
    result = sub_clf.predict("ICA SUPERMARKET")
    assert result.is_subscription is False


def test_subscription_restaurant_is_not_subscription(sub_clf: SubscriptionClassifier) -> None:
    result = sub_clf.predict("BURGER KING")
    assert result.is_subscription is False


def test_subscription_confidence_between_0_and_1(sub_clf: SubscriptionClassifier) -> None:
    result = sub_clf.predict("SOME RANDOM TRANSACTION")
    assert 0.0 <= result.confidence <= 1.0


@pytest.mark.parametrize("description", ["", "!!!", "...---___", "   !!!   "])
def test_subscription_empty_after_normalization_is_negative(
    sub_clf: SubscriptionClassifier, description: str
) -> None:
    result = sub_clf.predict(description)
    assert result.is_subscription is False
    assert result.confidence == 1.0
    assert result.matched_alias is None


@pytest.mark.parametrize("description", ["n", "e", "t", "flix"])
def test_subscription_short_alias_fragments_do_not_rule_match(
    sub_clf: SubscriptionClassifier, description: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    class NegativeFallback:
        def predict_proba(self, descriptions: list[str]) -> list[list[float]]:
            return [[0.9, 0.1]]

    monkeypatch.setattr(
        subscription_module, "_build_pipeline", lambda: (NegativeFallback(), ["netflix"])
    )
    result = sub_clf.predict(description)
    assert result.is_subscription is False
    assert result.confidence == 0.9
    assert result.matched_alias is None


def test_subscription_partial_match_returns_matched_alias(sub_clf: SubscriptionClassifier) -> None:
    result = sub_clf.predict("NETFLIX SE MONTHLY")
    assert result.is_subscription is True


def test_subscription_with_amount_minor(sub_clf: SubscriptionClassifier) -> None:
    result = sub_clf.predict("NETFLIX", amount_minor=-14900)
    assert result.is_subscription is True


def test_subscription_empty_like_description_returns_bool(sub_clf: SubscriptionClassifier) -> None:
    result = sub_clf.predict("XYZ123")
    assert isinstance(result.is_subscription, bool)


# ─── category classifier ──────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def cat_clf() -> CategoryClassifier:
    return CategoryClassifier()


def test_category_netflix_is_video_streaming(cat_clf: CategoryClassifier) -> None:
    result = cat_clf.predict("NETFLIX")
    assert result.category == "VIDEO_STREAMING"


def test_category_spotify_is_music(cat_clf: CategoryClassifier) -> None:
    result = cat_clf.predict("SPOTIFY")
    assert result.category == "MUSIC_AUDIO"


def test_category_confidence_between_0_and_1(cat_clf: CategoryClassifier) -> None:
    result = cat_clf.predict("NETFLIX")
    assert 0.0 < result.confidence <= 1.0


def test_category_top3_has_three_items(cat_clf: CategoryClassifier) -> None:
    result = cat_clf.predict("NETFLIX")
    assert len(result.top3) == 3


def test_category_top3_probabilities_sum_lte_1(cat_clf: CategoryClassifier) -> None:
    result = cat_clf.predict("NETFLIX")
    total = sum(p for _, p in result.top3)
    assert total <= 1.01  # rounding tolerance


def test_category_top3_first_matches_category(cat_clf: CategoryClassifier) -> None:
    result = cat_clf.predict("NETFLIX")
    assert result.top3[0][0] == result.category


# ─── /ml/v1/classify endpoint ────────────────────────────────────────────────

def test_classify_subscription_detected() -> None:
    resp = client.post("/ml/v1/classify", json={"description": "NETFLIX"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["subscription"]["is_subscription"] is True
    assert body["category"] is not None
    assert "category" in body["category"]


def test_classify_non_subscription_no_category() -> None:
    resp = client.post("/ml/v1/classify", json={"description": "ICA SUPERMARKET"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["subscription"]["is_subscription"] is False
    assert body["category"] is None


def test_classify_empty_description_returns_422() -> None:
    resp = client.post("/ml/v1/classify", json={"description": ""})
    assert resp.status_code == 422


def test_classify_with_amount_minor() -> None:
    resp = client.post("/ml/v1/classify", json={"description": "SPOTIFY", "amount_minor": -9900})
    assert resp.status_code == 200
    assert resp.json()["subscription"]["is_subscription"] is True


def test_classify_response_shape() -> None:
    resp = client.post("/ml/v1/classify", json={"description": "NETFLIX"})
    body = resp.json()
    assert "subscription" in body
    assert "category" in body
    assert "is_subscription" in body["subscription"]
    assert "confidence" in body["subscription"]


def test_models_endpoint_lists_classifiers() -> None:
    resp = client.get("/ml/v1/models")
    assert resp.status_code == 200
    names = [m["name"] for m in resp.json()["models"]]
    assert "subscription-classifier" in names
    assert "category-classifier" in names
