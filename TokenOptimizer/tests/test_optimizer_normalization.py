import json

from token_saver.ledger import Ledger
from token_saver.normalize.delta import DeltaStore
from token_saver.optimizer import Attachment, normalize_attachments
from token_saver.types import OptimizerConfig

CONFIG = OptimizerConfig(model="gpt-4o")

BOILERPLATE = (
    "This standard boilerplate notice appears verbatim in multiple attached documents and "
    "carries no per-document information whatsoever, so it should only ever be sent one single "
    "time across the entire request payload rather than once for every document that happens to "
    "embed the very same legal language word for word in its body."
)


def run(attachments, session_id="sess", delta_store=None):
    ledger = Ledger()
    store = delta_store or DeltaStore()
    texts, result = normalize_attachments(attachments, session_id, CONFIG, store, ledger)
    return texts, result, ledger


def test_end_to_end_positive_savings_and_changes():
    pretty = json.dumps({"name": "alice", "values": list(range(20)), "nested": {"a": 1}}, indent=4)
    doc_a = f"Intro for A.\n\n{BOILERPLATE}\n\ntail A"
    doc_b = f"Intro for B.\n\n{BOILERPLATE}\n\ntail B"
    attachments = [
        Attachment("data.json", pretty.encode()),
        Attachment("a.txt", doc_a.encode()),
        Attachment("b.txt", doc_b.encode()),
    ]
    texts, result, ledger = run(attachments)
    assert result.tokens_saved > 0
    assert result.feature == "normalization"
    assert len(result.changes) > 0
    # JSON minified.
    assert json.loads(texts["data.json"]) == json.loads(pretty)
    # Boilerplate deduped: kept once across the two text docs.
    full = texts["a.txt"].count("standard boilerplate notice") + texts["b.txt"].count(
        "standard boilerplate notice"
    )
    assert full == 1
    # Ledger reflects the feature.
    assert ledger.totals()["by_feature"]["normalization"] == result.tokens_saved


def test_resent_file_delta_encoded():
    store = DeltaStore()
    big = "\n".join(f"row {i} of the configuration file" for i in range(150)) + "\n"
    run([Attachment("config.txt", big.encode())], delta_store=store)
    edited = big.replace("row 75 of the configuration file", "row 75 CHANGED")
    texts, _, _ = run([Attachment("config.txt", edited.encode())], delta_store=store)
    assert texts["config.txt"].startswith("[delta vs previously sent config.txt|sess]")


def test_raising_normalizer_does_not_crash(monkeypatch):
    import token_saver.optimizer as opt

    def boom(*args, **kwargs):
        raise RuntimeError("normalizer exploded")

    monkeypatch.setattr(opt._JSON_YAML, "normalize", boom)
    pretty = json.dumps({"a": 1, "b": [1, 2, 3]}, indent=2)
    texts, result, _ = run([Attachment("data.json", pretty.encode())])
    # The run completes; the JSON is just left unnormalized.
    assert "data.json" in texts
    assert result.feature == "normalization"
