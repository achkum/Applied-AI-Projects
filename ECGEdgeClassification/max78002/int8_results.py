"""
Read the confusion matrix printed by ai8x-training (train.py --evaluate -8) and
turn it into the same metrics as the rest of the project.

    python max78002/int8_results.py max78002/quantization_output/int8_eval_test.log test

Adds a row "edge_cnn / INT8 (QAT)" to results/metrics.csv and saves the confusion matrix.
"""
import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from metrics import CLASSES, append_metrics_row, metrics_from_confusion, save_confusion_matrix  # noqa: E402

log_path, split = sys.argv[1], sys.argv[2]
text = open(log_path).read()
block = text[text.rfind("Confusion:"):]
cm = np.array([[int(v) for v in re.findall(r"\d+", line)] for line in block.splitlines()[1:5]])

y_true = np.repeat(np.arange(len(CLASSES)), cm.sum(axis=1))
y_pred = np.concatenate([np.repeat(np.arange(len(CLASSES)), row) for row in cm])
save_confusion_matrix(y_true, y_pred, f"results/confusion_matrix_edge_cnn_INT8-QAT_{split}", f"edge_cnn INT8 (QAT), {split}")
result = metrics_from_confusion(cm)
append_metrics_row("results/metrics.csv", {"model": "edge_cnn", "precision": "INT8 (QAT)", "split": split,
                                           "parameters": 10004, **result})
print(f"INT8 (QAT) on {split}: accuracy {result['accuracy']:.4f}, macro F1 {result['macro_f1']:.4f}")
