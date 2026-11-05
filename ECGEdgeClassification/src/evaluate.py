"""
Evaluate a trained CNN: accuracy, macro F1, per-class metrics and the confusion matrix.

    python src/evaluate.py --run results/runs/edge_cnn            # DS1 validation records
    python src/evaluate.py --run results/runs/edge_cnn --final    # DS2 test records, run once

With --final the misclassified beats are also saved as figures in results/errors/
for the error analysis (report section 5.5).
"""
import argparse
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader, TensorDataset

from metrics import CLASSES, append_metrics_row, compute_metrics, save_confusion_matrix
from model import ECGNet, count_parameters
from train import predict


def load_model(run_dir):
    cfg = json.load(open(os.path.join(run_dir, "config.json")))
    model = ECGNet(cfg["model_size"])
    model.load_state_dict(torch.load(os.path.join(run_dir, "model.pt")))
    model.eval()
    return model, cfg


def load_split(split, use_rr_channel=True):
    """Return X, y and the record / sample / rr_ratio arrays of one processed split."""
    data = np.load(f"data/processed/{split}.npz", allow_pickle=True)
    X = data["X"].astype(np.float32)
    if not use_rr_channel:
        X[:, 1] = 0.0
    return X, data["y"], data


def make_loader(X, y):
    return DataLoader(TensorDataset(torch.from_numpy(X), torch.from_numpy(y)), batch_size=1024)


def save_error_examples(X, y, prediction, data, out_dir):
    """Plot six misclassified beats of each error type over the mean beat of the true class."""
    os.makedirs(out_dir, exist_ok=True)
    time = (np.arange(256) - 160) / 128
    error_types = [("N_as_S", 0, 1), ("S_as_N", 1, 0), ("V_as_other", 2, None), ("F_as_other", 3, None)]
    rows = []
    for name, true_class, predicted_class in error_types:
        wrong = (y == true_class) & (prediction != true_class)
        if predicted_class is not None:
            wrong &= prediction == predicted_class
        indices = np.where(wrong)[0]
        chosen = np.random.default_rng(0).choice(indices, size=min(6, len(indices)), replace=False)
        mean_beat = X[y == true_class, 0].mean(axis=0)

        fig, axes = plt.subplots(2, 3, figsize=(11, 4.6), sharex=True, sharey=True)
        for ax, i in zip(axes.ravel(), chosen):
            ax.plot(time, mean_beat, color="#bbbbbb", lw=1.4, label=f"mean {CLASSES[true_class]}")
            ax.plot(time, X[i, 0], color="#2a78d6", lw=1.0, label="this beat")
            ax.set_title(f"record {data['record'][i]}, RR ratio {data['rr_ratio'][i]:.2f}, "
                         f"predicted {CLASSES[prediction[i]]}", fontsize=8)
            rows.append({"error": name, "record": data["record"][i], "sample": data["sample"][i],
                         "symbol": data["symbol"][i], "rr_ratio": round(float(data["rr_ratio"][i]), 3),
                         "true": CLASSES[true_class], "predicted": CLASSES[prediction[i]]})
        axes[0, 0].legend(fontsize=7, loc="upper left")
        for ax in axes[1]:
            ax.set_xlabel("s from beat")
        fig.suptitle(f"{name.replace('_', ' ')}: {len(indices):,} of {int((y == true_class).sum()):,} "
                     f"{CLASSES[true_class]} beats", fontsize=10)
        fig.tight_layout()
        fig.savefig(os.path.join(out_dir, f"{name}.png"), dpi=200)
        plt.close(fig)
    pd.DataFrame(rows).to_csv(os.path.join(out_dir, "error_examples.csv"), index=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", default="results/runs/edge_cnn")
    parser.add_argument("--final", action="store_true", help="evaluate on the DS2 test records (run once)")
    args = parser.parse_args()

    model, cfg = load_model(args.run)
    split = "test" if args.final else "validation"
    X, y, data = load_split("ds2_test" if args.final else "ds1_val", cfg["use_rr_channel"])
    truth, prediction = predict(model, make_loader(X, y))

    result = compute_metrics(truth, prediction)
    name = os.path.basename(args.run)
    save_confusion_matrix(truth, prediction, f"results/confusion_matrix_{name}_FP32_{split}", f"{name} FP32, {split}")
    append_metrics_row("results/metrics.csv", {"model": name, "precision": "FP32", "split": split,
                                               "parameters": count_parameters(model), **result})
    print(f"{name} on {split}: accuracy {result['accuracy']:.4f}, macro F1 {result['macro_f1']:.4f}")
    for c in CLASSES:
        print(f"  {c}: precision {result[c + '_precision']:.3f}  recall {result[c + '_recall']:.3f}  F1 {result[c + '_f1']:.3f}")

    if args.final:
        save_error_examples(X, y, prediction, data, "results/errors")


if __name__ == "__main__":
    main()
