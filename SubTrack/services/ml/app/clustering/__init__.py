"""Offline clustering primitives for scoped, prebuilt feature matrices."""

from app.clustering.core import PersonaClusterer
from app.clustering.centroid_descriptions import CentroidDescription, describe_persona_centroids
from app.clustering.descriptors import DescriptorClusteringResult, cluster_descriptors

__all__ = [
    "CentroidDescription",
    "DescriptorClusteringResult",
    "PersonaClusterer",
    "cluster_descriptors",
    "describe_persona_centroids",
]
