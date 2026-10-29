#!/usr/bin/env python3
"""
Master Audio Pipeline for High-End Motion Edit Reel
Composes voiceover, SFX layers, and background music bed to exact scene timestamps.
"""
import os
import subprocess
import json

BASE_DIR = "/Users/atharvpaharia100/Desktop/Projects/editing-mechanics-engine"
VO_DIR = os.path.join(BASE_DIR, "assets/audio/generated_vo")
SFX_DIR = os.path.join(BASE_DIR, "assets/sfx/trimmed_audio")
BGM_FILE = os.path.join(BASE_DIR, "assets/bgm/snowfall.mp3")
OUTPUT_DIR = os.path.join(BASE_DIR, "assets/audio/master")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 1. Target timing specification (Total: 25.60s = 768 frames @ 30fps)
# Each entry: (vo_file, target_start_s, target_dur_s)
VO_SPECS = [
    ("line_01.mp3", 0.15, 1.50),   # Scene 1: Hook ("I just got rid of my to-do list.")
    ("line_02.mp3", 1.85, 4.20),   # Scene 2: Burden ("Not because I stopped having things to do, but because...")
    ("line_03.mp3", 6.25, 5.15),   # Scene 3: Desk ("It was carrying every tiny responsibility...")
    ("line_04.mp3", 11.65, 2.85),  # Scene 4: Epiphany ("Because I thought doing it all manually...")
    ("line_05.mp3", 14.65, 5.80),  # Scene 5 & 6: Automation ("Now, whenever someone comments on my posts...")
    ("line_06.mp3", 20.65, 2.25),  # Scene 7: 3-Hits ("No backlog. No midnight catch-up. No endless lists.")
    ("line_07.mp3", 23.05, 2.45),  # Scene 8: Outro CTA ("Comment the word 'SYSTEM', and I’ll send you...")
]

def prepare_vo_track():
    """Trims silence and adjusts tempo for each VO line, placing them on an exact timeline."""
    processed_clips = []
    for idx, (filename, start_s, target_dur) in enumerate(VO_SPECS):
        src_path = os.path.join(VO_DIR, filename)
        tmp_trimmed = os.path.join(OUTPUT_DIR, f"tmp_trim_{idx}.wav")
        tmp_scaled = os.path.join(OUTPUT_DIR, f"vo_slot_{idx}.wav")
        
        # Trim leading and trailing silence
        subprocess.run([
            "ffmpeg", "-y", "-i", src_path,
            "-af", "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-40dB:detection=peak,areverse,silenceremove=start_periods=1:start_duration=0.03:start_threshold=-40dB:detection=peak,areverse",
            tmp_trimmed
        ], check=True, capture_output=True)
        
        # Probe current trimmed duration
        res = subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration", "-print_format", "json", tmp_trimmed
        ])
        curr_dur = float(json.loads(res)["format"]["duration"])
        
        # Calculate required tempo factor (capped between 0.85 and 1.35)
        tempo = max(0.85, min(1.35, curr_dur / target_dur))
        print(f"VO Slot {idx}: orig {curr_dur:.2f}s -> target {target_dur:.2f}s (tempo: {tempo:.2f})")
        
        # Apply tempo and pad/trim to exact target duration with delay
        delay_ms = int(start_s * 1000)
        filter_str = f"atempo={tempo:.3f},adelay={delay_ms}|{delay_ms},apad=pad_dur=26,atrim=0:25.60"
        
        subprocess.run([
            "ffmpeg", "-y", "-i", tmp_trimmed,
            "-af", filter_str,
            "-ar", "48000", "-ac", "2",
            tmp_scaled
        ], check=True, capture_output=True)
        processed_clips.append(tmp_scaled)
        
    # Mix all VO slots together
    inputs = []
    for clip in processed_clips:
        inputs.extend(["-i", clip])
    filter_complex = f"amix=inputs={len(processed_clips)}:duration=first:dropout_transition=0,volume=1.2[vo_mixed]"
    
    vo_master = os.path.join(OUTPUT_DIR, "vo_master.wav")
    subprocess.run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", filter_complex,
        "-map", "[vo_mixed]",
        "-ar", "48000", "-ac", "2",
        vo_master
    ], check=True, capture_output=True)
    print("VO Master built:", vo_master)
    return vo_master

def prepare_sfx_track():
    """Composes all sound effects at precise timestamps."""
    # List of (sfx_rel_path, timestamp_s, volume)
    SFX_EVENTS = [
        ("15_one_impact.wav", 0.05, 0.85),     # Scene 1: Opener boom
        ("03_cinematic_woosh.wav", 0.10, 0.60),# Scene 1: Text reveal whoosh
        ("12_woosh.wav", 1.80, 0.65),          # Scene 2: Transition whoosh
        ("06_digital_text.wav", 2.20, 0.45),   # Scene 2: Word drops
        ("15_one_impact.wav", 5.20, 0.80),     # Scene 2: Slam on "SHORTER."
        ("03_cinematic_woosh.wav", 6.20, 0.60),# Scene 3: Desk cut
        ("06_digital_text.wav", 7.80, 0.40),   # Scene 3: "Every reply"
        ("06_digital_text.wav", 8.90, 0.40),   # Scene 3: "Every DM"
        ("06_digital_text.wav", 10.10, 0.40),  # Scene 3: "Every follow-up"
        ("07_riser.wav", 11.20, 0.70),         # Scene 4: Epiphany riser
        ("15_one_impact.wav", 14.60, 0.75),    # Scene 5: Phone transition hit
        ("11_shine.wav", 15.10, 0.85),         # Scene 5: Notification chime
        ("12_woosh.wav", 17.50, 0.65),         # Scene 6: Keyboard whoosh
        ("06_digital_text.wav", 18.20, 0.50),  # Scene 6: Keyboard typing foley
        ("15_one_impact.wav", 20.60, 0.80),    # Scene 7: Hit 1 "NO BACKLOG"
        ("10_camera_click.wav", 20.60, 0.60),  # Scene 7: Shutter 1
        ("15_one_impact.wav", 21.40, 0.80),    # Scene 7: Hit 2 "NO MIDNIGHT"
        ("10_camera_click.wav", 21.40, 0.60),  # Scene 7: Shutter 2
        ("15_one_impact.wav", 22.20, 0.85),    # Scene 7: Hit 3 "NO LISTS"
        ("10_camera_click.wav", 22.20, 0.60),  # Scene 7: Shutter 3
        ("03_cinematic_woosh.wav", 23.00, 0.70),# Scene 8: Outro whoosh
        ("11_shine.wav", 23.60, 0.75),         # Scene 8: Keyword glow chime
    ]
    
    delayed_sfx_clips = []
    for idx, (rel_path, time_s, vol) in enumerate(SFX_EVENTS):
        full_path = os.path.join(SFX_DIR, rel_path)
        out_clip = os.path.join(OUTPUT_DIR, f"sfx_slot_{idx}.wav")
        delay_ms = int(time_s * 1000)
        filter_str = f"volume={vol:.2f},adelay={delay_ms}|{delay_ms},apad=pad_dur=26,atrim=0:25.60"
        subprocess.run([
            "ffmpeg", "-y", "-i", full_path,
            "-af", filter_str,
            "-ar", "48000", "-ac", "2",
            out_clip
        ], check=True, capture_output=True)
        delayed_sfx_clips.append(out_clip)
        
    inputs = []
    for clip in delayed_sfx_clips:
        inputs.extend(["-i", clip])
    filter_complex = f"amix=inputs={len(delayed_sfx_clips)}:duration=first:dropout_transition=0,volume=1.0[sfx_mixed]"
    
    sfx_master = os.path.join(OUTPUT_DIR, "sfx_master.wav")
    subprocess.run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", filter_complex,
        "-map", "[sfx_mixed]",
        "-ar", "48000", "-ac", "2",
        sfx_master
    ], check=True, capture_output=True)
    print("SFX Master built:", sfx_master)
    return sfx_master

def prepare_bgm_track():
    """Prepares ducked background music bed."""
    bgm_master = os.path.join(OUTPUT_DIR, "bgm_master.wav")
    # Low pass filter for warm lofi feel + volume ducking + 0.3s fade in and 1.0s fade out at end
    subprocess.run([
        "ffmpeg", "-y", "-i", BGM_FILE,
        "-af", "atrim=0:25.60,volume=0.32,lowpass=f=4500,afade=t=in:ss=0:d=0.3,afade=t=out:st=24.5:d=1.1",
        "-ar", "48000", "-ac", "2",
        bgm_master
    ], check=True, capture_output=True)
    print("BGM Master built:", bgm_master)
    return bgm_master

def build_final_master(vo_path, sfx_path, bgm_path):
    """Combines VO, SFX, and BGM into final broadcast-grade master audio."""
    final_output = os.path.join(OUTPUT_DIR, "final_soundtrack_master.wav")
    
    filter_complex = (
        "[0:a]volume=1.25[vo];"
        "[1:a]volume=1.10[sfx];"
        "[2:a]volume=0.85[bgm];"
        "[vo][sfx][bgm]amix=inputs=3:duration=first:dropout_transition=0[mixed];"
        "[mixed]alimiter=limit=0.95:attack=5:release=50[limited]"
    )
    
    subprocess.run([
        "ffmpeg", "-y",
        "-i", vo_path,
        "-i", sfx_path,
        "-i", bgm_path,
        "-filter_complex", filter_complex,
        "-map", "[limited]",
        "-ar", "48000", "-ac", "2",
        final_output
    ], check=True, capture_output=True)
    
    print("Final Master Audio created successfully at:", final_output)
    return final_output

if __name__ == "__main__":
    vo = prepare_vo_track()
    sfx = prepare_sfx_track()
    bgm = prepare_bgm_track()
    master = build_final_master(vo, sfx, bgm)
