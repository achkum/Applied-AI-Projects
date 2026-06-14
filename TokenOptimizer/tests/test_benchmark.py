import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import benchmark  # noqa: E402

FIXTURES = ROOT / "scripts" / "fixtures"


def test_benchmark_runs_clean(capsys):
    assert benchmark.main([str(FIXTURES)]) == 0
    out = capsys.readouterr().out
    assert "File" in out and "Before" in out and "After" in out and "Saved" in out
    assert "TOTAL" in out


def test_benchmark_missing_dir_fails(capsys):
    assert benchmark.main([str(ROOT / "scripts" / "does-not-exist")]) == 1
    assert "No such directory" in capsys.readouterr().err
