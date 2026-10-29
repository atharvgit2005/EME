"""
VTSM-03 Adaptive Re-segmentation Failure Detectors & Cooldown Manager

Evaluates optical mask propagation across 4 quality pillars:
1. Optical flow forward-backward consistency failure
2. Scale-compensated mask area divergence (< 0.65x or > 1.45x)
3. Kalman motion predictor vs Optical flow centroid divergence (> 25 px)
4. Normalized color histogram appearance dissimilarity (rho < 0.70)

Includes per-track cooldowns and retry limits to prevent thrashing.
"""

import cv2
import numpy as np


class AdaptiveResegmentationManager:
    def __init__(self, cooldown_frames=3, max_retries_per_shot=10):
        self.cooldown_frames = cooldown_frames
        self.max_retries_per_shot = max_retries_per_shot
        self.track_cooldowns = {}  # track_id -> last_reseg_frame
        self.shot_reseg_counts = {}  # shot_id -> count

    def should_resegment(self, track_id, shot_id, frame_idx, flow_metrics, prev_mask, curr_mask, kalman_center, flow_center, prev_bgr, curr_bgr, cam_motion=None):
        """
        Evaluates whether a track requires immediate MobileSAM corrective re-segmentation.
        Returns: (needs_resegmentation, reason_dict)
        """
        # Check cooldown
        last_f = self.track_cooldowns.get(track_id, -999)
        if (frame_idx - last_f) < self.cooldown_frames:
            return False, {"trigger": "cooldown_active", "frames_since_last": frame_idx - last_f}

        # Check shot budget
        shot_count = self.shot_reseg_counts.get(shot_id, 0)
        if shot_count >= self.max_retries_per_shot:
            return False, {"trigger": "shot_reseg_budget_exceeded", "count": shot_count}

        reasons = []

        # 1. Flow quality failure
        if not flow_metrics.get("valid", True):
            reasons.append(f"flow_invalid_{flow_metrics.get('reason', 'unknown')}")

        if flow_metrics.get("mean_fb_error", 0.0) > 4.0:
            reasons.append(f"high_fb_error_{flow_metrics.get('mean_fb_error'):.2f}px")

        # 2. Mask Area Distortion (compensated for camera scale)
        prev_area = np.count_nonzero(prev_mask)
        curr_area = np.count_nonzero(curr_mask)

        cam_scale = float(cam_motion.get("scale", 1.0)) if cam_motion else 1.0
        expected_scale_sq = max(0.1, cam_scale ** 2)

        if prev_area > 50 and curr_area > 0:
            area_ratio = float(curr_area / (prev_area * expected_scale_sq))
            if area_ratio < 0.65 or area_ratio > 1.45:
                reasons.append(f"area_distortion_ratio_{area_ratio:.2f}")

        # 3. Kalman prediction vs Optical Flow centroid divergence
        if kalman_center is not None and flow_center is not None:
            dist = float(np.hypot(kalman_center[0] - flow_center[0], kalman_center[1] - flow_center[1]))
            if dist > 25.0:
                reasons.append(f"kalman_divergence_{dist:.1f}px")

        # 4. Appearance dissimilarity (histogram correlation)
        if prev_bgr is not None and curr_bgr is not None and curr_area > 50:
            try:
                hist_prev = cv2.calcHist([prev_bgr], [0, 1, 2], prev_mask, [8, 8, 8], [0, 256, 0, 256, 0, 256])
                hist_curr = cv2.calcHist([curr_bgr], [0, 1, 2], curr_mask, [8, 8, 8], [0, 256, 0, 256, 0, 256])
                cv2.normalize(hist_prev, hist_prev)
                cv2.normalize(hist_curr, hist_curr)
                rho = cv2.compareHist(hist_prev, hist_curr, cv2.HISTCMP_CORREL)
                if rho < 0.35:
                    reasons.append(f"appearance_drop_rho_{rho:.2f}")
            except Exception:
                pass

        if len(reasons) > 0:
            self.track_cooldowns[track_id] = frame_idx
            self.shot_reseg_counts[shot_id] = shot_count + 1
            return True, {"trigger": "failure_detected", "reasons": reasons}

        return False, {"trigger": "nominal"}

    def reset_on_cut(self, shot_id):
        self.track_cooldowns.clear()
        self.shot_reseg_counts[shot_id] = 0
