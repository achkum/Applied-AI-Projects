"""
Add real ECG noise from the MIT-BIH Noise Stress Test Database (nstdb) at a chosen SNR.

Noise types: bw (baseline wander), ma (muscle artefact), em (electrode motion),
or mix (the three added together with equal power).

SNR definition (the one PhysioNet used to build nstdb, tool `nst`):
    signal power S = (average peak-to-peak QRS amplitude)^2 / 8
    noise power  N = average power of the noise in 1-second pieces (mean removed)
    SNR (dB)       = 10 * log10(S / N)
"Average" here means a trimmed mean: the largest 5 % and smallest 5 % of values are ignored.

To avoid leakage, only one half of each noise recording is used for testing
(configs/noise.yaml: eval_region). NSTDB noise is never used for training.
"""
import os

import numpy as np


def trimmed_mean(values, cut=0.05):
    """Mean after dropping the smallest and largest `cut` fraction of the values."""
    values = np.sort(np.asarray(values, dtype=np.float64))
    k = int(len(values) * cut)
    if len(values) > 2 * k:
        values = values[k:len(values) - k]
    return float(np.mean(values))


def noise_power(noise, fs=360):
    """Noise power: split into 1-second pieces, remove each piece's mean, take the RMS,
    average the RMS values (trimmed mean) and square the result."""
    n = int(fs)
    pieces = noise[: len(noise) // n * n].reshape(-1, n)
    pieces = pieces - pieces.mean(axis=1, keepdims=True)
    rms = np.sqrt(np.mean(pieces ** 2, axis=1))
    return trimmed_mean(rms) ** 2


def load_noise(nstdb_dir, kind, channel=0, region=(0.5, 1.0)):
    """Load one noise type ('bw', 'ma', 'em' or 'mix') in mV.
    region selects which part of the 30-minute recording is used (as fractions)."""
    import wfdb

    if kind == "mix":
        parts = [load_noise(nstdb_dir, k, channel, region) for k in ("bw", "ma", "em")]
        n = min(len(p) for p in parts)
        # scale each part to the same power before adding them
        return np.sum([p[:n] / np.sqrt(noise_power(p[:n])) for p in parts], axis=0)

    record = wfdb.rdrecord(os.path.join(nstdb_dir, kind))
    noise = record.p_signal[:, channel].astype(np.float64)
    start = int(region[0] * len(noise))
    end = int(region[1] * len(noise))
    return noise[start:end]


def signal_power(sig, beat_samples, fs, half_window_ms=50):
    """ECG signal power: peak-to-peak amplitude of each QRS complex
    (within +-50 ms of the beat annotation), trimmed mean, squared, divided by 8."""
    w = int(round(half_window_ms / 1000 * fs))
    peak_to_peak = [np.ptp(sig[max(0, s - w):s + w + 1]) for s in beat_samples]
    return trimmed_mean(peak_to_peak) ** 2 / 8.0


def add_noise(sig, beat_samples, noise, snr_db, fs, rng):
    """Return sig + noise, with the noise scaled to give the requested SNR.
    The noise segment starts at a random position and wraps around if it is too short."""
    start = int(rng.integers(0, len(noise)))
    segment = np.resize(np.roll(noise, -start), len(sig))
    gain = np.sqrt(signal_power(sig, beat_samples, fs) / (noise_power(segment, fs) * 10 ** (snr_db / 10)))
    return sig + gain * segment
