#!/usr/bin/env python3
"""
VTSM-01: Visual Evidence Generator
Produces:
1. Side-by-side / overlay annotated MP4 with ground truth vs predicted bounding boxes, IDs, trajectories, and camera HUD.
2. High-resolution multi-frame contact sheet showing temporal state evolution across key fixtures.
"""

import os
import sys
import json
import math
import cv2
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIXTURES_DIR = os.path.join(BASE_DIR, "fixtures")
RESULTS_DIR = os.path.join(BASE_DIR, "results")
ARTIFACTS_DIR = os.path.join(BASE_DIR, "artifacts")

def render_annotated_video(fixture_id, output_path):
    mp4_path = os.path.join(FIXTURES_DIR, f"fixture_{fixture_id}.mp4")
    gt_path = os.path.join(FIXTURES_DIR, f"fixture_{fixture_id}_gt.json")
    pred_path = os.path.join(RESULTS_DIR, f"fixture_{fixture_id}_pred.json")

    if not os.path.exists(mp4_path) or not os.path.exists(gt_path) or not os.path.exists(pred_path):
        print(f"Skipping {fixture_id}: missing source or predictions.")
        return

    with open(gt_path, "r") as f:
        gt_doc = json.load(f)
    with open(pred_path, "r") as f:
        pred_doc = json.load(f)

    cap = cv2.VideoCapture(mp4_path)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    gt_frames = gt_doc.get("frames", [])
    pred_frames = pred_doc.get("frames", [])

    gt_trail = []
    pred_trail = []

    for f_idx in range(total_frames):
        ret, frame = cap.read()
        if not ret:
            break

        # Ground truth observation
        gt_f = gt_frames[f_idx] if f_idx < len(gt_frames) else {}
        gt_obs = (gt_f.get("observations") or [None])[0]

        # Predicted observation
        pred_f = pred_frames[f_idx] if f_idx < len(pred_frames) else {}
        pred_obs = (pred_f.get("observations") or [None])[0]
        cam_motion = pred_f.get("cameraMotion", {})

        # Draw HUD banner
        cv2.rectangle(frame, (20, 20), (700, 160), (15, 23, 42), -1)
        cv2.rectangle(frame, (20, 20), (700, 160), (51, 65, 85), 2)

        title = f"VTSM-01 FIXTURE {fixture_id.upper()} | Frame {f_idx:02d} / {total_frames:02d} (PTS: {f_idx/fps:.2f}s)"
        cv2.putText(frame, title, (35, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)

        # Legend
        cv2.rectangle(frame, (35, 75), (55, 95), (34, 197, 94), -1)
        cv2.putText(frame, "Ground Truth BBox / Trail", (65, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)

        cv2.rectangle(frame, (35, 105), (55, 125), (6, 182, 212), -1)
        cv2.putText(frame, "Predicted State (VTSM-01 Baseline)", (65, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)

        # Camera HUD info
        cam_dx = cam_motion.get("translation", {}).get("dx", 0.0)
        cam_dy = cam_motion.get("translation", {}).get("dy", 0.0)
        cam_scale = cam_motion.get("scale", 1.0)
        cam_rot = cam_motion.get("rotation", 0.0)
        cam_conf = cam_motion.get("confidence", 0.0)
        cam_valid = cam_motion.get("valid", True)

        hud_cam = f"Camera: dx={cam_dx:+.2f} dy={cam_dy:+.2f} scale={cam_scale:.3f} rot={cam_rot:+.4f} (conf={cam_conf:.2f}, valid={cam_valid})"
        cv2.putText(frame, hud_cam, (35, 148), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (148, 163, 184), 1, cv2.LINE_AA)

        # Draw Ground Truth
        if gt_obs and gt_obs.get("visibility") == "visible":
            gx = int(gt_obs["bbox"]["pixel"]["x"])
            gy = int(gt_obs["bbox"]["pixel"]["y"])
            gw = int(gt_obs["bbox"]["pixel"]["width"])
            gh = int(gt_obs["bbox"]["pixel"]["height"])
            cx = int(gx + gw / 2)
            cy = int(gy + gh / 2)
            gt_trail.append((cx, cy))

            cv2.rectangle(frame, (gx, gy), (gx + gw, gy + gh), (34, 197, 94), 2)
            cv2.putText(frame, f"GT:{gt_obs['entityId']}", (gx, gy - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (34, 197, 94), 2, cv2.LINE_AA)
        elif gt_obs and gt_obs.get("visibility") == "occluded":
            cv2.putText(frame, "GT: OCCLUDED", (WIDTH_REF(width, 0.45), 200), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (239, 68, 68), 2, cv2.LINE_AA)

        # Draw Prediction
        if pred_obs and pred_obs.get("visibility") == "visible":
            px = int(pred_obs["bbox"]["pixel"]["x"])
            py = int(pred_obs["bbox"]["pixel"]["y"])
            pw = int(pred_obs["bbox"]["pixel"]["width"])
            ph = int(pred_obs["bbox"]["pixel"]["height"])
            pcx = int(px + pw / 2)
            pcy = int(py + ph / 2)
            pred_trail.append((pcx, pcy))

            # Dashed or colored rectangle
            cv2.rectangle(frame, (px, py), (px + pw, py + ph), (6, 182, 212), 2)
            conf = pred_obs.get("trackingConfidence", 1.0)
            tag = f"PRED:{pred_obs['entityId']} ({conf:.2f})"
            cv2.putText(frame, tag, (px, py + ph + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (6, 182, 212), 2, cv2.LINE_AA)

        # Render Trajectory Trails
        for i in range(1, len(gt_trail)):
            cv2.line(frame, gt_trail[i-1], gt_trail[i], (34, 197, 94), 2, cv2.LINE_AA)
        for i in range(1, len(pred_trail)):
            cv2.line(frame, pred_trail[i-1], pred_trail[i], (6, 182, 212), 2, cv2.LINE_AA)

        out.write(frame)

    cap.release()
    out.release()
    print(f"Rendered annotated overlay video: {output_path}")

def WIDTH_REF(w, ratio):
    return int(w * ratio)

def generate_contact_sheet(output_image_path):
    """
    Generate a 3x3 high-resolution contact sheet showcasing representative frames
    from across fixtures (A, B, C, D, E occlusion, E recovery, F cut before, F cut after, G stress).
    """
    key_clips = [
        ("a", 25, "Fixture A: Moving Entity (f=25)"),
        ("b", 30, "Fixture B: Cam Pan +12px/fr (f=30)"),
        ("c", 45, "Fixture C: Cam Zoom 1.38x (f=45)"),
        ("d", 25, "Fixture D: Cam Rotation & Parabola (f=25)"),
        ("e", 30, "Fixture E: Subject In Occlusion (f=30)"),
        ("e", 52, "Fixture E: Subject Recovery (f=52)"),
        ("f", 28, "Fixture F: Shot 1 Before Cut (f=28)"),
        ("f", 32, "Fixture F: Shot 2 After Cut (f=32)"),
        ("g", 30, "Fixture G: Low-Texture Ambiguous (f=30)")
    ]

    cell_w, cell_h = 640, 360
    sheet = np.zeros((cell_h * 3, cell_w * 3, 3), dtype=np.uint8)

    for idx, (fix_id, f_num, title) in enumerate(key_clips):
        mp4_path = os.path.join(FIXTURES_DIR, f"fixture_{fix_id}.mp4")
        gt_path = os.path.join(FIXTURES_DIR, f"fixture_{fix_id}_gt.json")
        pred_path = os.path.join(RESULTS_DIR, f"fixture_{fix_id}_pred.json")

        cap = cv2.VideoCapture(mp4_path)
        cap.set(cv2.CAP_PROP_POS_FRAMES, f_num)
        ret, frame = cap.read()
        cap.release()

        if not ret or frame is None:
            continue

        # Load pred and GT annotations
        if os.path.exists(gt_path) and os.path.exists(pred_path):
            with open(gt_path, 'r') as f:
                gt = json.load(f)
            with open(pred_path, 'r') as f:
                pred = json.load(f)

            gt_f = gt["frames"][f_num] if f_num < len(gt["frames"]) else {}
            pred_f = pred["frames"][f_num] if f_num < len(pred["frames"]) else {}

            gt_obs = (gt_f.get("observations") or [None])[0]
            pred_obs = (pred_f.get("observations") or [None])[0]

            if gt_obs and gt_obs.get("visibility") == "visible":
                gx = int(gt_obs["bbox"]["pixel"]["x"])
                gy = int(gt_obs["bbox"]["pixel"]["y"])
                gw = int(gt_obs["bbox"]["pixel"]["width"])
                gh = int(gt_obs["bbox"]["pixel"]["height"])
                cv2.rectangle(frame, (gx, gy), (gx + gw, gy + gh), (34, 197, 94), 4)

            if pred_obs and pred_obs.get("visibility") == "visible":
                px = int(pred_obs["bbox"]["pixel"]["x"])
                py = int(pred_obs["bbox"]["pixel"]["y"])
                pw = int(pred_obs["bbox"]["pixel"]["width"])
                ph = int(pred_obs["bbox"]["pixel"]["height"])
                cv2.rectangle(frame, (px, py), (px + pw, py + ph), (6, 182, 212), 3)

        resized = cv2.resize(frame, (cell_w, cell_h))

        # Add title label
        cv2.rectangle(resized, (0, 0), (cell_w, 42), (15, 23, 42), -1)
        cv2.putText(resized, title, (15, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)

        row = idx // 3
        col = idx % 3
        sheet[row * cell_h:(row + 1) * cell_h, col * cell_w:(col + 1) * cell_w] = resized

    os.makedirs(os.path.dirname(output_image_path), exist_ok=True)
    cv2.imwrite(output_image_path, sheet)
    print(f"Generated multi-frame contact sheet: {output_image_path}")

if __name__ == "__main__":
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    print("Generating Visual Evidence Artifacts...")
    render_annotated_video("a", os.path.join(ARTIFACTS_DIR, "fixture_a_annotated.mp4"))
    render_annotated_video("e", os.path.join(ARTIFACTS_DIR, "fixture_e_annotated.mp4"))
    generate_contact_sheet(os.path.join(ARTIFACTS_DIR, "vtsm_contact_sheet.png"))
    print("Visual evidence generated successfully!")
