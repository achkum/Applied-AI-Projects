"""Private immutable snapshots for offline persona model inference."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from app.clustering.core import PERSONA_FEATURE_NAMES, PERSONA_FEATURE_SCHEMA, PersonaClusterer
from app.clustering.review_artifact import build_persona_review_artifact


_SNAPSHOT_SCHEMA = "persona-model-snapshot-v1"
_INVALID = "persona model snapshot is invalid"
_FEATURE_COUNT = 25
_MAX_PAYLOAD_CHARS = 65_536
_SCALE_MIN = 1e-140
_SCALE_MAX = 1e7
_CENTER_MAX = 1e6


@dataclass(frozen=True, slots=True)
class PersonaModelSnapshot:
    snapshot_schema_version: str
    feature_schema: str
    feature_names: tuple[str, ...]
    selected_k: int
    training_sample_count: int
    random_state: int
    n_init: int
    cluster_centers: tuple[tuple[float, ...], ...]
    scaler_mean: tuple[float, ...]
    scaler_scale: tuple[float, ...]


def _error() -> ValueError:
    return ValueError(_INVALID)


def _integer(value: object, low: int, high: int) -> bool:
    return type(value) is int and low <= value <= high


def _real(value: object) -> bool:
    return type(value) in (int, float)


def _feature_bound(index: int) -> float:
    return 10_000.0 if index == 22 else 10_000_000.0 if index == 23 else 1.0


def _validated(snapshot: PersonaModelSnapshot) -> dict[str, object]:
    if type(snapshot) is not PersonaModelSnapshot:
        raise _error()
    if (type(snapshot.snapshot_schema_version) is not str or snapshot.snapshot_schema_version != _SNAPSHOT_SCHEMA
            or type(snapshot.feature_schema) is not str or snapshot.feature_schema != PERSONA_FEATURE_SCHEMA
            or type(snapshot.feature_names) is not tuple or snapshot.feature_names != PERSONA_FEATURE_NAMES
            or any(type(name) is not str for name in snapshot.feature_names)):
        raise _error()
    if (not _integer(snapshot.selected_k, 4, 8)
            or not _integer(snapshot.training_sample_count, 9, 5000)
            or not _integer(snapshot.random_state, 0, 2**31 - 1)
            or not _integer(snapshot.n_init, 1, 1000)):
        raise _error()
    k = snapshot.selected_k
    if type(snapshot.cluster_centers) is not tuple or len(snapshot.cluster_centers) != k:
        raise _error()
    centers: list[list[float]] = []
    for row in snapshot.cluster_centers:
        if type(row) is not tuple or len(row) != _FEATURE_COUNT:
            raise _error()
        frozen_row: list[float] = []
        for value in row:
            if type(value) not in (float, int):
                raise _error()
            number = float(value)
            if not math.isfinite(number) or abs(number) > _CENTER_MAX:
                raise _error()
            frozen_row.append(number)
        centers.append(frozen_row)

    arrays: list[list[float]] = []
    for is_mean, vector in ((True, snapshot.scaler_mean), (False, snapshot.scaler_scale)):
        if type(vector) is not tuple or len(vector) != _FEATURE_COUNT:
            raise _error()
        copied: list[float] = []
        for index, value in enumerate(vector):
            if type(value) not in (float, int):
                raise _error()
            number = float(value)
            if not math.isfinite(number):
                raise _error()
            if is_mean:
                if not 0.0 <= number <= _feature_bound(index):
                    raise _error()
            elif not _SCALE_MIN <= number <= _SCALE_MAX:
                raise _error()
            copied.append(number)
        arrays.append(copied)

    return {
        "snapshot_schema_version": _SNAPSHOT_SCHEMA,
        "feature_schema": PERSONA_FEATURE_SCHEMA,
        "feature_names": list(PERSONA_FEATURE_NAMES),
        "selected_k": k,
        "training_sample_count": snapshot.training_sample_count,
        "random_state": snapshot.random_state,
        "n_init": snapshot.n_init,
        "cluster_centers": centers,
        "scaler_mean": arrays[0],
        "scaler_scale": arrays[1],
    }


def build_persona_model_snapshot(clusterer: PersonaClusterer) -> PersonaModelSnapshot:
    """Copy a canonical fitted native persona model into primitive tuples."""
    try:
        if type(clusterer) is not PersonaClusterer:
            raise _error()
        model, scaler = clusterer.model_, clusterer.scaler_
        if type(model) is not KMeans or type(scaler) is not StandardScaler:
            raise _error()
        if scaler.with_mean is not True or scaler.with_std is not True:
            raise _error()

        # Reuse the accepted fit validator for canonical schema, fit-setting,
        # sample-count, labels, and original-scale centroid checks.
        artifact = build_persona_review_artifact(clusterer)
        if artifact.selected_k != model.n_clusters:
            raise _error()

        raw_centers = np.asarray(model.cluster_centers_)
        raw_mean = np.asarray(scaler.mean_)
        raw_scale = np.asarray(scaler.scale_)
        for array, shape in ((raw_centers, (artifact.selected_k, _FEATURE_COUNT)),
                             (raw_mean, (_FEATURE_COUNT,)),
                             (raw_scale, (_FEATURE_COUNT,))):
            if (array.shape != shape or not np.issubdtype(array.dtype, np.number)
                    or np.issubdtype(array.dtype, np.complexfloating)
                    or np.issubdtype(array.dtype, np.bool_) or not np.isfinite(array).all()):
                raise _error()
        centers = tuple(tuple(float(x) for x in row) for row in raw_centers)
        mean = tuple(float(x) for x in raw_mean)
        scale = tuple(float(x) for x in raw_scale)
        snapshot = PersonaModelSnapshot(
            snapshot_schema_version=_SNAPSHOT_SCHEMA,
            feature_schema=PERSONA_FEATURE_SCHEMA,
            feature_names=tuple(PERSONA_FEATURE_NAMES),
            selected_k=int(artifact.selected_k),
            training_sample_count=int(artifact.training_sample_count),
            random_state=int(artifact.random_state),
            n_init=int(artifact.n_init),
            cluster_centers=centers,
            scaler_mean=mean,
            scaler_scale=scale,
        )
        _validated(snapshot)
        return snapshot
    except (ValueError, TypeError, AttributeError, OverflowError, IndexError, KeyError):
        raise _error() from None


def persona_model_snapshot_json(snapshot: PersonaModelSnapshot) -> str:
    """Encode a validated snapshot as deterministic, strict JSON."""
    try:
        return json.dumps(_validated(snapshot), allow_nan=False, sort_keys=True, separators=(",", ":"))
    except (ValueError, TypeError, AttributeError, OverflowError, IndexError, KeyError):
        raise _error() from None


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _error()
        result[key] = value
    return result


def _reject_constant(_: str) -> object:
    raise _error()


def persona_model_snapshot_from_json(payload: str) -> PersonaModelSnapshot:
    """Decode only bounded JSON matching the fixed primitive snapshot shape."""
    try:
        if type(payload) is not str or len(payload) > _MAX_PAYLOAD_CHARS:
            raise _error()
        data = json.loads(payload, object_pairs_hook=_unique_object, parse_constant=_reject_constant)
        keys = {"snapshot_schema_version", "feature_schema", "feature_names", "selected_k",
                "training_sample_count", "random_state", "n_init", "cluster_centers",
                "scaler_mean", "scaler_scale"}
        if type(data) is not dict or set(data) != keys:
            raise _error()
        if (type(data["snapshot_schema_version"]) is not str
                or type(data["feature_schema"]) is not str
                or type(data["feature_names"]) is not list
                or any(type(name) is not str for name in data["feature_names"])):
            raise _error()
        for key in ("selected_k", "training_sample_count", "random_state", "n_init"):
            if type(data[key]) is not int:
                raise _error()
        def vector(value: object) -> tuple[float, ...]:
            if type(value) is not list:
                raise _error()
            converted: list[float] = []
            for item in value:
                if type(item) not in (int, float):
                    raise _error()
                converted.append(float(item))
            return tuple(converted)

        if type(data["cluster_centers"]) is not list:
            raise _error()
        snapshot = PersonaModelSnapshot(
            snapshot_schema_version=data["snapshot_schema_version"],
            feature_schema=data["feature_schema"],
            feature_names=tuple(data["feature_names"]),
            selected_k=data["selected_k"],
            training_sample_count=data["training_sample_count"],
            random_state=data["random_state"],
            n_init=data["n_init"],
            cluster_centers=tuple(vector(row) for row in data["cluster_centers"]),
            scaler_mean=vector(data["scaler_mean"]),
            scaler_scale=vector(data["scaler_scale"]),
        )
        _validated(snapshot)
        return snapshot
    except (ValueError, TypeError, OverflowError, AttributeError, IndexError, KeyError, RecursionError):
        raise _error() from None


def predict_persona_cluster(snapshot: PersonaModelSnapshot, features: tuple) -> int:
    """Return the anonymous nearest-centroid index for one canonical vector."""
    try:
        payload = _validated(snapshot)
        if type(features) is not tuple or len(features) != _FEATURE_COUNT:
            raise _error()
        values: list[float] = []
        for index, value in enumerate(features):
            if not _real(value):
                raise _error()
            number = float(value)
            if not math.isfinite(number) or not 0.0 <= number <= _feature_bound(index):
                raise _error()
            values.append(number)
        means = payload["scaler_mean"]
        scales = payload["scaler_scale"]
        centers = payload["cluster_centers"]
        best_index, best_distance = 0, math.inf
        for cluster_index, center in enumerate(centers):
            distance = 0.0
            for index, value in enumerate(values):
                standardized = (value - means[index]) / scales[index]
                delta = standardized - center[index]
                distance += delta * delta
            if not math.isfinite(distance):
                raise _error()
            if distance < best_distance:
                best_index, best_distance = cluster_index, distance
        return best_index
    except (ValueError, TypeError, OverflowError, AttributeError, IndexError, KeyError):
        raise _error() from None
