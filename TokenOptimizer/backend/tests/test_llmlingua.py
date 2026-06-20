from pathlib import Path

import pytest
from tokenoptim.compress.llmlingua import LLMLingua2, select_compressed

MODEL_DIR = Path(__file__).resolve().parents[2] / ".models" / "llmlingua2-bert"

USER_TEXT = (
    "Hope you are doing well! We have an urgent requirement for the following position. "
    "Location: Jonkoping, Sweden. Start: September 2026. Hardware Lead Engineer - Embedded "
    "Systems & Hardware Strategy. The consultant will act as the bridge between product "
    "development, hardware design, and software teams."
)


# --- pure selection logic (no model) ---

def test_select_keeps_top_scoring_words_in_order():
    words = ["the", "important", "filler", "term"]
    scores = [0.1, 0.9, 0.2, 0.8]
    assert select_compressed(words, scores, 0.5, force_digits=False) == "important term"


def test_select_force_keeps_digits():
    words = ["hello", "2026", "world"]
    scores = [0.9, 0.0, 0.1]
    # rate keeps only "hello", but the digit token is force-kept.
    assert select_compressed(words, scores, 0.34) == "hello 2026"


def test_select_empty():
    assert select_compressed([], [], 0.5) == ""


def test_select_always_keeps_at_least_one():
    out = select_compressed(["a", "b", "c"], [0.0, 0.0, 0.0], 0.01, force_digits=False)
    assert len(out.split()) >= 1


# --- real model (opt-in; skipped where the model isn't downloaded, e.g. CI) ---

@pytest.mark.slow
def test_real_model_compresses_and_keeps_key_info():
    if not (MODEL_DIR / "model.int8.onnx").exists() and not (MODEL_DIR / "model.onnx").exists():
        pytest.skip("LLMLingua-2 model not downloaded (run scripts/quantize_model.py)")
    out = LLMLingua2(MODEL_DIR).compress(USER_TEXT, rate=0.6)
    assert out["words_after"] < out["words_before"]  # actually compressed
    for keyword in ("Jonkoping", "Sweden", "September", "2026", "Engineer"):
        assert keyword in out["text"], f"dropped key info: {keyword}"
