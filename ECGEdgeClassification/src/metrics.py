"""
Metrics used in every evaluation: accuracy, macro F1 and per-class precision, recall and F1.
Also saves confusion matrices as a table and as a figure.
"""
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support

CLASSES = ["N", "S", "V", "F"]


def compute_metrics(y_true, y_pred):
    """Return a dict with accuracy, macro_f1 and precision / recall / f1 for each class."""
    labels = list(range(len(CLASSES)))
    precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, labels=labels, zero_division=0)
    result = {"accuracy": float(np.mean(y_true == y_pred)), "macro_f1": float(f1.mean())}
    for i, name in enumerate(CLASSES):
        result[f"{name}_precision"] = float(precision[i])
        result[f"{name}_recall"] = float(recall[i])
        result[f"{name}_f1"] = float(f1[i])
    return result


def metrics_from_confusion(cm):
    """Same metrics, but computed from a confusion matrix (rows = true class, columns = predicted)."""
    cm = np.asarray(cm)
    y_true = np.repeat(np.arange(len(CLASSES)), cm.sum(axis=1))
    y_pred = np.concatenate([np.repeat(np.arange(len(CLASSES)), row) for row in cm])
    return compute_metrics(y_true, y_pred)


def save_confusion_matrix(y_true, y_pred, path_without_extension, title):
    """Save the confusion matrix as .csv and as .png."""
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(CLASSES))))
    np.savetxt(path_without_extension + ".csv", cm, fmt="%d", delimiter=",",
               header="rows: true " + " ".join(CLASSES) + "; columns: predicted", comments="")

    fig, ax = plt.subplots(figsize=(4.2, 3.8))
    ax.imshow(cm, cmap="Blues")
    for i in range(len(CLASSES)):
        for j in range(len(CLASSES)):
            color = "white" if cm[i, j] > cm.max() / 2 else "black"
            ax.text(j, i, f"{cm[i, j]:,}", ha="center", va="center", color=color, fontsize=9)
    ax.set_xticks(range(len(CLASSES)), CLASSES)
    ax.set_yticks(range(len(CLASSES)), CLASSES)
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(title, fontsize=10)
    fig.tight_layout()
    fig.savefig(path_without_extension + ".png", dpi=200)
    plt.close(fig)
    return cm


def append_metrics_row(csv_path, row):
    """Add one result row to results/metrics.csv (creates the file with a header if needed)."""
    table = pd.DataFrame([row])
    if os.path.exists(csv_path):
        table = pd.concat([pd.read_csv(csv_path), table], ignore_index=True)
    table.to_csv(csv_path, index=False, float_format="%.4f")
