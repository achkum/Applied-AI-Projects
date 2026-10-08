"""Focused tests for schema-bound persona centroid descriptions."""

from dataclasses import FrozenInstanceError

import numpy as np
import pytest

from app.clustering import PersonaClusterer, describe_persona_centroids
from app.clustering.core import PERSONA_FEATURE_NAMES


def persona_features() -> np.ndarray:
    rows = []
    for group in range(4):
        for offset in range(4):
            row = np.zeros(25, dtype=np.float64)
            row[group] = 0.8 + offset * 0.01
            row[(group + 1) % 4] = 0.2 - offset * 0.01
            row[22] = 20 + group * 3 + offset
            row[23] = 1.2 + group * 0.4 + offset * 0.02
            row[24] = 0.2 + offset * 0.02
            rows.append(row)
    return np.asarray(rows)


def fitted() -> PersonaClusterer:
    return PersonaClusterer().fit(
        persona_features(), feature_schema="household-persona-v1"
    )


def test_descriptions_are_canonical_immutable_and_inverse_scaled(monkeypatch) -> None:
    clusterer = fitted()
    model = clusterer.model_
    scaler = clusterer.scaler_
    assert model is not None and scaler is not None
    expected = model.cluster_centers_.copy() * scaler.scale_ + scaler.mean_

    def forbidden(*args, **kwargs):
        raise AssertionError("description must not refit or predict")

    monkeypatch.setattr(clusterer, "fit", forbidden)
    monkeypatch.setattr(model, "predict", forbidden)
    monkeypatch.setattr(model, "fit", forbidden)
    monkeypatch.setattr(scaler, "fit", forbidden)
    monkeypatch.setattr(scaler, "fit_transform", forbidden)
    result = describe_persona_centroids(clusterer)
    assert isinstance(result, tuple)
    assert [item.cluster_id for item in result] == list(range(clusterer.selected_k_))
    for description, row in zip(result, expected, strict=True):
        assert isinstance(description.features, tuple)
        assert tuple(name for name, _ in description.features) == PERSONA_FEATURE_NAMES
        np.testing.assert_allclose(
            [value for _, value in description.features], row, rtol=0, atol=1e-12
        )
    with pytest.raises(FrozenInstanceError):
        result[0].cluster_id = 7
    with pytest.raises(TypeError):
        result[0].features[0] = ("MUSIC_AUDIO", 0.0)
    assert describe_persona_centroids(clusterer) == result
    model.cluster_centers_[:] = 0.0
    assert [item.cluster_id for item in result] == list(range(len(result)))
    assert all(value != 0.0 for _, value in result[0].features[22:24])


def test_generic_fit_remains_valid_but_cannot_be_described() -> None:
    clusterer = PersonaClusterer().fit(persona_features())
    assert clusterer.predict(persona_features()).shape[0] == 16
    with pytest.raises(ValueError, match="metadata"):
        describe_persona_centroids(clusterer)


def test_schema_fit_rejects_unknown_marker_and_wrong_width() -> None:
    with pytest.raises(ValueError, match="unsupported feature schema"):
        PersonaClusterer().fit(persona_features(), feature_schema="other")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="requires 25"):
        PersonaClusterer().fit(np.ones((12, 2)), feature_schema="household-persona-v1")


def test_successful_generic_refit_clears_metadata() -> None:
    clusterer = fitted()
    assert clusterer.feature_names_ == PERSONA_FEATURE_NAMES
    clusterer.fit(persona_features())
    assert clusterer.feature_schema_ is None
    assert clusterer.feature_names_ is None
    with pytest.raises(ValueError, match="metadata"):
        describe_persona_centroids(clusterer)


def test_failed_fit_preserves_complete_fitted_snapshot() -> None:
    clusterer = fitted()
    snapshot = (
        clusterer.scaler_,
        clusterer.model_,
        clusterer.n_features_in_,
        clusterer.candidate_scores_,
        clusterer.skipped_k_,
        clusterer.silhouette_sample_size_,
        clusterer.feature_schema_,
        clusterer.feature_names_,
    )
    with pytest.raises(ValueError, match="no feasible k"):
        clusterer.fit(np.repeat(np.arange(3, dtype=float), 4).reshape(12, 1))
    assert snapshot == (
        clusterer.scaler_,
        clusterer.model_,
        clusterer.n_features_in_,
        clusterer.candidate_scores_,
        clusterer.skipped_k_,
        clusterer.silhouette_sample_size_,
        clusterer.feature_schema_,
        clusterer.feature_names_,
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("feature_schema_", None),
        ("feature_schema_", "other"),
        ("feature_names_", tuple(reversed(PERSONA_FEATURE_NAMES))),
        ("feature_names_", PERSONA_FEATURE_NAMES + ("extra",)),
        ("n_features_in_", 24),
    ],
)
def test_inconsistent_schema_metadata_is_rejected(field, value) -> None:
    clusterer = fitted()
    setattr(clusterer, field, value)
    with pytest.raises(ValueError):
        describe_persona_centroids(clusterer)


def test_invalid_centers_and_inverse_scaled_bounds_are_rejected(monkeypatch) -> None:
    clusterer = fitted()
    assert clusterer.model_ is not None and clusterer.scaler_ is not None
    centers = clusterer.model_.cluster_centers_
    centers[0, 0] = np.nan
    with pytest.raises(ValueError, match="inconsistent"):
        describe_persona_centroids(clusterer)

    clusterer = fitted()
    assert clusterer.scaler_ is not None
    monkeypatch.setattr(
        clusterer.scaler_,
        "inverse_transform",
        lambda matrix: np.full_like(matrix, 2.0),
    )
    with pytest.raises(ValueError, match="bounds"):
        describe_persona_centroids(clusterer)


def test_canonical_names_match_verified_domain_schema() -> None:
    from pathlib import Path
    import re

    source = (Path(__file__).resolve().parents[3] / "packages/domain/clustering/features.ts").read_text()
    categories = source.split("CLUSTERING_CATEGORY_CODES = Object.freeze([", 1)[1].split("] as const)", 1)[0]
    extra = source.split("CLUSTERING_FEATURE_NAMES = Object.freeze([", 1)[1].split("] as const)", 1)[0]
    assert PERSONA_FEATURE_NAMES == tuple(re.findall(r"'([^']+)'", categories + extra))


def test_unfitted_and_non_clusterer_fail_without_input_data() -> None:
    for candidate in (PersonaClusterer(), "synthetic-private-input"):
        with pytest.raises(ValueError) as error:
            describe_persona_centroids(candidate)
        assert "synthetic-private-input" not in str(error.value)


@pytest.mark.parametrize("kind", ["width", "cluster_count", "scaler_width", "nonfinite_inverse", "inverse_width"])
def test_inconsistent_model_state_fails_generically(kind, monkeypatch) -> None:
    clusterer = fitted()
    assert clusterer.model_ is not None and clusterer.scaler_ is not None
    if kind == "width":
        clusterer.model_.cluster_centers_ = np.zeros((4, 24))
    elif kind == "cluster_count":
        clusterer.model_.cluster_centers_ = np.zeros((1, 25))
        clusterer.model_.n_clusters = 1
    elif kind == "scaler_width":
        clusterer.scaler_.n_features_in_ = 24
    elif kind == "nonfinite_inverse":
        monkeypatch.setattr(clusterer.scaler_, "inverse_transform", lambda values: np.full_like(values, np.inf))
    else:
        monkeypatch.setattr(clusterer.scaler_, "inverse_transform", lambda values: np.zeros((4, 24)))
    with pytest.raises(ValueError):
        describe_persona_centroids(clusterer)
