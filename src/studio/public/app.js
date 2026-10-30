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
  config = null,
  mediaPreview = null,
  refreshRequest = 0;
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
  window.emePlayback?.pause();
  working = true;
  buttons();
  try {
    await fn();
    await refresh();
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  } finally {
    working = false;
    buttons();
  }
}
async function editorCommand(command, body = {}) {
  const result = await api("editor/command", { command, baseRevision: state.project.revision, ...body });
  mode = "source";
  return result;
}
function buttons() {
  const busy = working || state?.busy;
  for (const id of [
    "demo",
    "empty-demo",
    "upload-button",
    "send",
    "add-title",
    "design-open",
    "export",
    "sequence-settings",
  ])
    $(id).disabled = !!busy;
  $("export").disabled = !!busy || !state?.executionId || !!state?.proposal;
  window.emeTimeline?.updateButtons();
  window.emeInspector?.render();
  $("undo").disabled = !!busy || !state?.canUndo;
  $("redo").disabled = !!busy || !state?.canRedo;
  $("play").disabled =
    !state?.project.clips.some((c) =>
      ["video", "audio", "graphic", "text"].includes(c.type),
    ) && !mediaPreview;
  document
    .querySelectorAll(
      '#sequence-form button[type="submit"], #sequence-form .primary',
    )
    .forEach((b) => (b.disabled = !!busy));
}
function operationLabel(op) {
  const p = op.params || {},
    c = state.project.clips.find((c) => c.id === p.clipId);
  const name = c?.typography?.text || c?.id || p.id || "clip";
  switch (op.type) {
    case "add_track":
      return "Add " + (p.name || p.id) + " track";
    case "add_asset":
      return p.metadata?.design
        ? "Register designed graphic"
        : p.type === "font"
          ? "Bind design font"
          : "Register imported media";
    case "animate_property":
      return p.property === "transform.opacity"
        ? "Animate entrance and exit opacity"
        : "Animate entrance position";
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
    $("review-empty").hidden = false;
    $("review-count").hidden = true;
    return;
  }
  const key = p.id;
  if (key === lastProposal) return;
  lastProposal = key;
  $("proposal").hidden = false;
  $("review-empty").hidden = true;
  $("review-count").hidden = false;
  window.emeEditor?.panel("review");
  $("proposal").innerHTML =
    `<h3>Ready for your review <span class="count">${p.operations.length} ${p.operations.length === 1 ? "step" : "steps"}</span></h3><p>${escape(p.summary)}</p><ul class="operation-list">${p.operations.map((op) => "<li>" + escape(operationLabel(op)) + "</li>").join("")}</ul><details><summary>Inspect exact changes</summary><pre>${escape(JSON.stringify(p.operations, null, 2))}</pre></details><div class="proposal-buttons"><button id="dismiss" class="quiet">Dismiss</button><button id="approve" class="primary">Approve & apply <span>↗</span></button></div>`;
  if (p.planning?.design) {
    const d = p.planning.design,
      figure = document.createElement("figure");
    figure.className = "placement-preview";
    const image = document.createElement("img");
    image.src = d.previewUrl;
    image.alt = d.name + " design at static hold";
    const caption = document.createElement("figcaption");
    caption.textContent =
      `Static hold preview · ${(d.report.timing.holdTicks / 120000).toFixed(1)}s to read. ` + d.report.warnings.join(" ");
    figure.append(image, caption);
    $("proposal").querySelector("details").before(figure);
  }
  if (p.planning?.previewId) {
    const figure = document.createElement("figure");
    figure.className = "placement-preview";
    const image = document.createElement("img");
    image.id = "placement-preview";
    image.src =
      "/api/title-preview/" + encodeURIComponent(p.planning.previewId);
    image.alt =
      "Rendered title placement at the first source frame of the title interval";
    const caption = document.createElement("figcaption");
    caption.textContent = `At title start · ${p.planning.tracked_intervals} tracked intervals checked · export rechecks the scene and rendered bounds.`;
    const fullSize = document.createElement("a");
    fullSize.href = image.src;
    fullSize.target = "_blank";
    fullSize.rel = "noopener";
    fullSize.title = "Open full-size placement preview";
    fullSize.append(image);
    figure.append(fullSize, caption);
    $("proposal").querySelector("details").before(figure);
  }
  $("approve").onclick = () =>
    action(async () => {
      await api("approve", { id: p.id, digest: p.digest });
      mode = "source";
      toast("Changes applied. Undo is available.");
    });
  $("dismiss").onclick = () => action(() => api("reject", { id: p.id }));
}
function renderMedia(force = false) {
  const query = $("media-search").value.toLowerCase();
  const key = JSON.stringify(state.media.map((m) => m.id)) + query;
  if (!force && key === lastMedia) return;
  lastMedia = key;
  $("media-count").textContent = state.media.length;
  const media = state.media.filter((m) => m.name.toLowerCase().includes(query));
  $("media-empty").hidden = state.media.length > 0;
  $("media-list").hidden = state.media.length === 0;
  $("media-list").innerHTML = media
    .map(
      (m) =>
        `<article class="media-card" draggable="true" data-media-drag="${escape(m.id)}"><button class="media-thumb" data-preview="${escape(m.id)}" title="Preview source" aria-label="Preview ${escape(m.name)}">${m.type === "video" ? `<img class="media-image" src="/api/media/${m.id}?poster" alt="${escape(m.name)}">` : '<span class="audio-thumb">♫</span>'}<span class="media-duration">${clock(m.duration)}</span></button><div class="media-info"><span class="media-name" title="${escape(m.name)}">${escape(m.name)}</span><button class="media-add" data-media="${escape(m.id)}" aria-label="Add ${escape(m.name)} to timeline" title="Add to timeline">＋</button></div><div class="media-caption">${m.type === "video" ? m.width + " × " + m.height : "AUDIO"} · ${m.generated ? "GENERATED" : "LOCAL"}</div>${m.type === "video" ? `<button class="scene-open text-button" data-scene="${escape(m.id)}">Understand scene ↗</button>` : ""}</article>`,
    )
    .join("");
  for (const button of document.querySelectorAll("[data-scene]"))
    button.onclick = () => window.emeScene?.open(button.dataset.scene);
  for (const button of document.querySelectorAll("[data-media]"))
    button.onclick = () =>
      action(() => editorCommand("import", { mediaId: button.dataset.media }));
  for (const button of document.querySelectorAll("[data-preview]"))
    button.onclick = () => previewMedia(button.dataset.preview);
  for (const card of document.querySelectorAll("[data-media-drag]"))
    card.ondragstart = (e) => {
      e.dataTransfer.setData("application/x-eme-media", card.dataset.mediaDrag);
      e.dataTransfer.effectAllowed = "copy";
    };
}
function renderTimeline() {
  window.emeTimeline?.render();
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
function fitViewer() {
  const wrap = document.querySelector(".canvas-wrap");
  if (!wrap || !state) return;
  const source = mode === "media" ? mediaPreview : null;
  const width = source?.width || state.project.canvas.width,
    height = source?.height || state.project.canvas.height;
  const style = getComputedStyle(wrap),
    availableW =
      wrap.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight),
    availableH =
      wrap.clientHeight -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom);
  const scale = Math.min(availableW / width, availableH / height);
  $("canvas").style.width = Math.max(1, width * scale) + "px";
  $("canvas").style.height = Math.max(1, height * scale) + "px";
}
function designGraphic(c, ratio) {
  const at = cursor * 120000 - c.startTick;
  function channel(property, fallback) {
    const keys = state.project.animations.find(
      (a) => a.clipId === c.id && a.property === property,
    )?.keyframes;
    if (!keys?.length) return fallback;
    if (at <= keys[0].offsetTick) return keys[0].value;
    for (let i = 1; i < keys.length; i++)
      if (at < keys[i].offsetTick) {
        const a = keys[i - 1],
          b = keys[i];
        return (
          a.value +
          ((b.value - a.value) * (at - a.offsetTick)) /
            (b.offsetTick - a.offsetTick)
        );
      }
    return keys.at(-1).value;
  }
  const t = c.transform || {};
  return `<img class="design-graphic" alt="Designed graphic" src="/api/design/graphic/${encodeURIComponent(c.source.assetId)}" style="opacity:${channel("transform.opacity", t.opacity ?? 1)};transform:translate(${channel("transform.x", t.x || 0) * ratio}px,${channel("transform.y", t.y || 0) * ratio}px) rotate(${t.rotation || 0}deg) scale(${t.scaleX ?? 1},${t.scaleY ?? 1})">`;
}
function updateOverlay() {
  const p = state?.project;
  if (!p) return;
  const ratio = $("canvas").clientWidth / p.canvas.width;
  $("text-overlays").innerHTML =
    mode === "source"
      ? p.clips
          .filter(
            (c) =>
              (c.type === "text" ||
                (c.type === "graphic" &&
                  p.assets.find((a) => a.id === c.source?.assetId)?.metadata
                    ?.design)) &&
              !p.tracks.find((t) => t.id === c.trackId)?.muted &&
              seconds(c.startTick) <= cursor &&
              cursor < seconds(c.startTick + c.durationTicks),
          )
          .sort(
            (a, b) =>
              p.tracks.find((t) => t.id === a.trackId).zIndex -
              p.tracks.find((t) => t.id === b.trackId).zIndex,
          )
          .map((c) =>
            c.type === "graphic"
              ? designGraphic(c, ratio)
              : c.properties?.subject_safe?.previewId
                ? `<img class="subject-title-overlay" alt="${escape(c.typography?.text || "")}" src="/api/title-glyph/${encodeURIComponent(c.properties.subject_safe.previewId)}" style="transform:translate(${(c.transform?.x || 0) * ratio}px,${(c.transform?.y || 0) * ratio}px)">`
                : `<div class="text-overlay" style="font-size:${(c.typography?.fontSize || 48) * ratio}px;color:${/^#[0-9a-f]{6}$/i.test(c.typography?.color) ? c.typography.color : "#fff"};left:${50 + ((c.transform?.x || 0) / p.canvas.width) * 100}%;top:${50 + ((c.transform?.y || 0) / p.canvas.height) * 100}%;opacity:${c.transform?.opacity ?? 1};text-align:${["left", "right", "center"].includes(c.typography?.textAlign) ? c.typography.textAlign : "center"};background:${c.properties?.text_backing ? "#151515" : "transparent"}">${escape(c.typography?.text || "")}</div>`,
          )
          .join("")
      : "";
  const time = mode === "media" ? $("player").currentTime : cursor;
  $("timecode").textContent = window.emeEditor?.timecode(time) || clock(time);
  const duration =
    mode === "media"
      ? mediaPreview?.duration || 0
      : mode === "export"
        ? state.outputs.at(-1)?.qa?.duration_seconds ||
          seconds(p.timebase.durationTicks)
        : seconds(p.timebase.durationTicks);
  $("duration-timecode").textContent =
    window.emeEditor?.timecode(duration) || clock(duration);
  if (mode !== "media") window.emeTimeline?.updatePlayhead(true);
}
function previewMedia(id) {
  mediaPreview = state.media.find((m) => m.id === id);
  if (!mediaPreview) return;
  window.emePlayback?.pause();
  $("player").pause();
  mode = "media";
  $("view-media").disabled = false;
  renderPreview();
}
function applyVideoStyle(clip, media) {
  const player = $("player"),
    view = $("video-viewport"),
    t = clip?.transform || {},
    crop = clip?.properties?.reframing?.crop_rect;
  if (crop && media) {
    player.style.width = (media.width / crop.width) * 100 + "%";
    player.style.height = (media.height / crop.height) * 100 + "%";
    player.style.left = (-crop.x / crop.width) * 100 + "%";
    player.style.top = (-crop.y / crop.height) * 100 + "%";
    player.style.objectFit = "fill";
  } else {
    player.style.width = "100%";
    player.style.height = "100%";
    player.style.left = "0";
    player.style.top = "0";
    player.style.objectFit = "contain";
  }
  view.style.transform = `translate(${((t.x || 0) / state.project.canvas.width) * 100}%,${((t.y || 0) / state.project.canvas.height) * 100}%) scale(${t.scaleX ?? 1},${t.scaleY ?? 1}) rotate(${t.rotation || 0}deg)`;
  view.style.opacity = t.opacity ?? 1;
  view.style.visibility = "visible";
  const effects = clip?.effects || [];
  view.style.filter = effects
    .map((e) => {
      const p = e.parameters || {};
      return e.type === "brightness"
        ? `brightness(${p.factor ?? 1})`
        : e.type === "contrast"
          ? `contrast(${p.factor ?? 1})`
          : e.type === "invert"
            ? "invert(1)"
            : e.type === "blur"
              ? `blur(${p.radius || 1}px)`
              : "";
    })
    .join(" ");
}
function seek(time) {
  if (!state) return;
  const player = $("player");
  if (mode === "media") {
    player.currentTime = Math.max(
      0,
      Math.min(time, mediaPreview?.duration || 0),
    );
    updateOverlay();
    return;
  }
  cursor = Math.max(
    0,
    Math.min(time, seconds(state.project.timebase.durationTicks)),
  );
  window.emePlayback?.seeked();
  if (mode === "export") {
    if (player.src) player.currentTime = cursor;
    updateOverlay();
    return;
  }
  const clip = state.project.clips
    .filter(
      (c) =>
        c.type === "video" &&
        !state.project.tracks.find((t) => t.id === c.trackId)?.muted &&
        seconds(c.startTick) <= cursor &&
        cursor < seconds(c.startTick + c.durationTicks),
    )
    .sort(
      (a, b) =>
        state.project.tracks.find((t) => t.id === b.trackId).zIndex -
        state.project.tracks.find((t) => t.id === a.trackId).zIndex,
    )[0];
  if (clip) {
    const media = state.media.find((m) => m.id === clip.source?.assetId);
    if (media) {
      const target = "/api/media/" + media.id,
        desired =
          seconds(clip.source.trimInTick) + cursor - seconds(clip.startTick);
      activeClip = clip;
      if (player.getAttribute("src") !== target) {
        player.src = target;
        player.onloadedmetadata = () => {
          if (mode !== "source" || !activeClip) return;
          player.currentTime = Math.max(0, seconds(activeClip.source.trimInTick) + cursor - seconds(activeClip.startTick));
          if (window.emePlayback?.isRunning()) player.play().catch(() => {});
        };
      } else if (
        Math.abs(player.currentTime - desired) >
        (window.emePlayback?.isRunning() ? 0.15 : 0.001)
      )
        player.currentTime = desired;
      applyVideoStyle(clip, media);
    }
  } else {
    activeClip = null;
    player.pause();
    $("video-viewport").style.visibility = "hidden";
  }
  updateOverlay();
}
function renderPreview() {
  if (!state) return;
  const video = state.project.clips.some((c) => c.type === "video");
  const visual = state.project.clips.some((c) =>
    ["video", "graphic", "text"].includes(c.type),
  );
  $("empty-canvas").hidden = visual || mode === "media" || mode === "export";
  $("view-source").classList.toggle("selected", mode === "source");
  $("view-media").classList.toggle("selected", mode === "media");
  $("view-export").classList.toggle("selected", mode === "export");
  const output = state.outputs.at(-1);
  if (mode === "export" && !output) {
    mode = "source";
    toast("Export a revision to preview the rendered result.");
    return renderPreview();
  }
  if (mode === "export" || mode === "media") {
    const source = mode === "media" ? mediaPreview : output;
    if (!source) return;
    const target = "/api/media/" + source.id;
    activeClip = null;
    applyVideoStyle(null, null);
    if ($("player").getAttribute("src") !== target) {
      $("player").onloadedmetadata = null;
      $("player").src = target;
      if (mode === "export") cursor = 0;
    }
    $("viewer-name").textContent =
      mode === "media" ? source.name : "Sequence 01 · export";
    $("preview-status").textContent =
      mode === "media"
        ? "Source preview · original file"
        : (output.revision === state.project.revision
            ? "Verified export"
            : "Previous export") +
          " · revision " +
          output.revision;
  } else {
    if (visual || state.project.clips.some(c => c.type === "audio"))
      seek(
        Math.min(cursor, seconds(state.project.timebase.durationTicks) - 0.001),
      );
    $("preview-status").textContent = video
      ? "Timeline preview · export for final mix"
      : "Timeline preview";
    $("viewer-name").textContent = "Sequence 01";
  }
  fitViewer();
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
  const wasRendering = lastRender && JSON.parse(lastRender).status === "RENDERING";
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
    if (wasRendering && o.revision === state.project.revision) {
      window.emePlayback?.pause();
      mode = "export";
    }
    renderPreview();
  } else
    box.textContent =
      r.message || "The previous export was interrupted. Export again.";
}
async function refresh() {
  const request = ++refreshRequest;
  try {
    const next = await api("state");
    if (request !== refreshRequest) return;
    state = next;
    $("project-name").textContent = state.project.title || "Untitled project";
    const fps = state.project.timebase.fps;
    $("sequence-spec").textContent =
      `${state.project.canvas.width} × ${state.project.canvas.height} · ${(fps.numerator / fps.denominator).toFixed(2).replace(/\.00$/, "")} fps`;
    $("viewer-resolution").textContent =
      `${state.project.canvas.width} × ${state.project.canvas.height}`;
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
      window.emeInspector?.render();
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
    await editorCommand("import", { mediaId: media.id });
    toast("Sample added. Undo is available.");
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
    await editorCommand("import", { mediaId: media.id });
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
$("undo").onclick = () => action(() => editorCommand("undo"));
$("redo").onclick = () => action(() => editorCommand("redo"));
$("add-title").onclick = () => {
  $("title-input").value = "";
  $("title-dialog").showModal();
  $("title-input").focus();
};
$("title-form").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    await editorCommand("title", { text: $("title-input").value, startTick: window.emeTimeline.quantize(cursor * 120000) });
    $("title-dialog").close();
  });
};
$("export").onclick = () => action(() => api("render", {}));
$("view-source").onclick = () => {
  window.emePlayback?.pause();
  mode = "source";
  renderPreview();
};
$("view-export").onclick = () => {
  window.emePlayback?.pause();
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
  if (mode === "media") {
    updateOverlay();
    return;
  }
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
window.addEventListener("resize", () => {
  fitViewer();
  updateOverlay();
});
window.addEventListener("DOMContentLoaded", () => {
  window.emeEditor.fitViewer = () => {
    fitViewer();
    updateOverlay();
  };
  $("view-media").onclick = () => {
    if (mediaPreview) {
      window.emePlayback?.pause();
      mode = "media";
      renderPreview();
    }
  };
  $("sequence-settings").onclick = () => {
    $("sequence-duration").value = Number(
      seconds(state.project.timebase.durationTicks).toFixed(3),
    );
    $("sequence-dialog").showModal();
  };
  $("sequence-form").onsubmit = async (e) => {
    e.preventDefault();
    const applied = await window.emeEditor.edit({
      action: "duration",
      durationTicks: Math.round(Number($("sequence-duration").value) * 120000),
    });
    if (applied) $("sequence-dialog").close();
  };
  $("media-search").oninput = () => renderMedia(true);
  $("bin-list").onclick = () => {
    $("media-list").classList.add("list-view");
    $("bin-list").classList.add("selected");
    $("bin-grid").classList.remove("selected");
  };
  $("bin-grid").onclick = () => {
    $("media-list").classList.remove("list-view");
    $("bin-grid").classList.add("selected");
    $("bin-list").classList.remove("selected");
  };
  $("fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector(".viewer").requestFullscreen();
    } catch {
      toast("Fullscreen is unavailable in this browser.");
    }
  };
  for (const el of document.querySelectorAll("[data-prompt]"))
    el.onclick = () => {
      $("prompt").value = el.dataset.prompt;
      $("prompt").focus();
    };
  const drop = $("timeline-scroll");
  drop.ondragover = (e) => {
    if (e.dataTransfer.types.includes("application/x-eme-media")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  drop.ondrop = (e) => {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData("application/x-eme-media");
    if (mediaId) action(() => editorCommand("import", { mediaId, startTick: window.emeTimeline.tickAt(e.clientX) }));
  };
  new ResizeObserver(() => {
    fitViewer();
    updateOverlay();
  }).observe(document.querySelector(".canvas-wrap"));
  refresh();
  setInterval(refresh, 1200);
});
