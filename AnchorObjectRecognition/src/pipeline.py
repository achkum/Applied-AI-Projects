"""Scoring pipeline: load the frames, find candidate regions, score every candidate with three matchers
(HSV histogram, SIFT, DINOv2), compute the depth features, and save everything to data/scores_<sequence>.csv.
Usage: python src/pipeline.py        (about 5 minutes on a CPU)
"""
import glob
import os
import time

import cv2
import numpy as np
import pandas as pd
import yaml


# ====================================================================================================
# 1. Data: configuration, frames, depth frame nearest in time
# ====================================================================================================

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)  # the submission folder


def load_config(path=None):
    """Read configs/default.yaml and turn its relative paths into absolute ones."""
    path = path or os.path.join(ROOT, "configs", "default.yaml")
    with open(path) as f:
        cfg = yaml.safe_load(f)
    for key in ("raw_dir", "anchors_dir"):
        cfg[key] = os.path.normpath(os.path.join(ROOT, cfg[key]))
    return cfg


def _timestamp(path):
    # File names end with the ROS time in nanoseconds, e.g. camera_color_image_1727164373617020425.png
    return int(os.path.splitext(os.path.basename(path))[0].split("_")[-1])


def list_frames(cfg, seq):
    """Return [(colour_path, timestamp_ns)] for one sequence, sorted in time."""
    files = sorted(glob.glob(os.path.join(cfg["raw_dir"], seq, "camera_color_image_raw", "*.png")))
    return [(f, _timestamp(f)) for f in files]


def pair_depth(cfg, seq, frames):
    """For every colour frame return (depth_path or None, gap_ms), using the nearest depth frame in time."""
    depth_files = sorted(glob.glob(os.path.join(cfg["raw_dir"], seq, "camera_depth_image_raw", "*.png")))
    depth_ts = np.array([_timestamp(f) for f in depth_files])
    pairs = []
    for _, ts in frames:
        i = int(np.argmin(np.abs(depth_ts - ts)))
        gap_ms = abs(int(depth_ts[i]) - ts) / 1e6
        pairs.append((depth_files[i] if gap_ms <= cfg["max_depth_gap_ms"] else None, gap_ms))
    return pairs


# ====================================================================================================
# 2. Candidate regions: red blobs that may contain the extinguisher
# ====================================================================================================

MIN_AREA = 40       # smallest red blob (pixels) that can be the body of a distant extinguisher
MIN_TALLNESS = 1.2  # the body is taller than it is wide
MAX_CANDIDATES = 6  # keep only the biggest few per frame
MERGE_GAP = 0.2     # a red piece is joined to the body if the gap between them is below this fraction of the body height
MERGE_MAX_WIDTH = 1.5  # ... and if it is at most this many times as wide as the body (keeps out wide red objects)


def crop_box(img, box):
    """Crop a red-body box with a margin that also takes in the valve on top and a little background."""
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    x1, x2 = max(0, int(x1 - 0.15 * w)), min(img.shape[1], int(x2 + 0.15 * w))
    y1, y2 = max(0, int(y1 - 0.2 * h)), min(img.shape[0], int(y2 + 0.05 * h))
    return img[y1:y2, x1:x2]


def red_mask(img):
    """Binary mask of red pixels."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Red sits at both ends of the hue range, so two ranges are combined.
    mask = cv2.inRange(hsv, (0, 120, 70), (10, 255, 255)) | cv2.inRange(hsv, (170, 120, 70), (180, 255, 255))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))   # remove speckle
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))  # fill label gaps in the body


def red_candidates(img):
    """Return candidate boxes [x1, y1, x2, y2], biggest red region first."""
    n, _, stats, _ = cv2.connectedComponentsWithStats(red_mask(img))
    comps = [tuple(stats[i]) for i in range(1, n)]  # label 0 is the background; each is (x, y, w, h, area)
    seeds = sorted((c for c in comps if c[4] >= MIN_AREA and c[3] >= MIN_TALLNESS * c[2]), key=lambda c: -c[4])

    boxes = []
    for x, y, w, h, _ in seeds[:MAX_CANDIDATES]:
        x1, y1, x2, y2 = x, y, x + w, y + h
        # The black hose can cut the red body in two. Merge red pieces directly above or below the seed.
        for cx, cy, cw, ch, area in comps:
            overlaps_x = cx < x2 + 0.3 * w and cx + cw > x1 - 0.3 * w
            gap = max(cy - y2, y1 - (cy + ch))  # vertical gap between the two pieces
            if area >= 15 and overlaps_x and gap <= MERGE_GAP * h and cw <= MERGE_MAX_WIDTH * w:
                x1, y1, x2, y2 = min(x1, cx), min(y1, cy), max(x2, cx + cw), max(y2, cy + ch)
        box = [int(x1), int(y1), int(x2), int(y2)]
        if box not in boxes:  # two seeds can merge into the same box
            boxes.append(box)
    return boxes


# ====================================================================================================
# 3. Anchors: cut the three anchor photos down to the extinguisher
# ====================================================================================================

def load_anchor_crops(cfg=None):
    """Return the 3 anchor crops (BGR images). The crops are also saved in anchors/ for the report."""
    cfg = cfg or load_config()
    out_dir = os.path.join(ROOT, "anchors")
    os.makedirs(out_dir, exist_ok=True)
    crops = []
    for path in sorted(glob.glob(os.path.join(cfg["anchors_dir"], "Anchor*.png"))):
        img = cv2.imread(path)
        small = cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)  # 4032 px is far too big
        boxes = red_candidates(small)
        crop = crop_box(small, boxes[0])  # the biggest red region is the extinguisher body
        cv2.imwrite(os.path.join(out_dir, os.path.basename(path).lower().replace("anchor", "anchor_crop_")), crop)
        crops.append(crop)
    return crops


# ====================================================================================================
# 4a. Matcher: HSV colour histogram (baseline)
# ====================================================================================================

def _hist(bgr):
    """Hue-saturation histogram of a crop, as a unit-length vector."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256]).flatten()
    return h / (np.linalg.norm(h) + 1e-9)


class HistMatcher:
    def __init__(self, anchor_crops):
        self.anchors = [_hist(a) for a in anchor_crops]

    def score(self, crop_bgr):
        """Return (score in [0, 1], None). Score = best cosine similarity to any anchor; histograms are non-negative,
        so the cosine is already in [0, 1]. The second value keeps the same shape as the other matchers."""
        h = _hist(crop_bgr)
        return max(float(h @ a) for a in self.anchors), None


# ====================================================================================================
# 4b. Matcher: SIFT features + RANSAC
# ====================================================================================================

CROP_HEIGHT = 160  # every crop is resized to this height first, so anchors and candidates have similar scale


class SiftMatcher:
    def __init__(self, anchor_crops, n0=15, ratio=0.8):
        self.n0, self.ratio = n0, ratio
        self.detector = cv2.SIFT_create(contrastThreshold=0.02)  # low threshold: small crops have weak contrast
        self.matcher = cv2.BFMatcher(cv2.NORM_L2)
        self.anchors = [self._features(a) for a in anchor_crops]  # computed once

    def _features(self, bgr):
        """Resize to a fixed height, then return (keypoints, descriptors)."""
        h, w = bgr.shape[:2]
        gray = cv2.cvtColor(cv2.resize(bgr, (max(8, int(w * CROP_HEIGHT / h)), CROP_HEIGHT)), cv2.COLOR_BGR2GRAY)
        return self.detector.detectAndCompute(gray, None)

    def _inliers(self, anchor, cand):
        """Number of matches that agree on one rotation + scale + shift (RANSAC)."""
        (ka, da), (kc, dc) = anchor, cand
        if da is None or dc is None or len(dc) < 3 or len(da) < 3:
            return 0
        pairs = self.matcher.knnMatch(da, dc, k=2)
        good = [p[0] for p in pairs if len(p) == 2 and p[0].distance < self.ratio * p[1].distance]  # Lowe ratio test
        if len(good) < 3:
            return 0
        src = np.float32([ka[m.queryIdx].pt for m in good])
        dst = np.float32([kc[m.trainIdx].pt for m in good])
        _, mask = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=4)
        return int(mask.sum()) if mask is not None else 0

    def score(self, crop_bgr):
        """Return (score in [0, 1], inlier count per anchor). Score = best anchor's inliers / n0, capped at 1."""
        cand = self._features(crop_bgr)
        counts = [self._inliers(a, cand) for a in self.anchors]
        return min(1.0, max(counts) / self.n0), counts


# ====================================================================================================
# 4c. Matcher: DINOv2 embedding (frozen, CPU only)
# ====================================================================================================

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)  # ImageNet statistics DINOv2 was trained with
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
SIZE = 112  # crop is resized to SIZE x SIZE*0.5 -> 8 x 4 patches of 14 px (extinguishers are tall and thin)
VIEW_HEIGHTS = [40, 70, 112, 200]  # anchor heights (pixels) used to build blurred copies of every anchor


class DinoMatcher:
    def __init__(self, anchor_crops):
        import torch  # imported here so scripts that never use DINOv2 start fast
        torch.set_num_threads(4)
        # ViT-S/14: the smallest DINOv2 (21M parameters), pretrained by Meta, used frozen (no training).
        self.model = torch.hub.load("facebookresearch/dinov2:7764ea0f912e53c92e82eb78a2a1631e92725fc8", "dinov2_vits14", verbose=False, trust_repo=True).eval()
        # The anchors are sharp phone photos but the frames are small and blurry, so each anchor is also embedded
        # at lower resolutions (shrunk, then enlarged again) to look like a distant candidate.
        views = []
        for a in anchor_crops:
            for h in VIEW_HEIGHTS:
                small = cv2.resize(a, (max(8, a.shape[1] * h // a.shape[0]), h), interpolation=cv2.INTER_AREA)
                views.append(self.embed(small))
        self.anchors = torch.cat(views)  # (3 anchors x views, 384), computed once

    def embed(self, bgr):
        """Return the unit-length embedding (1, 384) of one crop: the CLS token of DINOv2."""
        import torch
        rgb = cv2.cvtColor(cv2.resize(bgr, (SIZE // 2, SIZE)), cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        x = torch.from_numpy(((rgb - MEAN) / STD).transpose(2, 0, 1))[None]
        with torch.no_grad():
            return torch.nn.functional.normalize(self.model(x), dim=1)

    def score(self, crop_bgr):
        """Return (score in [0, 1], cosine per anchor view). Score = best view's cosine, rescaled from [-1, 1]."""
        cos = (self.embed(crop_bgr) @ self.anchors.T)[0].tolist()
        return (max(cos) + 1) / 2, cos


# ====================================================================================================
# 5. Depth features of a candidate (cues are applied in evaluate.py)
# ====================================================================================================

def depth_features(box, depth, fy_px):
    """Return (relief_mm, rms_mm, height_m) for a candidate box, or NaNs if there is too little valid depth.
    relief: how much farther the surroundings are than the object (a real object stands out, a print does not).
    rms:    how badly the depth inside the box fits one flat plane (a print is flat, a cylinder is not).
    height_m: real-world height of the box = pixel height * distance / focal length. The real extinguisher is
              about 0.6 m tall, most printed pictures are smaller.
    """
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    inner = depth[y1:y2, x1:x2].astype(float)

    # Ring around the box, 30% wider on every side (depth 0 means "no reading").
    mx, my = max(4, int(0.3 * w)), max(4, int(0.3 * h))
    X1, Y1 = max(0, x1 - mx), max(0, y1 - my)
    X2, Y2 = min(depth.shape[1], x2 + mx), min(depth.shape[0], y2 + my)
    ring = depth[Y1:Y2, X1:X2].astype(float)
    ring[(y1 - Y1):(y2 - Y1), (x1 - X1):(x2 - X1)] = 0  # remove the box itself from the ring

    ring_vals, in_vals = ring[ring > 0], inner[inner > 0]
    if len(in_vals) < 5 or len(ring_vals) < 5:
        return np.nan, np.nan, np.nan
    relief = np.median(ring_vals) - np.median(in_vals)

    # Least-squares plane z = a*x + b*y + c through the valid depth pixels inside the box.
    ys, xs = np.nonzero(inner > 0)
    A = np.c_[xs, ys, np.ones(len(xs))]
    coef, *_ = np.linalg.lstsq(A, in_vals, rcond=None)
    rms = np.sqrt(np.mean((A @ coef - in_vals) ** 2))
    height_m = h * np.median(in_vals) / 1000 / fy_px
    return float(relief), float(rms), float(height_m)


# ====================================================================================================
# 6. Score every candidate and save the table
# ====================================================================================================

def score_sequence(cfg, seq, matchers):
    """One row per candidate: box, depth cue features, the score of every matcher and how long each took."""
    frames = list_frames(cfg, seq)
    pairs = pair_depth(cfg, seq, frames)
    rows = []
    for fi, ((path, ts), (depth_path, gap_ms)) in enumerate(zip(frames, pairs)):
        img = cv2.imread(path)
        depth = cv2.imread(depth_path, -1) if depth_path else None
        t0 = time.perf_counter()
        boxes = red_candidates(img)
        t_cand = 1000 * (time.perf_counter() - t0)
        for box in boxes:
            row = {"seq": seq, "frame": fi, "name": os.path.basename(path), "box": box, "t_cand_ms": t_cand / max(1, len(boxes))}
            row["relief"], row["rms"], row["height_m"] = depth_features(box, depth, cfg["fy_px"]) if depth is not None else (float("nan"),) * 3
            crop = crop_box(img, box)
            for name, matcher in matchers.items():  # hist, sift, dino
                t0 = time.perf_counter()
                row["s_" + name] = matcher.score(crop)[0]
                row["t_" + name + "_ms"] = 1000 * (time.perf_counter() - t0)
            rows.append(row)
    return pd.DataFrame(rows)


if __name__ == "__main__":
    cfg = load_config()
    anchors = load_anchor_crops(cfg)
    matchers = {
        "hist": HistMatcher(anchors),
        "sift": SiftMatcher(anchors, n0=cfg["sift_n0"], ratio=cfg["sift_ratio"]),
        "dino": DinoMatcher(anchors),
    }
    for seq in (cfg["dev_seq"], cfg["final_seq"]):
        df = score_sequence(cfg, seq, matchers)
        out = os.path.join(ROOT, "data", f"scores_{seq}.csv")
        df.to_csv(out, index=False)
        print(f"{seq}: {len(df)} candidates in {df.frame.nunique()} frames -> {out}")
