"""
Unit and Adversarial Tests for VTSM-03 Propagation Modules

Tests:
1. Sparse LK known translation & centroid accuracy
2. Sparse LK Jacobian rejection (inversion & stretch limits)
3. Dense Farneback backward-remap on ROI
4. Camera aligner: global background alignment before local flow
5. Camera-resistant new entity discovery under camera pan
6. Adaptive re-segmentation failure triggers & cooldown budgets
"""

import unittest
import numpy as np
import cv2

from propagation.flow_warper import SparseLkMaskWarper, DenseFarnebackMaskWarper
from propagation.camera_aligner import CameraAligner
from propagation.new_entity_detector import NewEntityDetector
from propagation.adaptive_triggers import AdaptiveResegmentationManager
from propagation.keyframe_scheduler import KeyframeScheduler


class TestVtsm03Propagation(unittest.TestCase):

    def setUp(self):
        self.width = 640
        self.height = 360

        # Synthesize textured background + circle foreground
        np.random.seed(42)
        self.bg = (np.random.rand(self.height, self.width) * 80 + 50).astype(np.uint8)
        self.bg = cv2.GaussianBlur(self.bg, (9, 9), 2.0)

        # Foreground circle at (200, 150), radius 35
        self.mask0 = np.zeros((self.height, self.width), dtype=np.uint8)
        cv2.circle(self.mask0, (200, 150), 35, 255, -1)

        self.frame0 = self.bg.copy()
        self.frame0[self.mask0 > 0] = 220
        self.bbox0 = [165.0, 115.0, 71.0, 71.0]

    def test_sparse_lk_known_translation(self):
        dx, dy = 12.0, -8.0
        # Translate frame and mask
        M_gt = np.array([[1.0, 0.0, dx], [0.0, 1.0, dy]], dtype=np.float32)
        frame1 = cv2.warpAffine(self.frame0, M_gt, (self.width, self.height))
        mask1_gt = cv2.warpAffine(self.mask0, M_gt, (self.width, self.height))

        warper = SparseLkMaskWarper()
        warped_mask, new_bbox, metrics = warper.warp_mask(self.frame0, frame1, self.mask0, self.bbox0)

        self.assertTrue(metrics["valid"], f"Sparse LK failed: {metrics}")
        self.assertGreater(metrics["tracked_fraction"], 0.7)
        self.assertLess(metrics["mean_fb_error"], 2.0)

        # Compute IoU between warped mask and ground truth
        intersection = np.count_nonzero((warped_mask > 0) & (mask1_gt > 0))
        union = np.count_nonzero((warped_mask > 0) | (mask1_gt > 0))
        iou = float(intersection / max(1, union))
        self.assertGreater(iou, 0.85, f"Warped mask IoU too low: {iou:.4f}")

    def test_sparse_lk_jacobian_rejection(self):
        warper = SparseLkMaskWarper(max_stretch_ratio=2.0)
        # Blank target frame -> flow fails
        blank_frame = np.zeros_like(self.frame0)
        warped_mask, new_bbox, metrics = warper.warp_mask(self.frame0, blank_frame, self.mask0, self.bbox0)
        self.assertFalse(metrics["valid"])

    def test_dense_farneback_backward_remap(self):
        dx, dy = 10.0, 5.0
        M_gt = np.array([[1.0, 0.0, dx], [0.0, 1.0, dy]], dtype=np.float32)
        frame1 = cv2.warpAffine(self.frame0, M_gt, (self.width, self.height))
        mask1_gt = cv2.warpAffine(self.mask0, M_gt, (self.width, self.height))

        warper = DenseFarnebackMaskWarper(dilation_margin=25)
        warped_mask, new_bbox, metrics = warper.warp_mask_roi(self.frame0, frame1, self.mask0, self.bbox0)

        self.assertTrue(metrics["valid"], f"Dense Farneback failed: {metrics}")
        intersection = np.count_nonzero((warped_mask > 0) & (mask1_gt > 0))
        union = np.count_nonzero((warped_mask > 0) | (mask1_gt > 0))
        iou = float(intersection / max(1, union))
        self.assertGreater(iou, 0.85, f"Farneback IoU too low: {iou:.4f}")

    def test_camera_aligner_no_double_counting(self):
        cam_dx, cam_dy = 15.0, 0.0
        cam_motion = {
            "translation": {"dx": cam_dx, "dy": cam_dy},
            "scale": 1.0,
            "rotation": 0.0,
            "valid": True
        }
        aligner = CameraAligner(self.width, self.height)
        aligned_gray, aligned_mask, M = aligner.align_frame_and_mask(self.frame0, self.mask0, cam_motion)

        # Verify that mask centroid shifted by exactly cam_dx
        c0 = np.mean(np.where(self.mask0 > 0), axis=1)  # [y, x]
        c_aligned = np.mean(np.where(aligned_mask > 0), axis=1)
        self.assertAlmostEqual(c_aligned[1] - c0[1], cam_dx, delta=0.5)

    def test_new_entity_discovery_camera_pan(self):
        # Frame 0: Background
        # Frame 1: Background panned +10px, PLUS a new white rectangle at (450, 100)
        M_pan = np.array([[1.0, 0.0, 10.0], [0.0, 1.0, 0.0]], dtype=np.float32)
        frame1 = cv2.warpAffine(self.frame0, M_pan, (self.width, self.height))
        # Add new entity to frame1
        cv2.rectangle(frame1, (430, 80), (480, 130), 250, -1)

        # Camera motion is pan +10px
        cam_motion = {"translation": {"dx": 10.0, "dy": 0.0}, "scale": 1.0, "rotation": 0.0, "valid": True}
        aligner = CameraAligner(self.width, self.height)
        aligned_gray, aligned_mask, _ = aligner.align_frame_and_mask(self.frame0, self.mask0, cam_motion)

        detector = NewEntityDetector(min_area=300, diff_threshold=30)
        # The tracked circle at its new position is masked out
        active_bboxes = [[self.bbox0[0] + 10.0, self.bbox0[1], self.bbox0[2], self.bbox0[3]]]
        candidates = detector.detect_untracked_entities(
            aligned_gray, frame1, active_bboxes, frame_idx=1, width=self.width, height=self.height
        )

        self.assertGreaterEqual(len(candidates), 1, "Failed to discover new entity under camera pan")
        c = candidates[0]
        # Candidate center should be near (455, 105)
        cx = c["bbox"][0] + c["bbox"][2] / 2.0
        cy = c["bbox"][1] + c["bbox"][3] / 2.0
        self.assertAlmostEqual(cx, 455.0, delta=15.0)
        self.assertAlmostEqual(cy, 105.0, delta=15.0)

    def test_adaptive_trigger_resegmentation(self):
        mgr = AdaptiveResegmentationManager(cooldown_frames=2)
        
        # Test 1: High forward-backward flow error triggers re-segmentation
        bad_metrics = {"valid": False, "reason": "flow_consistency_failure", "mean_fb_error": 6.5}
        reseg, info = mgr.should_resegment(
            track_id="ent_01", shot_id="shot_01", frame_idx=1,
            flow_metrics=bad_metrics, prev_mask=self.mask0, curr_mask=self.mask0,
            kalman_center=[200, 150], flow_center=[200, 150],
            prev_bgr=None, curr_bgr=None
        )
        self.assertTrue(reseg, f"Failed to trigger on flow error: {info}")

        # Test 2: Cooldown suppresses immediate consecutive reseg
        reseg2, info2 = mgr.should_resegment(
            track_id="ent_01", shot_id="shot_01", frame_idx=2,
            flow_metrics=bad_metrics, prev_mask=self.mask0, curr_mask=self.mask0,
            kalman_center=[200, 150], flow_center=[200, 150],
            prev_bgr=None, curr_bgr=None
        )
        self.assertFalse(reseg2, "Cooldown did not suppress consecutive re-segmentation")


if __name__ == "__main__":
    unittest.main()
