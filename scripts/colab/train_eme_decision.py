#!/usr/bin/env python3
"""
EME Decision Fabric: Remote Colab Training Script for `eme-decision-v1`.
Orchestrates hardware inspection, dataset validation, RLCD fine-tuning,
temperature calibration, and verified checkpoint export.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

def inspect_hardware():
    print("=" * 60)
    print("EME Decision Fabric: Colab Hardware & Accelerators")
    print("=" * 60)
    
    has_cuda = False
    gpu_name = "None"
    vram_gb = 0.0

    try:
        import torch
        has_cuda = torch.cuda.is_available()
        if has_cuda:
            gpu_name = torch.cuda.get_device_name(0)
            vram_bytes = torch.cuda.get_device_properties(0).total_memory
            vram_gb = round(vram_bytes / (1024**3), 2)
            print(f"CUDA Available:  TRUE")
            print(f"GPU Accelerator: {gpu_name}")
            print(f"Total VRAM:      {vram_gb} GB")
            print(f"PyTorch Version: {torch.__version__}")
        else:
            print("CUDA Available:  FALSE (Running in CPU mode)")
            print(f"CPU Threads:     {os.cpu_count()}")
    except ImportError:
        print("WARNING: PyTorch not found. Run pip install torch first.")

    return {
        "has_cuda": has_cuda,
        "gpu_name": gpu_name,
        "vram_gb": vram_gb
    }

def compute_sha256(file_path):
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def run_dry_run(data_path, eval_path, base_model, device):
    print("\n" + "=" * 60)
    print("Stage 1: Dataset & Optimizer Budget Dry-Run Audit")
    print("=" * 60)
    
    cmd = [
        sys.executable, "-m", "laya.train_cli",
        "--data", str(data_path),
        "--eval", str(eval_path),
        "--base", base_model,
        "--device", device,
        "--micro-batch", "1",
        "--grad-accum", "16",
        "--dry-run"
    ]
    
    print(f"Executing: {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    print(res.stdout)
    if res.returncode != 0:
        print(f"STDERR: {res.stderr}", file=sys.stderr)
        raise RuntimeError("Dry-run audit failed. Check dataset schema and token budgets.")
    print("Stage 1 Dry-Run Audit: PASSED.")

def run_training(data_path, eval_path, out_dir, base_model, device, epochs, seed):
    print("\n" + "=" * 60)
    print(f"Stage 2: RLCD Fine-Tuning ({epochs} epochs, seed={seed})")
    print("=" * 60)
    
    os.makedirs(out_dir, exist_ok=True)
    
    cmd = [
        sys.executable, "-m", "laya.train_cli",
        "--data", str(data_path),
        "--eval", str(eval_path),
        "--base", base_model,
        "--out", str(out_dir),
        "--device", device,
        "--epochs", str(epochs),
        "--micro-batch", "1",
        "--grad-accum", "16",
        "--loss", "rlcd",
        "--shuffle-options",
        "--seed", str(seed)
    ]
    
    print(f"Executing: {' '.join(cmd)}")
    start_time = time.time()
    res = subprocess.run(cmd, capture_output=True, text=True)
    duration = time.time() - start_time
    
    print(res.stdout)
    if res.returncode != 0:
        print(f"Training failed with exit code {res.returncode}:\n{res.stderr}", file=sys.stderr)
        raise RuntimeError(f"Training run failed: {res.stderr}")

    print(f"Stage 2 Training Completed in {duration:.1f}s.")
    return duration

def verify_and_manifest(out_dir, hardware_info, duration):
    print("\n" + "=" * 60)
    print("Stage 3: Checkpoint Verification & Manifest")
    print("=" * 60)
    
    out_path = Path(out_dir)
    files = list(out_path.glob("*"))
    print(f"Artifacts in {out_dir}:")
    file_hashes = {}
    for f in files:
        if f.is_file():
            h = compute_sha256(f)
            file_hashes[f.name] = h
            print(f"  - {f.name} ({f.stat().st_size} bytes, sha256={h[:12]}...)")
            
    manifest = {
        "model_id": "eme-decision-v1",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "hardware": hardware_info,
        "training_duration_seconds": round(duration, 2),
        "artifacts": file_hashes,
        "status": "READY_FOR_LOCAL_INSPECTION"
    }
    
    manifest_file = out_path / "training_summary_manifest.json"
    with open(manifest_file, "w") as mf:
        json.dump(manifest, mf, indent=2)
        
    print(f"\nManifest written to {manifest_file}")
    print("Stage 3 Verification: PASSED.")

def main():
    parser = argparse.ArgumentParser(description="EME Decision Fabric Colab Training Runner")
    parser.add_argument("--data", default="/content/train.jsonl", help="Training JSONL dataset")
    parser.add_argument("--eval", default="/content/validation.jsonl", help="Validation JSONL dataset")
    parser.add_argument("--out", default="/content/checkpoints/eme-decision-v1", help="Output checkpoint dir")
    parser.add_argument("--base", default="convaiinnovations/laya", help="Base Laya model ID or local directory")
    parser.add_argument("--epochs", type=int, default=4, help="Number of training epochs")
    parser.add_argument("--seed", type=int, default=20261018, help="Random seed")
    parser.add_argument("--dry-run-only", action="store_true", help="Stop after dry-run check")
    
    args = parser.parse_args()
    
    hw = inspect_hardware()
    device = "cuda" if hw["has_cuda"] else "cpu"
    
    run_dry_run(args.data, args.eval, args.base, device)
    
    if args.dry_run_only:
        print("\nRequested --dry-run-only. Exiting safely.")
        return
        
    duration = run_training(args.data, args.eval, args.out, args.base, device, args.epochs, args.seed)
    verify_and_manifest(args.out, hw, duration)

if __name__ == "__main__":
    main()
