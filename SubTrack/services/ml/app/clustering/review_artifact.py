"""Private, deterministic serialization of offline persona review evidence."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from numbers import Integral, Real

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from app.clustering.centroid_descriptions import CentroidDescription, describe_persona_centroids
from app.clustering.core import (
    PERSONA_FEATURE_NAMES,
    PERSONA_FEATURE_SCHEMA,
    CandidateScore,
    PersonaClusterer,
)


_ARTIFACT_SCHEMA = "persona-review-artifact-v1"
_INVALID = "persona review artifact is invalid"


@dataclass(frozen=True, slots=True)
class PersonaReviewArtifact:
    artifact_schema_version: str
    feature_schema: str
    feature_names: tuple[str, ...]
    selected_k: int
    training_sample_count: int
    random_state: int
    n_init: int
    centroids: tuple[CentroidDescription, ...]
    label_counts: tuple[int, ...]
    silhouette_sample_size: int
    scored_candidates: tuple[CandidateScore, ...]
    skipped_k: tuple[int, ...]


def _integer(value: object, low: int, high: int) -> bool:
    return isinstance(value, Integral) and not isinstance(value, (bool, np.bool_)) and low <= int(value) <= high


def _safe_error() -> ValueError:
    return ValueError(_INVALID)


def build_persona_review_artifact(clusterer: PersonaClusterer) -> PersonaReviewArtifact:
    """Copy a canonical fitted clusterer into an immutable primitive artifact."""
    try:
        if type(clusterer) is not PersonaClusterer:
            raise _safe_error()
        model, scaler = clusterer.model_, clusterer.scaler_
        if type(model) is not KMeans or type(scaler) is not StandardScaler:
            raise _safe_error()
        k = clusterer.selected_k_
        samples = getattr(scaler, "n_samples_seen_", None)
        # sklearn may expose this unweighted count as np.float64.
        if (
            not isinstance(samples, Real)
            or isinstance(samples, (bool, np.bool_))
            or not math.isfinite(float(samples))
            or not float(samples).is_integer()
            or not 9 <= float(samples) <= 5000
        ):
            raise _safe_error()
        if not _integer(clusterer.random_state, 0, 2**31 - 1) or not _integer(clusterer.n_init, 1, 1000):
            raise _safe_error()
        if not _integer(k, 4, 8) or clusterer.feature_schema_ != PERSONA_FEATURE_SCHEMA:
            raise _safe_error()
        if clusterer.feature_names_ != PERSONA_FEATURE_NAMES or clusterer.n_features_in_ != 25:
            raise _safe_error()
        if getattr(model, "n_clusters", None) != k or getattr(model, "n_features_in_", None) != 25:
            raise _safe_error()
        if getattr(model, "random_state", None) != clusterer.random_state or getattr(model, "n_init", None) != clusterer.n_init:
            raise _safe_error()
        if getattr(scaler, "n_features_in_", None) != 25:
            raise _safe_error()
        if not _integer(clusterer.silhouette_sample_size, 9, 5000):
            raise _safe_error()
        sample_size = clusterer.silhouette_sample_size_
        if not _integer(sample_size, 9, min(int(samples), 5000)):
            raise _safe_error()
        if sample_size != min(int(samples), clusterer.silhouette_sample_size):
            raise _safe_error()

        raw_labels = np.asarray(model.labels_)
        if raw_labels.ndim != 1 or raw_labels.shape[0] != int(samples):
            raise _safe_error()
        if not np.issubdtype(raw_labels.dtype, np.integer) or np.issubdtype(raw_labels.dtype, np.bool_):
            raise _safe_error()
        if np.any(raw_labels < 0) or np.any(raw_labels >= k):
            raise _safe_error()
        counts = np.bincount(raw_labels.astype(np.int64, copy=False), minlength=k)
        if len(counts) != k or np.any(counts <= 0) or int(counts.sum()) != int(samples):
            raise _safe_error()

        scores = tuple(clusterer.candidate_scores_)
        skipped = tuple(clusterer.skipped_k_)
        scored_ks = tuple(score.k for score in scores if type(score) is CandidateScore)
        if len(scored_ks) != len(scores) or not scores or scored_ks != tuple(sorted(set(scored_ks))):
            raise _safe_error()
        if any(not _integer(value, 4, 8) for value in scored_ks):
            raise _safe_error()
        if any(not isinstance(score.silhouette, Real) or isinstance(score.silhouette, bool) or not math.isfinite(float(score.silhouette)) or not -1.0 <= float(score.silhouette) <= 1.0 for score in scores):
            raise _safe_error()
        if any(not _integer(value, 4, 8) for value in skipped) or skipped != tuple(sorted(set(skipped))):
            raise _safe_error()
        if set(scored_ks) & set(skipped) or set(scored_ks) | set(skipped) != set(range(4, 9)):
            raise _safe_error()
        best = max(float(score.silhouette) for score in scores)
        winner = min(score.k for score in scores if float(score.silhouette) == best)
        if winner != k:
            raise _safe_error()

        descriptions = describe_persona_centroids(clusterer)
        frozen_centroids = tuple(
            CentroidDescription(
                cluster_id=int(item.cluster_id),
                features=tuple((str(name), float(value)) for name, value in item.features),
            )
            for item in descriptions
        )
        artifact = PersonaReviewArtifact(
            artifact_schema_version=_ARTIFACT_SCHEMA,
            feature_schema=PERSONA_FEATURE_SCHEMA,
            feature_names=tuple(PERSONA_FEATURE_NAMES),
            selected_k=int(k),
            training_sample_count=int(samples),
            random_state=int(clusterer.random_state),
            n_init=int(clusterer.n_init),
            centroids=frozen_centroids,
            label_counts=tuple(int(value) for value in counts),
            silhouette_sample_size=int(sample_size),
            scored_candidates=tuple(CandidateScore(int(score.k), float(score.silhouette)) for score in scores),
            skipped_k=tuple(int(value) for value in skipped),
        )
        _validated_payload(artifact)
        return artifact
    except ValueError:
        raise _safe_error() from None
    except (AttributeError, TypeError, OverflowError, IndexError, KeyError):
        raise _safe_error() from None


def _validated_payload(artifact: PersonaReviewArtifact) -> dict[str, object]:
    if type(artifact) is not PersonaReviewArtifact:
        raise _safe_error()
    if type(artifact.artifact_schema_version) is not str or artifact.artifact_schema_version != _ARTIFACT_SCHEMA or type(artifact.feature_schema) is not str or artifact.feature_schema != PERSONA_FEATURE_SCHEMA:
        raise _safe_error()
    if type(artifact.feature_names) is not tuple or any(type(name) is not str for name in artifact.feature_names) or artifact.feature_names != PERSONA_FEATURE_NAMES:
        raise _safe_error()
    if not _integer(artifact.selected_k, 4, 8) or not _integer(artifact.training_sample_count, 9, 5000):
        raise _safe_error()
    if not _integer(artifact.random_state, 0, 2**31 - 1) or not _integer(artifact.n_init, 1, 1000):
        raise _safe_error()
    k, n = int(artifact.selected_k), int(artifact.training_sample_count)
    if not _integer(artifact.silhouette_sample_size, 9, min(n, 5000)):
        raise _safe_error()
    if type(artifact.centroids) is not tuple or len(artifact.centroids) != k:
        raise _safe_error()
    centroid_values = []
    for index, centroid in enumerate(artifact.centroids):
        if type(centroid) is not CentroidDescription or not _integer(centroid.cluster_id, 0, 7) or centroid.cluster_id != index:
            raise _safe_error()
        if type(centroid.features) is not tuple or len(centroid.features) != 25:
            raise _safe_error()
        row = []
        for expected, pair in zip(PERSONA_FEATURE_NAMES, centroid.features, strict=True):
            if type(pair) is not tuple or len(pair) != 2 or type(pair[0]) is not str or pair[0] != expected:
                raise _safe_error()
            value = pair[1]
            if type(value) not in (int, float) or not math.isfinite(float(value)):
                raise _safe_error()
            upper = 10_000.0 if expected == "subscriptionCount" else 10_000_000.0 if expected == "averageMonthlyPriceRelativeTo1000Sek" else 1.0
            if not 0.0 <= float(value) <= upper:
                raise _safe_error()
            row.append(float(value))
        centroid_values.append({"cluster_id": int(index), "features": dict(zip(PERSONA_FEATURE_NAMES, row, strict=True))})
    if type(artifact.label_counts) is not tuple or len(artifact.label_counts) != k:
        raise _safe_error()
    if any(not _integer(count, 1, n) for count in artifact.label_counts) or sum(artifact.label_counts) != n:
        raise _safe_error()
    scores = artifact.scored_candidates
    skipped = artifact.skipped_k
    if type(scores) is not tuple or type(skipped) is not tuple or not scores:
        raise _safe_error()
    score_ks = tuple(item.k for item in scores if type(item) is CandidateScore)
    if len(score_ks) != len(scores) or score_ks != tuple(sorted(set(score_ks))) or any(not _integer(x, 4, 8) for x in score_ks):
        raise _safe_error()
    for item in scores:
        if not _integer(item.k, 4, 8) or type(item.silhouette) is not float or not math.isfinite(item.silhouette) or not -1.0 <= item.silhouette <= 1.0:
            raise _safe_error()
    if any(not _integer(x, 4, 8) for x in skipped) or skipped != tuple(sorted(set(skipped))):
        raise _safe_error()
    if set(score_ks) & set(skipped) or set(score_ks) | set(skipped) != set(range(4, 9)):
        raise _safe_error()
    maximum = max(float(item.silhouette) for item in scores)
    if min(item.k for item in scores if float(item.silhouette) == maximum) != k:
        raise _safe_error()
    return {
        "artifact_schema_version": _ARTIFACT_SCHEMA,
        "feature_schema": PERSONA_FEATURE_SCHEMA,
        "feature_names": list(PERSONA_FEATURE_NAMES),
        "selected_k": k,
        "training_sample_count": n,
        "fit_settings": {"random_state": int(artifact.random_state), "n_init": int(artifact.n_init)},
        "centroids": centroid_values,
        "label_counts": list(artifact.label_counts),
        "silhouette_sample_size": int(artifact.silhouette_sample_size),
        "scored_candidates": [{"k": int(item.k), "silhouette": float(item.silhouette)} for item in scores],
        "skipped_k": list(skipped),
    }


def persona_review_artifact_json(artifact: PersonaReviewArtifact) -> str:
    """Serialize only validated fixed-schema primitives as canonical strict JSON."""
    try:
        return json.dumps(_validated_payload(artifact), allow_nan=False, sort_keys=True, separators=(",", ":"))
    except (ValueError, TypeError, OverflowError, AttributeError, IndexError, KeyError):
        raise _safe_error() from None
