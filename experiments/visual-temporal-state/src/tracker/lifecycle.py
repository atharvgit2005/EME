"""
Track Lifecycle Management Module
State machine supporting tentative, confirmed, occluded, lost, and terminated tracks,
with honest uncertainty decay and strict cut-boundary identity resets.
"""

import math
import cv2
from .kalman import TimestampAwareKalmanBoxTracker
from .association import compute_iou, compute_centroid_distance


class EntityTrack:
    """
    Persistent entity track with Kalman state, lifecycle transitions, and confidence decay.
    """

    STATE_TENTATIVE = "tentative"
    STATE_CONFIRMED = "confirmed"
    STATE_OCCLUDED = "occluded"
    STATE_TERMINATED = "terminated"

    def __init__(self, track_id, initial_bbox, pts, frame_idx, mask=None, initial_conf=0.9):
        self.track_id = track_id
        self.kalman = TimestampAwareKalmanBoxTracker(initial_bbox, pts)
        self.state = self.STATE_TENTATIVE
        self.hits = 1
        self.age = 1
        self.missed_frames = 0
        self.propagated_frames = 0
        self.last_seen_frame = frame_idx
        self.last_pts = pts
        self.confidence = float(initial_conf)
        self.current_bbox = list(initial_bbox)
        self.current_mask = mask
        self.is_observed = True
        self.trajectory_history = []
        self.reference_hist = None
        self.canonical_w = float(initial_bbox[2])
        self.canonical_h = float(initial_bbox[3])

    def predict(self, current_pts):
        """
        Advance motion state to current_pts.
        """
        pred_bbox = self.kalman.predict(current_pts)
        if self.state == self.STATE_OCCLUDED and self.canonical_w > 0 and self.canonical_h > 0:
            cx = pred_bbox[0] + pred_bbox[2] / 2.0
            cy = pred_bbox[1] + pred_bbox[3] / 2.0
            pred_bbox = [
                float(cx - self.canonical_w / 2.0),
                float(cy - self.canonical_h / 2.0),
                float(self.canonical_w),
                float(self.canonical_h)
            ]
        self.current_bbox = pred_bbox
        self.last_pts = current_pts
        self.age += 1
        return pred_bbox

    def update_matched(self, measured_bbox, current_pts, frame_idx, mask=None, measured_conf=0.9):
        """
        Independent fresh observation matched in current frame.
        Increments hit count toward confirmation.
        """
        self.kalman.update(measured_bbox, pts=current_pts)
        self.current_bbox = list(measured_bbox)
        self.current_mask = mask
        self.last_seen_frame = frame_idx
        self.last_pts = current_pts
        self.hits += 1
        self.missed_frames = 0
        self.propagated_frames = 0
        self.is_observed = True

        # Transition to confirmed after 2 hits
        if self.hits >= 2:
            self.state = self.STATE_CONFIRMED
            if measured_bbox[2] > 0 and measured_bbox[3] > 0:
                self.canonical_w = max(self.canonical_w, float(measured_bbox[2]))
                self.canonical_h = max(self.canonical_h, float(measured_bbox[3]))

        self.confidence = float(min(1.0, max(0.65, measured_conf)))

    def update_propagated(self, measured_bbox, current_pts, frame_idx, mask=None, conf=0.7):
        """
        Optical flow propagation across intermediate frame.
        Maintains continuity evidence but does NOT increment hits toward confirmation.
        """
        self.kalman.update(measured_bbox, pts=current_pts)
        self.current_bbox = list(measured_bbox)
        self.current_mask = mask
        self.last_seen_frame = frame_idx
        self.last_pts = current_pts
        self.missed_frames = 0
        self.propagated_frames += 1
        self.is_observed = True
        self.confidence = float(min(1.0, max(0.5, conf)))

    def update_missed(self, frame_idx):
        """
        No matching observation in current frame (temporary occlusion or exit).
        """
        self.missed_frames += 1
        self.is_observed = False
        self.current_mask = None  # Never fabricate an unobserved mask!

        # Coast current_bbox using Kalman dead-reckoning prediction
        pred_box, _, _ = self.kalman.get_state()
        self.current_bbox = list(pred_box)

        if self.state == self.STATE_CONFIRMED:
            self.state = self.STATE_OCCLUDED

        # Confidence decay during occlusion: 0.9 -> 0.7 -> 0.5 -> 0.3
        decay = math.exp(-0.08 * self.missed_frames)
        self.confidence = max(0.15, 0.85 * decay)


class TrackLifecycleManager:
    """
    Manages track creation, confirmation, occlusion coasting, and hard scene cut policy.
    """

    def __init__(self, max_missed_frames=45, min_hits_confirm=2, max_tentative_propagations=15):
        self.max_missed_frames = max_missed_frames
        self.min_hits_confirm = min_hits_confirm
        self.max_tentative_propagations = max_tentative_propagations
        self.tracks = []
        self.next_track_num = 1
        self.retired_tracks = []

    def reset_on_scene_cut(self, frame_idx, current_pts):
        """
        Enforce strict scene-cut policy: Terminate all active tracks at hard cut boundaries
        to prevent invalid cross-shot identity carryover.
        """
        for t in self.tracks:
            t.state = EntityTrack.STATE_TERMINATED
            self.retired_tracks.append(t)
        self.tracks = []

    def step(self, detections, current_pts, frame_idx, matches, unmatched_tracks, unmatched_dets, is_propagation=False):
        """
        Updates active tracks based on association results and spawns new tracks.
        detections: list of dicts with {"bbox": [x,y,w,h], "mask": ..., "confidence": ...}
        """
        # 1. Update matched tracks
        for t_idx, d_idx in matches:
            if t_idx >= len(self.tracks):
                continue
            det = detections[d_idx]
            tr = self.tracks[t_idx]
            if is_propagation:
                tr.update_propagated(
                    measured_bbox=det["bbox"],
                    current_pts=current_pts,
                    frame_idx=frame_idx,
                    mask=det.get("mask"),
                    conf=det.get("confidence", 0.7)
                )
            else:
                tr.update_matched(
                    measured_bbox=det["bbox"],
                    current_pts=current_pts,
                    frame_idx=frame_idx,
                    mask=det.get("mask"),
                    measured_conf=det.get("confidence", 0.9)
                )

        # 2. Update unmatched tracks (mark missed / occluded)
        for t_idx in unmatched_tracks:
            self.tracks[t_idx].update_missed(frame_idx)

        # 3. Handle unmatched detections
        for d_idx in unmatched_dets:
            det = detections[d_idx]

            # At keyframes (not propagation), check if detection belongs to an existing occluded track
            if not is_propagation:
                best_occ = None
                best_dist = 9999.0
                det_h = det.get("hist")
                for occ_tr in [t for t in self.tracks if t.state == EntityTrack.STATE_OCCLUDED]:
                    if occ_tr.reference_hist is not None and det_h is not None:
                        rho = float(cv2.compareHist(occ_tr.reference_hist, det_h, cv2.HISTCMP_CORREL))
                        if rho < 0.20:
                            continue  # Identity mismatch: distinct appearance
                    dist = compute_centroid_distance(occ_tr.current_bbox, det["bbox"])
                    iou = compute_iou(occ_tr.current_bbox, det["bbox"])
                    if (dist < 450.0 or iou > 0.05) and dist < best_dist:
                        best_dist = dist
                        best_occ = occ_tr

                if best_occ is not None:
                    best_occ.update_matched(
                        measured_bbox=det["bbox"],
                        current_pts=current_pts,
                        frame_idx=frame_idx,
                        mask=det.get("mask"),
                        measured_conf=det.get("confidence", 0.9)
                    )
                    best_occ.state = EntityTrack.STATE_CONFIRMED
                    continue

            # Otherwise, spawn new track
            track_id = f"ent_{self.next_track_num:02d}"
            self.next_track_num += 1

            new_track = EntityTrack(
                track_id=track_id,
                initial_bbox=det["bbox"],
                pts=current_pts,
                frame_idx=frame_idx,
                mask=det.get("mask"),
                initial_conf=det.get("confidence", 0.85)
            )
            # If spawned on frame 0, confirm immediately
            if frame_idx == 0:
                new_track.state = EntityTrack.STATE_CONFIRMED

            self.tracks.append(new_track)

        # 4. Prune expired tracks
        surviving_tracks = []
        for t in self.tracks:
            if t.missed_frames > self.max_missed_frames:
                t.state = EntityTrack.STATE_TERMINATED
                self.retired_tracks.append(t)
            elif t.state == EntityTrack.STATE_TENTATIVE:
                # Bounded tentative lifetime: max 2 missed frames or max 15 unconfirmed propagations
                if t.missed_frames > 2 or t.propagated_frames > self.max_tentative_propagations:
                    t.state = EntityTrack.STATE_TERMINATED
                    self.retired_tracks.append(t)
                else:
                    surviving_tracks.append(t)
            else:
                surviving_tracks.append(t)

        self.tracks = surviving_tracks

    def get_active_tracks(self, include_occluded=True, include_tentative=False):
        """
        Returns list of active tracks according to lifecycle filters.
        """
        valid_states = [EntityTrack.STATE_CONFIRMED]
        if include_occluded:
            valid_states.append(EntityTrack.STATE_OCCLUDED)
        if include_tentative:
            valid_states.append(EntityTrack.STATE_TENTATIVE)

        return [t for t in self.tracks if t.state in valid_states]

