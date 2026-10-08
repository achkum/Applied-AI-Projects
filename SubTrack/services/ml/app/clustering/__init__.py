"""Offline clustering primitives for scoped, prebuilt feature matrices."""

from app.clustering.core import PersonaClusterer
from app.clustering.descriptors import DescriptorClusteringResult, cluster_descriptors

__all__ = ["DescriptorClusteringResult", "PersonaClusterer", "cluster_descriptors"]
