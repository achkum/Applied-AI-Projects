"""Focused validation for private immutable persona review artifacts."""

from dataclasses import FrozenInstanceError, replace
import json

import numpy as np
import pytest

from app.clustering import PersonaClusterer, build_persona_review_artifact, persona_review_artifact_json


def _fit() -> PersonaClusterer:
    rows = []
    for group in range(4):
        for offset in range(4):
            row = np.zeros(25)
            row[group] = 0.8 + offset * 0.01
            row[(group + 1) % 4] = 0.2 - offset * 0.01
            row[22:25] = (20 + group * 3 + offset, 1.2 + group * 0.4 + offset * 0.02, 0.2 + offset * 0.02)
            rows.append(row)
    return PersonaClusterer().fit(np.asarray(rows), feature_schema="household-persona-v1")


def test_build_copies_actual_counts_and_serializes_deterministically(monkeypatch) -> None:
    model = _fit()
    expected = tuple(int(value) for value in np.bincount(model.model_.labels_, minlength=model.selected_k_))
    artifact = build_persona_review_artifact(model)
    encoded = persona_review_artifact_json(artifact)
    assert artifact.label_counts == expected
    assert json.loads(encoded)["label_counts"] == list(expected)
    assert persona_review_artifact_json(artifact) == encoded
    assert "labels" not in json.loads(encoded)
    with pytest.raises(FrozenInstanceError):
        artifact.selected_k = 4

    def forbidden(*args, **kwargs):
        raise AssertionError("artifact construction must not fit or predict")

    monkeypatch.setattr(model, "fit", forbidden)
    monkeypatch.setattr(model.model_, "predict", forbidden)
    assert build_persona_review_artifact(model) == artifact


def test_serializer_revalidates_replaced_and_tampered_values() -> None:
    artifact = build_persona_review_artifact(_fit())
    with pytest.raises(ValueError):
        persona_review_artifact_json(replace(artifact, training_sample_count=True))
    with pytest.raises(ValueError):
        persona_review_artifact_json(replace(artifact, label_counts=(1, 1, 1, 1)))
    tampered_centroid = replace(artifact.centroids[0], features=(("private row", 1.0),))
    with pytest.raises(ValueError):
        persona_review_artifact_json(replace(artifact, centroids=(tampered_centroid,) + artifact.centroids[1:]))
    with pytest.raises(ValueError):
        persona_review_artifact_json("private input")  # type: ignore[arg-type]


def test_artifact_reuses_canonical_centroids_and_freezes_model_values() -> None:
    model = _fit()
    artifact = build_persona_review_artifact(model)
    original_centroids = artifact.centroids
    original_counts = artifact.label_counts
    expected_scores = tuple((score.k, score.silhouette) for score in model.candidate_scores_)
    assert tuple((score.k, score.silhouette) for score in artifact.scored_candidates) == expected_scores
    assert artifact.skipped_k == model.skipped_k_

    model.model_.cluster_centers_[:] = 0
    model.model_.labels_[:] = 0
    model.scaler_.mean_[:] = 0
    assert artifact.centroids == original_centroids
    assert artifact.label_counts == original_counts
    assert artifact.centroids is not model.model_.cluster_centers_
    with pytest.raises((FrozenInstanceError, AttributeError, TypeError)):
        artifact.centroids[0].features[0][1] = 42.0  # type: ignore[index]


@pytest.mark.parametrize(
    "labels",
    [
        lambda y: y[:-1],
        lambda y: y.reshape(-1, 1),
        lambda y: y.astype(float),
        lambda y: y.astype(bool),
        lambda y: np.where(y == 0, 99, y),
        lambda y: np.zeros_like(y),
    ],
    ids=["short", "two-dimensional", "float", "boolean", "out-of-range", "missing-clusters"],
)
def test_builder_rejects_malformed_fitted_labels_safely(labels) -> None:
    model = _fit()
    model.model_.labels_ = labels(model.model_.labels_)
    with pytest.raises(ValueError, match="^persona review artifact is invalid$"):
        build_persona_review_artifact(model)


@pytest.mark.parametrize(
    "scores, skipped",
    [
        (lambda s: (type(s[0])(s[0].k, float("nan")),) + s[1:], None),
        (lambda s: (type(s[0])(s[0].k, float("inf")),) + s[1:], None),
        (lambda s: (type(s[0])(s[0].k, 1.5),) + s[1:], None),
        (lambda s: (s[0], s[0]) + s[1:], None),
        (lambda s: tuple(reversed(s)), None),
        (lambda s: tuple(type(x)(x.k, 0.0 if x.k == min(i.k for i in s if i.silhouette == max(j.silhouette for j in s)) else 0.5) for x in s), None),
        (lambda s: s, lambda _: (4,)),
    ],
    ids=["nan", "infinite", "outside-range", "duplicate", "unordered", "wrong-winner", "overlap"],
)
def test_builder_rejects_inconsistent_candidate_accounting(scores, skipped) -> None:
    model = _fit()
    model.candidate_scores_ = scores(model.candidate_scores_)
    if skipped is not None:
        model.skipped_k_ = skipped(model.skipped_k_)
    with pytest.raises(ValueError, match="^persona review artifact is invalid$"):
        build_persona_review_artifact(model)


def test_builder_preserves_exact_tie_winner_from_canonical_fit(monkeypatch) -> None:
    import app.clustering.core as core

    monkeypatch.setattr(core, "silhouette_score", lambda *args, **kwargs: 0.25)
    model = _fit()
    artifact = build_persona_review_artifact(model)
    assert artifact.selected_k == 4
    assert all(item.silhouette == 0.25 for item in artifact.scored_candidates)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda m: setattr(m, "random_state", True),
        lambda m: setattr(m, "n_init", 0),
        lambda m: setattr(m, "n_init", 1001),
        lambda m: setattr(m, "feature_names_", tuple(reversed(m.feature_names_))),
        lambda m: setattr(m, "silhouette_sample_size_", 8),
        lambda m: setattr(m.scaler_, "n_samples_seen_", 8),
        lambda m: setattr(m.scaler_, "n_features_in_", 24),
        lambda m: setattr(m.model_, "n_init", m.model_.n_init + 1),
    ],
    ids=["boolean-seed", "low-n-init", "high-n-init", "noncanonical-names", "small-sample", "low-scaler-count", "scaler-width", "model-settings"],
)
def test_builder_rejects_inconsistent_fit_metadata(mutation) -> None:
    model = _fit()
    mutation(model)
    with pytest.raises(ValueError, match="^persona review artifact is invalid$"):
        build_persona_review_artifact(model)


def test_serialization_has_only_fixed_finite_primitive_payload() -> None:
    encoded = persona_review_artifact_json(build_persona_review_artifact(_fit()))
    payload = json.loads(encoded, parse_constant=lambda value: pytest.fail(f"non-finite JSON token: {value}"))
    assert set(payload) == {
        "artifact_schema_version", "feature_schema", "feature_names", "selected_k",
        "training_sample_count", "fit_settings", "centroids", "label_counts",
        "silhouette_sample_size", "scored_candidates", "skipped_k",
    }
    assert "private input" not in encoded and "labels" not in encoded
    assert all(set(center) == {"cluster_id", "features"} for center in payload["centroids"])
    assert all(len(center["features"]) == 25 for center in payload["centroids"])


def test_serializer_rejects_mutable_nested_values_and_tampering_without_echo() -> None:
    artifact = build_persona_review_artifact(_fit())
    cases = [
        replace(artifact, artifact_schema_version="secret arbitrary marker"),
        replace(artifact, feature_names=list(artifact.feature_names)),
        replace(artifact, label_counts=list(artifact.label_counts)),
        replace(artifact, skipped_k=list(artifact.skipped_k)),
        replace(artifact, scored_candidates=artifact.scored_candidates + (artifact.scored_candidates[-1],)),
        replace(artifact, centroids=artifact.centroids[:-1]),
        replace(artifact, centroids=(replace(artifact.centroids[0], cluster_id=True),) + artifact.centroids[1:]),
        replace(artifact, centroids=(replace(artifact.centroids[0], features=(("VIDEO_STREAMING", float("nan")),) + artifact.centroids[0].features[1:]),) + artifact.centroids[1:]),
    ]
    for malformed in cases:
        with pytest.raises(ValueError) as exc:
            persona_review_artifact_json(malformed)
        assert str(exc.value) == "persona review artifact is invalid"
        assert "secret arbitrary marker" not in str(exc.value)


def test_native_float_scaler_count_is_accepted_but_fractional_or_bool_is_not() -> None:
    model = _fit()
    model.scaler_.n_samples_seen_ = np.float64(16)
    assert build_persona_review_artifact(model).training_sample_count == 16
    for count in (np.float64(16.5), True, np.inf, np.array([16])):
        model.scaler_.n_samples_seen_ = count
        with pytest.raises(ValueError, match="^persona review artifact is invalid$"):
            build_persona_review_artifact(model)


def test_incomplete_artifact_and_invalid_configured_sample_cap_fail_safely() -> None:
    from app.clustering.review_artifact import PersonaReviewArtifact

    with pytest.raises(ValueError, match="^persona review artifact is invalid$"):
        persona_review_artifact_json(object.__new__(PersonaReviewArtifact))
    for cap in (True, 1000.0, 5001):
        model = _fit()
        model.silhouette_sample_size = cap
        with pytest.raises(ValueError, match="^persona review artifact is invalid$"):
            build_persona_review_artifact(model)


@pytest.mark.parametrize("field", ["model_", "scaler_"])
def test_model_like_stand_ins_are_rejected(field) -> None:
    from types import SimpleNamespace

    clusterer = _fit()
    original = getattr(clusterer, field)
    stand_in = SimpleNamespace(**vars(original))
    if field == "scaler_":
        stand_in.inverse_transform = original.inverse_transform
    setattr(clusterer, field, stand_in)
    with pytest.raises(ValueError, match="^persona review artifact is invalid$"):
        build_persona_review_artifact(clusterer)
