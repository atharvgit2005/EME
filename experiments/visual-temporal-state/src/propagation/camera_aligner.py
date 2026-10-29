"""
VTSM-03 Camera Aligner & Coordinate System Transformer

Safeguard B: Compensate camera motion exactly once.
Aligns prev_frame and prev_mask into curr_frame global background coordinate frame
BEFORE local optical flow is estimated.

Transform Convention:
- Camera motion M_cam maps pixels from curr_frame to prev_frame (backward) or prev_frame to curr_frame (forward).
- camera_aligner aligns prev_frame into curr_frame coordinates:
  I_aligned(x, y) = I_prev(M_cam^-1 * [x, y, 1]^T)
- Then local optical flow estimates purely the residual object motion:
  Delta_p_object = p_curr - p_aligned
"""

import cv2
import numpy as np


class CameraAligner:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @staticmethod
    def synthesize_affine_matrix(cam_motion):
        """
        Synthesizes 2x3 affine matrix from cam_motion dict:
        translation (dx, dy), scale, rotation (rad).
        Camera motion (dx, dy) causes an apparent image shift of (-dx, -dy).
        """
        if "affineMatrix" in cam_motion and cam_motion["affineMatrix"] is not None:
            return np.array(cam_motion["affineMatrix"], dtype=np.float32)

        dx = float(cam_motion.get("translation", {}).get("dx", 0.0))
        dy = float(cam_motion.get("translation", {}).get("dy", 0.0))
        scale = float(cam_motion.get("scale", 1.0))
        rot = float(cam_motion.get("rotation", 0.0))

        # Camera motion is (dx, dy). Apparent image displacement to align prev to curr is (-dx, -dy)
        cos_t = np.cos(rot)
        sin_t = np.sin(rot)

        M = np.array([
            [scale * cos_t, -scale * sin_t, -dx],
            [scale * sin_t,  scale * cos_t, -dy]
        ], dtype=np.float32)

        return M

    def align_frame_and_mask(self, prev_gray, prev_mask, cam_motion):
        """
        Warps prev_gray and prev_mask by camera motion to align with curr_gray.
        Returns: (aligned_gray, aligned_mask, M_cam)
        """
        h, w = prev_gray.shape[:2]
        if not cam_motion.get("valid", True):
            return prev_gray.copy(), prev_mask.copy(), np.eye(2, 3, dtype=np.float32)

        M_cam = self.synthesize_affine_matrix(cam_motion)

        aligned_gray = cv2.warpAffine(
            prev_gray, M_cam, (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REFLECT_101
        )

        mask_u8 = (prev_mask > 0).astype(np.uint8) if prev_mask.dtype != np.uint8 else prev_mask
        aligned_mask = cv2.warpAffine(
            mask_u8, M_cam, (w, h),
            flags=cv2.INTER_NEAREST,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0
        )

        return aligned_gray, aligned_mask, M_cam
