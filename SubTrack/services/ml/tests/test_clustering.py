"""Focused tests for offline persona clustering core."""

import numpy as np
import pytest
from sklearn.metrics import adjusted_rand_score

from app.clustering import PersonaClusterer


def separated_features() -> np.ndarray:
    rng = np.random.default_rng(17)
    centers = np.array([[i * 8.0, (i % 2) * 5.0] for i in range(5)])
    return np.vstack([center + rng.normal(0, 0.12, size=(12, 2)) for center in centers])


def test_fit_selects_feasible_k_and_predicts_deterministically() -> None:
    features = separated_features()
    first = PersonaClusterer().fit(features)
    second = PersonaClusterer().fit(features)
    expected_groups = np.repeat(np.arange(5), 12)

    assert first.selected_k_ == 5
    assert first.candidate_scores_
    assert all(4 <= score.k <= 8 and np.isfinite(score.silhouette) for score in first.candidate_scores_)
    np.testing.assert_array_equal(first.predict(features), second.predict(features))
    assert np.unique(first.predict(features)).size == first.selected_k_
    assert adjusted_rand_score(expected_groups, first.predict(features)) == 1.0


def test_large_input_silhouette_sample_is_bounded_and_repeatable() -> None:
    features = np.vstack([separated_features(), separated_features()])
    first = PersonaClusterer(silhouette_sample_size=30).fit(features)
    second = PersonaClusterer(silhouette_sample_size=30).fit(features)

    assert first.silhouette_sample_size_ == 30
    assert first.candidate_scores_ == second.candidate_scores_
    np.testing.assert_array_equal(first.predict(features), second.predict(features))


def test_fit_rejects_malformed_and_degenerate_matrices() -> None:
    for invalid in (
        [],
        [[1, 2], [3]],
        [[1, "x"]],
        [[True, False]],
        [[1 + 2j, 3]],
        [[1, np.nan]],
        [[1, np.inf]],
    ):
        with pytest.raises(ValueError):
            PersonaClusterer().fit(invalid)
    with pytest.raises(ValueError, match="identical"):
        PersonaClusterer().fit(np.ones((12, 2)))
    with pytest.raises(ValueError, match="at least 9"):
        PersonaClusterer().fit(np.arange(16, dtype=float).reshape(8, 2))


def test_candidate_range_is_limited_by_distinct_rows() -> None:
    features = np.repeat(np.array([[0.0], [1.0], [2.0]]), 4, axis=0)
    with pytest.raises(ValueError, match="no feasible k"):
        PersonaClusterer().fit(features)


def test_predict_requires_fitted_model_valid_data_and_matching_width() -> None:
    model = PersonaClusterer()
    with pytest.raises(ValueError, match="not fitted"):
        model.predict([[1, 2]])
    model.fit(separated_features())
    with pytest.raises(ValueError, match="expected 2 features"):
        model.predict([[1.0]])
    with pytest.raises(ValueError, match="finite"):
        model.predict([[np.nan, 1.0]])
