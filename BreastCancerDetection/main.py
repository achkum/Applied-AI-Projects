"""End-to-end pipeline: data -> tuning -> final training -> evaluation -> plots.

The data module reads the raw dataset directly and performs a stratified,
patient-disjoint split in memory -- nothing to copy or pre-process.

Run: python main.py
"""
import random

import torch
import torch.nn as nn
import torch.optim as optim

from data import HistopathologyDataModule
from model import ResNet18CancerModel
from trainer import Trainer, hyperparameter_search
from visualizer import (
    plot_tuning_results, plot_training_history, plot_confusion_matrix,
    plot_roc_curve, plot_pr_curve, aggregate_by_patient, print_full_report,
)

SEED = 42


def _set_seed(seed):
    """Seed Python and PyTorch RNGs so every run produces identical output."""
    random.seed(seed)
    torch.manual_seed(seed)


def main():
    _set_seed(SEED)
    print(f'seed: {SEED}\n')

    # 1. Data
    dm = HistopathologyDataModule(batch_size=32, seed=SEED)
    dm.describe()
    pos_weight = dm.pos_weight()
    print(f'pos_weight (n_neg / n_pos for train) = {pos_weight:.4f}')

    # 2. Hyperparameter tuning over learning rate
    print('\n=== Hyperparameter tuning ===')
    best_lr, best_val_loss, tuning_results = hyperparameter_search(
        model_factory=ResNet18CancerModel,
        train_loader=dm.train_loader(),
        val_loader=dm.val_loader(),
        lrs=[1e-5, 3e-5, 1e-4],
        epochs=10,
        patience=5,
        pos_weight=pos_weight,
    )
    plot_tuning_results(tuning_results)
    print(f'\nBest LR = {best_lr}, best val loss = {best_val_loss:.4f}')

    # 3. Final training with the best learning rate
    print(f'\n=== Final training (LR={best_lr}, up to 40 epochs) ===')
    final_model = ResNet18CancerModel()
    criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([pos_weight]))
    optimizer = optim.AdamW(
        final_model.parameters(), lr=best_lr, weight_decay=1e-4,
    )
    trainer = Trainer(
        final_model, criterion, optimizer,
        dm.train_loader(), dm.val_loader(),
    )
    _, history = trainer.fit(
        num_epochs=40, patience=6,
        checkpoint_path=f'final_model_{best_lr}.pth',
    )
    plot_training_history(history)

    # 4. Test-set evaluation with imbalance-aware metrics
    print('\n=== Test evaluation ===')
    threshold = trainer.tune_threshold(dm.val_loader())
    print(f'Tuned threshold (Youden J on val): {threshold:.4f}')
    results = trainer.evaluate(dm.test_loader(), threshold=threshold)
    class_names = dm.class_names

    plot_confusion_matrix(
        results['y_true'], results['y_pred'], class_names=class_names,
    )
    roc_auc = plot_roc_curve(results['y_true'], results['y_prob'])
    ap = plot_pr_curve(results['y_true'], results['y_prob'])

    # Patient-level confusion matrix (mean patch probability thresholded)
    patient_rows = aggregate_by_patient(
        dm.test_dataset.samples, results['y_prob'], threshold,
    )
    plot_confusion_matrix(
        [r['true'] for r in patient_rows],
        [r['pred'] for r in patient_rows],
        class_names=class_names,
        output_path='patient_confusion_matrix.png',
    )

    print_full_report(
        results, patient_rows, threshold,
        class_names, roc_auc, ap,
    )


if __name__ == '__main__':
    main()
