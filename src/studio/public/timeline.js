/* User gestures compile into validated, undoable engine commands. */
(() => {
  const TICKS = 120000;
  let pixelsPerSecond = 70,
    tool = "select",
    linked = true,
    snapping = true,
    drag = null,
    scrubbing = false,
    lastPress = null,
    lastKey = "",
    waveCache = new Map();
  const scroll = $("timeline-scroll"),
    content = $("timeline-content");
  const frame = () =>
    state ? state.project.timebase.fps : { numerator: 30, denominator: 1 };
  function quantize(tick) {
    const f = frame();
    return Math.round(
      (Math.round((tick * f.numerator) / (TICKS * f.denominator)) *
        TICKS *
        f.denominator) /
        f.numerator,
    );
  }
  function timecode(time) {
    const f = frame(),
      nominal = Math.round(f.numerator / f.denominator),
      count = Math.max(0, Math.round((time * f.numerator) / f.denominator));
    return [
      Math.floor(count / (nominal * 3600)),
      Math.floor(count / (nominal * 60)) % 60,
      Math.floor(count / nominal) % 60,
      count % nominal,
    ]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");
  }
  function clipName(c) {
    const asset = state.project.assets.find(
      (a) => a.id === (c.source?.assetId || c.assetId),
    );
    return (
      c.typography?.text ||
      asset?.metadata?.design?.title ||
      state.media.find(
        (m) => m.id === asset?.id || m.audioAsset?.id === asset?.id,
      )?.name ||
      asset?.id ||
      c.id
    );
  }
  function panel(name) {
    for (const key of ["inspector", "agent", "review"]) {
      $("tab-" + key).classList.toggle("selected", key === name);
      $("tab-" + key).setAttribute("aria-selected", String(key === name));
      $(key + "-panel").hidden = key !== name;
    }
  }
  async function edit(body) {
    if (!state) return;
    if (state.busy || working) {
      toast("Wait for the current edit to finish, then retry.");
      return;
    }
    if (state.proposal) {
      panel("review");
      toast("Apply or dismiss the current edit before making another.");
      return;
    }
    window.emePlayback?.pause();
    $("player").pause();
    return action(async () => {
      await editorCommand("edit", { edit: { baseRevision: state.project.revision, linked, ...body } });
    });
  }
  function select(id, seekToClip = false) {
    selection = id;
    document.querySelectorAll("[data-clip]").forEach((el) => {
      const selected = el.dataset.clip === id;
      el.classList.toggle("selected", selected);
      el.setAttribute("aria-pressed", String(selected));
    });
    const c = state.project.clips.find((c) => c.id === id);
    $("selection-label").textContent = c
      ? `${c.type.toUpperCase()} · ${clipName(c).replaceAll("\n", " ")} · ${timecode(seconds(c.durationTicks))}`
      : "Select a clip · drag to move · drag an edge to trim";
    if (c && seekToClip) {
      mode = "source";
      renderPreview();
      seek(seconds(c.startTick));
    }
    window.emeInspector?.render();
    panel("inspector");
    updateButtons();
  }
  function updateButtons() {
    const c = state?.project.clips.find((c) => c.id === selection),
      busy = working || state?.busy || state?.proposal;
    for (const id of ["split-clip", "delete-clip"])
      $(id).disabled = !c || !!busy;
    const at = quantize(cursor * TICKS);
    $("split-clip").disabled ||= !!c?.properties?.subject_safe || !!c && (at <= c.startTick || at >= c.startTick + c.durationTicks);
    for (const id of ["split-clip", "delete-clip"])
      $(id).disabled ||= !!state?.project.tracks.find(t => t.id === c?.trackId)?.locked;
  }
  function setTool(value) {
    tool = value;
    $("tool-select").classList.toggle("selected", tool === "select");
    $("tool-blade").classList.toggle("selected", tool === "blade");
    content.dataset.tool = tool;
  }
  function updatePlayhead(follow = false) {
    if (!state) return;
    $("timeline-playhead").style.left = cursor * pixelsPerSecond + "px";
    if (document.activeElement !== $("timeline-clock"))
      $("timeline-clock").value = timecode(cursor);
    updateButtons();
    if (follow && window.emePlayback?.isRunning()) {
      const x = cursor * pixelsPerSecond;
      if (
        x > scroll.scrollLeft + scroll.clientWidth - 30 ||
        x < scroll.scrollLeft
      )
        scroll.scrollLeft = Math.max(0, x - 90);
    }
  }
  function drawWave(canvas, clip, data) {
    if (!canvas.isConnected || !data.available) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1),
      w = Math.max(1, Math.round(canvas.clientWidth)),
      h = canvas.clientHeight;
    if (!h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = "#90c6b0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const start = (clip.source?.trimInTick || 0) / TICKS,
      duration = clip.durationTicks / TICKS;
    for (let x = 0; x < w; x += 2) {
      const a = Math.floor((start + (x / w) * duration) / data.binSeconds),
        b = Math.ceil((start + ((x + 2) / w) * duration) / data.binSeconds);
      let peak = 0;
      for (let i = a; i < Math.min(b, data.peaks.length); i++)
        peak = Math.max(peak, data.peaks[i] || 0);
      const amp = Math.max(peak > 0 ? 1 : 0, Math.pow(peak, 0.55) * h * 0.45);
      ctx.moveTo(x, h / 2 - amp);
      ctx.lineTo(x, h / 2 + amp);
    }
    ctx.stroke();
  }
  function waveforms() {
    for (const el of document.querySelectorAll(".clip-waveform")) {
      const clip = state.project.clips.find((c) => c.id === el.dataset.wave);
      if (!clip) continue;
      const id = clip.source?.assetId;
      if (!waveCache.has(id))
        waveCache.set(
          id,
          api("waveform/" + encodeURIComponent(id)).catch(() => ({
            available: false,
          })),
        );
      waveCache.get(id).then((data) => drawWave(el, clip, data));
    }
  }
  function render(force = false) {
    if (!state) return;
    const p = state.project,
      zoom = Number($("timeline-zoom").value),
      length = seconds(p.timebase.durationTicks),
      width = Math.max(300, scroll.clientWidth),
      oldScale = pixelsPerSecond;
    pixelsPerSecond = (width / Math.max(0.25, length)) * Math.pow(2, zoom / 20);
    const key = [p.revision, zoom, width, selection].join(":");
    if (key === lastKey && !force) {
      updateButtons();
      return;
    }
    lastKey = key;
    const tracks = p.tracks
      .filter(
        (t) =>
          !t.id.startsWith("subject-title-") ||
          p.clips.some((c) => c.trackId === t.id),
      )
      .sort((a, b) =>
        a.kind !== b.kind
          ? a.kind === "visual"
            ? -1
            : 1
          : b.zIndex - a.zIndex || a.id.localeCompare(b.id),
      );
    content.style.width =
      Math.max(width, length * pixelsPerSecond + 120) + "px";
    const increments = [
      1 / (frame().numerator / frame().denominator),
      0.1,
      0.25,
      0.5,
      1,
      2,
      5,
      10,
      15,
      30,
      60,
    ];
    const interval = increments.find((s) => s * pixelsPerSecond >= 85) || 60;
    content.style.setProperty(
      "--grid-spacing",
      interval * pixelsPerSecond + "px",
    );
    let ruler = "";
    const totalWidth = Math.max(width, length * pixelsPerSecond + 120),
      maxSeconds = totalWidth / pixelsPerSecond;
    for (let s = 0; s <= maxSeconds; s += interval) {
      ruler += `<span class="ruler-mark" style="left:${s * pixelsPerSecond}px">${timecode(s)}</span>`;
      for (let n = 1; n < 5; n++)
        ruler += `<span class="ruler-mark minor" style="left:${(s + (interval * n) / 5) * pixelsPerSecond}px"></span>`;
    }
    $("ruler").innerHTML = ruler;
    let vi = tracks.filter((t) => t.kind === "visual").length,
      ai = 1;
    $("track-headers").innerHTML = tracks
      .map(
        (t) =>
          `<div class="track-header ${t.kind === "audio" ? "audio" : ""}" data-header="${escape(t.id)}"><span class="track-index">${t.kind === "audio" ? "A" + ai++ : "V" + vi--}</span><div class="track-header-body"><div class="track-header-name" title="${escape(t.name || t.id)}">${escape(t.name || t.id)}</div><div class="track-header-controls"><button class="icon-button ${t.locked ? "active" : ""}" data-lock="${escape(t.id)}" aria-label="${t.locked ? "Unlock" : "Lock"} ${escape(t.name || t.id)}" title="${t.locked ? "Unlock" : "Lock"} track"><svg class="icon"><use href="#i-lock"/></svg></button><button class="icon-button ${t.muted ? "muted-track" : ""}" data-track-mute="${escape(t.id)}" aria-label="${t.muted ? "Enable" : "Mute"} ${escape(t.name || t.id)}" title="${t.muted ? "Enable" : "Disable"} track output"><svg class="icon"><use href="#${t.kind === "audio" ? "i-speaker" : "i-eye"}"/></svg></button></div></div></div>`,
      )
      .join("");
    $("tracks").innerHTML =
      tracks
        .map(
          (t) =>
            `<div class="track-row ${t.kind === "audio" ? "audio" : ""} ${t.locked ? "locked" : ""} ${t.muted ? "muted" : ""}"><div class="track-lane" data-track="${escape(t.id)}">${p.clips
              .filter((c) => c.trackId === t.id)
              .map((c) => {
                const media = state.media.find(
                    (m) => m.id === c.source?.assetId,
                  ),
                  isSelected = c.id === selection;
                return `<button class="clip ${c.type} ${isSelected ? "selected" : ""}" data-clip="${escape(c.id)}" aria-label="${escape(c.type + ": " + clipName(c).replaceAll("\n", " "))}" aria-pressed="${isSelected}" title="${escape(clipName(c))} · ${timecode(seconds(c.startTick))} — ${timecode(seconds(c.startTick + c.durationTicks))}" style="left:${seconds(c.startTick) * pixelsPerSecond}px;width:${Math.max(4, seconds(c.durationTicks) * pixelsPerSecond)}px">${media?.type === "video" ? `<span class="clip-thumb" style="background-image:url('/api/media/${encodeURIComponent(media.id)}?poster')"></span>` : ""}<span class="clip-title"><span class="clip-kind">${c.type === "text" ? "T" : c.type === "audio" ? "♫" : "▣"}</span>${escape(clipName(c).replaceAll("\n", " "))}</span>${c.type === "audio" ? `<canvas class="clip-waveform" data-wave="${escape(c.id)}"></canvas>` : `<span class="clip-duration">${timecode(seconds(c.durationTicks))}</span>`}<span class="trim-handle start" data-edge="start" title="Trim start"></span><span class="trim-handle end" data-edge="end" title="Trim end"></span></button>`;
              })
              .join("")}</div></div>`,
        )
        .join("") ||
      '<div class="empty-track">Import footage, then add it to your timeline.</div>';
    const usableRows = tracks.reduce(
      (sum, t) => sum + (t.kind === "audio" ? 60 : 65),
      0,
    );
    content.style.minHeight =
      Math.max(scroll.clientHeight, usableRows + 34) + "px";
    const selectedClip = p.clips.find(c => c.id === selection);
    $("selection-label").textContent = selectedClip
      ? `${selectedClip.type.toUpperCase()} · ${clipName(selectedClip).replaceAll("\n", " ")} · ${timecode(seconds(selectedClip.durationTicks))}`
      : "Select a clip · drag to move · drag an edge to trim";
    $("revision").textContent = "Revision " + p.revision;
    $("timeline-scale").textContent =
      zoom === 0
        ? "Fit sequence"
        : `${Math.round(pixelsPerSecond)} px / second`;
    document.querySelectorAll("[data-lock]").forEach(
      (b) =>
        (b.onclick = () => {
          const t = p.tracks.find((t) => t.id === b.dataset.lock);
          edit({ action: "track", trackId: t.id, locked: !t.locked });
        }),
    );
    document.querySelectorAll("[data-track-mute]").forEach(
      (b) =>
        (b.onclick = () => {
          const t = p.tracks.find((t) => t.id === b.dataset.trackMute);
          edit({ action: "track", trackId: t.id, muted: !t.muted });
        }),
    );
    document.querySelectorAll("[data-clip]").forEach((b) => {
      b.onclick = () => select(b.dataset.clip);
      b.ondblclick = () => select(b.dataset.clip, true);
      b.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          select(b.dataset.clip);
        }
      };
    });
    if (oldScale && oldScale !== pixelsPerSecond && zoom > 0)
      scroll.scrollLeft = Math.max(
        0,
        cursor * pixelsPerSecond - scroll.clientWidth * 0.35,
      );
    $("track-headers").style.transform = `translateY(${-scroll.scrollTop}px)`;
    updatePlayhead();
    updateButtons();
    waveforms();
  }
  const tickAt = (x) =>
    Math.max(
      0,
      quantize(
        ((x - scroll.getBoundingClientRect().left + scroll.scrollLeft) /
          pixelsPerSecond) *
          TICKS,
      ),
    );
  function snap(tick, clip, action) {
    if (!snapping) return { tick };
    const targets = [0, quantize(cursor * TICKS)];
    for (const c of state.project.clips)
      if (
        c.id !== clip.id &&
        !(
          linked &&
          c.startTick === clip.startTick &&
          c.durationTicks === clip.durationTicks
        )
      )
        targets.push(c.startTick, c.startTick + c.durationTicks);
    let result = { tick },
      best = (8 / pixelsPerSecond) * TICKS;
    for (const target of targets)
      for (const edge of action === "move" ? [0, clip.durationTicks] : [0]) {
        const delta = target - (tick + edge);
        if (Math.abs(delta) < best) {
          best = Math.abs(delta);
          result = { tick: quantize(tick + delta), guide: target };
        }
      }
    return result;
  }
  content.onpointerdown = (e) => {
    if (e.button !== 0 || !state) return;
    if (mode !== "source") {
      mode = "source";
      renderPreview();
    }
    const el = e.target.closest("[data-clip]"),
      c = el && state.project.clips.find((c) => c.id === el.dataset.clip);
    if (!c) {
      scrubbing = true;
      mode = "source";
      window.emePlayback?.pause();
      $("player").pause();
      renderPreview();
      seek(
        seconds(
          Math.min(state.project.timebase.durationTicks, tickAt(e.clientX)),
        ),
      );
      scroll.setPointerCapture(e.pointerId);
      return;
    }
    // Pointer capture can retarget click/dblclick to the scroll container.
    const doublePress = lastPress?.id === c.id && e.timeStamp - lastPress.time < 400 && Math.abs(e.clientX - lastPress.x) < 5;
    lastPress = { id: c.id, time: e.timeStamp, x: e.clientX };
    if (doublePress && tool === "select" && !e.target.closest("[data-edge]")) {
      lastPress = null;
      select(c.id, true);
      return;
    }
    select(c.id);
    if (state.busy || working || state.proposal) return;
    const track = state.project.tracks.find((t) => t.id === c.trackId);
    if (track.locked) {
      toast("Unlock this track to edit its clips.");
      return;
    }
    const edge = e.target.closest("[data-edge]")?.dataset.edge;
    if (tool === "blade" && !edge) {
      const atTick = tickAt(e.clientX);
      seek(seconds(atTick));
      edit({ action: "split", clipId: c.id, atTick });
      return;
    }
    drag = {
      clip: structuredClone(c),
      element: el,
      startX: e.clientX,
      scrollLeft: scroll.scrollLeft,
      action: edge ? "trim_" + edge : "move",
      changed: false,
      tick: c.startTick,
      targetTrackId: c.trackId,
    };
    scroll.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  scroll.onpointermove = (e) => {
    if (scrubbing) {
      seek(
        seconds(
          Math.min(state.project.timebase.durationTicks, tickAt(e.clientX)),
        ),
      );
      return;
    }
    if (!drag) return;
    const d = drag,
      c = d.clip,
      delta = quantize(
        ((e.clientX - d.startX + scroll.scrollLeft - d.scrollLeft) /
          pixelsPerSecond) *
          TICKS,
      );
    if (Math.abs(e.clientX - d.startX) < 3 && !d.changed) return;
    d.changed = true;
    lastPress = null;
    let tick = quantize(
      (d.action === "trim_end" ? c.startTick + c.durationTicks : c.startTick) +
        delta,
    );
    let result = snap(tick, c, d.action);
    tick = result.tick;
    if (d.action === "move")
      tick = Math.max(
        0,
        Math.min(state.project.timebase.durationTicks - c.durationTicks, tick),
      );
    if (d.action === "trim_start")
      tick = Math.min(
        c.startTick +
          c.durationTicks -
          quantize(TICKS / (frame().numerator / frame().denominator)),
        Math.max(0, tick),
      );
    if (d.action === "trim_end")
      tick = Math.max(
        c.startTick +
          quantize(TICKS / (frame().numerator / frame().denominator)),
        Math.min(state.project.timebase.durationTicks, tick),
      );
    d.tick = tick;
    const hover = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-track]");
    if (d.action === "move" && hover) {
      const t = state.project.tracks.find((t) => t.id === hover.dataset.track);
      if (t && !t.locked && (c.type === "audio") === (t.kind === "audio"))
        d.targetTrackId = t.id;
    }
    const lane = content.querySelector(
        `[data-track="${CSS.escape(d.targetTrackId)}"]`,
      ),
      row = lane?.parentElement;
    const start = d.action === "trim_end" ? c.startTick : tick,
      end =
        d.action === "trim_start"
          ? c.startTick + c.durationTicks
          : d.action === "move"
            ? tick + c.durationTicks
            : tick;
    const ghost = $("timeline-ghost");
    ghost.hidden = false;
    ghost.style.left = seconds(start) * pixelsPerSecond + "px";
    ghost.style.width =
      Math.max(2, seconds(end - start) * pixelsPerSecond) + "px";
    ghost.style.top = (row?.offsetTop || 0) + 40 + "px";
    ghost.querySelector("span").textContent =
      `${d.action.replace("_", " ")} · ${timecode(seconds(tick))}`;
    $("snap-line").hidden = result.guide === undefined;
    $("snap-line").style.left =
      seconds(result.guide || 0) * pixelsPerSecond + "px";
    if (e.clientX > scroll.getBoundingClientRect().right - 28)
      scroll.scrollLeft += 12;
    else if (e.clientX < scroll.getBoundingClientRect().left + 28)
      scroll.scrollLeft -= 12;
  };
  scroll.onpointerup = (e) => {
    scrubbing = false;
    if (!drag) return;
    const d = drag;
    drag = null;
    $("timeline-ghost").hidden = true;
    $("snap-line").hidden = true;
    if (!d.changed) return;
    const body = { action: d.action, clipId: d.clip.id };
    if (d.action === "move") {
      body.startTick = d.tick;
      body.targetTrackId = d.targetTrackId;
      if (d.tick === d.clip.startTick && d.targetTrackId === d.clip.trackId)
        return;
    } else if (d.action === "trim_start") body.startTick = d.tick;
    else body.endTick = d.tick;
    edit(body);
  };
  scroll.onpointercancel = () => {
    scrubbing = false;
    drag = null;
    $("timeline-ghost").hidden = true;
    $("snap-line").hidden = true;
  };
  scroll.onscroll = () => {
    $("track-headers").style.transform = `translateY(${-scroll.scrollTop}px)`;
  };
  function seekTimecode() {
    const input = $("timeline-clock"),
      parts = input.value.trim().split(":").map(Number),
      nominal = Math.round(frame().numerator / frame().denominator);
    if (
      parts.length !== 4 ||
      parts.some((v) => !Number.isInteger(v) || v < 0) ||
      parts[1] >= 60 ||
      parts[2] >= 60 ||
      parts[3] >= nominal
    ) {
      toast("Use HH:MM:SS:FF for the playhead timecode.");
      input.value = timecode(cursor);
      return;
    }
    window.emePlayback?.pause();
    mode = "source";
    renderPreview();
    seek(
      (((parts[0] * 3600 + parts[1] * 60 + parts[2]) * nominal + parts[3]) *
        frame().denominator) /
        frame().numerator,
    );
    input.blur();
    updatePlayhead();
  }
  $("timeline-clock").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      seekTimecode();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.currentTarget.value = timecode(cursor);
      e.currentTarget.blur();
    }
  };
  $("split-clip").onclick = () =>
    selection &&
    edit({
      action: "split",
      clipId: selection,
      atTick: quantize(cursor * TICKS),
    });
  $("delete-clip").onclick = () =>
    selection && edit({ action: "delete", clipId: selection });
  $("tool-select").onclick = () => setTool("select");
  $("tool-blade").onclick = () => setTool("blade");
  $("snap-toggle").onclick = () => {
    snapping = !snapping;
    $("snap-toggle").classList.toggle("selected", snapping);
    $("snap-toggle").setAttribute("aria-pressed", String(snapping));
  };
  $("link-toggle").onclick = () => {
    linked = !linked;
    $("link-toggle").classList.toggle("selected", linked);
    $("link-toggle").setAttribute("aria-pressed", String(linked));
    toast(
      linked
        ? "Source audio edits stay linked."
        : "Only the selected clip will be edited.",
    );
  };
  $("timeline-zoom").oninput = () => render(true);
  $("zoom-in").onclick = () => {
    $("timeline-zoom").value = Math.min(
      100,
      Number($("timeline-zoom").value) + 10,
    );
    render(true);
  };
  $("zoom-out").onclick = () => {
    $("timeline-zoom").value = Math.max(
      0,
      Number($("timeline-zoom").value) - 10,
    );
    render(true);
  };
  $("zoom-fit").onclick = () => {
    $("timeline-zoom").value = 0;
    scroll.scrollLeft = 0;
    render(true);
  };
  for (const name of ["inspector", "agent", "review"])
    $("tab-" + name).onclick = () => panel(name);
  $("shortcuts-button").onclick = () => $("shortcuts-dialog").showModal();
  $("project-download").onclick = () => {
    window.location.href = "/api/project/download";
  };
  $("go-start").onclick = () => { window.emePlayback?.pause(); seek(0); };
  $("go-end").onclick = () => {
    window.emePlayback?.pause();
    seek(
      Math.max(
        0,
        seconds(state.project.timebase.durationTicks) -
          frame().denominator / frame().numerator,
      ),
    );
  };
  $("step-back").onclick = () => {
    window.emePlayback?.pause();
    $("player").pause();
    seek(
      Math.max(
        0,
        (mode === "media" ? $("player").currentTime : cursor) -
          frame().denominator / frame().numerator,
      ),
    );
  };
  $("step-next").onclick = () => {
    window.emePlayback?.pause();
    $("player").pause();
    seek(
      (mode === "media" ? $("player").currentTime : cursor) +
        frame().denominator / frame().numerator,
    );
  };
  let resizing = null;
  $("timeline-resize").onpointerdown = (e) => {
    resizing = {
      y: e.clientY,
      height: document.querySelector(".timeline").clientHeight,
    };
    $("timeline-resize").setPointerCapture(e.pointerId);
  };
  $("timeline-resize").onpointermove = (e) => {
    if (resizing) {
      const height = Math.max(
        200,
        Math.min(
          window.innerHeight - 350,
          resizing.height + resizing.y - e.clientY,
        ),
      );
      document.documentElement.style.setProperty("--timeline-h", height + "px");
      render(true);
      window.emeEditor.fitViewer();
    }
  };
  $("timeline-resize").onpointerup = () => {
    resizing = null;
  };
  $("timeline-resize").onkeydown = (e) => {
    if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const height =
        document.querySelector(".timeline").clientHeight +
        (e.key === "ArrowUp" ? 20 : -20);
      document.documentElement.style.setProperty(
        "--timeline-h",
        Math.max(200, Math.min(window.innerHeight - 350, height)) + "px",
      );
      render(true);
      window.emeEditor.fitViewer();
    }
  };
  window.addEventListener("keydown", (e) => {
    if (
      e.target.closest("input,textarea,select,[contenteditable=true]") ||
      document.querySelector("dialog[open]")
    )
      return;
    const command = e.metaKey || e.ctrlKey,
      key = e.key.toLowerCase();
    if (command && key === "z") {
      e.preventDefault();
      $(e.shiftKey ? "redo" : "undo").click();
      return;
    }
    if (command && ["b", "k"].includes(key)) {
      e.preventDefault();
      $("split-clip").click();
      return;
    }
    if (command) return;
    if (key === " ") {
      e.preventDefault();
      $("play").click();
    } else if (key === "b") setTool("blade");
    else if (key === "v") setTool("select");
    else if (key === "s") $("snap-toggle").click();
    else if (key === "z" && e.shiftKey) $("zoom-fit").click();
    else if (key === "?" || (key === "h" && e.shiftKey))
      $("shortcuts-button").click();
    else if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      const direction = e.key === "ArrowLeft" ? -1 : 1;
      if (e.altKey && selection) {
        const c = state.project.clips.find((c) => c.id === selection);
        edit({
          action: "move",
          clipId: selection,
          startTick: quantize(
            c.startTick +
              (direction * TICKS * frame().denominator) / frame().numerator,
          ),
        });
      } else {
        window.emePlayback?.pause();
        $("player").pause();
        seek(
          cursor +
            ((direction * frame().denominator) / frame().numerator) *
              (e.shiftKey ? 10 : 1),
        );
      }
    } else if (["Backspace", "Delete"].includes(e.key)) {
      e.preventDefault();
      $("delete-clip").click();
    } else if (key === "home") {
      $("go-start").click();
      e.preventDefault();
    } else if (key === "end") {
      $("go-end").click();
      e.preventDefault();
    } else if (key === "escape") {
      selection = null;
      select(null);
    }
  });
  window.addEventListener("resize", () => render(true));
  window.emeTimeline = {
    render,
    updatePlayhead,
    updateButtons,
    select,
    quantize,
    tickAt,
  };
  window.emeEditor = {
    edit,
    select,
    panel,
    timecode,
    clipName,
    fitViewer: () => {},
  };
})();
