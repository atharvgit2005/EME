const test = require("node:test");
const assert = require("node:assert/strict");
const { directEditOperations } = require("../src/studio/direct-edits.js");
const { OperationExecutor } = require("../src/engine/operations.js");
const { digest } = require("../src/creative/execution-record.js");

function project() {
  return {
    id: "direct-editor-test",
    schemaVersion: "1.0.0",
    revision: 12,
    title: "Editing test",
    canvas: { width: 960, height: 540 },
    timebase: {
      fps: { numerator: 30, denominator: 1 },
      ticksPerSecond: 120000,
      durationTicks: 2400000,
      endpointConvention: "half-open",
    },
    assets: [
      {
        id: "source",
        type: "video",
        src: "source.mp4",
        metadata: { duration: 10 },
      },
      {
        id: "source-audio",
        type: "audio",
        src: "audio.wav",
        metadata: { duration: 10 },
      },
    ],
    tracks: [
      { id: "v1", name: "Video 1", kind: "visual", zIndex: 0 },
      { id: "v2", name: "Video 2", kind: "visual", zIndex: 1 },
      { id: "a1", name: "Audio 1", kind: "audio", zIndex: 0 },
      { id: "titles", name: "Titles", kind: "visual", zIndex: 10 },
    ],
    clips: [
      {
        id: "video",
        trackId: "v1",
        type: "video",
        startTick: 120000,
        durationTicks: 360000,
        source: { assetId: "source", trimInTick: 240000, trimOutTick: 600000 },
      },
      {
        id: "audio",
        trackId: "a1",
        type: "audio",
        startTick: 120000,
        durationTicks: 360000,
        source: {
          assetId: "source-audio",
          trimInTick: 240000,
          trimOutTick: 600000,
        },
        audio: { volume: 1 },
      },
      {
        id: "next",
        trackId: "v1",
        type: "video",
        startTick: 600000,
        durationTicks: 120000,
        source: { assetId: "source", trimInTick: 0, trimOutTick: 120000 },
      },
      {
        id: "title",
        trackId: "titles",
        type: "text",
        startTick: 0,
        durationTicks: 120000,
        typography: { text: "Hello", fontSize: 40, color: "#ffffff" },
      },
    ],
  };
}
function request(p, action, extra = {}) {
  return { action, baseRevision: p.revision, clipId: "video", ...extra };
}
function apply(p, ops) {
  let result = p;
  for (const op of ops) {
    const r = OperationExecutor.execute(result, op);
    assert.equal(r.success, true, r.error);
    result = r.project;
  }
  return result;
}
function fractionalTailProject() {
  const p = project();
  p.assets[0].metadata.duration = 12.042708;
  p.assets[1].metadata.duration = 12.032;
  p.clips = p.clips.filter((c) => ["video", "audio"].includes(c.id));
  for (const c of p.clips) {
    c.startTick = 0;
    c.durationTicks = c.id === "video" ? 1445124 : 1443840;
    c.source.trimInTick = 0;
    c.source.trimOutTick = c.durationTicks;
  }
  return p;
}
test("Fractional import tails link real video/audio durations and trim both to a common endpoint", () => {
  const p = fractionalTailProject(),
    before = digest(p);
  const plan = directEditOperations(
    p,
    request(p, "trim_end", { endTick: 1200000 }),
  );
  assert.equal(plan.operations.length, 2);
  assert.equal(digest(p), before);
  const trimmed = apply(p, plan.operations);
  assert.deepEqual(
    trimmed.clips.map((c) => [
      c.startTick,
      c.durationTicks,
      c.source.trimOutTick,
    ]),
    [
      [0, 1200000, 1200000],
      [0, 1200000, 1200000],
    ],
  );
  const start = apply(
    p,
    directEditOperations(p, request(p, "trim_start", { startTick: 120000 }))
      .operations,
  );
  assert.equal(start.clips.length, 2);
  for (const c of start.clips) {
    assert.equal(c.startTick, 120000);
    assert.equal(c.source.trimInTick, 120000);
  }
});
test("Fractional-tail imports split and delete both components, including their unequal right halves", () => {
  const p = fractionalTailProject();
  const splitPlan = directEditOperations(
    p,
    request(p, "split", { atTick: 600000 }),
  );
  assert.equal(splitPlan.operations.length, 2);
  const split = apply(p, splitPlan.operations);
  assert.equal(split.clips.filter((c) => c.startTick === 0).length, 2);
  const right = split.clips.find(
    (c) => c.type === "video" && c.startTick === 600000,
  );
  const audioRight = split.clips.find(
    (c) => c.type === "audio" && c.startTick === 600000,
  );
  assert.equal(right.durationTicks - audioRight.durationTicks, 1284);
  assert.equal(
    directEditOperations(split, request(split, "delete", { clipId: right.id }))
      .operations.length,
    2,
  );
  const trimmed = apply(
    split,
    directEditOperations(
      split,
      request(split, "trim_end", { clipId: right.id, endTick: 1200000 }),
    ).operations,
  );
  assert.deepEqual(
    trimmed.clips
      .filter((c) => c.startTick === 600000)
      .map((c) => [c.durationTicks, c.source.trimInTick, c.source.trimOutTick]),
    [
      [600000, 600000, 1200000],
      [600000, 600000, 1200000],
    ],
  );
  const deleted = apply(
    p,
    directEditOperations(p, request(p, "delete", { clipId: "audio" }))
      .operations,
  );
  assert.equal(deleted.clips.length, 0);
});
test("Tail tolerance never re-links an intentional unlinked trim or combines a greater-than-frame mismatch", () => {
  const p = fractionalTailProject();
  const alone = apply(
    p,
    directEditOperations(
      p,
      request(p, "trim_end", { endTick: 1444000, linked: false }),
    ).operations,
  );
  assert.equal(
    alone.clips.find((c) => c.id === "video").durationTicks,
    1444000,
  );
  assert.equal(
    alone.clips.find((c) => c.id === "audio").durationTicks,
    1443840,
  );
  assert.equal(
    directEditOperations(alone, request(alone, "delete")).operations.length,
    1,
  );
  const mismatched = fractionalTailProject();
  mismatched.assets[0].metadata = { durationTicks: 1448000 };
  mismatched.clips[0].durationTicks = 1448000;
  mismatched.clips[0].source.trimOutTick = 1448000;
  assert.equal(
    directEditOperations(mismatched, request(mismatched, "delete")).operations
      .length,
    1,
  );
  const unknown = fractionalTailProject();
  delete unknown.assets[1].metadata;
  assert.equal(
    directEditOperations(unknown, request(unknown, "delete")).operations.length,
    1,
  );
});
test("Direct edits compile revision-bound proposals without mutating the project", () => {
  const p = project(),
    before = digest(p);
  const plan = directEditOperations(
    p,
    request(p, "move", { startTick: 961111 }),
  );
  assert.equal(digest(p), before);
  assert.equal(plan.operations.length, 2);
  assert.equal(plan.operations[0].params.targetTick, 960000);
  assert.match(plan.summary, /linked source audio/);
  assert.throws(
    () => directEditOperations(p, { action: "delete", clipId: "video" }),
    { status: 409 },
  );
  assert.throws(
    () =>
      directEditOperations(
        p,
        request(p, "delete", { baseRevision: p.revision - 1 }),
      ),
    { status: 409 },
  );
});
test("Linked trims preserve source offsets, may restore proven handles, and keep audio synchronized", () => {
  const p = project();
  const trimmed = apply(
    p,
    directEditOperations(p, request(p, "trim_start", { startTick: 240000 }))
      .operations,
  );
  for (const id of ["video", "audio"]) {
    const c = trimmed.clips.find((c) => c.id === id);
    assert.equal(c.startTick, 240000);
    assert.equal(c.durationTicks, 240000);
    assert.deepEqual(c.source, {
      assetId: id === "video" ? "source" : "source-audio",
      trimInTick: 360000,
      trimOutTick: 600000,
    });
  }
  const restored = apply(
    trimmed,
    directEditOperations(
      trimmed,
      request(trimmed, "trim_start", { startTick: 120000 }),
    ).operations,
  );
  assert.deepEqual(restored.clips, p.clips);
  const end = apply(
    p,
    directEditOperations(p, request(p, "trim_end", { endTick: 360000 }))
      .operations,
  );
  assert.equal(
    end.clips.find((c) => c.id === "video").source.trimOutTick,
    480000,
  );
  assert.equal(end.clips.find((c) => c.id === "audio").durationTicks, 240000);
});
test("Unproven media handles, zero duration and project overflow are rejected before review", () => {
  const p = project();
  assert.throws(
    () => directEditOperations(p, request(p, "trim_end", { endTick: 1320000 })),
    /source footage/,
  );
  assert.throws(
    () => directEditOperations(p, request(p, "trim_end", { endTick: 120000 })),
    /at least one frame/,
  );
  assert.throws(
    () => directEditOperations(p, request(p, "move", { startTick: 2280000 })),
    /project end/,
  );
  p.clips[0].source.trimInTick = 0;
  p.clips[0].source.trimOutTick = 360000;
  assert.throws(
    () =>
      directEditOperations(
        p,
        request(p, "trim_start", { startTick: 0, linked: false }),
      ),
    /source footage/,
  );
  const unknown = project();
  delete unknown.assets[0].metadata;
  delete unknown.assets[1].metadata;
  assert.throws(
    () =>
      directEditOperations(
        unknown,
        request(unknown, "trim_end", { endTick: 484000 }),
      ),
    /source footage/,
  );
});
test("Linked split remains linked for subsequent moves and deletion through either component", () => {
  const p = project();
  const split = apply(
    p,
    directEditOperations(p, request(p, "split", { atTick: 240000 })).operations,
  );
  const right = split.clips.find(
    (c) => c.type === "video" && c.startTick === 240000,
  );
  assert.equal(right.source.trimInTick, 360000);
  assert.equal(right.source.trimOutTick, 600000);
  assert.equal(
    split.clips.find((c) => c.id === "video").source.trimOutTick,
    360000,
  );
  const moved = apply(
    split,
    directEditOperations(
      split,
      request(split, "move", { clipId: right.id, startTick: 960000 }),
    ).operations,
  );
  const a = moved.clips.find(
    (c) => c.type === "audio" && c.startTick === 960000,
  );
  assert.ok(a);
  assert.equal(a.durationTicks, right.durationTicks);
  assert.equal(a.source.trimInTick, right.source.trimInTick);
  const removed = apply(
    moved,
    directEditOperations(moved, request(moved, "delete", { clipId: a.id }))
      .operations,
  );
  assert.equal(
    removed.clips.some((c) => c.id === right.id || c.id === a.id),
    false,
  );
  assert.equal(removed.clips.find((c) => c.id === "next").startTick, 600000);
});
test("Explicit unlinked edits preserve the other component; track destinations preserve media kinds", () => {
  const p = project();
  const moved = apply(
    p,
    directEditOperations(
      p,
      request(p, "move", {
        startTick: 960000,
        targetTrackId: "v2",
        linked: false,
      }),
    ).operations,
  );
  assert.equal(moved.clips.find((c) => c.id === "video").trackId, "v2");
  assert.equal(moved.clips.find((c) => c.id === "audio").startTick, 120000);
  assert.throws(
    () =>
      directEditOperations(
        p,
        request(p, "move", { startTick: 960000, targetTrackId: "a1" }),
      ),
    /compatible destination/,
  );
});
test("Collision and linked-track locks prevent the whole gesture atomically", () => {
  const p = project(),
    before = digest(p);
  assert.throws(
    () => directEditOperations(p, request(p, "move", { startTick: 600000 })),
    /Collision/,
  );
  assert.equal(digest(p), before);
  p.tracks.find((t) => t.id === "a1").locked = true;
  for (const action of ["move", "trim_end", "split", "delete"])
    assert.throws(
      () =>
        directEditOperations(
          p,
          request(p, action, {
            ...(["move"].includes(action) && { startTick: 960000 }),
            ...(["trim_end"].includes(action) && { endTick: 360000 }),
            ...(["split"].includes(action) && { atTick: 240000 }),
          }),
        ),
      /Unlock/,
    );
  p.tracks.find((t) => t.id === "v1").locked = true;
  assert.throws(
    () =>
      directEditOperations(
        p,
        request(p, "properties", { transform: { x: 20 } }),
      ),
    /Unlock/,
  );
  const unlocked = apply(
    p,
    directEditOperations(p, {
      action: "track",
      baseRevision: p.revision,
      trackId: "v1",
      locked: false,
    }).operations,
  );
  assert.equal(unlocked.tracks.find((t) => t.id === "v1").locked, false);
});
test("Properties are limited to native-supported numeric controls and cannot introduce file references", () => {
  const p = project();
  const styled = apply(
    p,
    directEditOperations(
      p,
      request(p, "properties", {
        clipId: "title",
        typography: { text: "Changed", fontSize: 48, color: "#14b8a6" },
        transform: { x: -32, scaleX: 1.2, scaleY: 1.2, opacity: 0.8 },
      }),
    ).operations,
  );
  assert.equal(
    styled.clips.find((c) => c.id === "title").typography.text,
    "Changed",
  );
  const invalid = [
    { transform: { scaleX: 0 } },
    { transform: { rotation: Infinity } },
    { transform: { opacity: 1.1 } },
    { typography: { fontAssetId: "external" } },
    { typography: { text: "" } },
    { typography: { fontSize: 14.5 } },
    { typography: { color: "red" } },
    { audio: { volume: 1 } },
    { transform: { path: "/etc/passwd" } },
  ];
  for (const fields of invalid)
    assert.throws(() =>
      directEditOperations(
        p,
        request(p, "properties", { clipId: "title", ...fields }),
      ),
    );
  assert.throws(
    () =>
      directEditOperations(
        p,
        request(p, "properties", {
          properties: { render_font: { path: "/etc/passwd" } },
        }),
      ),
    /Unsupported edit/,
  );
  const volume = apply(
    p,
    directEditOperations(
      p,
      request(p, "properties", { clipId: "audio", audio: { volume: 0.25 } }),
    ).operations,
  );
  assert.equal(volume.clips.find((c) => c.id === "audio").audio.volume, 0.25);
});
test("Guarded titles remain immutable and block footage edits that would stale their scene proof", () => {
  const p = project();
  p.clips.find((c) => c.id === "title").properties = {
    subject_safe: { required: true },
  };
  for (const [action, fields] of [
    ["move", { startTick: 4000 }],
    ["trim_end", { endTick: 80000 }],
    ["split", { atTick: 40000 }],
    ["properties", { typography: { text: "Unsafe" } }],
  ])
    assert.throws(
      () =>
        directEditOperations(
          p,
          request(p, action, { clipId: "title", ...fields }),
        ),
      /replan/,
    );
  assert.throws(
    () => directEditOperations(p, request(p, "move", { startTick: 960000 })),
    /invalidate/,
  );
  assert.throws(
    () => directEditOperations(p, request(p, "delete")),
    /invalidate/,
  );
  assert.throws(
    () =>
      directEditOperations(p, {
        action: "track",
        baseRevision: p.revision,
        trackId: "v1",
        muted: true,
      }),
    /invalidate/,
  );
  assert.throws(
    () =>
      directEditOperations(p, {
        action: "duration",
        baseRevision: p.revision,
        durationTicks: 1800000,
      }),
    /invalidate/,
  );
  assert.equal(
    directEditOperations(
      p,
      request(p, "properties", { clipId: "audio", audio: { volume: 0.5 } }),
    ).operations.length,
    1,
  );
  const deleted = apply(
    p,
    directEditOperations(p, request(p, "delete", { clipId: "title" }))
      .operations,
  );
  assert.equal(
    deleted.clips.some((c) => c.id === "title"),
    false,
  );
  assert.equal(
    directEditOperations(
      deleted,
      request(deleted, "move", { startTick: 960000 }),
    ).operations.length,
    2,
  );
});
test("Project length and rational frame snapping honor content and integer timing", () => {
  const p = project();
  assert.throws(
    () =>
      directEditOperations(p, {
        action: "duration",
        baseRevision: p.revision,
        durationTicks: 480000,
      }),
    /Trim or remove/,
  );
  assert.throws(
    () =>
      directEditOperations(p, {
        action: "duration",
        baseRevision: p.revision,
        durationTicks: 121 * 120000,
      }),
    /120 seconds/,
  );
  const shortened = apply(
    p,
    directEditOperations(p, {
      action: "duration",
      baseRevision: p.revision,
      durationTicks: 720000,
    }).operations,
  );
  assert.equal(shortened.timebase.durationTicks, 720000);
  p.timebase.fps = { numerator: 30000, denominator: 1001 };
  const plan = directEditOperations(
    p,
    request(p, "move", { startTick: 961000 }),
  );
  assert.equal(plan.operations[0].params.targetTick, 960960);
  assert.throws(
    () => directEditOperations(p, request(p, "move", { startTick: 1.5 })),
    /integer/,
  );
  assert.throws(
    () => directEditOperations(p, request(p, "split", { atTick: 120000 })),
    /inside/,
  );
});
