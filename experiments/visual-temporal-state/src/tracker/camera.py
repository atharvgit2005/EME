"""
Camera Motion Estimator and Coordinate Compensation Module
Computes robust 2D RANSAC affine transformations and transforms entity bounding
boxes across camera motion to stabilize temporal association.
"""

import math
import numpy as np
import cv2


class CameraCompensator:
    """
    Estimates global camera motion using Lucas-Kanade optical flow + RANSAC partial affine,
    and applies compensation transforms to bounding boxes.
    """

    def __init__(self, frame_w=1920, frame_h=1080):
        self.frame_w = frame_w
        self.frame_h = frame_h
        self.cx_ref = frame_w / 2.0
        self.cy_ref = frame_h / 2.0

    def estimate_motion(self, prev_gray, curr_gray):
        """
        Estimate 2D affine camera motion: translation (dx, dy), scale, rotation, and confidence.
        """
        # Texture variance check (Laplacian)
        lap_var = float(cv2.Laplacian(curr_gray, cv2.CV_64F).var())
        if lap_var < 8.0:
            return {
                "model": "identity",
                "translation": {"dx": 0.0, "dy": 0.0},
                "scale": 1.0,
                "rotation": 0.0,
                "confidence": 0.25,
                "valid": False,
                "laplacianVar": round(lap_var, 2)
            }

        # Shi-Tomasi corners
        pts_prev = cv2.goodFeaturesToTrack(
            prev_gray,
            maxCorners=300,
            qualityLevel=0.01,
            minDistance=15,
            blockSize=7
        )

        if pts_prev is None or len(pts_prev) < 12:
            return {
                "model": "identity",
                "translation": {"dx": 0.0, "dy": 0.0},
                "scale": 1.0,
                "rotation": 0.0,
                "confidence": 0.3,
                "valid": False,
                "laplacianVar": round(lap_var, 2)
            }

        # Lucas-Kanade optical flow
        pts_curr, status, _ = cv2.calcOpticalFlowPyrLK(
            prev_gray, curr_gray, pts_prev, None,
            winSize=(21, 21), maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01)
        )

        good_prev = pts_prev[status == 1]
        good_curr = pts_curr[status == 1]

        if len(good_prev) < 10:
            return {
                "model": "identity",
                "translation": {"dx": 0.0, "dy": 0.0},
                "scale": 1.0,
                "rotation": 0.0,
                "confidence": 0.35,
                "valid": False,
                "laplacianVar": round(lap_var, 2)
            }

        # RANSAC Partial Affine
        M, inliers = cv2.estimateAffinePartial2D(
            good_prev, good_curr,
            method=cv2.RANSAC,
            ransacReprojThreshold=3.0
        )

        if M is None:
            return {
                "model": "identity",
                "translation": {"dx": 0.0, "dy": 0.0},
                "scale": 1.0,
                "rotation": 0.0,
                "confidence": 0.4,
                "valid": False,
                "laplacianVar": round(lap_var, 2)
            }

        # Decompose M = [[a, -b, tx], [b, a, ty]]
        a = float(M[0, 0])
        b = float(M[1, 0])
        tx = float(M[0, 2])
        ty = float(M[1, 2])

        scale = float(math.sqrt(a * a + b * b))
        rotation = float(math.atan2(b, a))

        # Optical center origin correction
        t_img_x = tx - (self.cx_ref * (1.0 - a) + self.cy_ref * b)
        t_img_y = ty - (self.cy_ref * (1.0 - a) - self.cx_ref * b)

        # Camera motion is opposite of image displacement
        cam_dx = -t_img_x
        cam_dy = -t_img_y

        inlier_count = int(np.sum(inliers)) if inliers is not None else 0
        inlier_ratio = inlier_count / len(good_prev) if len(good_prev) > 0 else 0
        confidence = float(min(1.0, max(0.5, inlier_ratio)))

        return {
            "model": "affine" if (abs(scale - 1.0) > 0.02 or abs(rotation) > 0.02) else "translation",
            "translation": {"dx": round(cam_dx, 3), "dy": round(cam_dy, 3)},
            "scale": round(scale, 4),
            "rotation": round(rotation, 5),
            "confidence": round(confidence, 3),
            "valid": True,
            "inlierRatio": round(inlier_ratio, 3),
            "inlierCount": inlier_count,
            "affineMatrix": [[float(a), float(-b), float(tx)], [float(b), float(a), float(ty)]]
        }

    def compensate_bbox(self, bbox, camera_motion):
        """
        Transforms bbox [x, y, w, h] from frame t-1 to frame t using the camera transform.
        If camera moves by (dx, dy), apparent subject location shifts by (-dx, -dy) plus scale/rotation.
        """
        if not camera_motion or not camera_motion.get("valid") or camera_motion.get("confidence", 1.0) < 0.4:
            return list(bbox)

        x, y, w, h = bbox
        corners = np.array([
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h]
        ], dtype=np.float32)

        if "affineMatrix" in camera_motion:
            M = np.array(camera_motion["affineMatrix"], dtype=np.float32)
        else:
            t_img_x = -camera_motion.get("translation", {}).get("dx", 0.0)
            t_img_y = -camera_motion.get("translation", {}).get("dy", 0.0)
            s = camera_motion.get("scale", 1.0)
            theta = camera_motion.get("rotation", 0.0)
            a = s * math.cos(theta)
            b = s * math.sin(theta)
            tx = t_img_x + (self.cx_ref * (1.0 - a) + self.cy_ref * b)
            ty = t_img_y + (self.cy_ref * (1.0 - a) - self.cx_ref * b)
            M = np.array([[a, -b, tx], [b, a, ty]], dtype=np.float32)

        # Transform corners: p_curr = M * [p_prev; 1]
        ones = np.ones((4, 1), dtype=np.float32)
        corners_h = np.hstack([corners, ones])
        transformed = (M @ corners_h.T).T

        min_x = float(np.min(transformed[:, 0]))
        max_x = float(np.max(transformed[:, 0]))
        min_y = float(np.min(transformed[:, 1]))
        max_y = float(np.max(transformed[:, 1]))

        new_w = max(2.0, max_x - min_x)
        new_h = max(2.0, max_y - min_y)
        return [min_x, min_y, new_w, new_h]
