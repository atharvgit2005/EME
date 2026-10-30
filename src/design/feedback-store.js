const fs = require("node:fs"),
  path = require("node:path");
const { digest } = require("../creative/execution-record.js");
const { durableWrite } = require("../creative/approval-authority.js");
const { features, activeFeedback } = require("./ranking.js");
const { SessionLockCoordinator } = require("../prompt-core/session-lock.js");
const {
  computeFileSha256BoundedSync: fileHash,
} = require("../prompt-core/job-orchestrator.js");
const REASONS = [
  "typography",
  "spacing",
  "color",
  "readability",
  "content_fit",
  "motion",
];
function invalid(message, status = 400) {
  throw Object.assign(Error("ERR_DESIGN_FEEDBACK: " + message), { status });
}
function uuid(value) {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      value,
    )
  )
    invalid("Invalid feedback identity.");
  return value;
}
function keys(body, allowed) {
  if (
    !body ||
    Object.getPrototypeOf(body) !== Object.prototype ||
    Object.keys(body).some((k) => !allowed.includes(k))
  )
    invalid("Unsupported feedback fields.");
}
class DesignFeedbackStore {
  constructor(root) {
    this.root = root;
    this.file = path.join(root, "feedback.json");
    this.corpus = path.join(root, "sets");
  }
  read() {
    if (!fs.existsSync(this.file)) return [];
    const { version, events, sha256 } = JSON.parse(fs.readFileSync(this.file));
    if (
      version !== "eme-design-feedback.v1" ||
      !Array.isArray(events) ||
      digest(events) !== sha256
    )
      invalid(
        "Feedback history is damaged; restore it before collecting more feedback.",
        409,
      );
    return events;
  }
  write(events) {
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    durableWrite(this.file, {
      version: "eme-design-feedback.v1",
      events,
      sha256: digest(events),
    });
  }
  locked(action) {
    const coordinator = new SessionLockCoordinator({
      lockDir: path.join(this.root, "locks"),
    });
    let lock;
    try {
      lock = coordinator.acquireLock("session", "design-feedback");
    } catch (_) {
      invalid(
        "Feedback is being updated or its lock is unavailable. Retry shortly.",
        409,
      );
    }
    try {
      if (!lock.verifyActive()) invalid("Feedback lock changed. Retry.", 409);
      return action();
    } finally {
      lock.release();
    }
  }
  register(set) {
    fs.mkdirSync(this.corpus, { recursive: true, mode: 0o700 });
    const record = {
      id: set.id,
      version: set.version,
      projectId: set.projectId,
      baseRevision: set.baseRevision,
      snapshot: set.snapshot,
      canvas: set.canvas,
      brief: set.brief,
      revision: set.revision || null,
      candidates: set.candidates.map((c) => ({
        id: c.id,
        name: c.name,
        profileId: c.profileId,
        features: features(set, c),
        reportSha256: digest(c.report),
        report: c.report,
        previewSha256: c.report.previewSha256,
        graphicSha256: c.report.graphicSha256,
      })),
      bindings: Object.fromEntries(
        set.candidates.map((c) => [
          c.id,
          {
            graphic: c.glyphPath,
            preview: c.previewPath,
            report: c.operations[0].params.metadata.design.report.path,
            reportFileSha256:
              c.operations[0].params.metadata.design.report.sha256,
            ...(c.motionPath
              ? {
                  motion: c.motionPath,
                  motionSha256: c.report.motionPreview.sha256,
                }
              : {}),
            ...(c.operations.find(
              (o) => o.type === "add_asset" && o.params.type === "font",
            )
              ? {
                  font: c.operations.find(
                    (o) => o.type === "add_asset" && o.params.type === "font",
                  ).params.src,
                  fontSha256: c.operations.find(
                    (o) => o.type === "add_asset" && o.params.type === "font",
                  ).params.sha256,
                }
              : {}),
          },
        ]),
      ),
      evidenceStage: "static_preview",
    };
    const file = path.join(this.corpus, uuid(set.id) + ".json");
    if (fs.existsSync(file)) {
      if (digest(this.getSet(set.id)) !== digest(record))
        invalid("Registered design set changed.", 409);
    } else durableWrite(file, { record, sha256: digest(record) });
    return record;
  }
  getSet(id) {
    const file = path.join(this.corpus, uuid(id) + ".json");
    if (!fs.existsSync(file)) invalid("Design set not found.", 404);
    const { record, sha256 } = JSON.parse(fs.readFileSync(file));
    if (digest(record) !== sha256 || record.id !== id)
      invalid("Design evidence record changed.", 409);
    return record;
  }
  verifyCandidate(set, candidateId) {
    const c = set.candidates.find((c) => c.id === candidateId),
      binding = set.bindings[candidateId];
    if (!c || !binding) invalid("Candidate not registered.", 404);
    if (
      fileHash(binding.graphic) !== c.graphicSha256 ||
      fileHash(binding.preview) !== c.previewSha256 ||
      fileHash(binding.report) !== binding.reportFileSha256 ||
      (binding.font && fileHash(binding.font) !== binding.fontSha256) ||
      (binding.motion && fileHash(binding.motion) !== binding.motionSha256) ||
      digest(JSON.parse(fs.readFileSync(binding.report))) !== c.reportSha256
    )
      invalid("Candidate preview or design evidence changed. Plan again.", 409);
    return binding;
  }
  submit(body) {
    return this.locked(() => this.submitLocked(body));
  }
  submitLocked(body) {
    keys(body, [
      "submissionId",
      "setId",
      "preferredCandidateId",
      "comparedCandidateIds",
      "reasons",
      "note",
      "motionReviewedCandidateIds",
    ]);
    uuid(body.submissionId);
    const events = this.read(),
      inputHash = digest(body),
      previous = events.find((e) => e.id === body.submissionId);
    if (previous) {
      if (previous.inputHash !== inputHash)
        invalid(
          "Submission identity was already used for different feedback.",
          409,
        );
      return this.view(previous, events);
    }
    const set = this.getSet(body.setId),
      ids = set.candidates.map((c) => c.id);
    if (
      body.preferredCandidateId !== null &&
      !ids.includes(body.preferredCandidateId)
    )
      invalid(
        "Choose a candidate from this set, or explicitly reject the compared designs.",
      );
    if (
      !Array.isArray(body.comparedCandidateIds) ||
      !body.comparedCandidateIds.length ||
      body.comparedCandidateIds.some(
        (id) => !ids.includes(id) || id === body.preferredCandidateId,
      ) ||
      new Set(body.comparedCandidateIds).size !==
        body.comparedCandidateIds.length
    )
      invalid("Name at least one distinct alternative you compared.");
    for (const id of [
      ...body.comparedCandidateIds,
      body.preferredCandidateId,
    ].filter(Boolean))
      this.verifyCandidate(set, id);
    const reasons = body.reasons ?? [],
      note = body.note ?? "";
    const motionReviewed = body.motionReviewedCandidateIds || [];
    if (
      !Array.isArray(motionReviewed) ||
      new Set(motionReviewed).size !== motionReviewed.length ||
      motionReviewed.some((id) => !ids.includes(id) || !set.bindings[id].motion)
    )
      invalid("Motion review must name candidates with bound motion previews.");
    for (const id of motionReviewed) this.verifyCandidate(set, id);
    if (
      !Array.isArray(reasons) ||
      new Set(reasons).size !== reasons.length ||
      reasons.some((r) => !REASONS.includes(r))
    )
      invalid("Unsupported feedback reason.");
    if (
      typeof note !== "string" ||
      note.length > 600 ||
      /[\x00-\x08\x0b-\x1f\x7f]/.test(note)
    )
      invalid("Use a feedback note up to 600 characters.");
    const record = {
      id: body.submissionId,
      inputHash,
      kind: "preference",
      source: "studio_browser",
      recordedAt: new Date().toISOString(),
      observationKey: digest({
        snapshot: set.snapshot,
        candidates: ids.slice().sort(),
      }),
      setId: set.id,
      projectId: set.projectId,
      designVersion: set.version,
      evidenceStage: set.evidenceStage,
      motionReviewedCandidateIds: motionReviewed.slice(),
      brief: set.brief,
      candidates: set.candidates,
      preferredCandidateId: body.preferredCandidateId,
      comparedCandidateIds: body.comparedCandidateIds.slice(),
      reasons: reasons.slice(),
      note: note.trim(),
    };
    const replaced = activeFeedback(events).find(
      (e) => e.observationKey === record.observationKey,
    );
    if (replaced) record.replacesId = replaced.id;
    events.push(record);
    this.write(events);
    return this.view(record, events);
  }
  withdraw(body) {
    return this.locked(() => this.withdrawLocked(body));
  }
  withdrawLocked(body) {
    keys(body, ["submissionId", "feedbackId"]);
    uuid(body.submissionId);
    uuid(body.feedbackId);
    const events = this.read(),
      inputHash = digest(body),
      previous = events.find((e) => e.id === body.submissionId);
    if (previous) {
      if (previous.inputHash !== inputHash)
        invalid("Submission identity was already used.", 409);
      return { success: true };
    }
    if (
      !events.some((e) => e.id === body.feedbackId && e.kind === "preference")
    )
      invalid("Feedback record not found.", 404);
    events.push({
      id: body.submissionId,
      inputHash,
      kind: "withdraw",
      feedbackId: body.feedbackId,
      source: "studio_browser",
      recordedAt: new Date().toISOString(),
    });
    this.write(events);
    return { success: true };
  }
  view(record, events) {
    return {
      ...record,
      active: activeFeedback(events).some((e) => e.id === record.id),
    };
  }
  history() {
    const events = this.read();
    return {
      version: "eme-design-feedback.v1",
      activeCount: activeFeedback(events).length,
      revision: digest(events),
      reasons: REASONS,
      records: events
        .filter((e) => e.kind === "preference")
        .slice(-50)
        .reverse()
        .map((e) => this.view(e, events)),
    };
  }
  summary() {
    const events = this.read();
    return {
      activeFeedbackCount: activeFeedback(events).length,
      revision: digest(events),
      source: "explicit Studio browser feedback",
    };
  }
  export() {
    const events = this.read(),
      active = activeFeedback(events);
    return {
      version: "eme-design-training-export.v1",
      evidenceStage: "static_preview",
      feedbackRevision: digest(events),
      samples: active.map((e) => ({
        feedbackId: e.id,
        projectId: e.projectId,
        setId: e.setId,
        designVersion: e.designVersion,
        brief: e.brief,
        candidates: e.candidates,
        preferredCandidateId: e.preferredCandidateId,
        comparedCandidateIds: e.comparedCandidateIds,
        reasons: e.reasons,
        note: e.note,
        source: e.source,
        evidenceStage: e.evidenceStage,
        motionReviewedCandidateIds: e.motionReviewedCandidateIds || [],
      })),
      splitPolicy:
        "Split by source project before training/evaluation; this export does not assign a split or certify aesthetic quality.",
    };
  }
}
module.exports = { DesignFeedbackStore, REASONS };
