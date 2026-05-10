"""Training loop, evaluation, and hyperparameter search."""
import os

import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.metrics import roc_curve

RESULTS_DIR = 'results'


def _resolve(path):
    """Place bare filenames inside RESULTS_DIR; ensure the parent exists."""
    if not os.path.dirname(path):
        path = os.path.join(RESULTS_DIR, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


class Trainer:
    """Owns the training loop with early stopping, validation, and evaluation."""

    def __init__(self, model, criterion, optimizer,
                 train_loader, val_loader):
        self.model = model
        self.criterion = criterion
        self.optimizer = optimizer
        self.train_loader = train_loader
        self.val_loader = val_loader

    def _run_epoch(self, loader, train):
        self.model.train() if train else self.model.eval()
        running_loss = 0.0
        correct = 0
        total = 0
        ctx = torch.enable_grad() if train else torch.no_grad()
        with ctx:
            for images, labels in loader:
                if train:
                    self.optimizer.zero_grad()
                logits = self.model(images).squeeze(1)
                loss = self.criterion(logits, labels.float())
                if train:
                    loss.backward()
                    self.optimizer.step()
                running_loss += loss.item() * images.size(0)
                preds = (torch.sigmoid(logits) > 0.5).float()
                correct += (preds == labels.float()).sum().item()
                total += labels.size(0)
        return running_loss / total, correct / total

    def fit(self, num_epochs=25, patience=5, checkpoint_path='best_model.pth'):
        checkpoint_path = _resolve(checkpoint_path)
        best_val_loss = float('inf')
        patience_counter = 0
        history = {'train_loss': [], 'val_loss': [],
                   'train_acc': [], 'val_acc': []}
        # Cosine decay from the start avoids the epoch-1-plateau-then-degrade
        # pattern: the LR is already shrinking while the model is still
        # learning, instead of waiting for val loss to stagnate before reacting.
        scheduler = optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=num_epochs,
        )

        for epoch in range(num_epochs):
            train_loss, train_acc = self._run_epoch(self.train_loader, train=True)
            val_loss, val_acc = self._run_epoch(self.val_loader, train=False)

            history['train_loss'].append(train_loss)
            history['val_loss'].append(val_loss)
            history['train_acc'].append(train_acc)
            history['val_acc'].append(val_acc)

            print(f'Epoch {epoch+1:>2}/{num_epochs} | '
                  f'train loss {train_loss:.4f} acc {train_acc:.4f} | '
                  f'val loss {val_loss:.4f} acc {val_acc:.4f}')

            scheduler.step()

            if val_loss < best_val_loss:
                best_val_loss = val_loss
                patience_counter = 0
                torch.save(self.model.state_dict(), checkpoint_path)
            else:
                patience_counter += 1
                if patience_counter >= patience:
                    print(f'Early stopping at epoch {epoch+1}')
                    break

        # Restore best-val-loss weights so subsequent evaluation uses the
        # saved checkpoint, not the end-of-training (likely overfit) state.
        self.model.load_state_dict(torch.load(checkpoint_path))
        return best_val_loss, history

    @torch.no_grad()
    def _infer(self, loader):
        """Forward pass over a loader; return labels, probabilities, mean loss."""
        self.model.eval()
        y_true, y_prob = [], []
        loss_total = 0.0
        n = 0
        for images, labels in loader:
            logits = self.model(images).squeeze(1)
            loss_total += self.criterion(logits, labels.float()).item() * images.size(0)
            y_true.extend(labels.tolist())
            y_prob.extend(torch.sigmoid(logits).tolist())
            n += labels.size(0)
        return y_true, y_prob, loss_total / n

    def tune_threshold(self, val_loader):
        """Pick the threshold that maximizes Youden's J (TPR - FPR) on the val set."""
        y_true, y_prob, _ = self._infer(val_loader)
        fpr, tpr, thresholds = roc_curve(y_true, y_prob)
        # sklearn prepends thresholds[0] = inf to anchor the curve at (0,0); skip it.
        j = (tpr - fpr)[1:]
        return float(thresholds[1 + j.argmax()])

    def evaluate(self, test_loader, threshold=0.5):
        y_true, y_prob, mean_loss = self._infer(test_loader)
        y_pred = [int(p > threshold) for p in y_prob]
        accuracy = sum(t == p for t, p in zip(y_true, y_pred)) / len(y_true)
        return {
            'loss': mean_loss,
            'accuracy': accuracy,
            'y_true': y_true,
            'y_pred': y_pred,
            'y_prob': y_prob,
        }


def hyperparameter_search(model_factory, train_loader, val_loader,
                          lrs, epochs=5, patience=5, pos_weight=None):
    """Sweep learning rates, return best LR and per-LR validation losses."""
    pw_tensor = (torch.tensor([pos_weight])
                 if pos_weight is not None else None)
    results = []
    best_lr, best_loss = None, float('inf')
    for lr in lrs:
        print(f'\n--- Tuning LR = {lr} ---')
        model = model_factory()
        criterion = nn.BCEWithLogitsLoss(pos_weight=pw_tensor)
        optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
        trainer = Trainer(model, criterion, optimizer,
                          train_loader, val_loader)
        val_loss, _ = trainer.fit(
            num_epochs=epochs, patience=patience,
            checkpoint_path=f'best_model_lr{lr}.pth',
        )
        results.append({'lr': lr, 'val_loss': val_loss})
        if val_loss < best_loss:
            best_loss = val_loss
            best_lr = lr
    return best_lr, best_loss, results
