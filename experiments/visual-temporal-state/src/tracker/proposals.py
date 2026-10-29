"""
Mask Proposal Generator Adapter
Provides candidate visual regions via MobileSAM prompt/saliency detection,
supporting both high-recall shot-start proposals and fast point/box prompt decoding.
"""

import sys
import os
from pathlib import Path
import numpy as np
import cv2
import torch

EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
MOBILESAM_DIR = Path(
    os.environ.get("EME_MOBILESAM_HOME", EXPERIMENT_ROOT / "third_party" / "MobileSAM")
)
WEIGHTS_PATH = Path(
    os.environ.get("EME_MOBILESAM_WEIGHTS", MOBILESAM_DIR / "weights" / "mobile_sam.pt")
)

if str(MOBILESAM_DIR) not in sys.path:
    sys.path.insert(0, str(MOBILESAM_DIR))

from mobile_sam import sam_model_registry, SamPredictor


class MobileSamProposalAdapter:
    """
    Adapter for MobileSAM inference, supporting frame encoding and prompted mask extraction.
    """

    def __init__(self, device=None, reject_dark_regions=True):
        self.reject_dark_regions = reject_dark_regions
        if device is None:
            # Use MPS on Apple Silicon if available, else CPU
            self.device = (
                torch.device("mps")
                if torch.backends.mps.is_available()
                else torch.device("cpu")
            )
        else:
            self.device = torch.device(device)

        print(
            f"[MobileSamProposalAdapter] Initializing MobileSAM on {self.device}...",
            file=sys.stderr,
        )
        self.model = sam_model_registry["vit_t"](checkpoint=str(WEIGHTS_PATH))
        self.model.to(self.device)
        self.model.eval()
        self.predictor = SamPredictor(self.model)
        self.current_embedding_frame_idx = -1

    def encode_frame(self, frame_bgr, frame_idx):
        """
        Computes and caches the TinyViT image embedding for the current frame.
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        self.predictor.set_image(frame_rgb)
        if self.device.type == "mps":
            torch.mps.synchronize()
        self.current_embedding_frame_idx = frame_idx

    def segment_prompts(self, prompt_boxes, frame_bgr=None):
        """
        Decodes masks for given bounding boxes [x, y, w, h] using cached image embedding.
        Returns list of dicts: {"bbox": [x,y,w,h], "mask": bool_mask, "confidence": float}
        """
        if len(prompt_boxes) == 0:
            return []

        results = []
        for box in prompt_boxes:
            x, y, w, h = box
            # SAM box prompt format: [x1, y1, x2, y2]
            box_tensor = np.array([x, y, x + w, y + h])

            masks, scores, _ = self.predictor.predict(
                box=box_tensor[None, :], multimask_output=False
            )

            best_mask = masks[0]
            score = float(scores[0])

            # Compute actual mask bounding box
            ys, xs = np.where(best_mask)
            if len(xs) > 0 and len(ys) > 0:
                mx1, mx2 = int(xs.min()), int(xs.max())
                my1, my2 = int(ys.min()), int(ys.max())
                actual_box = [mx1, my1, max(2, mx2 - mx1), max(2, my2 - my1)]
            else:
                actual_box = list(box)

            # Appearance validation: reject dark occluder / background if frame_bgr is provided
            if frame_bgr is not None and best_mask.any():
                mean_val = float(np.mean(frame_bgr[best_mask]))
                if self.reject_dark_regions and mean_val < 50.0:
                    continue  # Subject is occluded by dark pillar / obstacle

            results.append(
                {
                    "bbox": actual_box,
                    "mask": best_mask,
                    "confidence": score,
                    "source": "mobilesam_prompt",
                }
            )

        return results

    @staticmethod
    def extract_saliency_proposals(frame_bgr, min_area=400):
        """
        Color-agnostic candidate visual region proposal generator.
        Uses saturation chroma, luminance contrast, and morphological opening/closing
        to isolate foreground subjects without channel bias.
        """
        lap_var = float(cv2.Laplacian(frame_bgr, cv2.CV_64F).var())
        if lap_var < 8.0:
            return []  # Low-texture smooth gradient: honest uncertainty, no invented entities

        # Color-agnostic saliency:
        r = frame_bgr[:, :, 2].astype(float)
        g = frame_bgr[:, :, 1].astype(float)
        b = frame_bgr[:, :, 0].astype(float)

        max_c = np.maximum(np.maximum(r, g), b)
        min_c = np.minimum(np.minimum(r, g), b)
        chroma = max_c - min_c

        # Foreground objects exhibit color saturation (chroma > 35 & max_c > 100) or high brightness (max_c > 180)
        is_salient = (((chroma > 35) & (max_c > 100)) | (max_c > 180)).astype(
            "uint8"
        ) * 255

        # Morphological opening removes thin background grid lines (1-3px)
        kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        opened = cv2.morphologyEx(is_salient, cv2.MORPH_OPEN, kernel_open, iterations=1)

        # Morphological closing groups solid object regions
        kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel_close, iterations=2)

        contours, _ = cv2.findContours(
            closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        frame_h, frame_w = frame_bgr.shape[:2]
        max_area = frame_h * frame_w * 0.5  # Reject frame-spanning background

        proposals = []
        for c in contours:
            area = cv2.contourArea(c)
            if min_area <= area <= max_area:
                x, y, w, h = cv2.boundingRect(c)
                if w < frame_w * 0.8 and h < frame_h * 0.8:
                    proposals.append(
                        {
                            "bbox": [float(x), float(y), float(w), float(h)],
                            "mask": None,
                            "confidence": float(min(1.0, 0.7 + (area / 10000.0))),
                            "source": "proposal_segmentation",
                        }
                    )
        return proposals
