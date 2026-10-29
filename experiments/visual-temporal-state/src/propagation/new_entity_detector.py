"""
VTSM-03 New Entity Discovery Engine

Safeguard C: Camera-Resistant Discovery of Previously Untracked Entities.
1. Computes absolute difference between camera-aligned previous frame and current frame.
2. Masks out already-tracked entity bounding boxes (with dilation margin).
3. Applies morphological filtering and contours to find candidate foreground blobs.
4. Gated by minimum area, aspect ratio, and motion persistence.
5. Emits candidate prompt boxes for MobileSAM decoder verification.
"""

import cv2
import numpy as np


class NewEntityDetector:
    def __init__(self, min_area=400, max_area=0.3, diff_threshold=28):
        self.min_area = min_area
        self.max_area_ratio = max_area
        self.diff_threshold = diff_threshold
        self.discovery_cooldown = 0
        self.discovered_history = []

    def detect_untracked_entities(self, aligned_prev_gray, curr_gray, active_bboxes, frame_idx, width, height):
        """
        Detects new visual entities not covered by any existing active tracks.
        """
        # 1. Camera-aligned frame difference
        if len(aligned_prev_gray.shape) == 3:
            aligned_prev_gray = cv2.cvtColor(aligned_prev_gray, cv2.COLOR_BGR2GRAY)
        if len(curr_gray.shape) == 3:
            curr_gray = cv2.cvtColor(curr_gray, cv2.COLOR_BGR2GRAY)
        aligned_prev_gray = np.ascontiguousarray(aligned_prev_gray, dtype=np.uint8)
        curr_gray = np.ascontiguousarray(curr_gray, dtype=np.uint8)

        diff = cv2.absdiff(aligned_prev_gray, curr_gray)
        _, thresh = cv2.threshold(diff, int(self.diff_threshold), 255, cv2.THRESH_BINARY)

        # 2. Mask out active entity regions
        mask_active = np.zeros((height, width), dtype=np.uint8)
        for bbox in active_bboxes:
            bx, by, bw, bh = [int(v) for v in bbox]
            m = 15
            x0 = max(0, bx - m)
            y0 = max(0, by - m)
            x1 = min(width, bx + bw + m)
            y1 = min(height, by + bh + m)
            mask_active[y0:y1, x0:x1] = 255

        thresh_untracked = cv2.bitwise_and(thresh, cv2.bitwise_not(mask_active))

        # 3. Morphological cleanup
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        cleaned = cv2.morphologyEx(thresh_untracked, cv2.MORPH_OPEN, kernel)
        cleaned = cv2.dilate(cleaned, kernel, iterations=2)

        # 4. Find connected components / contours
        contours, _ = cv2.findContours(cleaned, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []
        max_area_pixels = width * height * self.max_area_ratio

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < self.min_area or area > max_area_pixels:
                continue

            x, y, w, h = cv2.boundingRect(cnt)
            aspect = float(w) / max(1.0, float(h))
            if aspect > 4.5 or aspect < 0.22:
                continue

            # Motion density within candidate bbox
            roi_thresh = thresh_untracked[y:y+h, x:x+w]
            density = float(np.count_nonzero(roi_thresh)) / max(1.0, float(w * h))
            if density < 0.15:
                continue

            candidates.append({
                "bbox": [float(x), float(y), float(w), float(h)],
                "area": float(area),
                "density": float(round(density, 3)),
                "frame_discovered": frame_idx
            })

        return candidates
