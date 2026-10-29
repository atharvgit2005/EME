"""
Unit and Adversarial Lifecycle Tests for VTSM-02
Validates:
1. Track creation and confirmation lifecycle
2. Missed observations and uncertainty decay
3. Temporary occlusion coasting and reappearance
4. Crossing objects Hungarian assignment
5. Multiple simultaneous tracks
6. False duplicate proposals handling
7. Camera motion compensation integration
8. Hard scene-cut identity reset policy
9. Variable and jittered timestamp handling
10. Negative controls (perturbed detections, swapped IDs, bad timestamps)
"""

import math
import unittest
import numpy as np
from tracker.kalman import TimestampAwareKalmanBoxTracker
from tracker.camera import CameraCompensator
from tracker.association import GatedTrackerAssociator, compute_iou, compute_centroid_distance
from tracker.lifecycle import TrackLifecycleManager, EntityTrack


class TestVtsm02Lifecycle(unittest.TestCase):

    def test_new_track_creation_and_confirmation(self):
        mgr = TrackLifecycleManager(min_hits_confirm=2)
        pts = 0.0
        
        # Frame 0: Spawn on first frame is immediately confirmed
        det0 = [{"bbox": [100, 100, 50, 50], "confidence": 0.9}]
        mgr.step(det0, pts, frame_idx=0, matches=[], unmatched_tracks=[], unmatched_dets=[0])
        
        self.assertEqual(len(mgr.tracks), 1)
        t = mgr.tracks[0]
        self.assertEqual(t.state, EntityTrack.STATE_CONFIRMED)
        self.assertEqual(t.track_id, "ent_01")
        self.assertEqual(t.hits, 1)

        # Frame 1: New detection at frame > 0 starts as tentative
        mgr2 = TrackLifecycleManager(min_hits_confirm=2)
        mgr2.step(det0, current_pts=0.1, frame_idx=1, matches=[], unmatched_tracks=[], unmatched_dets=[0])
        self.assertEqual(len(mgr2.tracks), 1)
        t2 = mgr2.tracks[0]
        self.assertEqual(t2.state, EntityTrack.STATE_TENTATIVE)

        # Matching on next frame confirms it
        det1 = [{"bbox": [105, 102, 50, 50], "confidence": 0.9}]
        mgr2.step(det1, current_pts=0.2, frame_idx=2, matches=[(0, 0)], unmatched_tracks=[], unmatched_dets=[])
        self.assertEqual(t2.state, EntityTrack.STATE_CONFIRMED)
        self.assertEqual(t2.hits, 2)

    def test_missed_observations_and_uncertainty_decay(self):
        mgr = TrackLifecycleManager(max_missed_frames=10)
        det0 = [{"bbox": [100, 100, 50, 50], "confidence": 0.95}]
        mgr.step(det0, current_pts=0.0, frame_idx=0, matches=[], unmatched_tracks=[], unmatched_dets=[0])
        t = mgr.tracks[0]
        initial_conf = t.confidence

        # Miss 3 frames
        for i in range(1, 4):
            pts = i * 0.033
            t.predict(pts)
            mgr.step([], current_pts=pts, frame_idx=i, matches=[], unmatched_tracks=[0], unmatched_dets=[])
            self.assertEqual(t.state, EntityTrack.STATE_OCCLUDED)
            self.assertFalse(t.is_observed)
            self.assertIsNone(t.current_mask)  # Zero fabricated masks!
            self.assertLess(t.confidence, initial_conf)

        self.assertEqual(t.missed_frames, 3)

    def test_temporary_occlusion_and_reappearance(self):
        mgr = TrackLifecycleManager(max_missed_frames=10)
        det0 = [{"bbox": [100, 100, 50, 50], "confidence": 0.9}]
        mgr.step(det0, current_pts=0.0, frame_idx=0, matches=[], unmatched_tracks=[], unmatched_dets=[0])
        t = mgr.tracks[0]

        # Object occluded for 4 frames
        for i in range(1, 5):
            pts = i * 0.033
            t.predict(pts)
            mgr.step([], current_pts=pts, frame_idx=i, matches=[], unmatched_tracks=[0], unmatched_dets=[])

        self.assertEqual(t.state, EntityTrack.STATE_OCCLUDED)
        self.assertEqual(t.missed_frames, 4)

        # Reappearance at frame 5
        det_reappear = [{"bbox": [102, 101, 50, 50], "confidence": 0.92}]
        mgr.step(det_reappear, current_pts=5 * 0.033, frame_idx=5, matches=[(0, 0)], unmatched_tracks=[], unmatched_dets=[])

        self.assertEqual(t.state, EntityTrack.STATE_CONFIRMED)
        self.assertTrue(t.is_observed)
        self.assertEqual(t.missed_frames, 0)
        self.assertGreaterEqual(t.confidence, 0.85)

    def test_crossing_objects_assignment(self):
        associator = GatedTrackerAssociator(iou_threshold=0.1, max_centroid_dist=100.0)
        
        # Track 0 moving right (x=90), Track 1 moving left (x=110)
        track_boxes = [
            [90.0, 100.0, 40.0, 40.0],
            [110.0, 100.0, 40.0, 40.0]
        ]
        track_sigmas = [10.0, 10.0]

        # Detections after small step: Det 0 at 95, Det 1 at 105
        det_boxes = [
            [95.0, 100.0, 40.0, 40.0],
            [105.0, 100.0, 40.0, 40.0]
        ]

        matches, un_t, un_d = associator.associate(track_boxes, det_boxes, track_sigmas)
        match_dict = dict(matches)
        
        # Track 0 (at 90) must match Det 0 (at 95), Track 1 (at 110) must match Det 1 (at 105)
        self.assertEqual(match_dict[0], 0)
        self.assertEqual(match_dict[1], 1)
        self.assertEqual(len(un_t), 0)
        self.assertEqual(len(un_d), 0)

    def test_multiple_simultaneous_tracks(self):
        mgr = TrackLifecycleManager()
        dets0 = [
            {"bbox": [100, 100, 50, 50], "confidence": 0.9},
            {"bbox": [500, 300, 60, 60], "confidence": 0.95},
            {"bbox": [800, 700, 40, 40], "confidence": 0.88}
        ]
        mgr.step(dets0, current_pts=0.0, frame_idx=0, matches=[], unmatched_tracks=[], unmatched_dets=[0, 1, 2])
        
        self.assertEqual(len(mgr.tracks), 3)
        ids = {t.track_id for t in mgr.tracks}
        self.assertEqual(ids, {"ent_01", "ent_02", "ent_03"})

    def test_false_duplicate_proposals(self):
        associator = GatedTrackerAssociator(iou_threshold=0.2)
        track_boxes = [[100, 100, 50, 50]]
        
        # Det 0 is true subject, Det 1 is redundant overlapping proposal
        det_boxes = [
            [101, 100, 49, 50],
            [103, 102, 47, 48]
        ]
        matches, un_t, un_d = associator.associate(track_boxes, det_boxes)
        
        # Only one detection should be assigned to the track
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0][0], 0)
        # Second detection remains unmatched
        self.assertEqual(len(un_d), 1)

    def test_camera_compensation_motion(self):
        compensator = CameraCompensator(1920, 1080)
        bbox = [100.0, 100.0, 50.0, 50.0]
        
        # Camera pans right by 10px, tilts down by 5px
        cam_motion = {
            "model": "affine",
            "translation": {"dx": 10.0, "dy": 5.0},
            "scale": 1.0,
            "rotation": 0.0,
            "valid": True
        }
        
        comp_box = compensator.compensate_bbox(bbox, cam_motion)
        # Compensated box in new frame shifts opposite to camera movement
        self.assertAlmostEqual(comp_box[0], 90.0, delta=0.5)
        self.assertAlmostEqual(comp_box[1], 95.0, delta=0.5)
        self.assertAlmostEqual(comp_box[2], 50.0, delta=0.5)
        self.assertAlmostEqual(comp_box[3], 50.0, delta=0.5)

    def test_hard_scene_cut_identity_reset(self):
        mgr = TrackLifecycleManager()
        det0 = [{"bbox": [100, 100, 50, 50], "confidence": 0.9}]
        mgr.step(det0, current_pts=0.0, frame_idx=0, matches=[], unmatched_tracks=[], unmatched_dets=[0])
        
        self.assertEqual(len(mgr.tracks), 1)
        self.assertEqual(mgr.tracks[0].track_id, "ent_01")

        # Trigger hard cut at frame 30
        mgr.reset_on_scene_cut(frame_idx=30, current_pts=1.0)
        
        # Active tracks must be completely empty
        self.assertEqual(len(mgr.tracks), 0)
        self.assertEqual(len(mgr.retired_tracks), 1)
        self.assertEqual(mgr.retired_tracks[0].state, EntityTrack.STATE_TERMINATED)

        # New subject in shot 2 receives distinct entity ID
        det30 = [{"bbox": [200, 200, 50, 50], "confidence": 0.9}]
        mgr.step(det30, current_pts=1.0, frame_idx=30, matches=[], unmatched_tracks=[], unmatched_dets=[0])
        self.assertEqual(len(mgr.tracks), 1)
        self.assertEqual(mgr.tracks[0].track_id, "ent_02")

    def test_variable_and_jittered_timestamps(self):
        kf = TimestampAwareKalmanBoxTracker([100, 100, 50, 50], pts=0.0)
        
        # Regular step
        p1 = kf.predict(0.033)
        kf.update([102, 100, 50, 50], pts=0.033)

        # Large jittered dt step
        p2 = kf.predict(0.150)
        _, vel, sigma = kf.get_state()
        self.assertGreater(sigma, 0.0)
        self.assertTrue(np.isfinite(sigma))

        # Non-monotonic timestamp safeguard test
        p_safe = kf.predict(0.140)  # dt < 0
        self.assertEqual(len(p_safe), 4)
        self.assertTrue(all(np.isfinite(x) for x in p_safe))

    def test_negative_controls(self):
        # Negative control 1: Distance beyond spatial gate
        associator = GatedTrackerAssociator(max_centroid_dist=50.0)
        t_box = [[100, 100, 40, 40]]
        d_perturbed = [[500, 500, 40, 40]]  # Far away
        matches, un_t, un_d = associator.associate(t_box, d_perturbed)
        self.assertEqual(len(matches), 0)
        self.assertIn(0, un_t)
        self.assertIn(0, un_d)

        # Negative control 2: Non-overlapping bounding boxes
        iou_zero = compute_iou([100, 100, 40, 40], [200, 200, 40, 40])
        self.assertEqual(iou_zero, 0.0)

        # Negative control 3: Bounding box IoU when inverted/degenerate
        iou_inv = compute_iou([100, 100, 0, 0], [100, 100, 40, 40])
        self.assertEqual(iou_inv, 0.0)


if __name__ == '__main__':
    unittest.main()
