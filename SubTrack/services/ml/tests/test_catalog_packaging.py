import importlib.util
import shutil
from pathlib import Path

import pytest


def _load_catalog_module(app_dir):
    spec = importlib.util.spec_from_file_location("packaged_catalog", app_dir / "catalog.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_shallow_docker_app_loads_bundled_catalog(tmp_path):
    app_dir = tmp_path / "app"
    app_dir.mkdir()
    shutil.copy2(Path(__file__).parents[1] / "app" / "catalog.py", app_dir / "catalog.py")
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "merchants.yaml").write_text(
        "- canonical_name: Example\n  category: OTHER\n  aliases: [example alias]\n",
        encoding="utf-8",
    )

    catalog = _load_catalog_module(app_dir)

    assert catalog.get_alias_category_pairs() == [("example alias", "OTHER")]
    assert catalog.get_canonical_names() == [("Example", "OTHER")]


def test_shallow_docker_app_reports_missing_bundled_catalog(tmp_path):
    app_dir = tmp_path / "app"
    app_dir.mkdir()
    shutil.copy2(Path(__file__).parents[1] / "app" / "catalog.py", app_dir / "catalog.py")

    catalog = _load_catalog_module(app_dir)

    with pytest.raises(FileNotFoundError, match="merchant catalog not found"):
        catalog.get_canonical_names()
