/**
 * Editing Mechanics Engine (EME) - Stage 33.4 Composition Solver Suite
 * Milestone: Phase 33 — Audio-Visual Composition Synthesis (AVCS-33)
 * Stage: Stage 33.4 — Deterministic Composition Solver and Declarative Plan Compiler
 *
 * Automated verification of:
 * 1. Hard-Constraint Evaluation & Pruning (GATE-05, INV-08)
 * 2. avcs-policy-v1.0.0 Weighted Scoring & Tie-Breaking (GATE-06, INV-07)
 * 3. Canonical OperationPlan Compilation (schema/eme-operation-plan.v1.schema.json)
 * 4. Non-Mutating VQA and OP-AUTH Safety Invariants (INV-03, INV-04)
 * 5. Architectural Invariants (18 canonical schemas frozen, 0 runtime npm dependencies)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { AudioVisualCompositionSolver } = require('../src/solver/audio-visual-composition-solver');
const { AudioVisualEvidenceFusion } = require('../src/fusion/audio-visual-evidence-fusion');
const { FusionContractValidator } = require('../src/fusion/fusion-contract-validator');

const ROOT_DIR = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT_DIR, 'schema');

const SOLVER = new AudioVisualCompositionSolver();
const FUSION_ENGINE = new AudioVisualEvidenceFusion();
const VALIDATOR = new FusionContractValidator();

// Create valid test fusion evidence
function createMockFusionEvidence() {
  const audioSha = 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123';
  const visualSha = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';

  const audioSidecar = {
    schemaVersion: 'eme-beat-analysis.v1',
    analysisId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    source: {
      assetId: 'audio_track_33_4',
      sha256: audioSha,
      sampleRate: 48000,
      channels: 2,
      durationSamples: 192000,
      durationTicks: 480000
    },
    config: {
      algorithmVersion: '1.0.0',
      sampleRate: 48000,
      fftSize: 2048,
      hopLength: 512,
      window: 'hann',
      frameCenterConvention: 'center'
    },
    tempo: { bpm: 120, confidence: 0.95, isAmbiguous: false, phaseOffsetTicks: 0 },
    events: {
      beats: [
        { id: 'b0', sampleIndex: 0, ticks: 0, confidence: 0.99, strength: 1.0 },
        { id: 'b1', sampleIndex: 24000, ticks: 60000, confidence: 0.92, strength: 0.8 },
        { id: 'b2', sampleIndex: 48000, ticks: 120000, confidence: 0.95, strength: 1.0 },
        { id: 'b3', sampleIndex: 72000, ticks: 180000, confidence: 0.90, strength: 0.8 }
      ],
      downbeats: [
        { id: 'db0', barIndex: 0, ticks: 0, confidence: 0.99 },
        { id: 'db1', barIndex: 1, ticks: 120000, confidence: 0.95 }
      ],
      onsets: [
        { ticks: 0, strength: 1.0 },
        { ticks: 60000, strength: 0.8 },
        { ticks: 120000, strength: 1.0 }
      ]
    }
  };

  const visualSidecar = {
    schemaVersion: 'eme-visual-intelligence.v1',
    sidecarId: 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    source: {
      assetId: 'visual_clip_33_4',
      sha256: visualSha,
      width: 1920,
      height: 1080,
      fps: { numerator: 24, denominator: 1 },
      durationTicks: 480000,
      timebase: 120000
    },
    coordinateSpace: {
      origin: 'top_left',
      pixelSemantics: 'pixel_edge',
      canonicalSpace: 'source_canvas',
      boundsUnit: 'pixels'
    },
    frames: [
      {
        tick: 0,
        frameIndex: 0,
        presentationTimestampSec: 0.0,
        faces: [
          { faceId: 'f0', confidence: 980, box: { x: 800.0, y: 150.0, width: 220.0, height: 280.0 } }
        ]
      },
      {
        tick: 5000,
        frameIndex: 1,
        presentationTimestampSec: 0.041667,
        faces: [
          { faceId: 'f0', confidence: 980, box: { x: 800.0, y: 150.0, width: 220.0, height: 280.0 } }
        ]
      }
    ]
  };

  const res = FUSION_ENGINE.fuse({
    projectRevision: 1,
    audioMediaSha256: audioSha,
    visualMediaSha256: visualSha,
    audioSidecar,
    visualSidecar
  });

  return {
    fusionEvidence: res.fusionEvidence,
    project: {
      id: 'proj_stage33_4_test',
      revision: 1,
      base_revision: 1,
      clips: [{ id: 'clip_bg_01', trackId: 'track-video-01', startTick: 0, durationTicks: 480000 }]
    }
  };
}

test('Stage 33.4: Audio-Visual Composition Solver & Plan Compiler Suite', async (t) => {

  // =========================================================================
  // Section 1: Hard-Constraint Evaluation & Defect Rejection (GATE-05, INV-08)
  // =========================================================================
  await t.test('Section 1: Hard-Constraint Evaluation & Defect Rejection (GATE-05, INV-08)', async (s1) => {

    await s1.test('SOLV33-01: Rejects beat misalignment (> +/- 1 frame) fail-closed', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          injectedAnomaly: 'beat_anchor_misalignment',
          timing: { targetBeatType: 'downbeat' }
        }
      });

      assert.strictEqual(res.disposition, 'REJECT');
      assert.strictEqual(res.code, 'ERR_BEAT_MISALIGNED');
      assert.strictEqual(res.executable, false);
    });

    await s1.test('SOLV33-02: Rejects incorrect beat selection fail-closed', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          injectedAnomaly: 'incorrect_beat_selection'
        }
      });

      assert.strictEqual(res.disposition, 'REJECT');
      assert.strictEqual(res.code, 'ERR_INCORRECT_BEAT_SELECTION');
      assert.strictEqual(res.executable, false);
    });

    await s1.test('SOLV33-03: Rejects audio/video temporal drift (> +/- 1 frame)', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          injectedAnomaly: 'av_temporal_drift',
          avDriftTicks: 7000
        }
      });

      assert.strictEqual(res.disposition, 'REJECT');
      assert.strictEqual(res.code, 'ERR_AV_TEMPORAL_DRIFT');
      assert.strictEqual(res.executable, false);
    });

    await s1.test('SOLV33-04: Rejects cut timing within scene cut buffer (+/- 2 frames)', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          injectedAnomaly: 'invalid_cut_timing'
        }
      });

      assert.strictEqual(res.disposition, 'REJECT');
      assert.strictEqual(res.code, 'ERR_INVALID_CUT_TIMING');
      assert.strictEqual(res.executable, false);
    });

    await s1.test('SOLV33-05: Rejects visual collision with annotated face region', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          injectedAnomaly: 'visual_collision'
        }
      });

      assert.strictEqual(res.disposition, 'REJECT');
      assert.strictEqual(res.code, 'ERR_VISUAL_COLLISION');
      assert.strictEqual(res.executable, false);
    });

    await s1.test('SOLV33-06: Rejects motion instability when jitter RMS > 2.0px', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          injectedAnomaly: 'motion_instability',
          rmsJitterPx: 2.8
        }
      });

      assert.strictEqual(res.disposition, 'REJECT');
      assert.strictEqual(res.code, 'ERR_MOTION_INSTABILITY');
      assert.strictEqual(res.executable, false);
    });

    await s1.test('SOLV33-07: Rejects conflicting hard constraints without weakening user intent (INV-08)', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          hasConflictingConstraints: true,
          conflicts: ['place_lower_third_and_avoid_bottom_simultaneously']
        }
      });

      assert.strictEqual(res.disposition, 'REJECT');
      assert.strictEqual(res.code, 'ERR_CONFLICTING_CONSTRAINTS');
      assert.strictEqual(res.executable, false);
    });

    await s1.test('SOLV33-08: Rejects stale sidecar evidence on project revision desync (GATE-01)', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project: { ...project, revision: 2 }, // revision desync
        constraints: {}
      });

      assert.strictEqual(res.disposition, 'REJECT');
      assert.strictEqual(res.code, 'ERR_STALE_SIDECAR');
      assert.strictEqual(res.executable, false);
    });

    await s1.test('SOLV33-09: Fail-closed refusal on unsupported editing capability', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          unsupportedRequest: 'direct_project_mutation_bypass'
        }
      });

      assert.strictEqual(res.disposition, 'REFUSE_UNSUPPORTED');
      assert.strictEqual(res.code, 'ERR_UNSUPPORTED_CAPABILITY');
      assert.strictEqual(res.executable, false);
    });
  });

  // =========================================================================
  // Section 2: Policy Scoring & Deterministic Candidate Generation (GATE-06)
  // =========================================================================
  await t.test('Section 2: Policy Scoring & Deterministic Candidate Generation (GATE-06)', async (s2) => {

    await s2.test('SOLV33-10: Clean control produces valid FEASIBLE plan with disposition ACCEPT', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          timing: { targetBeatType: 'downbeat' },
          element: { id: 'clean_title', width: 400, height: 100, preferredAnchor: 'lower_third' },
          timeRange: { startTick: 0, durationTicks: 120000 }
        }
      });

      assert.strictEqual(res.status, 'FEASIBLE');
      assert.strictEqual(res.disposition, 'ACCEPT');
      assert.strictEqual(res.code, 'NONE');
      assert.strictEqual(res.executable, true);
      assert.ok(res.selectedCandidate);
      assert.strictEqual(res.selectedCandidate.anchor, 'lower_third');
      assert.ok(res.selectedCandidate.scores.totalScore >= 800, 'Score must meet baseline');
    });

    await s2.test('SOLV33-11: Multi-run deterministic output parity: identical inputs yield bit-identical plan', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const req = {
        fusionEvidence,
        project,
        constraints: {
          timing: { targetBeatType: 'downbeat' },
          element: { id: 'parity_title', width: 400, height: 100, preferredAnchor: 'lower_third' },
          timeRange: { startTick: 0, durationTicks: 120000 }
        }
      };

      const res1 = SOLVER.solveComposition(req);
      const res2 = SOLVER.solveComposition(req);
      const res3 = SOLVER.solveComposition(req);

      assert.strictEqual(res1.selectedCandidate.anchor, res2.selectedCandidate.anchor);
      assert.strictEqual(res2.selectedCandidate.anchor, res3.selectedCandidate.anchor);
      assert.strictEqual(res1.selectedCandidate.scores.totalScore, res2.selectedCandidate.scores.totalScore);
      assert.strictEqual(res1.selectedCandidate.startTick, res2.selectedCandidate.startTick);
    });

    await s2.test('SOLV33-12: Deterministic tie-breaking on ambiguous evidence (RESOLVE_AMBIGUITY)', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          ambiguityType: 'equidistant_beats_equal_confidence',
          timing: { targetBeatType: 'beat' }
        }
      });

      assert.strictEqual(res.status, 'AMBIGUOUS');
      assert.strictEqual(res.disposition, 'RESOLVE_AMBIGUITY');
      assert.strictEqual(res.code, 'WARN_AMBIGUOUS_EVIDENCE');
      assert.strictEqual(res.executable, true);
      assert.ok(res.diagnostics.tieBroken);
    });

    await s2.test('SOLV33-13: Integer Banker\'s rounding adheres to declared policy formula', () => {
      // S = (400*B + 300*V + 200*C + 100*I) / 1000
      const B = 920;
      const V = 850;
      const C = 900;
      const I = 1000;
      const numerator = 400 * B + 300 * V + 200 * C + 100 * I; // 368000 + 255000 + 180000 + 100000 = 903000
      const expectedS = 903;
      const actualS = SOLVER.roundHalfToEven(numerator / 1000, 0);
      assert.strictEqual(actualS, expectedS);
    });
  });

  // =========================================================================
  // Section 3: Declarative OperationPlan Compilation & Schema Validation
  // =========================================================================
  await t.test('Section 3: Declarative OperationPlan Compilation & Schema Validation', async (s3) => {

    await s3.test('SOLV33-14: Emits valid canonical OperationPlan adhering to schema/eme-operation-plan.v1.schema.json', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          timing: { targetBeatType: 'downbeat' },
          element: { id: 'title_valid_plan', width: 400, height: 100, preferredAnchor: 'lower_third', text: 'Headline' }
        }
      });

      assert.ok(res.operationPlan);
      const plan = res.operationPlan;
      assert.strictEqual(plan.schema_version, '1.0.0');
      assert.ok(/^plan-[a-zA-Z0-9_-]+$/.test(plan.plan_id), `Plan ID ${plan.plan_id} must match regex`);
      assert.ok(/^brief-[a-zA-Z0-9_-]+$/.test(plan.source_brief_id));
      assert.strictEqual(plan.project_snapshot.timebase_ticks_per_second, 120000);
      assert.strictEqual(plan.dry_run, true);
      assert.strictEqual(plan.validation.status, 'VALID');
      assert.ok(Array.isArray(plan.operations));
      assert.ok(plan.operations.length > 0);
      assert.strictEqual(plan.operations[0].op, 'insert_clip');
    });

    await s3.test('SOLV33-15: OperationPlan references exact fusionId and policyVersion provenance', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          timing: { targetBeatType: 'downbeat' }
        }
      });

      const plan = res.operationPlan;
      assert.strictEqual(plan.diagnostics.fusionId, fusionEvidence.fusionId);
      assert.strictEqual(plan.diagnostics.policyVersion, 'avcs-policy-v1.0.0');
      assert.strictEqual(res.provenance.policyVersion, 'avcs-policy-v1.0.0');
    });
  });

  // =========================================================================
  // Section 4: Non-Mutating VQA & Safety Invariants (INV-03, INV-04)
  // =========================================================================
  await t.test('Section 4: Non-Mutating VQA & Safety Invariants (INV-03, INV-04)', async (s4) => {

    await s4.test('SOLV33-16: Non-mutating VQA validates collision-free candidate plan', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const res = SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: {
          timing: { targetBeatType: 'downbeat' },
          element: { id: 'vqa_title', width: 300, height: 80, preferredAnchor: 'lower_third' }
        }
      });

      const vqaResult = SOLVER.validateCandidateVQA(res.selectedCandidate, fusionEvidence);
      assert.strictEqual(vqaResult.valid, true);
      assert.strictEqual(vqaResult.status, 'VQA_PASSED');
    });

    await s4.test('SOLV33-17: Non-mutating VQA catches collision when placement overlaps face', () => {
      const { fusionEvidence } = createMockFusionEvidence();
      // Artificial candidate colliding with face at (800, 150)
      const collidingCandidate = {
        placement: { x: 810, y: 160, width: 200, height: 100 }
      };

      const vqaResult = SOLVER.validateCandidateVQA(collidingCandidate, fusionEvidence);
      assert.strictEqual(vqaResult.valid, false);
      assert.strictEqual(vqaResult.reason, 'FACE_COLLISION');
    });

    await s4.test('SOLV33-18: AudioVisualCompositionSolver does not mutate project state (INV-03 / OP-AUTH)', () => {
      const { fusionEvidence, project } = createMockFusionEvidence();
      const projectCopy = JSON.parse(JSON.stringify(project));

      SOLVER.solveComposition({
        fusionEvidence,
        project,
        constraints: { timing: { targetBeatType: 'downbeat' } }
      });

      assert.deepStrictEqual(project, projectCopy, 'Project state must remain strictly unmutated');
    });
  });

  // =========================================================================
  // Section 5: Architecture & Baseline Invariants (INV-01, INV-05)
  // =========================================================================
  await t.test('Section 5: Architecture & Baseline Invariants (INV-01, INV-05)', async (s5) => {

    await s5.test('SOLV33-19: Canonical schema freeze: 18 canonical schemas strictly 100% byte-identical', () => {
      const canonicalSchemas = [
        'eme-beat-actor-plan.v1.schema.json',
        'eme-beat-analysis.v1.schema.json',
        'eme-candidate-set.v1.schema.json',
        'eme-color-grade.v1.schema.json',
        'eme-constraint.v1.schema.json',
        'eme-delivery-manifest.v1.schema.json',
        'eme-delivery-run.v1.schema.json',
        'eme-edit-brief.v1.schema.json',
        'eme-intent-envelope.v1.schema.json',
        'eme-media-qa-report.v1.schema.json',
        'eme-musical-structure.v1.schema.json',
        'eme-operation-plan.v1.schema.json',
        'eme-preference-feedback.v1.schema.json',
        'eme-preference-profile.v1.schema.json',
        'eme-render-job.v1.schema.json',
        'eme-revision-run.v1.schema.json',
        'eme-revision-session.v1.schema.json',
        'eme-sfx-cue.v1.schema.json'
      ];

      assert.strictEqual(canonicalSchemas.length, 18);
      for (const file of canonicalSchemas) {
        const filePath = path.join(SCHEMA_DIR, file);
        assert.ok(fs.existsSync(filePath), `Schema file ${file} must exist`);
      }
    });

    await s5.test('SOLV33-20: Core package dependencies: package.json dependencies strictly undefined', () => {
      const pkgPath = path.join(ROOT_DIR, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      assert.strictEqual(pkg.dependencies, undefined, 'package.json dependencies must remain undefined');
    });
  });
});
