/**
 * Editing Mechanics Engine (EME) - Phase PF-08 Test Battery
 * Preference-Guided Candidate Evaluation & Explainable Selection
 *
 * Verifies:
 * - PF08.1: Explicit Preference Extraction (pacing, transitions, typography, musical alignment)
 * - PF08.2: Neutral & Unstated Preference Fallback (fallback_active flag, neutral weights)
 * - PF08.3: Schema Validation Contract (preference-profile & preference-feedback schemas)
 * - PF08.4: Hard Gate Eligibility Precedence (QA & semantic failures strictly outrank preferences)
 * - PF08.5: Preference-Driven Ranking Shift (Dynamic preference elevates cand-dynamic to #1)
 * - PF08.6: Preference-Driven Ranking Shift (Cinematic preference elevates cand-cinematic to #1)
 * - PF08.7: Auditable Feedback Recording (selected candidate, manifest, rejected IDs, metrics)
 * - PF08.8: Disqualified Selection Rejection (cannot select failed or unverified candidate)
 * - PF08.9: Candidate Set & Feedback Persistence (candidate-set doc schema conformity & feedback binding)
 * - PF08.10: Delivery Run Integrity & Provenance (conforming selected delivery run and reproducibility)
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
  PreferenceFeedbackRecorder
} = require('../src/prompt-core/index.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/pf08-test-deliverables');

// Helper to ensure clean synthetic media for test renders
function setupTestMedia(targetDir = TEST_OUT_DIR) {
  fs.mkdirSync(targetDir, { recursive: true });
  const cleanMp4Path = path.join(targetDir, 'clean-12s.mp4');

  if (!fs.existsSync(cleanMp4Path)) {
    const rootClean = path.join(TEST_OUT_DIR, 'clean-12s.mp4');
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

// ---------------------------------------------------------------------------
// TEST 1: Explicit Preference Extraction
// ---------------------------------------------------------------------------
test('PF08.1: Explicit Preference Extraction from Prompt', () => {
  const prompt = 'Create dynamic high-energy cuts with quick dissolves and bold typography synced to downbeat';
  const profile = PreferenceExtractor.extractPreferences({
    rawPrompt: prompt,
    brief: { brief_id: 'brief-pf08-1', constraints: [] }
  });

  assert.ok(profile.preference_id.startsWith('pref-'));
  assert.equal(profile.fallback_active, false);
  assert.equal(profile.dimensions.pacing.preference, 'rapid');
  assert.equal(profile.dimensions.pacing.provenance, 'explicit_user');
  assert.equal(profile.dimensions.transition_style.preference, 'quick_dissolve');
  assert.equal(profile.dimensions.typography_style.preference, 'bold_punchy');
  assert.equal(profile.dimensions.musical_alignment.preference, 'downbeat_priority');

  const val = BriefValidator.validatePreferenceProfile(profile);
  assert.equal(val.valid, true, `Validation failed: ${val.errors?.join('; ')}`);
});

// ---------------------------------------------------------------------------
// TEST 2: Neutral & Unstated Preference Fallback
// ---------------------------------------------------------------------------
test('PF08.2: Neutral & Unstated Preference Fallback Mode', () => {
  const prompt = 'Please review and render the video';
  const profile = PreferenceExtractor.extractPreferences({
    rawPrompt: prompt,
    brief: { brief_id: 'brief-pf08-2', constraints: [] }
  });

  assert.equal(profile.fallback_active, true);
  assert.equal(profile.dimensions.pacing.preference, 'neutral');
  assert.equal(profile.dimensions.pacing.provenance, 'default');
  assert.equal(profile.dimensions.transition_style.preference, 'neutral');
  assert.equal(profile.dimensions.typography_style.preference, 'neutral');
  assert.ok(profile.diagnostics.length > 0);
  assert.match(profile.diagnostics[0], /fallback/i);

  const val = BriefValidator.validatePreferenceProfile(profile);
  assert.equal(val.valid, true);
});

// ---------------------------------------------------------------------------
// TEST 3: Schema Validation Contracts (Profile & Feedback)
// ---------------------------------------------------------------------------
test('PF08.3: Schema Validation Contracts for Preference Profile & Feedback', () => {
  // Profile Schema
  const validProfile = PreferenceExtractor.extractPreferences({
    rawPrompt: 'smooth cinematic fluid pacing cross dissolve transitions classic typography',
    brief: { brief_id: 'brief-pf08-3', constraints: [{ constraint_id: 'C-HARD-1', strength: 'hard' }] }
  });
  const profileVal = BriefValidator.validatePreferenceProfile(validProfile);
  assert.equal(profileVal.valid, true);

  // Invalid Profile (missing schema_version)
  const invalidProfile = { ...validProfile };
  delete invalidProfile.schema_version;
  const badProfileVal = BriefValidator.validatePreferenceProfile(invalidProfile);
  assert.equal(badProfileVal.valid, false);

  // Feedback Schema
  const validFeedback = {
    schema_version: '1.0.0',
    feedback_id: 'fb-abcdef123456',
    timestamp: new Date().toISOString(),
    preference_id: validProfile.preference_id,
    candidate_set_id: 'cset-123456789abc',
    selected_candidate_id: 'cand-cinematic',
    selected_manifest_id: 'man-123456789abc',
    rejected_candidate_ids: ['cand-dynamic', 'cand-editorial'],
    evaluation_evidence: {
      selected_rank: 1,
      selected_composite_score: 0.9425,
      selected_qa_score: 100,
      selected_musical_score: 0.92,
      selected_preference_score: 1.00
    },
    provenance: 'User confirmed selection of cand-cinematic'
  };
  const fbVal = BriefValidator.validatePreferenceFeedback(validFeedback);
  assert.equal(fbVal.valid, true);

  // Invalid Feedback (missing selected_manifest_id)
  const invalidFeedback = { ...validFeedback };
  delete invalidFeedback.selected_manifest_id;
  const badFbVal = BriefValidator.validatePreferenceFeedback(invalidFeedback);
  assert.equal(badFbVal.valid, false);
});

// ---------------------------------------------------------------------------
// TEST 4: Hard Gate Eligibility Precedence
// ---------------------------------------------------------------------------
test('PF08.4: Hard Gate Precedence: Disqualified candidate gets 0 score regardless of preference match', () => {
  const profile = PreferenceExtractor.extractPreferences({
    rawPrompt: 'fast dynamic rapid cuts',
    brief: { brief_id: 'brief-pf08-4', constraints: [] }
  });

  const candidates = [
    {
      candidate_id: 'cand-dynamic',
      variation_profile: { name: 'dynamic', transition_style: 'quick_dissolve', typography_style: 'bold_punchy' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'FAIL', score: 30 }, // Fails QA!
      semantic_verification: { status: 'verified' },
      status: 'failed'
    },
    {
      candidate_id: 'cand-cinematic',
      variation_profile: { name: 'cinematic', transition_style: 'cross_dissolve', typography_style: 'classic_cinematic' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 98 },
      semantic_verification: { status: 'verified' },
      status: 'verified'
    }
  ];

  const results = PreferenceEvaluator.evaluateCandidates({
    candidates,
    preferenceProfile: profile,
    adaptedStructure: { acceptedEvents: { downbeats: [], phrases: [], sections: [] }, fallbackActive: true },
    brief: { brief_id: 'brief-pf08-4' }
  });

  const dynamicCand = results.find(c => c.candidate_id === 'cand-dynamic');
  assert.equal(dynamicCand.hard_gates_passed, false);
  assert.equal(dynamicCand.composite_score, 0.0);
  assert.equal(dynamicCand.rank, null);
  assert.equal(dynamicCand.eligible_for_selection, false);
  assert.match(dynamicCand.explanation, /Disqualified by hard gates/);

  const cinematicCand = results.find(c => c.candidate_id === 'cand-cinematic');
  assert.equal(cinematicCand.hard_gates_passed, true);
  assert.equal(cinematicCand.rank, 1);
  assert.equal(cinematicCand.eligible_for_selection, true);
});

// ---------------------------------------------------------------------------
// TEST 5: Preference-Driven Ranking Shift (Dynamic Preference)
// ---------------------------------------------------------------------------
test('PF08.5: Preference-Driven Ranking Shift: Dynamic Preference Ranks Dynamic #1', () => {
  const prompt = 'fast dynamic high-energy pacing with quick dissolves';
  const profile = PreferenceExtractor.extractPreferences({
    rawPrompt: prompt,
    brief: { brief_id: 'brief-pf08-5', constraints: [] }
  });

  const candidates = [
    {
      candidate_id: 'cand-dynamic',
      variation_profile: { name: 'dynamic', transition_style: 'quick_dissolve', typography_style: 'bold_punchy' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 100 },
      semantic_verification: { status: 'verified' },
      status: 'verified',
      musical_alignment: { musical_score: 0.90 }
    },
    {
      candidate_id: 'cand-cinematic',
      variation_profile: { name: 'cinematic', transition_style: 'cross_dissolve', typography_style: 'classic_cinematic' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 100 },
      semantic_verification: { status: 'verified' },
      status: 'verified',
      musical_alignment: { musical_score: 0.90 }
    }
  ];

  const results = PreferenceEvaluator.evaluateCandidates({
    candidates,
    preferenceProfile: profile,
    adaptedStructure: { acceptedEvents: { downbeats: [], phrases: [], sections: [] }, fallbackActive: true },
    brief: { brief_id: 'brief-pf08-5' }
  });

  const dynamicCand = results.find(c => c.candidate_id === 'cand-dynamic');
  const cinematicCand = results.find(c => c.candidate_id === 'cand-cinematic');

  assert.ok(dynamicCand.preference_score > cinematicCand.preference_score);
  assert.ok(dynamicCand.composite_score > cinematicCand.composite_score);
  assert.equal(dynamicCand.rank, 1);
  assert.equal(cinematicCand.rank, 2);
});

// ---------------------------------------------------------------------------
// TEST 6: Preference-Driven Ranking Shift (Cinematic Preference)
// ---------------------------------------------------------------------------
test('PF08.6: Preference-Driven Ranking Shift: Cinematic Preference Ranks Cinematic #1', () => {
  const prompt = 'fluid smooth cinematic cross-dissolve transitions with classic clean titles';
  const profile = PreferenceExtractor.extractPreferences({
    rawPrompt: prompt,
    brief: { brief_id: 'brief-pf08-6', constraints: [] }
  });

  const candidates = [
    {
      candidate_id: 'cand-dynamic',
      variation_profile: { name: 'dynamic', transition_style: 'quick_dissolve', typography_style: 'bold_punchy' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 100 },
      semantic_verification: { status: 'verified' },
      status: 'verified',
      musical_alignment: { musical_score: 0.90 }
    },
    {
      candidate_id: 'cand-cinematic',
      variation_profile: { name: 'cinematic', transition_style: 'cross_dissolve', typography_style: 'classic_cinematic' },
      execution: { status: 'committed' },
      qa_summary: { decision: 'PASS', score: 100 },
      semantic_verification: { status: 'verified' },
      status: 'verified',
      musical_alignment: { musical_score: 0.90 }
    }
  ];

  const results = PreferenceEvaluator.evaluateCandidates({
    candidates,
    preferenceProfile: profile,
    adaptedStructure: { acceptedEvents: { downbeats: [], phrases: [], sections: [] }, fallbackActive: true },
    brief: { brief_id: 'brief-pf08-6' }
  });

  const dynamicCand = results.find(c => c.candidate_id === 'cand-dynamic');
  const cinematicCand = results.find(c => c.candidate_id === 'cand-cinematic');

  assert.ok(cinematicCand.preference_score > dynamicCand.preference_score);
  assert.ok(cinematicCand.composite_score > dynamicCand.composite_score);
  assert.equal(cinematicCand.rank, 1);
  assert.equal(dynamicCand.rank, 2);
});

// ---------------------------------------------------------------------------
// TEST 7: Auditable Feedback Recording
// ---------------------------------------------------------------------------
test('PF08.7: Auditable Preference Feedback Recording', () => {
  const outDir = path.join(TEST_OUT_DIR, 'fb-test');
  fs.mkdirSync(outDir, { recursive: true });

  const candidateSetDoc = {
    candidate_set_id: 'cset-aabbccddeeff',
    candidates: [
      {
        candidate_id: 'cand-cinematic',
        status: 'verified',
        deliverable: { manifest_id: 'man-cinematic-123', sha256: 'deadbeef' },
        musical_alignment: { rank: 1, composite_score: 0.95, musical_score: 0.92 },
        preference_alignment: { preference_score: 1.0 },
        qa_summary: { score: 100 }
      },
      {
        candidate_id: 'cand-dynamic',
        status: 'verified',
        deliverable: { manifest_id: 'man-dynamic-456', sha256: 'cafebabe' },
        musical_alignment: { rank: 2, composite_score: 0.88, musical_score: 0.85 },
        preference_alignment: { preference_score: 0.6 },
        qa_summary: { score: 100 }
      }
    ]
  };

  const prefProfile = { preference_id: 'pref-test-7788' };

  const fbRes = PreferenceFeedbackRecorder.recordSelectionFeedback({
    candidateSetDoc,
    selectedCandidateId: 'cand-cinematic',
    preferenceProfile: prefProfile,
    outputDir: outDir
  });

  assert.equal(fbRes.success, true);
  assert.ok(fbRes.feedbackRecord);
  assert.equal(fbRes.feedbackRecord.selected_candidate_id, 'cand-cinematic');
  assert.equal(fbRes.feedbackRecord.selected_manifest_id, 'man-cinematic-123');
  assert.deepEqual(fbRes.feedbackRecord.rejected_candidate_ids, ['cand-dynamic']);
  assert.equal(fbRes.feedbackRecord.evaluation_evidence.selected_rank, 1);
  assert.ok(fs.existsSync(fbRes.feedbackPath));

  // Check saved JSON conforms to schema
  const saved = JSON.parse(fs.readFileSync(fbRes.feedbackPath, 'utf8'));
  const val = BriefValidator.validatePreferenceFeedback(saved);
  assert.equal(val.valid, true);
});

// ---------------------------------------------------------------------------
// TEST 8: Disqualified Selection Rejection
// ---------------------------------------------------------------------------
test('PF08.8: Selection Rejection on Disqualified / Unverified Candidate', () => {
  const candidateSetDoc = {
    candidate_set_id: 'cset-failed-test',
    candidates: [
      {
        candidate_id: 'cand-dynamic',
        status: 'failed',
        deliverable: null
      }
    ]
  };

  const selRes = CandidateOrchestrator.selectCandidate({
    candidateSetDoc,
    candidateId: 'cand-dynamic',
    outputDir: TEST_OUT_DIR
  });

  assert.equal(selRes.success, false);
  assert.match(selRes.error, /Cannot select unverified or failed candidate/);
});

// ---------------------------------------------------------------------------
// TEST 9: Full Integration: Candidate Set & Selection Persistence
// ---------------------------------------------------------------------------
test('PF08.9: Full Orchestrator Integration: Preference-Guided Generation & Selection', () => {
  const outDir = path.join(TEST_OUT_DIR, 'e2e-run');
  setupTestMedia(outDir);
  const mediaSha256 = '5555555555555555555555555555555555555555555555555555555555555555';
  const musicalStructure = createMockMusicalStructure({ sha256: mediaSha256 });

  const basePrompt = 'Generate three different editing styles for this 12-second vertical video. Keep the original clip order, soundtrack, headline wording, title interval, B-roll interval, and total duration unchanged. Vary pacing and transition style only. Verify each candidate and let me choose one.';
  const prompt = `${basePrompt} Fast dynamic punchy cuts with quick dissolves and bold typography.`;

  const candidateSet = CandidateOrchestrator.generateCandidates({
    rawPrompt: prompt,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    musicalStructure,
    outputDir: outDir
  });

  assert.ok(candidateSet);
  assert.equal(candidateSet.status, 'ready');
  assert.ok(candidateSet.preference_profile);
  assert.equal(candidateSet.preference_profile.fallback_active, false);
  assert.equal(candidateSet.preference_profile.dimensions.pacing.preference, 'rapid');

  // Verify all candidates have preference_alignment
  for (const c of candidateSet.candidates) {
    assert.ok(c.preference_alignment);
    assert.equal(typeof c.preference_alignment.preference_score, 'number');
  }

  // Verify dynamic outranks cinematic due to explicit prompt
  const dynamic = candidateSet.candidates.find(c => c.candidate_id === 'cand-dynamic');
  assert.equal(dynamic.musical_alignment.rank, 1);

  // Validate whole candidate set doc against schema
  const val = BriefValidator.validateCandidateSet(candidateSet);
  assert.equal(val.valid, true, `Candidate set invalid: ${val.errors?.join('; ')}`);

  // Execute selection
  const selectRes = CandidateOrchestrator.selectCandidate({
    candidateSetDoc: candidateSet,
    candidateId: 'cand-dynamic',
    outputDir: outDir
  });

  assert.equal(selectRes.success, true);
  assert.equal(selectRes.candidateSetDoc.selection.selected_candidate_id, 'cand-dynamic');
  assert.ok(selectRes.candidateSetDoc.selection.feedback_record_id);
  assert.ok(selectRes.feedbackRecord);
  assert.equal(selectRes.feedbackRecord.selected_candidate_id, 'cand-dynamic');

  // Reload persisted candidate set from disk and verify
  const loaded = JSON.parse(fs.readFileSync(candidateSet._docPath, 'utf8'));
  assert.equal(loaded.status, 'selection_committed');
  assert.equal(loaded.selection.selected_candidate_id, 'cand-dynamic');
  assert.equal(loaded.selection.feedback_record_id, selectRes.feedbackRecord.feedback_id);
});

// ---------------------------------------------------------------------------
// TEST 10: Delivery Run Integrity & Provenance
// ---------------------------------------------------------------------------
test('PF08.10: Delivery Run Integrity & Selected Provenance', () => {
  const outDir = path.join(TEST_OUT_DIR, 'provenance-run');
  setupTestMedia(outDir);
  const mediaSha256 = '5555555555555555555555555555555555555555555555555555555555555555';
  const musicalStructure = createMockMusicalStructure({ sha256: mediaSha256 });

  const basePrompt = 'Generate three different editing styles for this 12-second vertical video. Keep the original clip order, soundtrack, headline wording, title interval, B-roll interval, and total duration unchanged. Vary pacing and transition style only. Verify each candidate and let me choose one.';
  const prompt = `${basePrompt} Smooth fluid cinematic pacing with cross-dissolves and classic clean typography.`;

  const candidateSet = CandidateOrchestrator.generateCandidates({
    rawPrompt: prompt,
    project: structuredClone(scenario1Project),
    beatAnalysis: scenario1Beat,
    musicalStructure,
    outputDir: outDir
  });

  assert.equal(candidateSet.status, 'ready');

  // Select auto (should pick rank 1 which is cinematic for this prompt)
  const selectRes = CandidateOrchestrator.selectCandidate({
    candidateSetDoc: candidateSet,
    candidateId: 'auto',
    outputDir: outDir
  });

  assert.equal(selectRes.success, true);
  assert.equal(selectRes.candidateSetDoc.selection.selected_candidate_id, 'cand-cinematic');
  assert.equal(selectRes.deliveryRun.status, 'verified');
  assert.equal(selectRes.deliveryRun.schema_version, '1.0.0');
  assert.ok(selectRes.deliveryRun.deliverable.sha256);
  assert.ok(selectRes.deliveryRun.deliverable.manifest_id);
  assert.ok(fs.existsSync(selectRes.deliveryRun._runPath));
});
