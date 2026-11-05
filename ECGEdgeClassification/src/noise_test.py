"""
Noise robustness test on the DS2 test records (report section 5.4).

Real noise from the Noise Stress Test Database (bw, ma, em and their mix) is added to the
raw DS2 signal at 12, 6 and 0 dB. The noisy signal then goes through the identical
preprocessing, and the frozen FP32 model and its INT8 version are evaluated.
Nothing here is used for training or model selection.

    python src/noise_test.py --run results/runs/edge_cnn

Writes results/noise_results.csv, results/noise_results.png and results/errors/noise_0dB.png.
"""
import argparse
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import yaml

from ecg_noise import add_noise, load_noise
from evaluate import load_model, load_split, make_loader
from metrics import CLASSES, compute_metrics
from prepare_data import BEAT_SYMBOLS, load_config, process_signal, read_record
from quantize import activation_ranges, quantized_copy
from train import predict

NOISE_NAMES = {"bw": "baseline wander", "ma": "muscle artefact", "em": "electrode motion", "mix": "mix"}


def noisy_test_set(records, cfg, noise, snr_db, rng):
    """All DS2 beats after adding noise to every record (noise=None gives the clean beats)."""
    X_all, y_all = [], []
    for signal, fs, samples, symbols in records:
        if noise is not None:
            beats = samples[np.isin(symbols, list(BEAT_SYMBOLS))]
            signal = add_noise(signal, beats, noise, snr_db, fs, rng)
        X, y, _ = process_signal(signal, fs, samples, symbols, cfg)
        X_all.append(X)
        y_all.append(y)
    return np.concatenate(X_all), np.concatenate(y_all)


def plot_results(table, path):
    conditions = ["clean", "12", "6", "0"]
    fig, axes = plt.subplots(1, 2, figsize=(10, 3.6))
    clean = table[table.noise == "clean"]
    for kind, label in NOISE_NAMES.items():
        rows = pd.concat([clean, table[table.noise == kind]])
        for precision, style in [("FP32", "-"), ("INT8", "--")]:
            values = rows[rows.precision == precision].set_index("snr_db").loc[conditions, "macro_f1"]
            axes[0].plot(conditions, values, style, marker="o", label=f"{label} ({precision})" if precision == "FP32" else None,
                         color=f"C{list(NOISE_NAMES).index(kind)}")
    axes[0].set_title("Macro F1 vs SNR (solid FP32, dashed INT8)")
    axes[0].set_xlabel("SNR (dB)")
    axes[0].legend(fontsize=7)
    mix = pd.concat([clean, table[table.noise == "mix"]])
    mix = mix[mix.precision == "FP32"].set_index("snr_db").loc[conditions]
    for name in CLASSES:
        axes[1].plot(conditions, mix[f"{name}_recall"], marker="o", label=f"{name} recall")
    axes[1].set_title("Per-class recall vs SNR, mixed noise, FP32")
    axes[1].set_xlabel("SNR (dB)")
    axes[1].legend(fontsize=7)
    for ax in axes:
        ax.set_ylim(0, 1)
        ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def plot_noise_errors(X_clean, X_noisy, y, pred_clean, pred_noisy, path):
    """Beats classified correctly when clean but wrongly at 0 dB mixed noise."""
    broken = np.where((pred_clean == y) & (pred_noisy != y) & (y > 0))[0]
    chosen = np.random.default_rng(0).choice(broken, size=min(6, len(broken)), replace=False)
    time = (np.arange(256) - 160) / 128
    fig, axes = plt.subplots(2, 3, figsize=(11, 4.6), sharex=True, sharey=True)
    for ax, i in zip(axes.ravel(), chosen):
        ax.plot(time, X_clean[i, 0], color="#bbbbbb", lw=1.4, label="clean")
        ax.plot(time, X_noisy[i, 0], color="#2a78d6", lw=1.0, label="0 dB mix")
        ax.set_title(f"true {CLASSES[y[i]]}, predicted {CLASSES[pred_noisy[i]]} at 0 dB", fontsize=8)
    axes[0, 0].legend(fontsize=7, loc="upper left")
    for ax in axes[1]:
        ax.set_xlabel("s from beat")
    fig.suptitle(f"Beats correct when clean but wrong at 0 dB mixed noise ({len(broken):,} S/V/F beats)", fontsize=10)
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", default="results/runs/edge_cnn")
    args = parser.parse_args()
    cfg = load_config("configs/data.yaml")
    noise_cfg = yaml.safe_load(open("configs/noise.yaml"))

    model, train_cfg = load_model(args.run)
    X_calib, y_calib, _ = load_split("ds1_train", train_cfg["use_rr_channel"])
    calib_index = np.random.default_rng(0).choice(len(y_calib), size=4096, replace=False)
    int8_model = quantized_copy(model, 8, activation_ranges(model, make_loader(X_calib[calib_index], y_calib[calib_index])))
    models = {"FP32": model, "INT8": int8_model}

    records = [read_record(cfg["paths"]["mitdb"], r)[:4] for r in cfg["records"]["test"]]
    conditions = [("clean", None, "clean")]
    for kind in list(NOISE_NAMES):
        for snr in noise_cfg["snr_db"]:
            conditions.append((kind, kind, snr))

    rows, kept = [], {}
    for label, kind, snr in conditions:
        noise = load_noise(cfg["paths"]["nstdb"], kind, noise_cfg["noise_channel"], noise_cfg["eval_region"]) if kind else None
        rng = np.random.default_rng(noise_cfg["noise_seed"])
        X, y = noisy_test_set(records, cfg, noise, snr, rng)
        if not train_cfg["use_rr_channel"]:
            X[:, 1] = 0.0
        for precision, m in models.items():
            truth, prediction = predict(m, make_loader(X, y))
            result = compute_metrics(truth, prediction)
            rows.append({"noise": label, "snr_db": str(snr), "precision": precision, **result})
            print(f"{label:6s} {str(snr):5s} {precision}: accuracy {result['accuracy']:.4f}  macro F1 {result['macro_f1']:.4f}")
            if precision == "FP32" and (label == "clean" or (kind == "mix" and snr == 0)):
                kept[label] = (X, y, prediction)

    table = pd.DataFrame(rows)
    table.to_csv("results/noise_results.csv", index=False, float_format="%.4f")
    plot_results(table, "results/noise_results.png")
    os.makedirs("results/errors", exist_ok=True)
    plot_noise_errors(kept["clean"][0], kept["mix"][0], kept["clean"][1], kept["clean"][2], kept["mix"][2],
                      "results/errors/noise_0dB.png")


if __name__ == "__main__":
    main()
