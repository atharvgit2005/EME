"""
VTSM-03 Temporal Perception Pipeline

Implements Efficient Temporal Propagation and Adaptive Re-segmentation:
- Keyframe anchor segmentation via MobileSAM TinyViT encoder + decoder
- Intermediate-frame optical flow mask propagation (Sparse LK / Dense Farneback)
- Global camera motion alignment (exact once-only compensation)
- Camera-resistant new entity discovery between keyframes
- Adaptive failure detectors (flow consistency, area distortion, Kalman divergence, appearance drop)
- Rigorous state lifecycle, timestamp monotonicity, and schema validity
"""

import os
import sys
import time
import json
import hashlib
import cv2
import numpy as np
from pathlib import Path

# Ensure local imports work
SRC_DIR = Path(__file__).resolve().parent.parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from tracker.kalman import TimestampAwareKalmanBoxTracker
from tracker.camera import CameraCompensator
from tracker.association import GatedTrackerAssociator, compute_iou, compute_centroid_distance
from tracker.lifecycle import TrackLifecycleManager, EntityTrack
from tracker.proposals import MobileSamProposalAdapter

from propagation.flow_warper import SparseLkMaskWarper, DenseFarnebackMaskWarper
from propagation.camera_aligner import CameraAligner
from propagation.new_entity_detector import NewEntityDetector
from propagation.adaptive_triggers import AdaptiveResegmentationManager
from propagation.keyframe_scheduler import KeyframeScheduler

TICKS_PER_SECOND = 120000


def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def extract_mask(d):
    if not d:
        return None
    m = d.get("mask")
    if m is not None and isinstance(m, np.ndarray):
        return (m > 0).astype(np.uint8)
    return None


def compute_appearance_hist(frame_bgr, mask=None, bbox=None):
    if frame_bgr is None:
        return None
    h, w = frame_bgr.shape[:2]
    if mask is not None and np.count_nonzero(mask) > 50:
        m = (mask > 0).astype(np.uint8)
    elif bbox is not None:
        x, y, bw, bh = [int(v) for v in bbox]
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(w, x + bw), min(h, y + bh)
        if x2 <= x1 or y2 <= y1:
            return None
        m = np.zeros((h, w), dtype=np.uint8)
        m[y1:y2, x1:x2] = 1
    else:
        return None
    hist = cv2.calcHist([frame_bgr], [0, 1, 2], m, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    cv2.normalize(hist, hist)
    return hist


def detect_shots(video_path, fps):
    cap = cv2.VideoCapture(video_path)
    shots = []
    cut_events = []
    frame_idx = 0
    shot_idx = 1
    shot_start_frame = 0
    prev_hist = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
        cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

        if prev_hist is not None:
            b_dist = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA)
            if b_dist > 0.65:
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
                    "details": {"cutType": "hard_cut", "bhattacharyyaDistance": round(float(b_dist), 4)}
                })
                shot_idx += 1
                shot_start_frame = frame_idx

        prev_hist = hist
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


def run_pipeline_vtsm03(video_path, output_json_path, ablation_mode="vtsm03_adaptive_hybrid", flow_algo="sparse_lk", proposal_adapter=None, max_frames=None):
    """
    Executes VTSM-03 tracking & propagation pipeline.
    Ablation modes:
    - 'vtsm02_full_mobilesam': Full-frame MobileSAM on every frame (reference baseline)
    - 'vtsm03_fixed_keyframe_N10': Keyframe every 10 frames + optical flow propagation
    - 'vtsm03_fixed_keyframe_N20': Keyframe every 20 frames + optical flow propagation
    - 'vtsm03_adaptive_hybrid': Dynamic keyframe intervals + optical flow + 4 adaptive reseg triggers
    """
    t0_start = time.time()
    if "dense" in ablation_mode and flow_algo == "sparse_lk":
        flow_algo = "dense_farneback"
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

    # 2. Modules
    camera_comp = CameraCompensator(width, height)
    camera_aligner = CameraAligner(width, height)
    associator = GatedTrackerAssociator(iou_threshold=0.15, max_centroid_dist=250.0)
    lifecycle_mgr = TrackLifecycleManager(max_missed_frames=45, min_hits_confirm=2)

    sparse_warper = SparseLkMaskWarper()
    dense_warper = DenseFarnebackMaskWarper()
    base_min_area = max(350, int(width * height * 0.003))
    new_entity_detector = NewEntityDetector(min_area=base_min_area, diff_threshold=28)
    reseg_mgr = AdaptiveResegmentationManager(cooldown_frames=3)
    scheduler = KeyframeScheduler(mode=ablation_mode, fixed_interval=20 if "N20" in ablation_mode else 10)

    # Proposal adapter (MobileSAM)
    if proposal_adapter is None:
        try:
            proposal_adapter = MobileSamProposalAdapter()
        except Exception as e:
            print(f"[VTSM-03] MobileSAM fallback to CPU: {e}")
            proposal_adapter = MobileSamProposalAdapter(device="cpu")

    cap = cv2.VideoCapture(video_path)
    frames_output = []
    events_output = list(cut_events)
    prev_gray = None
    prev_bgr = None

    # Track masks store: track_id -> uint8 mask
    active_masks = {}

    # Telemetry
    telemetry = {
        "total_frames": total_frames,
        "keyframe_encodings": 0,
        "propagated_frames": 0,
        "resegmentation_triggers": 0,
        "new_entities_discovered": 0,
        "frame_latencies_ms": []
    }

    current_shot_id = "shot_01"

    for frame_idx in range(total_frames):
        if max_frames and frame_idx >= max_frames:
            break
        t_frame_start = time.time()
        ret, frame_bgr = cap.read()
        if not ret:
            break

        pts = float(frame_idx / fps)
        ticks = int(round(pts * TICKS_PER_SECOND))
        curr_gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

        # Update current shot
        for s in shots:
            if s["startFrame"] <= frame_idx <= s["endFrame"]:
                current_shot_id = s["shotId"]
                break

        # Camera motion estimation
        if prev_gray is not None:
            cam_motion = camera_comp.estimate_motion(prev_gray, curr_gray)
        else:
            cam_motion = {"model": "identity", "translation": {"dx": 0.0, "dy": 0.0}, "scale": 1.0, "rotation": 0.0, "confidence": 1.0, "valid": True}

        # Scene cut handling
        is_cut = (frame_idx in cut_frame_indices)
        if is_cut:
            lifecycle_mgr.reset_on_scene_cut(frame_idx, pts)
            active_masks.clear()
            reseg_mgr.reset_on_cut(current_shot_id)

        # Active tracks (including tentative tracks so they can propagate and survive)
        active_tracks = lifecycle_mgr.get_active_tracks(include_occluded=True, include_tentative=True)
        track_boxes = []
        track_sigmas = []
        for track in active_tracks:
            pred_box = track.predict(pts)
            track_boxes.append(pred_box)
            _, _, sigma = track.kalman.get_state()
            track_sigmas.append(sigma)

        # Check new entity discovery on intermediate frames
        untracked_candidates = []
        if prev_gray is not None and not is_cut and ablation_mode == "vtsm03_adaptive_hybrid":
            aligned_prev_gray, _, _ = camera_aligner.align_frame_and_mask(prev_gray, np.zeros((height, width), dtype=np.uint8), cam_motion)
            active_bboxes = [t.current_bbox for t in active_tracks if t.is_observed]
            untracked_candidates = new_entity_detector.detect_untracked_entities(
                aligned_prev_gray, curr_gray, active_bboxes, frame_idx, width, height
            )

        # Scheduler decision
        is_kf, kf_reason = scheduler.is_keyframe(
            frame_idx,
            is_cut_frame=is_cut,
            has_new_entities=(len(untracked_candidates) > 0),
            has_reseg_triggers=False
        )

        detections = []

        if is_kf:
            telemetry["keyframe_encodings"] += 1
            if frame_idx == 0 or is_cut:
                saliency_props = MobileSamProposalAdapter.extract_saliency_proposals(frame_bgr, min_area=base_min_area)
                if len(saliency_props) > 0 and proposal_adapter:
                    proposal_adapter.encode_frame(frame_bgr, frame_idx)
                    raw_boxes = [p["bbox"] for p in saliency_props]
                    detections = proposal_adapter.segment_prompts(raw_boxes, frame_bgr=frame_bgr)
                else:
                    detections = saliency_props
            else:
                # Keyframe within shot: prompt with active/occluded track boxes + untracked candidates + uncovered saliency proposals
                observed_tracks_info = [(t, tb) for t, tb in zip(active_tracks, track_boxes) if t.is_observed or t.state == EntityTrack.STATE_OCCLUDED]
                prompt_boxes = [list(tb) for _, tb in observed_tracks_info]
                for c in untracked_candidates:
                    prompt_boxes.append(c["bbox"])
                    telemetry["new_entities_discovered"] += 1

                # Extract visual saliency proposals to catch uncovered subjects or drifted tracks
                saliency_props = MobileSamProposalAdapter.extract_saliency_proposals(frame_bgr, min_area=base_min_area)
                observed_boxes = [tb for _, tb in observed_tracks_info]
                for p in saliency_props:
                    p_box = p["bbox"]
                    max_iou = max([compute_iou(p_box, tb) for tb in observed_boxes], default=0.0)
                    min_dist = min([compute_centroid_distance(p_box, tb) for tb in observed_boxes], default=999.0)
                    if max_iou < 0.25 and min_dist > 80.0:
                        prompt_boxes.append(p_box)

                if len(prompt_boxes) > 0 and proposal_adapter:
                    proposal_adapter.encode_frame(frame_bgr, frame_idx)
                    detections = proposal_adapter.segment_prompts(prompt_boxes, frame_bgr=frame_bgr)

            det_boxes = [d["bbox"] for d in detections]
            track_hists = [t.reference_hist for t in active_tracks]
            det_hists = []
            for d in detections:
                h = compute_appearance_hist(frame_bgr, extract_mask(d), d["bbox"])
                d["hist"] = h
                det_hists.append(h)

            matches, unmatched_tracks, unmatched_dets = associator.associate(
                track_boxes, det_boxes, track_sigmas, track_hists=track_hists, det_hists=det_hists
            )

            tracks_before_step = len(lifecycle_mgr.tracks)
            lifecycle_mgr.step(
                detections=detections,
                current_pts=pts,
                frame_idx=frame_idx,
                matches=matches,
                unmatched_tracks=unmatched_tracks,
                unmatched_dets=unmatched_dets,
                is_propagation=False
            )

            # Update stored masks and reference_hist from segmentations for matched tracks
            for t_idx, d_idx in matches:
                tr = active_tracks[t_idx]
                d = detections[d_idx]
                mask_bin = extract_mask(d)
                if mask_bin is not None:
                    prev_m = active_masks.get(tr.track_id)
                    if prev_m is not None:
                        prev_a = np.count_nonzero(prev_m)
                        curr_a = np.count_nonzero(mask_bin)
                        if curr_a < 0.70 * prev_a:
                            mask_bin = prev_m
                            ys, xs = np.where(mask_bin > 0)
                            if len(xs) > 0:
                                g_box = [float(np.min(xs)), float(np.min(ys)), float(np.max(xs) - np.min(xs) + 1), float(np.max(ys) - np.min(ys) + 1)]
                                tr.current_bbox = g_box
                                tr.kalman.x[0] = g_box[0] + g_box[2] / 2.0
                                tr.kalman.x[1] = g_box[1] + g_box[3] / 2.0
                                tr.kalman.x[2] = g_box[2]
                                tr.kalman.x[3] = g_box[3]
                    active_masks[tr.track_id] = mask_bin
                    tr.current_mask = mask_bin
                if tr.reference_hist is None and d.get("hist") is not None:
                    tr.reference_hist = d["hist"]

            # Update stored masks and reference_hist for newly spawned tracks (frame 0 or new discoveries)
            spawned_tracks = lifecycle_mgr.tracks[tracks_before_step:]
            for new_tr, d_idx in zip(spawned_tracks, unmatched_dets):
                d = detections[d_idx]
                mask_bin = extract_mask(d)
                if mask_bin is not None:
                    active_masks[new_tr.track_id] = mask_bin
                    new_tr.current_mask = mask_bin
                if d.get("hist") is not None:
                    new_tr.reference_hist = d["hist"]

            # Synchronize active_masks for all active tracks (handles re-acquired occluded tracks)
            for tr in lifecycle_mgr.tracks:
                if tr.state in (EntityTrack.STATE_CONFIRMED, EntityTrack.STATE_TENTATIVE) and tr.current_mask is not None:
                    active_masks[tr.track_id] = tr.current_mask

            # Clean up active_masks for terminated tracks
            active_ids = {t.track_id for t in lifecycle_mgr.tracks if t.state != EntityTrack.STATE_TERMINATED}
            active_masks = {tid: m for tid, m in active_masks.items() if tid in active_ids}

        else:
            # INTERMEDIATE PROPAGATION FRAME
            telemetry["propagated_frames"] += 1
            propagated_detections = []
            reseg_needed_tracks = []

            for t_idx, track in enumerate(active_tracks):
                if track.track_id not in active_masks or not track.is_observed:
                    continue

                prev_mask = active_masks[track.track_id]

                # 1. Align prev_frame and prev_mask by camera motion (Safeguard B: exactly once)
                aligned_gray, aligned_mask, M_cam = camera_aligner.align_frame_and_mask(prev_gray, prev_mask, cam_motion)

                # 2. Local optical flow warp
                exp_d = None
                if track.hits >= 2 and track.missed_frames == 0:
                    vx = track.kalman.x[4]
                    vy = track.kalman.x[5]
                    dt = 1.0 / fps
                    cam_tx = float(M_cam[0, 2]) if M_cam is not None else 0.0
                    cam_ty = float(M_cam[1, 2]) if M_cam is not None else 0.0
                    exp_d = np.array([vx * dt - cam_tx, vy * dt - cam_ty], dtype=np.float32)

                flow_metrics = {}
                if flow_algo == "dense_farneback":
                    warped_mask, new_box, flow_metrics = dense_warper.warp_mask_roi(
                        aligned_gray, curr_gray, aligned_mask, track.current_bbox
                    )
                else:
                    warped_mask, new_box, flow_metrics = sparse_warper.warp_mask(
                        aligned_gray, curr_gray, aligned_mask, track.current_bbox, expected_disp=exp_d
                    )

                # 3. Check adaptive failure triggers in hybrid mode
                reseg = False
                if ablation_mode == "vtsm03_adaptive_hybrid":
                    kalman_c = [track_boxes[t_idx][0] + track_boxes[t_idx][2]/2.0, track_boxes[t_idx][1] + track_boxes[t_idx][3]/2.0]
                    flow_c = [new_box[0] + new_box[2]/2.0, new_box[1] + new_box[3]/2.0]
                    reseg, reseg_info = reseg_mgr.should_resegment(
                        track_id=track.track_id,
                        shot_id=current_shot_id,
                        frame_idx=frame_idx,
                        flow_metrics=flow_metrics,
                        prev_mask=prev_mask,
                        curr_mask=warped_mask,
                        kalman_center=kalman_c,
                        flow_center=flow_c,
                        prev_bgr=prev_bgr,
                        curr_bgr=frame_bgr,
                        cam_motion=cam_motion
                    )

                if reseg:
                    telemetry["resegmentation_triggers"] += 1
                    reseg_dist = np.hypot(kalman_c[0] - flow_c[0], kalman_c[1] - flow_c[1])
                    reseg_prompt_box = track_boxes[t_idx] if reseg_dist > 25.0 else (new_box if flow_metrics.get("valid", True) else track_boxes[t_idx])
                    reseg_needed_tracks.append((track, reseg_prompt_box))
                elif flow_metrics.get("valid", True):
                    # Accept propagated detection
                    propagated_detections.append({
                        "bbox": new_box,
                        "area": float(np.count_nonzero(warped_mask)),
                        "confidence": float(round(max(0.65, track.confidence * 0.98), 3)),
                        "mask": warped_mask,
                        "track_id_hint": track.track_id
                    })

            # If any track triggered re-segmentation, run MobileSAM prompt on demand
            if len(reseg_needed_tracks) > 0 and proposal_adapter:
                proposal_adapter.encode_frame(frame_bgr, frame_idx)
                reseg_boxes = [box for (_, box) in reseg_needed_tracks]
                reseg_dets = proposal_adapter.segment_prompts(reseg_boxes, frame_bgr=frame_bgr)
                for (tr, _), d in zip(reseg_needed_tracks, reseg_dets):
                    propagated_detections.append(d)

            # Associate propagated detections
            det_boxes = [d["bbox"] for d in propagated_detections]
            track_hists = [t.reference_hist for t in active_tracks]
            det_hists = []
            for d in propagated_detections:
                h = compute_appearance_hist(frame_bgr, extract_mask(d), d["bbox"])
                d["hist"] = h
                det_hists.append(h)

            matches, unmatched_tracks, unmatched_dets = associator.associate(
                track_boxes, det_boxes, track_sigmas, track_hists=track_hists, det_hists=det_hists
            )

            tracks_before_step = len(lifecycle_mgr.tracks)
            lifecycle_mgr.step(
                detections=propagated_detections,
                current_pts=pts,
                frame_idx=frame_idx,
                matches=matches,
                unmatched_tracks=unmatched_tracks,
                unmatched_dets=unmatched_dets,
                is_propagation=True
            )

            for t_idx, d_idx in matches:
                tr = active_tracks[t_idx]
                d = propagated_detections[d_idx]
                m = extract_mask(d)
                if m is not None:
                    active_masks[tr.track_id] = m
                    tr.current_mask = m

            for t_idx in unmatched_tracks:
                tr = active_tracks[t_idx]
                tr.current_mask = None
                if tr.track_id in active_masks:
                    del active_masks[tr.track_id]

            # Update stored masks for any newly spawned tracks from intermediate detections
            spawned_tracks = lifecycle_mgr.tracks[tracks_before_step:]
            for new_tr, d_idx in zip(spawned_tracks, unmatched_dets):
                d = propagated_detections[d_idx]
                mask_bin = extract_mask(d)
                if mask_bin is not None:
                    active_masks[new_tr.track_id] = mask_bin
                    new_tr.current_mask = mask_bin

            # Clean up active_masks for terminated tracks
            active_ids = {t.track_id for t in lifecycle_mgr.tracks if t.state != EntityTrack.STATE_TERMINATED}
            active_masks = {tid: m for tid, m in active_masks.items() if tid in active_ids}

        # 9. Format Frame Observation conforming to schema
        current_frame_tracks = lifecycle_mgr.get_active_tracks(include_occluded=True)
        frame_observations = []

        for tr in current_frame_tracks:
            bbox, vel, sigma = tr.kalman.get_state()
            x, y, w, h = tr.current_bbox
            cx = x + w / 2.0
            cy = y + h / 2.0

            is_vis = tr.is_observed and tr.state != EntityTrack.STATE_OCCLUDED
            vis_conf = float(min(1.0, max(0.0, tr.confidence if is_vis else 0.0)))
            trk_conf = float(min(1.0, max(0.0, tr.confidence)))

            obs = {
                "entityId": tr.track_id,
                "bbox": {
                    "pixel": {"x": float(round(x, 2)), "y": float(round(y, 2)), "width": float(round(w, 2)), "height": float(round(h, 2))},
                    "normalized": {"x": float(round(x / width, 5)), "y": float(round(y / height, 5)), "width": float(round(w / width, 5)), "height": float(round(h / height, 5))}
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
                    "compensated": {"dx": float(round(vel[0], 2)), "dy": float(round(vel[1], 2)), "valid": True}
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
        prev_bgr = frame_bgr

        t_frame_end = time.time()
        telemetry["frame_latencies_ms"].append((t_frame_end - t_frame_start) * 1000.0)

    cap.release()
    total_duration_ms = (time.time() - t0_start) * 1000.0

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

    latencies = telemetry["frame_latencies_ms"]
    p50_lat = float(round(float(np.median(latencies)), 2)) if latencies else 0.0
    p95_lat = float(round(float(np.percentile(latencies, 95)), 2)) if latencies else 0.0
    effective_fps = float(round(float(total_frames / (total_duration_ms / 1000.0)), 2))

    vtsm_document = {
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
            "extractor": f"vtsm03-propagation-{ablation_mode}",
            "version": "1.0.0",
            "license": "Apache-2.0",
            "pipeline": "VTSM-03 Efficient Temporal Propagation",
            "ablationMode": ablation_mode,
            "parameters": {
                "model": "MobileSAM-TinyViT",
                "flowAlgo": flow_algo,
                "effectiveFps": effective_fps,
                "medianLatencyMs": p50_lat,
                "p95LatencyMs": p95_lat,
                "keyframeEncodings": telemetry["keyframe_encodings"],
                "propagatedFrames": telemetry["propagated_frames"],
                "resegTriggers": telemetry["resegmentation_triggers"],
                "newEntities": telemetry["new_entities_discovered"]
            },
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "executionTimeMs": round(total_duration_ms, 2),
            "fps": effective_fps
        }
    }

    with open(output_json_path, "w") as f:
        json.dump(vtsm_document, f, indent=2)

    print(f"[VTSM-03] Processed {total_frames} frames in {total_duration_ms:.1f}ms ({effective_fps} FPS, P50={p50_lat}ms, P95={p95_lat}ms, Keyframes={telemetry['keyframe_encodings']}, Propagated={telemetry['propagated_frames']}, ResegTriggers={telemetry['resegmentation_triggers']})")
    return vtsm_document


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python pipeline_vtsm03.py <video_path> <output_json_path> [ablation_mode] [flow_algo]")
        sys.exit(1)
    v_path = sys.argv[1]
    o_path = sys.argv[2]
    a_mode = sys.argv[3] if len(sys.argv) > 3 else "vtsm03_adaptive_hybrid"
    f_algo = sys.argv[4] if len(sys.argv) > 4 else "sparse_lk"
    run_pipeline_vtsm03(v_path, o_path, a_mode, f_algo)
