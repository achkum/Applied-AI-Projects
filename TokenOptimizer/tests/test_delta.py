from token_optimizer.normalize.delta import DeltaStore

MODEL = "gpt-4o"


def make_file(n_lines, marker="x"):
    return "\n".join(f"line {i} {marker}" for i in range(n_lines)) + "\n"


def test_first_send_returns_unchanged():
    store = DeltaStore()
    text = make_file(200)
    out, change = store.process("f|sess", text, MODEL)
    assert out == text
    assert change is None


def test_small_edit_yields_small_diff():
    store = DeltaStore()
    v1 = make_file(200)
    store.process("f|sess", v1, MODEL)
    v2 = v1.replace("line 100 x", "line 100 EDITED")
    out, change = store.process("f|sess", v2, MODEL)
    assert out.startswith("[delta vs previously sent f|sess]")
    assert change is not None and change.kind == "delta_encode"
    assert "EDITED" in out
    assert len(out) < len(v2)


def test_third_send_diffs_against_second_version():
    store = DeltaStore()
    v1 = make_file(200)
    store.process("f|sess", v1, MODEL)
    v2 = v1.replace("line 10 x", "line 10 SECOND")
    store.process("f|sess", v2, MODEL)
    v3 = v2.replace("line 20 x", "line 20 THIRD")
    out, change = store.process("f|sess", v3, MODEL)
    # The diff must be against v2: it should reference the THIRD change, not re-include SECOND.
    assert "THIRD" in out
    assert "SECOND" not in out  # v2's edit is already in the baseline, so it's not in the diff
    assert change is not None


def test_full_rewrite_falls_back_to_full_text():
    store = DeltaStore()
    v1 = make_file(200, marker="x")
    store.process("f|sess", v1, MODEL)
    v2 = make_file(200, marker="completely-different-content-token")
    out, change = store.process("f|sess", v2, MODEL)
    assert out == v2
    assert change is None


def test_lru_eviction():
    store = DeltaStore(max_files=2)
    store.process("a", make_file(5), MODEL)
    store.process("b", make_file(5), MODEL)
    store.process("c", make_file(5), MODEL)  # evicts "a"
    # "a" was evicted, so it is treated as first-sight again (returns unchanged, no diff).
    out, change = store.process("a", make_file(5, marker="z"), MODEL)
    assert change is None
    assert out == make_file(5, marker="z")
