"""Anchored scene worker. Reuses EME's real MobileSAM, LK, camera and Kalman code.
No saliency discovery, synthetic boxes, silent device fallback, or project mutations.
"""

import sys, os, json, time, hashlib, contextlib, resource
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "experiments/visual-temporal-state/src"))


def file_hash(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(65536), b""):
            h.update(b)
    return h.hexdigest()


def fingerprint():
    import torch, cv2, numpy, timm
    from tracker.proposals import WEIGHTS_PATH, MOBILESAM_DIR

    if not WEIGHTS_PATH.is_file():
        raise RuntimeError("MobileSAM checkpoint is unavailable")
    files = [
        Path(__file__),
        ROOT / "experiments/visual-temporal-state/src/tracker/proposals.py",
        ROOT / "experiments/visual-temporal-state/src/tracker/kalman.py",
        ROOT / "experiments/visual-temporal-state/src/tracker/camera.py",
        ROOT / "experiments/visual-temporal-state/src/propagation/flow_warper.py",
    ]
    files += sorted((MOBILESAM_DIR / "mobile_sam").rglob("*.py"))
    h = hashlib.sha256()
    for p in files:
        h.update(file_hash(p).encode())
    device = os.environ.get(
        "EME_SCENE_DEVICE", "mps" if torch.backends.mps.is_available() else "cpu"
    )
    if device not in ("mps", "cpu"):
        raise RuntimeError("Only mps or cpu devices are supported")
    if device == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS was requested but is unavailable")
    return dict(
        name="eme-anchored-mobilesam",
        version="1.0.0",
        origin="model",
        device=device,
        weightsSha256=file_hash(WEIGHTS_PATH),
        codeSha256=h.hexdigest(),
        dependencies=dict(
            torch=torch.__version__,
            opencv=cv2.__version__,
            numpy=numpy.__version__,
            timm=timm.__version__,
        ),
    )


def process(req, producer):
    import cv2, numpy as np, torch
    from tracker.proposals import MobileSamProposalAdapter
    from tracker.kalman import TimestampAwareKalmanBoxTracker
    from tracker.camera import CameraCompensator
    from propagation.flow_warper import SparseLkMaskWarper

    start = time.perf_counter()
    source = Path(req["mediaPath"])
    output = Path(req["outputDir"])
    if file_hash(source) != req["source"]["sha256"]:
        raise RuntimeError("Source changed before tracking")
    output.mkdir(parents=True, exist_ok=True)
    w, h = req["proxy"]["width"], req["proxy"]["height"]
    sx, sy = req["proxy"]["scaleX"], req["proxy"]["scaleY"]

    def box(mask):
        ys, xs = np.where(mask > 0)
        return (
            [
                float(xs.min()),
                float(ys.min()),
                float(xs.max() - xs.min() + 1),
                float(ys.max() - ys.min() + 1),
            ]
            if len(xs)
            else None
        )

    def to_source(b):
        if b is None:
            return None
        x, y, bw, bh = b
        x = max(0, min(w - 1, x))
        y = max(0, min(h - 1, y))
        bw = max(1, min(w - x, bw))
        bh = max(1, min(h - y, bh))
        return dict(x=x * sx, y=y * sy, width=bw * sx, height=bh * sy)

    def histogram(frame, mask):
        hist = cv2.calcHist(
            [frame], [0, 1, 2], (mask > 0).astype("uint8"), [8, 8, 8], [0, 256] * 3
        )
        return cv2.normalize(hist, hist)

    def segment(frame, index, prompt):
        model.encode_frame(frame, index)
        candidates = model.segment_prompts([prompt], frame_bgr=frame)
        if not candidates:
            return None, None
        m = candidates[0]["mask"].astype("uint8")
        score = float(candidates[0]["confidence"])
        return (
            (m, score)
            if m.sum() >= 16 and score >= req["settings"]["minModelScore"]
            else (None, score)
        )

    # Initialization messages from existing libraries must never corrupt JSON stdout.
    model = MobileSamProposalAdapter(
        device=producer["device"], reject_dark_regions=False
    )
    cv2.setNumThreads(2)
    warper = SparseLkMaskWarper(max_points=100)
    camera = CameraCompensator(w, h)
    cap = cv2.VideoCapture(str(source))
    frames = []
    artifact_bindings = []
    mask = None
    kalman = None
    anchor_hist = None
    previous = None
    previous_hist = None
    lost = False
    segmentation = flow_count = unobserved = 0
    shot = 1
    with torch.inference_mode():
        for i, timing in enumerate(req["timings"]):
            ok, raw = cap.read()
            if not ok:
                raise RuntimeError("Decoder ended before the probed frame coverage")
            frame = cv2.resize(raw, (w, h), interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            hist = cv2.calcHist([gray], [0], None, [32], [0, 256])
            cv2.normalize(hist, hist)
            pts = timing["tick"] / 120000
            observed = None
            prediction = None
            diagnostics = []
            cam = dict(valid=False, dx=0.0, dy=0.0, inlierRatio=0.0)
            hard_cut = (
                previous_hist is not None
                and cv2.compareHist(previous_hist, hist, cv2.HISTCMP_BHATTACHARYYA)
                > req["settings"]["cutThreshold"]
            )
            if hard_cut:
                shot += 1
                lost = True
                mask = None
                kalman = None
                diagnostics.append("shot_cut_requires_new_anchor")
            if kalman:
                prediction = kalman.predict(pts)
            if i == 0:
                b = req["selection"]["bounds"]
                prompt = [b["x"] / sx, b["y"] / sy, b["width"] / sx, b["height"] / sy]
                mask, score = segment(frame, i, prompt)
                segmentation += 1
                method = "anchor_segmentation"
                quality = None
                if mask is None:
                    lost = True
                    diagnostics.append("anchor_segmentation_unreliable")
                else:
                    bounds = box(mask)
                    kalman = TimestampAwareKalmanBoxTracker(bounds, pts)
                    anchor_hist = histogram(frame, mask)
            elif not lost:
                cm = camera.estimate_motion(previous, gray)
                cam = dict(
                    valid=bool(cm.get("valid")),
                    dx=float(cm["translation"]["dx"]),
                    dy=float(cm["translation"]["dy"]),
                    inlierRatio=float(cm.get("inlierRatio", 0.0)),
                )
                old_mask = mask
                old_box = box(mask)
                try:
                    mask, _flow_box, q = warper.warp_mask(previous, gray, mask, old_box)
                except (cv2.error, ValueError, TypeError):
                    mask = None
                    q = dict(valid=False, reason="flow_error", tracked_fraction=0)
                quality = float(q.get("tracked_fraction", 0))
                score = None
                method = "flow"
                must_segment = i % req["settings"]["resegmentEvery"] == 0 or not q.get(
                    "valid", False
                )
                if must_segment:
                    prompt = (
                        box(mask)
                        if q.get("valid", False) and mask is not None
                        else prediction
                    )
                    if prompt is None:
                        prompt = old_box
                    candidate, score = segment(frame, i, prompt)
                    segmentation += 1
                    if candidate is not None:
                        mask = candidate
                        method = "resegmentation"
                    elif not q.get("valid", False):
                        mask = None
                    else:
                        score = None
                        diagnostics.append("resegmentation_rejected_using_valid_flow")
                if mask is not None:
                    area = float(mask.sum()) / max(1, float(old_mask.sum()))
                    appearance = float(
                        cv2.compareHist(
                            anchor_hist,
                            histogram(frame, mask),
                            cv2.HISTCMP_BHATTACHARYYA,
                        )
                    )
                    b = box(mask)
                    if (
                        b is None
                        or area < 0.45
                        or area > 2.2
                        or appearance > req["settings"]["maxAppearanceDistance"]
                    ):
                        mask = None
                        diagnostics.append("identity_or_visibility_unreliable")
                    elif method == "flow" and (not q.get("valid") or quality < 0.35):
                        mask = None
                        diagnostics.append("flow_unreliable")
                if mask is None:
                    lost = True
                else:
                    kalman.update(box(mask), pts=pts)
            if mask is not None and not lost:
                b = box(mask)
                observed = dict(bounds=to_source(b), method=method)
                if score is not None:
                    observed["modelScore"] = max(0.0, min(1.0, score))
                if quality is not None:
                    observed["flowQuality"] = max(0.0, min(1.0, quality))
                ok, encoded = cv2.imencode(".png", (mask > 0).astype("uint8") * 255)
                if not ok:
                    raise RuntimeError("Mask encoder failed")
                data = encoded.tobytes()
                sha = hashlib.sha256(data).hexdigest()
                (output / (sha + ".png")).write_bytes(data)
                binding = dict(
                    sha256=sha,
                    kind="binary_mask",
                    mimeType="image/png",
                    width=w,
                    height=h,
                    frameIndex=timing["frameIndex"],
                )
                # Node adds the canonical content-addressed ID after verifying bytes.
                artifact_bindings.append(binding)
                observed["maskId"] = str(len(artifact_bindings) - 1)
                if method == "flow":
                    flow_count += 1
            else:
                unobserved += 1
                if not diagnostics:
                    diagnostics.append("track_lost_requires_new_anchor")
            frames.append(
                dict(
                    **timing,
                    shotId="shot-" + str(shot),
                    visibility="visible"
                    if observed
                    else ("cut" if hard_cut else "lost"),
                    observed=observed,
                    predictedBounds=to_source(prediction),
                    camera=cam,
                    diagnostics=diagnostics,
                )
            )
            previous = gray
            previous_hist = hist
    cap.release()
    if producer["device"] == "mps":
        torch.mps.synchronize()
    if file_hash(source) != req["source"]["sha256"]:
        raise RuntimeError("Source changed during tracking")
    if fingerprint() != producer:
        raise RuntimeError("Model or code changed during tracking")
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (
        1024 * 1024 if sys.platform == "darwin" else 1024
    )
    return dict(
        source=req["source"],
        producer=producer,
        selection=req["selection"],
        proxy=req["proxy"],
        frames=frames,
        artifacts=artifact_bindings,
        metrics=dict(
            elapsedMs=round((time.perf_counter() - start) * 1000, 2),
            frameCount=len(frames),
            segmentationFrames=segmentation,
            flowFrames=flow_count,
            unobservedFrames=unobserved,
            peakRssMb=round(rss, 2),
            mpsAllocatedMb=round(torch.mps.current_allocated_memory() / 1048576, 2)
            if producer["device"] == "mps"
            else 0.0,
        ),
    )


if __name__ == "__main__":
    try:
        with contextlib.redirect_stdout(sys.stderr):
            producer = fingerprint()
            result = (
                producer
                if "--doctor" in sys.argv
                else process(json.load(sys.stdin), producer)
            )
        print(
            json.dumps(dict(success=True, result=result), allow_nan=False), flush=True
        )
    except Exception as e:
        import traceback

        traceback.print_exc(file=sys.stderr)
        print(json.dumps(dict(success=False, error=str(e))), flush=True)
        sys.exit(1)
