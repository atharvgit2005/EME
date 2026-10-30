/* The sequence clock continues through gaps; video and source audio follow it. */
(() => {
  let running = false,
    anchorTime = 0,
    anchorCursor = 0,
    request = null,
    inTick = false,
    muted = false;
  const audio = new Map(),
    player = $("player");
  const isRunning = () => running;
  function button() {
    $("play").textContent = running || !player.paused ? "Ⅱ" : "▶";
  }
  function syncAudio() {
    if (!state) return;
    const p = state.project,
      active = new Set();
    for (const c of p.clips) {
      if (
        c.type !== "audio" ||
        p.tracks.find((t) => t.id === c.trackId)?.muted ||
        cursor < seconds(c.startTick) ||
        cursor >= seconds(c.startTick + c.durationTicks)
      )
        continue;
      active.add(c.id);
      let node = audio.get(c.id);
      if (!node) {
        node = new Audio("/api/media/" + encodeURIComponent(c.source.assetId));
        node.preload = "auto";
        audio.set(c.id, node);
        node.onloadedmetadata = () => {
          if (running) {
            node.currentTime = Math.max(
              0,
              seconds(c.source.trimInTick || 0) + cursor - seconds(c.startTick),
            );
            node.play().catch(() => {});
          }
        };
      }
      const desired =
        seconds(c.source.trimInTick || 0) + cursor - seconds(c.startTick);
      if (node.readyState > 0 && Math.abs(node.currentTime - desired) > 0.15)
        node.currentTime = Math.max(0, desired);
      node.volume = Math.max(0, Math.min(1, c.audio?.volume ?? 1));
      node.muted = muted;
      if (node.paused) node.play().catch(() => {});
    }
    for (const [id, node] of audio)
      if (!active.has(id)) {
        node.pause();
        if (audio.size > 20) {
          node.src = "";
          audio.delete(id);
        }
      }
  }
  function pause() {
    running = false;
    if (request) cancelAnimationFrame(request);
    request = null;
    player.pause();
    for (const node of audio.values()) node.pause();
    button();
  }
  function tick(now) {
    if (!running || mode !== "source") return;
    const end = seconds(state.project.timebase.durationTicks),
      at = anchorCursor + (now - anchorTime) / 1000;
    inTick = true;
    seek(Math.min(at, end));
    inTick = false;
    if (at >= end) {
      pause();
      return;
    }
    player.muted = true;
    if (activeClip && player.paused) player.play().catch(() => {});
    syncAudio();
    button();
    request = requestAnimationFrame(tick);
  }
  function play() {
    if (!state) return;
    if (mode !== "source") {
      player.muted = muted;
      player.play().catch((e) => toast(e.message));
      return;
    }
    const end = seconds(state.project.timebase.durationTicks);
    if (cursor >= end - 0.001) seek(0);
    running = true;
    anchorTime = performance.now();
    anchorCursor = cursor;
    player.muted = true;
    syncAudio();
    if (activeClip) player.play().catch(() => {});
    button();
    request = requestAnimationFrame(tick);
  }
  function seeked() {
    if (running && !inTick) {
      anchorTime = performance.now();
      anchorCursor = cursor;
      syncAudio();
    }
  }
  $("play").onclick = () => {
    if (running || !player.paused) pause();
    else play();
  };
  $("mute").onclick = () => {
    muted = !muted;
    player.muted = mode === "source" ? true : muted;
    for (const node of audio.values()) node.muted = muted;
    $("mute").textContent = muted ? "×" : "♪";
    $("mute").setAttribute("aria-pressed", String(muted));
  };
  player.onplay = button;
  player.onpause = button;
  player.ontimeupdate = () => {
    if (mode === "source") return;
    if (mode === "export") cursor = player.currentTime;
    updateOverlay();
  };
  player.onended = () => {
    if (mode !== "source") button();
  };
  window.addEventListener("pagehide", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.emePlayback = { pause, play, isRunning, seeked };
})();
