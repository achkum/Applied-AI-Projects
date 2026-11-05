"""
Dataset loader for ai8x-training: reads the beats prepared by src/prepare_data.py.

Copy this file to ai8x-training/datasets/ and the three .npz files to
ai8x-training/data/ECG_MITBIH/.

train = ds1_train.npz, test = ds1_val.npz (validation records).
Set the environment variable ECG_EVAL_SPLIT=ds2_test for the one final test run.
Always run ai8x-training with --validation-split 0, otherwise it would split the
training beats at random, which mixes patients.

ai8x expects inputs in [0, 1]; our beats are in [-1, 127/128], so we use (x + 1) / 2.
ai8x.normalize then maps this to [-0.5, 0.5] for training or to [-128, 127] in 8-bit mode.
"""
import os
import sys

import numpy as np
import torch
from torch.utils.data import Dataset

import ai8x

# reuse the augmentation and class weights of the main project
sys.path.insert(0, os.path.join(os.environ.get("ECG_PROJECT_DIR", "."), "src"))
from dataset import Augmenter, class_weights  # noqa: E402

CLASSES = ("N", "S", "V", "F")


class ECGBeats(Dataset):
    def __init__(self, path, transform, augment=False):
        data = np.load(path)
        self.X = data["X"].astype(np.float32)
        self.y = data["y"].astype(np.int64)
        self.transform = transform
        self.augmenter = Augmenter(p=0.5, seed=42) if augment else None

    def __len__(self):
        return len(self.y)

    def __getitem__(self, i):
        x = self.X[i]
        if self.augmenter is not None:
            x = self.augmenter(x)
        x = torch.from_numpy((x + 1.0) / 2.0)
        return self.transform(x), int(self.y[i])


def ecg_get_datasets(data, load_train=True, load_test=True):
    data_dir, args = data
    folder = os.path.join(data_dir, "ECG_MITBIH")
    transform = ai8x.normalize(args=args)
    train = ECGBeats(os.path.join(folder, "ds1_train.npz"), transform, augment=True) if load_train else None
    split = os.environ.get("ECG_EVAL_SPLIT", "ds1_val")
    test = ECGBeats(os.path.join(folder, f"{split}.npz"), transform) if load_test else None
    return train, test


def training_class_weights():
    path = os.path.join(os.environ.get("ECG_DATA_DIR", "data/ECG_MITBIH"), "ds1_train.npz")
    y = np.load(path)["y"]
    return tuple(float(w) for w in class_weights(y, power=0.5))


datasets = [{
    "name": "ECG_MITBIH",
    "input": (2, 256),
    "output": CLASSES,
    "weight": training_class_weights(),
    "loader": ecg_get_datasets,
}]
