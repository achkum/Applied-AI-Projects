"""Private, offline descriptions of fitted persona centroids."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.clustering.core import (
    PERSONA_FEATURE_NAMES,
    PERSONA_FEATURE_SCHEMA,
    PersonaClusterer,
)


@dataclass(frozen=True, slots=True)
class CentroidDescription:
    cluster_id: int
    features: tuple[tuple[str, float], ...]


def describe_persona_centroids(
    clusterer: PersonaClusterer,
) -> tuple[CentroidDescription, ...]:
    """Return immutable original-scale dimensionless centroid coordinates."""
    if not isinstance(clusterer, PersonaClusterer):
        raise ValueError("persona clusterer is invalid")
    scaler = clusterer.scaler_
    model = clusterer.model_
    if (
        clusterer.feature_schema_ != PERSONA_FEATURE_SCHEMA
        or clusterer.feature_names_ != PERSONA_FEATURE_NAMES
        or clusterer.n_features_in_ != len(PERSONA_FEATURE_NAMES)
        or scaler is None
        or model is None
    ):
        raise ValueError("canonical persona fit metadata is required")

    centers = getattr(model, "cluster_centers_", None)
    if centers is None:
        raise ValueError("fitted centroid state is inconsistent")
    try:
        scaled = np.asarray(centers, dtype=np.float64)
        scaler_width = np.asarray(scaler.mean_).shape
        scaler_scale_width = np.asarray(scaler.scale_).shape
    except (TypeError, ValueError, AttributeError):
        raise ValueError("fitted centroid state is inconsistent") from None
    if (
        scaled.ndim != 2
        or not 4 <= scaled.shape[0] <= 8
        or scaled.shape[1] != len(PERSONA_FEATURE_NAMES)
        or scaler_width != (len(PERSONA_FEATURE_NAMES),)
        or scaler_scale_width != (len(PERSONA_FEATURE_NAMES),)
        or getattr(model, "n_clusters", None) != scaled.shape[0]
        or getattr(model, "n_features_in_", None) != len(PERSONA_FEATURE_NAMES)
        or getattr(scaler, "n_features_in_", None) != len(PERSONA_FEATURE_NAMES)
        or not np.isfinite(scaled).all()
    ):
        raise ValueError("fitted centroid state is inconsistent")
    try:
        original = np.asarray(scaler.inverse_transform(scaled), dtype=np.float64)
    except (TypeError, ValueError, AttributeError):
        raise ValueError("fitted centroid state is inconsistent") from None
    if original.shape != scaled.shape or not np.isfinite(original).all():
        raise ValueError("centroid coordinates must be finite")

    for column, value in enumerate(original.T):
        upper = 10_000.0 if column == 22 else 10_000_000.0 if column == 23 else 1.0
        if np.any(value < 0.0) or np.any(value > upper):
            raise ValueError("centroid coordinates exceed schema bounds")

    return tuple(
        CentroidDescription(
            cluster_id=cluster_id,
            features=tuple(
                (name, float(value))
                for name, value in zip(PERSONA_FEATURE_NAMES, row, strict=True)
            ),
        )
        for cluster_id, row in enumerate(original)
    )
