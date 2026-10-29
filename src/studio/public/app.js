"use strict";
const $ = (id) => document.getElementById(id),
  token = document.querySelector('meta[name="eme-review"]').content;
let state = null,
  selection = null,
  mode = "source",
  cursor = 0,
  activeClip = null,
  working = false,
  lastRevision = -1,
  lastMessages = "",
  lastProposal = "",
  lastRender = "",
  lastMedia = "",
  config = null;
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const seconds = (t) => Number(t || 0) / 120000;
const clock = (s) =>
  `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${(Math.max(0, s) % 60).toFixed(1).padStart(4, "0")}`;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 6000);
}
async function api(route, body) {
  const response = await fetch("/api/" + route, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-EME-Review": token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Request failed");
  return data;
}
async function action(fn) {
  if (working) return;
  working = true;
  buttons();
  try {
    await fn();
    await refresh();
  } catch (e) {
    toast(e.message);
  } finally {
    working = false;
    buttons();
  }
}
function buttons() {
  const busy = working || state?.busy;
  for (const id of [
    "demo",
    "empty-demo",
    "upload-button",
    "send",
    "add-title",
    "export",
  ])
    $(id).disabled = !!busy;
  $("export").disabled = !!busy || !state?.executionId;
  $("undo").disabled = !!busy || !state?.canUndo;
  $("redo").disabled = !!busy || !state?.canRedo;
  $("play").disabled = !state?.project.clips.some((c) => c.type === "video");
}
function operationLabel(op) {
  const p = op.params || {},
    c = state.project.clips.find((c) => c.id === p.clipId);
  const name = c?.typography?.text || c?.id || p.id || "clip";
  switch (op.type) {
    case "add_track":
      return "Add " + (p.name || p.id) + " track";
    case "add_asset":
      return "Register imported media";
    case "insert_clip":
      return p.type === "text"
        ? "Add title: " + p.typography.text
        : "Add " + p.type + " · " + seconds(p.durationTicks).toFixed(1) + "s";
    case "modify_clip":
      return (
        "Update " +
        name +
        " · " +
        Object.keys(p)
          .filter((k) => k !== "clipId")
          .join(", ")
      );
    case "trim_clip":
      return (
        "Trim " +
        name +
        (p.newDurationTicks
          ? " to " + seconds(p.newDurationTicks).toFixed(1) + "s"
          : "")
      );
    case "restore_project_history":
      return "Restore previous project content";
    case "delete_clip":
      return "Remove " + name;
    default:
      return op.type.replaceAll("_", " ") + " · " + name;
  }
}
function renderProposal() {
  const p = state.proposal;
  if (!p) {
    $("proposal").hidden = true;
    lastProposal = "";
    return;
  }
  const key = p.id;
  if (key === lastProposal) return;
  lastProposal = key;
  $("proposal").hidden = false;
  $("proposal").innerHTML =
    `<h3>Ready for your review <span class="count">${p.operations.length} ${p.operations.length === 1 ? "step" : "steps"}</span></h3><p>${escape(p.summary)}</p><ul class="operation-list">${p.operations.map((op) => "<li>" + escape(operationLabel(op)) + "</li>").join("")}</ul><details><summary>Inspect exact changes</summary><pre>${escape(JSON.stringify(p.operations, null, 2))}</pre></details><div class="proposal-buttons"><button id="dismiss" class="quiet">Dismiss</button><button id="approve" class="primary">Approve & apply <span>↗</span></button></div>`;
  $("approve").onclick = () =>
    action(async () => {
      await api("approve", { id: p.id, digest: p.digest });
      toast("Changes applied.");
    });
  $("dismiss").onclick = () => action(() => api("reject", { id: p.id }));
}
function renderMedia() {
  const key = JSON.stringify(state.media.map((m) => m.id));
  if (key === lastMedia) return;
  lastMedia = key;
  $("media-count").textContent = state.media.length;
  $("media-list").innerHTML = state.media
    .map(
      (m) =>
        `<article class="media-card">${m.type === "video" ? `<img class="media-image" src="/api/media/${m.id}?poster" alt="${escape(m.name)}"><span class="media-duration">${clock(m.duration)}</span>` : '<div class="audio-thumb">♫</div>'}<div class="media-info"><span class="media-name" title="${escape(m.name)}">${escape(m.name)}</span><button class="media-add" data-media="${m.id}" aria-label="Add ${escape(m.name)} to timeline">＋</button></div><button class="scene-open text-button" data-scene="${m.id}" ${m.type === "video" ? "" : "hidden"}>Understand scene ↗</button><div class="media-caption">${m.type === "video" ? m.width + " × " + m.height : "AUDIO"} · ${m.generated ? "GENERATED DEMO" : "LOCAL FILE"}</div></article>`,
    )
    .join("");
  for (const button of document.querySelectorAll("[data-scene]"))
    button.onclick = () => window.emeScene?.open(button.dataset.scene);
  for (const button of document.querySelectorAll("[data-media]"))
    button.onclick = () =>
      action(() => api("import", { mediaId: button.dataset.media }));
}
function renderTimeline() {
  const p = state.project;
  $("revision").textContent = "Revision " + p.revision;
  $("ruler").innerHTML = Array.from(
    { length: 7 },
    (_, i) =>
      "<span>" + clock((seconds(p.timebase.durationTicks) * i) / 6) + "</span>",
  ).join("");
  if (!p.clips.length) {
    $("tracks").innerHTML =
      '<div class="empty-track">Your story starts here. Add a clip from your media.</div>';
    return;
  }
  $("tracks").innerHTML = p.tracks
    .map(
      (t) =>
        `<div class="track-row"><span class="track-label">${escape(t.name || t.id)}</span><div class="track-lane" data-track="${escape(t.id)}">${p.clips
          .filter((c) => c.trackId === t.id)
          .map((c) => {
            const asset = p.assets.find((a) => a.id === c.source?.assetId),
              m = state.media.find((m) => m.id === asset?.id);
            return `<button class="clip ${c.type} ${selection === c.id ? "selected" : ""}" data-clip="${escape(c.id)}" style="left:${(c.startTick / p.timebase.durationTicks) * 100}%;width:${(c.durationTicks / p.timebase.durationTicks) * 100}%" title="${escape(c.typography?.text || m?.name || c.id)}">${escape(c.typography?.text || m?.name || c.type)} <small>${seconds(c.durationTicks).toFixed(1)}s</small></button>`;
          })
          .join("")}</div></div>`,
    )
    .join("");
  for (const button of document.querySelectorAll("[data-clip]"))
    button.onclick = (e) => {
      e.stopPropagation();
      selection = button.dataset.clip;
      const c = p.clips.find((c) => c.id === selection);
      $("selection-label").textContent =
        "Selected: " + (c.typography?.text || c.id);
      if (mode === "source") seek(seconds(c.startTick));
      renderTimeline();
    };
  for (const lane of document.querySelectorAll("[data-track]"))
    lane.onclick = (e) =>
      seek(
        ((e.clientX - lane.getBoundingClientRect().left) / lane.clientWidth) *
          seconds(p.timebase.durationTicks),
      );
}
function renderMessages() {
  const key = JSON.stringify(state.messages.map((m) => m.id));
  if (key === lastMessages) return;
  lastMessages = key;
  if (!state.messages.length) return;
  $("chat").innerHTML = state.messages
    .slice(-50)
    .map(
      (m) =>
        `<div class="message ${escape(m.role)}">${m.role !== "system" ? `<span class="message-author">${m.role === "user" ? "YOU" : escape(m.source || "EME")}</span>` : ""}${escape(m.text).replaceAll("\n", "<br>")}</div>`,
    )
    .join("");
  $("chat").scrollTop = $("chat").scrollHeight;
}
function updateOverlay() {
  const video = state?.project;
  if (!video) return;
  const canvas = $("canvas"),
    ratio = canvas.clientWidth / video.canvas.width;
  $("text-overlays").innerHTML =
    mode === "source"
      ? video.clips
          .filter(
            (c) =>
              c.type === "text" &&
              seconds(c.startTick) <= cursor &&
              cursor < seconds(c.startTick + c.durationTicks),
          )
          .map(
            (c) =>
              `<div class="text-overlay" style="font-size:${(c.typography?.fontSize || 48) * ratio}px;color:${/^#[0-9a-f]{6}$/i.test(c.typography?.color) ? c.typography.color : "#fff"};left:${50 + ((c.transform?.x || 0) / video.canvas.width) * 100}%;top:${50 + ((c.transform?.y || 0) / video.canvas.height) * 100}%;opacity:${c.transform?.opacity ?? 1}">${escape(c.typography?.text || "")}</div>`,
          )
          .join("")
      : "";
  $("timecode").innerHTML =
    clock(cursor) +
    " <span>/ " +
    clock(seconds(video.timebase.durationTicks)) +
    "</span>";
}
function seek(time) {
  if (!state) return;
  cursor = Math.max(
    0,
    Math.min(time, seconds(state.project.timebase.durationTicks)),
  );
  const player = $("player");
  if (mode === "export") {
    if (player.src) player.currentTime = cursor;
    updateOverlay();
    return;
  }
  const clip = state.project.clips.find(
    (c) =>
      c.type === "video" &&
      seconds(c.startTick) <= cursor &&
      cursor < seconds(c.startTick + c.durationTicks),
  );
  if (clip) {
    const media = state.media.find((m) => m.id === clip.source?.assetId);
    if (media) {
      const target = "/api/media/" + media.id;
      const desired =
        seconds(clip.source.trimInTick) + cursor - seconds(clip.startTick);
      const wasPlaying = !player.paused;
      activeClip = clip;
      if (player.getAttribute("src") !== target) {
        player.src = target;
        player.onloadedmetadata = () => {
          player.currentTime = desired;
          if (wasPlaying) player.play().catch(() => {});
        };
      } else if (Math.abs(player.currentTime - desired) > 0.08)
        player.currentTime = desired;
      const t = clip.transform || {};
      player.style.transform = `translate(${((t.x || 0) / state.project.canvas.width) * 100}%,${((t.y || 0) / state.project.canvas.height) * 100}%) scale(${t.scaleX || 1},${t.scaleY || 1}) rotate(${t.rotation || 0}deg)`;
      player.style.opacity = t.opacity ?? 1;
    }
  } else {
    activeClip = null;
    player.pause();
  }
  updateOverlay();
}
function renderPreview() {
  const video = state.project.clips.some((c) => c.type === "video");
  $("empty-canvas").hidden = video;
  $("view-source").classList.toggle("selected", mode === "source");
  $("view-export").classList.toggle("selected", mode === "export");
  if (mode === "export") {
    const output = state.outputs.at(-1);
    if (!output) {
      mode = "source";
      toast("Export a revision to preview the rendered result.");
      return renderPreview();
    }
    const player = $("player");
    const target = "/api/media/" + output.id;
    player.style.transform = "";
    player.style.opacity = 1;
    activeClip = null;
    if (player.getAttribute("src") !== target) {
      player.src = target;
      cursor = 0;
    }
    $("preview-status").textContent =
      output.revision === state.project.revision
        ? "Verified export · revision " + output.revision
        : "Previous export · revision " + output.revision;
  } else {
    if (video)
      seek(
        Math.min(cursor, seconds(state.project.timebase.durationTicks) - 0.01),
      );
    $("preview-status").textContent = video
      ? "Timeline preview · export for final mix"
      : "Your canvas is ready";
  }
  updateOverlay();
}
function renderExport() {
  const r = state.render;
  if (!r) {
    $("render-banner").hidden = true;
    return;
  }
  const key = JSON.stringify(r);
  if (key === lastRender) return;
  lastRender = key;
  const box = $("render-banner");
  box.hidden = false;
  box.classList.toggle(
    "failed",
    r.status === "FAILED" || r.status === "INTERRUPTED",
  );
  if (r.status === "RENDERING")
    box.innerHTML =
      '<span class="spinner"></span> Rendering revision ' +
      r.revision +
      " · checking video and audio…";
  else if (r.status === "SUCCEEDED") {
    const o = state.outputs.find((o) => o.id === r.id);
    box.innerHTML =
      "<span>✓</span> Revision " +
      r.revision +
      ' · verified MP4 <a href="/api/media/' +
      o.id +
      '?download">Download export ↗</a>';
    mode = "export";
    renderPreview();
  } else
    box.textContent =
      r.message || "The previous export was interrupted. Export again.";
}
async function refresh() {
  try {
    const next = await api("state");
    state = next;
    window.emeScene?.update(state);
    renderMedia();
    renderMessages();
    renderProposal();
    renderExport();
    if (lastRevision !== state.project.revision) {
      lastRevision = state.project.revision;
      if (selection && !state.project.clips.some((c) => c.id === selection))
        selection = null;
      renderTimeline();
      renderPreview();
    }
    const queued = state.requests.some((r) => r.status === "QUEUED");
    $("queue-status").hidden = !queued;
    $("agent-status").textContent = state.agentConnected
      ? "IDE agent connected"
      : "Local IDE agent · awaiting connection";
    document
      .querySelector(".connection-dot")
      .classList.toggle("online", state.agentConnected);
    $("connection-label").textContent = state.agentConnected
      ? "IDE connected"
      : "Connect IDE";
    buttons();
  } catch (e) {
    $("agent-status").textContent = "Studio disconnected · retrying";
  }
}
async function useDemo() {
  await action(async () => {
    toast("Preparing your sample footage…");
    const media = await api("demo", {});
    await api("import", { mediaId: media.id });
    toast("Sample ready. Review the proposed import.");
  });
}
$("demo").onclick = useDemo;
$("empty-demo").onclick = useDemo;
$("upload-button").onclick = () => $("file-input").click();
$("file-input").onchange = () =>
  action(async () => {
    const file = $("file-input").files[0];
    if (!file) return;
    toast("Importing " + file.name + "…");
    const response = await fetch(
      "/api/upload?name=" + encodeURIComponent(file.name),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-EME-Review": token,
        },
        body: file,
      },
    );
    const media = await response.json();
    if (!response.ok) throw Error(media.error);
    await api("import", { mediaId: media.id });
    $("file-input").value = "";
  });
$("prompt-form").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    const prompt = $("prompt").value;
    if (!prompt.trim()) return;
    await api("request", { prompt, selection });
    $("prompt").value = "";
    if (!state.agentConnected)
      toast("Request queued. Connect your IDE agent to prepare an edit.");
  });
};
$("prompt").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("prompt-form").requestSubmit();
  }
};
$("dictate").onclick = () => {
  $("prompt").focus();
  toast(
    "Start Wispr Flow with its desktop dictation shortcut, then speak your request.",
  );
};
$("undo").onclick = () => action(() => api("undo", {}));
$("redo").onclick = () => action(() => api("redo", {}));
$("add-title").onclick = () => {
  const title = state?.project.clips.find((c) => c.type === "text");
  $("title-input").value = title?.typography.text || "";
  $("title-dialog").showModal();
  $("title-input").focus();
};
$("title-form").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    await api("title", { text: $("title-input").value });
    $("title-dialog").close();
  });
};
$("export").onclick = () => action(() => api("render", {}));
$("view-source").onclick = () => {
  mode = "source";
  renderPreview();
};
$("view-export").onclick = () => {
  mode = "export";
  renderPreview();
};
$("play").onclick = () => {
  const player = $("player");
  if (player.paused) {
    if (cursor >= seconds(state.project.timebase.durationTicks) - 0.1) seek(0);
    player.play().catch((e) => toast(e.message));
  } else player.pause();
};
$("player").onplay = () => ($("play").textContent = "Ⅱ");
$("player").onpause = () => ($("play").textContent = "▶");
$("player").ontimeupdate = () => {
  if (!state) return;
  const player = $("player");
  if (mode === "export") cursor = player.currentTime;
  else if (activeClip) {
    cursor =
      seconds(activeClip.startTick) +
      player.currentTime -
      seconds(activeClip.source.trimInTick);
    if (
      cursor >=
      seconds(activeClip.startTick + activeClip.durationTicks) - 0.025
    ) {
      const end = seconds(activeClip.startTick + activeClip.durationTicks);
      const next = state.project.clips.find(
        (c) =>
          c.type === "video" && Math.abs(seconds(c.startTick) - end) < 0.02,
      );
      if (next) seek(end + 0.001);
      else player.pause();
    }
  }
  updateOverlay();
};
$("mute").onclick = () => {
  $("player").muted = !$("player").muted;
  $("mute").textContent = $("player").muted ? "×" : "♪";
};
$("history-button").onclick = () => {
  $("history-list").innerHTML = state.history.length
    ? state.history
        .slice()
        .reverse()
        .map(
          (h) =>
            `<div class="history-item"><strong>Revision ${h.revision}</strong><div>${escape(h.summary)}</div><small>${new Date(h.at).toLocaleString()}</small></div>`,
        )
        .join("")
    : '<p class="muted">Your approved edits will appear here.</p>';
  $("history-dialog").showModal();
};
$("connect").onclick = async () => {
  try {
    config = await api("connection");
    const entry = {
      mcpServers: {
        "eme-studio": {
          command: config.command,
          args: config.args,
          env: { EME_STUDIO_ROOT: config.root },
        },
      },
    };
    $("mcp-config").textContent = JSON.stringify(entry, null, 2);
    $("billing-status").textContent =
      config.partner.dodo === "Not configured"
        ? "Checkout is not configured. This local demo is free to use."
        : "Hosted checkout is available. Payments are handled by Dodo.";
    $("billing-link").hidden = config.partner.dodo === "Not configured";
    $("connect-dialog").showModal();
  } catch (e) {
    toast(e.message);
  }
};
$("copy-config").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("mcp-config").textContent);
    toast("MCP configuration copied.");
  } catch {
    toast("Select and copy the configuration shown above.");
  }
};
for (const button of document.querySelectorAll("[data-close]"))
  button.onclick = () => button.closest("dialog").close();
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
window.addEventListener("resize", updateOverlay);
refresh();
setInterval(refresh, 1200);
