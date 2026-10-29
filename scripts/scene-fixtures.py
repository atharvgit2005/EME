"""Controlled tracking tests with known positions; not evidence of real-footage accuracy."""

import sys, json, subprocess, math
from pathlib import Path
import numpy as np, cv2

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(42)
bg = np.clip(rng.normal(58, 18, (360, 640, 3)), 0, 255).astype("uint8")
for y in range(20, 360, 40):
    cv2.line(bg, (0, y), (639, y), (95, 80, 65), 1)
for x in range(20, 640, 40):
    cv2.line(bg, (x, 0), (x, 359), (80, 75, 90), 1)
for mode in ["motion", "occlusion", "cut", "vfr"]:
    target = out / (mode + ".mp4")
    args = [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-s",
        "640x360",
        "-r",
        "15",
        "-i",
        "-",
        "-an",
    ]
    if mode == "vfr":
        args += [
            "-vf",
            "setpts=(if(lt(N\\,15)\\,N/15\\,1+(N-15)/10))/TB",
            "-fps_mode",
            "vfr",
        ]
    args += [
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        str(target),
    ]
    proc = subprocess.Popen(args, stdin=subprocess.PIPE)
    gt = []
    for i in range(30):
        camera = i // 3
        x = 70 + 3 * i + camera
        y = 100 + int(4 * math.sin(i / 6))
        frame = cv2.warpAffine(
            bg,
            np.float32([[1, 0, camera], [0, 1, 0]]),
            (640, 360),
            borderMode=cv2.BORDER_REFLECT,
        )
        cv2.rectangle(frame, (x, y), (x + 89, y + 149), (30, 135, 225), -1)
        cv2.rectangle(frame, (x, y), (x + 89, y + 149), (0, 0, 0), 2)
        for a in range(10, 85, 15):
            for b in range(10, 145, 15):
                cv2.circle(frame, (x + a, y + b), 3, (35 + a, 50 + b, 80), -1)
        visible = True
        if mode == "occlusion" and 10 <= i < 21:
            cv2.rectangle(frame, (x - 20, y - 15), (x + 115, y + 170), (5, 5, 5), -1)
            visible = False
        if mode == "cut" and i >= 15:
            frame[:] = (230, 230, 230)
            visible = False
        proc.stdin.write(frame.tobytes())
        gt.append(
            {
                "frameIndex": i,
                "bounds": dict(x=x, y=y, width=90, height=150),
                "visible": visible,
            }
        )
    proc.stdin.close()
    assert proc.wait() == 0
    (out / (mode + "-gt.json")).write_text(json.dumps(gt))
print(out)
