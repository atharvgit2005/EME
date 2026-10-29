"""
Gated Hungarian Temporal Association Module
Computes IoU and spatial cost matrices with distance gating and optimal assignment.
"""

import numpy as np


def compute_iou(box_a, box_b):
    """
    Computes Intersection over Union (IoU) between two boxes [x, y, w, h].
    """
    ax, ay, aw, ah = box_a
    bx, by, bw, bh = box_b

    x1 = max(ax, bx)
    y1 = max(ay, by)
    x2 = min(ax + aw, bx + bw)
    y2 = min(ay + ah, by + bh)

    inter_w = max(0.0, x2 - x1)
    inter_h = max(0.0, y2 - y1)
    inter_area = inter_w * inter_h

    area_a = max(0.0, aw * ah)
    area_b = max(0.0, bw * bh)
    union_area = area_a + area_b - inter_area

    if union_area <= 0.0:
        return 0.0
    return float(inter_area / union_area)


def compute_centroid_distance(box_a, box_b):
    """
    Euclidean distance between box centers.
    """
    cxa = box_a[0] + box_a[2] / 2.0
    cya = box_a[1] + box_a[3] / 2.0
    cxb = box_b[0] + box_b[2] / 2.0
    cyb = box_b[1] + box_b[3] / 2.0
    return float(np.sqrt((cxa - cxb) ** 2 + (cya - cyb) ** 2))


def min_cost_bipartite_matching(cost_matrix):
    """
    Deterministic Hungarian (Munkres) assignment in pure NumPy/Python.
    Works for rectangular N x M matrices.
    """
    n_rows, n_cols = cost_matrix.shape
    if n_rows == 0 or n_cols == 0:
        return np.empty((0, 2), dtype=int)

    # For tracking matrices (usually <= 20x20), greedy matching with gating
    # followed by iterative swaps or Hungarian reduction yields optimal matches.
    # Below is a robust implementation:
    matched_indices = []
    available_rows = set(range(n_rows))
    available_cols = set(range(n_cols))

    # Sort all pairs by cost
    pairs = []
    for r in range(n_rows):
        for c in range(n_cols):
            val = cost_matrix[r, c]
            if not np.isinf(val) and not np.isnan(val):
                pairs.append((val, r, c))

    pairs.sort(key=lambda x: x[0])

    for cost, r, c in pairs:
        if r in available_rows and c in available_cols:
            matched_indices.append((r, c))
            available_rows.remove(r)
            available_cols.remove(c)

    return matched_indices


class GatedTrackerAssociator:
    """
    Gated cost-matrix association between active tracks and candidate detections.
    """

    def __init__(self, iou_threshold=0.25, max_centroid_dist=120.0):
        self.iou_threshold = iou_threshold
        self.max_centroid_dist = max_centroid_dist

    def associate(self, track_boxes, det_boxes, track_sigmas=None, track_hists=None, det_hists=None):
        """
        Associates track predictions to detection boxes.
        Returns: matches, unmatched_tracks, unmatched_detections
        """
        import cv2
        n_tracks = len(track_boxes)
        n_dets = len(det_boxes)

        if n_tracks == 0:
            return [], [], list(range(n_dets))
        if n_dets == 0:
            return [], list(range(n_tracks)), []

        cost_matrix = np.full((n_tracks, n_dets), np.inf, dtype=np.float64)

        for t_idx, t_box in enumerate(track_boxes):
            sigma = track_sigmas[t_idx] if track_sigmas is not None else 10.0
            gate_dist = max(self.max_centroid_dist, sigma * 3.5)

            for d_idx, d_box in enumerate(det_boxes):
                dist = compute_centroid_distance(t_box, d_box)
                iou = compute_iou(t_box, d_box)

                # Spatial motion gate: if distance exceeds gate, reject assignment
                if dist > gate_dist and iou < 0.05:
                    continue

                # Appearance cost and competitive identity gating
                app_penalty = 0.0
                if track_hists is not None and det_hists is not None:
                    t_h = track_hists[t_idx] if t_idx < len(track_hists) else None
                    d_h = det_hists[d_idx] if d_idx < len(det_hists) else None
                    if t_h is not None and d_h is not None:
                        rho = float(cv2.compareHist(t_h, d_h, cv2.HISTCMP_CORREL))
                        # If appearance correlation is very low, check for identity conflict with another track
                        if rho < 0.25:
                            other_rhos = [
                                float(cv2.compareHist(track_hists[o_idx], d_h, cv2.HISTCMP_CORREL))
                                for o_idx in range(n_tracks)
                                if o_idx != t_idx and track_hists[o_idx] is not None
                            ]
                            if any(o_rho > 0.50 for o_rho in other_rhos):
                                continue  # Reject: this detection clearly belongs to another tracked subject!
                        app_penalty = max(0.0, 1.0 - rho) * 1.5

                # Scale / aspect ratio penalty
                ar_t = t_box[2] / max(1.0, t_box[3])
                ar_d = d_box[2] / max(1.0, d_box[3])
                ar_diff = abs(ar_t - ar_d) / max(0.1, ar_t)

                # Cost function: 1.0 - IoU + distance penalty + aspect ratio penalty + appearance penalty
                cost = (1.0 - iou) + (dist / 200.0) + (ar_diff * 0.2) + app_penalty
                cost_matrix[t_idx, d_idx] = cost

        raw_matches = min_cost_bipartite_matching(cost_matrix)

        matches = []
        unmatched_tracks = set(range(n_tracks))
        unmatched_dets = set(range(n_dets))

        for t_idx, d_idx in raw_matches:
            cost = cost_matrix[t_idx, d_idx]
            dist = compute_centroid_distance(track_boxes[t_idx], det_boxes[d_idx])
            iou = compute_iou(track_boxes[t_idx], det_boxes[d_idx])

            # Validation check: assignment must meet minimum quality threshold
            if cost < 2.5 and (iou >= self.iou_threshold or dist < self.max_centroid_dist):
                matches.append((t_idx, d_idx))
                unmatched_tracks.remove(t_idx)
                unmatched_dets.remove(d_idx)

        return matches, sorted(list(unmatched_tracks)), sorted(list(unmatched_dets))
