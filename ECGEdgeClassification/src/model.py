"""
The edge model: a small 1D CNN for one heartbeat (input 2 x 256, output 4 class scores).

Only layers the MAX78002 CNN accelerator supports are used:
Conv1d (kernel 3 or 5, stride 1), MaxPool1d, ReLU and one small Linear layer.
Batch normalisation is left out so the model is identical to the one in
max78002/model_configuration/ai85ecgnet.py.

Two sizes are compared in the report:
    small:  channels (16, 32, 32, 32),         pools (1, 2, 4, 4)     -> about 10k parameters
    large:  channels (16, 32, 32, 64, 64, 64), pools (1, 2, 2, 2, 2, 4) -> about 44k parameters
"""
import torch
from torch import nn

SIZES = {
    "small": {"channels": (16, 32, 32, 32), "pools": (1, 2, 4, 4), "kernels": (5, 5, 3, 3)},
    "large": {"channels": (16, 32, 32, 64, 64, 64), "pools": (1, 2, 2, 2, 2, 4), "kernels": (5, 5, 5, 5, 3, 3)},
}


class ECGNet(nn.Module):
    def __init__(self, size="small", in_channels=2, in_len=256, n_classes=4):
        super().__init__()
        spec = SIZES[size]
        layers = []
        length = in_len
        for out_channels, pool, kernel in zip(spec["channels"], spec["pools"], spec["kernels"]):
            if pool > 1:
                layers.append(nn.MaxPool1d(pool))
                length = length // pool
            layers.append(nn.Conv1d(in_channels, out_channels, kernel, padding=kernel // 2))
            layers.append(nn.ReLU())
            in_channels = out_channels
        self.features = nn.Sequential(*layers)
        self.classifier = nn.Linear(in_channels * length, n_classes)

    def forward(self, x):
        x = self.features(x)
        x = torch.flatten(x, 1)
        return self.classifier(x)


def count_parameters(model):
    return sum(p.numel() for p in model.parameters())
