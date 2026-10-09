"""Private, bounded entry point for canonical offline persona training."""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.clustering.core import PERSONA_FEATURE_NAMES, PERSONA_FEATURE_SCHEMA, PersonaClusterer
from app.clustering.model_snapshot import PersonaModelSnapshot, build_persona_model_snapshot
from app.clustering.review_artifact import PersonaReviewArtifact, build_persona_review_artifact


_INVALID_INPUT = "persona training input is invalid"
_UNAVAILABLE = "persona training unavailable"


@dataclass(frozen=True, slots=True)
class PersonaTrainingResult:
    """Immutable exports copied from one canonical native fit."""

    review_artifact: PersonaReviewArtifact
    model_snapshot: PersonaModelSnapshot


def _feature_bound(index: int) -> float:
    if index < 22 or index == 24:
        return 1.0
    if index == 22:
        return 10_000.0
    return 10_000_000.0


def _validate_features(features: tuple) -> tuple[tuple[int | float, ...], ...]:
    if type(features) is not tuple or not 9 <= len(features) <= 5000:
        raise ValueError(_INVALID_INPUT)
    for row in features:
        if type(row) is not tuple or len(row) != len(PERSONA_FEATURE_NAMES):
            raise ValueError(_INVALID_INPUT)
        for index, value in enumerate(row):
            if type(value) not in (int, float):
                raise ValueError(_INVALID_INPUT)
            try:
                number = float(value)
            except (OverflowError, ValueError):
                raise ValueError(_INVALID_INPUT) from None
            if not math.isfinite(number) or not 0.0 <= number <= _feature_bound(index):
                raise ValueError(_INVALID_INPUT)
    return features


def _exports_agree(artifact: PersonaReviewArtifact, snapshot: PersonaModelSnapshot) -> bool:
    return (
        artifact.feature_schema == snapshot.feature_schema == PERSONA_FEATURE_SCHEMA
        and artifact.feature_names == snapshot.feature_names == PERSONA_FEATURE_NAMES
        and artifact.selected_k == snapshot.selected_k
        and artifact.training_sample_count == snapshot.training_sample_count
        and artifact.random_state == snapshot.random_state == 42
        and artifact.n_init == snapshot.n_init == 10
    )


def train_persona_model(features: tuple) -> PersonaTrainingResult:
    """Validate canonical numeric rows, fit once, and return immutable exports."""
    canonical_features = _validate_features(features)
    try:
        clusterer = PersonaClusterer(random_state=42, n_init=10, silhouette_sample_size=1000)
        clusterer.fit(canonical_features, feature_schema=PERSONA_FEATURE_SCHEMA)
        artifact = build_persona_review_artifact(clusterer)
        snapshot = build_persona_model_snapshot(clusterer)
        if not _exports_agree(artifact, snapshot):
            raise ValueError(_UNAVAILABLE)
        return PersonaTrainingResult(review_artifact=artifact, model_snapshot=snapshot)
    except Exception:
        raise ValueError(_UNAVAILABLE) from None
