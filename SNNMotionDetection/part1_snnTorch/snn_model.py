"""
SNN Models for Motion Detection
"""

import numpy as np
import torch
import torch.nn as nn
import snntorch as snn
from snntorch import surrogate


class SimpleMotionSNN(nn.Module):
    """
    Feedforward SNN for motion detection.
    """

    def __init__(self, num_receptors, hidden_size, num_classes, beta, slope):
        super().__init__()

        self.num_receptors = num_receptors
        self.hidden_size = hidden_size
        self.num_classes = num_classes
        self.beta = beta

        # Surrogate gradient
        spike_grad = surrogate.fast_sigmoid(slope=slope)

        # Layer 1: Input to Hidden
        self.fc1 = nn.Linear(num_receptors, hidden_size)
        self.lif1 = snn.Leaky(beta=beta, spike_grad=spike_grad, init_hidden=True)

        # Layer 2: Hidden to Hidden
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.lif2 = snn.Leaky(beta=beta, spike_grad=spike_grad, init_hidden=True)

        # Layer 3: Hidden to Output
        self.fc_out = nn.Linear(hidden_size, num_classes)
        self.lif_out = snn.Leaky(beta=beta, spike_grad=spike_grad, init_hidden=True, output=True)

    def forward(self, x):
        """
        Forward pass.
        """
        num_timesteps = x.size(0)

        # Reset hidden states
        self.lif1.reset_hidden()
        self.lif2.reset_hidden()
        self.lif_out.reset_hidden()

        # Record outputs
        spk_rec = []
        mem_rec = []

        # Process each timestep
        for t in range(num_timesteps):
            x_t = x[t]

            # Layer 1
            cur1 = self.fc1(x_t)
            spk1 = self.lif1(cur1)

            # Layer 2
            cur2 = self.fc2(spk1)
            spk2 = self.lif2(cur2)

            # Output layer
            cur_out = self.fc_out(spk2)
            spk_out, mem_out = self.lif_out(cur_out)

            spk_rec.append(spk_out)
            mem_rec.append(mem_out)

        return torch.stack(spk_rec), torch.stack(mem_rec)

    def reset(self):
        """Reset all hidden states."""
        self.lif1.reset_hidden()
        self.lif2.reset_hidden()
        self.lif_out.reset_hidden()


class ReichardtMotionSNN(nn.Module):
    """
    Reichardt detector-inspired SNN for motion detection.
    Uses grid-based horizontal AND vertical detectors for omnidirectional motion detection.
    """

    def __init__(self, num_receptors, num_detectors, delay_steps, hidden_size, 
                 num_classes, beta, slope, height=128, width=128, detector_spacing=2):
        super().__init__()

        self.num_receptors = num_receptors
        self.num_detectors = num_detectors
        self.delay_steps = delay_steps
        self.hidden_size = hidden_size
        self.num_classes = num_classes
        self.beta = beta
        self.height = height
        self.width = width
        self.detector_spacing = detector_spacing

        # Surrogate gradient
        spike_grad = surrogate.fast_sigmoid(slope=slope)

        # Create detector sampling indices (grid-based, H+V)
        self._create_detector_indices()

        # Temporal delay buffer learned weights
        self.delay_weight = nn.Parameter(torch.ones(1) * 0.8)

        # Correlation layer: combines delayed and non-delayed signals, 4 motion directions: left, right, up, down
        self.fc_correlate = nn.Linear(num_detectors * 4, hidden_size)
        self.lif_correlate = snn.Leaky(beta=beta, spike_grad=spike_grad, init_hidden=True)

        # Hidden layer
        self.fc_hidden = nn.Linear(hidden_size, hidden_size)
        self.lif_hidden = snn.Leaky(beta=beta, spike_grad=spike_grad, init_hidden=True)

        # Output layer
        self.fc_out = nn.Linear(hidden_size, num_classes)
        self.lif_out = snn.Leaky(beta=beta, spike_grad=spike_grad, init_hidden=True, output=True)

    def _create_detector_indices(self):
        """Create pairs of indices for Reichardt detectors - GRID with H+V."""
        left_indices = []
        right_indices = []
        
        # Calculate grid dimensions (half for horizontal, half for vertical)
        detectors_per_type = self.num_detectors // 2
        num_y = int(np.sqrt(detectors_per_type))
        num_x = detectors_per_type // num_y
        
        y_step = max(1, self.height // num_y)
        x_step = max(1, self.width // num_x)
        
        # Horizontal detectors (detect left-right motion)
        for i in range(num_y):
            for j in range(num_x):
                y = min(i * y_step + y_step // 2, self.height - 1)
                x = min(j * x_step + x_step // 2, self.width - self.detector_spacing - 1)
                
                if 0 <= x < self.width - self.detector_spacing and 0 <= y < self.height:
                    left_idx = y * self.width + x
                    right_idx = y * self.width + x + self.detector_spacing
                    left_indices.append(left_idx)
                    right_indices.append(right_idx)
        
        # Vertical detectors (detect up-down motion)
        for i in range(num_y):
            for j in range(num_x):
                y = min(i * y_step + y_step // 2, self.height - self.detector_spacing - 1)
                x = min(j * x_step + x_step // 2, self.width - 1)
                
                if 0 <= y < self.height - self.detector_spacing and 0 <= x < self.width:
                    top_idx = y * self.width + x
                    bottom_idx = (y + self.detector_spacing) * self.width + x
                    left_indices.append(top_idx)
                    right_indices.append(bottom_idx)
        
        # Add extra detectors along center row for linear motion
        center_y = self.height // 2
        for x in range(0, self.width - self.detector_spacing, 4):
            left_indices.append(center_y * self.width + x)
            right_indices.append(center_y * self.width + x + self.detector_spacing)
        
        # Ensure we have exactly num_detectors (pad with random if needed)
        while len(left_indices) < self.num_detectors:
            y = np.random.randint(0, self.height)
            x = np.random.randint(0, self.width - self.detector_spacing)
            left_indices.append(y * self.width + x)
            right_indices.append(y * self.width + x + self.detector_spacing)
        
        # Trim to exact count
        left_indices = left_indices[:self.num_detectors]
        right_indices = right_indices[:self.num_detectors]
        
        self.register_buffer('left_indices', torch.tensor(left_indices, dtype=torch.long))
        self.register_buffer('right_indices', torch.tensor(right_indices, dtype=torch.long))

    def forward(self, x):
        """
        Forward pass with Reichardt-style motion detection.
        """
        num_timesteps = x.size(0)
        batch_size = x.size(1)

        # Reset hidden states
        self.lif_correlate.reset_hidden()
        self.lif_hidden.reset_hidden()
        self.lif_out.reset_hidden()

        # Initialize delay buffer
        delay_buffer_left = torch.zeros(self.delay_steps, batch_size, self.num_detectors, device=x.device)
        delay_buffer_right = torch.zeros(self.delay_steps, batch_size, self.num_detectors, device=x.device)

        # Record outputs
        spk_rec = []
        mem_rec = []

        for t in range(num_timesteps):
            x_t = x[t]  # [batch, num_receptors]

            # Sample from detector locations
            left_signals = x_t[:, self.left_indices]   # [batch, num_detectors]
            right_signals = x_t[:, self.right_indices] # [batch, num_detectors]

            # Get delayed signals
            delayed_left = delay_buffer_left[0]   # [batch, num_detectors]
            delayed_right = delay_buffer_right[0] # [batch, num_detectors]

            # Reichardt correlation:
            #forward_motion = delayed_left * right_signals
            #backward_motion = delayed_right * left_signals

            # Combine motion signals
            #motion_features = torch.cat([forward_motion, backward_motion], dim=1)

            motion_features = torch.cat([
                left_signals, 
                right_signals, 
                delayed_left, 
                delayed_right
                ], dim=1)

            # Update delay buffers (shift and add new)
            delay_buffer_left = torch.roll(delay_buffer_left, -1, dims=0)
            delay_buffer_left[-1] = left_signals
            delay_buffer_right = torch.roll(delay_buffer_right, -1, dims=0)
            delay_buffer_right[-1] = right_signals

            # Process through network
            cur1 = self.fc_correlate(motion_features)
            spk1 = self.lif_correlate(cur1)

            cur2 = self.fc_hidden(spk1)
            spk2 = self.lif_hidden(cur2)

            cur_out = self.fc_out(spk2)
            spk_out, mem_out = self.lif_out(cur_out)

            spk_rec.append(spk_out)
            mem_rec.append(mem_out)

        return torch.stack(spk_rec), torch.stack(mem_rec)

    def reset(self):
        """Reset all hidden states."""
        self.lif_correlate.reset_hidden()
        self.lif_hidden.reset_hidden()
        self.lif_out.reset_hidden()


def classify_function(spk_rec):
    """
    Classify based on spike counts.
    """
    spike_counts = spk_rec.sum(dim=0)
    predictions = spike_counts.argmax(dim=1)
    return predictions


def count_parameters(model):
    """
    Parameter breakdown per layer.
    """
    print(f"{'Layer':<20} {'Shape':<25} {'Parameters':>15}")
    print("-" * 60)
    for name, param in model.named_parameters():
        print(f"{name:<20} {str(list(param.shape)):<25} {param.numel():>15,}")
    print("-" * 60)

    total = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)

    print(f"{'Total':<20} {'':<25} {total:>15,}")
    print(f"{'Trainable':<20} {'':<25} {trainable:>15,}")

    return trainable


def create_model(config, device, model_type="simple", num_classes=None):
    """
    Create model from config.
    """
    if num_classes is None:
        num_classes = config['data']['num_classes']

    if model_type == "simple":
        model = SimpleMotionSNN(
            num_receptors=config['data']['num_receptors'],
            hidden_size=config['model']['simple']['hidden_size'],
            num_classes=num_classes,
            beta=config['model']['simple']['beta'],
            slope=config['model']['simple']['slope']
        ).to(device)

    if model_type == "reichardt":
        model = ReichardtMotionSNN(
            num_receptors=config['data']['num_receptors'],
            num_detectors=config['model']['reichardt']['num_detectors'],
            delay_steps=config['model']['reichardt']['delay_steps'],
            hidden_size=config['model']['reichardt']['hidden_size'],
            num_classes=num_classes,
            beta=config['model']['reichardt']['beta'],
            slope=config['model']['reichardt']['slope'],
            height=config['data']['height'],
            width=config['data']['width'],
            detector_spacing=config['model']['reichardt']['detector_spacing']
        ).to(device)

    return model


def print_model_summary(config, model_type="simple"):
    """Print model configuration summary."""
    print("Model Summary")
    print("-" * 50)

    if model_type == "simple":
        print(f"\nArchitecture: SimpleMotionSNN")
        print(f"  Input: {config['data']['num_receptors']} receptors")
        print(f"  Hidden: {config['model']['simple']['hidden_size']} neurons × 2 layers")
        print(f"  Output: {config['data']['num_classes']} classes")
        print(f"  Beta: {config['model']['simple']['beta']}")
        print(f"  Slope: {config['model']['simple']['slope']}")

    if model_type == "reichardt":
        print(f"\nArchitecture: ReichardtMotionSNN")
        print(f"  Input: {config['data']['num_receptors']} receptors")
        print(f"  Detectors: {config['model']['reichardt']['num_detectors']} (H+V grid)")
        print(f"  Delay: {config['model']['reichardt']['delay_steps']} timesteps")
        print(f"  Spacing: {config['model']['reichardt']['detector_spacing']} pixels")
        print(f"  Hidden: {config['model']['reichardt']['hidden_size']} neurons")
        print(f"  Output: {config['data']['num_classes']} classes")
        print(f"  Beta: {config['model']['reichardt']['beta']}")
        print(f"  Slope: {config['model']['reichardt']['slope']}")

    print(f"\nInput shape: [{config['data']['num_timesteps']}, batch, {config['data']['num_receptors']}]")
    print(f"Output shape: [{config['data']['num_timesteps']}, batch, {config['data']['num_classes']}]")
    print(f"\nClassification: argmax of spike counts over time")
