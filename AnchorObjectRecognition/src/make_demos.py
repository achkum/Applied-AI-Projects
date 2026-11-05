"""Export both annotated demos as H.264 with five-second title cards.
Usage: python src/make_demos.py [--ffmpeg /path/to/ffmpeg]
Requires ffmpeg with the libx264 encoder, separately installed on PATH.
"""
import argparse
import os
import shutil
import subprocess
import tempfile

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from pipeline import ROOT, load_config
from evaluate import final_setting
from visualize import demo, FPS


def export_demos(ffmpeg):
    cfg = load_config()
    tau, _ = final_setting(cfg)
    for seq in (cfg["dev_seq"], cfg["final_seq"]):
        demo(seq)
        with tempfile.TemporaryDirectory(prefix="project3_demo_") as tmp:
            card = os.path.join(tmp, "title.png")
            fig = plt.figure(figsize=(12.8, 8), dpi=100, facecolor="#202124")
            lines = [
                (0.70, "Anchor-Based Object Recognition and Localization", 22, "bold"),
                (0.58, "R7020E Computer Vision, Project 3", 17, "normal"),
                (0.49, "Luleå University of Technology", 14, "normal"),
                (0.38, f"{seq} sequence ({'development' if seq == cfg['dev_seq'] else 'held out'})", 20, "bold"),
                (0.26, f"DINOv2 + depth penalty, threshold {tau:.2f}", 17, "normal"),
                (0.16, "Green: accepted   Red: rejected best candidate   Grey: other candidates", 14, "normal"),
            ]
            for y, text, size, weight in lines:
                fig.text(0.5, y, text, ha="center", va="center", color="white", fontsize=size, weight=weight)
            fig.savefig(card, dpi=100, facecolor=fig.get_facecolor())
            plt.close(fig)
            raw = os.path.join(ROOT, "results", f"demo_{seq}_raw.mp4")
            out = os.path.join(ROOT, "results", f"demo_{seq}.mp4")
            command = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                       "-loop", "1", "-framerate", str(FPS), "-t", "5", "-i", card,
                       "-i", raw, "-filter_complex",
                       "[0:v]setsar=1,format=yuv420p[a];[1:v]setsar=1,format=yuv420p[b];[a][b]concat=n=2:v=1:a=0[v]",
                       "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                       "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]
            subprocess.run(command, check=True)
            os.remove(raw)
            print("exported", out)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    args = parser.parse_args()
    if not args.ffmpeg:
        parser.error("ffmpeg is required; install it on PATH or use --ffmpeg /path/to/ffmpeg")
    export_demos(args.ffmpeg)
