"""
Data Utilities for SNN Motion Detection: Converts event-based data to dense tensors.
"""

import numpy as np
import torch


def process_events(events, config, max_events=10000):
    """
    Convert sparse events to dense tensor for the model.
    """
    
    height = config['data']['height']
    width = config['data']['width']
    num_timesteps = config['data']['num_timesteps']
    
    # Empty frame tensor
    frames = np.zeros((num_timesteps, height, width), dtype=np.float32)
    
    if len(events) == 0:
        return torch.tensor(frames.reshape(num_timesteps, -1), dtype=torch.float32)
    
    # Subsample if too many events (DVS128 can have 100k+ events)
    if len(events) > max_events:
        indices = np.linspace(0, len(events) - 1, max_events, dtype=int)
        events = events[indices]
    
    # Bin events into frames
    max_t = events[:, 0].max()
    if max_t == 0:
        max_t = 1
    bin_size = max_t / num_timesteps
    
    # Vectorized processing
    t = events[:, 0]
    x = events[:, 1].astype(int)
    y = events[:, 2].astype(int)
    pol = events[:, 3]
    
    frame_idx = np.clip((t / bin_size).astype(int), 0, num_timesteps - 1)
    
    # Filter valid coordinates
    valid = (y >= 0) & (y < height) & (x >= 0) & (x < width)
    frame_idx = frame_idx[valid]
    y = y[valid]
    x = x[valid]
    pol = pol[valid]
    
    # Accumulate events (vectorized)
    pol_values = np.where(pol, 1, -1)
    np.add.at(frames, (frame_idx, y, x), pol_values)
    
    # Normalize to [-1, 1]
    frames = np.clip(frames, -1, 1)
    
    # Flatten: [timesteps, height, width] to [timesteps, num_receptors]
    data = frames.reshape(num_timesteps, -1)
    
    return torch.tensor(data, dtype=torch.float32)


def generate_batch(data_generator, batch_size, config, source="linear"):
    """
    Generate a batch of samples using data.py.
    """
    events_list, labels = data_generator.get(source=source, num_samples=batch_size)
    
    data_list = []
    for events in events_list:
        data = process_events(events, config)
        data_list.append(data)
    
    # Stack: [batch, timesteps, receptors] to [timesteps, batch, receptors]
    data = torch.stack(data_list).permute(1, 0, 2)
    labels = torch.tensor(labels, dtype=torch.long)
    
    return data, labels


def generate_dataset(data_generator, num_samples, config, source="linear"):
    """
    Generate a full dataset and split into train/val/test.
    """
    # Generate all samples
    events_list, labels = data_generator.get(source=source, num_samples=num_samples)
    
    # Split using data.py's split function
    train, val, test = data_generator.split(events_list, labels, ratios=(0.7, 0.15, 0.15))
    
    # Convert each split to tensors
    def convert_split(split_data):
        events_list, labels = split_data
        data_list = [process_events(events, config) for events in events_list]
        data = torch.stack(data_list).permute(1, 0, 2)  # [timesteps, batch, receptors]
        labels = torch.tensor(labels, dtype=torch.long)
        return data, labels
    
    train_data, train_labels = convert_split(train)
    val_data, val_labels = convert_split(val)
    test_data, test_labels = convert_split(test)
    
    return train_data, train_labels, val_data, val_labels, test_data, test_labels


def get_data_info(data, labels):
    """
    Print information about a dataset.
    """
    print(f"Data shape: {data.shape}")
    print(f"Labels shape: {labels.shape}")
    print(f"Num samples: {labels.shape[0]}")
    print(f"Timesteps: {data.shape[0]}")
    print(f"Receptors: {data.shape[2]}")
    
    # Handle multi-class labels
    unique, counts = torch.unique(labels, return_counts=True)
    label_dist = {int(u): int(c) for u, c in zip(unique, counts)}
    print(f"Label distribution: {label_dist}")
    print(f"Data range: [{data.min():.2f}, {data.max():.2f}]")