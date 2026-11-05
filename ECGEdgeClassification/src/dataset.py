"""
Training-time data handling (report sections 3.6 and 3.7).

- Data augmentation: small random changes to training beats so the model
  sees more variation. Only used on the training split.
- Class weights: give rare classes more weight in the loss function.
"""
import numpy as np

# The model input is clipped to the signed 8-bit range of the MAX78002: [-1, 127/128].
CLIP_MIN = -1.0
CLIP_MAX = 127.0 / 128.0

FS_MODEL = 128  # sampling frequency of the model input (Hz)


# ---------------------------------------------------------------- augmentations
# Each function changes the ECG channel of one beat (a 1-D array of 256 samples).
# Amplitudes are in normalised units, where a typical R peak is about 0.33.

def scale_amplitude(ecg, factor):
    """Multiply the whole beat by a factor (simulates a different electrode gain)."""
    return ecg * factor


def shift_in_time(ecg, k):
    """Shift the beat k samples to the right (k > 0) or left (k < 0).
    The empty end is filled with the edge value. Simulates R-peak detector jitter."""
    if k > 0:
        return np.concatenate([np.full(k, ecg[0]), ecg[:-k]])
    if k < 0:
        return np.concatenate([ecg[-k:], np.full(-k, ecg[-1])])
    return ecg


def add_gaussian_noise(ecg, sigma, rng):
    """Add random high-frequency noise with standard deviation sigma."""
    return ecg + rng.normal(0.0, sigma, ecg.shape)


def add_baseline_wander(ecg, amplitude, freq_hz, phase):
    """Add a slow sine wave (simulates breathing / electrode drift)."""
    t = np.arange(len(ecg)) / FS_MODEL
    return ecg + amplitude * np.sin(2 * np.pi * freq_hz * t + phase)


class Augmenter:
    """Randomly applies the four augmentations above to a training beat.

    Each augmentation is used with probability p, with these ranges:
        amplitude scaling  factor 0.8 to 1.2
        time shift         -5 to +5 samples (about +-40 ms at 128 Hz)
        Gaussian noise     sigma 0.003 to 0.02
        baseline wander    amplitude 0 to 0.07, frequency 0.15 to 0.5 Hz
    Only the ECG channel (channel 0) is changed; the RR channel stays the same.
    """

    def __init__(self, p=0.5, seed=None):
        self.p = p
        self.rng = np.random.default_rng(seed)

    def __call__(self, x):
        x = np.array(x, dtype=np.float32, copy=True)   # never change the original beat
        ecg = x[0].astype(np.float64)
        rng = self.rng

        if rng.random() < self.p:
            ecg = scale_amplitude(ecg, rng.uniform(0.8, 1.2))
        if rng.random() < self.p:
            ecg = shift_in_time(ecg, int(rng.integers(-5, 6)))
        if rng.random() < self.p:
            ecg = add_gaussian_noise(ecg, rng.uniform(0.003, 0.02), rng)
        if rng.random() < self.p:
            ecg = add_baseline_wander(ecg, rng.uniform(0, 0.07), rng.uniform(0.15, 0.5), rng.uniform(0, 2 * np.pi))

        x[0] = np.clip(ecg, CLIP_MIN, CLIP_MAX)
        return x


# ---------------------------------------------------------------- class weights
def class_weights(y, n_classes=4, power=0.5):
    """Weight for each class: w_c = (largest class count / count of class c) ** power,
    then scaled so the average weight is 1. power=0.5 softens the weights so that
    the rarest class does not dominate training."""
    counts = np.bincount(y, minlength=n_classes).astype(float)
    counts[counts == 0] = 1.0          # avoid division by zero for an empty class
    weights = (counts.max() / counts) ** power
    return weights / weights.mean()
