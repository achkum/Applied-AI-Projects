"""
Simple baseline: a random forest on hand-made features of each beat.

Features: every 4th sample of the ECG window (64 values) and the RR ratio (1 value).

    python src/baseline.py            # train on DS1 train, report on DS1 validation
    python src/baseline.py --final    # also report once on the DS2 test records

Writes results/baseline/ and one row per split to results/metrics.csv.
"""
import argparse
import json
import os

import numpy as np
from sklearn.ensemble import RandomForestClassifier

from metrics import append_metrics_row, compute_metrics, save_confusion_matrix


def load_features(path):
    data = np.load(path)
    X = np.concatenate([data["X"][:, 0, ::4], data["X"][:, 1, :1]], axis=1)
    return X, data["y"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--final", action="store_true", help="evaluate on the DS2 test records (run once)")
    args = parser.parse_args()
    os.makedirs("results/baseline", exist_ok=True)

    X_train, y_train = load_features("data/processed/ds1_train.npz")
    model = RandomForestClassifier(n_estimators=200, class_weight="balanced", random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)
    n_nodes = sum(tree.tree_.node_count for tree in model.estimators_)

    splits = [("validation", "data/processed/ds1_val.npz")]
    if args.final:
        splits.append(("test", "data/processed/ds2_test.npz"))
    for split, path in splits:
        X, y = load_features(path)
        prediction = model.predict(X)
        result = compute_metrics(y, prediction)
        save_confusion_matrix(y, prediction, f"results/baseline/confusion_matrix_{split}", f"Random forest, {split}")
        json.dump(result, open(f"results/baseline/metrics_{split}.json", "w"), indent=2)
        append_metrics_row("results/metrics.csv", {"model": "random_forest", "precision": "FP32", "split": split,
                                                   "parameters": n_nodes, **result})
        print(f"{split}: accuracy {result['accuracy']:.4f}, macro F1 {result['macro_f1']:.4f}")
    print(f"forest size: {n_nodes:,} tree nodes")


if __name__ == "__main__":
    main()
