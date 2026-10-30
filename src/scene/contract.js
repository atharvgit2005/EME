const { validateObject } = require("../engine/validator.js");
const { digest, jsonValue } = require("../creative/execution-record.js");
const schema = require("../../schema/eme-scene.v1.schema.json");
const TICKS = 120000;
function rationalTick(value, timeBase, origin) {
  if (typeof timeBase !== "string" || !/^[1-9][0-9]*\/[1-9][0-9]*$/.test(timeBase) ||
      ![value, origin].every(v => ((typeof v === "string" && /^-?[0-9]+$/.test(v)) || (typeof v === "number" && Number.isSafeInteger(v)))))
    throw Error("ERR_SCENE_TIMEBASE");
  const [n, d] = timeBase.split("/").map(BigInt);
  const raw = (BigInt(value) - BigInt(origin)) * n * BigInt(TICKS);
  if (raw < 0n) throw Error("ERR_SCENE_NEGATIVE_PTS");
  const tick = (raw + d / 2n) / d;
  if (tick > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("ERR_SCENE_TIME_OVERFLOW");
  return Number(tick);
}

function assertScene(
  doc,
  {
    expectedSourceSha256,
    expectedRequestFingerprint,
    allowFixture = false,
  } = {},
) {
  jsonValue(doc);
  const errors = validateObject(doc, schema, schema);
  if (errors.length) throw Error("ERR_SCENE_CONTRACT: " + errors.join("; "));
  const { analysisId, ...payload } = doc;
  if (analysisId !== digest(payload))
    throw Error("ERR_SCENE_INTEGRITY: Content hash mismatch");
  if (expectedSourceSha256 && doc.source.sha256 !== expectedSourceSha256)
    throw Error("ERR_SCENE_STALE_SOURCE");
  if (
    expectedRequestFingerprint &&
    doc.requestFingerprint !== expectedRequestFingerprint
  )
    throw Error("ERR_SCENE_STALE_REQUEST");
  if (doc.producer.origin === "synthetic_fixture" && !allowFixture)
    throw Error("ERR_SCENE_FIXTURE_NOT_PRODUCTION");
  const { width, height, startTick, endTick } = doc.source;
  if (![startTick, endTick].every(Number.isSafeInteger) || endTick <= startTick)
    throw Error("ERR_SCENE_TIME_OVERFLOW");
  const bounds = (b) => {
    if (b && (b.x + b.width > width + 0.01 || b.y + b.height > height + 0.01))
      throw Error("ERR_SCENE_BOUNDS");
  };
  bounds(doc.selection.bounds);
  if (
    doc.capabilities.softMatting !== "unavailable" ||
    doc.capabilities.depth !== "unavailable" ||
    doc.capabilities.surfaceNormals !== "unavailable" ||
    doc.capabilities.gaze !== "unavailable"
  )
    throw Error("ERR_SCENE_UNSUPPORTED_CAPABILITY");
  const artifacts = new Map();
  for (const a of doc.artifacts) {
    const { id, ...binding } = a;
    if (id !== digest(binding) || artifacts.has(a.id))
      throw Error("ERR_SCENE_ARTIFACT_ID");
    artifacts.set(a.id, a);
  }
  let next = startTick,
    previousIndex = -1, previousPts = null, previousShot = null;
  for (const f of doc.frames) {
    if (
      !Number.isSafeInteger(f.endTick) ||
      f.tick !== next ||
      f.endTick <= f.tick ||
      f.endTick > endTick ||
      f.frameIndex !== previousIndex + 1 ||
      f.tick !==
        rationalTick(f.sourcePts, doc.source.timeBase, doc.source.ptsOrigin)
    )
      throw Error("ERR_SCENE_COVERAGE");
    if (previousPts !== null && BigInt(f.sourcePts) <= previousPts)
      throw Error("ERR_SCENE_NONMONOTONIC_PTS");
    if (previousShot !== null && f.shotId !== previousShot && f.visibility !== "cut")
      throw Error("ERR_SCENE_SHOT_BOUNDARY");
    if (f.visibility === "cut" && f.predictedBounds !== null)
      throw Error("ERR_SCENE_PREDICTION_ACROSS_CUT");
    previousPts = BigInt(f.sourcePts); previousShot = f.shotId;
    next = f.endTick;
    previousIndex = f.frameIndex;
    bounds(f.predictedBounds);
    if (f.visibility === "visible") {
      if (!f.observed) throw Error("ERR_SCENE_VISIBLE_WITHOUT_OBSERVATION");
      bounds(f.observed.bounds);
      const a = artifacts.get(f.observed.maskId);
      if (
        !a ||
        a.frameIndex !== f.frameIndex ||
        a.width !== doc.proxy.width ||
        a.height !== doc.proxy.height
      )
        throw Error("ERR_SCENE_MASK_BINDING");
    } else if (f.observed !== null)
      throw Error("ERR_SCENE_FABRICATED_OBSERVATION");
  }
  if (
    next !== endTick ||
    doc.metrics.frameCount !== doc.frames.length ||
    doc.metrics.unobservedFrames !==
      doc.frames.filter((f) => !f.observed).length ||
    doc.metrics.flowFrames !==
      doc.frames.filter((f) => f.observed?.method === "flow").length
  )
    throw Error("ERR_SCENE_COVERAGE");
  if (
    Math.abs(doc.proxy.scaleX - width / doc.proxy.width) > 1e-8 ||
    Math.abs(doc.proxy.scaleY - height / doc.proxy.height) > 1e-8
  )
    throw Error("ERR_SCENE_COORDINATES");
  return doc;
}
function sealScene(payload) {
  const doc = { ...payload, analysisId: digest(payload) };
  return assertScene(doc, {
    allowFixture: payload.producer.origin === "synthetic_fixture",
  });
}
function queryScene(
  doc,
  {
    startTick = doc.source.startTick,
    endTick = doc.source.endTick,
    requireVisible = false,
  } = {},
) {
  assertScene(doc);
  if (
    !Number.isSafeInteger(startTick) ||
    !Number.isSafeInteger(endTick) ||
    startTick < doc.source.startTick ||
    endTick > doc.source.endTick ||
    endTick <= startTick
  )
    throw Error("ERR_SCENE_QUERY_RANGE");
  const frames = doc.frames.filter(
    (f) => f.tick < endTick && f.endTick > startTick,
  );
  const missing = frames
    .filter((f) => !f.observed)
    .map((f) => ({
      startTick: Math.max(startTick, f.tick),
      endTick: Math.min(endTick, f.endTick),
      visibility: f.visibility,
    }));
  return {
    analysisId: doc.analysisId,
    sourceSha256: doc.source.sha256,
    trackId: doc.selection.trackId,
    startTick,
    endTick,
    status:
      requireVisible && missing.length ? "insufficient_evidence" : "available",
    completeVisibleCoverage: missing.length === 0,
    coverage: temporalCoverage(frames, startTick, endTick),
    missing,
    frames,
  };
}
function temporalCoverage(frames, startTick, endTick) {
  let observedTicks = 0, gap = 0, longestGapTicks = 0;
  for (const f of frames) {
    const duration = Math.min(endTick, f.endTick) - Math.max(startTick, f.tick);
    if (f.observed) { observedTicks += duration; gap = 0; }
    else { gap += duration; longestGapTicks = Math.max(longestGapTicks, gap); }
  }
  return { observedTicks, totalTicks: endTick - startTick,
    observedRatio: observedTicks / (endTick - startTick), longestGapTicks };
}
module.exports = { assertScene, sealScene, queryScene, TICKS, rationalTick };
