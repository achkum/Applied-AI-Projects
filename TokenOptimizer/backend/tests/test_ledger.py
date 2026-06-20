from concurrent.futures import ThreadPoolExecutor

from tokenoptim.core.ledger import Ledger
from tokenoptim.core.types import Change, OptimizationResult


def make_result(feature="normalization", before=100, after=70):
    return OptimizationResult(
        feature=feature,
        tokens_before=before,
        tokens_after=after,
        changes=[Change("k", "d", before - after)],
    )


def test_record_accumulates():
    led = Ledger()
    led.record(make_result(before=100, after=70))
    led.record(make_result(feature="compression", before=50, after=40))
    t = led.totals()
    assert t["tokens_saved"] == 40
    assert t["tokens_processed"] == 150
    assert t["by_feature"] == {"normalization": 30, "compression": 10}
    assert t["calls"] == 0


def test_record_call_increments_calls_once():
    led = Ledger()
    led.record_call([make_result(), make_result(feature="cache_optimization", before=10, after=10)])
    t = led.totals()
    assert t["calls"] == 1
    assert t["tokens_saved"] == 30


def test_reset():
    led = Ledger()
    led.record(make_result())
    led.reset()
    assert led.totals() == {
        "tokens_saved": 0,
        "tokens_processed": 0,
        "by_feature": {},
        "calls": 0,
    }


def test_concurrent_records_are_exact():
    led = Ledger()

    def worker():
        for _ in range(1000):
            led.record(make_result(before=10, after=7))

    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = [ex.submit(worker) for _ in range(8)]
        for f in futures:
            f.result()

    t = led.totals()
    assert t["tokens_saved"] == 8 * 1000 * 3
    assert t["tokens_processed"] == 8 * 1000 * 10
    assert t["by_feature"]["normalization"] == 8 * 1000 * 3
