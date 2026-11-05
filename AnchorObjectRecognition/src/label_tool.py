"""Labelling helper. First-guess boxes (biggest red region) and a small local server for the browser labelling tool.
Usage: python src/label_tool.py prelabel    write data/prelabels_<sequence>.json
       python src/label_tool.py             serve the tool at http://localhost:8000 (labels go to data/labels_<sequence>.json)
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import cv2

from pipeline import ROOT, list_frames, load_config, red_candidates

HERE = os.path.dirname(os.path.abspath(__file__))


def prelabel():
    """Guess a box around the extinguisher in every frame (the biggest red region); a person corrects it in the tool."""
    cfg = load_config()
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    for seq in (cfg["dev_seq"], cfg["final_seq"]):
        guesses = {}
        for path, _ in list_frames(cfg, seq):
            boxes = red_candidates(cv2.imread(path))
            guesses[os.path.basename(path)] = {"present": bool(boxes), "box": boxes[0] if boxes else None}
        out = os.path.join(ROOT, "data", f"prelabels_{seq}.json")
        with open(out, "w") as f:
            json.dump(guesses, f, indent=1)
        print(f"{seq}: guessed a box in {sum(g['present'] for g in guesses.values())} of {len(guesses)} frames -> {out}")


CFG = load_config()
SEQS = (CFG["dev_seq"], CFG["final_seq"])
DATA = os.path.join(ROOT, "data")


def read_json(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def frame_list(seq):
    """One entry per frame: your saved label if there is one, otherwise the guess."""
    labels = read_json(os.path.join(DATA, f"labels_{seq}.json"))
    guesses = read_json(os.path.join(DATA, f"prelabels_{seq}.json"))
    out = []
    for path, _ in list_frames(CFG, seq):
        name = os.path.basename(path)
        item = labels.get(name) or guesses.get(name) or {"present": False, "box": None}
        out.append({"name": name, "present": item["present"], "box": item["box"], "reviewed": name in labels})
    return out


class Handler(BaseHTTPRequestHandler):
    def _send(self, body, ctype, code=200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/":  # the page itself
            with open(os.path.join(HERE, "label_tool.html"), "rb") as f:
                return self._send(f.read(), "text/html; charset=utf-8")
        if url.path == "/api/frames":
            seq = parse_qs(url.query).get("seq", [""])[0]
            if seq not in SEQS:
                return self._send(b"bad seq", "text/plain", 400)
            return self._send(json.dumps(frame_list(seq)).encode(), "application/json")
        if url.path.startswith("/img/"):  # /img/<seq>/<file name>
            _, _, seq, name = url.path.split("/", 3)
            path = os.path.join(CFG["raw_dir"], seq, "camera_color_image_raw", os.path.basename(name))
            if seq in SEQS and os.path.exists(path):
                with open(path, "rb") as f:
                    return self._send(f.read(), "image/png")
        self._send(b"not found", "text/plain", 404)

    def do_POST(self):
        url = urlparse(self.path)
        seq = parse_qs(url.query).get("seq", [""])[0]
        if url.path != "/api/save" or seq not in SEQS:
            return self._send(b"bad request", "text/plain", 400)
        item = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        path = os.path.join(DATA, f"labels_{seq}.json")
        labels = read_json(path)
        labels[item["name"]] = {"present": item["present"], "box": item["box"]}
        with open(path, "w") as f:
            json.dump(labels, f, indent=1)
        self._send(b"ok", "text/plain")

    def log_message(self, *args):  # overrides the server's request logging to keep the terminal quiet; args unused
        pass


def serve():
    os.makedirs(DATA, exist_ok=True)
    print("Labelling tool running at http://localhost:8000  (Ctrl+C to stop)")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()


if __name__ == "__main__":
    if sys.argv[1:] == ["prelabel"]:
        prelabel()
    else:
        serve()
