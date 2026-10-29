/**
 * Editing Mechanics Engine (EME) - Phase PF-07 + A2 Integration Test Battery
 * Musical Structure Intelligence in Candidate Generation & Evidence-Based Comparison
 *
 * Verifies:
 * - PF07-A2.1: Flagship Certification: 3 musical-structure-aware candidates generated, scored, and ranked.
 * - PF07-A2.2: Hard Gate Precedence (Render Failure): disqualifies failing candidate with score 0 before musical ranking.
 * - PF07-A2.3: Hard Gate Precedence (Semantic Violation): intent violation disqualifies candidate from selection.
 * - PF07-A2.4: Explicit Constraint Precedence: mandatory user constraints strictly outrank musical boundaries.
 * - PF07-A2.5: Source Audio Hash Mismatch: rejects mismatched sidecar and activates deterministic fallback.
 * - PF07-A2.6: High Ambiguity & Unsupported Meter Fallback: activates deterministic baseline fallback.
 * - PF07-A2.7: Malformed Sidecar Schema Rejection: fail-safe schema rejection triggers deterministic fallback.
 * - PF07-A2.8: Deterministic Tie-Breaking & Ranking: multi-stage ladder breaks ties deterministically.
 * - PF07-A2.9: Selection Provenance & Manifest Binding: binds selected candidate to manifest, rank, and delivery run.
 * - PF07-A2.10: Plan & Score Determinism: identical inputs yield identical plan hashes and rankings.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  BriefValidator,
  OperationPlanCompiler,
  PromptDeliverableOrchestrator,
  CandidateVariantCompiler,
  CandidateOrchestrator,
  MusicalStructureAdapter,
  CandidateMusicalScorer
} = require('../src/prompt-core/index.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/pf07-a2-test-deliverables');

// Helper to ensure clean synthetic media for test runs
function setupTestMedia() {
  fs.mkdirSync(TEST_OUT_DIR, { recursive: true });
  const cleanMp4Path = path.join(TEST_OUT_DIR, 'clean-12s.mp4');

  if (!fs.existsSync(cleanMp4Path)) {
    spawnSync('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=12',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=12:sample_rate=48000',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      cleanMp4Path
    ], { stdio: 'ignore' });
  }

  return cleanMp4Path;
}

// Helper to generate a valid eme-musical-structure.v1 sidecar fixture
function createMockMusicalStructure({
  sha256 = '5555555555555555555555555555555555555555555555555555555555555555',
  durationTicks = 1440000,
  meter = '4/4',
  meterConfidence = 0.95,
  isAmbiguous = false,
  hasHighAmbiguity = false
} = {}) {
  const structureId = `sha256:${crypto.createHash('sha256').update(`test-${sha256}-${meter}-${durationTicks}`).digest('hex')}`;
  const barDurationTicks = 240000; // 2s at 120bpm
  const numBars = Math.floor(durationTicks / barDurationTicks);
  const bars = [];
  for (let i = 0; i < numBars; i++) {
    bars.push({
      barIndex: i,
      startTicks: i * barDurationTicks,
      endTicks: (i + 1) * barDurationTicks,
      downbeatTicks: i * barDurationTicks,
      beatsCount: 4,
      confidence: 0.92
    });
  }

  const phraseDurationTicks = 480000; // 4s (2 bars per phrase)
  const numPhrases = Math.floor(durationTicks / phraseDurationTicks);
  const phrases = [];
  for (let i = 0; i < numPhrases; i++) {
    phrases.push({
      phraseIndex: i,
      startTicks: i * phraseDurationTicks,
      endTicks: (i + 1) * phraseDurationTicks,
      barsCount: 2,
      confidence: 0.90,
      cadenceStrength: 0.85
    });
  }

  const sections = [
    {
      id: 'sec-intro',
      sectionIndex: 0,
      type: 'intro',
      startTicks: 0,
      endTicks: 480000,
      confidence: 0.88,
      uncertaintyState: 'clear'
    },
    {
      id: 'sec-verse',
      sectionIndex: 1,
      type: 'verse',
      startTicks: 480000,
      endTicks: 1440000,
      confidence: 0.85,
      uncertaintyState: 'clear'
    }
  ];

  return {
    schemaVersion: 'eme-musical-structure.v1',
    structureId,
    source: {
      sha256,
      sampleRate: 44100,
      channels: 2,
      durationSamples: Math.round((durationTicks / 120000) * 44100),
      durationTicks
    },
    config: {
      algorithmVersion: '1.0.0',
      ticksPerSecond: 120000,
      endpointConvention: 'half-open',
      fftSize: 2048,
      hopLength: 512
    },
    meter: {
      classification: meter,
      numerator: 4,
      denominator: 4,
      confidence: meterConfidence,
      isAmbiguous,
      phaseOffsetBeats: 0,
      reasons: ['Strong downbeat periodicity at 120 BPM']
    },
    bars,
    phrases,
    sections,
    ambiguity: {
      hasHighAmbiguity,
      isSparse: false,
      isRubato: false,
      notes: []
    }
  };
}

const FLAGSHIP_PROMPT = `Generate three different editing styles for this 12-second vertical video. Keep the original clip order, soundtrack, headline wording, title interval, B-roll interval, and total duration unchanged. Vary pacing and transition style only. Verify each candidate and let me choose one.`;

test('PF07-A2.1 Flagship Certification: 3 Musical-Structure-Aware Candidates Generated, Scored & Ranked', (t) => {
  setupTestMedia();
  const musicalStructure = createMockMusicalStructure();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    musicalStructure,
    outputDir: TEST_OUT_DIR
  });

  // 1. Schema Conformance
  const val = BriefValidator.validateCandidateSet(csetDoc);
  assert.equal(val.valid, true, `CandidateSet schema errors: ${val.errors?.join(', ')}`);

  // 2. Candidate Count & Status
  assert.equal(csetDoc.candidates.length, 3);
  assert.equal(csetDoc.status, 'ready');

  // 3. Musical Structure Adapter Metadata
  assert.ok(csetDoc.adapted_musical_structure);
  assert.equal(csetDoc.adapted_musical_structure.fallback_active, false);
  assert.equal(csetDoc.adapted_musical_structure.accepted_events_count.downbeats, 6);
  assert.equal(csetDoc.adapted_musical_structure.accepted_events_count.phrases, 3);
  assert.equal(csetDoc.adapted_musical_structure.accepted_events_count.sections, 2);

  // 4. Candidates have valid verification, deliverable & musical alignment scores
  for (const cand of csetDoc.candidates) {
    assert.equal(cand.status, 'verified');
    assert.equal(cand.execution.status, 'committed');
    assert.ok(cand.deliverable?.manifest_path);
    assert.ok(cand.qa_summary?.score >= 80);

    // Musical alignment scorecard
    assert.ok(cand.musical_alignment);
    assert.equal(cand.musical_alignment.scorer_version, '1.0.0');
    assert.equal(cand.musical_alignment.hard_gates_passed, true);
    assert.ok(cand.musical_alignment.musical_score > 0);
    assert.ok(cand.musical_alignment.composite_score > 0);
    assert.ok(typeof cand.musical_alignment.rank === 'number');
    assert.equal(cand.musical_alignment.eligible_for_selection, true);
    assert.ok(cand.musical_alignment.explanation.includes(cand.candidate_id));
  }

  // 5. Comparison Matrix contains musical scores and ranks
  assert.equal(csetDoc.comparison_matrix.length, 3);
  for (const row of csetDoc.comparison_matrix) {
    assert.ok(typeof row.musical_score === 'number');
    assert.ok(typeof row.total_score === 'number');
    assert.ok(typeof row.rank === 'number');
  }

  // Check ranks are unique (1, 2, 3)
  const ranks = csetDoc.comparison_matrix.map(r => r.rank).sort();
  assert.deepEqual(ranks, [1, 2, 3]);
});

test('PF07-A2.2 Hard Gate Precedence: Disqualifies Render Error Candidate Before Musical Scoring', (t) => {
  setupTestMedia();
  const musicalStructure = createMockMusicalStructure();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    musicalStructure,
    outputDir: TEST_OUT_DIR,
    options: {
      simulateRenderFailForCandidate: 'cand-cinematic'
    }
  });

  assert.equal(csetDoc.status, 'partially_verified');

  const candCinematic = csetDoc.candidates.find(c => c.candidate_id === 'cand-cinematic');
  assert.equal(candCinematic.status, 'failed');
  assert.equal(candCinematic.deliverable, null);
  // Disqualified with score 0
  assert.equal(candCinematic.musical_alignment.hard_gates_passed, false);
  assert.equal(candCinematic.musical_alignment.musical_score, 0.0);
  assert.equal(candCinematic.musical_alignment.composite_score, 0.0);
  assert.equal(candCinematic.musical_alignment.rank, null);
  assert.equal(candCinematic.musical_alignment.eligible_for_selection, false);

  // Passing siblings remain ranked
  const candDynamic = csetDoc.candidates.find(c => c.candidate_id === 'cand-dynamic');
  assert.equal(candDynamic.status, 'verified');
  assert.equal(candDynamic.musical_alignment.hard_gates_passed, true);
  assert.ok(candDynamic.musical_alignment.rank === 1 || candDynamic.musical_alignment.rank === 2);

  const candEditorial = csetDoc.candidates.find(c => c.candidate_id === 'cand-editorial');
  assert.equal(candEditorial.status, 'verified');
  assert.equal(candEditorial.musical_alignment.hard_gates_passed, true);
});

test('PF07-A2.3 Hard Gate Precedence: Semantic Violation Disqualifies Candidate from Selection', (t) => {
  setupTestMedia();
  const musicalStructure = createMockMusicalStructure();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    musicalStructure,
    outputDir: TEST_OUT_DIR,
    options: {
      injectSemanticViolationForCandidate: 'cand-dynamic'
    }
  });

  const candDynamic = csetDoc.candidates.find(c => c.candidate_id === 'cand-dynamic');
  assert.equal(candDynamic.status, 'failed');
  assert.equal(candDynamic.semantic_verification.status, 'failed');
  assert.equal(candDynamic.musical_alignment.hard_gates_passed, false);
  assert.equal(candDynamic.musical_alignment.rank, null);
  assert.equal(candDynamic.musical_alignment.eligible_for_selection, false);

  // Cannot select disqualified candidate
  const selRes = CandidateOrchestrator.selectCandidate({
    candidateSetDoc: csetDoc,
    candidateId: 'cand-dynamic',
    outputDir: TEST_OUT_DIR
  });
  assert.equal(selRes.success, false);
  assert.ok(selRes.error.includes('Cannot select unverified or failed candidate'));
});

test('PF07-A2.4 Explicit Constraint Precedence: Mandatory Invariants Strictly Outrank Musical Boundaries', (t) => {
  setupTestMedia();
  const musicalStructure = createMockMusicalStructure();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    musicalStructure,
    outputDir: TEST_OUT_DIR
  });

  for (const cand of csetDoc.candidates) {
    // Invariant 1: Total duration exactly 1,440,000 ticks
    assert.equal(cand.plan_summary.target_duration_ticks, 1440000);

    // Invariant 2: Semantic verification criteria all passed
    const semCriteria = cand.semantic_verification.criteria;
    assert.equal(semCriteria.find(c => c.criterion_id === 'CRIT_TIMELINE_DURATION').status, 'passed');
    assert.equal(semCriteria.find(c => c.criterion_id === 'CRIT_CLIP_ORDER').status, 'passed');
    assert.equal(semCriteria.find(c => c.criterion_id === 'CRIT_BROLL_INTERVAL').status, 'passed');
    assert.equal(semCriteria.find(c => c.criterion_id === 'CRIT_TITLE_OVERLAY').status, 'passed');
  }
});

test('PF07-A2.5 Source Audio Hash Mismatch: Rejects Mismatched Sidecar and Triggers Fallback', (t) => {
  setupTestMedia();
  // Project audio asset sha256 is 5555555555555555555555555555555555555555555555555555555555555555
  // Provide a mismatched hash
  const mismatchedStructure = createMockMusicalStructure({
    sha256: '9999999999999999999999999999999999999999999999999999999999999999'
  });

  const adapted = MusicalStructureAdapter.adapt({
    musicalStructure: mismatchedStructure,
    project: scenario1Project
  });

  assert.equal(adapted.isValid, false);
  assert.equal(adapted.fallbackActive, true);
  assert.ok(adapted.reasons.includes('ERR_SOURCE_HASH_MISMATCH'));

  // Generating candidates with mismatched sidecar still succeeds via baseline fallback
  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    musicalStructure: mismatchedStructure,
    outputDir: TEST_OUT_DIR
  });

  assert.equal(csetDoc.status, 'ready');
  assert.equal(csetDoc.adapted_musical_structure.fallback_active, true);
  assert.ok(csetDoc.adapted_musical_structure.reasons.includes('ERR_SOURCE_HASH_MISMATCH'));
});

test('PF07-A2.6 High Ambiguity & Unsupported Meter Fallback', (t) => {
  // Test A: High ambiguity flag
  const ambiguousStructure = createMockMusicalStructure({ hasHighAmbiguity: true });
  const adaptedA = MusicalStructureAdapter.adapt({
    musicalStructure: ambiguousStructure,
    project: scenario1Project
  });
  assert.equal(adaptedA.fallbackActive, true);
  assert.ok(adaptedA.reasons.includes('high_ambiguity'));

  // Test B: Unsupported meter (e.g. compound 6/8 classified as unsupported)
  const unsupportedMeterStructure = createMockMusicalStructure({ meter: 'unsupported' });
  const adaptedB = MusicalStructureAdapter.adapt({
    musicalStructure: unsupportedMeterStructure,
    project: scenario1Project
  });
  assert.equal(adaptedB.fallbackActive, true);
  assert.ok(adaptedB.reasons.includes('unsupported_meter'));

  // Test C: Low meter confidence
  const lowConfStructure = createMockMusicalStructure({ meterConfidence: 0.35 });
  const adaptedC = MusicalStructureAdapter.adapt({
    musicalStructure: lowConfStructure,
    project: scenario1Project
  });
  assert.equal(adaptedC.fallbackActive, true);
  assert.ok(adaptedC.reasons.includes('low_meter_confidence'));
});

test('PF07-A2.7 Malformed Sidecar Schema Rejection', (t) => {
  const malformed = {
    schemaVersion: 'eme-musical-structure.v1',
    structureId: 'invalid-id-without-sha256-prefix'
  };

  const adapted = MusicalStructureAdapter.adapt({
    musicalStructure: malformed,
    project: scenario1Project
  });

  assert.equal(adapted.isValid, false);
  assert.equal(adapted.fallbackActive, true);
  assert.ok(adapted.reasons.includes('invalid_schema'));
});

test('PF07-A2.8 Deterministic Tie-Breaking & Ranking Correctness', (t) => {
  const candidates = [
    {
      candidate_id: 'cand-editorial',
      variation_profile: { name: 'editorial' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 95 },
      semantic_verification: { status: 'verified', criteria: [{ status: 'passed' }] },
      status: 'verified',
      _executedProject: { clips: [] }
    },
    {
      candidate_id: 'cand-dynamic',
      variation_profile: { name: 'dynamic' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 95 },
      semantic_verification: { status: 'verified', criteria: [{ status: 'passed' }] },
      status: 'verified',
      _executedProject: { clips: [] }
    }
  ];

  // Identical scores -> Tie broken by canonical profile order ('dynamic' < 'editorial')
  const scored = CandidateMusicalScorer.scoreAndRankCandidates({
    candidates,
    adaptedStructure: { isValid: true, fallbackActive: true },
    brief: {}
  });

  assert.equal(scored[0].candidate_id, 'cand-dynamic');
  assert.equal(scored[0].rank, 1);
  assert.equal(scored[1].candidate_id, 'cand-editorial');
  assert.equal(scored[1].rank, 2);
});

test('PF07-A2.9 Selection Provenance & Manifest Binding with Musical Alignment', (t) => {
  setupTestMedia();
  const musicalStructure = createMockMusicalStructure();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    musicalStructure,
    outputDir: TEST_OUT_DIR
  });

  // Auto-select top-ranked candidate
  const selRes = CandidateOrchestrator.selectCandidate({
    candidateSetDoc: csetDoc,
    candidateId: 'auto',
    outputDir: TEST_OUT_DIR
  });

  assert.equal(selRes.success, true);
  const selectedId = csetDoc.selection.selected_candidate_id;
  assert.ok(selectedId);
  const selectedCand = csetDoc.candidates.find(c => c.candidate_id === selectedId);
  assert.equal(selectedCand.musical_alignment.rank, 1);
  assert.equal(csetDoc.selection.selected_manifest_id, selectedCand.deliverable.manifest_id);
  assert.ok(csetDoc.selection.selection_provenance.includes('Rank #1'));

  // Emitted delivery run document
  assert.ok(selRes.deliveryRun);
  assert.equal(selRes.deliveryRun.deliverable.manifest_id, selectedCand.deliverable.manifest_id);
  assert.equal(selRes.deliveryRun.deliverable.sha256, selectedCand.deliverable.sha256);
});

test('PF07-A2.10 Plan & Ranking Determinism Across Repeated Invocations', (t) => {
  const musicalStructure = createMockMusicalStructure();
  const brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');
  const profiles = CandidateVariantCompiler.getStandardProfiles();

  for (const profile of profiles) {
    const plan1 = CandidateVariantCompiler.compileCandidatePlan({
      brief,
      project: structuredClone(scenario1Project),
      beatAnalysis: scenario1Beat,
      musicalStructure,
      profile
    });
    const hash1 = OperationPlanCompiler.computePlanHash(plan1);

    const plan2 = CandidateVariantCompiler.compileCandidatePlan({
      brief,
      project: structuredClone(scenario1Project),
      beatAnalysis: scenario1Beat,
      musicalStructure,
      profile
    });
    const hash2 = OperationPlanCompiler.computePlanHash(plan2);

    assert.equal(hash1, hash2, `Plan hash for profile ${profile.id} with musicalStructure must be 100% deterministic`);
  }
});
