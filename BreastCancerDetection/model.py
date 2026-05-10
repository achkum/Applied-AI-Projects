"""CNN architecture for benign / malignant histopathology classification."""
import torch.nn as nn
from torchvision import models


class ResNet18CancerModel(nn.Module):
    """ResNet18 pretrained on ImageNet, fine-tuned for binary output.

    Early layers (conv1, bn1, layer1, layer2) are frozen because the dataset
    is small relative to ResNet's capacity -- previous full-fine-tune runs
    converged in one epoch and overfit afterward. Only layer3, layer4, and
    the final FC are trained.

    Expects 224x224 RGB tensors normalized with ImageNet mean/std.
    """

    FROZEN_PREFIXES = ('conv1', 'bn1', 'layer1', 'layer2')

    def __init__(self, num_classes=1):
        super().__init__()
        self.backbone = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        self.backbone.fc = nn.Linear(self.backbone.fc.in_features, num_classes)
        for name, p in self.backbone.named_parameters():
            if name.startswith(self.FROZEN_PREFIXES):
                p.requires_grad = False

    def forward(self, x):
        return self.backbone(x)
