"""
Data preparation (CRISP-DM stage 3) for the ECG project.

Turns the MIT-BIH recordings into fixed-size model inputs, one per heartbeat,
and writes the statistics used in the report.

Steps for every record (all settings are in configs/data.yaml):
    1. read the MLII lead (found by name; record 114 stores it in channel 1)
    2. band-pass filter 0.5-40 Hz
    3. cut a 2 s window around each annotated beat (450 samples before, 270 after)
    4. resample the window from 360 Hz to 128 Hz (720 -> 256 samples)
    5. subtract the window median
    6. divide by 3 x the record's typical QRS peak
    7. clip to [-1, 127/128]
    8. add a second channel with the RR ratio
    Result per beat: an array of shape (2, 256).

Run from the project root:
    python src/prepare_data.py --config configs/data.yaml --download

Outputs:
    data/processed/ds1_train.npz, ds1_val.npz, ds2_test.npz
        X (beats, 2, 256), y (class 0-3), record, sample, symbol, rr_ratio
    results/split_stats.csv, class_counts.csv, class_weights.csv, symbol_counts.csv,
    results/record_class_counts.csv, exclusions.csv, exclusions_by_record.csv,
    results/record_normalization.csv, environment_prepare.json
"""
import argparse
import json
import os
import platform
import sys
from collections import Counter

import numpy as np
import pandas as pd
import yaml
from scipy.signal import butter, filtfilt, resample_poly

from dataset import class_weights

# MIT-BIH symbols that mark a heartbeat (of any type). Used for RR intervals
# and for the amplitude reference. All other symbols are notes, not beats.
BEAT_SYMBOLS = set("NLRBAaJSVrFejnE/fQ?")
CLASSES = ["N", "S", "V", "F"]


# ---------------------------------------------------------------- configuration
def load_config(path):
    with open(path) as f:
        return yaml.safe_load(f)


def symbol_to_class(cfg):
    """Dictionary from MIT-BIH symbol to class index (N=0, S=1, V=2, F=3)."""
    mapping = {}
    for class_index, class_name in enumerate(cfg["classes"]):
        for symbol in cfg["label_map"][class_name]:
            mapping[symbol] = class_index
    return mapping


def subject_id(record, cfg):
    """Records 201 and 202 come from the same person, so they share one subject id."""
    for group in cfg["same_subject"]:
        if record in group:
            return min(group)
    return record


def check_splits(cfg):
    """Stop with an error if the record lists could leak data between splits."""
    r = cfg["records"]
    names = ["train", "val", "test", "excluded_paced"]
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            overlap = set(r[names[i]]) & set(r[names[j]])
            assert not overlap, f"records in both {names[i]} and {names[j]}: {overlap}"
    assert set(r["train"]) | set(r["val"]) == set(cfg["official"]["ds1"]), "train + val must equal DS1"
    assert set(r["test"]) == set(cfg["official"]["ds2"]), "test must equal DS2"


# ---------------------------------------------------------------- reading data
def download(cfg):
    """Download mitdb and nstdb from PhysioNet, unless the files are already there."""
    import wfdb

    for db in ("mitdb", "nstdb"):
        folder = cfg["paths"][db]
        if os.path.isdir(folder) and any(f.endswith(".dat") for f in os.listdir(folder)):
            print(f"[download] {db} already present in {folder}")
            continue
        os.makedirs(folder, exist_ok=True)
        print(f"[download] {db} -> {folder}")
        wfdb.dl_database(db, folder)


def read_record(mitdb_dir, record, lead="MLII"):
    """Return the chosen lead (in mV), the sampling rate, the annotation positions,
    the annotation symbols and the channel number the lead was found in."""
    import wfdb

    path = os.path.join(mitdb_dir, str(record))
    rec = wfdb.rdrecord(path)
    ann = wfdb.rdann(path, "atr")
    if lead not in rec.sig_name:
        raise ValueError(f"record {record}: lead {lead} not available ({rec.sig_name})")
    channel = rec.sig_name.index(lead)
    signal = rec.p_signal[:, channel].astype(np.float64)
    return signal, rec.fs, np.asarray(ann.sample), np.asarray(ann.symbol), channel


# ---------------------------------------------------------------- signal processing
def bandpass(x, fs, low, high, order=2):
    """Butterworth band-pass filter, applied forward and backward so peaks do not shift."""
    b, a = butter(order, [low / (fs / 2), high / (fs / 2)], btype="band")
    return filtfilt(b, a, x)


def rr_ratio_feature(beat_samples, n_prev=10):
    """For each beat: (time since the previous beat) / (mean of the n_prev intervals before that).
    A value below 1 means the beat came early. Only past beats are used."""
    s = np.asarray(beat_samples, dtype=np.float64)
    rr = np.diff(s, prepend=np.nan)      # rr[i] = interval from beat i-1 to beat i
    ratio = np.ones_like(s)
    for i in range(1, len(s)):
        previous = rr[max(1, i - n_prev):i]
        reference = np.mean(previous) if len(previous) > 0 else rr[i]
        ratio[i] = rr[i] / reference if reference > 0 else 1.0
    return ratio


def amplitude_reference(filtered, beat_samples, fs, half_window_ms=50):
    """Typical QRS peak of a record: for each beat take the largest |value| within
    +-50 ms of the annotation, then the median over all beats. Labels are not used."""
    w = int(round(half_window_ms / 1000 * fs))
    peaks = [np.abs(filtered[max(0, s - w):s + w + 1]).max() for s in beat_samples]
    return float(np.median(peaks)) + 1e-6   # tiny constant avoids division by zero


def process_signal(sig_mv, fs, ann_samples, ann_symbols, cfg):
    """Turn one record into model inputs.

    Returns
        X    array (beats, 2, 256)
        y    class index per beat
        info dict with the beat positions, symbols, raw RR ratios,
             the amplitude reference and a count of excluded annotations by reason
    """
    sym2cls = symbol_to_class(cfg)
    win = cfg["window"]
    norm = cfg["normalization"]
    filtered = bandpass(sig_mv, fs, cfg["filter"]["low_hz"], cfg["filter"]["high_hz"], cfg["filter"]["order"])

    is_beat = np.array([s in BEAT_SYMBOLS for s in ann_symbols])
    beat_samples = ann_samples[is_beat]
    beat_symbols = ann_symbols[is_beat]
    rr = rr_ratio_feature(beat_samples, cfg["rr"]["n_prev"])
    a_rec = amplitude_reference(filtered, beat_samples, fs, norm["ref_half_window_ms"])

    excluded = Counter()
    for s in ann_symbols[~is_beat]:
        excluded[f"non-beat annotation '{s}'"] += 1

    X, y, positions, symbols, rr_values = [], [], [], [], []
    for i, (pos, sym) in enumerate(zip(beat_samples, beat_symbols)):
        if sym not in sym2cls:
            excluded[f"AAMI Q-class beat '{sym}'"] += 1
            continue
        start, end = pos - win["before"], pos + win["after"]
        if start < 0 or end > len(filtered):
            excluded["window outside record (edge)"] += 1
            continue
        if i == 0:
            excluded["first beat (no RR interval)"] += 1
            continue

        ecg = resample_poly(filtered[start:end], win["resample_up"], win["resample_down"])[: win["out_len"]]
        ecg = ecg - np.median(ecg)
        ecg = ecg / (norm["scale_factor"] * a_rec)
        ecg = np.clip(ecg, norm["clip_min"], norm["clip_max"])

        channels = [ecg]
        if cfg["rr"]["use_rr_channel"]:
            rr_value = np.clip(rr[i] - 1.0, norm["clip_min"], norm["clip_max"])
            channels.append(np.full(win["out_len"], rr_value))

        X.append(np.stack(channels))
        y.append(sym2cls[sym])
        positions.append(pos)
        symbols.append(sym)
        rr_values.append(rr[i])

    n_channels = 2 if cfg["rr"]["use_rr_channel"] else 1
    X = np.asarray(X, dtype=np.float32).reshape(-1, n_channels, win["out_len"])
    y = np.asarray(y, dtype=np.int64)
    info = {"sample": np.asarray(positions), "symbol": np.asarray(symbols),
            "rr_ratio": np.asarray(rr_values), "a_rec": a_rec, "exclusions": excluded}
    return X, y, info


# ---------------------------------------------------------------- building the splits
def build_split(cfg, records, split_name):
    """Process all records of one split. Returns the data and two lists of table rows."""
    parts = {k: [] for k in ("X", "y", "record", "sample", "symbol", "rr_ratio")}
    exclusion_rows, normalization_rows = [], []

    for record in records:
        try:
            sig, fs, samples, symbols, channel = read_record(cfg["paths"]["mitdb"], record, cfg["lead"])
        except ValueError as error:   # lead missing; does not happen for DS1/DS2
            print(f"[skip] {error}")
            continue
        assert fs == cfg["fs"], f"record {record}: unexpected sampling rate {fs}"

        X, y, info = process_signal(sig, fs, samples, symbols, cfg)
        clipped = (np.abs(X[:, 0]) >= 0.99).any(axis=1)   # beat touches the clipping limit
        class_counts = " ".join(f"{c}={int((y == i).sum())}" for i, c in enumerate(CLASSES))
        print(f"  [{split_name}] record {record}: MLII=ch{channel} beats={len(y)} {class_counts} "
              f"a_rec={info['a_rec']:.3f} mV clipped={clipped.mean():.3%}")

        parts["X"].append(X)
        parts["y"].append(y)
        parts["record"].append(np.full(len(y), record))
        parts["sample"].append(info["sample"])
        parts["symbol"].append(info["symbol"])
        parts["rr_ratio"].append(info["rr_ratio"])

        for reason, count in sorted(info["exclusions"].items()):
            exclusion_rows.append({"split": split_name, "record": record, "reason": reason, "count": count})
        normalization_rows.append({"split": split_name, "record": record, "mlii_channel": channel,
                                   "a_rec_mV": round(info["a_rec"], 4), "beats": len(y),
                                   "beats_with_clipping": int(clipped.sum()),
                                   "V_beats_with_clipping": int((clipped & (y == 2)).sum())})

    data = {k: np.concatenate(v) for k, v in parts.items()}
    return data, exclusion_rows, normalization_rows


def environment_info(cfg):
    """Software versions and the full configuration, saved for reproducibility."""
    import matplotlib
    import scipy
    import sklearn
    import wfdb

    return {"python": sys.version.split()[0], "platform": platform.platform(),
            "numpy": np.__version__, "scipy": scipy.__version__, "pandas": pd.__version__,
            "wfdb": wfdb.__version__, "matplotlib": matplotlib.__version__,
            "pyyaml": yaml.__version__, "scikit-learn (EDA only)": sklearn.__version__,
            "config": cfg}


def save_statistics(cfg, split_rows, record_rows, symbol_rows, exclusion_rows, normalization_rows, train_y):
    """Write all CSV tables used in the report to the results folder."""
    res = cfg["paths"]["results"]

    stats = pd.DataFrame(split_rows)
    stats.to_csv(os.path.join(res, "split_stats.csv"), index=False)
    pd.DataFrame(record_rows).to_csv(os.path.join(res, "record_class_counts.csv"), index=False)
    pd.DataFrame(symbol_rows).to_csv(os.path.join(res, "symbol_counts.csv"), index=False)
    pd.DataFrame(normalization_rows).to_csv(os.path.join(res, "record_normalization.csv"), index=False)

    exclusions = pd.DataFrame(exclusion_rows)
    exclusions.to_csv(os.path.join(res, "exclusions_by_record.csv"), index=False)
    per_split = exclusions.groupby(["reason", "split"])["count"].sum().unstack(fill_value=0)
    per_split.reindex(columns=["train", "val", "test"], fill_value=0).to_csv(os.path.join(res, "exclusions.csv"))

    # class counts, percentages and ratios relative to F
    counts = stats.set_index("split")[CLASSES]
    percent = counts.div(counts.sum(axis=1), axis=0).mul(100).round(2)
    percent.columns = [f"{c}_percent" for c in CLASSES]
    ratio = counts.div(counts["F"].replace(0, np.nan), axis=0).round(1)
    ratio.columns = [f"{c}_per_F" for c in CLASSES]
    pd.concat([counts, percent, ratio], axis=1).to_csv(os.path.join(res, "class_counts.csv"))

    # class weights from the training split only (used for the loss in Submission 2)
    weights = class_weights(train_y, power=cfg["class_weight_power"])
    pd.DataFrame({"class": CLASSES, "train_count": np.bincount(train_y, minlength=4),
                  "weight": np.round(weights, 4)}).to_csv(os.path.join(res, "class_weights.csv"), index=False)

    print(stats.to_string(index=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/data.yaml")
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()

    cfg = load_config(args.config)
    check_splits(cfg)
    if args.download:
        download(cfg)
    os.makedirs(cfg["paths"]["processed"], exist_ok=True)
    os.makedirs(cfg["paths"]["results"], exist_ok=True)

    split_rows, record_rows, symbol_rows, exclusion_rows, normalization_rows = [], [], [], [], []
    sym2cls = symbol_to_class(cfg)

    for split, file_name in (("train", "ds1_train"), ("val", "ds1_val"), ("test", "ds2_test")):
        records = cfg["records"][split]
        print(f"[split] {split}: {records}")
        data, excl, norm = build_split(cfg, records, split)
        np.savez_compressed(os.path.join(cfg["paths"]["processed"], file_name + ".npz"), **data)
        exclusion_rows += excl
        normalization_rows += norm

        y, rec = data["y"], data["record"]
        if split == "train":
            train_y = y

        row = {"split": split, "records": len(np.unique(rec)),
               "subjects": len({subject_id(int(r), cfg) for r in np.unique(rec)})}
        row.update({c: int((y == i).sum()) for i, c in enumerate(CLASSES)})
        row["total"] = int(len(y))
        split_rows.append(row)

        for r in np.unique(rec):
            in_record = rec == r
            record_rows.append({"split": split, "record": int(r),
                                **{c: int((y[in_record] == i).sum()) for i, c in enumerate(CLASSES)},
                                "total": int(in_record.sum())})
        for symbol, count in sorted(Counter(data["symbol"]).items()):
            symbol_rows.append({"split": split, "symbol": symbol,
                                "class": CLASSES[sym2cls[symbol]], "count": count})
        print(f"  -> {file_name}.npz X={data['X'].shape}")

    save_statistics(cfg, split_rows, record_rows, symbol_rows, exclusion_rows, normalization_rows, train_y)
    with open(os.path.join(cfg["paths"]["results"], "environment_prepare.json"), "w") as f:
        json.dump(environment_info(cfg), f, indent=2, default=str)


if __name__ == "__main__":
    main()
