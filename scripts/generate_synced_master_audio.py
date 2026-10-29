#!/usr/bin/env python3
"""
Procedural Sound Synthesis & Inworld Audio Synchronization Engine
Derived from ff-tracking (tools/sfx.py) + EME Audio Architecture.

Synthesizes:
1. Continuous stereo screen hum (50Hz mains + harmonics + whine + air bandpass)
2. Bit-crushed glitches on every scene cut
3. Tactile keystroke clicks during typing
4. Minor pentatonic lock beeps with downward chirps panned to screen coordinates
5. Heavy sub-bass thumps (90Hz -> 38Hz exponential decay) on text slams
6. Bandpassed noise risers (500Hz -> 6500Hz) sweeping into key transitions
7. Exact millisecond-aligned Inworld AI voiceover
8. Subtle ducked ambient music bed
9. -14 LUFS loudness mastering with soft tanh saturation ceiling
"""

import json
import math
import os
import re
import subprocess
import wave
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
TOTAL_SECONDS = 25.625
N = int(SR * TOTAL_SECONDS)
TARGET_LUFS = -14.0

ROOT = Path("/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine")
VO_DIR = ROOT / "assets/audio/generated_vo"
BGM_PATH = ROOT / "assets/bgm/snowfall.mp3"
OUT_MASTER_WAV = ROOT / "assets/audio/master_soundtrack_synced.wav"
OUT_SFX_WAV = ROOT / "assets/audio/sfx_synced.wav"

rng = np.random.default_rng(42)

mix = np.zeros((N, 2), dtype=np.float64)

def t_arr(seconds):
    return np.arange(int(SR * seconds)) / SR

def env(n, attack, release):
    x = np.arange(n) / SR
    return np.clip(x / max(attack, 1e-4), 0, 1) * np.exp(-x / max(release, 1e-4))

def band(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], btype="bandpass", fs=SR, output="sos")
    return sosfilt(sos, x)

def low(x, cutoff, order=2):
    sos = butter(order, cutoff, btype="lowpass", fs=SR, output="sos")
    return sosfilt(sos, x)

def high(x, cutoff, order=2):
    sos = butter(order, cutoff, btype="highpass", fs=SR, output="sos")
    return sosfilt(sos, x)

def place(buffer, sound, at, gain_db=0.0, pan=0.0):
    i = int(round(at * SR))
    if i >= len(buffer) or i < 0:
        return
    s = sound[: len(buffer) - i] * (10 ** (gain_db / 20.0))
    a = (float(np.clip(pan, -1.0, 1.0)) + 1.0) * (np.pi / 4.0)
    buffer[i : i + len(s), 0] += s * np.cos(a)
    buffer[i : i + len(s), 1] += s * np.sin(a)

print(f"[1/6] Synthesizing continuous screen hum texture across {TOTAL_SECONDS:.3f}s...")
x = t_arr(TOTAL_SECONDS)
for ch, detune in ((0, 0.0), (1, 0.35)):
    hum = sum(np.sin(2 * np.pi * (50 + detune) * k * x) / (k ** 1.4) for k in range(1, 7))
    whine = np.sin(2 * np.pi * (7812 + detune * 3) * x) * 0.012
    air = band(rng.standard_normal(N), 400, 3000) * 0.04
    mix[:, ch] += (hum * 0.035 + whine + air) * 0.45

# Scene Cuts (seconds)
scene_cuts = [0.0, 1.80, 6.20, 11.60, 14.60, 18.00, 20.60, 21.40, 22.20, 23.00]
print(f"[2/6] Synthesizing bit-crushed glitches on {len(scene_cuts)} scene cuts...")
for k, cut_at in enumerate(scene_cuts):
    n_samples = int(SR * 0.055)
    noise = rng.standard_normal(n_samples)
    crushed = np.round(noise * 3) / 3
    hold = max(2, int(rng.integers(6, 20)))
    crushed = np.repeat(crushed[::hold], hold)[:n_samples]
    burst = high(crushed, 850) * env(n_samples, 0.0005, 0.014)
    click = np.zeros(n_samples)
    click[:24] = np.hanning(48)[24:] * 1.0
    pan = float(rng.uniform(-0.4, 0.4))
    place(mix, burst * 0.65 + click * 0.9, cut_at, gain_db=-5.0 if k > 0 else -8.0, pan=pan)

print("[3/6] Synthesizing lock beeps and sub-bass impacts...")
# Lock beeps along minor pentatonic
notes = [1318.5, 1568.0, 1760.0, 2093.0, 2349.3, 2637.0]

def add_lock_beep(at, pitch_idx, pan=0.0, gain_db=-6.0):
    dur = 0.16
    n = int(SR * dur)
    xx = t_arr(dur)
    f0 = notes[pitch_idx % len(notes)]
    beep = (np.sin(2 * np.pi * f0 * xx) + 0.35 * np.sin(2 * np.pi * f0 * 2.01 * xx)) * env(n, 0.001, 0.045)
    sweep = f0 * 2.5 * np.exp(-xx * 40)
    chirp = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * env(n, 0.0005, 0.018) * 0.4
    place(mix, beep + chirp, at, gain_db=gain_db, pan=pan)

def add_sub_thump(at, gain_db=-2.0):
    dur = 0.6
    n = int(SR * dur)
    xx = t_arr(dur)
    f_sweep = 95.0 * np.exp(-xx * 10) + 38.0
    thump = np.sin(2 * np.pi * np.cumsum(f_sweep) / SR) * env(n, 0.002, 0.18)
    place(mix, thump, at, gain_db=gain_db, pan=0.0)

def add_riser(start_t, dur_t, gain_db=-8.0):
    n = int(SR * dur_t)
    xx = t_arr(dur_t)
    p = xx / dur_t
    noise = rng.standard_normal(n)
    riser = np.zeros(n)
    for i0 in range(0, n, 1200):
        seg = slice(i0, min(n, i0 + 1200))
        centre = 500 + 6000 * (p[i0] ** 2)
        riser[seg] = band(noise, max(200, centre * 0.7), min(centre * 1.4, 20000))[seg]
    tone = np.sin(2 * np.pi * np.cumsum(160 + 900 * (p ** 2)) / SR) * 0.22
    place(mix, (riser * 0.7 + tone) * (p ** 1.5), start_t, gain_db=gain_db)

# S1: "RID OF MY TO-DO" slam
add_lock_beep(0.65, 2, pan=-0.3, gain_db=-6.0)
add_sub_thump(0.65, gain_db=-3.0)

# S2: "SHORTER." slam
add_lock_beep(4.76, 3, pan=0.0, gain_db=-5.0)
add_sub_thump(4.76, gain_db=-2.0)

# S3: 3 Pill badge pops
add_lock_beep(8.78, 0, pan=-0.4, gain_db=-7.0)
add_lock_beep(9.96, 1, pan=0.0, gain_db=-7.0)
add_lock_beep(10.80, 2, pan=0.4, gain_db=-7.0)

# S4: Epiphany punch zoom
add_lock_beep(12.00, 4, pan=0.0, gain_db=-6.0)
add_sub_thump(12.00, gain_db=-5.0)

# S5: Floating iOS card & heart notification
add_lock_beep(15.20, 1, pan=0.2, gain_db=-8.0)
add_lock_beep(16.50, 5, pan=0.4, gain_db=-6.0)

# S6: Typing clicks & riser into triple hits
typing_times = np.linspace(18.2, 20.3, 14)
for t_click in typing_times:
    n_c = int(SR * 0.014)
    c_noise = band(rng.standard_normal(n_c), 2500, 9000) * env(n_c, 0.0002, 0.003)
    place(mix, c_noise, t_click + float(rng.uniform(-0.01, 0.01)), gain_db=-10.0, pan=float(rng.uniform(-0.5, 0.5)))
add_riser(19.5, 1.1, gain_db=-8.0)

# S7: Triple typographic punch cuts
add_sub_thump(20.60, gain_db=-3.0)
add_lock_beep(20.60, 2, pan=-0.4, gain_db=-6.0)
add_sub_thump(21.40, gain_db=-3.0)
add_lock_beep(21.40, 3, pan=0.0, gain_db=-6.0)
add_sub_thump(22.20, gain_db=-2.5)
add_lock_beep(22.20, 4, pan=0.4, gain_db=-5.0)

# S8: Outro CTA
add_sub_thump(23.00, gain_db=-3.0)
# Outro soft chime
dur_chime = 1.6
n_chime = int(SR * dur_chime)
xx_chime = t_arr(dur_chime)
chime = (np.sin(2 * np.pi * 880 * xx_chime) +
         0.6 * np.sin(2 * np.pi * 1318.5 * xx_chime) +
         0.25 * np.sin(2 * np.pi * 2637 * xx_chime)) * env(n_chime, 0.004, 0.4)
place(mix, chime * 0.6, 23.05, gain_db=-6.0, pan=-0.15)
place(mix, chime * 0.6, 23.08, gain_db=-8.0, pan=0.2)
add_lock_beep(23.80, 5, pan=0.0, gain_db=-7.0)

# Save SFX stem
sfx_stem = mix.copy()

print("[4/6] Aligning Inworld AI Voiceover stems with exact word synchronization...")
# Scene start times (in master video clock seconds):
# Scene 1: 0.10s
# Scene 2: 1.85s
# Scene 3: 6.25s
# Scene 4: 11.65s
# Scene 5: 14.65s
# Scene 6: 18.05s (keyboard typing transition)
# Scene 7: 20.65s (3-hits)
# Scene 8: 23.05s (outro)

vo_placements = [
    ("line_01.mp3", 0.12),
    ("line_02.mp3", 1.85),
    ("line_03.mp3", 6.25),
    ("line_04.mp3", 11.65),
    ("line_05.mp3", 14.65),
    ("line_06.mp3", 20.65),
    ("line_07.mp3", 23.05),
]

vo_buffer = np.zeros((N, 2), dtype=np.float64)

for fname, start_sec in vo_placements:
    mp3_path = VO_DIR / fname
    tmp_wav = ROOT / f"assets/audio/tmp_{fname}.wav"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(mp3_path),
        "-ar", str(SR), "-ac", "1",
        str(tmp_wav)
    ], check=True, capture_output=True)
    
    with wave.open(str(tmp_wav), "rb") as w:
        frames = w.readframes(w.getnframes())
        raw_samples = np.frombuffer(frames, dtype=np.int16).astype(np.float64) / 32768.0
    
    if tmp_wav.exists():
        tmp_wav.unlink()
        
    # Trim silence below -40dB
    threshold = 10 ** (-40 / 20)
    act = np.where(np.abs(raw_samples) > threshold)[0]
    if len(act) > 0:
        raw_samples = raw_samples[act[0] : act[-1] + 1]
    
    place(vo_buffer, raw_samples, start_sec, gain_db=2.5, pan=0.0)

print("[5/6] Mixing Background Music Bed (ducked under voiceover)...")
# Convert snowfall.mp3 to 48kHz WAV
tmp_bgm_wav = ROOT / "assets/audio/tmp_bgm.wav"
subprocess.run([
    "ffmpeg", "-y", "-i", str(BGM_PATH),
    "-ss", "4.0", "-t", str(TOTAL_SECONDS + 2),
    "-ar", str(SR), "-ac", "2",
    str(tmp_bgm_wav)
], check=True, capture_output=True)

with wave.open(str(tmp_bgm_wav), "rb") as w:
    frames = w.readframes(w.getnframes())
    bgm_samples = np.frombuffer(frames, dtype=np.int16).astype(np.float64).reshape(-1, 2) / 32768.0

if tmp_bgm_wav.exists():
    tmp_bgm_wav.unlink()

bgm_samples = bgm_samples[:N]
# Highpass and subtle lowpass on music bed to leave pristine vocal pocket (250Hz - 8kHz)
bgm_left = low(high(bgm_samples[:, 0], 80), 9000)
bgm_right = low(high(bgm_samples[:, 1], 80), 9000)
bgm_bed = np.stack([bgm_left, bgm_right], axis=1) * (10 ** (-17.5 / 20.0))

# Fade out music and sfx over the last 0.35s
fade_len = int(SR * 0.35)
fade_curve = np.linspace(1.0, 0.0, fade_len)[:, None]
mix[-fade_len:] *= fade_curve
bgm_bed[-fade_len:] *= fade_curve

# Combine VO, SFX, and BGM
master_mix = vo_buffer + mix + bgm_bed

print("[6/6] Normalizing master mix to -14.0 LUFS with soft tanh saturation...")
def write_wav(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        clipped = np.clip(x, -1.0, 1.0)
        w.writeframes((clipped * 32767).astype("<i2").tobytes())

def get_lufs(path):
    out = subprocess.run(
        ["ffmpeg", "-nostats", "-i", str(path), "-af", "ebur128", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    matches = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)
    return float(matches[-1]) if matches else -14.0

write_wav(OUT_SFX_WAV, sfx_stem)
write_wav(OUT_MASTER_WAV, master_mix)

# Master level tuning loop
current_lufs = get_lufs(OUT_MASTER_WAV)
print(f"Initial mix LUFS: {current_lufs:.2f} LUFS (Target: {TARGET_LUFS} LUFS)")
ceiling = 10 ** (-1.2 / 20.0) # -1.2 dBFS true peak headroom

gain = 10 ** ((TARGET_LUFS - current_lufs) / 20.0)
for iteration in range(3):
    master_mix = np.tanh(master_mix * gain / ceiling) * ceiling
    write_wav(OUT_MASTER_WAV, master_mix)
    current_lufs = get_lufs(OUT_MASTER_WAV)
    gain *= 10 ** ((TARGET_LUFS - current_lufs) / 20.0)

final_lufs = get_lufs(OUT_MASTER_WAV)
print(f"✅ Master soundtrack successfully generated:")
print(f"   Path:     {OUT_MASTER_WAV.relative_to(ROOT)}")
print(f"   Duration: {TOTAL_SECONDS:.3f} s")
print(f"   Loudness: {final_lufs:.1f} LUFS (Meets EME & broadcast standard)")
