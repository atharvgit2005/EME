"""Checks the existing physics modules used by the scene worker, using real OpenCV."""

import unittest, sys
from unittest.mock import patch
from pathlib import Path
import numpy as np, cv2

sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1] / "experiments/visual-temporal-state/src"),
)
from tracker.kalman import TimestampAwareKalmanBoxTracker
from tracker.camera import CameraCompensator
from propagation.flow_warper import SparseLkMaskWarper


class PhysicsTests(unittest.TestCase):
    def test_variable_dt_prediction_and_covariance(self):
        k = TimestampAwareKalmanBoxTracker(
            [10, 20, 30, 40], 0, initial_velocity=(12, -4)
        )
        first = k.predict(0.25)
        self.assertAlmostEqual(first[0], 13)
        self.assertAlmostEqual(first[1], 19)
        uncertainty = k.get_state()[2]
        second = k.predict(1.25)
        self.assertAlmostEqual(second[0], 25)
        self.assertGreater(k.get_state()[2], uncertainty)

    def test_camera_translation_convention(self):
        rng = np.random.default_rng(2)
        image = rng.integers(0, 255, (180, 320), dtype="uint8")
        moved = cv2.warpAffine(image, np.float32([[1, 0, 7], [0, 1, 3]]), (320, 180))
        result = CameraCompensator(320, 180).estimate_motion(image, moved)
        self.assertTrue(result["valid"])
        self.assertAlmostEqual(result["translation"]["dx"], -7, delta=1)
        self.assertAlmostEqual(result["translation"]["dy"], -3, delta=1)

    def test_flow_does_not_apply_camera_translation_twice(self):
        rng = np.random.default_rng(4)
        image = rng.integers(0, 255, (180, 320), dtype="uint8")
        mask = np.zeros((180, 320), dtype="uint8")
        mask[45:115, 60:140] = 1
        moved = cv2.warpAffine(image, np.float32([[1, 0, 5], [0, 1, 0]]), (320, 180))
        warped, bounds, q = SparseLkMaskWarper().warp_mask(
            image, moved, mask, [60, 45, 80, 70]
        )
        self.assertTrue(q["valid"])
        self.assertAlmostEqual(bounds[0], 65, delta=2)

    def test_missing_and_nonfinite_flow_abstain(self):
        image = np.zeros((180, 320), dtype="uint8")
        mask = image.copy(); mask[45:115, 60:140] = 1
        for output in [(None, None, None), (np.full((120, 2), np.nan, dtype=np.float32), np.ones((120, 1)), None)]:
            with patch("cv2.calcOpticalFlowPyrLK", return_value=output):
                _, _, q = SparseLkMaskWarper().warp_mask(image, image, mask)
                self.assertFalse(q["valid"])

    def test_translation_sweep(self):
        for seed in range(6):
            rng = np.random.default_rng(seed)
            image = rng.integers(0, 255, (180, 320), dtype="uint8")
            mask = np.zeros((180, 320), dtype="uint8"); mask[45:115, 60:140] = 1
            for dx, dy in [(-7, 2), (0, 0), (3, -4), (8, 5)]:
                moved = cv2.warpAffine(image, np.float32([[1, 0, dx], [0, 1, dy]]), (320, 180))
                _, b, q = SparseLkMaskWarper().warp_mask(image, moved, mask)
                self.assertTrue(q["valid"], (seed, dx, dy, q))
                self.assertAlmostEqual(b[0], 60 + dx, delta=2)
                self.assertAlmostEqual(b[1], 45 + dy, delta=2)


if __name__ == "__main__":
    unittest.main()
