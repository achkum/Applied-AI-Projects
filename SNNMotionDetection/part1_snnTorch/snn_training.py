"""
SNN Training for Motion Detection
"""

import os
import torch
import torch.nn as nn
import snntorch.functional as SF
from tqdm import tqdm


def loss_fn(spk_rec, targets):
    """
    Calculate loss based on spike counts.
    """
    return SF.ce_rate_loss()(spk_rec, targets)


def training_epoch(model, data_generator, optimizer, config, device, num_batches, batch_size, generate_batch_fn):
    """
    Training epoch.
    """
    model.train()
    total_loss = 0
    total_correct = 0
    total_samples = 0
    
    for batch_idx in range(num_batches):
        # Generate batch
        data, labels = generate_batch_fn(data_generator, batch_size, config)
        data = data.to(device)
        labels = labels.to(device)
        
        # Forward pass
        spk_rec, mem_rec = model(data)
        
        # Calculate loss
        loss = loss_fn(spk_rec, labels)
        
        # Backward pass
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        # Track metrics
        total_loss += loss.item()
        spike_counts = spk_rec.sum(dim=0)
        predictions = spike_counts.argmax(dim=1)
        total_correct += (predictions == labels).sum().item()
        total_samples += labels.size(0)
    
    avg_loss = total_loss / num_batches
    accuracy = total_correct / total_samples
    
    return avg_loss, accuracy


def validate_model(model, data_generator, config, device, num_batches, batch_size, generate_batch_fn):
    """
    Validate the model.
    """
    model.eval()
    total_loss = 0
    total_correct = 0
    total_samples = 0
    
    with torch.no_grad():
        for batch_idx in range(num_batches):
            # Generate batch
            data, labels = generate_batch_fn(data_generator, batch_size, config)
            data = data.to(device)
            labels = labels.to(device)
            
            # Forward pass
            spk_rec, mem_rec = model(data)
            
            # Calculate loss
            loss = loss_fn(spk_rec, labels)
            
            # Track metrics
            total_loss += loss.item()
            spike_counts = spk_rec.sum(dim=0)
            predictions = spike_counts.argmax(dim=1)
            total_correct += (predictions == labels).sum().item()
            total_samples += labels.size(0)
    
    avg_loss = total_loss / num_batches
    accuracy = total_correct / total_samples
    
    return avg_loss, accuracy


def save_model_checkpoint(model, optimizer, epoch, val_acc, val_loss, filepath):
    """
    Save model checkpoint.
    """
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    torch.save({
        'epoch': epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
        'val_acc': val_acc,
        'val_loss': val_loss,
    }, filepath)


def load_model_checkpoint(model, optimizer, filepath, device):
    """
    Load model checkpoint.
    """
    checkpoint = torch.load(filepath, map_location=device)
    model.load_state_dict(checkpoint['model_state_dict'])
    if optimizer is not None:
        optimizer.state_dict(checkpoint['optimizer_state_dict'])
    return checkpoint['epoch'], checkpoint['val_acc']


def train_model(model, data_generator, config, device, generate_batch_fn, 
          num_epochs=50, batch_size=32, train_batches=50, val_batches=10, 
          patience=10, checkpoint_dir=None, verbose=True):
    """
    Full training loop with early stopping.
    """
    # Optimizer
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=config['training']['learning_rate']
    )
    
    # History
    history = {
        'train_loss': [],
        'train_acc': [],
        'val_loss': [],
        'val_acc': []
    }
    
    # Best model tracking
    best_val_acc = 0
    patience_counter = 0
    
    if verbose:
        print("Start training...")
            
    for epoch in range(num_epochs):
        # Train
        train_loss, train_acc = training_epoch(
            model, data_generator, optimizer, config, device,
            train_batches, batch_size, generate_batch_fn
        )
        
        # Validate
        val_loss, val_acc = validate_model(
            model, data_generator, config, device,
            val_batches, batch_size, generate_batch_fn
        )
        
        # Record history
        history['train_loss'].append(train_loss)
        history['train_acc'].append(train_acc)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)
        
        # Print progress
        if verbose:
            print(f"Epoch {epoch+1:3d}/{num_epochs} | "
                  f"Train Loss: {train_loss:.4f}, Acc: {train_acc:.2%} | "
                  f"Val Loss: {val_loss:.4f}, Acc: {val_acc:.2%}")
        
        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            patience_counter = 0
            if checkpoint_dir:
                save_model_checkpoint(
                    model, optimizer, epoch, val_acc, val_loss,
                    os.path.join(checkpoint_dir, 'model_best.pth')
                )
                if verbose:
                    print(f"         ↳ New best model saved! (val_acc: {val_acc:.2%})")
        else:
            patience_counter += 1
        
        # Early stopping
        if patience_counter >= patience:
            if verbose:
                print(f"\nEarly stopping at epoch {epoch+1} (no improvement for {patience} epochs)")
            break
    
    # Save final model
    if checkpoint_dir:
        save_model_checkpoint(
            model, optimizer, epoch, val_acc, val_loss,
            os.path.join(checkpoint_dir, 'model_final.pth')
        )
    
    if verbose:
        print(f"Training complete! Best val accuracy: {best_val_acc:.2%}")
    
    return history


def print_training_summary(history):
    """Print training summary."""
    print("-" * 50)
    print("Training Summary")
    print("-" * 50)
    print(f"Epochs trained: {len(history['train_loss'])}")
    print(f"\nFinal metrics:")
    print(f"  Train Loss: {history['train_loss'][-1]:.4f}")
    print(f"  Train Acc:  {history['train_acc'][-1]:.2%}")
    print(f"  Val Loss:   {history['val_loss'][-1]:.4f}")
    print(f"  Val Acc:    {history['val_acc'][-1]:.2%}")
    print(f"\nBest Val Acc: {max(history['val_acc']):.2%}")
    print("-" * 50)
