"""Verify saved results independently of the evaluation decision/metric helpers.
Usage: python src/verify_results.py (no raw images or model download needed).
"""
import json
import os

import numpy as np
import pandas as pd

from evaluate import fit_cue_thresholds, load_sequence, metrics
from pipeline import ROOT, load_config


def main():
    # A correct target, an accepted print, and a misplaced box: all accepts are
    # in the localization denominator, and the misplaced box is both FP and FN.
    m = metrics(np.array([0.9, 0.9, 0.9]), np.array([True, False, False]),
                np.array([True, False, True]), 0.5)
    assert (m["tp"], m["fp"], m["fn"]) == (1, 2, 1)
    assert np.isclose(m["loc"], 1 / 3)
    assert metrics(np.array([0.1]), np.array([True]), np.array([True]), 0.5)["loc"] == 0

    cfg = load_config()
    cue, _ = fit_cue_thresholds(load_sequence(cfg["dev_seq"])[0])
    table = pd.read_csv(os.path.join(ROOT, "results", "results_table.csv"))
    assert len(table) == 14
    for _, setting in table.iterrows():
        seq = setting.seq
        with open(os.path.join(ROOT, "data", f"labels_{seq}.json")) as f:
            labels = json.load(f)
        data = pd.read_csv(os.path.join(ROOT, "data", f"scores_{seq}.csv"))
        if setting.system.startswith("7 "):
            column = None
        elif "HSV" in setting.system:
            column = "s_hist"
        elif "SIFT" in setting.system:
            column = "s_sift"
        else:
            column = "s_dino"
        accepted = {}
        for name, group in data.groupby("name", sort=False):
            candidates = []
            for _, row in group.iterrows():
                score = 1.0 if column is None else float(row[column])
                if isinstance(setting.cue_mode, str) and setting.cue_mode:
                    failures = 0 if np.isnan(row.relief) else (
                        int(row.relief < cue[0] and row.rms < cue[1])
                        + int(not cue[2] <= row.height_m <= cue[3]))
                    if setting.cue_mode == "veto" and failures:
                        continue
                    if setting.cue_mode != "veto":
                        score -= float(setting.cue_mode.split()[1]) * failures
                candidates.append((score, json.loads(row.box)))
            if candidates:
                score, box = max(candidates, key=lambda x: x[0])
                if score >= setting.tau:
                    accepted[name] = box
        tp = 0
        for name, box in accepted.items():
            label = labels[name]
            if label["present"]:
                x1, y1, x2, y2 = label["box"]
                tp += int(x1 <= (box[0] + box[2]) / 2 <= x2 and y1 <= (box[1] + box[3]) / 2 <= y2)
        fp = len(accepted) - tp
        present = sum(label["present"] for label in labels.values())
        fn = present - tp
        assert (tp, fp, fn) == (setting.tp, setting.fp, setting.fn), (setting.system, seq)
        precision = tp / len(accepted) if accepted else 0.0
        assert np.isclose(setting.precision, precision)
        assert np.isclose(setting.recall, tp / present)
        assert np.isclose(setting["loc"], precision)
        print(f"PASS {seq}: {setting.system}; TP/FP/FN={tp}/{fp}/{fn}, localization={tp}/{len(accepted)}")
    print("PASS metric edge cases and all 14 saved result rows")


if __name__ == "__main__":
    main()
