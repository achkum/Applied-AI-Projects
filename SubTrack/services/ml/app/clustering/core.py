"""Deterministic K-Means selection for upstream-built numeric features."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler


@dataclass(frozen=True, slots=True)
class CandidateScore:
    k: int
    silhouette: float


class PersonaClusterer:
    """Fit K-Means for k=4..8 on a finite numeric matrix.

    The caller owns feature construction and scoping. This class accepts no
    identifiers, descriptors, transactions, or monetary values by contract.
    """

    def __init__(
        self,
        *,
        random_state: int = 42,
        n_init: int = 10,
        silhouette_sample_size: int = 1000,
    ) -> None:
        if n_init < 1:
            raise ValueError("n_init must be positive")
        if silhouette_sample_size < 9:
            raise ValueError("silhouette_sample_size must be at least 9")
        self.random_state = random_state
        self.n_init = n_init
        self.silhouette_sample_size = silhouette_sample_size
        self.scaler_: StandardScaler | None = None
        self.model_: KMeans | None = None
        self.n_features_in_: int | None = None
        self.candidate_scores_: tuple[CandidateScore, ...] = ()
        self.skipped_k_: tuple[int, ...] = ()
        self.silhouette_sample_size_: int = 0

    @staticmethod
    def _matrix(values: ArrayLike, *, expected_features: int | None = None) -> NDArray[np.float64]:
        try:
            raw = np.asarray(values)
        except (TypeError, ValueError) as exc:
            raise ValueError("features must be a rectangular 2D numeric matrix") from exc
        if raw.ndim != 2 or raw.shape[0] == 0 or raw.shape[1] == 0:
            raise ValueError("features must be a non-empty 2D matrix")
        if not np.issubdtype(raw.dtype, np.number) or np.issubdtype(raw.dtype, np.complexfloating):
            raise ValueError("features must contain real numeric values")
        matrix = np.asarray(raw, dtype=np.float64)
        if not np.isfinite(matrix).all():
            raise ValueError("features must contain only finite values")
        if expected_features is not None and matrix.shape[1] != expected_features:
            raise ValueError(f"expected {expected_features} features, got {matrix.shape[1]}")
        return matrix

    def fit(self, features: ArrayLike) -> PersonaClusterer:
        matrix = self._matrix(features)
        if matrix.shape[0] < 9:
            raise ValueError("at least 9 rows are required to evaluate k=4..8")
        if np.any(np.ptp(matrix, axis=0) == 0):
            if np.all(np.ptp(matrix, axis=0) == 0):
                raise ValueError("features are degenerate: every row is identical")

        scaler = StandardScaler()
        scaled = scaler.fit_transform(matrix)
        unique_count = np.unique(scaled, axis=0).shape[0]
        sample_size = min(matrix.shape[0], self.silhouette_sample_size)
        if sample_size < 9:
            raise ValueError("silhouette sample must contain at least 9 rows")
        if sample_size == matrix.shape[0]:
            sample_indices = np.arange(matrix.shape[0])
        else:
            sample_indices = np.sort(
                np.random.default_rng(self.random_state).choice(
                    matrix.shape[0], size=sample_size, replace=False
                )
            )
        sample = scaled[sample_indices]

        scores: list[CandidateScore] = []
        skipped: list[int] = []
        selected_model: KMeans | None = None
        best_score = -np.inf
        for k in range(4, 9):
            if unique_count < k:
                skipped.append(k)
                continue
            candidate = KMeans(
                n_clusters=k,
                random_state=self.random_state,
                n_init=self.n_init,
                algorithm="lloyd",
            ).fit(scaled)
            sample_labels = candidate.predict(sample)
            distinct_labels = np.unique(sample_labels).size
            if distinct_labels < 2 or distinct_labels >= sample_size:
                skipped.append(k)
                continue
            score = float(silhouette_score(sample, sample_labels, metric="euclidean"))
            scores.append(CandidateScore(k=k, silhouette=score))
            # Ascending k iteration and strict comparison make exact ties prefer
            # the smaller k.
            if score > best_score:
                best_score = score
                selected_model = candidate

        if selected_model is None:
            raise ValueError("no feasible k in 4..8 produced a valid silhouette score")
        self.scaler_ = scaler
        self.model_ = selected_model
        self.n_features_in_ = matrix.shape[1]
        self.candidate_scores_ = tuple(scores)
        self.skipped_k_ = tuple(skipped)
        self.silhouette_sample_size_ = sample_size
        return self

    @property
    def selected_k_(self) -> int:
        if self.model_ is None:
            raise ValueError("clusterer is not fitted")
        return int(self.model_.n_clusters)

    def predict(self, features: ArrayLike) -> NDArray[np.int32]:
        if self.model_ is None or self.scaler_ is None or self.n_features_in_ is None:
            raise ValueError("clusterer is not fitted")
        matrix = self._matrix(features, expected_features=self.n_features_in_)
        return self.model_.predict(self.scaler_.transform(matrix))
