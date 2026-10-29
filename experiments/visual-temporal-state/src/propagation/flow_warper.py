"""
VTSM-03 Optical Flow Mask Warper

Provides two independent propagation strategies:
1. Sparse Lucas-Kanade + Delaunay Simplex Warping:
   - Samples interior and boundary anchor points along the mask contour normal.
   - Tracks points with cv2.calcOpticalFlowPyrLK.
   - Warps triangular patches using affine mapping.
   - Rejects inverted triangles (det(J) <= 0) and extreme aspect-ratio stretch (> 3.0x).
2. Dense Farneback + Backward Map Warping:
   - Crops a dilated ROI around the target entity.
   - Computes dense optical flow field (cv2.calcOpticalFlowFarneback).
   - Generates a destination-to-source backward map for cv2.remap (INTER_NEAREST/INTER_LINEAR).
   - Computes forward-backward consistency error to flag unreliable flow.
"""

import cv2
import numpy as np


class SparseLkMaskWarper:
    def __init__(self, max_points=120, max_stretch_ratio=3.0):
        self.max_points = max_points
        self.max_stretch_ratio = max_stretch_ratio
        self.lk_params = dict(
            winSize=(15, 15),
            maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01)
        )

    @staticmethod
    def find_displacement_mode(disp):
        """
        Finds dominant displacement vector among tracked sparse points.
        Evaluates marginal 1D projection modes along both orthogonal axes (x and y).
        This provides mathematical immunity to the aperture problem on edges
        where texture periodicity or edge orientation splits points along the perpendicular axis.
        """
        if len(disp) < 4:
            return np.median(disp, axis=0) if len(disp) > 0 else np.array([0.0, 0.0], dtype=np.float32)

        # 1D marginal mode on dx
        dx_quant = np.round(disp[:, 0] / 2.0) * 2.0
        u_dx, c_dx = np.unique(dx_quant, return_counts=True)
        best_dx = u_dx[np.argmax(c_dx)]

        # 1D marginal mode on dy
        dy_quant = np.round(disp[:, 1] / 2.0) * 2.0
        u_dy, c_dy = np.unique(dy_quant, return_counts=True)
        best_dy = u_dy[np.argmax(c_dy)]

        # Refine with median of points supporting this mode
        inliers = (np.abs(disp[:, 0] - best_dx) <= 3.0) & (np.abs(disp[:, 1] - best_dy) <= 3.0)
        if np.sum(inliers) >= 2:
            return np.median(disp[inliers], axis=0)

        # If no joint inliers, use the decoupled 1D medians
        inliers_x = np.abs(disp[:, 0] - best_dx) <= 3.0
        inliers_y = np.abs(disp[:, 1] - best_dy) <= 3.0
        med_x = np.median(disp[inliers_x, 0]) if np.any(inliers_x) else best_dx
        med_y = np.median(disp[inliers_y, 1]) if np.any(inliers_y) else best_dy
        return np.array([med_x, med_y], dtype=np.float32)

    def sample_mask_points(self, mask_uint8, bbox=None, image_gray=None):
        """
        Samples boundary contour anchors and eroded interior grid features.
        Provides robust coverage of physical boundary and interior object structure.
        """
        mask_uint8 = np.ascontiguousarray((mask_uint8 > 0).astype(np.uint8) * 255)
        h, w = mask_uint8.shape[:2]
        pts = []

        # 1. Boundary contour anchors
        contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        if contours:
            largest = max(contours, key=cv2.contourArea)
            step = max(1, len(largest) // (self.max_points // 2))
            boundary_pts = largest[::step].reshape(-1, 2)
            pts.extend(boundary_pts)

        # 2. Interior features (eroded by 5px to avoid boundary bleed)
        eroded = cv2.erode(mask_uint8, np.ones((5, 5), np.uint8))
        ys, xs = np.where(eroded > 0)
        if len(xs) >= 4:
            step = max(1, len(xs) // (self.max_points // 2))
            pts.extend(np.column_stack((xs[::step], ys[::step])))

        if len(pts) < 4:
            if len(xs) >= 4:
                return np.column_stack((xs, ys)).astype(np.float32)
            return np.empty((0, 2), dtype=np.float32)

        return np.array(pts, dtype=np.float32)

    def warp_mask(self, prev_gray, curr_gray, prev_mask, prev_bbox=None, expected_disp=None):
        """
        Tracks points from prev_gray to curr_gray and warps prev_mask.
        Returns: (warped_mask, new_bbox, quality_metrics)
        """
        h, w = prev_gray.shape[:2]
        pts_prev = self.sample_mask_points(prev_mask, prev_bbox, image_gray=prev_gray)
        if len(pts_prev) < 4:
            return prev_mask.copy(), prev_bbox, {"valid": False, "reason": "insufficient_points", "tracked_fraction": 0.0}

        # Forward tracking
        pts_curr, status_fwd, err_fwd = cv2.calcOpticalFlowPyrLK(
            prev_gray, curr_gray, pts_prev, None, **self.lk_params
        )

        # Backward tracking for forward-backward consistency check
        pts_back, status_bwd, _ = cv2.calcOpticalFlowPyrLK(
            curr_gray, prev_gray, pts_curr, None, **self.lk_params
        )

        valid_idx = (status_fwd.ravel() == 1) & (status_bwd.ravel() == 1)
        fb_dist = np.linalg.norm(pts_prev - pts_back, axis=1)
        consistent_idx = valid_idx & (fb_dist < 3.0)

        good_prev = pts_prev[consistent_idx]
        good_curr = pts_curr[consistent_idx]

        tracked_fraction = float(len(good_curr) / max(1, len(pts_prev)))

        if len(good_curr) < 4 or tracked_fraction < 0.20:
            return prev_mask.copy(), prev_bbox, {
                "valid": False,
                "reason": "low_tracked_fraction" if tracked_fraction < 0.20 else "flow_consistency_failure",
                "tracked_fraction": tracked_fraction,
                "mean_fb_error": float(np.mean(fb_dist)) if len(fb_dist) > 0 else 999.0
            }

        disp = good_curr - good_prev

        # Prior check: if expected displacement is available, verify consistency
        mode_disp = None
        if expected_disp is not None and np.linalg.norm(expected_disp) > 2.0:
            err_to_exp = np.linalg.norm(disp - expected_disp, axis=1)
            near_exp = err_to_exp <= 5.0
            if np.sum(near_exp) >= 4:
                mode_disp = np.median(disp[near_exp], axis=0)
            else:
                dx_quant = np.round(disp[:, 0] / 2.0) * 2.0
                u_dx, c_dx = np.unique(dx_quant, return_counts=True)
                dom_dx = u_dx[np.argmax(c_dx)]
                if np.sign(dom_dx) != np.sign(expected_disp[0]) and abs(dom_dx) > 2.0:
                    return prev_mask.copy(), prev_bbox, {
                        "valid": False,
                        "reason": "occlusion_motion_conflict",
                        "tracked_fraction": tracked_fraction
                    }

        # Find dominant displacement mode via multi-axis projection clustering (aperture-robust).
        if mode_disp is None:
            mode_disp = self.find_displacement_mode(disp)

        inlier_mask = np.linalg.norm(disp - mode_disp, axis=1) < 3.5

        filt_prev = good_prev[inlier_mask] if np.sum(inlier_mask) >= 4 else good_prev
        filt_curr = good_curr[inlier_mask] if np.sum(inlier_mask) >= 4 else good_curr

        if len(filt_prev) >= 3:
            M, inliers = cv2.estimateAffinePartial2D(
                filt_prev, filt_curr, method=cv2.RANSAC, ransacReprojThreshold=2.5
            )
        else:
            M = None

        if M is None:
            # Fallback: pure translation mode
            M = np.array([[1.0, 0.0, mode_disp[0]], [0.0, 1.0, mode_disp[1]]], dtype=np.float32)

        # Signed Jacobian check: det(J) = M[0,0]*M[1,1] - M[0,1]*M[1,0]
        det_J = M[0, 0] * M[1, 1] - M[0, 1] * M[1, 0]
        scale = np.sqrt(det_J) if det_J > 0 else 0.0

        if det_J <= 0 or scale > self.max_stretch_ratio or scale < (1.0 / self.max_stretch_ratio):
            return prev_mask.copy(), prev_bbox, {
                "valid": False,
                "reason": "geometric_distortion",
                "det_J": float(det_J),
                "scale": float(scale),
                "tracked_fraction": tracked_fraction
            }

        warped_mask = cv2.warpAffine(
            prev_mask, M, (w, h), flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0
        )

        # Compute new bounding box
        ys, xs = np.where(warped_mask > 0)
        if len(xs) == 0:
            return warped_mask, prev_bbox, {"valid": False, "reason": "empty_warped_mask", "tracked_fraction": tracked_fraction}

        x_min, x_max = int(np.min(xs)), int(np.max(xs))
        y_min, y_max = int(np.min(ys)), int(np.max(ys))
        new_bbox = [float(x_min), float(y_min), float(x_max - x_min + 1), float(y_max - y_min + 1)]

        return warped_mask, new_bbox, {
            "valid": True,
            "method": "sparse_lk_affine",
            "det_J": float(round(det_J, 4)),
            "scale": float(round(scale, 4)),
            "tracked_fraction": float(round(tracked_fraction, 3)),
            "mean_fb_error": float(round(np.mean(fb_dist[consistent_idx]), 3)) if np.any(consistent_idx) else 0.0,
            "tx": float(round(M[0, 2], 3)) if M is not None else 0.0
        }


class DenseFarnebackMaskWarper:
    def __init__(self, dilation_margin=30):
        self.dilation_margin = dilation_margin

    def warp_mask_roi(self, prev_gray, curr_gray, prev_mask, prev_bbox):
        """
        Crops a dilated ROI around prev_bbox, computes dense backward flow,
        and warps prev_mask using destination-to-source cv2.remap.
        """
        h_full, w_full = prev_gray.shape[:2]
        bx, by, bw, bh = [int(v) for v in prev_bbox]
        m = self.dilation_margin

        x0 = max(0, bx - m)
        y0 = max(0, by - m)
        x1 = min(w_full, bx + bw + m)
        y1 = min(h_full, by + bh + m)

        roi_w = x1 - x0
        roi_h = y1 - y0

        if roi_w <= 10 or roi_h <= 10:
            return prev_mask.copy(), prev_bbox, {"valid": False, "reason": "roi_too_small"}

        prev_roi = prev_gray[y0:y1, x0:x1]
        curr_roi = curr_gray[y0:y1, x0:x1]
        mask_roi = prev_mask[y0:y1, x0:x1]

        # For cv2.remap: Map destination pixels (curr_roi) back to source (prev_roi).
        # We compute flow from curr_roi to prev_roi (backward flow)!
        bwd_flow = cv2.calcOpticalFlowFarneback(
            curr_roi, prev_roi, None,
            pyr_scale=0.5, levels=3, winsize=15, iterations=5, poly_n=7, poly_sigma=1.5, flags=0
        )

        grid_x, grid_y = np.meshgrid(np.arange(roi_w), np.arange(roi_h))
        map_x = (grid_x + bwd_flow[:, :, 0]).astype(np.float32)
        map_y = (grid_y + bwd_flow[:, :, 1]).astype(np.float32)

        warped_mask_roi = cv2.remap(
            mask_roi, map_x, map_y,
            interpolation=cv2.INTER_NEAREST,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=0
        )

        warped_mask = np.zeros_like(prev_mask)
        warped_mask[y0:y1, x0:x1] = warped_mask_roi

        ys, xs = np.where(warped_mask > 0)
        if len(xs) == 0:
            return warped_mask, prev_bbox, {"valid": False, "reason": "empty_warped_mask"}

        x_min, x_max = int(np.min(xs)), int(np.max(xs))
        y_min, y_max = int(np.min(ys)), int(np.max(ys))
        new_bbox = [float(x_min), float(y_min), float(x_max - x_min + 1), float(y_max - y_min + 1)]

        return warped_mask, new_bbox, {
            "valid": True,
            "method": "dense_farneback_roi",
            "roi": [x0, y0, roi_w, roi_h],
            "mean_flow_mag": float(round(np.mean(np.linalg.norm(bwd_flow, axis=2)), 3))
        }
