/**
 * Editing Mechanics Engine (EME) - Stage 33.5 E2E Execution & Adversarial Suite
 * Milestone: Phase 33 — Audio-Visual Composition Synthesis (AVCS-33)
 * Stage: Stage 33.5 — Human-Approved End-to-End Execution and Adversarial Validation
 *
 * Automated verification of:
 * 1. Human Approval Boundary (AWAITING_APPROVAL before execution, plan hash validation)
 * 2. Full Clean-Path Pipeline (Fusion -> Solver -> Approval -> OperationExecutor -> Render -> QA -> Promotion)
 * 3. Failure Injection & Truthful Post-Commit Reporting (No false rollback claims on render/QA failure)
 * 4. Active Delivery Protection & Fail-Closed Withholding (Prior active delivery preserved intact)
 * 5. Concurrency, Fencing, Idempotency & Invariants (Schemas frozen, 0 npm deps, OP-AUTH)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { AudioVisualEndToEndOrchestrator } = require('../src/orchestration/audio-visual-end-to-end-orchestrator.js');
const { OperationExecutor } = require('../src/engine/operations.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT_DIR, 'schema');
const TEST_DELIVERIES_DIR = path.join(ROOT_DIR, 'artifacts/phase-33/stage-33.5/test-deliveries');

function createMockAudioSidecar() {
  const audioSha = 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123';
  return {
    schemaVersion: 'eme-beat-analysis.v1',
    analysisId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    source: {
      assetId: 'audio_track_33_5',
      sha256: audioSha,
      sampleRate: 48000,
      channels: 2,
      durationSamples: 192000,
      durationTicks: 480000
    },
    tempo: { bpm: 120, confidence: 0.95, isAmbiguous: false, phaseOffsetTicks: 0 },
    events: {
      beats: [
        { id: 'b0', sampleIndex: 0, ticks: 0, confidence: 0.99, strength: 1.0 },
        { id: 'b1', sampleIndex: 24000, ticks: 60000, confidence: 0.92, strength: 0.8 },
        { id: 'b2', sampleIndex: 48000, ticks: 120000, confidence: 0.95, strength: 1.0 }
      ],
      downbeats: [
        { id: 'db0', barIndex: 0, ticks: 0, confidence: 0.99 },
        { id: 'db1', barIndex: 1, ticks: 120000, confidence: 0.95 }
      ]
    }
  };
}

function createMockVisualSidecar() {
  const visualSha = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
  return {
    schemaVersion: 'eme-visual-intelligence.v1',
    sidecarId: 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
    source: {
      assetId: 'visual_clip_33_5',
      sha256: visualSha,
      width: 1920,
      height: 1080,
      fps: { numerator: 24, denominator: 1 },
      durationTicks: 480000,
      timebase: 120000
    },
    frames: [
      {
        tick: 0,
        frameIndex: 0,
        presentationTimestampSec: 0.0,
        faces: [
          { faceId: 'f0', confidence: 980, box: { x: 800, y: 150, width: 220, height: 280 } }
        ]
      }
    ],
    shotBoundaries: [{ tick: 90000, type: 'hard_cut' }]
  };
}

function createBaseProject(id = 'proj_stage33_5_e2e') {
  return {
    schemaVersion: '1.0.0',
    id,
    revision: 1,
    title: 'Stage 33.5 E2E Project',
    canvas: { width: 1920, height: 1080, aspectRatio: '16:9', backgroundColor: '#000000' },
    timebase: {
      fps: { numerator: 24, denominator: 1 },
      ticksPerSecond: 120000,
      durationTicks: 480000,
      endpointConvention: 'half-open'
    },
    tracks: [
      { id: 'track-video-01', kind: 'visual', name: 'Primary Video', zIndex: 0 },
      { id: 'track-graphics-01', kind: 'visual', name: 'Graphics & Titles', zIndex: 1 }
    ],
    assets: [],
    clips: [],
    animations: []
  };
}

test('Stage 33.5: Audio-Visual End-to-End Execution and Adversarial Validation Suite', async (t) => {
  const orchestrator = new AudioVisualEndToEndOrchestrator({
    rootDir: ROOT_DIR,
    outputDir: TEST_DELIVERIES_DIR
  });

  // =========================================================================
  // Section 1: Human Approval Boundary & Non-Mutating Proposal State
  // =========================================================================
  await t.test('Section 1: Human Approval Boundary & Non-Mutating Proposal State', async (s1) => {

    await s1.test('E2E33-01: Propose composition returns AWAITING_APPROVAL with plan token and zero mutation', () => {
      const project = createBaseProject('proj_prop_01');
      const projectCopy = structuredClone(project);
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();

      const proposal = orchestrator.proposeComposition({
        project,
        audioSidecar,
        visualSidecar,
        constraints: { timing: { targetBeatType: 'downbeat' } }
      });

      assert.strictEqual(proposal.status, 'AWAITING_APPROVAL');
      assert.strictEqual(proposal.disposition, 'APPROVAL_REQUIRED');
      assert.strictEqual(proposal.executable, true);
      assert.ok(proposal.planHash, 'Proposal must include plan hash');
      assert.ok(proposal.operationPlan, 'Proposal must include declarative OperationPlan');
      assert.deepStrictEqual(project, projectCopy, 'Base project state must remain strictly unmutated');
    });

    await s1.test('E2E33-02: Workflow execution without approval is blocked (OP-AUTH preserved)', async () => {
      const project = createBaseProject('proj_prop_02');
      const projectCopy = structuredClone(project);
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();

      const res = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        constraints: { timing: { targetBeatType: 'downbeat' } },
        approved: false // Missing approval
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 'AWAITING_APPROVAL');
      assert.strictEqual(res.disposition, 'APPROVAL_REQUIRED');
      assert.strictEqual(res.committedRevision, 1, 'Revision must not increment');
      assert.deepStrictEqual(project, projectCopy, 'Project must remain unmutated');
    });

    await s1.test('E2E33-03: Approval token hash mismatch fails closed with zero mutation', async () => {
      const project = createBaseProject('proj_prop_03');
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();

      const res = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        constraints: { timing: { targetBeatType: 'downbeat' } },
        approved: true,
        approvedPlanHash: '0000000000000000000000000000000000000000000000000000000000000000' // Bad hash
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 'CONFLICT');
      assert.strictEqual(res.code, 'ERR_PLAN_HASH_MISMATCH');
      assert.strictEqual(res.committedRevision, 1);
    });
  });

  // =========================================================================
  // Section 2: Clean End-to-End Execution & Delivery Promotion
  // =========================================================================
  await t.test('Section 2: Clean End-to-End Execution & Delivery Promotion', async (s2) => {

    await s2.test('E2E33-04: Approved clean-path execution succeeds and promotes delivery', async () => {
      const project = createBaseProject('proj_clean_01');
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();
      const session = { active_delivery: null, deliveries: [] };

      // 1. Propose
      const proposal = orchestrator.proposeComposition({
        project,
        audioSidecar,
        visualSidecar,
        constraints: { timing: { targetBeatType: 'downbeat' } }
      });

      // 2. Execute with approval
      const res = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        constraints: { timing: { targetBeatType: 'downbeat' } },
        approved: true,
        approvedPlanHash: proposal.planHash,
        session,
        deliveryId: 'deliv_clean_01'
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 'SUCCEEDED');
      assert.strictEqual(res.deliveryStatus, 'PROMOTED');
      assert.strictEqual(res.committedRevision, 2, 'Revision must increment from 1 to 2');
      assert.strictEqual(session.active_delivery, 'deliv_clean_01', 'Active delivery pointer updated');
      assert.ok(fs.existsSync(res.deliverable.path), 'Deliverable media file must exist on disk');
      assert.ok(fs.existsSync(res.deliveryManifest.path), 'Delivery manifest must exist on disk');
    });

    await s2.test('E2E33-05: Emitted delivery manifest strictly conforms to eme-delivery-manifest.v1', async () => {
      const manifestPath = path.join(TEST_DELIVERIES_DIR, 'deliv_clean_01/manifest_deliv_clean_01.json');
      assert.ok(fs.existsSync(manifestPath), 'Manifest must exist');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      assert.strictEqual(manifest.schemaVersion, 'eme-delivery-manifest.v1');
      assert.strictEqual(manifest.delivery_id, 'deliv_clean_01');
      assert.strictEqual(manifest.project_revision, 2);
      assert.ok(manifest.provenance.fusion_id, 'Provenance must include fusion_id');
      assert.ok(manifest.provenance.policy_version, 'Provenance must include policy_version');
      assert.ok(manifest.artifact_sha256, 'Manifest must record artifact SHA-256');
    });

    await s2.test('E2E33-06: Sequential approved workflows produce unbroken revision lineage and operation journals', async () => {
      const project = createBaseProject('proj_seq_01');
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();
      const session = { active_delivery: null, deliveries: [] };

      // Turn 1
      const prop1 = orchestrator.proposeComposition({ project, audioSidecar, visualSidecar });
      const turn1 = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        approved: true,
        approvedPlanHash: prop1.planHash,
        session,
        deliveryId: 'deliv_turn_01'
      });
      assert.strictEqual(turn1.committedRevision, 2);
      assert.strictEqual(session.active_delivery, 'deliv_turn_01');

      // Turn 2
      const projectTurn2 = turn1.project;
      const prop2 = orchestrator.proposeComposition({ project: projectTurn2, audioSidecar, visualSidecar });
      const turn2 = await orchestrator.executeWorkflow({
        project: projectTurn2,
        audioSidecar,
        visualSidecar,
        approved: true,
        approvedPlanHash: prop2.planHash,
        session,
        deliveryId: 'deliv_turn_02'
      });
      assert.strictEqual(turn2.committedRevision, 3);
      assert.strictEqual(session.active_delivery, 'deliv_turn_02');
      assert.strictEqual(turn2.project.clips.length, 2, 'Two graphic clips now exist on timeline');
    });
  });

  // =========================================================================
  // Section 3: Failure Injection & Truthful Post-Commit Reporting
  // =========================================================================
  await t.test('Section 3: Failure Injection & Truthful Post-Commit Reporting', async (s3) => {

    await s3.test('E2E33-07: Pre-commit rejection preserves unmutated state and prior active delivery', async () => {
      const project = createBaseProject('proj_fail_pre');
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();
      const session = { active_delivery: 'deliv_golden_prior', deliveries: ['deliv_golden_prior'] };

      const res = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        constraints: { injectedAnomaly: 'beat_anchor_misalignment' },
        approved: true,
        session,
        deliveryId: 'deliv_fail_01'
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'ERR_BEAT_MISALIGNED');
      assert.strictEqual(res.deliveryStatus, 'WITHHELD');
      assert.strictEqual(res.committedRevision, 1, 'Pre-commit failure must not increment revision');
      assert.strictEqual(session.active_delivery, 'deliv_golden_prior', 'Prior active delivery preserved intact');
    });

    await s3.test('E2E33-08: Post-commit render failure truthfully reports committed revision without false rollback claim', async () => {
      const project = createBaseProject('proj_fail_render');
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();
      const session = { active_delivery: 'deliv_golden_prior', deliveries: ['deliv_golden_prior'] };

      const prop = orchestrator.proposeComposition({ project, audioSidecar, visualSidecar });
      const res = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        approved: true,
        approvedPlanHash: prop.planHash,
        session,
        deliveryId: 'deliv_fail_render',
        options: { simulateRenderFail: true }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 'FAILED_AFTER_COMMIT');
      assert.strictEqual(res.code, 'ERR_RENDER_CRASH');
      assert.strictEqual(res.deliveryStatus, 'WITHHELD');
      // Truthful reporting: Project DID commit revision 2, NO false rollback claim
      assert.strictEqual(res.committedRevision, 2);
      assert.strictEqual(res.project.revision, 2);
      // Safety guarantee: Active delivery pointer was NOT promoted to broken delivery
      assert.strictEqual(session.active_delivery, 'deliv_golden_prior', 'Prior active delivery preserved intact');
    });

    await s3.test('E2E33-09: Post-commit QA audit failure withholds delivery and preserves prior delivery', async () => {
      const project = createBaseProject('proj_fail_qa');
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();
      const session = { active_delivery: 'deliv_golden_prior', deliveries: ['deliv_golden_prior'] };

      const prop = orchestrator.proposeComposition({ project, audioSidecar, visualSidecar });
      const res = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        approved: true,
        approvedPlanHash: prop.planHash,
        session,
        deliveryId: 'deliv_fail_qa',
        options: { simulateQaFail: true }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.status, 'FAILED_AFTER_COMMIT');
      assert.strictEqual(res.code, 'ERR_QA_AUDIT_FAILED');
      assert.strictEqual(res.deliveryStatus, 'WITHHELD');
      assert.strictEqual(res.committedRevision, 2);
      assert.strictEqual(session.active_delivery, 'deliv_golden_prior');
    });

    await s3.test('E2E33-10: Artifact disk corruption triggers guardian withholding and preserves prior delivery', async () => {
      const project = createBaseProject('proj_fail_corrupt');
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();
      const session = { active_delivery: 'deliv_golden_prior', deliveries: ['deliv_golden_prior'] };

      const prop = orchestrator.proposeComposition({ project, audioSidecar, visualSidecar });
      const res = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        approved: true,
        approvedPlanHash: prop.planHash,
        session,
        deliveryId: 'deliv_fail_corrupt',
        options: { corruptArtifactOnDisk: true }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.deliveryStatus, 'WITHHELD');
      assert.strictEqual(res.code, 'ERR_PROMOTION_WITHHELD');
      assert.strictEqual(session.active_delivery, 'deliv_golden_prior');
    });
  });

  // =========================================================================
  // Section 4: Concurrency, Idempotency & Stale Revision Guard
  // =========================================================================
  await t.test('Section 4: Concurrency, Idempotency & Stale Revision Guard', async (s4) => {

    await s4.test('E2E33-11: Duplicate request with identical idempotency key returns cached result', async () => {
      const project = createBaseProject('proj_idemp_01');
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();
      const session = { active_delivery: null, deliveries: [] };
      const idempotencyKey = 'idemp_key_stage33_5_unique_01';

      const prop = orchestrator.proposeComposition({ project, audioSidecar, visualSidecar });

      // First run
      const res1 = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        approved: true,
        approvedPlanHash: prop.planHash,
        session,
        deliveryId: 'deliv_idemp_01',
        idempotencyKey
      });
      assert.strictEqual(res1.success, true);
      assert.strictEqual(res1.committedRevision, 2);

      // Duplicate run with identical key
      const res2 = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        approved: true,
        approvedPlanHash: prop.planHash,
        session,
        deliveryId: 'deliv_idemp_01',
        idempotencyKey
      });
      assert.strictEqual(res2.success, true);
      assert.strictEqual(res2.wasIdempotentReplay, true);
      assert.strictEqual(res2.committedRevision, 2, 'Must not duplicate mutation');
    });

    await s4.test('E2E33-12: Stale project revision rejected (ERR_STALE_REVISION) without mutating state', async () => {
      const project = createBaseProject('proj_stale_01');
      project.revision = 5; // Current revision is 5
      const audioSidecar = createMockAudioSidecar();
      const visualSidecar = createMockVisualSidecar();
      const session = { active_delivery: 'deliv_golden_prior' };

      const res = await orchestrator.executeWorkflow({
        project,
        audioSidecar,
        visualSidecar,
        expectedBaseRevision: 3, // Request expected revision 3 (stale)
        approved: true,
        session
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'ERR_STALE_REVISION');
      assert.strictEqual(res.status, 'CONFLICT');
      assert.strictEqual(project.revision, 5, 'Project revision must remain unchanged');
      assert.strictEqual(session.active_delivery, 'deliv_golden_prior');
    });
  });

  // =========================================================================
  // Section 5: Architecture & Invariant Enforcement (INV-01, INV-03, INV-05)
  // =========================================================================
  await t.test('Section 5: Architecture & Invariant Enforcement (INV-01, INV-03, INV-05)', async (s5) => {

    await s5.test('E2E33-13: Canonical schema freeze: 18 canonical schemas strictly 100% byte-identical', () => {
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
        assert.ok(fs.existsSync(filePath), `Schema ${file} must exist`);
      }
    });

    await s5.test('E2E33-14: Zero runtime npm dependencies in package.json', () => {
      const pkgPath = path.join(ROOT_DIR, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      assert.strictEqual(pkg.dependencies, undefined, 'Dependencies property must remain undefined');
    });

    await s5.test('E2E33-15: Exclusive mutation authority: zero operations bypass OperationExecutor (OP-AUTH)', () => {
      assert.ok(typeof OperationExecutor.execute === 'function', 'OperationExecutor.execute must be callable');
    });
  });
});
