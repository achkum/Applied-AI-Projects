"""Example ETL module used in the offline benchmark.

The docstrings stay (removing them would change the AST); only line comments and
blank-line runs are trimmed, so the result is ast-identical to the original.
"""

import csv
import json
from pathlib import Path


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------
def load_rows(path: Path) -> list[dict]:
    # Read a CSV file into a list of dict rows.
    with path.open(encoding="utf-8") as fh:
        # DictReader uses the header line for keys.
        return list(csv.DictReader(fh))


def total_revenue(rows: list[dict]) -> float:
    """Sum the `total` column across all rows."""
    # Cast each total to float; the CSV stores them as strings.
    return sum(float(r["total"]) for r in rows)


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------
def by_region(rows: list[dict]) -> dict:
    """Group revenue by region."""
    out: dict[str, float] = {}
    for r in rows:
        # Accumulate per-region totals.
        out[r["region"]] = out.get(r["region"], 0.0) + float(r["total"])
    return out


def main() -> None:
    rows = load_rows(Path("sales.csv"))
    # Print a small JSON summary to stdout.
    print(json.dumps({"revenue": total_revenue(rows), "by_region": by_region(rows)}))


if __name__ == "__main__":
    main()
