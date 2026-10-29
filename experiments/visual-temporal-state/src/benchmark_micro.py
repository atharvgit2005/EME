#!/usr/bin/env python3
"""
VTSM-02 Step 1: Performance Microbenchmark Harness
Measures warm CPU vs MPS, multi-prompt decoder scaling (1, 4, 16),
preprocessing, encoder latency, and postprocessing.
"""

import os
import sys
import time
import json
from pathlib import Path
import numpy as np
import cv2
import torch

EXPERIMENT_ROOT = Path(__file__).resolve().parents[1]
MOBILESAM_DIR = EXPERIMENT_ROOT / "third_party" / "MobileSAM"
WEIGHTS_PATH = MOBILESAM_DIR / "weights" / "mobile_sam.pt"
RESULTS_DIR = EXPERIMENT_ROOT / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

if str(MOBILESAM_DIR) not in sys.path:
    sys.path.insert(0, str(MOBILESAM_DIR))

from mobile_sam import sam_model_registry, SamPredictor


def run_microbenchmark():
    print("==================================================================")
    print("  VTSM-02 Step 1: Performance Microbenchmark (Apple Silicon CPU/MPS)")
    print("==================================================================\n")

    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "torch_version": torch.__version__,
        "mps_available": torch.backends.mps.is_available(),
        "measurements": {}
    }

    # 1. Test frame (1080p from fixture_a or synthetic)
    fixture_path = EXPERIMENT_ROOT / "fixtures" / "fixture_a.mp4"
    if fixture_path.exists():
        cap = cv2.VideoCapture(str(fixture_path))
        ret, frame = cap.read()
        cap.release()
    else:
        frame = np.full((1080, 1920, 3), 128, dtype=np.uint8)
        cv2.circle(frame, (960, 540), 80, (255, 50, 50), -1)

    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    h, w = frame_rgb.shape[:2]
    print(f"Profiling frame size: {w}x{h}")

    # Devices to profile
    devices = ["cpu"]
    if torch.backends.mps.is_available():
        devices.append("mps")

    for dev_name in devices:
        print(f"\n--- Profiling Device: {dev_name.upper()} ---")
        device = torch.device(dev_name)

        # Cold load
        t0 = time.time()
        model = sam_model_registry["vit_t"](checkpoint=str(WEIGHTS_PATH))
        model.to(device)
        model.eval()
        load_time_ms = (time.time() - t0) * 1000.0
        print(f"Model Load Time: {load_time_ms:.1f} ms")

        predictor = SamPredictor(model)

        # Warm-up pass
        predictor.set_image(frame_rgb)
        if dev_name == "mps":
            torch.mps.synchronize()

        # Image Encoder benchmark (10 iterations)
        enc_times = []
        for _ in range(10):
            t0 = time.time()
            predictor.set_image(frame_rgb)
            if dev_name == "mps":
                torch.mps.synchronize()
            enc_times.append((time.time() - t0) * 1000.0)

        enc_median = float(np.median(enc_times))
        enc_p95 = float(np.percentile(enc_times, 95))
        print(f"Image Encoder Latency: Median = {enc_median:.1f} ms | P95 = {enc_p95:.1f} ms")

        # Decoder benchmark for N prompts (1, 4, 16 prompts)
        decoder_benchmarks = {}
        for num_prompts in [1, 4, 16]:
            pts = np.random.randint(100, min(w, h) - 100, size=(num_prompts, 2))
            labels = np.ones(num_prompts, dtype=int)

            dec_times = []
            for _ in range(15):
                t0 = time.time()
                for i in range(num_prompts):
                    masks, scores, _ = predictor.predict(
                        point_coords=pts[i : i + 1],
                        point_labels=labels[i : i + 1],
                        multimask_output=True,
                    )
                if dev_name == "mps":
                    torch.mps.synchronize()
                dec_times.append((time.time() - t0) * 1000.0)

            dec_median = float(np.median(dec_times))
            dec_p95 = float(np.percentile(dec_times, 95))
            per_prompt = dec_median / num_prompts
            print(f"Mask Decoder ({num_prompts} prompt{'s' if num_prompts > 1 else ''}): Total = {dec_median:.1f} ms ({per_prompt:.2f} ms/prompt) | P95 = {dec_p95:.1f} ms")

            decoder_benchmarks[f"{num_prompts}_prompts"] = {
                "total_median_ms": round(dec_median, 2),
                "total_p95_ms": round(dec_p95, 2),
                "per_prompt_median_ms": round(per_prompt, 2)
            }

        report["measurements"][dev_name] = {
            "load_time_ms": round(load_time_ms, 2),
            "encoder_median_ms": round(enc_median, 2),
            "encoder_p95_ms": round(enc_p95, 2),
            "decoder_scaling": decoder_benchmarks,
            "fps_encoder_only": round(1000.0 / enc_median, 2),
            "fps_encoder_plus_1prompt": round(1000.0 / (enc_median + decoder_benchmarks["1_prompts"]["total_median_ms"]), 2)
        }

    out_file = RESULTS_DIR / "vtsm02_microbenchmark.json"
    with open(out_file, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nMicrobenchmark saved to: {out_file}")
    return report

if __name__ == "__main__":
    run_microbenchmark()
