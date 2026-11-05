"""
The same CNN as src/model.py, written with the ai8x layers so that
ai8x-training can train it and ai8x-synthesis can turn it into MAX78002 code.

Copy this file to ai8x-training/models/.
"""
from torch import nn

import ai8x


class AI85ECGNet(nn.Module):
    def __init__(self, num_classes=4, num_channels=2, dimensions=(256,), bias=True, **kwargs):
        super().__init__()
        # input 2 x 256
        self.conv1 = ai8x.FusedConv1dReLU(num_channels, 16, 5, padding=2, bias=bias, **kwargs)       # 16 x 256
        self.conv2 = ai8x.FusedMaxPoolConv1dReLU(16, 32, 5, pool_size=2, pool_stride=2, padding=2,
                                                 bias=bias, **kwargs)                               # 32 x 128
        self.conv3 = ai8x.FusedMaxPoolConv1dReLU(32, 32, 3, pool_size=4, pool_stride=4, padding=1,
                                                 bias=bias, **kwargs)                               # 32 x 32
        self.conv4 = ai8x.FusedMaxPoolConv1dReLU(32, 32, 3, pool_size=4, pool_stride=4, padding=1,
                                                 bias=bias, **kwargs)                               # 32 x 8
        self.fc = ai8x.Linear(32 * 8, num_classes, bias=bias, wide=True, **kwargs)                  # 4 scores

    def forward(self, x):
        x = self.conv1(x)
        x = self.conv2(x)
        x = self.conv3(x)
        x = self.conv4(x)
        x = x.view(x.size(0), -1)
        return self.fc(x)


def ai85ecgnet(pretrained=False, **kwargs):
    assert not pretrained
    return AI85ECGNet(**kwargs)


models = [{"name": "ai85ecgnet", "min_input": 1, "dim": 1}]
