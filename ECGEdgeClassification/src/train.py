"""
Train the edge CNN on the DS1 training records and pick the best epoch on the DS1 validation records.

    python src/train.py --tag edge_cnn                      # settings from configs/train.yaml
    python src/train.py --tag no_weights --loss ce          # variants used for model selection
    python src/train.py --tag large --size large

Writes results/runs/<tag>/: model.pt, history.csv, val_metrics.json, config.json.
The test records (DS2) are never read here.
"""
import argparse
import json
import os
import random
import time

import numpy as np
import pandas as pd
import torch
import yaml
from torch import nn
from torch.utils.data import DataLoader, Dataset

from dataset import Augmenter, class_weights
from metrics import compute_metrics
from model import ECGNet, count_parameters


class Beats(Dataset):
    """Beats from one .npz file. Augmentation is only switched on for the training split."""

    def __init__(self, path, augment, use_rr_channel):
        data = np.load(path)
        self.X = data["X"]
        self.y = data["y"]
        if not use_rr_channel:
            self.X[:, 1] = 0.0          # variant without timing information
        self.augmenter = Augmenter(p=0.5, seed=42) if augment else None

    def __len__(self):
        return len(self.y)

    def __getitem__(self, i):
        x = self.X[i]
        if self.augmenter is not None:
            x = self.augmenter(x)
        return torch.from_numpy(np.array(x, dtype=np.float32)), int(self.y[i])


def focal_loss(logits, targets, gamma):
    """Cross-entropy that gives less weight to beats the model already classifies with confidence."""
    log_p = torch.log_softmax(logits, dim=1)
    log_p_true = log_p.gather(1, targets[:, None]).squeeze(1)
    return (-(1 - log_p_true.exp()) ** gamma * log_p_true).mean()


def make_loss(cfg, train_labels):
    if cfg["loss"] == "weighted_ce":
        weights = torch.tensor(class_weights(train_labels, power=cfg["class_weight_power"]), dtype=torch.float32)
        return nn.CrossEntropyLoss(weight=weights)
    if cfg["loss"] == "focal":
        return lambda logits, targets: focal_loss(logits, targets, cfg["focal_gamma"])
    return nn.CrossEntropyLoss()


def predict(model, loader):
    """Return true labels and predicted labels for every beat in the loader."""
    model.eval()
    truths, predictions = [], []
    with torch.no_grad():
        for x, y in loader:
            predictions.append(model(x).argmax(dim=1).numpy())
            truths.append(y.numpy())
    return np.concatenate(truths), np.concatenate(predictions)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/train.yaml")
    parser.add_argument("--tag", required=True, help="name of the output folder under results/runs/")
    parser.add_argument("--size", choices=["small", "large"])
    parser.add_argument("--loss", choices=["weighted_ce", "ce", "focal"])
    parser.add_argument("--no-augment", action="store_true")
    parser.add_argument("--no-rr", action="store_true")
    args = parser.parse_args()

    cfg = yaml.safe_load(open(args.config))
    if args.size:
        cfg["model_size"] = args.size
    if args.loss:
        cfg["loss"] = args.loss
    if args.no_augment:
        cfg["augment"] = False
    if args.no_rr:
        cfg["use_rr_channel"] = False

    random.seed(cfg["seed"])
    np.random.seed(cfg["seed"])
    torch.manual_seed(cfg["seed"])

    out_dir = os.path.join("results", "runs", args.tag)
    os.makedirs(out_dir, exist_ok=True)
    json.dump(cfg, open(os.path.join(out_dir, "config.json"), "w"), indent=2)

    train_set = Beats("data/processed/ds1_train.npz", cfg["augment"], cfg["use_rr_channel"])
    val_set = Beats("data/processed/ds1_val.npz", False, cfg["use_rr_channel"])
    train_loader = DataLoader(train_set, batch_size=cfg["batch_size"], shuffle=True)
    val_loader = DataLoader(val_set, batch_size=1024)

    model = ECGNet(cfg["model_size"])
    loss_fn = make_loss(cfg, train_set.y)
    optimizer = torch.optim.Adam(model.parameters(), lr=cfg["learning_rate"], weight_decay=cfg["weight_decay"])
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=cfg["epochs"])
    print(f"{args.tag}: {cfg['model_size']} model, {count_parameters(model):,} parameters, loss={cfg['loss']}")

    history = []
    best_f1, best_epoch = -1.0, 0
    for epoch in range(1, cfg["epochs"] + 1):
        model.train()
        start = time.time()
        total_loss = 0.0
        for x, y in train_loader:
            optimizer.zero_grad()
            loss = loss_fn(model(x), y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * len(y)
        scheduler.step()

        truth, prediction = predict(model, val_loader)
        val = compute_metrics(truth, prediction)
        history.append({"epoch": epoch, "train_loss": total_loss / len(train_set), "val_macro_f1": val["macro_f1"],
                        "val_accuracy": val["accuracy"], "seconds": round(time.time() - start, 1)})
        print(f"epoch {epoch:3d}  loss {history[-1]['train_loss']:.4f}  val macro F1 {val['macro_f1']:.4f}  "
              f"S recall {val['S_recall']:.2f}  V recall {val['V_recall']:.2f}  F recall {val['F_recall']:.2f}")

        if val["macro_f1"] > best_f1:          # keep the epoch with the best validation macro F1
            best_f1, best_epoch = val["macro_f1"], epoch
            torch.save(model.state_dict(), os.path.join(out_dir, "model.pt"))
            json.dump({"best_epoch": epoch, **val}, open(os.path.join(out_dir, "val_metrics.json"), "w"), indent=2)
        elif epoch - best_epoch >= cfg["early_stopping_patience"]:
            print(f"no improvement for {cfg['early_stopping_patience']} epochs, stopping")
            break

    pd.DataFrame(history).to_csv(os.path.join(out_dir, "history.csv"), index=False)
    print(f"best epoch {best_epoch}, validation macro F1 {best_f1:.4f}")


if __name__ == "__main__":
    main()
