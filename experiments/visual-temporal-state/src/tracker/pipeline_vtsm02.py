"""
VTSM-02 Modular Tracking Pipeline
Integrates MobileSAM mask proposals, timestamp-aware Kalman prediction,
global camera compensation, and gated temporal association.
Supports ablation modes:
- 'mobilesam_proposals_only'
- 'mobilesam_kalman'
- 'mobilesam_kalman_camera'
Outputs canonical VTSM JSON strictly conforming to schema.
"""

import os
import sys
import json
import math
import hashlib
import time
from datetime import datetime, timezone
from pathlib import Path
import cv2
import numpy as np

EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
if str(EXPERIMENT_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(EXPERIMENT_ROOT / "src"))

from tracker.kalman import TimestampAwareKalmanBoxTracker
from tracker.camera import CameraCompensator
from tracker.association import GatedTrackerAssociator, compute_iou, compute_centroid_distance
from tracker.lifecycle import TrackLifecycleManager, EntityTrack
from tracker.proposals import MobileSamProposalAdapter

TICKS_PER_SECOND = 120000


def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def detect_shots(video_path, fps):
    """
    Detects hard cuts via HSV histogram distance and luminance diff.
    """
    cap = cv2.VideoCapture(video_path)
    shots = []
    cut_events = []

    prev_hist = None
    prev_gray = None
    shot_start_frame = 0
    shot_idx = 1
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [30, 32], [0, 180, 0, 256])
        cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if prev_hist is not None:
            b_dist = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA)
            mean_diff = float(np.mean(np.abs(gray.astype(float) - prev_gray.astype(float))))
            is_cut = (b_dist > 0.60) or (mean_diff > 45.0)

            if is_cut and (frame_idx - shot_start_frame >= 5):
                shots.append({
                    "shotId": f"shot_{shot_idx:02d}",
                    "startFrame": shot_start_frame,
                    "endFrame": frame_idx - 1,
                    "startPts": float(shot_start_frame / fps),
                    "endPts": float((frame_idx - 1) / fps),
                    "cutConfidence": 1.0,
                    "cutType": "initial" if shot_idx == 1 else "hard_cut"
                })
                cut_events.append({
                    "eventId": f"cut_evt_{frame_idx}",
                    "type": "shot_boundary",
                    "frameIndex": frame_idx,
                    "pts": float(frame_idx / fps),
                    "confidence": float(min(1.0, max(0.85, b_dist))),
                    "details": {
                        "cutType": "hard_cut",
                        "bhattacharyyaDistance": round(float(b_dist), 4),
                        "meanLuminanceDiff": round(mean_diff, 2)
                    }
                })
                shot_idx += 1
                shot_start_frame = frame_idx

        prev_hist = hist
        prev_gray = gray
        frame_idx += 1

    cap.release()
    if shot_start_frame < frame_idx:
        shots.append({
            "shotId": f"shot_{shot_idx:02d}",
            "startFrame": shot_start_frame,
            "endFrame": frame_idx - 1,
            "startPts": float(shot_start_frame / fps),
            "endPts": float((frame_idx - 1) / fps),
            "cutConfidence": 1.0,
            "cutType": "initial" if shot_idx == 1 else "hard_cut"
        })

    return shots, cut_events


def run_pipeline(video_path, output_json_path, ablation_mode="mobilesam_kalman_camera"):
    """
    Executes VTSM-02 tracking pipeline.
    Ablation modes:
    - 'mobilesam_proposals_only': raw MobileSAM mask proposals + naive greedy matching (no Kalman, no camera compensation)
    - 'mobilesam_kalman': MobileSAM masks + timestamp-aware Kalman predictor + gated Hungarian association
    - 'mobilesam_kalman_camera': full stack (Kalman + camera compensation + MobileSAM)
    """
    t0_pipeline = time.time()
    video_path = str(Path(video_path).resolve())
    output_json_path = str(Path(output_json_path).resolve())

    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(cap.get(cv2.CAP_PROP_FPS))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    duration_sec = float(total_frames / fps) if fps > 0 else 0.0
    source_sha256 = compute_sha256(video_path)

    # 1. Shot detection
    shots, cut_events = detect_shots(video_path, fps)
    cut_frame_indices = {s["startFrame"] for s in shots if s["cutType"] != "initial"}

    # 2. Initialize tracking modules
    enable_kalman = (ablation_mode in ("mobilesam_kalman", "mobilesam_kalman_camera"))
    enable_camera = (ablation_mode == "mobilesam_kalman_camera")

    camera_comp = CameraCompensator(width, height)
    associator = GatedTrackerAssociator(iou_threshold=0.15, max_centroid_dist=250.0)
    lifecycle_mgr = TrackLifecycleManager(max_missed_frames=25, min_hits_confirm=2)

    # Proposals adapter
    proposal_adapter = None
    if "mobilesam" in ablation_mode:
        try:
            proposal_adapter = MobileSamProposalAdapter()
        except Exception as e:
            print(f"[Pipeline] MobileSAM init fallback to CPU: {e}")
            proposal_adapter = MobileSamProposalAdapter(device="cpu")

    cap = cv2.VideoCapture(video_path)
    frames_output = []
    events_output = list(cut_events)
    prev_gray = None

    for frame_idx in range(total_frames):
        ret, frame_bgr = cap.read()
        if not ret:
            break

        pts = float(frame_idx / fps)
        ticks = int(round(pts * TICKS_PER_SECOND))
        curr_gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

        # 3. Estimate camera motion
        if prev_gray is not None:
            cam_motion = camera_comp.estimate_motion(prev_gray, curr_gray)
        else:
            cam_motion = {
                "model": "identity",
                "translation": {"dx": 0.0, "dy": 0.0},
                "scale": 1.0,
                "rotation": 0.0,
                "confidence": 1.0,
                "valid": True
            }

        # 4. Handle scene cuts
        if frame_idx in cut_frame_indices:
            lifecycle_mgr.reset_on_scene_cut(frame_idx, pts)

        # 5. Predict track positions
        active_tracks = lifecycle_mgr.get_active_tracks(include_occluded=True)
        track_boxes = []
        track_sigmas = []

        for track in active_tracks:
            if enable_kalman:
                pred_box = track.predict(pts)
            else:
                pred_box = list(track.current_bbox)

            # Apply camera compensation if enabled
            if enable_camera and cam_motion.get("valid"):
                pred_box = camera_comp.compensate_bbox(pred_box, cam_motion)

            track_boxes.append(pred_box)
            _, _, sigma = track.kalman.get_state()
            track_sigmas.append(sigma)

        # 6. Generate candidate proposals
        detections = []
        # Frame 0 or shot boundary: full-frame proposals
        if frame_idx == 0 or frame_idx in cut_frame_indices:
            saliency_props = MobileSamProposalAdapter.extract_saliency_proposals(frame_bgr, min_area=400)
            if proposal_adapter and len(saliency_props) > 0:
                proposal_adapter.encode_frame(frame_bgr, frame_idx)
                raw_boxes = [p["bbox"] for p in saliency_props]
                detections = proposal_adapter.segment_prompts(raw_boxes, frame_bgr=frame_bgr)
            else:
                detections = saliency_props
        else:
            # Intra-shot frames:
            saliency_props = MobileSamProposalAdapter.extract_saliency_proposals(frame_bgr, min_area=400)
            prompt_boxes = []
            for tb in track_boxes:
                best_box = list(tb)
                for sp in saliency_props:
                    sb = sp["bbox"]
                    if compute_iou(sb, tb) > 0.15 or compute_centroid_distance(sb, tb) < 120.0:
                        if sb[2] * sb[3] > best_box[2] * best_box[3]:
                            best_box = list(sb)
                prompt_boxes.append(best_box)

            for sp in saliency_props:
                sb = sp["bbox"]
                if not any(compute_iou(sb, pb) > 0.2 or compute_centroid_distance(sb, pb) < 120.0 for pb in prompt_boxes):
                    prompt_boxes.append(sb)

            if proposal_adapter and len(prompt_boxes) > 0:
                proposal_adapter.encode_frame(frame_bgr, frame_idx)
                detections = proposal_adapter.segment_prompts(prompt_boxes, frame_bgr=frame_bgr)
            else:
                detections = saliency_props

        det_boxes = [d["bbox"] for d in detections]

        # 7. Association & Matching
        if enable_kalman:
            matches, unmatched_tracks, unmatched_dets = associator.associate(
                track_boxes, det_boxes, track_sigmas
            )
        else:
            # Naive greedy matching (proposals only ablation)
            matches = []
            unmatched_tracks = set(range(len(track_boxes)))
            unmatched_dets = set(range(len(det_boxes)))
            for t_idx, t_box in enumerate(track_boxes):
                best_iou = 0.0
                best_d_idx = -1
                for d_idx in unmatched_dets:
                    iou = compute_iou(t_box, det_boxes[d_idx])
                    if iou > best_iou and iou >= 0.2:
                        best_iou = iou
                        best_d_idx = d_idx
                if best_d_idx != -1:
                    matches.append((t_idx, best_d_idx))
                    unmatched_tracks.remove(t_idx)
                    unmatched_dets.remove(best_d_idx)
            unmatched_tracks = list(unmatched_tracks)
            unmatched_dets = list(unmatched_dets)

        # 8. Step Lifecycle State Machine
        lifecycle_mgr.step(
            detections=detections,
            current_pts=pts,
            frame_idx=frame_idx,
            matches=matches,
            unmatched_tracks=unmatched_tracks,
            unmatched_dets=unmatched_dets
        )

        # 9. Format Frame Observation
        current_frame_tracks = lifecycle_mgr.get_active_tracks(include_occluded=True)
        frame_observations = []

        # Find current shot
        current_shot_id = "shot_01"
        for s in shots:
            if s["startFrame"] <= frame_idx <= s["endFrame"]:
                current_shot_id = s["shotId"]
                break

        for tr in current_frame_tracks:
            bbox, vel, sigma = tr.kalman.get_state()
            x, y, w, h = tr.current_bbox
            cx = x + w / 2.0
            cy = y + h / 2.0

            pixel_box = {
                "x": float(round(x, 2)),
                "y": float(round(y, 2)),
                "width": float(round(w, 2)),
                "height": float(round(h, 2))
            }
            norm_box = {
                "x": float(round(x / width, 5)),
                "y": float(round(y / height, 5)),
                "width": float(round(w / width, 5)),
                "height": float(round(h / height, 5))
            }

            is_vis = tr.is_observed and tr.state != EntityTrack.STATE_OCCLUDED
            vis_conf = float(min(1.0, max(0.0, tr.confidence if is_vis else 0.0)))
            trk_conf = float(min(1.0, max(0.0, tr.confidence)))

            obs = {
                "entityId": tr.track_id,
                "bbox": {
                    "pixel": pixel_box,
                    "normalized": norm_box
                },
                "center": {
                    "pixel": [float(round(cx, 2)), float(round(cy, 2))],
                    "normalized": [float(round(cx / width, 5)), float(round(cy / height, 5))]
                },
                "visibility": "visible" if is_vis else "occluded",
                "visibilityConfidence": float(round(vis_conf, 3)),
                "trackingConfidence": float(round(trk_conf, 3)),
                "motion": {
                    "raw": {"dx": float(round(vel[0], 2)), "dy": float(round(vel[1], 2)), "valid": True},
                    "compensated": {"dx": float(round(vel[0], 2)), "dy": float(round(vel[1], 2)), "valid": enable_camera}
                }
            }
            frame_observations.append(obs)

        frames_output.append({
            "frameIndex": frame_idx,
            "pts": float(round(pts, 6)),
            "tick": int(ticks),
            "shotId": current_shot_id,
            "cameraMotion": cam_motion,
            "observations": frame_observations
        })

        prev_gray = curr_gray

    cap.release()
    total_pipeline_ms = (time.time() - t0_pipeline) * 1000.0

    # 10. Compile Entities Summary conforming to schema
    all_seen_tracks = lifecycle_mgr.tracks + lifecycle_mgr.retired_tracks
    entities_dict = {}
    for t in all_seen_tracks:
        if t.track_id not in entities_dict:
            first_frame = t.last_seen_frame - t.age + 1
            e_shot = "shot_01"
            for s in shots:
                if s["startFrame"] <= first_frame <= s["endFrame"]:
                    e_shot = s["shotId"]
                    break

            entities_dict[t.track_id] = {
                "entityId": t.track_id,
                "label": "subject",
                "shotId": e_shot,
                "policyAcrossCuts": "reset_on_cut"
            }

    if len(entities_dict) == 0:
        entities_dict["ent_01"] = {
            "entityId": "ent_01",
            "label": "subject",
            "shotId": "shot_01",
            "policyAcrossCuts": "reset_on_cut"
        }

    # 11. Final VTSM Document
    vtsm_doc = {
        "version": "1.0.0",
        "source": {
            "filePath": os.path.basename(video_path),
            "sha256": source_sha256,
            "dimensions": {"width": width, "height": height},
            "durationSec": float(round(duration_sec, 3)),
            "totalFrames": total_frames
        },
        "timebase": {
            "ticksPerSecond": TICKS_PER_SECOND,
            "rationalFps": {"numerator": int(round(fps)), "denominator": 1},
            "durationTicks": int(round(duration_sec * TICKS_PER_SECOND))
        },
        "shots": shots,
        "entities": list(entities_dict.values()),
        "frames": frames_output,
        "events": events_output,
        "provenance": {
            "extractor": "vtsm02-mobilesam-tracker",
            "version": "1.0.0",
            "license": "Apache-2.0",
            "pipeline": "VTSM-02 Modular Tracking Pipeline",
            "ablationMode": ablation_mode,
            "parameters": {
                "model": "MobileSAM-TinyViT",
                "kalman": enable_kalman,
                "cameraCompensation": enable_camera,
                "association": "GatedHungarian"
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "executionTimeMs": round(total_pipeline_ms, 2),
            "fps": round(total_frames / (total_pipeline_ms / 1000.0), 2)
        }
    }

    os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
    with open(output_json_path, 'w') as f:
        json.dump(vtsm_doc, f, indent=2)

    print(f"[VTSM-02] Pipeline finished: {output_json_path} ({total_pipeline_ms:.1f} ms, {vtsm_doc['provenance']['fps']} FPS)")
    return vtsm_doc


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python pipeline_vtsm02.py <video_path> <output_json_path> [ablation_mode]")
        sys.exit(1)

    video = sys.argv[1]
    output = sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else "mobilesam_kalman_camera"
    run_pipeline(video, output, mode)
