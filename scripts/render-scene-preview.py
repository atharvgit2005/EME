"""Render the immutable tracking table for visual inspection, not canonical delivery."""

import argparse, json, hashlib, subprocess
from pathlib import Path
import cv2, numpy as np

p = argparse.ArgumentParser()
p.add_argument("--source", required=True)
p.add_argument("--analysis", required=True)
p.add_argument("--output", required=True)
args = p.parse_args()
doc = json.loads(Path(args.analysis).read_text())
root = Path(args.analysis).parent
if (
    hashlib.sha256(Path(args.source).read_bytes()).hexdigest()
    != doc["source"]["sha256"]
):
    raise RuntimeError("Source changed")
w, h = doc["proxy"]["width"], doc["proxy"]["height"]
w -= w % 2
h -= h % 2
sx = w / doc["source"]["width"]
sy = h / doc["source"]["height"]
# A constant-rate review proxy samples actual source intervals. It is not the source time base.
fps = 30
duration = doc["source"]["endTick"] / 120000
proc = subprocess.Popen(
    [
        "ffmpeg",
        "-v",
        "error",
        "-n",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-s",
        f"{w}x{h}",
        "-r",
        str(fps),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        args.output,
    ],
    stdin=subprocess.PIPE,
)
cap = cv2.VideoCapture(args.source)
decoded = []
for entry in doc["frames"]:
    ok, img = cap.read()
    if not ok:
        raise RuntimeError("Video decode stopped")
    decoded.append(cv2.resize(img, (w, h)))
artifacts = {a["id"]: a for a in doc["artifacts"]}
j = 0
for i in range(int(np.ceil(duration * fps))):
    tick = min(doc["source"]["endTick"] - 1, round(i * 120000 / fps))
    while j + 1 < len(doc["frames"]) and doc["frames"][j + 1]["tick"] <= tick:
        j += 1
    f = doc["frames"][j]
    frame = decoded[j].copy()
    o = f["observed"]
    color = (130, 155, 155)
    if o:
        a = artifacts[o["maskId"]]
        file = root / (a["sha256"] + ".png")
        if hashlib.sha256(file.read_bytes()).hexdigest() != a["sha256"]:
            raise RuntimeError("Mask changed")
        mask = (
            cv2.resize(
                cv2.imread(str(file), cv2.IMREAD_GRAYSCALE),
                (w, h),
                interpolation=cv2.INTER_NEAREST,
            )
            > 0
        )
        color = (140, 175, 25) if o["method"] == "flow" else (45, 90, 235)
        tint = np.zeros_like(frame)
        tint[:] = color
        frame[mask] = (frame[mask] * 0.65 + tint[mask] * 0.35).astype("uint8")
        b = o["bounds"]
        label = o["method"]
    else:
        b = f["predictedBounds"]
        label = f["visibility"] + " / NO OBSERVATION"
    if b:
        x, y, bw, bh = [
            round(v)
            for v in [b["x"] * sx, b["y"] * sy, b["width"] * sx, b["height"] * sy]
        ]
        if o:
            cv2.rectangle(frame, (x, y), (x + bw, y + bh), color, 2)
        else:
            for a in range(x, x + bw, 12):
                cv2.line(frame, (a, y), (min(a + 6, x + bw), y), color, 2)
                cv2.line(frame, (a, y + bh), (min(a + 6, x + bw), y + bh), color, 2)
    cv2.rectangle(frame, (0, 0), (w, 47), (20, 22, 20), -1)
    cv2.putText(
        frame,
        "EME | TRACKING EVIDENCE PREVIEW",
        (10, 18),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (245, 245, 245),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        f"{i / fps:.2f}s | subject-1 | {label}",
        (10, 38),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.4,
        (230, 230, 230),
        1,
        cv2.LINE_AA,
    )
    proc.stdin.write(frame.tobytes())
proc.stdin.close()
cap.release()
if proc.wait() != 0:
    raise RuntimeError("Review video encoding failed")
print(
    json.dumps(
        {
            "output": str(Path(args.output).resolve()),
            "kind": "tracking_review_proxy",
            "sourceTimeBase": doc["source"]["timeBase"],
            "reviewFps": fps,
        }
    )
)
