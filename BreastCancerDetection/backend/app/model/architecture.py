import torch.nn as nn
from torchvision import models

# Copied verbatim from the M7016H training notebook (ResNet50CancerModel), with one safe
# addition: `pretrained` defaults to False so we build with weights=None and load our own
# state_dict on top — no torchvision download needed (works offline in CI and Cloud Run).


class ResNet50CancerModel(nn.Module):
    # Freeze early layers to avoid overfitting on this small dataset.
    # Only layer3, layer4 and the FC head are trained.

    FROZEN_PREFIXES = ("conv1", "bn1", "layer1", "layer2")

    def __init__(self, num_classes: int = 1, dropout: float = 0.5, pretrained: bool = False):
        super().__init__()
        weights = models.ResNet50_Weights.IMAGENET1K_V1 if pretrained else None
        self.backbone = models.resnet50(weights=weights)
        in_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(in_features, num_classes),
        )
        for name, p in self.backbone.named_parameters():
            if name.startswith(self.FROZEN_PREFIXES):
                p.requires_grad = False

    def forward(self, x):
        return self.backbone(x)
