"""Evaluation: apply the depth cues, choose every threshold on the development sequence, report on the held-out
sequence, and measure the extra analysis (anchors, target size).
Usage: python src/evaluate.py             tune on test, report on eval -> results/results_table.csv
       python src/evaluate.py analysis    anchor / size / coverage analysis -> results/analysis.json
"""
import json
import os
import sys

import cv2
import matplotlib
import numpy as np
import pandas as pd

from pipeline import ROOT, VIEW_HEIGHTS, DinoMatcher, crop_box, list_frames, load_anchor_crops, load_config

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

CUE_RELIEF_GRID = [0, 30, 60, 100, 150]        # mm: candidate must stand out from its surroundings by this much ...
CUE_RMS_GRID = [100, 150, 200, 300, 500, 1e9]  # mm: ... or be this far from a flat plane
CUE_MIN_HEIGHT_GRID = [0, 0.3, 0.4, 0.45, 0.5]  # m: smallest plausible real-world height
CUE_MAX_HEIGHT_GRID = [0.9, 1.0, 1e9]           # m: largest plausible real-world height
CUE_MIN_REAL_KEPT = 0.95                       # a cue setting may drop at most 5% of the real extinguisher boxes on dev

# (name, score column, matchers used, cues on). "none" is a constant score: every candidate gets 1, so the system
# accepts the biggest region that passes both cues at tau=1. This ablation also makes the cues an effective veto.
SYSTEMS = [
    ("1 HSV histogram (baseline)", "hist", ["hist"], False),
    ("2 HSV + cues", "hist", ["hist"], True),
    ("3 SIFT", "sift", ["sift"], False),
    ("4 SIFT + cues", "sift", ["sift"], True),
    ("5 DINOv2", "dino", ["dino"], False),
    ("6 DINOv2 + cues (final)", "dino", ["dino"], True),
    ("7 candidates + cues, no matcher", "none", [], True),
]
FINAL = "6 DINOv2 + cues (final)"


# ====================================================================================================
# 1. Depth cues
# ====================================================================================================

def cue_failures(relief, rms, height_m, min_relief, min_rms, min_h, max_h):
    """Number of cue checks a candidate fails (0, 1 or 2), works on arrays:
    check 1: it looks flat (does not stand out from its surroundings and fits a plane);
    check 2: its real-world height is not plausible for the extinguisher.
    If there is no depth information (nan) the cues cannot object, so the result is 0."""
    relief, rms, height_m = np.asarray(relief), np.asarray(rms), np.asarray(height_m)
    flat = ~((relief >= min_relief) | (rms >= min_rms))
    wrong_size = ~((height_m >= min_h) & (height_m <= max_h))
    return np.where(np.isnan(relief), 0, flat.astype(int) + wrong_size.astype(int))


def looks_real(relief, rms, height_m, min_relief, min_rms, min_h, max_h):
    """True if the candidate passes both checks."""
    return cue_failures(relief, rms, height_m, min_relief, min_rms, min_h, max_h) == 0


def fit_cue_thresholds(df):
    """Dev only: the cue setting that keeps >= 95% of the real extinguisher boxes and lets the fewest prints through."""
    best = None
    for rl in CUE_RELIEF_GRID:
        for rms in CUE_RMS_GRID:
            for hmin in CUE_MIN_HEIGHT_GRID:
                for hmax in CUE_MAX_HEIGHT_GRID:
                    keep = looks_real(df["relief"], df["rms"], df["height_m"], rl, rms, hmin, hmax)
                    real_kept, print_kept = keep[df["main"]].mean(), keep[~df["real"]].mean()
                    if real_kept >= CUE_MIN_REAL_KEPT and (best is None or print_kept < best[0]):
                        best = (print_kept, rl, rms, hmin, hmax, real_kept)
    return best[1:5], best


def apply_cues(df, col, cue_thr, penalty):
    """Return the table with an 'adj' column: the matcher score after the cues.
    cue_thr None: cues off. penalty inf: a candidate that fails a check is removed (veto).
    Otherwise its score is lowered by penalty * number of failed checks."""
    df = df.copy()
    df["adj"] = df[col]
    if cue_thr is None:
        return df
    fails = cue_failures(df["relief"], df["rms"], df["height_m"], *cue_thr)
    if np.isinf(penalty):
        return df[fails == 0]
    df["adj"] = df[col] - penalty * fails
    return df


# ====================================================================================================
# 2. Data, decision rule, metrics
# ====================================================================================================

def iou(a, b):
    """Intersection over union of two boxes [x1, y1, x2, y2]."""
    ix, iy = max(0, min(a[2], b[2]) - max(a[0], b[0])), max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter)


def load_sequence(seq):
    """Return (scores table with a 'real' flag per candidate, present flag per frame, number of frames)."""
    labels = json.load(open(os.path.join(ROOT, "data", f"labels_{seq}.json")))
    names = sorted(labels)
    df = pd.read_csv(os.path.join(ROOT, "data", f"scores_{seq}.csv"))
    df["box"] = df["box"].apply(json.loads)
    df["s_none"] = 1.0  # constant score for system 7; ties keep the first candidate, which is the biggest red region

    def is_real(r):  # a candidate is "real" if its centre lies inside the reference box
        g = labels[r["name"]]
        if not g["present"]:
            return False
        (x1, y1, x2, y2), (a1, b1, a2, b2) = r["box"], g["box"]
        return a1 <= (x1 + x2) / 2 <= a2 and b1 <= (y1 + y2) / 2 <= b2

    df["real"] = df.apply(is_real, axis=1)
    df["iou"] = df.apply(lambda r: iou(r["box"], labels[r["name"]]["box"]) if labels[r["name"]]["present"] else 0.0, axis=1)
    # "main" = the candidate that best covers the real extinguisher in each frame (small fragments are not main)
    df["main"] = (df["iou"] == df.groupby("frame")["iou"].transform("max")) & df["real"]
    present = np.array([labels[n]["present"] for n in names])
    return df, present, len(names)


def best_per_frame(df, n_frames, col, cue_thr, penalty=np.inf):
    """For every frame: score of its best candidate (after cues) and whether that candidate is the real one."""
    df = apply_cues(df, col, cue_thr, penalty)
    score, real = np.full(n_frames, -np.inf), np.zeros(n_frames, bool)
    if len(df):
        best = df.loc[df.groupby("frame")["adj"].idxmax()]
        score[best["frame"].values], real[best["frame"].values] = best["adj"].values, best["real"].values
    return score, real


def decisions(df, n_frames, tau, pen, cue_thr, col="s_dino"):
    """Per frame: the best candidate's row (or None) and whether it is accepted. Used by the figures and the demo."""
    df = apply_cues(df, col, cue_thr, pen)
    best = {}
    for f, g in df.groupby("frame"):
        r = g.loc[g["adj"].idxmax()]
        best[f] = (r, r["adj"] >= tau)
    return [best.get(f, (None, False)) for f in range(n_frames)]


def metrics(score, real, present, tau):
    """Counts and rates for one threshold. Accepting a wrong box on a present frame is both a FP and a FN."""
    accepted = score >= tau
    ok = accepted & present & real
    tp, fp = int(ok.sum()), int((accepted & ~(present & real)).sum())
    fn = int((present & ~ok).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / present.sum()
    loc = tp / int(accepted.sum()) if accepted.any() else 0.0  # all accepted detections, including prints
    return dict(tau=tau, precision=precision, recall=recall, tp=tp, fp=fp, fn=fn, loc=loc)


def meets_target(m, min_precision):
    """Ranking of a dev result: first whether it reaches the required precision, then its recall.
    Below the target, precision + recall decides, so the fallback still prefers the least bad setting."""
    if m["precision"] >= min_precision:
        return (True, m["recall"])
    return (False, m["precision"] + m["recall"])


def choose_tau(score, real, present, min_precision):
    """Highest recall with precision >= min_precision; if that is never reached, the best F1."""
    taus = np.unique(score[np.isfinite(score)])
    results = [metrics(score, real, present, t) for t in taus]
    ok = [m for m in results if m["precision"] >= min_precision]
    if ok:
        return max(ok, key=lambda m: (m["recall"], m["tau"])), results

    def f1(m):
        return 2 * m["precision"] * m["recall"] / (m["precision"] + m["recall"] + 1e-9)
    return max(results, key=f1), results


def ms_per_frame(df, n_frames, matchers):
    """Partial processing time: candidate generation plus matcher calls; excludes depth features, I/O and setup."""
    cols = ["t_cand_ms"] + [f"t_{m}_ms" for m in matchers]
    return float(df[cols].sum().sum() / n_frames)


def final_setting(cfg):
    """Threshold and cue penalty of the final system, as chosen on dev (read from the results table)."""
    t = pd.read_csv(os.path.join(ROOT, "results", "results_table.csv"))
    row = t[(t.system == FINAL) & (t.seq == cfg["dev_seq"])].iloc[0]
    pen = np.inf if row.cue_mode == "veto" else float(str(row.cue_mode).split()[1])
    return row.tau, pen


def penalty_of(cue_mode):
    """Cue penalty from the text in the results table: '' (cues off), 'veto' or 'penalty 0.05'."""
    mode = str(cue_mode)
    if mode.startswith("penalty"):
        return float(mode.split()[1])
    return np.inf


# ====================================================================================================
# 3. The seven systems: tune on dev, report on held-out
# ====================================================================================================

def main():
    cfg = load_config()
    dev_seq, fin_seq, min_p = cfg["dev_seq"], cfg["final_seq"], cfg["min_precision"]
    dev, dev_present, n_dev = load_sequence(dev_seq)
    fin, fin_present, n_fin = load_sequence(fin_seq)

    cue_thr, info = fit_cue_thresholds(dev)
    print(f"Cue thresholds chosen on {dev_seq}: (relief >= {cue_thr[0]} mm or plane RMS >= {cue_thr[1]:.0f} mm) and "
          f"height {cue_thr[2]}-{cue_thr[3]} m (keeps {100 * info[5]:.0f}% of real candidates, {100 * info[0]:.0f}% of prints)")

    rows, curves = [], {}
    for name, col, matchers, use_cues in SYSTEMS:
        thr = cue_thr if use_cues else None
        penalties = cfg["cue_penalties"] + [np.inf] if use_cues else [np.inf]  # inf = hard veto
        best = None
        for pen in penalties:  # veto or penalty: whichever works better on dev
            s, r = best_per_frame(dev, n_dev, "s_" + col, thr, pen)
            m, curve = choose_tau(s, r, dev_present, min_p)
            if best is None or meets_target(m, min_p) > meets_target(best[1], min_p):
                best = (pen, m, curve)
        pen, m_dev, curve = best
        curves[name] = curve
        s, r = best_per_frame(fin, n_fin, "s_" + col, thr, pen)
        m_fin = metrics(s, r, fin_present, m_dev["tau"])  # the dev threshold, unchanged
        cue_mode = "" if not use_cues else ("veto" if np.isinf(pen) else f"penalty {pen}")
        for seq, m, d, n in ((dev_seq, m_dev, dev, n_dev), (fin_seq, m_fin, fin, n_fin)):
            rows.append(dict(system=name, seq=seq, cue_mode=cue_mode, **m, ms_per_frame=ms_per_frame(d, n, matchers)))

    table = pd.DataFrame(rows)
    os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
    table.to_csv(os.path.join(ROOT, "results", "results_table.csv"), index=False)
    pd.set_option("display.width", 200)
    for seq in (dev_seq, fin_seq):
        role = "dev (thresholds tuned here)" if seq == dev_seq else "held-out (reported)"
        print(f"\n== {seq}: {role} ==")
        print(table[table.seq == seq].drop(columns="seq").to_string(index=False, float_format=lambda v: f"{v:.2f}"))

    # Precision-recall curves on dev, including the discrete operating points of system 7.
    fig, ax = plt.subplots(figsize=(6, 4.5))
    for name, curve in curves.items():
        if len(curve) > 1:
            pts = sorted((m["recall"], m["precision"]) for m in curve)
            ax.plot(*zip(*pts), label=name.strip(), lw=1.6)
    ax.axhline(min_p, color="grey", ls="--", lw=0.8)
    ax.set(xlabel="Recall", ylabel="Precision", title=f"Precision-recall on {dev_seq} (dev)", ylim=(0, 1.02), xlim=(0, 1.02))
    ax.legend(fontsize=7)
    os.makedirs(os.path.join(ROOT, "results", "figures"), exist_ok=True)
    fig.savefig(os.path.join(ROOT, "results", "figures", "pr_curves_dev.png"), dpi=200, bbox_inches="tight")


# ====================================================================================================
# 4. Extra analysis for the reflection: candidate coverage, anchors, target size
# ====================================================================================================

def load_all(cfg):
    """Both sequences: (scores, present, n_frames, labels, frames) each."""
    sets = {}
    for seq in (cfg["dev_seq"], cfg["final_seq"]):
        df, present, n = load_sequence(seq)
        labels = json.load(open(os.path.join(ROOT, "data", f"labels_{seq}.json")))
        sets[seq] = (df, present, n, labels, list_frames(cfg, seq))
    return sets


def coverage(sets):
    """Does some candidate hit the real extinguisher in every target frame, and how well do the boxes fit?"""
    out = {}
    for seq, (df, present, n, labels, frames) in sets.items():
        names = [os.path.basename(f[0]) for f in frames]
        best_iou = np.array([max((iou(b, labels[names[f]]["box"]) for b in df[df.frame == f].box), default=0)
                             for f in np.nonzero(present)[0]])
        out[f"coverage_{seq}"] = dict(present_frames=int(present.sum()), frames_with_hit=int(df[df.real].frame.nunique()),
                                      iou50=float((best_iou >= 0.5).mean()), iou70=float((best_iou >= 0.7).mean()))
    return out


def anchor_subsets(cfg, sets, cue_thr, pen):
    """Contribution of each anchor: DINOv2 cosine of every candidate against each anchor's views, and the final
    system re-run with only some of the anchors (threshold re-chosen on dev each time, cue setting unchanged)."""
    matcher = DinoMatcher(load_anchor_crops(cfg))
    nv = len(VIEW_HEIGHTS)
    cos = {}
    for seq, (df, _, _, _, frames) in sets.items():
        rows = [(matcher.embed(crop_box(cv2.imread(frames[int(r["frame"])][0]), r["box"])) @ matcher.anchors.T)[0].numpy()
                for _, r in df.iterrows()]
        cos[seq] = np.array(rows).reshape(len(df), 3, nv)  # candidate x anchor x view
    allc = np.concatenate([cos[s] for s in sets])
    real = np.concatenate([sets[s][0].real.values for s in sets])
    per_anchor = allc.max(2)  # best view per anchor
    out = {"anchor_mean_cos_real": per_anchor[real].mean(0).round(3).tolist(),
           "anchor_mean_cos_print": per_anchor[~real].mean(0).round(3).tolist(),
           "anchor_wins_real": np.bincount(per_anchor[real].argmax(1), minlength=3).tolist()}

    subsets = {"all three": [0, 1, 2], "without anchor 1": [1, 2], "without anchor 2": [0, 2], "without anchor 3": [0, 1],
               "anchor 1 only": [0], "anchor 2 only": [1], "anchor 3 only": [2]}
    dev_seq, fin_seq = cfg["dev_seq"], cfg["final_seq"]
    result = {}
    for name, sub in subsets.items():
        scored = {seq: sets[seq][0].assign(s_sub=(cos[seq][:, sub, :].max((1, 2)) + 1) / 2) for seq in sets}
        d, p, n = scored[dev_seq], sets[dev_seq][1], sets[dev_seq][2]
        m_dev, _ = choose_tau(*best_per_frame(d, n, "s_sub", cue_thr, pen), p, cfg["min_precision"])
        d, p, n = scored[fin_seq], sets[fin_seq][1], sets[fin_seq][2]
        m = metrics(*best_per_frame(d, n, "s_sub", cue_thr, pen), p, m_dev["tau"])
        result[name] = dict(dev_precision=round(m_dev["precision"], 2), dev_recall=round(m_dev["recall"], 2),
                            eval_precision=round(m["precision"], 2), eval_recall=round(m["recall"], 2))
    out["anchor_subsets"] = result
    return out


def recall_by_size(cfg, sets, cue_thr):
    """Share of target frames found, by height of the reference box (pixels), for three systems."""
    table = pd.read_csv(os.path.join(ROOT, "results", "results_table.csv"))
    out = {}
    for name, col, cues in [("3 SIFT", "s_sift", False), ("5 DINOv2", "s_dino", False), (FINAL, "s_dino", True)]:
        row = table[(table.system == name) & (table.seq == cfg["dev_seq"])].iloc[0]
        pen = penalty_of(row.cue_mode) if cues else np.inf
        found = {"<40 px": [], "40-80 px": [], ">=80 px": []}
        for seq, (df, present, n, labels, frames) in sets.items():
            s, r = best_per_frame(df, n, col, cue_thr if cues else None, pen)
            ok = (s >= row.tau) & r
            for f in np.nonzero(present)[0]:
                gt = labels[os.path.basename(frames[f][0])]["box"]
                h = gt[3] - gt[1]
                found["<40 px" if h < 40 else "40-80 px" if h < 80 else ">=80 px"].append(bool(ok[f]))
        out[name] = {k: (round(float(np.mean(v)), 2) if v else None, len(v)) for k, v in found.items()}
    return {"recall_by_size": out}


def analysis():
    cfg = load_config()
    sets = load_all(cfg)
    cue_thr, _ = fit_cue_thresholds(sets[cfg["dev_seq"]][0])
    _, pen = final_setting(cfg)
    out = {}
    out.update(coverage(sets))
    out.update(anchor_subsets(cfg, sets, cue_thr, pen))
    out.update(recall_by_size(cfg, sets, cue_thr))
    json.dump(out, open(os.path.join(ROOT, "results", "analysis.json"), "w"), indent=1)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    if sys.argv[1:] == ["analysis"]:
        analysis()
    else:
        main()
