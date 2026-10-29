"""
VTSM-03 Keyframe Scheduler

Determines whether frame t requires a fresh full-frame MobileSAM image encoding:
1. Shot starts and hard scene cuts (t == 0 or t in cut_frames)
2. Periodic keyframe interval (t % N == 0) for fixed configurations (N=10, N=20)
3. New entity discovery events (untracked visual candidates detected)
4. Adaptive re-segmentation triggers (propagation failure detected)
"""

class KeyframeScheduler:
    def __init__(self, mode="vtsm03_adaptive_hybrid", fixed_interval=10):
        self.mode = mode
        self.fixed_interval = fixed_interval

    def is_keyframe(self, frame_idx, is_cut_frame, has_new_entities=False, has_reseg_triggers=False):
        """
        Returns: (is_keyframe, reason)
        """
        if frame_idx == 0:
            return True, "shot_init"

        if is_cut_frame:
            return True, "scene_cut"

        if self.mode == "vtsm02_full_mobilesam":
            return True, "full_frame_baseline"

        # Fixed keyframe modes (N=10 or N=20)
        if self.mode in ("vtsm03_fixed_keyframe_N10", "vtsm03_fixed_keyframe_N20"):
            interval = 10 if "N10" in self.mode else 20
            if (frame_idx % interval) == 0:
                return True, f"periodic_interval_N{interval}"
            return False, "intermediate_propagation"

        # Adaptive hybrid mode:
        if has_new_entities:
            return True, "new_entity_discovery"

        if has_reseg_triggers:
            return True, "adaptive_resegmentation"

        # Periodic anchor fallback (default N=15 in hybrid mode)
        if (frame_idx % self.fixed_interval) == 0:
            return True, f"hybrid_anchor_N{self.fixed_interval}"

        return False, "intermediate_propagation"
