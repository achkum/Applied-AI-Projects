"""Write the LaTeX tables of the report from the saved results, so every number in report/tables/ comes from the code.
Usage: python src/make_tables.py        (after evaluate.py and evaluate.py analysis) -> report/tables/*.tex
params.tex and versions.tex are written by hand; they list settings, not results.
"""
import json
import os

import numpy as np
import pandas as pd

from evaluate import load_sequence
from pipeline import ROOT, list_frames, load_config, pair_depth

OUT = os.path.join(ROOT, "report", "tables")


def tex_table(columns, rows, align):
    """A booktabs table body: header row, then one row per entry."""
    lines = [r"\begin{tabular}{" + align + "}", r"\toprule", " & ".join(columns) + r" \\", r"\midrule"]
    lines += [" & ".join(str(v) for v in r) + r" \\" for r in rows]
    lines += [r"\bottomrule", r"\end{tabular}"]
    return "\n".join(lines) + "\n"


def write(name, text):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(text)


def results_tables(table, cfg):
    """One results table per sequence. Localization success as percentage and correct/accepted counts."""
    for seq in (cfg["dev_seq"], cfg["final_seq"]):
        rows = []
        for _, r in table[table.seq == seq].iterrows():
            rows.append([r.system[2:], f"{r.precision:.2f}", f"{r.recall:.2f}", r.tp, r.fp, r.fn,
                         f"{100 * r['loc']:.0f}\\% ({r.tp}/{r.tp + r.fp})", f"{r.ms_per_frame:.0f}"])
        write(f"results_{seq}.tex", tex_table(["System", "Precision", "Recall", "TP", "FP", "FN", "Loc.\\ success", "ms/frame"],
                                              rows, "lrrrrrrr"))


def thresholds_table(table, cfg):
    rows = []
    for _, r in table[table.seq == cfg["dev_seq"]].iterrows():
        cue = "--" if not isinstance(r.cue_mode, str) or not r.cue_mode else r.cue_mode
        rows.append([r.system[2:], f"{r.tau:.2f}", cue])
    write("thresholds.tex", tex_table(["System", "Decision threshold $\\tau$", "Cue handling"], rows, "lrl"))


def counts_table(cfg):
    rows = []
    for seq, role in ((cfg["dev_seq"], "development (tuned)"), (cfg["final_seq"], "held out")):
        df, present, n = load_sequence(seq)
        gaps = np.array([g for _, g in pair_depth(cfg, seq, list_frames(cfg, seq))])
        rows.append([f"\\texttt{{{seq}}}", role, n, int(present.sum()), int(n - present.sum()), len(df),
                     f"{np.median(gaps):.0f} / {gaps.max():.0f}"])
    write("counts.tex", tex_table(["Sequence", "Role", "Frames", "Present", "Absent", "Candidates", "Depth gap (ms)"],
                                  rows, "llrrrrr"))


def anchors_table(analysis):
    rows = [[name, f"{v['dev_precision']:.2f} / {v['dev_recall']:.2f}", f"{v['eval_precision']:.2f} / {v['eval_recall']:.2f}"]
            for name, v in analysis["anchor_subsets"].items()]
    write("anchors.tex", tex_table(["Anchors used", "\\texttt{test} P / R", "\\texttt{eval} P / R"], rows, "lrr"))


def size_table(analysis):
    rows = []
    for name, v in analysis["recall_by_size"].items():
        small = [x for k, x in v.items() if k != ">=80 px"]  # pool the two groups under 80 px
        n_small = sum(x[1] for x in small)
        rec_small = sum(x[0] * x[1] for x in small if x[0] is not None) / n_small
        rows.append([name[2:], f"{rec_small:.2f} ({n_small} frames)", f"{v['>=80 px'][0]:.2f} ({v['>=80 px'][1]} frames)"])
    write("size.tex", tex_table(["System", "Target under 80 px tall", "Target 80 px or taller"], rows, "lrr"))


if __name__ == "__main__":
    cfg = load_config()
    table = pd.read_csv(os.path.join(ROOT, "results", "results_table.csv"))
    analysis = json.load(open(os.path.join(ROOT, "results", "analysis.json")))
    os.makedirs(OUT, exist_ok=True)
    results_tables(table, cfg)
    thresholds_table(table, cfg)
    counts_table(cfg)
    anchors_table(analysis)
    size_table(analysis)
    print("tables written to", OUT)
