const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
const { digest } = require("../src/creative/execution-record.js");
const {
  computeFileSha256BoundedSync: hash,
} = require("../src/prompt-core/job-orchestrator.js");
const { rankDesigns } = require("../src/design/ranking.js");
const { DesignFeedbackStore } = require("../src/design/feedback-store.js");
const { StudioServer } = require("../src/studio/server.js");

// Controlled decision fixtures. Their fake image bytes establish ledger/ranking
// behavior only; tests/design.test.js independently exercises real graphics/export.
function fixture(
  root,
  label = "fixture",
  recipe = "title-card",
  portrait = false,
) {
  const profiles = ["editorial", "balanced", "energetic"];
  const set = {
    id: crypto.randomUUID(),
    version: "eme-design.v1",
    projectId: "test-source-project",
    baseRevision: 0,
    snapshot: digest({ source: "controlled-fixture", label }),
    canvas: { width: portrait ? 540 : 960, height: portrait ? 960 : 540 },
    brief: { recipe, title: label, startTick: 0, durationTicks: 720000 },
    candidates: [],
    failures: [],
  };
  for (const [i, profileId] of profiles.entries()) {
    const dir = path.join(root, set.id, profileId);
    fs.mkdirSync(dir, { recursive: true });
    const glyphPath = path.join(dir, "graphic.png"),
      previewPath = path.join(dir, "preview.png"),
      reportPath = path.join(dir, "design.json");
    fs.writeFileSync(glyphPath, "TEST ONLY graphic " + label + profileId);
    fs.writeFileSync(previewPath, "TEST ONLY preview " + label + profileId);
    const id = digest({ label, profileId, recipe, portrait });
    const report = {
      layout: {
        minimumFontPx: 20,
        marginPx: 30,
        elements: [
          {
            role: "title",
            text: label,
            fontSize: 25 + i * 3,
            bounds: { x: 40, y: 80, width: 300, height: 55 },
          },
        ],
      },
      timing: { holdTicks: 500000, readingSeconds: 2, travel: 4 + i * 5 },
      graphicSha256: hash(glyphPath),
      previewSha256: hash(previewPath),
    };
    fs.writeFileSync(reportPath, JSON.stringify(report));
    set.candidates.push({
      id,
      profileId,
      name: profileId,
      report,
      glyphPath,
      previewPath,
      operations: [
        {
          type: "add_asset",
          params: {
            metadata: {
              design: {
                report: { path: reportPath, sha256: hash(reportPath) },
              },
            },
          },
        },
      ],
    });
  }
  return set;
}
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eme-design-ranking-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, store: new DesignFeedbackStore(path.join(root, "feedback")) };
}
function vote(
  store,
  set,
  profile = "editorial",
  compared = ["balanced", "energetic"],
  extra = {},
) {
  store.register(set);
  return store.submit({
    submissionId: crypto.randomUUID(),
    setId: set.id,
    preferredCandidateId:
      profile === null
        ? null
        : set.candidates.find((c) => c.profileId === profile).id,
    comparedCandidateIds: set.candidates
      .filter((c) => compared.includes(c.profileId))
      .map((c) => c.id),
    reasons: ["typography"],
    note: "Controlled automated preference fixture",
    ...extra,
  });
}
test("Cold-start ranking is deterministic, explained and independent of candidate order", (t) => {
  const { root } = setup(t),
    set = fixture(root),
    rank = rankDesigns(set);
  assert.equal(rank.basis, "measured_rules");
  assert.equal(rank.activeFeedbackCount, 0);
  assert.equal(
    rank.recommendedCandidateId,
    rankDesigns({ ...set, candidates: set.candidates.slice().reverse() })
      .recommendedCandidateId,
  );
  assert.ok(
    rank.candidates.every(
      (c) => c.eligible && c.historyWeight === 0 && c.reasons.length,
    ),
  );
  assert.match(rank.notice, /not probabilities/);
});
test("Explicit comparisons adapt recommendations across unseen briefs and survive reload", (t) => {
  const { root, store } = setup(t);
  for (let i = 0; i < 8; i++) vote(store, fixture(root, "training-" + i));
  const unseen = fixture(root, "unseen-held-out-brief"),
    rank = rankDesigns(unseen, store.read());
  assert.equal(
    unseen.candidates.find((c) => c.id === rank.recommendedCandidateId)
      .profileId,
    "editorial",
  );
  assert.equal(rank.basis, "rules_and_local_preferences");
  assert.equal(rank.candidates[0].evidence.localObservations, 8);
  assert.deepEqual(
    rank,
    rankDesigns(unseen, new DesignFeedbackStore(store.root).read()),
  );
});
test("Uncompared siblings stay neutral; selecting or ranking alone casts no vote", (t) => {
  const { root, store } = setup(t),
    set = fixture(root);
  store.register(set);
  rankDesigns(set, store.read());
  assert.equal(store.read().length, 0);
  vote(store, set, "editorial", ["balanced"]);
  const rank = rankDesigns(set, store.read()),
    energetic = rank.candidates.find(
      (c) => c.candidateId === set.candidates[2].id,
    );
  assert.equal(energetic.preferenceScore, 0.5);
  assert.equal(energetic.historyWeight, 0);
  assert.equal(energetic.evidence.weightedLosses, 0);
});
test("Retries are idempotent; corrected and regenerated comparisons have one active influence", (t) => {
  const { root, store } = setup(t),
    set = fixture(root),
    submissionId = crypto.randomUUID();
  const first = vote(store, set, "editorial", ["balanced"], { submissionId });
  const retry = vote(store, set, "editorial", ["balanced"], { submissionId });
  assert.equal(first.id, retry.id);
  assert.equal(store.read().length, 1);
  assert.throws(
    () => vote(store, set, "balanced", ["editorial"], { submissionId }),
    /already used/,
  );
  const correction = vote(store, set, "balanced", ["editorial"]);
  assert.equal(correction.replacesId, first.id);
  assert.equal(store.history().activeCount, 1);
  const duplicate = { ...set, id: crypto.randomUUID() };
  vote(store, duplicate, "energetic", ["editorial"]);
  assert.equal(store.history().activeCount, 1);
  assert.equal(store.export().samples.length, 1);
});
test("Retraction removes influence without reviving a replaced preference", (t) => {
  const { root, store } = setup(t),
    set = fixture(root);
  vote(store, set);
  const corrected = vote(store, set, "balanced", ["editorial"]);
  const request = {
    submissionId: crypto.randomUUID(),
    feedbackId: corrected.id,
  };
  store.withdraw(request);
  store.withdraw(request);
  assert.equal(store.history().activeCount, 0);
  assert.equal(store.read().length, 3);
  assert.equal(rankDesigns(set, store.read()).basis, "measured_rules");
  assert.equal(store.history().records.length, 2);
});
test("Rejecting compared designs records negative evidence only for those named", (t) => {
  const { root, store } = setup(t),
    set = fixture(root);
  vote(store, set, null, ["editorial"]);
  const rank = rankDesigns(set, store.read());
  assert.equal(
    rank.candidates.find((c) => c.candidateId === set.candidates[0].id)
      .eligible,
    false,
  );
  assert.equal(
    rank.candidates.find((c) => c.candidateId === set.candidates[1].id)
      .historyWeight,
    0,
  );
  assert.equal(store.export().samples[0].preferredCandidateId, null);
  const future = fixture(root, "future-after-rejection");
  assert.equal(
    rankDesigns(future, store.read()).candidates.find(
      (c) => c.candidateId === future.candidates[0].id,
    ).evidence.weightedLosses,
    1,
  );
  const allRejected = vote(store, set, null, [
    "editorial",
    "balanced",
    "energetic",
  ]);
  assert.equal(rankDesigns(set, store.read()).recommendedCandidateId, null);
  store.withdraw({
    submissionId: crypto.randomUUID(),
    feedbackId: allRejected.id,
  });
  assert.ok(rankDesigns(set, store.read()).recommendedCandidateId);
});
test("Recipe/aspect transfer is discounted and explicit style outranks history", (t) => {
  const { root, store } = setup(t);
  for (let i = 0; i < 8; i++) vote(store, fixture(root, "context-" + i));
  const portrait = fixture(root, "portrait", "title-card", true),
    other = fixture(root, "other", "statistic-card");
  const row = (set) =>
    rankDesigns(set, store.read()).candidates.find(
      (c) => c.candidateId === set.candidates[0].id,
    );
  assert.equal(row(portrait).evidence.weightedWins, 4);
  assert.equal(row(other).evidence.weightedWins, 2);
  portrait.brief.preferredProfile = "energetic";
  assert.equal(
    rankDesigns(portrait, store.read()).recommendedCandidateId,
    portrait.candidates[2].id,
  );
});
test("Malformed or unreadable candidates never become eligible through preference history", (t) => {
  const { root, store } = setup(t),
    set = fixture(root);
  vote(store, set);
  const invalid = structuredClone(set);
  invalid.candidates[0].report.timing.holdTicks = 1;
  const rank = rankDesigns(invalid, store.read());
  assert.notEqual(rank.recommendedCandidateId, invalid.candidates[0].id);
  assert.equal(
    rank.candidates.find((c) => c.candidateId === invalid.candidates[0].id)
      .eligible,
    false,
  );
  const excluded = Object.fromEntries(
    set.candidates.map((c) => [c.id, "Changed asset bytes"]),
  );
  assert.equal(
    rankDesigns(set, store.read(), excluded).recommendedCandidateId,
    null,
  );
});
test("Feedback rejects foreign IDs, unsupported authority fields and tampered evidence", (t) => {
  const { root, store } = setup(t),
    set = fixture(root);
  store.register(set);
  assert.throws(
    () => vote(store, set, "editorial", ["balanced"], { source: "human" }),
    /Unsupported/,
  );
  assert.throws(() => vote(store, set, "editorial", []), /at least one/);
  assert.throws(
    () =>
      vote(store, set, "editorial", ["balanced"], {
        preferredCandidateId: "unknown",
      }),
    /Choose/,
  );
  assert.throws(
    () =>
      vote(store, set, "editorial", ["balanced"], {
        reasons: ["typography", "typography"],
      }),
    /reason/,
  );
  fs.appendFileSync(set.candidates[0].previewPath, "changed");
  assert.throws(() => vote(store, set), /changed/);
  assert.equal(store.read().length, 0);
});
test("Corrupted ledgers do not reset history; export carries explicit active evidence without paths", (t) => {
  const { root, store } = setup(t),
    set = fixture(root);
  vote(store, set);
  const exported = store.export();
  assert.equal(exported.samples.length, 1);
  assert.equal(exported.evidenceStage, "static_preview");
  assert.ok(!JSON.stringify(exported).includes(root));
  const payload = JSON.parse(fs.readFileSync(store.file));
  payload.events[0].note = "tampered";
  fs.writeFileSync(store.file, JSON.stringify(payload));
  assert.throws(() => store.history(), /damaged/);
});
test("Browser feedback updates rankings without edits; IDE writes and cross-origin writes fail", async (t) => {
  const { root } = setup(t),
    s = await new StudioServer({
      root: path.join(root, "studio"),
      port: 0,
    }).start();
  t.after(() => s.close());
  const call = async (route, body, agent = false) => {
    const r = await fetch(s.origin + route, {
      method: body === undefined ? "GET" : "POST",
      headers: agent
        ? {
            Authorization: "Bearer " + s.agentToken,
            "Content-Type": "application/json",
          }
        : {
            Origin: s.origin,
            "X-EME-Review": s.csrf,
            "Content-Type": "application/json",
          },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const before = digest(s.project()),
    set = s.planDesign({
      baseRevision: s.project().revision,
      brief: {
        recipe: "title-card",
        title: "Choose thoughtfully",
        startTick: 0,
        durationTicks: 720000,
      },
    });
  const feedback = {
    submissionId: crypto.randomUUID(),
    setId: set.id,
    preferredCandidateId: set.candidates[0].id,
    comparedCandidateIds: [set.candidates[1].id],
    reasons: ["readability"],
    note: "Controlled transport test",
  };
  assert.equal(
    (await call("/api/design/feedback", feedback, true)).status,
    403,
  );
  const cross = await fetch(s.origin + "/api/design/feedback", {
    method: "POST",
    headers: {
      Origin: "https://example.invalid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(feedback),
  });
  assert.equal(cross.status, 403);
  assert.equal(s.designFeedback.read().length, 0);
  const saved = await call("/api/design/feedback", feedback);
  assert.equal(saved.status, 200);
  assert.equal(digest(s.project()), before);
  assert.ok(!s.state.proposal);
  const refreshed = await call(
    "/api/agent/design/rank",
    { setId: set.id },
    true,
  );
  assert.equal(refreshed.body.ranking.activeFeedbackCount, 1);
  assert.equal(
    (await call("/api/design/feedback/export")).body.samples.length,
    1,
  );
  const proposal = s.proposeDesign({
    setId: set.id,
    candidateId: set.candidates[0].id,
    baseRevision: set.baseRevision,
  });
  const sealed = digest(proposal);
  await call("/api/design/feedback", {
    ...feedback,
    submissionId: crypto.randomUUID(),
    preferredCandidateId: set.candidates[1].id,
    comparedCandidateIds: [set.candidates[0].id],
  });
  assert.equal(
    digest(s.state.proposal),
    sealed,
    "Preference changes must not rewrite a sealed proposal",
  );
  await call("/api/reject", { id: proposal.id });
  // The persistent corpus still permits feedback and previews after the short UI list is evicted.
  s.state.designSets = [];
  s.save();
  assert.equal((await call("/api/design/set/" + set.id)).status, 200);
  const preview = await fetch(
    s.origin + saved.body.set.candidates[0].previewUrl,
  );
  assert.equal(preview.status, 200);
  const p = s.project();
  p.revision++;
  fs.writeFileSync(s.projectPath, JSON.stringify(p));
  const historical = await call("/api/design/set/" + set.id);
  assert.equal(historical.body.ranking.recommendedCandidateId, null);
  assert.equal(
    (
      await call("/api/design/feedback", {
        ...feedback,
        submissionId: crypto.randomUUID(),
        note: "Corrected historical feedback",
      })
    ).status,
    200,
  );
});

test("Concurrent feedback writers cannot displace a live ledger owner", (t) => {
  const { root, store } = setup(t),
    set = fixture(root);
  store.register(set);
  const {
    SessionLockCoordinator,
  } = require("../src/prompt-core/session-lock.js");
  const lock = new SessionLockCoordinator({
    lockDir: path.join(store.root, "locks"),
  }).acquireLock("session", "design-feedback");
  try {
    assert.throws(() => vote(store, set), /lock|updated/);
    assert.equal(store.read().length, 0);
  } finally {
    lock.release();
  }
  vote(store, set);
  assert.equal(store.history().activeCount, 1);
});
