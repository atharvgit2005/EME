// Explainable preference adaptation. No visual-quality model or neural weights.
const { PROFILES, VERSION } = require("./catalog.js");
const { digest } = require("../creative/execution-record.js");
const { parameters, buckets } = require("./parameters.js");
const RANK_VERSION = "eme-design-ranker.v2";
const clamp = (v) => Math.min(1, Math.max(0, v));
const round = (v) => Math.round(v * 10000) / 10000;
function features(set, candidate) {
  const { layout, timing } = candidate.report || {};
  const canvas = set.canvas;
  if (
    !canvas ||
    !layout?.elements?.length ||
    !Object.hasOwn(PROFILES, candidate.profileId)
  )
    throw Error("Missing measured design evidence.");
  const finite = (values) =>
    values.every((v) => typeof v === "number" && Number.isFinite(v));
  if (
    !finite([
      canvas.width,
      canvas.height,
      layout.minimumFontPx,
      layout.marginPx,
      timing?.holdTicks,
      timing?.readingSeconds,
      timing?.travel,
    ]) ||
    canvas.width <= 0 ||
    canvas.height <= 0 ||
    layout.minimumFontPx <= 0 ||
    layout.marginPx < 0 ||
    timing.travel < 0 ||
    timing.readingSeconds <= 0 ||
    timing.holdTicks < Math.ceil(timing.readingSeconds * 120000)
  )
    throw Error("Reading-time or layout evidence is invalid.");
  for (const e of layout.elements) {
    const b = e.bounds;
    if (
      !b ||
      !finite([e.fontSize, b.x, b.y, b.width, b.height]) ||
      e.fontSize < layout.minimumFontPx ||
      b.width <= 0 ||
      b.height <= 0 ||
      b.x < layout.marginPx ||
      b.y < 0 ||
      b.x + b.width > canvas.width - layout.marginPx ||
      b.y + b.height > canvas.height
    )
      throw Error("Measured text does not fit the readable bounds.");
  }
  const readingReserve = clamp(
    timing.holdTicks / (timing.readingSeconds * 120000) - 1,
  );
  const typeComfort = clamp(
    (Math.min(...layout.elements.map((e) => e.fontSize)) /
      layout.minimumFontPx -
      1) /
      0.75,
  );
  const motionRestraint =
    1 - clamp(timing.travel / Math.min(canvas.width, canvas.height) / 0.04);
  return {
    profileId: candidate.profileId,
    parameters: parameters(candidate.report?.parameters),
    parameterBuckets: buckets(candidate.report?.parameters),
    recipe: set.brief.recipe,
    aspect:
      canvas.width > canvas.height
        ? "landscape"
        : canvas.width < canvas.height
          ? "portrait"
          : "square",
    readingReserve: round(readingReserve),
    typeComfort: round(typeComfort),
    motionRestraint: round(motionRestraint),
    baselineScore: round(
      0.45 * readingReserve + 0.35 * typeComfort + 0.2 * motionRestraint,
    ),
  };
}
function activeFeedback(events) {
  const latest = new Map(),
    withdrawn = new Set(
      events.filter((e) => e.kind === "withdraw").map((e) => e.feedbackId),
    );
  for (const e of events)
    if (e.kind === "preference") latest.set(e.observationKey, e);
  return [...latest.values()].filter((e) => !withdrawn.has(e.id));
}
function rankDesigns(set, events = [], excluded = {}) {
  const rows = [],
    active = activeFeedback(events).filter(
      (e) => e.designVersion === set.version,
    );
  for (const c of set.candidates) {
    let f;
    try {
      if (excluded[c.id]) throw Error(excluded[c.id]);
      if (
        active.some(
          (e) =>
            e.preferredCandidateId === null &&
            e.comparedCandidateIds.includes(c.id),
        )
      )
        throw Error(
          "You marked this design as unsuitable. Correct or retract that feedback to reconsider it.",
        );
      f = features(set, c);
    } catch (error) {
      rows.push({ candidateId: c.id, eligible: false, reason: error.message });
      continue;
    }
    let wins = 0,
      losses = 0,
      localObservations = 0,
      relatedObservations = 0;
    const parameterEvidence = Object.fromEntries(
      Object.keys(f.parameters).map((k) => [
        k,
        {
          bucket: f.parameterBuckets[k],
          weightedWins: 0,
          weightedLosses: 0,
          observations: 0,
        },
      ]),
    );
    for (const event of active) {
      const preferred = event.candidates.find(
        (s) => s.id === event.preferredCandidateId,
      );
      const compared = event.candidates.filter((s) =>
        event.comparedCandidateIds.includes(s.id),
      );
      const sample = preferred || compared[0];
      if (!sample) continue;
      const sameRecipe = sample.features.recipe === f.recipe,
        sameAspect = sample.features.aspect === f.aspect;
      const weight = sameRecipe && sameAspect ? 1 : sameRecipe ? 0.5 : 0.25;
      // Only explicitly compared alternatives contribute losses. Unselected siblings do not.
      const won =
        preferred?.features.profileId === f.profileId &&
        compared.some((s) => s.features.profileId !== f.profileId);
      const lost =
        compared.some((s) => s.features.profileId === f.profileId) &&
        preferred?.features.profileId !== f.profileId;
      if (won) wins += weight;
      if (lost) losses += weight;
      let contributes = won || lost;
      for (const [key, evidence] of Object.entries(parameterEvidence)) {
        if (!preferred) continue; // A rejection alone does not identify which parameter should change.
        const bucket = (s) =>
          s.features.parameterBuckets?.[key] ||
          buckets(s.features.parameters)[key];
        const reviewed = (s) =>
          key !== "motionScale" ||
          (event.motionReviewedCandidateIds || []).includes(s.id);
        const alternatives = compared.filter(
          (s) => reviewed(s) && (!preferred || reviewed(preferred)),
        );
        const pWon =
          preferred &&
          reviewed(preferred) &&
          bucket(preferred) === evidence.bucket &&
          alternatives.some((s) => bucket(s) !== evidence.bucket);
        const pLost =
          alternatives.some((s) => bucket(s) === evidence.bucket) &&
          (!preferred || bucket(preferred) !== evidence.bucket);
        if (pWon) evidence.weightedWins += weight;
        if (pLost) evidence.weightedLosses += weight;
        if (pWon || pLost) {
          evidence.observations++;
          contributes = true;
        }
      }
      if (contributes) {
        if (sameRecipe && sameAspect) localObservations++;
        else relatedObservations++;
      }
    }
    const profilePreferenceScore = (2 + wins) / (4 + wins + losses);
    const parameterRows = Object.values(parameterEvidence).filter(
      (e) => e.observations,
    );
    const mass = parameterRows.reduce(
      (n, e) => n + e.weightedWins + e.weightedLosses,
      0,
    );
    const parameterPreferenceScore = mass
      ? parameterRows.reduce(
          (sum, e) =>
            sum +
            ((e.weightedWins + e.weightedLosses) * (2 + e.weightedWins)) /
              (4 + e.weightedWins + e.weightedLosses),
          0,
        ) / mass
      : 0.5;
    let profileWeight = (0.6 * (wins + losses)) / (4 + wins + losses),
      parameterWeight = (0.6 * mass) / (4 + mass);
    if (profileWeight + parameterWeight > 0.6) {
      const factor = 0.6 / (profileWeight + parameterWeight);
      profileWeight *= factor;
      parameterWeight *= factor;
    }
    const historyWeight = profileWeight + parameterWeight;
    const preferenceScore = historyWeight
      ? (profileWeight * profilePreferenceScore +
          parameterWeight * parameterPreferenceScore) /
        historyWeight
      : 0.5;
    const score =
      (1 - historyWeight) * f.baselineScore + historyWeight * preferenceScore;
    const reasons = [
      "Fits measured text and minimum static reading time.",
      `Reading reserve ${(100 * f.readingReserve).toFixed(0)}%; type-size and motion heuristics also contribute.`,
    ];
    if (historyWeight)
      reasons.push(
        `Uses ${localObservations} matching and ${relatedObservations} related explicit feedback observations; historical feedback has ${(historyWeight * 100).toFixed(0)}% weight.`,
      );
    else
      reasons.push(
        "Starting recommendation uses measured rules; no relevant preference feedback yet.",
      );
    if (set.brief.preferredProfile === c.profileId)
      reasons.unshift("Matches the style explicitly requested for this brief.");
    rows.push({
      candidateId: c.id,
      eligible: true,
      features: f,
      baselineScore: f.baselineScore,
      preferenceScore: round(preferenceScore),
      profilePreferenceScore: round(profilePreferenceScore),
      parameterPreferenceScore: round(parameterPreferenceScore),
      profileWeight: round(profileWeight),
      parameterWeight: round(parameterWeight),
      parameterEvidence,
      historyWeight: round(historyWeight),
      score: round(score),
      evidence: {
        localObservations,
        relatedObservations,
        weightedWins: round(wins),
        weightedLosses: round(losses),
      },
      reasons,
    });
  }
  const eligible = rows
    .filter((r) => r.eligible)
    .sort((a, b) => {
      const match = (row) =>
        set.candidates.find((c) => c.id === row.candidateId)?.profileId ===
        set.brief.preferredProfile
          ? 1
          : 0;
      return (
        match(b) - match(a) ||
        b.score - a.score ||
        a.candidateId.localeCompare(b.candidateId)
      );
    });
  for (const [i, row] of eligible.entries()) row.rank = i + 1;
  return {
    version: RANK_VERSION,
    designVersion: VERSION,
    recommendedCandidateId: eligible[0]?.candidateId || null,
    basis: eligible.some((r) => r.historyWeight > 0)
      ? "rules_and_local_preferences"
      : "measured_rules",
    feedbackRevision: digest(events),
    activeFeedbackCount: active.length,
    notice:
      "Recommendations estimate fit and local preference. Scores are not probabilities or independent aesthetic judgments.",
    candidates: [...eligible, ...rows.filter((r) => !r.eligible)],
  };
}
module.exports = { RANK_VERSION, features, activeFeedback, rankDesigns };
