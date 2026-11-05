"""
SNN Evaluation for Motion Detection
"""

import numpy as np
import matplotlib.pyplot as plt
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report


# Class names per source
CLASS_NAMES = {
    "linear": ['Left', 'Right'],
    "circular": ['CCW', 'CW'],
    "dvs128": [f'Gesture {i}' for i in range(11)]
}


def evaluate_model(model, data_generator, config, device, num_batches, batch_size, generate_batch_fn):
    """
    Evaluate model on test data.
    """
    model.eval()
    
    all_labels = []
    all_predictions = []
    all_spike_counts = []
    
    with torch.no_grad():
        for batch_idx in range(num_batches):
            # Generate batch
            data, labels = generate_batch_fn(data_generator, batch_size, config)
            data = data.to(device)
            
            # Forward pass
            spk_rec, mem_rec = model(data)
            
            # Get predictions
            spike_counts = spk_rec.sum(dim=0).cpu().numpy()  # [batch, num_classes]
            predictions = spike_counts.argmax(axis=1)  # [batch]
            
            all_labels.extend(labels.numpy())
            all_predictions.extend(predictions)
            all_spike_counts.extend(spike_counts)
    
    return np.array(all_labels), np.array(all_predictions), np.array(all_spike_counts)


def compute_metrics(labels, predictions, target_names=None):
    """
    Compute evaluation metrics.
    """
    if target_names is None:
        target_names = ['Left', 'Right']
    
    accuracy = accuracy_score(labels, predictions)
    conf_matrix = confusion_matrix(labels, predictions)
    
    # Handle case where not all classes are present in predictions
    try:
        report = classification_report(labels, predictions, target_names=target_names)
    except ValueError:
        report = classification_report(labels, predictions)
    
    metrics = {
        'accuracy': accuracy,
        'confusion_matrix': conf_matrix,
        'classification_report': report
    }
    
    return metrics


def print_evaluation_results(metrics, source="linear"):
    """Print evaluation results."""
    print("Evaluation Results")
    print("-" * 50)
    print(f"\nAccuracy: {metrics['accuracy']:.2%}")
    print(f"\nConfusion Matrix:")
    print(metrics['confusion_matrix'])
    print(f"\nClassification Report:")
    print(metrics['classification_report'])
    print("-" * 50)


def plot_confusion_matrix(conf_matrix, class_names=None, title="Confusion Matrix", save_path=None):
    """
    Plot confusion matrix.
    """
    num_classes = conf_matrix.shape[0]
    
    if class_names is None:
        class_names = [str(i) for i in range(num_classes)]
    
    # Adjust figure size based on number of classes
    fig_size = max(6, num_classes * 0.8)
    fig, ax = plt.subplots(figsize=(fig_size, fig_size))
    
    im = ax.imshow(conf_matrix, cmap='Blues')
    
    ax.set_xticks(range(num_classes))
    ax.set_yticks(range(num_classes))
    ax.set_xticklabels(class_names, rotation=45, ha='right')
    ax.set_yticklabels(class_names)
    ax.set_xlabel('Predicted')
    ax.set_ylabel('Actual')
    ax.set_title(title)
    
    # Add text annotations
    thresh = conf_matrix.max() / 2
    fontsize = 12 if num_classes <= 5 else 8
    for i in range(num_classes):
        for j in range(num_classes):
            color = 'white' if conf_matrix[i, j] > thresh else 'black'
            ax.text(j, i, conf_matrix[i, j], ha='center', va='center', 
                   color=color, fontsize=fontsize)
    
    plt.colorbar(im)
    plt.tight_layout()
    
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Saved: {save_path}")
    
    plt.show()
    plt.close(fig)
    return fig


def plot_training_history(history, save_path=None):
    """
    Plot training and validation curves.
    """
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    
    epochs = range(1, len(history['train_loss']) + 1)
    
    # Loss
    axes[0].plot(epochs, history['train_loss'], 'b-', label='Train')
    axes[0].plot(epochs, history['val_loss'], 'r-', label='Validation')
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('Loss')
    axes[0].set_title('Loss over Epochs')
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)
    
    # Accuracy
    axes[1].plot(epochs, history['train_acc'], 'b-', label='Train')
    axes[1].plot(epochs, history['val_acc'], 'r-', label='Validation')
    axes[1].set_xlabel('Epoch')
    axes[1].set_ylabel('Accuracy')
    axes[1].set_title('Accuracy over Epochs')
    axes[1].legend()
    axes[1].grid(True, alpha=0.3)
    axes[1].set_ylim(0, 1)
    
    plt.tight_layout()
    
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Saved: {save_path}")
    
    plt.show()
    plt.close(fig)
    return fig


def plot_spike_activity(spk_rec, labels, predictions, num_classes=2, num_samples=4, save_path=None):
    """
    Plot output spike activity for samples.
    """
    num_samples = min(num_samples, spk_rec.shape[1])
    fig, axes = plt.subplots(num_samples, num_classes, figsize=(4 * num_classes, 3 * num_samples))
    
    if num_samples == 1:
        axes = axes.reshape(1, -1)
    
    for i in range(num_samples):
        for c in range(num_classes):
            spikes = spk_rec[:, i, c].cpu().numpy() if torch.is_tensor(spk_rec) else spk_rec[:, i, c]
            axes[i, c].stem(range(len(spikes)), spikes, linefmt='b-', markerfmt='bo', basefmt='k-')
            axes[i, c].set_ylim(-0.1, 1.1)
            axes[i, c].set_title(f'Class {c} - {spikes.sum():.0f} spikes')
            if c == 0:
                axes[i, c].set_ylabel(f'Sample {i}\nLabel: {labels[i]}, Pred: {predictions[i]}')
    
    for c in range(num_classes):
        axes[-1, c].set_xlabel('Timestep')
    
    plt.tight_layout()
    
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Saved: {save_path}")
    
    plt.show()
    plt.close(fig)
    return fig


def plot_spike_count_distribution(spike_counts, labels, num_classes=2, save_path=None):
    """
    Plot distribution of spike counts by class.
    """
    # For many classes, use a different visualization
    if num_classes > 4:
        fig, ax = plt.subplots(figsize=(12, 6))
        
        unique_labels = np.unique(labels)
        avg_spikes = []
        for label in unique_labels:
            class_samples = spike_counts[labels == label]
            avg_spikes.append(class_samples.mean(axis=0))
        
        avg_spikes = np.array(avg_spikes)
        
        im = ax.imshow(avg_spikes.T, cmap='viridis', aspect='auto')
        ax.set_xlabel('True Label')
        ax.set_ylabel('Output Neuron')
        ax.set_title('Average Spike Counts per Class')
        ax.set_xticks(range(len(unique_labels)))
        ax.set_xticklabels(unique_labels)
        ax.set_yticks(range(num_classes))
        plt.colorbar(im, label='Avg Spike Count')
        
    else:
        fig, axes = plt.subplots(1, num_classes, figsize=(5 * num_classes, 4))
        
        if num_classes == 1:
            axes = [axes]
        
        for c in range(num_classes):
            class_samples = spike_counts[labels == c]
            if len(class_samples) > 0:
                for neuron in range(spike_counts.shape[1]):
                    axes[c].hist(class_samples[:, neuron], bins=20, alpha=0.5, label=f'Neuron {neuron}')
                axes[c].set_xlabel('Spike Count')
                axes[c].set_ylabel('Frequency')
                axes[c].set_title(f'Class {c} Samples')
                axes[c].legend()
                axes[c].grid(True, alpha=0.3)
    
    plt.tight_layout()
    
    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
        print(f"Saved: {save_path}")
    
    plt.show()
    plt.close(fig)
    return fig


def analyze_errors(labels, predictions, spike_counts):
    """
    Analyze misclassified samples.
    """
    errors = labels != predictions
    num_errors = errors.sum()
    
    if num_errors == 0:
        print("No errors to analyze!")
        return None
    
    error_indices = np.where(errors)[0]
    error_labels = labels[errors]
    error_predictions = predictions[errors]
    error_spike_counts = spike_counts[errors]
    
    error_analysis = {
        'total_errors': num_errors,
        'error_rate': num_errors / len(labels),
        'error_indices': error_indices,
        'error_labels': error_labels,
        'error_predictions': error_predictions
    }
    
    print("Error Analysis")
    print("-" * 50)
    print(f"Total errors: {num_errors} ({error_analysis['error_rate']:.2%})")
    print(f"Total samples: {len(labels)}")
    print("-" * 50)
    
    return error_analysis


def full_evaluation(model, data_generator, config, device, generate_batch_fn,
                   source="linear", num_batches=20, batch_size=32, figures_dir=None):
    """
    Run full evaluation pipeline.
    """
    print(f"Running full evaluation for {source.upper()}...")
    
    # Get class names and num_classes
    class_names = CLASS_NAMES.get(source, None)
    num_classes = len(class_names) if class_names else 2
    
    # Evaluate
    labels, predictions, spike_counts = evaluate_model(
        model, data_generator, config, device, num_batches, batch_size, generate_batch_fn
    )
    
    # Compute metrics
    metrics = compute_metrics(labels, predictions, target_names=class_names)
    print_evaluation_results(metrics, source=source)
    
    # Analyze errors
    error_analysis = analyze_errors(labels, predictions, spike_counts)
    
    # Plots
    save_conf = f"{figures_dir}/confusion_matrix_{source}.png" if figures_dir else None
    save_spike = f"{figures_dir}/spike_distribution_{source}.png" if figures_dir else None
    
    plot_confusion_matrix(metrics['confusion_matrix'], class_names=class_names, 
                         title=f'{source.upper()} Confusion Matrix', save_path=save_conf)
    plot_spike_count_distribution(spike_counts, labels, num_classes=num_classes, save_path=save_spike)
    
    print("-" * 50)
    print("Evaluation complete!")
    
    results = {
        'labels': labels,
        'predictions': predictions,
        'spike_counts': spike_counts,
        'metrics': metrics,
        'error_analysis': error_analysis
    }
    
    return results
