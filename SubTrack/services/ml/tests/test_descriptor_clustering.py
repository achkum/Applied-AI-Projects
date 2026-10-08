"""Offline tests for synthetic descriptor clustering."""

from dataclasses import FrozenInstanceError, fields

import pytest

from app.clustering import DescriptorClusteringResult, cluster_descriptors


def synthetic_descriptors() -> list[str]:
    return [
        "acme cloud plan monthly", "acme cloud plan family", "acme cloud plan plus",
        "nimbus video monthly plan", "nimbus video family plan", "nimbus video plus plan",
        "single unrelated token qzxv",
    ]


def test_clusters_synthetic_groups_and_reports_only_counts() -> None:
    result = cluster_descriptors(synthetic_descriptors())
    assert result.sample_count == 7
    assert result.cluster_count == 2
    assert result.noise_count == 1
    assert result.labels[-1] == -1
    assert set(result.labels[:-1]) == {0, 1}
    assert isinstance(result.labels, tuple)
    assert {field.name for field in fields(result)} == {
        "labels", "sample_count", "cluster_count", "noise_count"
    }
    assert "acme cloud" not in repr(result)


def test_repeats_are_valid_and_same_order_is_deterministic() -> None:
    data = synthetic_descriptors()
    data.insert(1, data[0])
    first = cluster_descriptors(data)
    second = cluster_descriptors(data)
    assert first == second
    assert first.sample_count == 8


def test_result_is_frozen_and_slotted() -> None:
    result = DescriptorClusteringResult((0, -1), 2, 1, 1)
    with pytest.raises(FrozenInstanceError):
        result.sample_count = 3  # type: ignore[misc]
    assert not hasattr(result, "__dict__")


@pytest.mark.parametrize("bad", [None, "abc", [], {}, ("x",), [""], [1], [None]])
def test_rejects_malformed_or_empty_descriptor_inputs(bad: object) -> None:
    with pytest.raises(ValueError):
        cluster_descriptors(bad)  # type: ignore[arg-type]


def test_rejects_input_bounds_empty_vocabulary_and_degenerate_rows() -> None:
    with pytest.raises(ValueError, match="2000"):
        cluster_descriptors(["x"] * 2001)
    with pytest.raises(ValueError, match="256"):
        cluster_descriptors(["x" * 257, "y"])
    with pytest.raises(ValueError, match="character n-grams"):
        cluster_descriptors(["   ", "\t\n"], min_cluster_size=2)
    with pytest.raises(ValueError, match="identical"):
        cluster_descriptors(["same descriptor", "same descriptor"], min_cluster_size=2)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"min_cluster_size": True}, {"min_samples": False},
        {"min_cluster_size": 2.0}, {"min_samples": "2"},
        {"min_cluster_size": 1}, {"min_samples": 0},
        {"min_cluster_size": 8}, {"min_samples": 8},
    ],
)
def test_rejects_bad_clustering_parameters(kwargs: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        cluster_descriptors(synthetic_descriptors(), **kwargs)  # type: ignore[arg-type]
