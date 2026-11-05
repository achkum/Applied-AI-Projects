"""
Post-training quantisation of the trained CNN to INT16 and INT8, simulated in PyTorch.

Weights, biases and activations are rounded to a fixed number of bits with a
power-of-two scale, which is how the MAX78002 accelerator works. The activation
range of each layer is measured on training beats (calibration).

    python src/quantize.py --run results/runs/edge_cnn            # compare on DS1 validation
    python src/quantize.py --run results/runs/edge_cnn --final    # compare on DS2 test, run once

Writes results/quantization.csv and the INT8 / INT16 confusion matrices.
The true INT8 model for the device is trained with quantisation-aware training in
ai8x-training (see max78002/README.md); this script shows what plain rounding costs.
"""
import argparse
import copy
import os

import numpy as np
import torch
from torch import nn

from evaluate import load_model, load_split, make_loader
from metrics import append_metrics_row, compute_metrics, save_confusion_matrix
from model import count_parameters
from train import predict


def quantize_tensor(x, bits, max_value):
    """Round x to `bits` bits: the step is a power of two chosen so that max_value fits."""
    scale = 2.0 ** np.ceil(np.log2(max_value)) / 2 ** (bits - 1)
    limit = 2 ** (bits - 1)
    return torch.clamp(torch.round(x / scale), -limit, limit - 1) * scale


class QuantizedReLU(nn.Module):
    """ReLU followed by rounding of the activations to `bits` bits."""

    def __init__(self, bits, max_value):
        super().__init__()
        self.bits, self.max_value = bits, max_value

    def forward(self, x):
        return quantize_tensor(torch.relu(x), self.bits, self.max_value)


def activation_ranges(model, loader):
    """Largest output value of every ReLU layer, measured on calibration beats."""
    maxima = {}
    hooks = []
    for name, module in model.named_modules():
        if isinstance(module, nn.ReLU):
            hooks.append(module.register_forward_hook(
                lambda m, inp, out, name=name: maxima.__setitem__(name, max(maxima.get(name, 0.0), out.max().item()))))
    with torch.no_grad():
        for x, _ in loader:
            model(x)
    for hook in hooks:
        hook.remove()
    return maxima


def quantized_copy(model, bits, maxima):
    """Copy of the model with rounded weights, biases and activations."""
    q = copy.deepcopy(model)
    with torch.no_grad():
        for module in q.modules():
            if isinstance(module, (nn.Conv1d, nn.Linear)):
                module.weight.copy_(quantize_tensor(module.weight, bits, module.weight.abs().max().item()))
                module.bias.copy_(quantize_tensor(module.bias, bits, module.bias.abs().max().item()))
    for name, module in list(q.named_modules()):
        if isinstance(module, nn.ReLU):
            parent, index = name.rsplit(".", 1)
            q.get_submodule(parent)[int(index)] = QuantizedReLU(bits, maxima[name])
    return q


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", default="results/runs/edge_cnn")
    parser.add_argument("--final", action="store_true", help="evaluate on the DS2 test records (run once)")
    args = parser.parse_args()

    model, cfg = load_model(args.run)
    name = os.path.basename(args.run)
    split = "test" if args.final else "validation"
    X, y, _ = load_split("ds2_test" if args.final else "ds1_val", cfg["use_rr_channel"])
    loader = make_loader(X, y)

    X_calib, y_calib, _ = load_split("ds1_train", cfg["use_rr_channel"])
    calib_index = np.random.default_rng(0).choice(len(y_calib), size=4096, replace=False)
    maxima = activation_ranges(model, make_loader(X_calib[calib_index], y_calib[calib_index]))

    n_parameters = count_parameters(model)
    for precision, bits in [("FP32", 32), ("INT16", 16), ("INT8", 8)]:
        quantized = model if bits == 32 else quantized_copy(model, bits, maxima)
        truth, prediction = predict(quantized, loader)
        result = compute_metrics(truth, prediction)
        size_bytes = n_parameters * bits // 8
        if bits < 32:
            save_confusion_matrix(truth, prediction, f"results/confusion_matrix_{name}_{precision}_{split}",
                                  f"{name} {precision} (post-training), {split}")
        append_metrics_row("results/quantization.csv", {"model": name, "precision": precision, "split": split,
                                                        "parameters": n_parameters, "size_bytes": size_bytes, **result})
        print(f"{precision:5s} {size_bytes:7,d} bytes  accuracy {result['accuracy']:.4f}  macro F1 {result['macro_f1']:.4f}  "
              f"S F1 {result['S_f1']:.3f}  V F1 {result['V_f1']:.3f}  F F1 {result['F_f1']:.3f}")


if __name__ == "__main__":
    main()
