/* Selected-clip controls. Every action creates the same reviewed edit as the timeline. */
(() => {
  const byId = (id) => document.getElementById(id);
  let renderedKey = "",
    current = null,
    blocked = false;
  const value = (ticks) => Number((ticks / 120000).toFixed(6));
  const time = (ticks) =>
    typeof window.emeEditor?.timecode === "function"
      ? window.emeEditor.timecode(ticks / 120000)
      : clock(ticks / 120000);
  const attribute = (v) => escape(String(v));
  function numberField(
    id,
    label,
    initial,
    { min, max, step = "any", unit = "", readonly = false } = {},
  ) {
    return `<div class="field-row"><label for="${id}">${label}</label><input id="${id}" type="number" value="${attribute(initial)}" step="${step}"${min === undefined ? "" : ` min="${min}"`}${max === undefined ? "" : ` max="${max}"`}${readonly ? " readonly" : " data-edit-control"}>${unit ? `<span class="unit">${unit}</span>` : ""}</div>`;
  }
  function metadata(label, detail) {
    return `<div class="source-metadata"><span>${escape(label)}</span><span>${escape(detail)}</span></div>`;
  }
  function button(id, label, extra = "") {
    return `<button id="${id}" class="quiet" type="button" data-edit-control ${extra}>${label}</button>`;
  }
  function run(body) {
    return window.emeEditor.edit({ clipId: current.id, ...body });
  }
  function numeric(id) {
    const input = byId(id);
    if (!input.reportValidity() || input.value === "")
      throw Error(
        "Enter a value for " +
          (input.labels?.[0]?.textContent || "this field") +
          ".",
      );
    return Number(input.value);
  }
  function timing(
    id,
    actionName,
    field,
    convert = (s) => Math.round(s * 120000),
  ) {
    byId(id).onclick = () => {
      try {
        const ticks = convert(numeric(field));
        window.emeEditor.edit({
          action: actionName,
          clipId: current.id,
          [actionName === "trim_end" ? "endTick" : "startTick"]: ticks,
        });
      } catch (e) {
        toast(e.message);
      }
    };
  }
  function properties() {
    if (!current) return {};
    const result = {},
      t = current.transform || {},
      typo = current.typography || {};
    if (current.type !== "audio") {
      const transform = {};
      for (const [key, id, fallback, factor] of [
        ["x", "inspect-x", 0, 1],
        ["y", "inspect-y", 0, 1],
        ["scaleX", "inspect-scale-x", 1, 100],
        ["scaleY", "inspect-scale-y", 1, 100],
        ["rotation", "inspect-rotation", 0, 1],
        ["opacity", "inspect-opacity", 1, 100],
      ]) {
        const input = byId(id);
        if (input && input.value !== "") {
          const next = Number(input.value) / factor;
          if (next !== (t[key] ?? fallback)) transform[key] = next;
        }
      }
      if (Object.keys(transform).length) result.transform = transform;
    }
    if (current.type === "text") {
      const typography = {};
      for (const [key, id, fallback] of [
        ["text", "inspect-text", ""],
        ["fontSize", "inspect-font-size", 64],
        ["color", "inspect-color", "#ffffff"],
        ["textAlign", "inspect-align", "center"],
      ]) {
        const input = byId(id);
        if (!input) continue;
        const next = key === "fontSize" ? Number(input.value) : input.value;
        if (next !== (typo[key] ?? fallback)) typography[key] = next;
      }
      if (Object.keys(typography).length) result.typography = typography;
    }
    if (current.type === "audio" && byId("inspect-volume")?.value !== "") {
      const next = Number(byId("inspect-volume").value) / 100;
      if (next !== (current.audio?.volume ?? 1))
        result.audio = { volume: next };
    }
    return result;
  }
  function controls() {
    const busy = !!(state?.busy || working);
    const waiting = !!state?.proposal;
    for (const input of byId("inspector-content").querySelectorAll(
      "[data-edit-control]",
    ))
      input.disabled = blocked || busy || waiting;
    const remove = byId("inspect-delete");
    if (remove)
      remove.disabled =
        !!state?.project.tracks.find((t) => t.id === current?.trackId)
          ?.locked ||
        busy ||
        waiting;
    const save = byId("inspect-save");
    if (save)
      save.disabled = save.disabled || !Object.keys(properties()).length;
  }
  function render() {
    const project = state?.project;
    const clip = project?.clips.find((c) => c.id === selection);
    const content = byId("inspector-content"),
      empty = byId("inspector-empty");
    if (!content || !empty) return;
    if (!clip) {
      content.hidden = true;
      empty.hidden = false;
      current = null;
      renderedKey = "";
      return;
    }
    content.hidden = false;
    empty.hidden = true;
    const key = `${project.revision}:${clip.id}`;
    if (key === renderedKey) {
      controls();
      return;
    }
    renderedKey = key;
    current = clip;
    const track = project.tracks.find((t) => t.id === clip.trackId);
    const asset = project.assets.find(
      (a) => a.id === (clip.source?.assetId || clip.assetId),
    );
    const media = state.media.find((m) => m.id === asset?.id);
    const guarded = !!(
      clip.properties?.subject_safe || clip.properties?.face_safe?.required
    );
    const curved = !!clip.properties?.curved_typography;
    const locked = !!track?.locked;
    blocked = guarded || curved || locked;
    const label =
      clip.typography?.text ||
      asset?.metadata?.design?.title ||
      media?.name ||
      clip.metadata?.name ||
      clip.id;
    const t = clip.transform || {};
    const bounds = Math.max(project.canvas.width, project.canvas.height) * 4;
    const duration = value(project.timebase.durationTicks);
    let html = `<div class="inspector-title"><span>${escape(clip.type)} clip · ${escape(track?.name || clip.trackId)}</span><h3>${escape(label)}</h3><p>${time(clip.startTick)} — ${time(clip.startTick + clip.durationTicks)}</p></div>`;
    if (guarded) {
      const video = project.clips.find(
        (c) => c.id === clip.properties?.subject_safe?.videoClipId,
      );
      html += `<div class="inspector-note">This title has verified scene placement. Replan it to change the text, style, position or timing.${video?.source?.assetId ? '<br><button id="inspect-replan" class="text-button" type="button">Open scene placement ↗</button>' : ""}</div>`;
    } else if (curved)
      html +=
        '<div class="inspector-note">This clip uses generated curved typography. Replan its geometry before changing its text, style or timing.</div>';
    if (locked)
      html +=
        '<div class="inspector-note">This track is locked. Unlock it in the timeline header to edit or delete this clip.</div>';
    html += `<section class="inspector-section"><h4>Timing<span class="muted small">seconds</span></h4>
      ${numberField("inspect-start", "Move to", value(clip.startTick), { min: 0, max: duration, unit: "s" })}
      <div class="field-row"><span class="field-label">Keep source range</span>${button("inspect-move", "Move clip")}</div>
      ${numberField("inspect-trim-start", "Trim left edge", value(clip.startTick), { min: 0, max: duration, unit: "s" })}
      <div class="field-row"><span class="field-label">Keep right edge</span>${button("inspect-trim-start-apply", "Trim start")}</div>
      ${numberField("inspect-end", "Right edge", value(clip.startTick + clip.durationTicks), { min: 0, max: duration, unit: "s" })}
      <div class="field-row"><span class="field-label">Keep left edge</span>${button("inspect-trim-end", "Trim end")}</div>
      ${numberField("inspect-duration", "Duration", value(clip.durationTicks), { min: 0, max: duration, unit: "s" })}
      <div class="field-row"><span class="field-label">Set from clip start</span>${button("inspect-duration-apply", "Set length")}</div>
      ${clip.source?.assetId ? metadata("Source in", time(clip.source.trimInTick || 0)) + metadata("Source out", time(clip.source.trimOutTick ?? (clip.source.trimInTick || 0) + clip.durationTicks)) : ""}
      <p class="small muted">Timing edits align to sequence frames. Linked source audio follows when linked editing is enabled.</p></section>
      <form id="inspector-properties">`;
    if (clip.type === "text") {
      const typo = clip.typography || {};
      html += `<section class="inspector-section"><h4>Text</h4><label for="inspect-text" class="sr-only">Title text</label><textarea id="inspect-text" rows="3" maxlength="150" data-edit-control required>${escape(typo.text || "")}</textarea>
        ${numberField("inspect-font-size", "Font size", typo.fontSize ?? 64, { min: 12, max: 300, step: 1, unit: "px" })}
        <div class="field-row"><label for="inspect-color">Fill color</label><input id="inspect-color" type="color" value="${attribute(/^#[a-f0-9]{6}$/i.test(typo.color || "") ? typo.color : "#ffffff")}" data-edit-control></div>
        <div class="field-row"><label for="inspect-align">Alignment</label><select id="inspect-align" data-edit-control>${["left", "center", "right"].map((align) => `<option value="${align}"${align === (typo.textAlign || "center") ? " selected" : ""}>${align[0].toUpperCase() + align.slice(1)}</option>`).join("")}</select></div></section>`;
    }
    if (clip.type !== "audio")
      html += `<section class="inspector-section"><h4>Transform</h4>
      ${numberField("inspect-x", "Position X", t.x ?? 0, { min: -bounds, max: bounds, unit: "px" })}
      ${numberField("inspect-y", "Position Y", t.y ?? 0, { min: -bounds, max: bounds, unit: "px" })}
      ${numberField("inspect-scale-x", "Scale X", (t.scaleX ?? 1) * 100, { min: 5, max: 400, unit: "%" })}
      ${numberField("inspect-scale-y", "Scale Y", (t.scaleY ?? 1) * 100, { min: 5, max: 400, unit: "%" })}
      ${numberField("inspect-rotation", "Rotation", t.rotation ?? 0, { min: -360, max: 360, unit: "°" })}
      ${numberField("inspect-opacity", "Opacity", (t.opacity ?? 1) * 100, { min: 0, max: 100, unit: "%" })}
      <p class="small muted">Position is measured from the canvas center.</p></section>`;
    if (clip.type === "audio")
      html += `<section class="inspector-section"><h4>Audio</h4>${numberField("inspect-volume", "Volume", (clip.audio?.volume ?? 1) * 100, { min: 0, max: 200, unit: "%" })}<p class="small muted">100% is the source level. Export checks the final mix and output peaks.</p></section>`;
    html +=
      '<div class="inspector-actions"><button id="inspect-save" type="submit" class="primary" data-edit-control>Review property changes ↗</button></div></form>';
    if (clip.source?.assetId) {
      const counterpart = project.clips.find(
        (c) =>
          c.id !== clip.id &&
          c.source &&
          c.startTick === clip.startTick &&
          c.durationTicks === clip.durationTicks &&
          (c.source.trimInTick || 0) === (clip.source.trimInTick || 0) &&
          (clip.type === "video"
            ? c.type === "audio" &&
              c.source.assetId === clip.source.assetId + "-audio"
            : c.type === "video" &&
              clip.source.assetId === c.source.assetId + "-audio"),
      );
      html += `<section class="inspector-section"><h4>Source</h4>${metadata("Media", media?.name || asset?.id || "Unavailable")}${metadata("Clip ID", clip.id)}${media?.width ? metadata("Dimensions", `${media.width} × ${media.height}`) : ""}${metadata("Source link", counterpart ? (clip.type === "audio" ? "Video + source audio" : "Source audio available") : "No matching component")}</section>`;
    }
    html += `<section class="inspector-section"><h4>Clip actions</h4><div class="field-row">${button("inspect-split", "Split at playhead")}${button("inspect-delete", "Delete clip")}</div><p class="small muted">Deleting leaves other clips in place. Every edit opens Review before it is applied.</p></section>`;
    if (asset?.metadata?.design)
      html += `<section class="inspector-section"><h4>Design component</h4><button id="inspect-design" class="quiet" type="button">Edit design content and motion</button><p class="small muted">Rebuild this component through EME while preserving the rest of the sequence.</p></section>`;
    content.innerHTML = html;
    if (byId("inspect-design"))
      byId("inspect-design").onclick = () => window.emeDesign?.edit(clip.id);
    timing("inspect-move", "move", "inspect-start");
    timing("inspect-trim-start-apply", "trim_start", "inspect-trim-start");
    timing("inspect-trim-end", "trim_end", "inspect-end");
    timing(
      "inspect-duration-apply",
      "trim_end",
      "inspect-duration",
      (s) => clip.startTick + Math.round(s * 120000),
    );
    byId("inspect-split").onclick = () =>
      run({ action: "split", atTick: Math.round(cursor * 120000) });
    byId("inspect-delete").onclick = () => run({ action: "delete" });
    byId("inspector-properties").onsubmit = (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const changed = properties();
      if (Object.keys(changed).length)
        run({ action: "properties", ...changed });
    };
    byId("inspector-properties").oninput = controls;
    byId("inspector-properties").onchange = controls;
    if (byId("inspect-replan"))
      byId("inspect-replan").onclick = () => {
        const video = state.project.clips.find(
          (c) => c.id === current.properties.subject_safe.videoClipId,
        );
        if (video?.source?.assetId) window.emeScene?.open(video.source.assetId);
      };
    controls();
  }
  window.emeInspector = { render };
})();
