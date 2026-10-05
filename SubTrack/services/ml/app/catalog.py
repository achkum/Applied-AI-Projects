"""Loads merchants.yaml from packages/catalog and exposes (alias, category) pairs."""

from __future__ import annotations

import pathlib
from functools import lru_cache
from typing import Any

import yaml

def _catalog_path() -> pathlib.Path:
    module = pathlib.Path(__file__).resolve()
    candidates = [module.parent.parent / "data" / "merchants.yaml"]
    candidates.extend(
        parent / "packages" / "catalog" / "data" / "merchants.yaml"
        for parent in module.parents
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    searched = ", ".join(str(path) for path in candidates)
    raise FileNotFoundError(f"merchant catalog not found; searched: {searched}")


@lru_cache(maxsize=1)
def _load_merchants() -> list[dict[str, Any]]:
    with _catalog_path().open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)  # type: ignore[return-value]


def get_alias_category_pairs() -> list[tuple[str, str]]:
    """Return [(alias_text, category_code), ...] for every alias in the catalog."""
    pairs: list[tuple[str, str]] = []
    for merchant in _load_merchants():
        category: str = merchant.get("category", "OTHER")
        for alias in merchant.get("aliases", []):
            pairs.append((str(alias), category))
    return pairs


def get_canonical_names() -> list[tuple[str, str]]:
    """Return [(canonical_name, category_code), ...] for every merchant."""
    return [
        (str(m["canonical_name"]), str(m.get("category", "OTHER")))
        for m in _load_merchants()
    ]
