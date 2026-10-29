"""
VTSM-03 Persistent Worker Daemon and Batch Inference Server
Eliminates cold process-spawn and PyTorch / MPS compilation overhead by keeping
the MobileSAM TinyViT model pre-warmed in GPU memory across video jobs.
"""

import sys
import os
import json
import time
from pathlib import Path

# Ensure paths
TRACKER_DIR = Path(__file__).resolve().parent
SRC_DIR = TRACKER_DIR.parent
EXPERIMENT_ROOT = SRC_DIR.parent
sys.path.insert(0, str(SRC_DIR))

from tracker.proposals import MobileSamProposalAdapter
from tracker.pipeline_vtsm03 import run_pipeline_vtsm03
import numpy as np


class VtsmWorker:
    """
    Persistent in-memory worker for VTSM-03 tracking and mask propagation.
    """

    def __init__(self, device=None, warm_up=True):
        print(f"[VtsmWorker] Initializing persistent worker (device={device or 'auto'})...", file=sys.stderr)
        t0 = time.time()
        self.proposal_adapter = MobileSamProposalAdapter(device=device)
        self.device = self.proposal_adapter.device
        t_init = time.time() - t0
        print(f"[VtsmWorker] MobileSAM loaded in {t_init*1000:.1f}ms on {self.device}", file=sys.stderr)

        if warm_up:
            self._warm_up()

    def _warm_up(self):
        """Warm up MPS graph and PyTorch kernels with dummy 64x64 input."""
        print("[VtsmWorker] Pre-warming MPS graph compilation...", file=sys.stderr)
        t0 = time.time()
        dummy_frame = np.zeros((256, 256, 3), dtype=np.uint8)
        self.proposal_adapter.encode_frame(dummy_frame, -1)
        self.proposal_adapter.segment_prompts([[50, 50, 100, 100]], frame_bgr=dummy_frame)
        t_warm = time.time() - t0
        print(f"[VtsmWorker] Warm-up complete in {t_warm*1000:.1f}ms. Ready for inference.", file=sys.stderr)

    def process_video(self, video_path, output_json_path, ablation_mode="vtsm03_adaptive_hybrid", flow_algo="sparse_lk"):
        """
        Executes pipeline in-process using pre-warmed MobileSAM adapter.
        """
        t0 = time.time()
        doc = run_pipeline_vtsm03(
            video_path=video_path,
            output_json_path=output_json_path,
            ablation_mode=ablation_mode,
            flow_algo=flow_algo,
            proposal_adapter=self.proposal_adapter
        )
        total_time_ms = (time.time() - t0) * 1000.0
        n_frames = len(doc.get("frames", []))
        fps = (n_frames / (total_time_ms / 1000.0)) if total_time_ms > 0 else 0.0

        return {
            "status": "success",
            "videoPath": str(video_path),
            "outputPath": str(output_json_path),
            "frameCount": n_frames,
            "totalTimeMs": round(total_time_ms, 2),
            "throughputFps": round(fps, 2),
            "provenance": doc.get("provenance", {})
        }

    def run_rpc_loop(self):
        """
        Accepts line-delimited JSON commands on stdin and responds on stdout.
        """
        print("[VtsmWorker] Listening for JSON-RPC jobs on stdin...", file=sys.stderr)
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
            except Exception as e:
                print(json.dumps({"status": "error", "message": f"Malformed JSON: {e}"}), flush=True)
                continue

            op = cmd.get("command", cmd.get("action"))
            if op == "ping":
                print(json.dumps({"status": "pong", "device": str(self.device)}), flush=True)
            elif op == "process":
                video_path = cmd.get("video_path") or cmd.get("videoPath")
                output_path = cmd.get("output_path") or cmd.get("outputPath")
                ablation = cmd.get("ablation_mode") or cmd.get("ablationMode", "vtsm03_adaptive_hybrid")
                flow_algo = cmd.get("flow_algo", "sparse_lk")

                try:
                    res = self.process_video(video_path, output_path, ablation, flow_algo)
                    print(json.dumps(res), flush=True)
                except Exception as e:
                    import traceback
                    traceback.print_exc(file=sys.stderr)
                    print(json.dumps({"status": "error", "message": str(e)}), flush=True)
            elif op in ("exit", "quit", "shutdown"):
                print(json.dumps({"status": "shutting_down"}), flush=True)
                break
            else:
                print(json.dumps({"status": "error", "message": f"Unknown command '{op}'"}), flush=True)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="VTSM-03 Persistent Worker Daemon")
    parser.add_argument("--device", default=None, help="Device (mps or cpu)")
    parser.add_argument("--rpc", action="store_true", help="Start stdin/stdout JSON-RPC loop")
    parser.add_argument("--batch", nargs="+", help="Process a batch of video paths")
    parser.add_argument("--out-dir", default=None, help="Output directory for batch jobs")
    parser.add_argument("--ablation", default="vtsm03_adaptive_hybrid", help="Ablation mode")

    args = parser.parse_args()
    worker = VtsmWorker(device=args.device)

    if args.rpc:
        worker.run_rpc_loop()
    elif args.batch:
        out_dir = Path(args.out_dir or (EXPERIMENT_ROOT / "results" / "worker_batch"))
        out_dir.mkdir(parents=True, exist_ok=True)
        results = []
        for vid in args.batch:
            vid_p = Path(vid)
            out_p = out_dir / f"{vid_p.stem}_vtsm03.json"
            print(f"\n[VtsmWorker] Processing {vid_p.name}...", file=sys.stderr)
            res = worker.process_video(vid_p, out_p, ablation_mode=args.ablation)
            print(f"[VtsmWorker] {vid_p.name}: {res['frameCount']} frames in {res['totalTimeMs']}ms -> {res['throughputFps']} FPS", file=sys.stderr)
            results.append(res)
        print("\n=== Batch Summary ===")
        total_f = sum(r["frameCount"] for r in results)
        total_ms = sum(r["totalTimeMs"] for r in results)
        print(f"Total: {total_f} frames in {total_ms:.1f}ms -> {total_f / (total_ms/1000.0):.2f} FPS overall")
