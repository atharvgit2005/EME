#!/usr/bin/env python3
"""
Editing Mechanics Engine (EME) - Phase 25: Earshot Python Worker Bridge

Out-of-process, read-only perception daemon communicating via JSON lines over stdin/stdout.

Hard Architectural Constraints:
- Read-only perception and measurement; zero execution authority.
- Model-free fast DSP for 'measure' and 'sfx_check' (<50ms).
- Normalizes non-finite values (-Infinity, Infinity, NaN) to null with explicit reasons.
- Strict single bounded JSON response per line.
- Fail-safe error responses.
"""

import sys
import os
import json
import time
import math
import traceback

# Add local or tmp earshot to sys.path if not installed
for candidate in ['/tmp/earshot', os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../earshot'))]:
    if os.path.isdir(candidate) and candidate not in sys.path:
        sys.path.insert(0, candidate)

try:
    from earshot.features import measure
    from earshot.forge import sfx
    EARSHOT_AVAILABLE = True
except Exception as e:
    EARSHOT_AVAILABLE = False
    IMPORT_ERROR = str(e)


def normalize_float(val):
    """Normalize floats to prevent non-finite JSON corruption."""
    if val is None:
        return None, None
    try:
        f = float(val)
    except (ValueError, TypeError):
        return None, "invalid_type"

    if math.isnan(f):
        return None, "not_a_number"
    if math.isinf(f):
        return None, "negative_infinity" if f < 0 else "positive_infinity"
    return round(f, 4), None


def handle_ping(req):
    return {
        "status": "pong",
        "version": "0.3.0",
        "pid": os.getpid(),
        "earshot_available": EARSHOT_AVAILABLE
    }


def handle_measure(req):
    start_time = time.perf_counter()
    req_id = req.get("request_id", "req-earshot-unknown")
    media_path = req.get("media_path", "")
    options = req.get("options", {})
    profile = options.get("profile", {})
    mode = options.get("mode", "fast_dsp")

    if not os.path.exists(media_path):
        return {
            "request_id": req_id,
            "status": "WORKER_ERROR",
            "mode": mode,
            "execution_time_ms": round((time.perf_counter() - start_time) * 1000, 2),
            "loudness": None,
            "sfx_integrity": None,
            "sync": None,
            "critique": None,
            "sheet_path": None,
            "error": {
                "code": "FILE_NOT_FOUND",
                "message": f"Media file not found at {media_path}",
                "details": None
            }
        }

    try:
        # Run model-free fast DSP
        res = measure(media_path, light=True)
    except Exception as exc:
        return {
            "request_id": req_id,
            "status": "WORKER_ERROR",
            "mode": mode,
            "execution_time_ms": round((time.perf_counter() - start_time) * 1000, 2),
            "loudness": None,
            "sfx_integrity": None,
            "sync": None,
            "critique": None,
            "sheet_path": None,
            "error": {
                "code": "DSP_MEASUREMENT_ERROR",
                "message": str(exc),
                "details": traceback.format_exc()
            }
        }

    # Detect digital silence or below-gate audio
    is_silent = res.get("peak_dbfs", 0) < -70.0 or res.get("digital_silence_frac", 0) >= 0.999

    if is_silent:
        lufs_val = None
        lufs_reason = "silence"
        tp_val = None
        tp_reason = "silence"
        lra_val = None
        compliant = None
    else:
        lufs_val, lufs_reason = normalize_float(res.get("lufs"))
        tp_val, tp_reason = normalize_float(res.get("true_peak_dbtp"))
        lra_val, _ = normalize_float(res.get("lra_lu"))

        # Compliance check against profile
        target_lufs = profile.get("target_lufs", -14.0)
        lufs_tolerance = profile.get("lufs_tolerance", 2.0)
        ceiling_dbtp = profile.get("true_peak_ceiling_dbtp", -1.0)

        compliant = True
        if lufs_val is not None:
            if abs(lufs_val - target_lufs) > lufs_tolerance:
                compliant = False
        else:
            compliant = False

        if tp_val is not None and tp_val > ceiling_dbtp:
            compliant = False

    clipped_samples = res.get("clipped_samples", 0)

    loudness = {
        "integrated_lufs": lufs_val,
        "lufs_reason": lufs_reason,
        "true_peak_dbtp": tp_val,
        "true_peak_reason": tp_reason,
        "loudness_range_lu": lra_val,
        "clipping_samples": clipped_samples,
        "compliant": compliant
    }

    # Optional model-free SFX integrity audit
    sfx_integrity = None
    try:
        sfx_res = sfx.check(media_path)
        warnings = sfx_res.get("warnings", [])
        notes = sfx_res.get("notes", [])
        issues = []
        for w in warnings:
            issues.append({
                "type": "warning",
                "time_seconds": 0.0,
                "detail": f"[{w.get('code', 'warn')}] {w.get('msg', '')}"
            })
        for n in notes:
            issues.append({
                "type": "note",
                "time_seconds": 0.0,
                "detail": f"[{n.get('code', 'note')}] {n.get('msg', '')}"
            })

        sfx_integrity = {
            "status": "ok" if sfx_res.get("ok", True) else "defects_found",
            "rising_glides": 1 if any("glide" in str(w) for w in warnings) else 0,
            "double_hits": 1 if any("stacked" in str(w) for w in warnings) else 0,
            "clicks": 1 if any("click" in str(w) or "edge" in str(w) for w in warnings) else 0,
            "issues": issues
        }
    except Exception:
        pass

    # Synchronization analysis if visual cues are provided
    sync = None
    cues = req.get("cues", [])
    timebase = req.get("timebase", {})
    ticks_per_sec = timebase.get("ticks_per_second", 120000)
    fps_num = timebase.get("fps_numerator", 30)
    fps_den = timebase.get("fps_denominator", 1)
    frame_ms = (1000.0 * fps_den) / fps_num
    sync_tolerance_ms = profile.get("sync_tolerance_ms", frame_ms)

    if cues:
        cut_details = []
        offsets = []
        try:
            from earshot import timeline, audio
            cue_input = [{"t": float(c.get("time_seconds", 0.0)), "kind": c.get("kind", "visual_cut"), "id": c.get("id")} for c in cues]
            cue_list, _ = timeline.read_cues(cue_input)
            audio_data = audio.load(media_path)
            events = timeline.detect_events(audio_data)
            frame_s = float(fps_den) / float(fps_num)
            sync_res = timeline.sync(cue_list, events, frame_s=frame_s)

            for it in sync_res.get("items", []):
                cue_sec = it.get("t", 0.0)
                cue_frame = int(round(cue_sec * fps_num / fps_den))
                off_ms = it.get("offset_ms")
                if off_ms is not None:
                    off_ms = round(float(off_ms), 2)
                    off_ticks = int(round(off_ms * (ticks_per_sec / 1000.0)))
                    offsets.append(off_ms)
                    event_t = it.get("event_t")
                    cut_details.append({
                        "cut_frame": cue_frame,
                        "cut_seconds": round(cue_sec, 4),
                        "sound_onset_seconds": round(float(event_t), 4) if event_t is not None else None,
                        "offset_ms": off_ms,
                        "offset_ticks": off_ticks,
                        "confidence": round(max(0.0, 1.0 - abs(off_ms) / 500.0), 3)
                    })
                else:
                    cut_details.append({
                        "cut_frame": cue_frame,
                        "cut_seconds": round(cue_sec, 4),
                        "sound_onset_seconds": None,
                        "offset_ms": None,
                        "offset_ticks": None,
                        "confidence": 0.0
                    })
        except Exception:
            # Fallback to direct onset extraction if timeline module fails
            try:
                from earshot import audio
                from earshot.features import onsets as detect_onsets
                audio_data = audio.load(media_path, mono=True)
                onsets = detect_onsets(audio_data)
            except Exception:
                onsets = []

            for cue in cues:
                cue_sec = cue.get("time_seconds", 0.0)
                cue_frame = cue.get("frame", int(round(cue_sec * fps_num / fps_den)))
                best_onset = None
                best_diff_ms = float("inf")
                for onset in onsets:
                    diff_ms = (onset - cue_sec) * 1000.0
                    if abs(diff_ms) < abs(best_diff_ms):
                        best_diff_ms = diff_ms
                        best_onset = onset

                if best_onset is not None and abs(best_diff_ms) <= 500.0:
                    offset_ms = round(best_diff_ms, 2)
                    offset_ticks = int(round(best_diff_ms * (ticks_per_sec / 1000.0)))
                    offsets.append(offset_ms)
                    cut_details.append({
                        "cut_frame": cue_frame,
                        "cut_seconds": round(cue_sec, 4),
                        "sound_onset_seconds": round(best_onset, 4),
                        "offset_ms": offset_ms,
                        "offset_ticks": offset_ticks,
                        "confidence": round(max(0.0, 1.0 - abs(offset_ms) / 500.0), 3)
                    })
                else:
                    cut_details.append({
                        "cut_frame": cue_frame,
                        "cut_seconds": round(cue_sec, 4),
                        "sound_onset_seconds": None,
                        "offset_ms": None,
                        "offset_ticks": None,
                        "confidence": 0.0
                    })

        mean_offset = round(sum(offsets) / len(offsets), 2) if offsets else None
        max_offset = max(offsets, key=abs) if offsets else None
        max_ticks = int(round(max_offset * (ticks_per_sec / 1000.0))) if max_offset is not None else None
        aligned = (abs(max_offset) <= sync_tolerance_ms) if max_offset is not None else False

        sync = {
            "analyzed_cuts": len(cues),
            "mean_offset_ms": mean_offset,
            "max_offset_ms": max_offset,
            "max_offset_ticks": max_ticks,
            "aligned": aligned,
            "details": cut_details
        }

    # Optional Diagnostic Sheet Generation
    sheet_path = None
    if options.get("generate_sheet") and options.get("sheet_output_path"):
        out_target = options.get("sheet_output_path")
        try:
            from earshot.sheet import sheet
            os.makedirs(os.path.dirname(os.path.abspath(out_target)), exist_ok=True)
            sheet(media_path, out=out_target)
            if os.path.exists(out_target):
                sheet_path = os.path.abspath(out_target)
        except Exception:
            sheet_path = None

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return {
        "request_id": req_id,
        "status": "SUCCESS",
        "mode": mode,
        "execution_time_ms": elapsed_ms,
        "loudness": loudness,
        "sfx_integrity": sfx_integrity,
        "sync": sync,
        "critique": None,
        "sheet_path": sheet_path,
        "error": None
    }


def main():
    """Main JSON-lines dispatcher loop over sys.stdin."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except Exception as exc:
            err_resp = {
                "request_id": "req-earshot-malformed",
                "status": "WORKER_ERROR",
                "mode": "fast_dsp",
                "execution_time_ms": 0.0,
                "loudness": None,
                "sfx_integrity": None,
                "sync": None,
                "critique": None,
                "sheet_path": None,
                "error": {
                    "code": "MALFORMED_JSON",
                    "message": f"Failed to parse request JSON: {str(exc)}",
                    "details": None
                }
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()
            continue

        action = req.get("action")
        if action == "ping":
            resp = handle_ping(req)
        elif action == "measure" or "media_path" in req:
            resp = handle_measure(req)
        else:
            resp = {
                "request_id": req.get("request_id", "req-earshot-unknown"),
                "status": "WORKER_ERROR",
                "mode": req.get("options", {}).get("mode", "fast_dsp"),
                "execution_time_ms": 0.0,
                "loudness": None,
                "sfx_integrity": None,
                "sync": None,
                "critique": None,
                "sheet_path": None,
                "error": {
                    "code": "UNKNOWN_ACTION",
                    "message": f"Unsupported worker action: {action}",
                    "details": None
                }
            }

        # Bounded response emission
        payload = json.dumps(resp)
        if len(payload) > 5 * 1024 * 1024:
            resp = {
                "request_id": resp.get("request_id"),
                "status": "WORKER_ERROR",
                "mode": resp.get("mode"),
                "execution_time_ms": resp.get("execution_time_ms"),
                "loudness": None,
                "sfx_integrity": None,
                "sync": None,
                "critique": None,
                "sheet_path": None,
                "error": {
                    "code": "RESPONSE_TOO_LARGE",
                    "message": "Response exceeded 5MB size limit",
                    "details": None
                }
            }
            payload = json.dumps(resp)

        sys.stdout.write(payload + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
