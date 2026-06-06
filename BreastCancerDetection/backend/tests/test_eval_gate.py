"""Model eval gate. Runs the REAL model (never mocked) over a small labelled fixture set and
asserts discrimination stays above threshold. Skips automatically when no trained weights or
fixtures are present, so ordinary CI is unaffected; the eval-gate workflow supplies both.

Fixtures: a directory (EVAL_FIXTURES_DIR, default tests/fixtures) with image files and a
labels.csv of columns `filename,class,label` (label: 0=benign, 1=malignant).
"""

import csv
import os

import pytest
from sklearn.metrics import roc_auc_score

from app.model import inference

MIN_AUC = 0.85
FIXTURES_DIR = os.environ.get(
    "EVAL_FIXTURES_DIR", os.path.join(os.path.dirname(__file__), "fixtures")
)
LABELS_CSV = os.path.join(FIXTURES_DIR, "labels.csv")


def load_fixtures() -> list[tuple[str, int]]:
    with open(LABELS_CSV, newline="") as f:
        return [(row["filename"], int(row["label"])) for row in csv.DictReader(f)]


@pytest.mark.skipif(not inference.WEIGHTS_LOADED, reason="no trained weights loaded")
@pytest.mark.skipif(not os.path.exists(LABELS_CSV), reason="no eval fixtures present")
def test_model_auc_above_threshold():
    rows = load_fixtures()
    assert rows, "labels.csv is empty"

    y_true, y_prob = [], []
    for filename, label in rows:
        with open(os.path.join(FIXTURES_DIR, filename), "rb") as f:
            result = inference.predict(f.read())
        y_true.append(label)
        y_prob.append(result.probability_malignant)

    auc = roc_auc_score(y_true, y_prob)
    assert auc > MIN_AUC, f"Model AUC {auc:.4f} fell below the {MIN_AUC} eval gate"
