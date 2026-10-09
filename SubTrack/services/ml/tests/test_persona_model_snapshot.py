"""Contracts for private immutable persona model snapshots."""

from dataclasses import FrozenInstanceError, replace
import json
from types import SimpleNamespace

import numpy as np
import pytest

from app.clustering import PersonaClusterer
from app.clustering.core import PERSONA_FEATURE_NAMES, PERSONA_FEATURE_SCHEMA
from app.clustering.model_snapshot import (
    PersonaModelSnapshot,
    build_persona_model_snapshot,
    persona_model_snapshot_from_json,
    persona_model_snapshot_json,
    predict_persona_cluster,
)


@pytest.fixture(scope="module")
def fitted_persona() -> PersonaClusterer:
    """A small genuine canonical fit, shared by the module's checks."""
    rows = []
    for group in range(4):
        for offset in range(4):
            row = np.zeros(25)
            row[group] = 0.8 + offset * 0.01
            row[(group + 1) % 4] = 0.2 - offset * 0.01
            row[22:25] = (
                20 + group * 3 + offset,
                1.2 + group * 0.4 + offset * 0.02,
                0.2 + offset * 0.02,
            )
            rows.append(row)
    return PersonaClusterer().fit(np.asarray(rows), feature_schema=PERSONA_FEATURE_SCHEMA)


def _valid_vector() -> tuple[float, ...]:
    return (0.0,) * 22 + (0.0, 1.0, 0.5)


def test_snapshot_copies_canonical_fitted_weights_and_matches_native_predictions(fitted_persona) -> None:
    model = fitted_persona
    snapshot = build_persona_model_snapshot(model)

    assert snapshot.snapshot_schema_version == "persona-model-snapshot-v1"
    assert snapshot.feature_schema == PERSONA_FEATURE_SCHEMA
    assert snapshot.feature_names == PERSONA_FEATURE_NAMES
    assert snapshot.selected_k == model.model_.n_clusters
    assert snapshot.training_sample_count == len(model.model_.labels_)
    assert snapshot.random_state == model.random_state
    assert snapshot.n_init == model.n_init
    assert snapshot.cluster_centers == tuple(tuple(float(v) for v in row) for row in model.model_.cluster_centers_)
    assert snapshot.scaler_mean == tuple(float(v) for v in model.scaler_.mean_)
    assert snapshot.scaler_scale == tuple(float(v) for v in model.scaler_.scale_)

    # Compare the actual canonical training rows and a bounded probe to native sklearn.
    # Recreate the deterministic fixture rows without changing or querying model behavior.
    canonical_rows = []
    for group in range(4):
        for offset in range(4):
            row = np.zeros(25)
            row[group] = 0.8 + offset * 0.01
            row[(group + 1) % 4] = 0.2 - offset * 0.01
            row[22:25] = (20 + group * 3 + offset, 1.2 + group * 0.4 + offset * 0.02, 0.2 + offset * 0.02)
            canonical_rows.append(tuple(float(v) for v in row))
    center_probes = [
        tuple(float(v) for v in row)
        for row in model.scaler_.inverse_transform(np.asarray(snapshot.cluster_centers))
    ]
    probes = canonical_rows + center_probes + [_valid_vector()]
    native = model.predict(np.asarray(probes))
    assert tuple(predict_persona_cluster(snapshot, row) for row in probes) == tuple(int(v) for v in native)


def test_builder_and_serializer_do_not_fit_or_predict_and_values_are_detached(fitted_persona, monkeypatch) -> None:
    model = fitted_persona
    expected_centers = tuple(tuple(float(v) for v in row) for row in model.model_.cluster_centers_)

    def forbidden(*args, **kwargs):
        raise AssertionError("snapshot export must not fit or predict")

    monkeypatch.setattr(model, "fit", forbidden)
    monkeypatch.setattr(model.model_, "predict", forbidden)
    snapshot = build_persona_model_snapshot(model)
    encoded = persona_model_snapshot_json(snapshot)
    original_mean = model.scaler_.mean_.copy()
    model.model_.cluster_centers_[:] = 0
    model.scaler_.mean_[:] = 0
    assert snapshot.cluster_centers == expected_centers
    assert persona_model_snapshot_json(snapshot) == encoded
    model.model_.cluster_centers_[:] = np.asarray(expected_centers)
    model.scaler_.mean_[:] = original_mean
    with pytest.raises(FrozenInstanceError):
        snapshot.selected_k = 4
    with pytest.raises((FrozenInstanceError, AttributeError, TypeError)):
        snapshot.cluster_centers[0][0] = 9.0


def test_json_roundtrip_is_deterministic_fixed_and_deeply_immutable(fitted_persona) -> None:
    snapshot = build_persona_model_snapshot(fitted_persona)
    encoded = persona_model_snapshot_json(snapshot)
    decoded = persona_model_snapshot_from_json(encoded)
    assert decoded == snapshot
    assert persona_model_snapshot_json(decoded) == encoded
    payload = json.loads(encoded, parse_constant=lambda token: pytest.fail(f"non-finite JSON token: {token}"))
    assert set(payload) == {
        "snapshot_schema_version", "feature_schema", "feature_names", "selected_k",
        "training_sample_count", "random_state", "n_init", "cluster_centers", "scaler_mean", "scaler_scale",
    }
    assert all(type(v) is tuple for v in (decoded.feature_names, decoded.cluster_centers, decoded.scaler_mean, decoded.scaler_scale))
    assert all(type(row) is tuple for row in decoded.cluster_centers)
    assert "labels" not in payload and "private" not in encoded


def test_serializer_revalidates_constructed_or_replaced_snapshots(fitted_persona) -> None:
    snapshot = build_persona_model_snapshot(fitted_persona)
    invalid = (
        replace(snapshot, selected_k=True),
        replace(snapshot, feature_names=list(snapshot.feature_names)),
        replace(snapshot, cluster_centers=snapshot.cluster_centers[:-1]),
        replace(snapshot, scaler_mean=(float("nan"),) + snapshot.scaler_mean[1:]),
        replace(snapshot, scaler_scale=(0.0,) + snapshot.scaler_scale[1:]),
        replace(snapshot, snapshot_schema_version="caller marker"),
    )
    for candidate in invalid:
        with pytest.raises(ValueError):
            persona_model_snapshot_json(candidate)
    with pytest.raises(ValueError):
        persona_model_snapshot_json("private input")  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        persona_model_snapshot_json(object.__new__(PersonaModelSnapshot))


def test_decoder_rejects_duplicate_unknown_missing_and_wrong_version_fields(fitted_persona) -> None:
    encoded = persona_model_snapshot_json(build_persona_model_snapshot(fitted_persona))
    payload = json.loads(encoded)
    malformed = [
        encoded[:-1] + ',"extra":1}',
        json.dumps({key: value for key, value in payload.items() if key != "selected_k"}),
        json.dumps({**payload, "snapshot_schema_version": "caller marker"}),
        json.dumps({**payload, "selected_k": True}),
        json.dumps({**payload, "random_state": "42"}),
        json.dumps({**payload, "feature_names": list(reversed(payload["feature_names"]))}),
        '{"snapshot_schema_version":"persona-model-snapshot-v1","snapshot_schema_version":"persona-model-snapshot-v1"}',
        '{"snapshot_schema_version":"persona-model-snapshot-v1","nested":{"a":1,"a":2}}',
        '{"snapshot_schema_version":"persona-model-snapshot-v1","x":NaN}',
    ]
    for value in malformed:
        with pytest.raises(ValueError) as exc:
            persona_model_snapshot_from_json(value)
        assert str(exc.value) == "persona model snapshot is invalid"
        assert "caller marker" not in str(exc.value)
        assert "nested" not in str(exc.value)


@pytest.mark.parametrize("payload", [None, 1, b"{}", " " * 65537, "{", "{}\ud800"])
def test_decoder_rejects_nontext_oversize_and_malformed_json_safely(payload) -> None:
    with pytest.raises(ValueError, match="^persona model snapshot is invalid$"):
        persona_model_snapshot_from_json(payload)


def test_builder_requires_native_fitted_types_and_consistent_metadata(fitted_persona) -> None:
    for field in ("model_", "scaler_"):
        model = fitted_persona
        original = getattr(model, field)
        setattr(model, field, SimpleNamespace(**vars(original)))
        with pytest.raises(ValueError):
            build_persona_model_snapshot(model)
        setattr(model, field, original)

    model = fitted_persona
    original_names = model.feature_names_
    model.feature_names_ = tuple(reversed(original_names))
    with pytest.raises(ValueError):
        build_persona_model_snapshot(model)
    model.feature_names_ = original_names

    original_n_init = model.n_init
    original_model_n_init = model.model_.n_init
    model.model_.n_init = original_model_n_init + 1
    with pytest.raises(ValueError):
        build_persona_model_snapshot(model)
    model.model_.n_init = original_model_n_init
    model.n_init = original_n_init

    original_seen = model.scaler_.n_samples_seen_
    model.scaler_.n_samples_seen_ = np.float64(16)
    assert build_persona_model_snapshot(model).training_sample_count == 16
    for value in (np.float64(16.5), True, np.inf, np.array([16])):
        model.scaler_.n_samples_seen_ = value
        with pytest.raises(ValueError):
            build_persona_model_snapshot(model)
    model.scaler_.n_samples_seen_ = original_seen


def test_snapshot_numeric_support_limits_are_enforced(fitted_persona) -> None:
    snapshot = build_persona_model_snapshot(fitted_persona)
    low_scale = replace(snapshot, scaler_scale=(1e-141,) + snapshot.scaler_scale[1:])
    high_scale = replace(snapshot, scaler_scale=(1e7 + 1.0,) + snapshot.scaler_scale[1:])
    high_center = replace(snapshot, cluster_centers=((1_000_001.0,) + snapshot.cluster_centers[0][1:],) + snapshot.cluster_centers[1:])
    for candidate in (low_scale, high_scale, high_center):
        with pytest.raises(ValueError):
            persona_model_snapshot_json(candidate)
    supported = replace(
        snapshot,
        scaler_scale=(1e-140, 1e7) + snapshot.scaler_scale[2:],
        cluster_centers=((1_000_000.0,) + snapshot.cluster_centers[0][1:],) + snapshot.cluster_centers[1:],
    )
    assert persona_model_snapshot_from_json(persona_model_snapshot_json(supported)) == supported


def test_inference_validates_one_canonical_tuple_and_uses_first_index_for_exact_ties(fitted_persona) -> None:
    snapshot = build_persona_model_snapshot(fitted_persona)
    tied_centers = tuple(snapshot.cluster_centers[0] for _ in range(snapshot.selected_k))
    tied = replace(snapshot, cluster_centers=tied_centers)
    assert predict_persona_cluster(tied, _valid_vector()) == 0
    for vector in (
        list(_valid_vector()),
        _valid_vector()[:-1],
        _valid_vector() + (0.0,),
        (False,) + _valid_vector()[1:],
        (np.float64(0.0),) + _valid_vector()[1:],
        (np.int64(0),) + _valid_vector()[1:],
        (float("nan"),) + _valid_vector()[1:],
        (float("inf"),) + _valid_vector()[1:],
        (2.0,) + _valid_vector()[1:],
    ):
        with pytest.raises(ValueError):
            predict_persona_cluster(snapshot, vector)
    with pytest.raises(ValueError):
        predict_persona_cluster(replace(snapshot, selected_k=True), _valid_vector())
