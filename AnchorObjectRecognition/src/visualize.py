"""Figures for the report, slides and guide (results/figures) and the annotated demo video (results/demo_<sequence>.mp4).
Usage: python src/visualize.py              all figures
       python src/visualize.py demo eval    demo video of one sequence (eval or test)
"""
import json
import os
import sys
import shutil

import cv2
import matplotlib
import matplotlib.patches
import numpy as np
import pandas as pd

from evaluate import decisions, final_setting, fit_cue_thresholds, load_sequence
from pipeline import CROP_HEIGHT, ROOT, SiftMatcher, crop_box, list_frames, load_anchor_crops, load_config, red_candidates, red_mask

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

FIG = os.path.join(ROOT, "results", "figures")
NL = chr(10)  # line break inside figure labels
def draw_frame(img, rows_all, best, accepted, gt):
    """Reference box in cyan (thick, drawn first), every candidate in grey, the chosen one green (accepted) or
    red (rejected) drawn thinner on top, so both stay visible when the chosen box is the reference box."""
    if gt:
        cv2.rectangle(img, (gt[0] - 2, gt[1] - 2), (gt[2] + 2, gt[3] + 2), (255, 200, 0), 3)
    for _, r in rows_all.iterrows():
        b = r["box"]
        cv2.rectangle(img, (b[0], b[1]), (b[2], b[3]), (150, 150, 150), 1)
    if best is not None:
        b = best["box"]
        cv2.rectangle(img, (b[0], b[1]), (b[2], b[3]), (0, 200, 0) if accepted else (0, 0, 230), 1)
        cv2.putText(img, f"{best['adj']:.2f}", (b[0], max(12, b[1] - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    (0, 200, 0) if accepted else (0, 0, 230), 2)
    return img


def example_figure(cfg, sets, tau, pen, cue_thr):
    """2x2 figure: correct detection, rejected print, false positive, missed object (when they exist)."""
    cats = {"tp": None, "reject": None, "fp": None, "fn": None}
    for seq, (df, present, n, labels, frames) in sets.items():
        dec = decisions(df, n, tau, pen, cue_thr)
        for f, (r, acc) in enumerate(dec):
            ok = acc and r["real"]
            if present[f] and ok and cats["tp"] is None and f > n // 3:
                cats["tp"] = (seq, f)
            if not present[f] and not acc and r is not None and cats["reject"] is None and r["box"][3] - r["box"][1] > 40:
                cats["reject"] = (seq, f)
            if acc and not ok and cats["fp"] is None:
                cats["fp"] = (seq, f)
            if present[f] and not ok and cats["fn"] is None:
                cats["fn"] = (seq, f)
    titles = {"tp": "Correct detection of the real extinguisher", "reject": "Printed picture correctly rejected",
              "fp": "False positive (accepted a print)", "fn": "Missed real extinguisher"}
    fig, axes = plt.subplots(2, 2, figsize=(10, 6.4))
    for ax, key in zip(axes.flat, cats):
        ax.axis("off")
        if cats[key] is None:
            ax.set_title(titles[key] + ": none occurred", fontsize=9)
            continue
        seq, f = cats[key]
        df, present, n, labels, frames = sets[seq]
        name = os.path.basename(frames[f][0])
        dec = decisions(df, n, tau, pen, cue_thr)
        img = draw_frame(cv2.imread(frames[f][0]), df[df["frame"] == f], dec[f][0], dec[f][1], labels[name]["box"])
        ax.imshow(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        ax.set_title(f"{titles[key]} ({seq} #{f + 1})", fontsize=9)
    fig.text(0.5, 0.01, "cyan = reference box, grey = other candidates, green = accepted, red = rejected, number = score",
             ha="center", fontsize=8)
    fig.savefig(os.path.join(FIG, "examples.png"), dpi=200, bbox_inches="tight")
    plt.close(fig)
    return cats


def score_figure(all_df):
    """Histograms of each matcher's score for real candidates vs printed/other candidates."""
    fig, axes = plt.subplots(1, 3, figsize=(11, 3.2))
    for ax, (col, title) in zip(axes, [("s_hist", "Colour histogram"), ("s_sift", "SIFT (inliers/15)"), ("s_dino", "DINOv2")]):
        bins = np.linspace(all_df[col].min(), all_df[col].max() + 1e-6, 30)
        ax.hist(all_df.loc[all_df.real, col], bins, alpha=0.7, label="real", color="#2c7d4a")
        ax.hist(all_df.loc[~all_df.real, col], bins, alpha=0.7, label="print / other", color="#c4122f")
        ax.set(title=title, xlabel="score", ylabel="candidates")
    axes[0].legend(fontsize=8)
    fig.savefig(os.path.join(FIG, "score_distributions.png"), dpi=200, bbox_inches="tight")
    plt.close(fig)


def cue_figure(all_df, cue_thr):
    """Real-world height vs depth relief for every candidate, with the chosen cue thresholds."""
    d = all_df.dropna(subset=["relief"])
    fig, ax = plt.subplots(figsize=(5.5, 4))
    ax.scatter(d.height_m[~d.real], d.relief[~d.real].clip(-600, 1500), s=12, c="#c4122f", alpha=0.6, label="print / other")
    ax.scatter(d.height_m[d.real], d.relief[d.real].clip(-600, 1500), s=12, c="#2c7d4a", alpha=0.6, label="real")
    ax.axvspan(cue_thr[2], min(cue_thr[3], 1.6), color="grey", alpha=0.12, label="plausible height")
    ax.axhline(cue_thr[0], color="grey", ls="--", lw=0.8)
    ax.set(xlim=(0, 1.6), xlabel="real-world height of candidate (m)", ylabel="depth relief (mm)")
    ax.legend(fontsize=8)
    fig.savefig(os.path.join(FIG, "cue_separation.png"), dpi=200, bbox_inches="tight")
    plt.close(fig)


def sift_figure(cfg, sets):
    """SIFT matches between an anchor and (left) a real candidate, (right) a print: both look similar."""
    anchors = load_anchor_crops(cfg)
    M = SiftMatcher(anchors, n0=cfg["sift_n0"], ratio=cfg["sift_ratio"])
    anchor = M.anchors[1]
    a_img = cv2.resize(anchors[1], (max(8, anchors[1].shape[1] * CROP_HEIGHT // anchors[1].shape[0]), CROP_HEIGHT))
    panels = []
    for seq, want_real in (("eval", True), ("test", False)):
        df, present, n, labels, frames = sets[seq]
        d = df[(df.real == want_real) & (df.box.apply(lambda b: b[3] - b[1]) > 60)]
        r = d.iloc[len(d) // 2]
        img = cv2.imread(frames[int(r["frame"])][0])
        crop = crop_box(img, r["box"])
        c_img = cv2.resize(crop, (max(8, crop.shape[1] * CROP_HEIGHT // crop.shape[0]), CROP_HEIGHT))
        (ka, da), (kc, dc) = anchor, M._features(crop)
        pairs = M.matcher.knnMatch(da, dc, k=2)
        good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < M.ratio * p[1].distance]
        vis = cv2.drawMatches(a_img, ka, c_img, kc, good, None, matchColor=(60, 200, 60), flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
        panels.append((vis, f"{'Real candidate' if want_real else 'Printed picture'} ({seq} #{int(r['frame']) + 1}): "
                            f"{len(good)} matches, {M._inliers(anchor, (kc, dc))} RANSAC inliers"))
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2))
    for ax, (vis, title) in zip(axes, panels):
        ax.imshow(cv2.cvtColor(vis, cv2.COLOR_BGR2RGB))
        ax.set_title(title, fontsize=9)
        ax.axis("off")
    fig.savefig(os.path.join(FIG, "sift_matches.png"), dpi=200, bbox_inches="tight")
    plt.close(fig)


def anchors_figure(cfg):
    """The three anchor crops side by side."""
    crops = load_anchor_crops(cfg)
    fig, axes = plt.subplots(1, 3, figsize=(6, 3))
    for ax, c, i in zip(axes, crops, (1, 2, 3)):
        ax.imshow(cv2.cvtColor(c, cv2.COLOR_BGR2RGB))
        ax.set_title(f"Anchor {i}", fontsize=9)
        ax.axis("off")
    fig.savefig(os.path.join(FIG, "anchors.png"), dpi=200, bbox_inches="tight")
    plt.close(fig)


def architecture_figure():
    """Block diagram of the whole system: shared stages on the left, one lane per method, an optional cue penalty
    (dashed), a decision and an output per lane. Greyscale, plain functional labels."""
    fig, ax = plt.subplots(figsize=(11.2, 5.9))
    fig.subplots_adjust(left=0.005, right=0.995, top=0.995, bottom=0.005)  # use the whole figure
    ax.set_xlim(0, 141)
    ax.set_ylim(-9, 69)
    ax.axis("off")
    INK, GREY, LIGHT = "#1c1c1c", "#efefef", "#b8b8b8"

    def rect(x, y, w, h, fill="#ffffff", ls="-", lw=1.0):
        ax.add_patch(matplotlib.patches.Rectangle((x, y), w, h, fc=fill, ec=INK, lw=lw, ls=ls))

    def comp(x, y, w, h, title, lines=(), fill="#ffffff", ls="-"):
        rect(x, y, w, h, fill, ls)
        ax.text(x + w / 2, y + h - 2.6, title, ha="center", va="center", fontsize=10.4, fontweight="bold", color=INK)
        if lines:
            ax.text(x + w / 2, y + (h - 5.0) / 2, NL.join(lines), ha="center", va="center", fontsize=10, color=INK, linespacing=1.55)

    def arrow(x1, y1, x2, y2, label=None, lx=None, ly=None, ha="center"):
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.0, mutation_scale=9))
        if label:
            ax.text(lx if lx is not None else (x1 + x2) / 2, ly if ly is not None else y1 + 1.0, label, ha=ha, va="bottom", fontsize=9.5, color="#444444")

    def seg(xs, ys):
        ax.plot(xs, ys, color=INK, lw=1.0, solid_capstyle="butt")

    lanes = [("HSV histogram", ["cosine similarity", "(baseline)"], 54), ("SIFT", ["keypoint matches,", "RANSAC inliers"], 33),
             ("DINOv2", ["frozen embedding,", "cosine similarity"], 12)]

    # lane separators
    for y in (43.5, 22.5):
        ax.plot([48, 141], [y, y], color=LIGHT, lw=0.8, ls=(0, (2, 3)))

    # inputs and shared stages
    comp(0, 56, 15, 9, "Colour frame", ["640 x 400"])
    comp(0, 43, 15, 9, "Anchor photos", ["3 images"])
    comp(0, 5, 15, 9, "Depth frame", ["nearest in time"])
    comp(20, 40, 22, 26, "Candidate regions", ["red colour mask,", "connected regions,", "split pieces", "joined"], GREY)
    comp(20, 4, 22, 18, "Depth cues", ["relief, planarity,", "real-world height;", "c = failed checks"], GREY)
    arrow(15.4, 60.5, 19.6, 60.5)
    arrow(15.4, 47.5, 19.6, 47.5)
    arrow(15.4, 9.5, 19.6, 9.5)
    arrow(31, 39.6, 31, 22.4, "boxes", lx=34.5, ly=29.5, ha="left")

    # candidate crops bus and the three matchers
    seg([42.4, 46], [47, 47])
    seg([46, 46], [12, 54])
    for title, lines, yc in lanes:
        arrow(46, yc, 49.6, yc)
        comp(50, yc - 7, 22, 14, title, lines)
    ax.text(44.5, 48.2, "crops", ha="right", va="bottom", fontsize=9.5, color="#444444")

    # cue counts bus (drawn with gaps where the score arrows cross it), then the optional cue penalty
    seg([31, 31], [4, 1.5])
    seg([31, 78], [1.5, 1.5])
    bus_x, gaps = 78, [yc + 2 for _, _, yc in lanes]
    cuts = sorted(gaps)
    y0 = 1.5
    for g in cuts:
        seg([bus_x, bus_x], [y0, g - 1.3])
        y0 = g + 1.3
    seg([bus_x, bus_x], [y0, 54 - 3])
    ax.text(79.2, 1.9, "c", ha="left", va="bottom", fontsize=9.5, color="#444444", style="italic")
    for title, lines, yc in lanes:
        arrow(72.4, yc + 2, 81.6, yc + 2, "s" if yc == 54 else None, lx=75.5, ly=yc + 2.8)
        arrow(bus_x, yc - 3, 81.6, yc - 3)
        comp(82, yc - 7, 18, 14, "Cue penalty", ["optional", r"$\tilde{s}=s-\lambda c$"], "#ffffff", (0, (4, 2)))
        arrow(100.4, yc, 105.6, yc)
        comp(106, yc - 7, 17, 14, "Decision", ["best box", "per frame", r"$\tilde{s}\geq\tau$ ?"])
        arrow(123.4, yc, 127.6, yc)
        comp(128, yc - 7, 12.5, 14, "Output", ["present:", "box + score", "or absent"])
    ax.text(114.5, -3.7, r"$\tau$ chosen on the development sequence", ha="center", va="center", fontsize=9.5, color="#444444")

    # legend and notation
    rect(0, -5.2, 5, 3, "#ffffff", (0, (4, 2)))
    ax.text(6.5, -3.7, "optional cues; system 7 uses the cues with a constant score", ha="left", va="center", fontsize=9.5, color="#444444")
    ax.text(0, -8, r"$s$: matcher score in [0, 1]     $c$: number of failed depth checks     $\tilde{s}$: adjusted score     $\tau$: decision threshold",
            ha="left", va="center", fontsize=9.5, color="#444444")
    fig.savefig(os.path.join(FIG, "architecture.png"), dpi=200, bbox_inches="tight")
    plt.close(fig)


def candidates_figure(cfg):
    """One frame in three panels: the frame, the red mask, and the candidate boxes (the hose-split body joined)."""
    frames = list_frames(cfg, cfg["dev_seq"])
    img = cv2.imread(frames[32][0])
    mask = red_mask(img)
    boxed = img.copy()
    for b in red_candidates(img):
        cv2.rectangle(boxed, (b[0], b[1]), (b[2], b[3]), (0, 200, 0), 2)
    fig, axes = plt.subplots(1, 3, figsize=(12, 2.9))
    for ax, im, title in zip(axes, (img, mask, boxed), ("Colour frame", "Red mask (HSV, opened and closed)",
                                                       "Tall red regions, hose-split pieces joined")):
        ax.imshow(cv2.cvtColor(im, cv2.COLOR_BGR2RGB) if im.ndim == 3 else im, cmap="gray")
        ax.set_title(title, fontsize=9)
        ax.axis("off")
    fig.savefig(os.path.join(FIG, "candidates.png"), dpi=200, bbox_inches="tight")
    plt.close(fig)


def frames_figure(cfg):
    """One frame with the real extinguisher and one frame where only printed pictures are visible."""
    frames = list_frames(cfg, cfg["dev_seq"])
    fig, axes = plt.subplots(1, 2, figsize=(8, 2.6))
    for ax, i, title in zip(axes, (32, 74), ("Real extinguisher (and prints)", "Only printed pictures")):
        ax.imshow(cv2.cvtColor(cv2.imread(frames[i][0]), cv2.COLOR_BGR2RGB))
        ax.set_title(title, fontsize=9)
        ax.axis("off")
    fig.savefig(os.path.join(FIG, "data_frames.png"), dpi=200, bbox_inches="tight")
    plt.close(fig)


def score_over_time_figure(sets, cue_thr, tau, pen):
    """Best-candidate score of the final system in every frame, with the threshold."""
    fig, axes = plt.subplots(1, 2, figsize=(11, 3.2))
    for ax, (seq, (df, present, n, labels, frames)) in zip(axes, sets.items()):
        score = [r["adj"] if r is not None else np.nan for r, _ in decisions(df, n, tau, pen, cue_thr)]
        ax.plot(range(1, n + 1), score, "-o", ms=3, lw=1, color="#1d5bbd")
        ax.axhline(tau, color="grey", ls="--", lw=1, label="threshold")
        for f in range(n):
            ax.axvspan(f + 0.5, f + 1.5, color="#2c7d4a" if present[f] else "#c4122f", alpha=0.10, lw=0)
        ax.set_title(f"{seq}: best candidate score per frame (green = target present, red = absent)", fontsize=8)
        ax.set(xlabel="frame", ylabel="score")
    axes[0].legend(fontsize=8)
    fig.savefig(os.path.join(FIG, "score_over_time.png"), dpi=200, bbox_inches="tight")
    plt.close(fig)


def figures():
    cfg = load_config()
    os.makedirs(FIG, exist_ok=True)
    sets = {}
    for seq in (cfg["dev_seq"], cfg["final_seq"]):
        df, present, n = load_sequence(seq)
        labels = json.load(open(os.path.join(ROOT, "data", f"labels_{seq}.json")))
        sets[seq] = (df, present, n, labels, list_frames(cfg, seq))
    cue_thr, _ = fit_cue_thresholds(sets[cfg["dev_seq"]][0])
    tau, pen = final_setting(cfg)
    all_df = pd.concat([sets[s][0] for s in sets])
    print("examples:", example_figure(cfg, sets, tau, pen, cue_thr))
    score_figure(all_df)
    cue_figure(all_df, cue_thr)
    sift_figure(cfg, sets)
    score_over_time_figure(sets, cue_thr, tau, pen)
    anchors_figure(cfg)
    frames_figure(cfg)
    candidates_figure(cfg)
    architecture_figure()
    report_figures = os.path.join(ROOT, "report", "figures")
    os.makedirs(report_figures, exist_ok=True)
    for name in os.listdir(FIG):
        if name.endswith(".png"):
            shutil.copy2(os.path.join(FIG, name), os.path.join(report_figures, name))
    print("figures saved in", FIG, "and synchronized to", report_figures)

# ====================================================================================================
# Demo video
# ====================================================================================================

SCALE = 2  # draw the 640x400 frames twice as big
FPS = 4    # the recording has about 4 colour frames per second


def demo(seq):
    cfg = load_config()
    cue_thr, _ = fit_cue_thresholds(load_sequence(cfg["dev_seq"])[0])
    tau, pen = final_setting(cfg)
    df, present, n = load_sequence(seq)
    dec = decisions(df, n, tau, pen, cue_thr)
    frames = list_frames(cfg, seq)

    out_path = os.path.join(ROOT, "results", f"demo_{seq}_raw.mp4")
    writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (640 * SCALE, 400 * SCALE))
    font = cv2.FONT_HERSHEY_SIMPLEX
    for f, (path, _) in enumerate(frames):
        img = cv2.resize(cv2.imread(path), None, fx=SCALE, fy=SCALE)
        best, accepted = dec[f]
        for _, r in df[df.frame == f].iterrows():  # every candidate in grey
            x1, y1, x2, y2 = [v * SCALE for v in r["box"]]
            cv2.rectangle(img, (x1, y1), (x2, y2), (160, 160, 160), 1)
        if best is not None:
            x1, y1, x2, y2 = [v * SCALE for v in best["box"]]
            color = (0, 200, 0) if accepted else (0, 0, 230)
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 3)
            cv2.putText(img, f"{best['adj']:.2f}", (x1, max(18, y1 - 6)), font, 0.8, color, 2)
        verdict = "TARGET PRESENT" if accepted else "TARGET ABSENT"
        cv2.rectangle(img, (0, 0), (640 * SCALE, 40), (30, 30, 30), -1)
        cv2.putText(img, f"{seq}  frame {f + 1}/{n}   {verdict}   (DINOv2 + depth cues, threshold {tau:.2f})",
                    (10, 27), font, 0.7, (0, 220, 0) if accepted else (80, 80, 255), 2)
        writer.write(img)
    writer.release()
    print("saved", out_path)


if __name__ == "__main__":
    if sys.argv[1:2] == ["demo"]:
        demo(sys.argv[2] if len(sys.argv) > 2 else load_config()["final_seq"])
    else:
        figures()
