#!/usr/bin/env python3
"""Make the short website cut from the existing, narrated EME product film.

Usage: python3 scripts/build-website-demo.py /path/to/outputs/eme-cinematic-demo
Requires FFmpeg and ffprobe. No credentials or online services are used.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source_dir", type=Path)
parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "website/assets/demo")
args = parser.parse_args()
source = args.source_dir / "EME-Hackathon-Demo.mp4"
timeline = json.loads((args.source_dir / "timeline.json").read_text())
args.output.mkdir(parents=True, exist_ok=True)
labels = ["Meet EME", "Edit your timeline", "Request and review", "Compare designs", "Verified export", "Your next edit"]
chapters, filters, inputs, captions = [], [], [], []
offset = 0
for n, index in enumerate([1, 2, 3, 5, 8, 9]):
    scene = timeline["scenes"][index]
    start = scene["start"]
    duration = scene["duration"] - (1.5 if index == 9 else 0)
    chapters.append({"title": labels[n], "start": round(offset, 6), "duration": round(duration, 6),
                     "sourceStart": round(start, 6)})
    filters.append(f"[0:v]trim=start={start}:duration={duration},setpts=PTS-STARTPTS[v{n}]")
    filters.append(f"[0:a]atrim=start={start}:duration={duration},asetpts=PTS-STARTPTS,"
                   f"afade=t=in:d=0.04,afade=t=out:st={duration - 0.1}:d=0.1[a{n}]")
    inputs.append(f"[v{n}][a{n}]")
    for caption in timeline["captions"]:
        left, right = max(start, caption["start"]), min(start + duration, caption["end"])
        if right > left:
            captions.append({"start": offset + left - start, "end": offset + right - start,
                             "text": caption["text"]})
    offset += duration
filters.append("".join(inputs) + "concat=n=6:v=1:a=1[picture][audio]")
filters.append("[picture]scale=1600:900:flags=lanczos,setsar=1[video]")
output = args.output / "eme-walkthrough.mp4"
subprocess.run(["ffmpeg", "-y", "-v", "warning", "-i", str(source), "-filter_complex", ";".join(filters),
                "-map", "[video]", "-map", "[audio]", "-c:v", "libx264", "-preset", "medium", "-crf", "24",
                "-threads", "4", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k",
                "-ar", "48000", "-movflags", "+faststart", "-metadata", "title=EME — Request. Review. Render.",
                str(output)], check=True)
subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "5.8", "-i", str(output), "-frames:v", "1",
                "-q:v", "3", str(args.output / "eme-walkthrough-poster.jpg")], check=True)

def timestamp(value):
    ms = round(value * 1000)
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02}.{ms % 1000:03}"

vtt = "WEBVTT\n\n" + "\n\n".join(f"{timestamp(c['start'])} --> {timestamp(c['end'])}\n{c['text']}" for c in captions) + "\n"
(args.output / "eme-walkthrough.en.vtt").write_text(vtt)
manifest = {"title": "EME — Request. Review. Render.", "duration": round(offset, 6),
            "resolution": [1600, 900], "fps": 30, "chapters": chapters,
            "sourceFilm": source.name, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "bytes": output.stat().st_size,
            "provenance": "Short cut of the existing EME film: real Studio captures, generated demo footage, native EME export; Inworld Grayson narration and original procedural music. Edited presentation, not an uninterrupted screen recording."}
(args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest, indent=2))
