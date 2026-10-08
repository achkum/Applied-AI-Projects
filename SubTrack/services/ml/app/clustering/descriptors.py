"""Private offline clustering for caller-scoped synthetic descriptors."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.cluster import HDBSCAN
from sklearn.feature_extraction.text import TfidfVectorizer


@dataclass(frozen=True, slots=True)
class DescriptorClusteringResult:
    """Labels and aggregate counts only; descriptor text is never retained."""

    labels: tuple[int, ...]
    sample_count: int
    cluster_count: int
    noise_count: int


def cluster_descriptors(
    descriptors: list[str] | tuple[str, ...],
    *,
    min_cluster_size: int = 3,
    min_samples: int = 2,
) -> DescriptorClusteringResult:
    """Cluster caller-scoped synthetic text using TF-IDF and Euclidean HDBSCAN.

    This primitive does not authenticate callers or establish privacy/scope.
    """
    if not isinstance(descriptors, (list, tuple)) or not descriptors:
        raise ValueError("descriptors must be a non-empty list or tuple")
    if len(descriptors) > 2000:
        raise ValueError("descriptors must contain at most 2000 items")
    for descriptor in descriptors:
        if not isinstance(descriptor, str) or not descriptor:
            raise ValueError("each descriptor must be a non-empty string")
        if len(descriptor) > 256:
            raise ValueError("each descriptor must be at most 256 characters")

    count = len(descriptors)
    for name, value, minimum in (
        ("min_cluster_size", min_cluster_size, 2),
        ("min_samples", min_samples, 1),
    ):
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"{name} must be an integer")
        if value < minimum or value > count:
            raise ValueError(f"{name} must be between {minimum} and the sample count")

    vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        max_features=1024,
        norm="l2",
        dtype=np.float64,
    )
    try:
        matrix = vectorizer.fit_transform(descriptors).toarray()
    except ValueError as exc:
        raise ValueError("descriptors contain no usable character n-grams") from exc
    if np.all(matrix == matrix[0]):
        raise ValueError("descriptor features are degenerate: every row is identical")

    raw_labels = HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric="euclidean",
    ).fit_predict(matrix)
    canonical: dict[int, int] = {}
    labels: list[int] = []
    for raw in raw_labels:
        label = int(raw)
        if label == -1:
            labels.append(-1)
        else:
            if label not in canonical:
                canonical[label] = len(canonical)
            labels.append(canonical[label])
    label_tuple = tuple(labels)
    return DescriptorClusteringResult(
        labels=label_tuple,
        sample_count=count,
        cluster_count=len(canonical),
        noise_count=label_tuple.count(-1),
    )
