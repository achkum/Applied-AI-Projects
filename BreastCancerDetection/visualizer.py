"""Plotting and reporting helpers for training results."""
import os
from collections import defaultdict

import matplotlib.pyplot as plt
from sklearn.metrics import (
    roc_curve, auc, precision_recall_curve, average_precision_score,
    confusion_matrix, classification_report,
)

RESULTS_DIR = 'results'


def _resolve(path):
    """Place bare filenames inside RESULTS_DIR; ensure the parent exists."""
    if not os.path.dirname(path):
        path = os.path.join(RESULTS_DIR, path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def plot_tuning_results(tuning_results, output_path='tuning_results.png'):
    output_path = _resolve(output_path)
    lrs = [r['lr'] for r in tuning_results]
    val_losses = [r['val_loss'] for r in tuning_results]
    plt.figure()
    plt.plot(lrs, val_losses, marker='o')
    plt.xscale('log')
    plt.xlabel('Learning Rate')
    plt.ylabel('Validation Loss')
    plt.title('Hyperparameter Tuning: Validation Loss by Learning Rate')
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()
    print(f'Saved tuning plot to {output_path}')


def plot_training_history(history):
    loss_path = _resolve('training_loss.png')
    acc_path = _resolve('training_accuracy.png')

    plt.figure()
    plt.plot(history['train_loss'], label='Train Loss')
    plt.plot(history['val_loss'], label='Val Loss')
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.title('Training and Validation Loss')
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(loss_path)
    plt.close()
    print(f'Saved loss curve to {loss_path}')

    plt.figure()
    plt.plot(history['train_acc'], label='Train Accuracy')
    plt.plot(history['val_acc'], label='Val Accuracy')
    plt.xlabel('Epoch')
    plt.ylabel('Accuracy')
    plt.title('Training and Validation Accuracy')
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(acc_path)
    plt.close()
    print(f'Saved accuracy curve to {acc_path}')


def plot_confusion_matrix(y_true, y_pred, class_names,
                          output_path='confusion_matrix.png'):
    output_path = _resolve(output_path)
    cm = confusion_matrix(y_true, y_pred)

    plt.figure()
    plt.imshow(cm, interpolation='nearest', cmap=plt.cm.Blues)
    plt.title('Confusion Matrix')
    plt.colorbar()
    ticks = list(range(len(class_names)))
    plt.xticks(ticks, class_names)
    plt.yticks(ticks, class_names)
    plt.ylabel('True label')
    plt.xlabel('Predicted label')

    thresh = cm.max() / 2
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            plt.text(j, i, int(cm[i, j]),
                     horizontalalignment='center',
                     color='white' if cm[i, j] > thresh else 'black')
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()
    print(f'Saved confusion matrix to {output_path}')
    return cm


def plot_roc_curve(y_true, y_prob, output_path='roc_curve.png'):
    output_path = _resolve(output_path)
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    roc_auc = auc(fpr, tpr)
    plt.figure()
    plt.plot(fpr, tpr, label=f'ROC curve (AUC = {roc_auc:.4f})')
    plt.plot([0, 1], [0, 1], linestyle='--', color='gray', label='Chance')
    plt.xlabel('False Positive Rate')
    plt.ylabel('True Positive Rate')
    plt.title('Receiver Operating Characteristic')
    plt.legend(loc='lower right')
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()
    print(f'Saved ROC curve to {output_path} (AUC = {roc_auc:.4f})')
    return roc_auc


def plot_pr_curve(y_true, y_prob, output_path='pr_curve.png'):
    output_path = _resolve(output_path)
    precision, recall, _ = precision_recall_curve(y_true, y_prob)
    ap = average_precision_score(y_true, y_prob)
    baseline = sum(y_true) / len(y_true) if len(y_true) else 0.0
    plt.figure()
    plt.plot(recall, precision, label=f'PR curve (AP = {ap:.4f})')
    plt.hlines(baseline, 0, 1, linestyles='--', colors='gray',
               label=f'Baseline (prevalence = {baseline:.2f})')
    plt.xlabel('Recall')
    plt.ylabel('Precision')
    plt.title('Precision-Recall Curve')
    plt.legend(loc='lower left')
    plt.grid(True)
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()
    print(f'Saved PR curve to {output_path} (AP = {ap:.4f})')
    return ap


def aggregate_by_patient(samples, y_prob, threshold):
    """Group per-patch probabilities by patient.

    Returns a list of dicts (one per patient, sorted by ID) with keys:
      - pid, true, n_patches
      - pred, mean_prob: aggregate-then-decide verdict (mean prob > threshold)
      - n_correct, patient_score: BreaKHis paper's per-patient image-level
        fraction (Eq. 2: N_rec / N_P), where each patch is independently
        classified at the same threshold.
    """
    probs_by_pid = defaultdict(list)
    correct_by_pid = defaultdict(int)
    label_by_pid = {}
    for (_, label, pid), prob in zip(samples, y_prob):
        probs_by_pid[pid].append(prob)
        label_by_pid[pid] = label
        correct_by_pid[pid] += int(int(prob > threshold) == label)

    rows = []
    for pid in sorted(probs_by_pid.keys()):
        probs = probs_by_pid[pid]
        n_patches = len(probs)
        mean = sum(probs) / n_patches
        n_correct = correct_by_pid[pid]
        rows.append({
            'pid': pid,
            'true': label_by_pid[pid],
            'pred': int(mean > threshold),
            'mean_prob': mean,
            'n_patches': n_patches,
            'n_correct': n_correct,
            'patient_score': n_correct / n_patches,
        })
    return rows


def print_full_report(results, patient_rows, threshold, class_names, roc_auc, ap):
    """Single consolidated report covering patch-level and patient-level metrics."""
    y_true = results['y_true']
    y_pred = results['y_pred']
    n_pos = sum(y_true)
    n_neg = len(y_true) - n_pos

    print('\n' + '=' * 78)
    print('PATCH-LEVEL REPORT')
    print('=' * 78)
    print(f'Test set: {len(y_true)} patches '
          f'({class_names[0]} {n_neg}, {class_names[1]} {n_pos})')
    print(f'Operating threshold: {threshold:.4f}')
    print(f'Loss {results["loss"]:.4f} | Accuracy {results["accuracy"]:.4f} | '
          f'ROC AUC {roc_auc:.4f} | Avg Precision {ap:.4f}')
    print()
    print(classification_report(y_true, y_pred,
                                target_names=class_names, digits=4))

    print('=' * 86)
    print('PATIENT-LEVEL REPORT')
    print('=' * 86)
    print(f'Test set: {len(patient_rows)} patients\n')
    print(f'{"patient":<25} {"true":<11} {"#img":>5}  {"mean p":>7}  '
          f'{"pred":<11} {"match":<6} {"#corr":>5}  {"score":>7}')
    print('-' * 86)

    verdict_correct = 0
    verdict_by_class = defaultdict(lambda: [0, 0])
    score_by_class = defaultdict(list)
    for r in patient_rows:
        ok = r['pred'] == r['true']
        print(f'{r["pid"]:<25} {class_names[r["true"]]:<11} '
              f'{r["n_patches"]:>5}  {r["mean_prob"]:>7.4f}  '
              f'{class_names[r["pred"]]:<11} {"OK" if ok else "WRONG":<6} '
              f'{r["n_correct"]:>5}  {r["patient_score"]:>7.4f}')
        verdict_correct += int(ok)
        verdict_by_class[r['true']][1] += 1
        verdict_by_class[r['true']][0] += int(ok)
        score_by_class[r['true']].append(r['patient_score'])
    print('-' * 86)

    n = len(patient_rows)
    print('\nAggregate-then-decide (mean prob > threshold per patient):')
    print(f'  Accuracy: {verdict_correct}/{n} = {100 * verdict_correct / n:.1f}%')
    for c in (0, 1):
        n_correct, n_total = verdict_by_class[c]
        if n_total:
            print(f'    {class_names[c]:<11}: {n_correct}/{n_total} = '
                  f'{100 * n_correct / n_total:.1f}%')

    all_scores = [r['patient_score'] for r in patient_rows]
    print('\nBreaKHis Patient Score (Eq. 2 / 3 -- image-level, averaged per patient):')
    print(f'  Recognition Rate: {sum(all_scores) / n:.4f}')
    for c in (0, 1):
        scores = score_by_class[c]
        if scores:
            plural = 's' if len(scores) != 1 else ''
            print(f'    {class_names[c]:<11}: '
                  f'{sum(scores) / len(scores):.4f} '
                  f'(mean over {len(scores)} patient{plural})')
