/* The IDE and this form share the engine planner. Only explicit browser feedback updates preferences. */
(() => {
  let candidateSet = null,
    planning = false,
    saving = false,
    editing = null,
    motionReviewed = new Set();
  const reasonNames = {
    typography: "Typography",
    spacing: "Spacing",
    color: "Colors",
    readability: "Readability",
    content_fit: "Content fit",
    motion: "Motion (if reviewed in playback)",
  };
  function showMemoryStatus(status) {
    $("design-memory-sync").disabled = !status.enabled;
    $("design-memory-status").textContent =
      status.state === "not_configured"
        ? "TigerGraph is not configured. Local design memory is available; follow the TigerGraph setup guide to connect an instance."
        : `TigerGraph: ${status.state}. ${status.message || ""}`;
  }
  $("design-memory-query").onclick = async () => {
    $("design-memory-query").disabled = true;
    try {
      const style = $("design-style").value;
      const result = await api("design/memory/query", {
        recipe: $("design-recipe").value,
        ...(style !== "all" ? { profileId: style } : {}),
        limit: 5,
      });
      showMemoryStatus(result.graph);
      $("design-memory-results").innerHTML =
        `<p class="small">${escape(result.notice)}</p>` +
        result.examples
          .map(
            (e) =>
              `<article class="design-feedback-entry"><p>${escape(e.recipe)} · ${escape(e.profileId)} · ${escape(e.aspect)}</p><p class="small">Title ${escape(e.measurements.titleFontPx)}px · slide ${escape(e.measurements.travel)}px · ${escape(e.content.titleCharacters)} title characters · ${e.feedback.filter((f) => f.preferred).length} explicit preferences.</p><p class="small">${escape(e.previousCandidateId ? "Revision of an earlier design." : "Original candidate.")} Candidate ${escape(e.candidateId.slice(0, 12))}</p></article>`,
          )
          .join("") +
        (!result.examples.length
          ? '<p class="small">No related designs recorded yet.</p>'
          : "");
    } catch (e) {
      $("design-memory-status").textContent = e.message;
    } finally {
      $("design-memory-query").disabled = false;
    }
  };
  $("design-memory-sync").onclick = async () => {
    $("design-memory-sync").disabled = true;
    $("design-memory-status").textContent = "Synchronizing design memory…";
    try {
      showMemoryStatus(await api("design/memory/sync", {}));
    } catch (e) {
      $("design-memory-status").textContent = e.message;
      $("design-memory-sync").disabled = false;
    }
  };
  function recipeChanged() {
    const recipe = $("design-recipe").value;
    $("design-video-field").hidden = recipe !== "lower-third";
    $("design-value-field").hidden = recipe !== "statistic-card";
    $("design-scope").textContent =
      recipe === "lower-third"
        ? "Lower thirds are not checked against tracked subjects. Use Understand scene when subject protection is required."
        : "Cards cover footage for this interval. Existing audio is preserved.";
  }
  function comparisonChanged() {
    const varying = $("design-variation-mode").value === "parameters";
    $("design-style").options[0].disabled = !!editing || varying;
    if (varying && $("design-style").value === "all")
      $("design-style").value = "balanced";
    $("design-variation-mode").options[0].textContent = editing
      ? "Requested revision only"
      : "Style choices";
    for (const id of ["design-axis-one", "design-axis-two"])
      $(id).closest("label").hidden = !!editing || !varying;
  }
  function feedbackForm(saved = null) {
    $("design-feedback-form").hidden = !candidateSet;
    if (!candidateSet) return;
    $("design-feedback-preferred").replaceChildren(
      new Option("Choose a preference…", ""),
      ...candidateSet.candidates.map((c) => new Option(c.name, c.id)),
      new Option("None of the compared designs work", "none"),
    );
    $("design-feedback-preferred").value = saved
      ? (saved.preferredCandidateId ?? "none")
      : "";
    $("design-feedback-compared").innerHTML = candidateSet.candidates
      .map(
        (c) =>
          `<label><input type="checkbox" value="${escape(c.id)}">${escape(c.name)}</label>`,
      )
      .join("");
    $("design-feedback-reasons").innerHTML = Object.entries(reasonNames)
      .map(
        ([value, label]) =>
          `<label><input type="checkbox" value="${value}">${label}</label>`,
      )
      .join("");
    for (const input of $("design-feedback-compared").querySelectorAll("input"))
      input.checked =
        saved?.comparedCandidateIds.includes(input.value) || false;
    for (const input of $("design-feedback-reasons").querySelectorAll("input"))
      input.checked = saved?.reasons.includes(input.value) || false;
    $("design-feedback-note").value = saved?.note || "";
    $("design-feedback-status").textContent = saved
      ? "Saving will replace the influence of the previous comparison."
      : "";
    preferredChanged();
  }
  function preferredChanged() {
    for (const input of $("design-feedback-compared").querySelectorAll(
      "input",
    )) {
      input.disabled = input.value === $("design-feedback-preferred").value;
      if (input.disabled) input.checked = false;
    }
  }
  function showCandidates(set, saved = null) {
    if (candidateSet?.id !== set.id) motionReviewed = new Set();
    if (saved) motionReviewed = new Set(saved.motionReviewedCandidateIds || []);
    candidateSet = set;
    $("design-candidates").replaceChildren();
    const ranking = set.ranking;
    const recommended = set.candidates.find(
      (c) => c.id === ranking.recommendedCandidateId,
    );
    $("design-recommendation").hidden = false;
    const top = ranking.candidates.find(
      (c) => c.candidateId === recommended?.id,
    );
    $("design-recommendation").textContent = recommended
      ? `Recommended: ${recommended.name}. ${top.reasons.at(-1)} ${set.brief.preferredProfile === recommended.profileId ? "Matches your requested style." : ""} ${set.canPropose ? "You can review any eligible design." : "Replan this archived set to apply it."}`
      : !set.current
        ? "These designs belong to an earlier project revision. You can still give feedback on intact previews; replan to apply a design."
        : "No design currently qualifies. Correct or retract feedback, or create new candidates.";
    const ordered = ranking.candidates
      .map((r) => set.candidates.find((c) => c.id === r.candidateId))
      .filter(Boolean);
    for (const candidate of ordered) {
      const row = ranking.candidates.find(
          (r) => r.candidateId === candidate.id,
        ),
        article = document.createElement("article");
      article.className =
        "design-candidate" +
        (recommended?.id === candidate.id ? " recommended" : "");
      article.innerHTML = `<h3>${escape(candidate.name)}${recommended?.id === candidate.id ? " · Recommended" : ""}</h3><a href="${escape(candidate.previewUrl)}" target="_blank" rel="noopener"><img src="${escape(candidate.previewUrl)}" alt="${escape(candidate.name)} design at its static hold" /></a><p class="small">Estimated reading time: ${candidate.report.timing.readingSeconds.toFixed(1)}s · Static hold: ${(candidate.report.timing.holdTicks / 120000).toFixed(1)}s.</p><p class="small">${escape(row.eligible ? row.reasons.at(-1) : row.reason)}</p><button class="quiet" data-review>Review this design</button>${candidate.motionPreviewUrl ? '<button type="button" class="quiet" data-motion aria-pressed="false">Play motion preview</button>' : ""}<p class="small">${candidate.report.parameters ? `Title ${candidate.report.measurements.titleFontPx}px · spacing ${candidate.report.measurements.gapPx}px · slide ${candidate.report.timing.travel}px · duration ${(candidate.report.effectiveDurationTicks / 120000).toFixed(2)}s` : ""}</p>`;
      article.querySelector("[data-review]").disabled =
        !set.canPropose || !row.eligible;
      article.querySelector("[data-review]").onclick = async () => {
        try {
          await api("design/propose", {
            baseRevision: set.baseRevision,
            setId: set.id,
            candidateId: candidate.id,
          });
          $("design-dialog").close();
          await refresh();
        } catch (e) {
          $("design-status").textContent = e.message;
        }
      };
      const motionButton = article.querySelector("[data-motion]");
      if (motionButton)
        motionButton.onclick = () => {
          const playing = motionButton.getAttribute("aria-pressed") !== "true";
          article.querySelector("img").src = playing
            ? candidate.motionPreviewUrl
            : candidate.previewUrl;
          motionButton.setAttribute("aria-pressed", String(playing));
          motionButton.textContent = playing
            ? "Show still preview"
            : "Play motion preview";
          if (playing) motionReviewed.add(candidate.id);
          if (playing)
            $("design-status").textContent =
              "Silent motion proxy over a source still. Long holds are shortened to ten seconds; native export remains authoritative.";
        };
      $("design-candidates").append(article);
    }
    feedbackForm(saved);
  }
  async function history() {
    const data = await api("design/feedback");
    $("design-recent-sets").replaceChildren();
    for (const s of (state.designSets || []).slice(-5).reverse()) {
      const button = document.createElement("button");
      button.className = "quiet";
      button.textContent = `Revisit: ${s.brief.title}`;
      button.onclick = async () => {
        try {
          showCandidates(await api("design/set/" + s.id));
        } catch (e) {
          $("design-status").textContent = e.message;
        }
      };
      $("design-recent-sets").append(button);
    }
    $("design-feedback-history").replaceChildren();
    for (const record of data.records.slice(0, 20)) {
      const item = document.createElement("div");
      item.className = "design-feedback-entry";
      const name =
        record.candidates.find((c) => c.id === record.preferredCandidateId)
          ?.name || "None of the compared designs";
      item.innerHTML = `<p>${escape(record.brief.title)} · ${escape(name)} · ${record.active ? "Influencing recommendations" : "Replaced or retracted"}</p><p class="small">${escape(record.note)}</p><button class="quiet" data-correct>Revisit / correct</button>${record.active ? '<button class="quiet" data-withdraw>Retract feedback</button>' : ""}`;
      item.querySelector("[data-correct]").onclick = async () => {
        try {
          showCandidates(await api("design/set/" + record.setId), record);
        } catch (e) {
          $("design-status").textContent = e.message;
        }
      };
      item
        .querySelector("[data-withdraw]")
        ?.addEventListener("click", async () => {
          try {
            await api("design/feedback/withdraw", {
              submissionId: crypto.randomUUID(),
              feedbackId: record.id,
            });
            if (candidateSet)
              showCandidates(await api("design/set/" + candidateSet.id));
            await history();
            $("design-feedback-status").textContent =
              "Feedback retracted; recommendations updated.";
          } catch (e) {
            $("design-status").textContent = e.message;
          }
        });
      $("design-feedback-history").append(item);
    }
  }
  $("design-feedback-preferred").onchange = preferredChanged;
  $("design-feedback-form").onsubmit = async (event) => {
    event.preventDefault();
    if (!candidateSet || saving) return;
    const compared = [
      ...$("design-feedback-compared").querySelectorAll("input:checked"),
    ].map((i) => i.value);
    if (!compared.length) {
      $("design-feedback-status").textContent =
        "Select at least one alternative you compared.";
      return;
    }
    saving = true;
    $("design-feedback-save").disabled = true;
    try {
      const preferred = $("design-feedback-preferred").value;
      const result = await api("design/feedback", {
        submissionId: crypto.randomUUID(),
        setId: candidateSet.id,
        preferredCandidateId: preferred === "none" ? null : preferred,
        comparedCandidateIds: compared,
        reasons: [
          ...$("design-feedback-reasons").querySelectorAll("input:checked"),
        ].map((i) => i.value),
        note: $("design-feedback-note").value,
        motionReviewedCandidateIds: [...motionReviewed],
      });
      showCandidates(result.set, result.feedback);
      await history();
      $("design-feedback-status").textContent =
        "Preference saved. Recommendations have been updated; the project is unchanged.";
    } catch (e) {
      $("design-feedback-status").textContent = e.message;
    } finally {
      saving = false;
      $("design-feedback-save").disabled = false;
    }
  };
  $("design-recipe").onchange = recipeChanged;
  async function openDesign(clipId = null) {
    if (!state || state.busy || state.proposal)
      return toast("Finish the current action or review first.");
    window.emePlayback?.pause();
    const videos = state.project.clips.filter(
      (c) =>
        c.type === "video" &&
        !state.project.tracks.find((t) => t.id === c.trackId)?.muted,
    );
    $("design-video").replaceChildren(
      ...videos.map(
        (c) =>
          new Option(
            state.media.find((m) => m.id === c.source?.assetId)?.name || c.id,
            c.id,
          ),
      ),
    );
    if (!videos.length) $("design-recipe").value = "title-card";
    const fps = state.project.timebase.fps,
      frame = Math.round((cursor * fps.numerator) / fps.denominator);
    $("design-start").value = (frame * fps.denominator) / fps.numerator;
    $("design-duration").value = Math.min(
      6,
      seconds(state.project.timebase.durationTicks) - cursor,
    );
    $("design-status").textContent = "";
    $("design-memory-results").replaceChildren();
    showMemoryStatus(
      state.graphMemory || { enabled: false, state: "not_configured" },
    );
    $("design-candidates").replaceChildren();
    $("design-recommendation").hidden = true;
    $("design-feedback-form").hidden = true;
    candidateSet = null;
    editing = null;
    $("design-recipe").disabled = false;
    $("design-video").disabled = false;
    $("design-style").value = "all";
    $("design-variation-mode").value = "styles";
    comparisonChanged();
    for (const id of ["title", "spacing", "motion", "hold"])
      $("design-" + id + "-scale").value = 100;
    const designs = state.project.clips.filter(
      (c) =>
        state.project.assets.find((a) => a.id === c.source?.assetId)?.metadata
          ?.design,
    );
    $("design-target").replaceChildren(
      new Option("New component", ""),
      ...designs.map(
        (c) =>
          new Option(
            state.project.assets.find(
              (a) => a.id === c.source.assetId,
            ).metadata.design.title,
            c.id,
          ),
      ),
    );
    recipeChanged();
    $("design-dialog").showModal();
    if (clipId) {
      $("design-target").value = clipId;
      await loadComponent(clipId);
    }
    try {
      await history();
      showMemoryStatus(await api("design/memory/status"));
    } catch (e) {
      $("design-status").textContent = e.message;
    }
  }
  async function loadComponent(clipId) {
    if (!clipId) {
      editing = null;
      $("design-recipe").disabled = false;
      $("design-video").disabled = false;
      comparisonChanged();
      $("design-status").textContent = "Planning a new component.";
      return;
    }
    try {
      const loaded = await api(
        "design/component/" + encodeURIComponent(clipId),
      );
      if ($("design-target").value !== clipId) return;
      editing = loaded;
      const b = editing.baseBrief;
      for (const key of ["title", "body", "eyebrow", "value"])
        $("design-" + key).value = b[key] || "";
      $("design-recipe").value = b.recipe;
      $("design-recipe").disabled = true;
      $("design-video").value = b.videoClipId || "";
      $("design-video").disabled = true;
      $("design-start").value = seconds(b.startTick);
      $("design-duration").value = seconds(b.durationTicks);
      $("design-style").value = editing.profileId;
      $("design-variation-mode").value = "parameters";
      for (const [key, id] of [
        ["titleScale", "title"],
        ["spacingScale", "spacing"],
        ["motionScale", "motion"],
        ["holdScale", "hold"],
      ])
        $("design-" + id + "-scale").value =
          Math.round(editing.parameters[key] * 10000) / 100;
      comparisonChanged();
      recipeChanged();
      $("design-status").textContent =
        "Editing the selected component. Only changed fields will be revised; alternatives vary along those changes.";
    } catch (e) {
      if ($("design-target").value !== clipId) return;
      editing = null;
      $("design-recipe").disabled = false;
      $("design-video").disabled = false;
      comparisonChanged();
      $("design-status").textContent = e.message;
    }
  }
  $("design-load").onclick = () => loadComponent($("design-target").value);
  $("design-target").onchange = () => loadComponent($("design-target").value);
  $("design-variation-mode").onchange = comparisonChanged;
  $("design-open").onclick = () => openDesign();
  window.emeDesign = { edit: openDesign };
  $("design-form").onsubmit = async (event) => {
    event.preventDefault();
    if (planning) return;
    planning = true;
    $("design-plan").disabled = true;
    $("design-candidates").replaceChildren();
    $("design-feedback-form").hidden = true;
    $("design-recommendation").hidden = true;
    candidateSet = null;
    $("design-status").textContent = "Measuring text and creating candidates…";
    try {
      if (
        $("design-target").value &&
        editing?.clipId !== $("design-target").value
      )
        throw Error(
          "Load the selected component successfully before creating a revision.",
        );
      const recipe = $("design-recipe").value,
        fps = state.project.timebase.fps;
      const ticks = (value) =>
        Math.floor(
          (Math.round((Number(value) * fps.numerator) / fps.denominator) *
            120000 *
            fps.denominator) /
            fps.numerator,
        );
      const parameters = Object.fromEntries(
        [
          ["titleScale", "title"],
          ["spacingScale", "spacing"],
          ["motionScale", "motion"],
          ["holdScale", "hold"],
        ].map(([key, id]) => [
          key,
          Number($("design-" + id + "-scale").value) / 100,
        ]),
      );
      const style = $("design-style").value;
      const brief = {
        parameters,
        ...(style !== "all"
          ? { profiles: [style], preferredProfile: style }
          : {}),
        ...($("design-variation-mode").value === "parameters"
          ? {
              variationMode: "parameters",
              variationAxes: [
                $("design-axis-one").value,
                $("design-axis-two").value,
              ].filter(Boolean),
            }
          : {}),
        recipe,
        title: $("design-title").value,
        eyebrow: $("design-eyebrow").value,
        body: $("design-body").value,
        startTick: ticks($("design-start").value),
        durationTicks: ticks($("design-duration").value),
        ...(recipe === "lower-third"
          ? { videoClipId: $("design-video").value }
          : {}),
        ...(recipe === "statistic-card"
          ? { value: $("design-value").value }
          : {}),
      };
      let set;
      if (editing) {
        const changes = {};
        for (const key of [
          "title",
          "body",
          "eyebrow",
          "value",
          "startTick",
          "durationTicks",
        ])
          if (
            Object.hasOwn(brief, key) &&
            brief[key] !== (editing.baseBrief[key] ?? "")
          )
            changes[key] = brief[key];
        const changedParams = Object.fromEntries(
          Object.entries(parameters).filter(
            ([k, v]) => v !== editing.parameters[k],
          ),
        );
        if (Object.keys(changedParams).length)
          changes.parameters = changedParams;
        if (style !== editing.profileId) changes.profileId = style;
        if (!Object.keys(changes).length)
          throw Error(
            "Change content, timing or a parameter before creating a revision.",
          );
        set = await api("design/revise", {
          baseRevision: state.project.revision,
          clipId: editing.clipId,
          changes,
          explore: $("design-variation-mode").value === "parameters",
        });
      } else
        set = await api("design/plan", {
          baseRevision: state.project.revision,
          brief,
        });
      showCandidates(set);
      $("design-status").textContent = set.failures.length
        ? set.failures.map((f) => `${f.profileId}: ${f.reason}`).join(" ")
        : "Compare the static previews, save a preference if you wish, then review a design to apply it.";
    } catch (e) {
      $("design-status").textContent = e.message;
    } finally {
      planning = false;
      $("design-plan").disabled = false;
    }
  };
})();
