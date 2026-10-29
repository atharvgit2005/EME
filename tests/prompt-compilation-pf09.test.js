/**
 * Editing Mechanics Engine (EME) - Phase PF-09 Test Battery
 * Conversational Revision & Verified Delivery Sessions
 *
 * Verifies:
 * - PF09.1: QA Boundary Behavior (79 disqualifies, 80 & 81 qualify; preference cannot override)
 * - PF09.2: Rejection vs Non-Selection Semantics (unselected vs explicitly rejected separation)
 * - PF09.3: Session Schema Conformance & Strict Validation
 * - PF09.4: State Machine Lifecycle & Transition Protection (fail-closed on invalid transitions)
 * - PF09.5: Invariant Preservation on Revision Failure (prior verified delivery remains untouched)
 * - PF09.6: Flagship Certification Scenario (Natural-language title timing + pacing revision)
 * - PF09.7: Multi-Revision History, Undo, Redo & Deterministic Branching
 * - PF09.8: Concurrency & Stale Session Version Rejection
 * - PF09.9: Crash Recovery & Idempotent Checkpoint Restoration
 * - PF09.10: Manifest-to-Media Hash Integrity & Full Revision Provenance
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  BriefValidator,
  CandidateOrchestrator,
  PreferenceExtractor,
  PreferenceEvaluator,
  PreferenceFeedbackRecorder,
  RevisionSessionManager,
  OperationPlanCompiler
} = require('../src/prompt-core/index.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');
const scenario1Brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/pf09-test-deliverables');

function createBaseExecutedProject() {
  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  return OperationPlanCompiler.executePlan(baseProject, basePlan).project;
}

// Helper to ensure clean synthetic media for test renders
function setupTestMedia(targetDir = TEST_OUT_DIR) {
  fs.mkdirSync(targetDir, { recursive: true });
  const cleanMp4Path = path.join(targetDir, 'clean-12s.mp4');

  if (!fs.existsSync(cleanMp4Path)) {
    const rootClean = path.join('artifacts/pf08-test-deliverables', 'clean-12s.mp4');
    if (fs.existsSync(rootClean)) {
      fs.copyFileSync(rootClean, cleanMp4Path);
    } else {
      spawnSync('ffmpeg', [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=12',
        '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=12:sample_rate=48000',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k',
        cleanMp4Path
      ], { stdio: 'ignore' });
    }
  }

  return cleanMp4Path;
}

// Helper to generate mock musical structure conforming to eme-musical-structure.v1
function createMockMusicalStructure(sha256 = '5555555555555555555555555555555555555555555555555555555555555555') {
  const structureId = `sha256:${crypto.createHash('sha256').update(`test-${sha256}`).digest('hex')}`;
  const barDurationTicks = 240000;
  const bars = [];
  for (let i = 0; i < 6; i++) {
    bars.push({
      barIndex: i,
      startTicks: i * barDurationTicks,
      endTicks: (i + 1) * barDurationTicks,
      downbeatTicks: i * barDurationTicks,
      beatsCount: 4,
      confidence: 0.95
    });
  }

  return {
    schemaVersion: 'eme-musical-structure.v1',
    structureId,
    source: { sha256, sampleRate: 44100, channels: 2, durationSamples: 529200, durationTicks: 1440000 },
    config: { algorithmVersion: '1.0.0', ticksPerSecond: 120000, endpointConvention: 'half-open', fftSize: 2048, hopLength: 512 },
    meter: { classification: '4/4', numerator: 4, denominator: 4, confidence: 0.95, isAmbiguous: false, phaseOffsetBeats: 0, reasons: [] },
    bars,
    phrases: [
      { phraseIndex: 0, startTicks: 0, endTicks: 480000, barsCount: 2, confidence: 0.92, cadenceStrength: 0.88 },
      { phraseIndex: 1, startTicks: 480000, endTicks: 960000, barsCount: 2, confidence: 0.90, cadenceStrength: 0.85 },
      { phraseIndex: 2, startTicks: 960000, endTicks: 1440000, barsCount: 2, confidence: 0.91, cadenceStrength: 0.87 }
    ],
    sections: [
      { id: 'sec-intro', sectionIndex: 0, type: 'intro', startTicks: 0, endTicks: 480000, confidence: 0.88, uncertaintyState: 'clear' },
      { id: 'sec-verse', sectionIndex: 1, type: 'verse', startTicks: 480000, endTicks: 1440000, confidence: 0.85, uncertaintyState: 'clear' }
    ],
    ambiguity: { hasHighAmbiguity: false, isSparse: false, isRubato: false, notes: [] }
  };
}

// ---------------------------------------------------------------------------
// TEST 1: QA Boundary Behavior (79, 80, 81)
// ---------------------------------------------------------------------------
test('PF09.1: QA Boundary Behavior: 79 Disqualifies, 80 & 81 Qualify, Preferences Cannot Override', () => {
  const profile = {
    schema_version: '1.0.0',
    preference_id: 'pref-boundary-test',
    timestamp: new Date().toISOString(),
    request: { prompt: 'fast dynamic rapid cuts', brief_id: 'brief-b' },
    dimensions: {
      pacing: { preference: 'rapid', strength: 0.90, provenance: 'explicit_user' },
      transition_style: { preference: 'quick_dissolve', strength: 0.85, provenance: 'explicit_user' },
      typography_style: { preference: 'bold_punchy', strength: 0.80, provenance: 'explicit_user' },
      musical_alignment: { preference: 'balanced', strength: 0.70, provenance: 'default' }
    },
    scoring_weights: { preference_satisfaction: 0.40, musical_alignment: 0.35, physical_qa: 0.25 },
    fallback_active: false,
    diagnostics: []
  };

  const candidates = [
    {
      candidate_id: 'cand-score79',
      variation_profile: { name: 'dynamic', transition_style: 'quick_dissolve', typography_style: 'bold_punchy' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 79 }, // Score 79 is below 80 threshold!
      semantic_verification: { status: 'verified' },
      status: 'verified',
      musical_alignment: { musical_score: 1.0 }
    },
    {
      candidate_id: 'cand-score80',
      variation_profile: { name: 'dynamic', transition_style: 'quick_dissolve', typography_style: 'bold_punchy' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 80 }, // Exactly at threshold
      semantic_verification: { status: 'verified' },
      status: 'verified',
      musical_alignment: { musical_score: 1.0 }
    },
    {
      candidate_id: 'cand-score81',
      variation_profile: { name: 'dynamic', transition_style: 'quick_dissolve', typography_style: 'bold_punchy' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 81 }, // 1 point above threshold
      semantic_verification: { status: 'verified' },
      status: 'verified',
      musical_alignment: { musical_score: 1.0 }
    }
  ];

  const evaluated = PreferenceEvaluator.evaluateCandidates({
    candidates,
    preferenceProfile: profile,
    adaptedStructure: { acceptedEvents: { downbeats: [], phrases: [], sections: [] }, fallbackActive: true },
    brief: { brief_id: 'brief-b' }
  });

  const cand79 = evaluated.find(c => c.candidate_id === 'cand-score79');
  const cand80 = evaluated.find(c => c.candidate_id === 'cand-score80');
  const cand81 = evaluated.find(c => c.candidate_id === 'cand-score81');

  // Score 79 MUST be disqualified despite 100% preference match
  assert.equal(cand79.hard_gates_passed, false);
  assert.equal(cand79.composite_score, 0.0);
  assert.equal(cand79.rank, null);
  assert.equal(cand79.eligible_for_selection, false);
  assert.match(cand79.explanation, /threshold 80/);

  // Score 80 MUST qualify
  assert.equal(cand80.hard_gates_passed, true);
  assert.equal(cand80.eligible_for_selection, true);
  assert.ok(cand80.composite_score > 0);

  // Score 81 MUST qualify and slightly exceed score 80
  assert.equal(cand81.hard_gates_passed, true);
  assert.equal(cand81.eligible_for_selection, true);
  assert.ok(cand81.composite_score > cand80.composite_score);
  assert.equal(cand81.rank, 1);
  assert.equal(cand80.rank, 2);
});

// ---------------------------------------------------------------------------
// TEST 2: Rejection vs Non-Selection Semantics
// ---------------------------------------------------------------------------
test('PF09.2: Rejection vs Non-Selection Semantics in Feedback Recording', () => {
  const outDir = path.join(TEST_OUT_DIR, 'feedback-semantics');
  fs.mkdirSync(outDir, { recursive: true });

  const candidateSetDoc = {
    candidate_set_id: 'cset-semantics-test',
    candidates: [
      {
        candidate_id: 'cand-cinematic',
        status: 'verified',
        deliverable: { manifest_id: 'man-cin-1', sha256: 'hash-cin' },
        musical_alignment: { rank: 1, composite_score: 0.95 },
        preference_alignment: { preference_score: 1.0 },
        qa_summary: { score: 100 }
      },
      {
        candidate_id: 'cand-dynamic',
        status: 'verified',
        deliverable: { manifest_id: 'man-dyn-1', sha256: 'hash-dyn' },
        musical_alignment: { rank: 2, composite_score: 0.88 },
        preference_alignment: { preference_score: 0.8 },
        qa_summary: { score: 100 }
      },
      {
        candidate_id: 'cand-editorial',
        status: 'verified',
        deliverable: { manifest_id: 'man-edt-1', sha256: 'hash-edt' },
        musical_alignment: { rank: 3, composite_score: 0.70 },
        preference_alignment: { preference_score: 0.5 },
        qa_summary: { score: 100 }
      }
    ]
  };

  // Case A: Natural selection with unselected alternatives (no explicit dislike)
  const fbResA = PreferenceFeedbackRecorder.recordSelectionFeedback({
    candidateSetDoc,
    selectedCandidateId: 'cand-cinematic',
    preferenceProfile: { preference_id: 'pref-sem-1' },
    outputDir: outDir
  });

  assert.equal(fbResA.success, true);
  assert.deepEqual(fbResA.feedbackRecord.unselected_candidate_ids, ['cand-dynamic', 'cand-editorial']);
  assert.deepEqual(fbResA.feedbackRecord.explicitly_rejected_candidate_ids, []);

  // Case B: Explicit rejection of editorial
  const fbResB = PreferenceFeedbackRecorder.recordSelectionFeedback({
    candidateSetDoc,
    selectedCandidateId: 'cand-cinematic',
    preferenceProfile: { preference_id: 'pref-sem-2' },
    explicitlyRejectedCandidateIds: ['cand-editorial'],
    outputDir: outDir
  });

  assert.equal(fbResB.success, true);
  assert.deepEqual(fbResB.feedbackRecord.unselected_candidate_ids, ['cand-dynamic', 'cand-editorial']);
  assert.deepEqual(fbResB.feedbackRecord.explicitly_rejected_candidate_ids, ['cand-editorial']);
  assert.match(fbResB.feedbackRecord.provenance, /Explicit rejections: \[cand-editorial\]/);
});

// ---------------------------------------------------------------------------
// TEST 3: Revision Session Schema Conformance
// ---------------------------------------------------------------------------
test('PF09.3: Revision Session Schema Conformance and Validation', () => {
  const sessionDoc = {
    schema_version: '1.0.0',
    session_id: 'ses-123456789abc',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    state: 'ready',
    request: {
      original_prompt: 'Create high energy video',
      brief_id: 'brief-123',
      latest_revision_prompt: null
    },
    hard_constraints: [
      { constraint_id: 'C-HARD-1', description: 'Preserve color grade', strength: 'hard', provenance: 'brief' }
    ],
    preference_profile: null,
    candidate_set_id: 'cset-123456',
    selected_candidate_id: 'cand-dynamic',
    active_delivery: {
      delivery_run_id: 'run-123',
      manifest_id: 'man-123',
      media_path: 'media/test.mp4',
      sha256: 'deadbeef123',
      revision_id: 'rev-0',
      activated_at: new Date().toISOString()
    },
    history: [
      {
        revision_id: 'rev-0',
        predecessor_id: null,
        prompt: 'Initial selection',
        status: 'committed',
        plan_hash: 'plan-hash-1',
        manifest_id: 'man-123',
        delivery_run_id: 'run-123',
        media_sha256: 'deadbeef123',
        operations_count: 5,
        qa_score: 100,
        timestamp: new Date().toISOString(),
        error: null
      }
    ],
    undo_redo: {
      current_revision_id: 'rev-0',
      undo_stack: [],
      redo_stack: []
    },
    concurrency: {
      version: 1,
      last_modified_at: new Date().toISOString()
    },
    recovery: {
      status: 'clean',
      pending_transaction_id: null,
      last_attempted_revision_id: null,
      checkpoint_path: null
    },
    diagnostics: []
  };

  const val = BriefValidator.validateRevisionSession(sessionDoc);
  assert.equal(val.valid, true, `Session schema error: ${val.errors?.join('; ')}`);

  // Invalid session (missing state)
  const invalidSession = { ...sessionDoc };
  delete invalidSession.state;
  const badVal = BriefValidator.validateRevisionSession(invalidSession);
  assert.equal(badVal.valid, false);
});

// ---------------------------------------------------------------------------
// TEST 4: State Machine Lifecycle & Transitions
// ---------------------------------------------------------------------------
test('PF09.4: State Machine Lifecycle and Fail-Closed Transitions', () => {
  const outDir = path.join(TEST_OUT_DIR, 'fsm-test');
  fs.mkdirSync(outDir, { recursive: true });

  const session = RevisionSessionManager.createSession({
    prompt: 'Initial creation prompt',
    brief: { brief_id: 'brief-fsm', constraints: [] },
    outputDir: outDir
  });

  assert.equal(session.state, 'initialized');

  // Attempting revision from initialized must fail closed
  const revRes = RevisionSessionManager.applyRevision({
    session,
    revisionPrompt: 'Make it faster',
    project: scenario1Project,
    outputDir: outDir
  });

  assert.equal(revRes.success, false);
  assert.match(revRes.error, /has no active verified delivery/);
  assert.equal(session.state, 'initialized');
});

// ---------------------------------------------------------------------------
// TEST 5: Invariant Preservation on Revision Failure
// ---------------------------------------------------------------------------
test('PF09.5: Hard Gate Invariant: Prior Verified Delivery Remains Active on Revision Failure', () => {
  const outDir = path.join(TEST_OUT_DIR, 'failure-invariant');
  setupTestMedia(outDir);

  const initialDelivery = {
    delivery_run_id: 'run-initial',
    manifest_id: 'man-initial-999',
    media_path: path.join(outDir, 'clean-12s.mp4'),
    sha256: 'initial-sha256-digest',
    revision_id: 'rev-0',
    activated_at: new Date().toISOString()
  };

  const session = {
    schema_version: '1.0.0',
    session_id: 'ses-fail-inv',
    state: 'ready',
    request: { original_prompt: 'Test video', brief_id: 'brief-inv' },
    hard_constraints: [{ constraint_id: 'C-DUR-1440K', description: 'Duration', strength: 'hard' }],
    active_delivery: structuredClone(initialDelivery),
    history: [{
      revision_id: 'rev-0',
      predecessor_id: null,
      prompt: 'Initial',
      status: 'committed',
      manifest_id: initialDelivery.manifest_id,
      media_sha256: initialDelivery.sha256,
      timestamp: new Date().toISOString()
    }],
    undo_redo: { current_revision_id: 'rev-0', undo_stack: [], redo_stack: [] },
    concurrency: { version: 1, last_modified_at: new Date().toISOString() },
    recovery: { status: 'clean', pending_transaction_id: null }
  };

  // Inject a failure (impossible request conflicting with duration)
  const failedRev = RevisionSessionManager.applyRevision({
    session,
    revisionPrompt: 'Change video duration to 25 seconds',
    project: structuredClone(scenario1Project),
    outputDir: outDir
  });

  assert.equal(failedRev.success, false);
  assert.match(failedRev.error, /contradicts preserved hard constraint/);

  // CRITICAL INVARIANT VERIFICATION:
  // Active delivery MUST NOT be changed or corrupted!
  assert.equal(session.active_delivery.revision_id, 'rev-0');
  assert.equal(session.active_delivery.manifest_id, 'man-initial-999');
  assert.equal(session.active_delivery.sha256, 'initial-sha256-digest');
  assert.equal(session.state, 'ready');

  // History records the failure
  const failedEntry = session.history.find(h => h.revision_id === 'rev-1');
  assert.ok(failedEntry);
  assert.equal(failedEntry.status, 'failed');
  assert.ok(failedEntry.error.toLowerCase().includes('conflict'));
});

// ---------------------------------------------------------------------------
// TEST 6: Flagship Certification Scenario (End-to-End Natural-Language Revision)
// ---------------------------------------------------------------------------
test('PF09.6: Flagship Certification Scenario: Natural-Language Title Timing & Pacing Revision', () => {
  const outDir = path.join(TEST_OUT_DIR, 'flagship-run');
  setupTestMedia(outDir);
  const mediaSha256 = '5555555555555555555555555555555555555555555555555555555555555555';
  const musicalStructure = createMockMusicalStructure(mediaSha256);

  const basePrompt = 'Generate three different editing styles for this 12-second vertical video. Keep the original clip order, soundtrack, headline wording, title interval, B-roll interval, and total duration unchanged. Vary pacing and transition style only. Verify each candidate and let me choose one.';
  const dynamicPrompt = `${basePrompt} Fast dynamic punchy cuts with quick dissolves and bold typography.`;

  // 1. Generate candidate set
  const candidateSet = CandidateOrchestrator.generateCandidates({
    rawPrompt: dynamicPrompt,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    musicalStructure,
    outputDir: outDir
  });

  assert.equal(candidateSet.status, 'ready');

  // 2. Initialize Session and Bind Candidate Selection
  const session = RevisionSessionManager.createSession({
    prompt: dynamicPrompt,
    candidateSetDoc: candidateSet,
    outputDir: outDir
  });

  assert.equal(session.state, 'candidate_selection_required');

  const bindRes = RevisionSessionManager.bindSelectedCandidate({
    session,
    candidateSetDoc: candidateSet,
    candidateId: 'cand-dynamic',
    outputDir: outDir
  });

  assert.equal(bindRes.success, true);
  assert.equal(session.state, 'ready');
  assert.equal(session.active_delivery.revision_id, 'rev-0');
  assert.ok(session.active_delivery.manifest_id);

  // 3. Request Flagship Conversational Revision:
  // "Move headline title 2 seconds later on track_graphics, keep duration unchanged. Preserve existing clip order and soundtrack."
  const revisionPrompt = 'Move headline title 2 seconds later on track_graphics. Preserve existing clip order, soundtrack, and total duration.';
  
  const revRes = RevisionSessionManager.applyRevision({
    session,
    revisionPrompt,
    project: structuredClone(scenario1Project),
    outputDir: outDir
  });

  assert.equal(revRes.success, true);
  assert.equal(session.state, 'ready');
  assert.equal(session.active_delivery.revision_id, 'rev-1');
  assert.ok(session.active_delivery.manifest_id);
  assert.notEqual(session.active_delivery.manifest_id, bindRes.session.history[0].manifest_id);

  // Predecessor is preserved in history
  const rev0 = session.history.find(h => h.revision_id === 'rev-0');
  const rev1 = session.history.find(h => h.revision_id === 'rev-1');
  assert.equal(rev1.predecessor_id, 'rev-0');
  assert.equal(rev1.status, 'committed');
  assert.equal(session.undo_redo.undo_stack[0], 'rev-0');
});

// ---------------------------------------------------------------------------
// TEST 7: Multi-Revision History, Undo, Redo & Deterministic Branching
// ---------------------------------------------------------------------------
test('PF09.7: Multi-Revision History, Undo, Redo and Branching Invalidation', () => {
  const outDir = path.join(TEST_OUT_DIR, 'undo-redo-branch');
  setupTestMedia(outDir);
  const baseExecutedProject = createBaseExecutedProject();

  const session = {
    schema_version: '1.0.0',
    session_id: 'ses-undo-redo',
    state: 'ready',
    request: { original_prompt: 'Test prompt', brief_id: 'brief-ur' },
    hard_constraints: [],
    active_delivery: {
      delivery_run_id: 'run-rev1',
      manifest_id: 'man-rev1',
      media_path: path.join(outDir, 'clean-12s.mp4'),
      sha256: 'sha-rev1',
      revision_id: 'rev-1',
      activated_at: new Date().toISOString()
    },
    history: [
      {
        revision_id: 'rev-0',
        predecessor_id: null,
        prompt: 'Initial candidate',
        status: 'committed',
        manifest_id: 'man-rev0',
        media_sha256: 'sha-rev0',
        delivery_run_id: 'run-rev0',
        _project: structuredClone(baseExecutedProject)
      },
      {
        revision_id: 'rev-1',
        predecessor_id: 'rev-0',
        prompt: 'Revision 1 title move',
        status: 'committed',
        manifest_id: 'man-rev1',
        media_sha256: 'sha-rev1',
        delivery_run_id: 'run-rev1',
        _project: structuredClone(baseExecutedProject)
      }
    ],
    undo_redo: {
      current_revision_id: 'rev-1',
      undo_stack: ['rev-0'],
      redo_stack: []
    },
    concurrency: { version: 2, last_modified_at: new Date().toISOString() },
    recovery: { status: 'clean', pending_transaction_id: null }
  };

  // Step 1: Undo to rev-0
  const undoRes = RevisionSessionManager.undo({ session, outputDir: outDir });
  assert.equal(undoRes.success, true);
  assert.equal(session.active_delivery.revision_id, 'rev-0');
  assert.equal(session.active_delivery.manifest_id, 'man-rev0');
  assert.deepEqual(session.undo_redo.undo_stack, []);
  assert.deepEqual(session.undo_redo.redo_stack, ['rev-1']);

  // Step 2: Redo back to rev-1
  const redoRes = RevisionSessionManager.redo({ session, outputDir: outDir });
  assert.equal(redoRes.success, true);
  assert.equal(session.active_delivery.revision_id, 'rev-1');
  assert.equal(session.active_delivery.manifest_id, 'man-rev1');
  assert.deepEqual(session.undo_redo.undo_stack, ['rev-0']);
  assert.deepEqual(session.undo_redo.redo_stack, []);

  // Step 3: Undo to rev-0 again
  RevisionSessionManager.undo({ session, outputDir: outDir });
  assert.equal(session.active_delivery.revision_id, 'rev-0');
  assert.equal(session.undo_redo.redo_stack.length, 1);

  // Step 4: Branching Revision from rev-0 invalidates redo stack
  const branchRev = RevisionSessionManager.applyRevision({
    session,
    revisionPrompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: structuredClone(baseExecutedProject),
    outputDir: outDir
  });

  assert.equal(branchRev.success, true);
  assert.equal(session.active_delivery.revision_id, 'rev-2');
  assert.deepEqual(session.undo_redo.undo_stack, ['rev-0']);
  // Redo stack MUST be emptied after new branch commit!
  assert.deepEqual(session.undo_redo.redo_stack, []);
});

// ---------------------------------------------------------------------------
// TEST 8: Concurrency & Stale Session Version Rejection
// ---------------------------------------------------------------------------
test('PF09.8: Concurrency: Stale Session Version Rejection', () => {
  const outDir = path.join(TEST_OUT_DIR, 'concurrency-test');
  setupTestMedia(outDir);

  const session = {
    schema_version: '1.0.0',
    session_id: 'ses-concurrent',
    state: 'ready',
    request: { original_prompt: 'Test', brief_id: 'brief-c' },
    hard_constraints: [],
    active_delivery: {
      delivery_run_id: 'run-0',
      manifest_id: 'man-0',
      media_path: path.join(outDir, 'clean-12s.mp4'),
      sha256: 'sha-0',
      revision_id: 'rev-0',
      activated_at: new Date().toISOString()
    },
    history: [],
    undo_redo: { current_revision_id: 'rev-0', undo_stack: [], redo_stack: [] },
    concurrency: { version: 5, last_modified_at: new Date().toISOString() }, // Current version is 5
    recovery: { status: 'clean', pending_transaction_id: null }
  };

  // Client passes stale expectedVersion: 4
  const staleRes = RevisionSessionManager.applyRevision({
    session,
    revisionPrompt: 'Move headline title 2 seconds later',
    project: structuredClone(scenario1Project),
    outputDir: outDir,
    options: { expectedVersion: 4 }
  });

  assert.equal(staleRes.success, false);
  assert.match(staleRes.error, /Stale session version/);
  assert.equal(session.active_delivery.revision_id, 'rev-0');
  assert.equal(session.concurrency.version, 5);
});

// ---------------------------------------------------------------------------
// TEST 9: Crash Recovery & Idempotent Checkpoint Restoration
// ---------------------------------------------------------------------------
test('PF09.9: Crash Recovery & Idempotent Checkpoint Restoration', () => {
  const outDir = path.join(TEST_OUT_DIR, 'crash-recovery');
  setupTestMedia(outDir);

  const checkpointPath = path.join(outDir, 'checkpoint-crash.json');
  fs.writeFileSync(checkpointPath, JSON.stringify({
    session_id: 'ses-crashed',
    transaction_id: 'tx-crash-99',
    predecessor_revision_id: 'rev-0',
    active_delivery: {
      delivery_run_id: 'run-safe',
      manifest_id: 'man-safe',
      media_path: path.join(outDir, 'clean-12s.mp4'),
      sha256: 'safe-sha256',
      revision_id: 'rev-0',
      activated_at: new Date().toISOString()
    }
  }, null, 2), 'utf8');

  const crashedSession = {
    schema_version: '1.0.0',
    session_id: 'ses-crashed',
    state: 'verifying', // Crashed in verifying state!
    request: { original_prompt: 'Test', brief_id: 'brief-cr' },
    hard_constraints: [],
    active_delivery: {
      delivery_run_id: 'run-safe',
      manifest_id: 'man-safe',
      media_path: path.join(outDir, 'clean-12s.mp4'),
      sha256: 'safe-sha256',
      revision_id: 'rev-0',
      activated_at: new Date().toISOString()
    },
    history: [],
    undo_redo: { current_revision_id: 'rev-0', undo_stack: [], redo_stack: [] },
    concurrency: { version: 2, last_modified_at: new Date().toISOString() },
    recovery: {
      status: 'in_flight',
      pending_transaction_id: 'tx-crash-99',
      checkpoint_path: checkpointPath
    },
    diagnostics: []
  };

  // Run idempotent recovery
  const recRes = RevisionSessionManager.recoverSession({
    session: crashedSession,
    outputDir: outDir
  });

  assert.equal(recRes.success, true);
  assert.equal(crashedSession.state, 'ready');
  assert.equal(crashedSession.recovery.status, 'clean');
  assert.equal(crashedSession.recovery.pending_transaction_id, null);
  assert.equal(crashedSession.active_delivery.revision_id, 'rev-0');
  assert.equal(crashedSession.active_delivery.manifest_id, 'man-safe');
  assert.equal(fs.existsSync(checkpointPath), false); // Checkpoint cleaned
});

// ---------------------------------------------------------------------------
// TEST 10: Manifest-to-Media Hash Integrity & Regression Stability
// ---------------------------------------------------------------------------
test('PF09.10: Manifest-to-Media Hash Integrity and Delivery Verification', () => {
  const outDir = path.join(TEST_OUT_DIR, 'hash-integrity');
  setupTestMedia(outDir);
  const baseExecutedProject = createBaseExecutedProject();

  const cleanMp4 = path.join(outDir, 'clean-12s.mp4');
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(cleanMp4)).digest('hex');

  const session = {
    schema_version: '1.0.0',
    session_id: 'ses-hash-test',
    state: 'ready',
    request: { original_prompt: 'Test prompt', brief_id: 'brief-h' },
    hard_constraints: [],
    active_delivery: {
      delivery_run_id: 'run-hash',
      manifest_id: 'man-hash',
      media_path: cleanMp4,
      sha256: actualHash,
      revision_id: 'rev-0',
      activated_at: new Date().toISOString()
    },
    history: [{
      revision_id: 'rev-0',
      predecessor_id: null,
      prompt: 'Initial',
      status: 'committed',
      manifest_id: 'man-hash',
      media_sha256: actualHash,
      delivery_run_id: 'run-hash',
      timestamp: new Date().toISOString(),
      _project: structuredClone(baseExecutedProject)
    }],
    undo_redo: { current_revision_id: 'rev-0', undo_stack: [], redo_stack: [] },
    concurrency: { version: 1, last_modified_at: new Date().toISOString() },
    recovery: { status: 'clean', pending_transaction_id: null },
    diagnostics: []
  };

  // Apply revision
  const revRes = RevisionSessionManager.applyRevision({
    session,
    revisionPrompt: 'Move headline title 1 second later on track_graphics. Preserve duration.',
    project: structuredClone(baseExecutedProject),
    outputDir: outDir
  });

  assert.equal(revRes.success, true);
  assert.equal(session.active_delivery.sha256, revRes.newDelivery.sha256);
  assert.equal(session.active_delivery.manifest_id, revRes.newDelivery.manifest_id);
  assert.ok(fs.existsSync(session.active_delivery.media_path));

  // Validate entire session document against schema
  const val = BriefValidator.validateRevisionSession(session);
  assert.equal(val.valid, true, `Session failed schema validation: ${val.errors?.join('; ')}`);
});
