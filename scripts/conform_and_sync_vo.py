#!/usr/bin/env python3
"""
Conform Inworld VO lines to exact reference pacing and build word-level sync map.
"""

import json
import os
import subprocess
import wave
from pathlib import Path
import numpy as np

ROOT = Path("/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine")
VO_DIR = ROOT / "assets/audio/generated_vo"
CONFORMED_DIR = ROOT / "assets/audio/conformed_vo"
CONFORMED_DIR.mkdir(parents=True, exist_ok=True)

TARGET_SLOTS = [
    {"id": "01", "file": "v2_line_01.mp3", "start": 0.00, "end": 1.28, "text": "I just got rid of my to-do list."},
    {"id": "02", "file": "v2_line_02.mp3", "start": 1.48, "end": 4.48, "text": "Not because I stopped having things to do, but because the list never actually got shorter."},
    {"id": "03", "file": "v2_line_03.mp3", "start": 4.68, "end": 7.22, "text": "Every day I would film, edit, write, answer DMs."},
    {"id": "04", "file": "v2_line_04.mp3", "start": 7.36, "end": 8.26, "text": "Yeah, it was exhausting."},
    {"id": "05", "file": "v2_line_05.mp3", "start": 8.54, "end": 9.86, "text": "But why do I keep doing it all myself?"},
    {"id": "06", "file": "v2_line_06.mp3", "start": 10.20, "end": 11.88, "text": "Because I thought that's what being a creator looked like."},
    {"id": "07", "file": "v2_line_07.mp3", "start": 12.08, "end": 14.56, "text": "And the question I get asked the most: how do you stay on top of everything?"},
    {"id": "08", "file": "v2_line_08.mp3", "start": 14.94, "end": 16.20, "text": "Well, I don't."},
    {"id": "09", "file": "v2_line_09.mp3", "start": 16.48, "end": 19.10, "text": "Someone comments a keyword and they get something valuable on my account."},
    {"id": "10", "file": "v2_line_10.mp3", "start": 19.36, "end": 21.70, "text": "No list, no backlog, no catching up at midnight."},
    {"id": "11", "file": "v2_line_11.mp3", "start": 21.94, "end": 23.16, "text": "Just more time to actually create."},
    {"id": "12", "file": "v2_line_12.mp3", "start": 23.40, "end": 25.56, "text": "Comment SIMPLE and I'll send you exactly how I set it up."}
]

SR = 48000
TOTAL_DUR = 25.625
TOTAL_SAMPLES = int(SR * TOTAL_DUR)
master_vo = np.zeros(TOTAL_SAMPLES, dtype=np.float32)

def get_duration(fpath):
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(fpath)]
    out = subprocess.check_output(cmd).decode().strip()
    return float(out)

for slot in TARGET_SLOTS:
    in_file = VO_DIR / slot["file"]
    target_dur = slot["end"] - slot["start"]
    trimmed_wav = CONFORMED_DIR / f"trimmed_{slot['id']}.wav"
    conformed_wav = CONFORMED_DIR / f"conformed_{slot['id']}.wav"
    
    # 1. Trim leading and trailing silence
    trim_cmd = [
        "ffmpeg", "-y", "-i", str(in_file),
        "-af", "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.01,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.01,areverse",
        "-ar", str(SR), "-ac", "1", str(trimmed_wav)
    ]
    subprocess.run(trim_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    
    raw_dur = get_duration(trimmed_wav)
    tempo = raw_dur / target_dur
    
    # Clamp tempo to reasonable range [1.0, 2.0]
    tempo = max(1.0, min(2.0, tempo))
    
    # 2. Resample with atempo
    # atempo can be chained if > 2.0
    filter_str = f"atempo={tempo:.4f}"
    conform_cmd = [
        "ffmpeg", "-y", "-i", str(trimmed_wav),
        "-af", filter_str,
        "-ar", str(SR), "-ac", "1", str(conformed_wav)
    ]
    subprocess.run(conform_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    
    # Read samples into numpy master track
    with wave.open(str(conformed_wav), "rb") as w:
        samples = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    
    start_idx = int(slot["start"] * SR)
    end_idx = min(TOTAL_SAMPLES, start_idx + len(samples))
    usable_len = end_idx - start_idx
    master_vo[start_idx:end_idx] += samples[:usable_len]
    print(f"Slot {slot['id']} [{slot['start']:05.2f}s - {slot['end']:05.2f}s]: tempo={tempo:.2f}x len={len(samples)/SR:.2f}s -> conformed")

# Save master VO
out_master = ROOT / "assets/audio/vo_conformed_master.wav"
scaled = np.clip(master_vo * 32767, -32768, 32767).astype(np.int16)
with wave.open(str(out_master), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(scaled.tobytes())

print(f"✅ Conformed Master VO saved to: {out_master} ({len(scaled)/SR:.3f}s)")
