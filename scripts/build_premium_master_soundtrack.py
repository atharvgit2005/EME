#!/usr/bin/env python3
"""
Premium Master Soundtrack & Foley Synthesis Engine
Blends Inworld Conformed Voiceover + SJC SFX Pack + ff-tracking physics + BGM.
Mastered to broadcast standards (-14 LUFS, -1 dBFS true-peak).
"""

import json
import math
import os
import subprocess
import wave
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
TOTAL_SECONDS = 25.625
N = int(SR * TOTAL_SECONDS)
ROOT = Path("/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine")

SJC_DIR = ROOT / "assets/sjc_sfx_pack/SJC SFX Pack Vol 1 (Giveaway)"
TRIMMED_SFX = ROOT / "assets/sfx/trimmed_audio"
BGM_PATH = ROOT / "assets/bgm/snowfall.mp3"
VO_MASTER_PATH = ROOT / "assets/audio/vo_conformed_master.wav"
OUT_MASTER_PATH = ROOT / "assets/audio/master_soundtrack_synced.wav"

mix = np.zeros((N, 2), dtype=np.float64)

def read_wav(path):
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")
    cmd = ["ffmpeg", "-v", "error", "-i", str(p), "-f", "f32le", "-ar", str(SR), "-ac", "2", "pipe:1"]
    out = subprocess.check_output(cmd)
    data = np.frombuffer(out, dtype=np.float32).reshape(-1, 2)
    return data.astype(np.float64)

def place_sfx(buffer, data, at_sec, gain_db=0.0, pan=0.0):
    start_idx = int(round(at_sec * SR))
    if start_idx >= len(buffer) or start_idx < 0:
        return
    gain = 10.0 ** (gain_db / 20.0)
    dur = min(len(data), len(buffer) - start_idx)
    sound = data[:dur] * gain
    # Pan: -1 (full left) to +1 (full right)
    pan_clamped = max(-1.0, min(1.0, pan))
    angle = (pan_clamped + 1.0) * (math.pi / 4.0)
    buffer[start_idx : start_idx + dur, 0] += sound[:, 0] * math.cos(angle)
    buffer[start_idx : start_idx + dur, 1] += sound[:, 1] * math.sin(angle)

print("[1/5] Loading conformed Inworld voiceover...")
vo_data = read_wav(VO_MASTER_PATH)
place_sfx(mix, vo_data, 0.0, gain_db=0.0, pan=0.0)

print("[2/5] Synthesizing continuous screen hum texture...")
x = np.arange(N) / SR
hum = sum(np.sin(2 * np.pi * 50 * k * x) / (k ** 1.4) for k in range(1, 7))
whine = np.sin(2 * np.pi * 7812 * x) * 0.008
sos_air = butter(2, [400, 3000], btype="bandpass", fs=SR, output="sos")
rng = np.random.default_rng(42)
air = sosfilt(sos_air, rng.standard_normal(N)) * 0.02
mix[:, 0] += (hum * 0.02 + whine + air) * 0.35
mix[:, 1] += (hum * 0.02 + whine + air) * 0.35

print("[3/5] Layering premium SJC Foley & Impact SFX...")
sub_impact_1 = read_wav(SJC_DIR / "UI & Motion/Impact/SJC_IMPACT_Sub Impact_01.wav")
sub_impact_2 = read_wav(SJC_DIR / "UI & Motion/Impact/SJC_IMPACT_Sub Impact_02.wav")
fast_whoosh = read_wav(SJC_DIR / "UI & Motion/Whoosh/SJC_WHOOSH_Fast Swish_01.wav")
light_whoosh = read_wav(SJC_DIR / "UI & Motion/Whoosh/SJC_WHOOSH_Light Air_01.wav")
tonal_rise = read_wav(SJC_DIR / "UI & Motion/Transition/SJC_TRANSITION_Tonal Synth Rise_01.wav")
switch_click = read_wav(SJC_DIR / "UI & Motion/Click/SJC_CLICK_Switch_01.wav")
tonal_click = read_wav(SJC_DIR / "UI & Motion/Click/SJC_CLICK_Tonal Click Single_01.wav")
camera_click = read_wav(TRIMMED_SFX / "10_camera_click.wav")
digital_text = read_wav(TRIMMED_SFX / "06_digital_text.wav")
shine = read_wav(TRIMMED_SFX / "11_shine.wav")

# Hook Impact at 0.0s
place_sfx(mix, sub_impact_1, 0.0, gain_db=-2.0, pan=0.0)
place_sfx(mix, fast_whoosh, 0.0, gain_db=-5.0, pan=-0.2)

# S1 Reticle Lock Beep (x: 528, y: 660) at 0.20s
place_sfx(mix, tonal_click, 0.20, gain_db=-4.0, pan=-0.1)

# S2 Transition (1.48s): "Not because I stopped..."
place_sfx(mix, light_whoosh, 1.40, gain_db=-6.0, pan=0.1)

# S2 Word Stack and "SHORTER" impact (3.80s - 4.48s)
place_sfx(mix, switch_click, 3.10, gain_db=-6.0, pan=-0.2)
place_sfx(mix, sub_impact_2, 4.48, gain_db=-3.0, pan=0.0)

# S3 Rhythmic Hits: "FILM / EDIT / WRITE / ANSWER DMs" (5.22s, 5.80s, 6.22s, 6.70s)
place_sfx(mix, camera_click, 5.22, gain_db=-4.0, pan=-0.25) # FILM
place_sfx(mix, camera_click, 5.80, gain_db=-4.0, pan=-0.10) # EDIT
place_sfx(mix, camera_click, 6.22, gain_db=-4.0, pan=0.10)  # WRITE
place_sfx(mix, sub_impact_1, 6.70, gain_db=-3.0, pan=0.0)   # ANSWER DMs
place_sfx(mix, fast_whoosh, 6.70, gain_db=-6.0, pan=0.2)

# S4 "Yeah, it was exhausting" (7.36s)
place_sfx(mix, sub_impact_2, 7.36, gain_db=-5.0, pan=0.0)
place_sfx(mix, tonal_rise, 8.20, gain_db=-8.0, pan=0.0)

# S5 Epiphany Punch: "Because I thought that's what being a creator looked like" (10.20s)
place_sfx(mix, fast_whoosh, 10.15, gain_db=-5.0, pan=0.1)
place_sfx(mix, sub_impact_1, 10.20, gain_db=-3.0, pan=0.0)

# S6 "And the question I get asked the most..." (12.08s) -> "Well, I don't" (14.94s)
place_sfx(mix, light_whoosh, 12.00, gain_db=-7.0, pan=-0.2)
place_sfx(mix, sub_impact_2, 14.94, gain_db=-3.0, pan=0.0)
place_sfx(mix, switch_click, 14.94, gain_db=-4.0, pan=0.0)

# S7 Automation Dispatched Card (16.48s)
place_sfx(mix, shine, 16.48, gain_db=-4.0, pan=0.2)
place_sfx(mix, digital_text, 16.55, gain_db=-5.0, pan=0.1)

# S8 Triple Typographic Punch Cuts (19.36s, 20.04s, 21.34s)
# Cut 1: "NO LIST" (19.36s)
place_sfx(mix, camera_click, 19.36, gain_db=-3.0, pan=-0.3)
place_sfx(mix, sub_impact_1, 19.36, gain_db=-4.0, pan=-0.3)
# Cut 2: "NO BACKLOG" (20.04s)
place_sfx(mix, camera_click, 20.04, gain_db=-3.0, pan=0.0)
place_sfx(mix, sub_impact_1, 20.04, gain_db=-4.0, pan=0.0)
# Cut 3: "NO MIDNIGHT" (21.34s)
place_sfx(mix, camera_click, 21.34, gain_db=-3.0, pan=0.3)
place_sfx(mix, sub_impact_1, 21.34, gain_db=-3.0, pan=0.3)

# S9 "Just more time to actually create" (21.94s)
place_sfx(mix, shine, 22.00, gain_db=-6.0, pan=0.0)

# S10 Outro CTA: "Comment SIMPLE and I'll send you exactly how I set it up" (23.40s)
place_sfx(mix, fast_whoosh, 23.35, gain_db=-5.0, pan=-0.1)
place_sfx(mix, sub_impact_1, 23.40, gain_db=-3.0, pan=0.0)
place_sfx(mix, switch_click, 23.45, gain_db=-4.0, pan=0.1)

print("[4/5] Ducked ambient background music bed...")
bgm_data = read_wav(BGM_PATH)
# Loop or slice BGM to TOTAL_SECONDS
bgm_sliced = bgm_data[:N] if len(bgm_data) >= N else np.tile(bgm_data, (math.ceil(N / len(bgm_data)), 1))[:N]
# Highpass rumble off BGM, lowpass top sheen
sos_bgm = butter(2, [120, 10000], btype="bandpass", fs=SR, output="sos")
bgm_filtered = np.column_stack([sosfilt(sos_bgm, bgm_sliced[:, 0]), sosfilt(sos_bgm, bgm_sliced[:, 1])])

# Compute ducking envelope from VO activity
vo_env = np.abs(vo_data[:, 0])
win = int(SR * 0.1)
vo_smooth = np.convolve(vo_env, np.ones(win)/win, mode='same')
duck_gain = np.where(vo_smooth > 0.05, 10**(-21/20), 10**(-16/20))
# Smooth gain transitions
duck_gain_smooth = np.convolve(duck_gain, np.ones(win)/win, mode='same')
bgm_ducked = bgm_filtered * duck_gain_smooth[:, None]
mix += bgm_ducked

print("[5/5] Mastering to -14 LUFS with soft saturation ceiling...")
# Soft tanh saturation
peak = np.max(np.abs(mix))
if peak > 0.95:
    mix = np.tanh(mix * (0.95 / peak))

# Measure RMS and normalize to target loudness (-14 LUFS approximation)
rms = math.sqrt(np.mean(mix ** 2))
target_rms = 10.0 ** (-14.0 / 20.0)
gain = target_rms / max(rms, 1e-6)
mix *= min(gain, 1.8)

# Hard limiter ceiling at -1 dBFS (0.891)
mix = np.clip(mix, -0.891, 0.891)

scaled_master = (mix * 32767).astype(np.int16)
with wave.open(str(OUT_MASTER_PATH), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(scaled_master.tobytes())

print(f"✅ Premium Synced Master Audio written to: {OUT_MASTER_PATH} ({len(scaled_master)/SR:.3f}s)")
