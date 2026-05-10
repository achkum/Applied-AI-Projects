"""Data loading for the BreakHis histopathology dataset.

The shipped train/test subdirectories are leaky (same patient on both sides),
so we pool all images and produce a stratified, patient-disjoint split
in memory at construction time.

Expected raw layout:
    <base_dir>/{train,test}/{benign,malignant}/*.png
"""
import os
import re
import random
from collections import Counter, defaultdict

from PIL import Image

from torch.utils.data import Dataset, DataLoader
from torchvision import transforms


# BreakHis filename: SOB_<B|M>_<subtype>-<year>-<slide_id>-<mag>-<seq>.png
# Patient/slide identity = everything before the magnification token.
_PATIENT_RE = re.compile(
    r'^(SOB_[BM]_[A-Z]+-\d+-[A-Z0-9]+)-\d+-\d+\.png$',
    re.IGNORECASE,
)


def _patient_id(fname):
    m = _PATIENT_RE.match(fname)
    return m.group(1) if m else None


class HistopathologyDataset(Dataset):
    """A list of (path, label, patient_id) triples with a per-item transform."""

    def __init__(self, samples, transform):
        self.samples = samples
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label, _ = self.samples[idx]
        image = Image.open(path).convert('RGB')
        return self.transform(image), label


class HistopathologyDataModule:
    """Owns transforms, datasets, and dataloaders.

    Splits are patient-disjoint and stratified by class. Disjointness
    is asserted at construction; if the assertion ever fails it means
    the filename pattern changed and patient extraction is broken.
    """

    IMAGENET_MEAN = [0.485, 0.456, 0.406]
    IMAGENET_STD = [0.229, 0.224, 0.225]
    class_names = ['benign', 'malignant']

    def __init__(self,
                 base_dir='Dataset 2 breast cancer histopathology 400X',
                 batch_size=32,
                 num_workers=0,
                 ratios=(0.70, 0.15, 0.15),
                 seed=42):
        self.base_dir = base_dir
        self.batch_size = batch_size
        self.num_workers = num_workers
        self.ratios = ratios
        self.seed = seed

        self.train_transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomVerticalFlip(p=0.5),
            transforms.RandomRotation(degrees=15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2,
                                   saturation=0.2, hue=0.05),
            transforms.ToTensor(),
            transforms.Normalize(mean=self.IMAGENET_MEAN, std=self.IMAGENET_STD),
        ])
        self.eval_transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=self.IMAGENET_MEAN, std=self.IMAGENET_STD),
        ])

        train_samples, val_samples, test_samples = self._split_by_patient()
        self.train_dataset = HistopathologyDataset(train_samples, self.train_transform)
        self.val_dataset = HistopathologyDataset(val_samples, self.eval_transform)
        self.test_dataset = HistopathologyDataset(test_samples, self.eval_transform)

        self._assert_patient_disjoint()

    def _gather_samples(self):
        """Return [(path, label, patient_id), ...] across the entire raw dataset."""
        samples = []
        for src_split in ('train', 'test'):  # raw dataset's leaky split -- pooled
            for label, cls in enumerate(self.class_names):
                d = os.path.join(self.base_dir, src_split, cls)
                if not os.path.isdir(d):
                    continue
                for fname in os.listdir(d):
                    if not fname.lower().endswith('.png'):
                        continue
                    pid = _patient_id(fname)
                    if pid is None:
                        raise RuntimeError(
                            f'Cannot parse patient ID from {fname!r}; '
                            f'filename pattern may have changed.'
                        )
                    samples.append((os.path.join(d, fname), label, pid))
        if not samples:
            raise RuntimeError(f'No images found under {self.base_dir!r}')
        return samples

    def _split_by_patient(self):
        """Stratified per-class patient-level split."""
        all_samples = self._gather_samples()

        by_class_patient = {label: defaultdict(list)
                            for label in range(len(self.class_names))}
        for sample in all_samples:
            _, label, pid = sample
            by_class_patient[label][pid].append(sample)

        rng = random.Random(self.seed)
        train_samples, val_samples, test_samples = [], [], []
        train_ratio, val_ratio, _ = self.ratios

        for label in range(len(self.class_names)):
            patients = sorted(by_class_patient[label].keys())
            rng.shuffle(patients)
            n = len(patients)
            n_train = int(round(n * train_ratio))
            n_val = int(round(n * val_ratio))
            for pid in patients[:n_train]:
                train_samples.extend(by_class_patient[label][pid])
            for pid in patients[n_train:n_train + n_val]:
                val_samples.extend(by_class_patient[label][pid])
            for pid in patients[n_train + n_val:]:
                test_samples.extend(by_class_patient[label][pid])

        return train_samples, val_samples, test_samples

    def _assert_patient_disjoint(self):
        def pids(ds):
            return {s[2] for s in ds.samples}
        train, val, test = pids(self.train_dataset), pids(self.val_dataset), pids(self.test_dataset)
        for a_name, a, b_name, b in (('train', train, 'val', val),
                                     ('train', train, 'test', test),
                                     ('val', val, 'test', test)):
            overlap = a & b
            if overlap:
                raise RuntimeError(
                    f'Patient leakage between {a_name} and {b_name}: '
                    f'{len(overlap)} shared, e.g. {sorted(overlap)[:3]}'
                )

    def train_loader(self):
        return DataLoader(self.train_dataset, batch_size=self.batch_size,
                          shuffle=True, num_workers=self.num_workers)

    def val_loader(self):
        return DataLoader(self.val_dataset, batch_size=self.batch_size,
                          shuffle=False, num_workers=self.num_workers)

    def test_loader(self):
        return DataLoader(self.test_dataset, batch_size=self.batch_size,
                          shuffle=False, num_workers=self.num_workers)

    def pos_weight(self):
        """n_negative / n_positive for the training set; pass to BCEWithLogitsLoss."""
        counts = Counter(s[1] for s in self.train_dataset.samples)
        return counts[0] / counts[1]

    def describe(self):
        print(f'Classes: {self.class_names}')
        for name, ds in (('train', self.train_dataset),
                         ('val', self.val_dataset),
                         ('test', self.test_dataset)):
            label_counts = Counter(s[1] for s in ds.samples)
            n_patients = len({s[2] for s in ds.samples})
            parts = ' | '.join(
                f'{self.class_names[c]} {n}'
                for c, n in sorted(label_counts.items())
            )
            print(f'  {name:>5}: {len(ds):>4} images | '
                  f'{n_patients:>3} patients | {parts}')
