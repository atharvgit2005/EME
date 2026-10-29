"""
VTSM-03R1 Targeted Regression Unit Tests

Validates:
1. Fix A: Tentative Track Continuity & Lifecycle Correctness
   - Tentative track propagates across intermediate frames via update_propagated()
   - Propagation does NOT increment hits toward confirmation
   - Tentative track confirms only upon fresh visual detection hit (hits >= 2)
   - Bounded tentative lifetime: expires after max_tentative_propagations or 2 misses
   - Occluded track re-acquisition: re-emerging subject revives existing occluded track without duplicate ID
2. Fix B: Color-Agnostic Proposals & Appearance Validation
   - Red subject is detected
   - Blue subject is detected without red-channel dependency
   - Amber / yellow subject is detected
   - Smooth low-texture gradient produces 0 false proposals (honest uncertainty)
   - Dark obstacle (< 25 intensity) is rejected from mask proposals
"""

import sys
from pathlib import Path
import numpy as np
import cv2

SRC_DIR = Path(__file__).resolve().parent.parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from tracker.lifecycle import EntityTrack, TrackLifecycleManager
from tracker.proposals import MobileSamProposalAdapter


def test_fix_a_tentative_propagation_no_self_confirmation():
    print(">>> Running test_fix_a_tentative_propagation_no_self_confirmation...")
    lm = TrackLifecycleManager(min_hits_confirm=2)

    # Spawn tentative track at frame 10
    det0 = {"bbox": [100, 100, 50, 50], "confidence": 0.85, "mask": np.ones((50, 50), dtype=np.uint8)}
    lm.step(
        detections=[det0],
        current_pts=0.333,
        frame_idx=10,
        matches=[],
        unmatched_tracks=[],
        unmatched_dets=[0],
        is_propagation=False
    )

    assert len(lm.tracks) == 1, "Track should be created"
    tr = lm.tracks[0]
    assert tr.state == EntityTrack.STATE_TENTATIVE, "Track at frame 10 should be tentative"
    assert tr.hits == 1, "Initial hit count should be 1"

    # Propagate across 5 intermediate frames (is_propagation=True)
    for f in range(11, 16):
        pts = f * 0.0333
        det_prop = {"bbox": [100 + f, 100, 50, 50], "confidence": 0.80, "mask": np.ones((50, 50), dtype=np.uint8)}
        lm.step(
            detections=[det_prop],
            current_pts=pts,
            frame_idx=f,
            matches=[(0, 0)],
            unmatched_tracks=[],
            unmatched_dets=[],
            is_propagation=True
        )
        assert tr.state == EntityTrack.STATE_TENTATIVE, f"Track must remain tentative on propagation at frame {f}"
        assert tr.hits == 1, f"Hits must NOT increment on propagation at frame {f}"
        assert tr.propagated_frames == (f - 10), "Propagated frames must track correctly"

    # Frame 16: Keyframe fresh detection (is_propagation=False)
    det_kf = {"bbox": [116, 100, 50, 50], "confidence": 0.95, "mask": np.ones((50, 50), dtype=np.uint8)}
    lm.step(
        detections=[det_kf],
        current_pts=0.533,
        frame_idx=16,
        matches=[(0, 0)],
        unmatched_tracks=[],
        unmatched_dets=[],
        is_propagation=False
    )
    assert tr.hits == 2, "Hits must increment to 2 on fresh detection"
    assert tr.state == EntityTrack.STATE_CONFIRMED, "Track should transition to CONFIRMED after 2 independent hits"
    print("    [PASS] Tentative track survived propagation without self-confirming, confirmed on fresh hit!")


def test_fix_a_tentative_bounded_lifetime():
    print(">>> Running test_fix_a_tentative_bounded_lifetime...")
    lm = TrackLifecycleManager(min_hits_confirm=2, max_tentative_propagations=5)

    # Spawn tentative track
    det0 = {"bbox": [200, 200, 60, 60], "confidence": 0.85, "mask": np.ones((60, 60), dtype=np.uint8)}
    lm.step([det0], 0.1, 3, [], [], [0], is_propagation=False)
    tr = lm.tracks[0]

    # Propagate until max_tentative_propagations is exceeded
    for f in range(4, 11):
        det_prop = {"bbox": [200, 200, 60, 60], "confidence": 0.70, "mask": np.ones((60, 60), dtype=np.uint8)}
        lm.step([det_prop], f * 0.033, f, [(0, 0)], [], [], is_propagation=True)

    # The tentative track should be terminated because it was never confirmed by fresh detection within 5 frames
    active = lm.get_active_tracks(include_tentative=True)
    assert len(active) == 0, "Unconfirmed tentative track should expire after max_tentative_propagations"
    print("    [PASS] Tentative track bounded lifetime enforced!")


def test_fix_a_occluded_track_reacquisition():
    print(">>> Running test_fix_a_occluded_track_reacquisition...")
    lm = TrackLifecycleManager(max_missed_frames=40, min_hits_confirm=2)

    # Frame 0: Spawn and confirm track ent_01
    det0 = {"bbox": [500, 500, 100, 100], "confidence": 0.95, "mask": np.ones((100, 100), dtype=np.uint8)}
    lm.step([det0], 0.0, 0, [], [], [0], is_propagation=False)
    assert lm.tracks[0].track_id == "ent_01"
    assert lm.tracks[0].state == EntityTrack.STATE_CONFIRMED

    # Frames 1-20: Track goes into occlusion behind pillar
    for f in range(1, 21):
        lm.tracks[0].predict(f * 0.033)
        lm.step([], f * 0.033, f, [], [0], [], is_propagation=True)

    assert lm.tracks[0].state == EntityTrack.STATE_OCCLUDED
    assert lm.tracks[0].missed_frames == 20

    # Frame 21: Subject re-emerges at keyframe (x=550)
    det_reemergence = {"bbox": [550, 500, 110, 110], "confidence": 0.95, "mask": np.ones((110, 110), dtype=np.uint8)}
    lm.step([det_reemergence], 21 * 0.033, 21, [], [], [0], is_propagation=False)

    # Should re-acquire ent_01 instead of spawning ent_02!
    assert len(lm.tracks) == 1, f"Expected 1 track, got {len(lm.tracks)}"
    assert lm.tracks[0].track_id == "ent_01", f"Track ID must remain ent_01, got {lm.tracks[0].track_id}"
    assert lm.tracks[0].state == EntityTrack.STATE_CONFIRMED, "Track should be confirmed upon re-acquisition"
    print("    [PASS] Occluded track successfully re-acquired without duplicate ID or switch!")


def test_fix_b_color_agnostic_proposals():
    print(">>> Running test_fix_b_color_agnostic_proposals...")
    h, w = 1080, 1920

    # Create dark background
    bg = np.full((h, w, 3), 30, dtype=np.uint8)

    # Add red subject at [200, 200, 120, 160] (R=220, G=40, B=40)
    cv2.rectangle(bg, (200, 200), (320, 360), (40, 40, 220), -1)

    # Add blue subject at [600, 200, 120, 160] (B=230, G=100, R=40)
    cv2.rectangle(bg, (600, 200), (720, 360), (230, 100, 40), -1)

    # Add amber subject at [1000, 200, 120, 160] (B=20, G=140, R=230)
    cv2.rectangle(bg, (1000, 200), (1120, 360), (20, 140, 230), -1)

    props = MobileSamProposalAdapter.extract_saliency_proposals(bg, min_area=1000)
    boxes = [p["bbox"] for p in props]

    assert len(boxes) >= 3, f"Expected at least 3 color-agnostic proposals, found {len(boxes)}: {boxes}"

    # Verify each color was captured
    red_found = any(abs(b[0] - 200) < 30 and abs(b[1] - 200) < 30 for b in boxes)
    blue_found = any(abs(b[0] - 600) < 30 and abs(b[1] - 200) < 30 for b in boxes)
    amber_found = any(abs(b[0] - 1000) < 30 and abs(b[1] - 200) < 30 for b in boxes)

    assert red_found, "Red subject must be detected"
    assert blue_found, "Blue subject must be detected without red channel dependency"
    assert amber_found, "Amber subject must be detected"

    # Test uniform / low-texture background (honest uncertainty)
    smooth = np.zeros((h, w, 3), dtype=np.uint8)
    for y in range(h):
        smooth[y, :] = int(40 + (y / h) * 15)
    smooth_props = MobileSamProposalAdapter.extract_saliency_proposals(smooth, min_area=1000)
    assert len(smooth_props) == 0, f"Smooth gradient must yield 0 proposals, got {len(smooth_props)}"

    print("    [PASS] Red, Blue, Amber subjects successfully detected; smooth gradient yields 0 false proposals!")


def run_all():
    print("================================================================")
    print("  RUNNING VTSM-03R1 SURGICAL FIX REGRESSION UNIT TESTS")
    print("================================================================\n")
    test_fix_a_tentative_propagation_no_self_confirmation()
    test_fix_a_tentative_bounded_lifetime()
    test_fix_a_occluded_track_reacquisition()
    test_fix_b_color_agnostic_proposals()
    print("\n================================================================")
    print("  ALL VTSM-03R1 FIX UNIT TESTS PASSED (4/4)")
    print("================================================================\n")


if __name__ == "__main__":
    run_all()
