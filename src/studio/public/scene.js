/* Source-space scene preview. All consumers read the same immutable frame table. */
(() => {
  const el = (id) => document.getElementById(id),
    video = el("scene-player"),
    canvas = el("scene-overlay"),
    ctx = canvas.getContext("2d");
  let current = null,
    analysis = null,
    box = null,
    selecting = true,
    drag = null,
    loading = null,
    lastMask = null,
    loadedMask = null,
    failedLoad = null,
    handledJob = null;
  function position(event) {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          canvas.width,
          ((event.clientX - r.left) * canvas.width) / r.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          canvas.height,
          ((event.clientY - r.top) * canvas.height) / r.height,
        ),
      ),
    };
  }
  function syncBox() {
    for (const k of ["x", "y", "width", "height"])
      el("scene-box-" + k).value = box?.[k] ?? 0;
  }
  function rect(b, color, dashed = false) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, canvas.width / 320);
    ctx.setLineDash(dashed ? [12, 10] : []);
    ctx.strokeRect(b.x, b.y, b.width, b.height);
  }
  function draw(time = video.currentTime) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    el("scene-time").textContent = clock(time);
    el("scene-scrub").value = time;
    let frame = null;
    if (analysis && !selecting) {
      const tick = Math.round(time * 120000);
      let lo = 0,
        hi = analysis.frames.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (analysis.frames[mid].tick <= tick) lo = mid + 1;
        else hi = mid;
      }
      const candidate = analysis.frames[lo - 1];
      if (candidate && tick < candidate.endTick) frame = candidate;
    }
    const mask = el("scene-mask");
    el("scene-stage").dataset.visibility = frame?.visibility || "none";
    if (selecting || !frame?.observed) {
      lastMask = null;
      loadedMask = null;
    }

    if (selecting && box) {
      rect(box, "#ee5b35");
      el("scene-readout").textContent =
        `Selection · ${Math.round(box.width)} × ${Math.round(box.height)} source pixels`;
    }
    if (frame) {
      if (frame.observed) {
        const o = frame.observed;
        rect(o.bounds, o.method === "flow" ? "#128f8a" : "#ee5b35");
        el("scene-readout").textContent =
          `subject-1 · ${o.method.replaceAll("_", " ")} · ${(frame.tick / 120000).toFixed(3)}–${(frame.endTick / 120000).toFixed(3)}s${o.modelScore === undefined ? "" : ` · model score ${o.modelScore.toFixed(2)}`}${o.flowQuality === undefined ? "" : ` · flow support ${o.flowQuality.toFixed(2)}`}`;
        const url = `/api/scene/${analysis.analysisId}/mask/${o.maskId}`;
        if (lastMask !== url) {
          lastMask = url;
          loadedMask = null;
          const image = new Image();
          image.onload = () => {
            if (lastMask !== url) return;
            mask.style.maskImage = `url("${url}")`;
            mask.style.webkitMaskImage = `url("${url}")`;
            loadedMask = url;
            mask.hidden = selecting || !el("scene-show-mask").checked;
          };
          image.onerror = () => {
            if (lastMask === url) {
              loadedMask = null;
              mask.hidden = true;
              el("scene-status").textContent =
                "The mask could not be verified or loaded. Rerun the analysis.";
            }
          };
          image.src = url;
        }
      } else {
        if (frame.predictedBounds) rect(frame.predictedBounds, "#74736d", true);
        el("scene-readout").textContent =
          `${frame.visibility.toUpperCase()} · ${frame.diagnostics.join(" · ")}. No observed mask.`;
      }
    } else if (analysis && !selecting)
      el("scene-readout").textContent =
        "Outside the analyzed interval. No observation is being held forward.";
    mask.hidden =
      selecting ||
      !frame?.observed ||
      !el("scene-show-mask").checked ||
      loadedMask !== lastMask;
  }
  async function load(id) {
    if (
      !current ||
      analysis?.analysisId === id ||
      loading === id ||
      failedLoad === id
    )
      return;
    loading = id;
    const mediaId = current.id;
    try {
      const doc = await api("scene/" + id);
      if (current?.id !== mediaId) return;
      analysis = doc;
      el("scene-title-form").hidden = false;
      const clips = state.project.clips.filter(
        (c) => c.type === "video" && c.source?.assetId === current.id,
      );
      el("scene-title-clip").replaceChildren(
        ...clips.map(
          (c) => new Option(`${c.id} · ${clock(c.startTick / 120000)}`, c.id),
        ),
      );
      el("scene-title-plan").disabled = !clips.length;
      el("scene-title-status").textContent = clips.length
        ? ""
        : "Add this footage to the timeline first, then reopen the scene.";
      titleTiming();
      selecting = false;
      canvas.style.pointerEvents = "none";
      el("scene-scrub").max = doc.source.endTick / 120000;
      video.pause();
      video.currentTime = 0;
      el("scene-status").textContent =
        `${doc.frames.filter((f) => f.observed).length}/${doc.frames.length} frames with observations · ${doc.producer.device.toUpperCase()} segmentation · ${doc.metrics.elapsedMs.toFixed(0)} ms worker time`;
      draw();
    } catch (e) {
      failedLoad = id;
      el("scene-status").textContent = e.message;
    } finally {
      loading = null;
    }
  }
  function update(next) {
    if (!current) return;
    const job = next.sceneJob,
      active =
        job?.mediaId === current.id &&
        ["RUNNING", "CANCELLING"].includes(job.status);
    el("scene-analyze").disabled =
      active || next.busy || !box || box.width < 4 || box.height < 4;
    el("scene-cancel").hidden = !active;
    el("scene-reselect").disabled = active;
    if (active)
      el("scene-status").textContent =
        job.status === "RUNNING"
          ? "Tracking locally. Model segmentation and optical-flow propagation are running…"
          : "Cancelling tracking…";
    else if (
      job?.mediaId === current.id &&
      job.status === "SUCCEEDED" &&
      handledJob !== job.id
    ) {
      handledJob = job.id;
      load(job.analysisId);
    } else if (
      job?.mediaId === current.id &&
      ["FAILED", "CANCELLED", "INTERRUPTED"].includes(job.status)
    )
      el("scene-status").textContent = job.message || "Tracking cancelled.";
  }
  function reselect() {
    el("scene-title-form").hidden = true;
    handledJob = state.sceneJob?.id;
    video.pause();
    video.currentTime = 0;
    box = null;
    selecting = true;
    analysis = null;
    failedLoad = null;
    canvas.style.pointerEvents = "auto";
    el("scene-mask").hidden = true;
    el("scene-status").textContent =
      "Draw a box around the subject in the first frame.";
    el("scene-analyze").disabled = true;
    syncBox();
    el("scene-readout").textContent =
      "Orange: model segmentation · teal: propagation · dashed: prediction only.";
    draw();
  }
  async function open(id) {
    el("scene-title-form").hidden = true;
    handledJob =
      state.sceneJob?.status === "SUCCEEDED" ? state.sceneJob.id : null;
    current = state.media.find((m) => m.id === id);
    if (!current) return;
    analysis = null;
    box = null;
    loading = null;
    failedLoad = null;
    lastMask = null;
    selecting = true;
    canvas.width = current.width;
    canvas.height = current.height;
    canvas.style.pointerEvents = "auto";
    el("scene-stage").style.aspectRatio = current.width + "/" + current.height;
    video.src = "/api/media/" + current.id;
    video.currentTime = 0;
    el("scene-mask").hidden = true;
    el("scene-seconds").max = Math.min(15, current.duration);
    el("scene-seconds").value = Math.min(6, current.duration);
    el("scene-scrub").max = Math.min(6, current.duration);
    el("scene-status").textContent = state.sceneConfigured
      ? "Draw a box around the subject in the first frame."
      : "Local tracking needs one-time setup. See docs/studio/SCENE.md.";
    el("scene-analyze").disabled = true;
    syncBox();
    el("scene-dialog").showModal();
    const previous = state.sceneAnalyses
      ?.filter((a) => a.mediaId === id)
      .at(-1);
    if (previous) await load(previous.analysisId);
    draw();
  }
  canvas.onpointerdown = (e) => {
    if (!selecting) return;
    video.pause();
    video.currentTime = 0;
    drag = position(e);
    box = { x: drag.x, y: drag.y, width: 0, height: 0 };
    canvas.setPointerCapture(e.pointerId);
    draw();
  };
  canvas.onpointermove = (e) => {
    if (!drag) return;
    const p = position(e);
    box = {
      x: Math.min(p.x, drag.x),
      y: Math.min(p.y, drag.y),
      width: Math.abs(p.x - drag.x),
      height: Math.abs(p.y - drag.y),
    };
    draw();
  };
  canvas.onpointerup = (e) => {
    if (!drag) return;
    drag = null;
    box = Object.fromEntries(
      Object.entries(box).map(([k, v]) => [k, Math.round(v)]),
    );
    el("scene-analyze").disabled =
      state.busy || box.width < 4 || box.height < 4;
    syncBox();
    draw();
  };
  for (const k of ["x", "y", "width", "height"])
    el("scene-box-" + k).oninput = () => {
      selecting = true;
      analysis = null;
      el("scene-title-form").hidden = true;
      handledJob = state.sceneJob?.id;
      video.pause();
      video.currentTime = 0;
      box = Object.fromEntries(
        ["x", "y", "width", "height"].map((n) => [
          n,
          Number(el("scene-box-" + n).value),
        ]),
      );
      canvas.style.pointerEvents = "auto";
      el("scene-analyze").disabled =
        state.busy || box.width < 4 || box.height < 4;
      draw();
    };
  canvas.onpointercancel = () => {
    drag = null;
  };
  el("scene-analyze").onclick = async () => {
    try {
      video.pause();
      const job = await api("scene/analyze", {
        mediaId: current.id,
        bounds: box,
        seconds: Number(el("scene-seconds").value),
        label: "Selected subject",
      });
      analysis = null;
      failedLoad = null;
      el("scene-title-form").hidden = true;
      selecting = false;
      canvas.style.pointerEvents = "none";
      el("scene-analyze").disabled = true;
      el("scene-status").textContent = "Tracking started…";
      await refresh();
    } catch (e) {
      el("scene-status").textContent = e.message;
    }
  };
  el("scene-cancel").onclick = async () => {
    try {
      await api("scene/cancel", {});
      await refresh();
    } catch (e) {
      el("scene-status").textContent = e.message;
    }
  };
  el("scene-reselect").onclick = () => {
    reselect();
  };
  el("scene-play").onclick = () => {
    if (video.paused) {
      if (analysis && video.currentTime >= analysis.source.endTick / 120000)
        video.currentTime = 0;
      video.play().catch((e) => toast(e.message));
    } else video.pause();
  };
  el("scene-scrub").oninput = () => {
    video.pause();
    video.currentTime = Number(el("scene-scrub").value);
    draw();
  };
  el("scene-show-mask").onchange = () => draw();
  function titleTiming() {
    const clip = state.project.clips.find(
      (c) => c.id === el("scene-title-clip").value,
    );
    if (!clip || !analysis) return;
    el("scene-title-start").value = clip.startTick / 120000;
    el("scene-title-duration").value = Math.max(
      0,
      Math.min(
        4,
        clip.durationTicks / 120000,
        (analysis.source.endTick - (clip.source.trimInTick || 0)) / 120000,
      ),
    );
  }
  el("scene-title-clip").onchange = titleTiming;
  el("scene-title-form").onsubmit = async (event) => {
    event.preventDefault();
    el("scene-title-plan").disabled = true;
    el("scene-title-status").textContent =
      "Measuring title and checking all tracked intervals…";
    try {
      await api("scene/title", {
        analysisId: analysis.analysisId,
        videoClipId: el("scene-title-clip").value,
        text: el("scene-title-text").value,
        fontSize: Number(el("scene-title-size").value),
        startTick: Math.round(Number(el("scene-title-start").value) * 120000),
        durationTicks: Math.round(
          Number(el("scene-title-duration").value) * 120000,
        ),
      });
      el("scene-dialog").close();
      await refresh();
    } catch (e) {
      el("scene-title-status").textContent = e.message.replace(/^ERR_SUBJECT_TITLE: /, "");
    } finally {
      el("scene-title-plan").disabled = false;
    }
  };
  video.onloadeddata = () => draw();
  video.onseeked = () => draw();
  video.ontimeupdate = () => {
    if (analysis && video.currentTime >= analysis.source.endTick / 120000)
      video.pause();
    draw();
  };
  video.onplay = () => {
    el("scene-play").textContent = "Ⅱ Pause";
  };
  video.onpause = () => {
    el("scene-play").textContent = "▶ Play";
  };
  if (video.requestVideoFrameCallback) {
    const frame = (_now, metadata) => {
      if (current) draw(metadata.mediaTime);
      video.requestVideoFrameCallback(frame);
    };
    video.requestVideoFrameCallback(frame);
  }
  el("scene-dialog").addEventListener("close", () => {
    video.pause();
    current = null;
  });
  window.emeScene = { open, update };
})();
