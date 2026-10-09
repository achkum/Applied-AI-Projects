"""Focused checks for the private canonical persona training entry point."""

from dataclasses import FrozenInstanceError

import numpy as np
import pytest

from app.clustering.core import PERSONA_FEATURE_NAMES, PERSONA_FEATURE_SCHEMA, PersonaClusterer
from app.clustering.model_snapshot import PersonaModelSnapshot
from app.clustering.review_artifact import PersonaReviewArtifact
from app.clustering.training import PersonaTrainingResult, train_persona_model


@pytest.fixture(scope="module")
def canonical_rows() -> tuple[tuple[float, ...], ...]:
    """One genuine, bounded canonical 16-row population for this module."""
    rows = []
    for group in range(4):
        for offset in range(4):
            row = [0.0] * 25
            row[group] = 0.8 + offset * 0.01
            row[(group + 1) % 4] = 0.2 - offset * 0.01
            row[22:25] = (
                20 + group * 3 + offset,
                1.2 + group * 0.4 + offset * 0.02,
                0.2 + offset * 0.02,
            )
            rows.append(tuple(row))
    return tuple(rows)


def test_training_fits_once_and_returns_matching_detached_immutable_exports(canonical_rows, monkeypatch) -> None:
    original_fit = PersonaClusterer.fit
    calls = []

    def counted_fit(self, features, *, feature_schema=None):
        calls.append((self, features, feature_schema))
        return original_fit(self, features, feature_schema=feature_schema)

    monkeypatch.setattr(PersonaClusterer, "fit", counted_fit)
    before = tuple(tuple(row) for row in canonical_rows)
    result = train_persona_model(canonical_rows)

    assert len(calls) == 1
    clusterer, fitted_rows, schema = calls[0]
    assert type(clusterer) is PersonaClusterer
    assert fitted_rows == canonical_rows
    assert schema == PERSONA_FEATURE_SCHEMA
    assert (clusterer.random_state, clusterer.n_init, clusterer.silhouette_sample_size) == (42, 10, 1000)
    assert canonical_rows == before

    assert type(result) is PersonaTrainingResult
    assert type(result.review_artifact) is PersonaReviewArtifact
    assert type(result.model_snapshot) is PersonaModelSnapshot
    artifact, snapshot = result.review_artifact, result.model_snapshot
    assert artifact.feature_schema == snapshot.feature_schema == PERSONA_FEATURE_SCHEMA
    assert artifact.feature_names == snapshot.feature_names == PERSONA_FEATURE_NAMES
    assert artifact.selected_k == snapshot.selected_k == clusterer.selected_k_
    assert artifact.training_sample_count == snapshot.training_sample_count == len(canonical_rows)
    assert artifact.random_state == snapshot.random_state == 42
    assert artifact.n_init == snapshot.n_init == 10
    assert artifact.silhouette_sample_size == len(canonical_rows)
    assert not hasattr(result, "model") and not hasattr(result, "features")
    with pytest.raises(FrozenInstanceError):
        result.model_snapshot = snapshot
    with pytest.raises((FrozenInstanceError, AttributeError, TypeError)):
        snapshot.cluster_centers[0][0] = 0.0
    with pytest.raises((FrozenInstanceError, AttributeError, TypeError)):
        artifact.label_counts[0] = 0


@pytest.mark.parametrize(
    "mutate",
    [
        lambda rows: list(rows),
        lambda rows: rows[:8],
        lambda rows: rows + (rows[-1],) * 4985,
        lambda rows: (rows[0][:-1],) + rows[1:],
        lambda rows: ((True,) + rows[0][1:],) + rows[1:],
        lambda rows: ((np.float64(rows[0][0]),) + rows[0][1:],) + rows[1:],
        lambda rows: (("0.8",) + rows[0][1:],) + rows[1:],
        lambda rows: ((float("nan"),) + rows[0][1:],) + rows[1:],
        lambda rows: ((float("inf"),) + rows[0][1:],) + rows[1:],
        lambda rows: ((-0.01,) + rows[0][1:],) + rows[1:],
        lambda rows: (rows[0][:22] + (10001,) + rows[0][23:],) + rows[1:],
        lambda rows: (rows[0][:24] + (1.01,),) + rows[1:],
        lambda rows: (rows[0][:23] + (10000001,) + rows[0][24:],) + rows[1:],
        lambda rows: (list(rows[0]),) + rows[1:],
    ],
    ids=["list", "too-few-rows", "too-many-rows", "wrong-width", "bool", "numpy-scalar", "string", "nan", "infinity", "negative", "count-bound", "annual-share-bound", "price-coordinate-bound", "list-row"],
)
def test_invalid_input_is_rejected_before_native_fit(canonical_rows, mutate, monkeypatch) -> None:
    def forbidden_fit(*args, **kwargs):
        pytest.fail("invalid training input reached PersonaClusterer.fit")

    monkeypatch.setattr(PersonaClusterer, "fit", forbidden_fit)
    with pytest.raises(ValueError, match="^persona training input is invalid$"):
        train_persona_model(mutate(canonical_rows))


@pytest.mark.parametrize("failure", ["degenerate", "unsupported-scale"])
def test_native_fit_or_export_failure_is_safely_reported(canonical_rows, failure, monkeypatch) -> None:
    rows = canonical_rows
    if failure == "degenerate":
        rows = (rows[0],) * len(rows)
    else:
        altered = [list(row) for row in rows]
        for index, row in enumerate(altered):
            row[10] = index * 1e-141
        rows = tuple(tuple(row) for row in altered)

    original_fit = PersonaClusterer.fit
    calls = []

    def counted_fit(self, features, *, feature_schema=None):
        calls.append(features)
        return original_fit(self, features, feature_schema=feature_schema)

    monkeypatch.setattr(PersonaClusterer, "fit", counted_fit)
    with pytest.raises(ValueError, match="^persona training unavailable$"):
        train_persona_model(rows)
    assert len(calls) == 1
