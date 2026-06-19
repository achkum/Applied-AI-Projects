from token_optimizer.normalize.dedup import dedup_chunks

MODEL = "gpt-4o"

DISCLAIMER = (
    "This document and any attachments are confidential and intended solely for the "
    "addressee. If you have received this message in error please notify the sender "
    "immediately and permanently delete every copy from your systems without reading it."
)


def test_same_disclaimer_in_three_docs_kept_once():
    docs = {
        "a.txt": f"Intro paragraph for A.\n\n{DISCLAIMER}\n\nBody of A.",
        "b.txt": f"Intro for B.\n\n{DISCLAIMER}\n\nBody of B.",
        "c.txt": f"Intro for C.\n\n{DISCLAIMER}\n\nBody of C.",
    }
    out, changes = dedup_chunks(docs, MODEL)
    full_count = sum(out[name].count("confidential and intended") for name in out)
    assert full_count == 1  # kept verbatim exactly once
    ref_count = sum(out[name].count("[¶ identical to ¶") for name in out)
    assert ref_count == 2
    assert len(changes) == 2


def test_short_repeats_untouched():
    docs = {
        "a.txt": "short shared line\n\nunique a",
        "b.txt": "short shared line\n\nunique b",
    }
    out, changes = dedup_chunks(docs, MODEL)
    assert out["a.txt"].count("short shared line") == 1
    assert out["b.txt"].count("short shared line") == 1
    assert changes == []


def test_code_fences_never_deduped():
    block = f"```\n{DISCLAIMER}\n```"
    docs = {
        "a.md": f"text\n\n{block}",
        "b.md": f"text\n\n{block}",
    }
    out, _ = dedup_chunks(docs, MODEL)
    # The fenced copy is preserved verbatim in both documents.
    assert out["a.md"].count("confidential and intended") == 1
    assert out["b.md"].count("confidential and intended") == 1


def test_deterministic():
    docs = {
        "z.txt": f"z intro\n\n{DISCLAIMER}",
        "a.txt": f"a intro\n\n{DISCLAIMER}",
    }
    out1, _ = dedup_chunks(docs, MODEL)
    out2, _ = dedup_chunks(docs, MODEL)
    assert out1 == out2
    # First alphabetically (a.txt) keeps the verbatim copy.
    assert "confidential and intended" in out1["a.txt"]
    assert "[¶ identical to ¶" in out1["z.txt"]
