"""Offline benchmark: normalize sample files and print a token-savings table.

No API calls. Prompt compression needs the model service, so it's not part of this offline
benchmark. Usage: ``python scripts/benchmark.py scripts/fixtures``
"""

import sys
from pathlib import Path

from app.core.ledger import Ledger
from app.core.types import OptimizerConfig
from app.normalize.delta import DeltaStore
from app.optimizer import Attachment, normalize_attachments

MODEL = "gpt-4o"
PROMPTS_FILE = "prompts.txt"


def _pct(before: int, after: int) -> float:
    return 0.0 if before == 0 else (before - after) / before * 100


def run(fixtures_dir: Path) -> list[tuple[str, int, int]]:
    config = OptimizerConfig(model=MODEL)
    rows: list[tuple[str, int, int]] = []

    files = sorted(
        f for f in fixtures_dir.iterdir() if f.is_file() and f.name != PROMPTS_FILE
    )
    for path in files:
        _, result = normalize_attachments(
            [Attachment(path.name, path.read_bytes())], "bench", config, DeltaStore(), Ledger()
        )
        rows.append((path.name, result.tokens_before, result.tokens_after))

    return rows


def print_table(rows: list[tuple[str, int, int]]) -> None:
    name_w = max([len(r[0]) for r in rows] + [len("File")])
    print(f"{'File':<{name_w}}  {'Before':>8}  {'After':>8}  {'Saved':>7}")
    print(f"{'-' * name_w}  {'-' * 8}  {'-' * 8}  {'-' * 7}")
    total_before = total_after = 0
    for name, before, after in rows:
        print(f"{name:<{name_w}}  {before:>8}  {after:>8}  {_pct(before, after):>6.1f}%")
        total_before += before
        total_after += after
    print(f"{'-' * name_w}  {'-' * 8}  {'-' * 8}  {'-' * 7}")
    print(
        f"{'TOTAL':<{name_w}}  {total_before:>8}  {total_after:>8}  "
        f"{_pct(total_before, total_after):>6.1f}%"
    )


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    fixtures_dir = Path(argv[0]) if argv else Path(__file__).parent / "fixtures"
    if not fixtures_dir.is_dir():
        print(f"No such directory: {fixtures_dir}", file=sys.stderr)
        return 1
    print_table(run(fixtures_dir))
    return 0


if __name__ == "__main__":
    sys.exit(main())
