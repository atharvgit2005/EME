/**
 * Editing Mechanics Engine (EME) - Phase PF-07 Test Battery
 * Candidate Generation & Multi-Variant Exploration
 *
 * Verifies:
 * - PF-07.1: Flagship Certification: 3 candidates generated, rendered, and verified.
 * - PF-07.2: Hard Constraint Preservation: 100% compliance across all variants.
 * - PF-07.3: Candidate Sandbox Isolation: zero cross-candidate contamination.
 * - PF-07.4: Measurable Variation Validity: distinct profiles and measurable properties.
 * - PF-07.5: Failure Isolation (Render Error): failing candidate does not invalidate passing siblings.
 * - PF-07.6: Failure Isolation (Semantic Violation): semantic failure isolated to affected candidate.
 * - PF-07.7: Candidate Selection Provenance: resolves to exact candidate ID & manifest.
 * - PF-07.8: Fail-Closed Selection Rejection: cannot select failed or unverified candidate.
 * - PF-07.9: Iterative Revision Chaining: PF-06 revision chains cleanly on selected candidate.
 * - PF-07.10: Plan Determinism: identical inputs yield identical canonical candidate plan hashes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  BriefValidator,
  OperationPlanCompiler,
  PromptDeliverableOrchestrator,
  RevisionOrchestrator,
  CandidateVariantCompiler,
  CandidateOrchestrator
} = require('../src/prompt-core/index.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/pf07-test-deliverables');

// Helper to ensure clean media for test runs
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

const FLAGSHIP_CANDIDATE_PROMPT = `Generate three different editing styles for this 12-second vertical video. Keep the original clip order, soundtrack, headline wording, title interval, B-roll interval, and total duration unchanged. Vary pacing and transition style only. Verify each candidate and let me choose one.`;

test('PF-07.1 Flagship Certification: 3 Distinct Verified Candidates Generated', (t) => {
  setupTestMedia();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_CANDIDATE_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR
  });

  // 1. Schema Validation
  const val = BriefValidator.validateCandidateSet(csetDoc);
  assert.equal(val.valid, true, `CandidateSet schema errors: ${val.errors?.join(', ')}`);

  // 2. Candidate Count & Status
  assert.equal(csetDoc.candidates.length, 3);
  assert.equal(csetDoc.status, 'ready');

  // 3. Verify each candidate is independently verified with its own deliverable
  for (const cand of csetDoc.candidates) {
    assert.equal(cand.status, 'verified');
    assert.equal(cand.execution.status, 'committed');
    assert.ok(cand.deliverable?.media_path);
    assert.ok(cand.deliverable?.sha256);
    assert.ok(cand.deliverable?.manifest_path);
    assert.ok(cand.qa_summary?.score >= 80);
    assert.equal(cand.semantic_verification?.status, 'verified');
  }

  // 4. Comparison Matrix
  assert.equal(csetDoc.comparison_matrix.length, 3);
  const profiles = csetDoc.comparison_matrix.map(m => m.profile_name);
  assert.ok(profiles.includes('dynamic'));
  assert.ok(profiles.includes('cinematic'));
  assert.ok(profiles.includes('editorial'));
});

test('PF-07.2 Hard Constraint Preservation: 100% Compliance Across All Candidates', (t) => {
  setupTestMedia();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_CANDIDATE_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR
  });

  for (const cand of csetDoc.candidates) {
    // Duration invariant
    assert.equal(cand.plan_summary.target_duration_ticks, 1440000);
    // Hard constraint compliance asserted by semantic verifier
    const semCriteria = cand.semantic_verification.criteria;
    const durCrit = semCriteria.find(c => c.criterion_id === 'CRIT_TIMELINE_DURATION');
    assert.equal(durCrit.status, 'passed');
    const orderCrit = semCriteria.find(c => c.criterion_id === 'CRIT_CLIP_ORDER');
    assert.equal(orderCrit.status, 'passed');
    const brollCrit = semCriteria.find(c => c.criterion_id === 'CRIT_BROLL_INTERVAL');
    assert.equal(brollCrit.status, 'passed');
    const titleCrit = semCriteria.find(c => c.criterion_id === 'CRIT_TITLE_OVERLAY');
    assert.equal(titleCrit.status, 'passed');
  }
});

test('PF-07.3 Candidate State Isolation: Zero Cross-Candidate Contamination', (t) => {
  setupTestMedia();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_CANDIDATE_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR
  });

  const journals = new Set();
  const planHashes = new Set();

  for (const cand of csetDoc.candidates) {
    // Unique isolated journal paths
    assert.ok(cand.execution.journal_path);
    assert.ok(!journals.has(cand.execution.journal_path), 'Journals must not be shared');
    journals.add(cand.execution.journal_path);

    // Unique plans
    assert.ok(!planHashes.has(cand.canonical_plan_hash), 'Plan hashes should be distinct across profiles');
    planHashes.add(cand.canonical_plan_hash);
  }
});

test('PF-07.4 Measurable Variation Validity: Distinct Profiles and Transition Styles', (t) => {
  const profiles = CandidateVariantCompiler.getStandardProfiles();
  assert.equal(profiles.length, 3);

  const transitionDurations = profiles.map(p => p.transitionDurationTicks);
  const uniqueDurations = new Set(transitionDurations);
  assert.equal(uniqueDurations.size, 3, 'Each profile must have distinct transition duration');

  const styles = profiles.map(p => p.typography_style);
  const uniqueStyles = new Set(styles);
  assert.equal(uniqueStyles.size, 3, 'Each profile must have distinct typography styling');
});

test('PF-07.5 Failure Isolation (Render Error): Failing Candidate Does Not Invalidate Siblings', (t) => {
  setupTestMedia();

  // Inject render failure specifically into cand-cinematic
  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_CANDIDATE_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR,
    options: {
      simulateRenderFailForCandidate: 'cand-cinematic'
    }
  });

  assert.equal(csetDoc.status, 'partially_verified');

  const candCinematic = csetDoc.candidates.find(c => c.candidate_id === 'cand-cinematic');
  assert.equal(candCinematic.status, 'failed');
  assert.equal(candCinematic.deliverable, null);

  const candDynamic = csetDoc.candidates.find(c => c.candidate_id === 'cand-dynamic');
  assert.equal(candDynamic.status, 'verified');
  assert.ok(candDynamic.deliverable?.manifest_path);

  const candEditorial = csetDoc.candidates.find(c => c.candidate_id === 'cand-editorial');
  assert.equal(candEditorial.status, 'verified');
  assert.ok(candEditorial.deliverable?.manifest_path);
});

test('PF-07.6 Failure Isolation (Semantic Violation): Violating Candidate Fails Without Corrupting Siblings', (t) => {
  setupTestMedia();

  // Inject semantic violation specifically into cand-dynamic
  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_CANDIDATE_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR,
    options: {
      injectSemanticViolationForCandidate: 'cand-dynamic'
    }
  });

  const candDynamic = csetDoc.candidates.find(c => c.candidate_id === 'cand-dynamic');
  assert.equal(candDynamic.status, 'failed');
  assert.equal(candDynamic.semantic_verification.status, 'failed');

  const candCinematic = csetDoc.candidates.find(c => c.candidate_id === 'cand-cinematic');
  assert.equal(candCinematic.status, 'verified');

  const candEditorial = csetDoc.candidates.find(c => c.candidate_id === 'cand-editorial');
  assert.equal(candEditorial.status, 'verified');
});

test('PF-07.7 Candidate Selection Provenance: Resolves Exact Candidate ID and Manifest', (t) => {
  setupTestMedia();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_CANDIDATE_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR
  });

  const targetCandId = 'cand-editorial';
  const targetCand = csetDoc.candidates.find(c => c.candidate_id === targetCandId);

  const selRes = CandidateOrchestrator.selectCandidate({
    candidateSetDoc: csetDoc,
    candidateId: targetCandId,
    outputDir: TEST_OUT_DIR
  });

  assert.equal(selRes.success, true);
  assert.equal(csetDoc.selection.selected_candidate_id, targetCandId);
  assert.equal(csetDoc.selection.selected_manifest_id, targetCand.deliverable.manifest_id);
  assert.equal(csetDoc.status, 'selection_committed');

  // Verify delivery run document
  assert.ok(selRes.deliveryRun);
  assert.equal(selRes.deliveryRun.status, 'verified');
  assert.equal(selRes.deliveryRun.deliverable.manifest_id, targetCand.deliverable.manifest_id);
  assert.equal(selRes.deliveryRun.deliverable.sha256, targetCand.deliverable.sha256);
});

test('PF-07.8 Fail-Closed Selection Rejection: Cannot Select Failed Candidate', (t) => {
  setupTestMedia();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_CANDIDATE_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR,
    options: {
      simulateRenderFailForCandidate: 'cand-cinematic'
    }
  });

  const selRes = CandidateOrchestrator.selectCandidate({
    candidateSetDoc: csetDoc,
    candidateId: 'cand-cinematic',
    outputDir: TEST_OUT_DIR
  });

  assert.equal(selRes.success, false);
  assert.ok(selRes.error.includes('Cannot select unverified or failed candidate'));
  assert.equal(csetDoc.selection.selected_candidate_id, null);
});

test('PF-07.9 Iterative Revision Chaining: PF-06 Revision Chains Cleanly on Selected Candidate', (t) => {
  setupTestMedia();

  const csetDoc = CandidateOrchestrator.generateCandidates({
    rawPrompt: FLAGSHIP_CANDIDATE_PROMPT,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR
  });

  // Select cand-dynamic
  const selRes = CandidateOrchestrator.selectCandidate({
    candidateSetDoc: csetDoc,
    candidateId: 'cand-dynamic',
    outputDir: TEST_OUT_DIR
  });
  assert.equal(selRes.success, true);

  const deliveryRun = selRes.deliveryRun;

  // Retrieve executed project for candidate
  const candObj = csetDoc._fullCandidates.find(c => c.candidate_id === 'cand-dynamic');
  const projectForRevision = candObj._executedProject;

  // Apply conversational revision on top of selected candidate
  const revPrompt = `Move the headline title 2 seconds later, preserving its duration and all other edits.`;

  const revDoc = RevisionOrchestrator.runRevision({
    rawPrompt: revPrompt,
    priorRunDoc: deliveryRun,
    project: projectForRevision,
    beatAnalysis: scenario1Beat,
    outputDir: TEST_OUT_DIR
  });

  assert.equal(revDoc.status, 'verified');
  assert.equal(revDoc.prior_run_id, deliveryRun.run_id);
  assert.ok(revDoc.deliverable?.manifest_path);
  assert.notEqual(revDoc.deliverable?.manifest_id, deliveryRun.deliverable?.manifest_id);
});

test('PF-07.10 Plan Determinism: Identical Inputs Yield Identical Candidate Plan Hashes', (t) => {
  const profiles = CandidateVariantCompiler.getStandardProfiles();
  const brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');

  for (const profile of profiles) {
    const plan1 = CandidateVariantCompiler.compileCandidatePlan({
      brief,
      project: structuredClone(scenario1Project),
      beatAnalysis: scenario1Beat,
      profile
    });
    const hash1 = OperationPlanCompiler.computePlanHash(plan1);

    const plan2 = CandidateVariantCompiler.compileCandidatePlan({
      brief,
      project: structuredClone(scenario1Project),
      beatAnalysis: scenario1Beat,
      profile
    });
    const hash2 = OperationPlanCompiler.computePlanHash(plan2);

    assert.equal(hash1, hash2, `Plan hash for profile ${profile.id} must be deterministic`);
  }
});
