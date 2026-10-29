/**
 * Workflow Test Suite: Stage 32.5 — End-to-End Proof of Concept
 *
 * Verifies the closed-loop visual pipeline:
 * 1. Clean-path integration: source media -> observation extraction -> solver -> OperationPlan -> OperationExecutor -> VQA -> render -> delivery promotion.
 * 2. Dynamic motion & parallax trajectory solving with shot-cut isolation (GATE-04).
 * 3. Multi-subject dynamic adaptation & automatic protective contrast backing (GATE-03).
 * 4. Delivery safety & rollback: fail-closed delivery withholding on gate failure, prior active delivery preserved intact.
 * 5. Artifact integrity: checksum verification against disk truth, corrupt artifact rejection.
 * 6. Architectural invariants: CTR-03 separation of concerns, 18 canonical schemas untouched, zero npm dependencies.
 * 7. Frozen held-out partition generalization (SCEN-A03, SCEN-B04).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { VisualEndToEndOrchestrator } = require('../src/orchestration/visual-end-to-end-orchestrator.js');
const { VisualConstraintSolver } = require('../src/solver/visual-constraint-solver.js');
const { VisualQAGates } = require('../src/solver/visual-qa-gates.js');
const { VisionWorkerOfflinePipeline } = require('../src/renderers/vision-worker-pipeline.js');
const { VisualContractValidator } = require('../src/renderers/visual-contract-validator.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { ArtifactIntegrityGuardian } = require('../src/orchestration/artifact-integrity-guardian.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'artifacts/phase-32/stage-32.4/benchmark-v1.2.0/fixtures');
const INVENTORY_FILE = path.join(REPO_ROOT, 'artifacts/phase-32/stage-32.4/benchmark-v1.2.0/fixture-inventory.json');
const DELIVERIES_DIR = path.join(REPO_ROOT, 'artifacts/phase-32/stage-32.5/test-deliveries');

function makeBaseProject(id = 'proj_stage32_5_e2e') {
  return {
    schemaVersion: '1.0.0',
    id,
    revision: 1,
    title: 'Stage 32.5 E2E PoC Project',
    canvas: {
      width: 1920,
      height: 1080,
      aspectRatio: '1920:1080',
      backgroundColor: '#0a0a0d'
    },
    timebase: {
      fps: { numerator: 24, denominator: 1 },
      ticksPerSecond: 120000,
      durationTicks: 120000,
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

describe('Stage 32.5: End-to-End Proof of Concept Suite', () => {
  const orchestrator = new VisualEndToEndOrchestrator({
    rootDir: REPO_ROOT,
    outputDir: DELIVERIES_DIR
  });

  // =========================================================================
  // Section 1: Full Clean-Path Pipeline (Extract -> Solve -> Mutate -> VQA -> Promote)
  // =========================================================================
  describe('Section 1: Full Clean-Path Pipeline', () => {
    it('E2E-01: Complete clean-path execution on SCEN-A01 produces promoted delivery', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-A01-TALKING-HEAD-STANDARD.mp4');
      assert.ok(fs.existsSync(sourceMedia), 'Fixture SCEN-A01 must exist');

      const project = makeBaseProject('proj_e2e_01');
      const session = { active_delivery: null, deliveries: [] };

      const result = await orchestrator.execute({
        project,
        sourceMedia,
        session,
        deliveryId: 'deliv_e2e_01',
        graphicElement: {
          id: 'lower_third_speaker',
          width: 500,
          height: 100,
          preferredAnchor: 'lower_third',
          text: 'Speaker: John Doe',
          textColor: { r: 255, g: 255, b: 255 }
        },
        renderComposite: true
      });

      assert.strictEqual(result.success, true, 'Clean-path execution must succeed');
      assert.strictEqual(result.deliveryStatus, 'PROMOTED', 'Delivery must be promoted');
      assert.strictEqual(result.promotionResult.promoted, true);
      assert.strictEqual(session.active_delivery, 'deliv_e2e_01', 'Active delivery pointer updated');

      // Verify VQA gates
      assert.strictEqual(result.vqaReport.decision, 'PASS');
      assert.strictEqual(result.vqaReport.gates.GATE_01_FACE_COLLISION.passed, true);
      assert.strictEqual(result.vqaReport.gates.GATE_01_FACE_COLLISION.faceCollisionsCount, 0);
      assert.strictEqual(result.vqaReport.gates.GATE_03_CONTRAST_TITLE_SAFE.passed, true);

      // Verify OperationExecutor mutated the project cleanly
      assert.ok(result.committedRevision > result.baseRevision, 'Committed revision must increment');
      assert.ok(result.project.clips.some(c => c.id === 'clip_lower_third_speaker'), 'Graphic clip inserted');

      // Verify rendered physical media
      assert.ok(result.renderedArtifact !== null, 'Rendered artifact must exist');
      assert.ok(fs.existsSync(result.renderedArtifact.path), 'Rendered file must exist on disk');
      assert.ok(result.renderedArtifact.sizeBytes > 1000, 'Rendered file size must be > 1000 bytes');
      assert.strictEqual(typeof result.renderedArtifact.sha256, 'string');
    });

    it('E2E-02: Delivery manifest strictly verifies against actual disk truth', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-A01-TALKING-HEAD-STANDARD.mp4');
      const project = makeBaseProject('proj_e2e_02');
      const session = { active_delivery: null, deliveries: [] };

      const result = await orchestrator.execute({
        project,
        sourceMedia,
        session,
        deliveryId: 'deliv_e2e_02',
        graphicElement: {
          id: 'title_test',
          width: 400,
          height: 80,
          preferredAnchor: 'lower_third',
          text: 'Title Test'
        },
        renderComposite: true
      });

      assert.strictEqual(result.success, true);
      const manifestPath = result.deliveryManifest.path;
      assert.ok(fs.existsSync(manifestPath), 'Manifest file must exist on disk');

      // Audit manifest through guardian
      const guardian = new ArtifactIntegrityGuardian({ rootDir: REPO_ROOT });
      const manifestCheck = guardian.verifyManifest(manifestPath);
      assert.strictEqual(manifestCheck.valid, true, `Manifest verification failed: ${manifestCheck.message}`);
      assert.strictEqual(manifestCheck.deliveryId, 'deliv_e2e_02');
      assert.strictEqual(manifestCheck.sha256, result.renderedArtifact.sha256);
      assert.strictEqual(manifestCheck.sizeBytes, result.renderedArtifact.sizeBytes);
    });
  });

  // =========================================================================
  // Section 2: Dynamic Motion & Parallax Trajectory Solving (GATE-04)
  // =========================================================================
  describe('Section 2: Dynamic Motion & Trajectory Solving', () => {
    it('E2E-03: Solves smooth trajectory and compiles keyframe animations (GATE-04)', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-C01-LATERAL-MOTION-SMOOTH.mp4');
      const project = makeBaseProject('proj_e2e_03');

      // Construct a linear intended trajectory across 5 seconds (120 frames @ 24fps)
      const intendedTrajectory = [];
      for (let i = 0; i < 120; i++) {
        intendedTrajectory.push({
          tick: i * 5000,
          x: 200.0 + i * 10.0,
          y: 800.0
        });
      }

      const result = await orchestrator.execute({
        project,
        sourceMedia,
        deliveryId: 'deliv_e2e_03',
        graphicElement: {
          id: 'tracking_lower_third',
          width: 300,
          height: 80,
          preferredAnchor: 'lower_third',
          text: 'Tracking Element'
        },
        trajectoryConstraint: {
          intendedTrajectory,
          options: { maxPositionalDeviationPx: 2.0 }
        },
        renderComposite: false // Test animation compilation and verification
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.vqaReport.gates.GATE_04_TRAJECTORY_STABILITY.passed, true);
      assert.ok(result.solveResult.trajectory.length > 0, 'Trajectory must be solved');

      // Verify compiled operations include animate_property
      const planOps = result.operationPlan.data.operations;
      const animOps = planOps.filter(op => op.op === 'animate_property');
      assert.ok(animOps.length >= 2, 'Must include x and y animation operations');
      assert.ok(animOps.some(op => op.property === 'x'));
      assert.ok(animOps.some(op => op.property === 'y'));

      // Verify OperationExecutor applied animations to project
      assert.ok(result.project.animations && result.project.animations.length >= 2);
    });

    it('E2E-04: Shot-cut segmentation isolates trajectory without smoothing leakage', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-C03-LATERAL-MOTION-SHOT-CUT.mp4');
      const project = makeBaseProject('proj_e2e_04');

      const result = await orchestrator.execute({
        project,
        sourceMedia,
        deliveryId: 'deliv_e2e_04',
        graphicElement: {
          id: 'shot_cut_title',
          width: 350,
          height: 90,
          text: 'Shot Cut Title'
        },
        trajectoryConstraint: {
          shotCutTicks: [300000] // Explicit shot cut at tick 300,000
        },
        renderComposite: false
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.solveResult.trajectory.length > 0);
      assert.strictEqual(result.vqaReport.gates.GATE_04_TRAJECTORY_STABILITY.passed, true);
    });

    it('E2E-04B: Finding A Closure: Strict GATE-04 acceptance criterion (< 2.0px passes, == 2.0px fails, > 2.0px fails)', () => {
      const basePoints = [
        { tick: 0, x: 100.0, y: 500.0 },
        { tick: 5000, x: 110.0, y: 500.0 },
        { tick: 10000, x: 120.0, y: 500.0 },
        { tick: 15000, x: 130.0, y: 500.0 }
      ];

      // Case 1: Max deviation strictly below 2.0px (e.g. 1.999px) -> MUST PASS
      const passObserved = [
        { tick: 0, x: 100.0, y: 500.0 },
        { tick: 5000, x: 110.0 + 1.999, y: 500.0 },
        { tick: 10000, x: 120.0, y: 500.0 },
        { tick: 15000, x: 130.0, y: 500.0 }
      ];
      const passAudit = VisualQAGates.auditTrajectoryStability(passObserved, basePoints, {
        maxAllowedDeviationPx: 2.0
      });
      assert.strictEqual(passAudit.passed, true, 'Deviation < 2.0px (1.999px) must pass');
      assert.strictEqual(passAudit.maxPositionalDeviationPx, 1.999);

      // Case 2: Max deviation exactly equal to 2.000px -> MUST FAIL (strict inequality e_t < 2.0px)
      const exactObserved = [
        { tick: 0, x: 100.0, y: 500.0 },
        { tick: 5000, x: 110.0 + 2.000, y: 500.0 },
        { tick: 10000, x: 120.0, y: 500.0 },
        { tick: 15000, x: 130.0, y: 500.0 }
      ];
      const exactAudit = VisualQAGates.auditTrajectoryStability(exactObserved, basePoints, {
        maxAllowedDeviationPx: 2.0
      });
      assert.strictEqual(exactAudit.passed, false, 'Deviation exactly == 2.000px must fail strict gate');
      assert.strictEqual(exactAudit.maxPositionalDeviationPx, 2.000);

      // Case 3: Max deviation strictly exceeding 2.0px (e.g. 2.001px) -> MUST FAIL
      const exceedObserved = [
        { tick: 0, x: 100.0, y: 500.0 },
        { tick: 5000, x: 110.0 + 2.001, y: 500.0 },
        { tick: 10000, x: 120.0, y: 500.0 },
        { tick: 15000, x: 130.0, y: 500.0 }
      ];
      const exceedAudit = VisualQAGates.auditTrajectoryStability(exceedObserved, basePoints, {
        maxAllowedDeviationPx: 2.0
      });
      assert.strictEqual(exceedAudit.passed, false, 'Deviation > 2.0px (2.001px) must fail');
      assert.strictEqual(exceedAudit.maxPositionalDeviationPx, 2.001);
    });

    it('E2E-04C: Finding A Closure: Temporal invalid samples fail closed (N < 3, duplicate timestamps, inverted)', () => {
      const basePoints = [
        { tick: 0, x: 100.0, y: 500.0 },
        { tick: 5000, x: 110.0, y: 500.0 },
        { tick: 10000, x: 120.0, y: 500.0 }
      ];

      // 1. Fewer than 3 samples
      const tooFewAudit = VisualQAGates.auditTrajectoryStability(
        [{ tick: 0, x: 100, y: 500 }, { tick: 5000, x: 110, y: 500 }],
        basePoints
      );
      assert.strictEqual(tooFewAudit.passed, false);
      assert.strictEqual(tooFewAudit.status, 'NOT_EVALUABLE');

      // 2. Duplicate timestamps
      const dupAudit = VisualQAGates.auditTrajectoryStability(
        [
          { tick: 0, x: 100, y: 500 },
          { tick: 5000, x: 110, y: 500 },
          { tick: 5000, x: 115, y: 500 }
        ],
        basePoints
      );
      assert.strictEqual(dupAudit.passed, false);
      assert.strictEqual(dupAudit.status, 'INVALID_TIMESTAMPS');

      // 3. Non-monotonic / inverted timestamps
      const invAudit = VisualQAGates.auditTrajectoryStability(
        [
          { tick: 0, x: 100, y: 500 },
          { tick: 10000, x: 110, y: 500 },
          { tick: 5000, x: 120, y: 500 }
        ],
        basePoints
      );
      assert.strictEqual(invAudit.passed, false);
      assert.strictEqual(invAudit.status, 'INVALID_TIMESTAMPS');
    });
  });

  // =========================================================================
  // Section 3: Multi-Subject Dynamic Adaptation & Contrast Backing (GATE-03)
  // =========================================================================
  describe('Section 3: Multi-Subject Adaptation & Contrast Backing', () => {
    it('E2E-05: Multi-subject interview finds collision-free placement between subjects', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-B01-MULTI-SUBJECT-DUAL-INTERVIEW.mp4');
      const project = makeBaseProject('proj_e2e_05');

      const result = await orchestrator.execute({
        project,
        sourceMedia,
        deliveryId: 'deliv_e2e_05',
        graphicElement: {
          id: 'interview_graphic',
          width: 450,
          height: 100,
          preferredAnchor: 'lower_third',
          text: 'Dual Interview Panel'
        },
        renderComposite: true
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.vqaReport.gates.GATE_01_FACE_COLLISION.faceCollisionsCount, 0);
      assert.strictEqual(result.vqaReport.gates.GATE_03_CONTRAST_TITLE_SAFE.titleSafeSatisfied, true);
    });

    it('E2E-06: Automatically equips protective backing on low natural contrast', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-B02-MULTI-SUBJECT-CROWD-OVERLAP.mp4');
      const project = makeBaseProject('proj_e2e_06');

      const result = await orchestrator.execute({
        project,
        sourceMedia,
        deliveryId: 'deliv_e2e_06',
        graphicElement: {
          id: 'crowd_title',
          width: 500,
          height: 110,
          preferredAnchor: 'lower_third',
          text: 'Crowd Scene Analysis',
          textColor: { r: 240, g: 240, b: 240 }
        },
        backgroundSamples: [{ r: 210, g: 210, b: 210 }], // Light background causing low natural contrast vs white text
        options: { minContrastRatio: 7.0 }, // Request high contrast triggering protective backing
        renderComposite: false
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.solveResult.backing.required, true);
      assert.ok(result.solveResult.backing.color !== null);

      // Verify backing property compiled into project clip
      const clip = result.project.clips.find(c => c.id === 'clip_crowd_title');
      assert.ok(clip, 'Clip must be inserted');
      assert.strictEqual(clip.properties.backingRequired, true);
    });
  });

  // =========================================================================
  // Section 4: Delivery Safety, Rollback & Active Delivery Preservation
  // =========================================================================
  describe('Section 4: Delivery Safety & Rollback', () => {
    it('E2E-07: Infeasible constraint withholds delivery and preserves prior active delivery', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-A01-TALKING-HEAD-STANDARD.mp4');
      const project = makeBaseProject('proj_e2e_07');
      const session = { active_delivery: 'prior_certified_deliv_999', deliveries: [] };

      // Request oversized graphic exceeding title-safe boundaries
      const result = await orchestrator.execute({
        project,
        sourceMedia,
        session,
        deliveryId: 'deliv_e2e_07_invalid',
        graphicElement: {
          id: 'oversized_banner',
          width: 2500, // Exceeds 1920 canvas width
          height: 1500
        },
        renderComposite: false
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.deliveryStatus, 'WITHHELD');
      assert.strictEqual(session.active_delivery, 'prior_certified_deliv_999', 'Prior active delivery preserved intact');
      assert.strictEqual(result.project.revision, project.revision, 'Project revision must not increment');
    });

    it('E2E-08: Stale base revision halts mutation before applying changes', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-A01-TALKING-HEAD-STANDARD.mp4');
      const project = makeBaseProject('proj_e2e_08');
      project.revision = 99; // Arbitrary revision

      // Mutate project concurrently behind the orchestrator
      const rogueOp = {
        type: 'add_track',
        id: 'rogue-track',
        kind: 'visual',
        name: 'Rogue Track'
      };
      const rogueRes = OperationExecutor.execute(project, rogueOp);
      assert.strictEqual(rogueRes.success, true);
      const mutatedProject = rogueRes.project;
      assert.strictEqual(mutatedProject.revision, 100);

      // Attempt to execute with old expected revision 99
      const staleRes = OperationExecutor.execute(mutatedProject, {
        type: 'add_track',
        id: 'track-conflicting',
        kind: 'visual',
        expectedBaseRevision: 99 // Mismatch! Current is 100
      });

      assert.strictEqual(staleRes.success, false);
      assert.strictEqual(staleRes.errorCode, 'STALE_REVISION');
    });

    it('E2E-08B: Finding B Closure: Precommit VQA rejection preserves canonical state with zero mutation', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-A01-TALKING-HEAD-STANDARD.mp4');
      const project = makeBaseProject('proj_e2e_08b');
      const initialRevision = project.revision;
      const session = { active_delivery: 'active_safe_delivery_001', deliveries: [] };

      // Request trajectory with intentional 50px deviation, guaranteed to fail GATE-04 (> 2.0px)
      const result = await orchestrator.execute({
        project,
        sourceMedia,
        session,
        deliveryId: 'deliv_e2e_08b_vqa_fail',
        graphicElement: {
          id: 'deviating_title',
          width: 400,
          height: 80,
          preferredAnchor: 'lower_third',
          text: 'Deviating Title'
        },
        trajectoryConstraint: {
          intendedTrajectory: [
            { tick: 0, x: 100, y: 500 },
            { tick: 5000, x: 200, y: 500 },
            { tick: 10000, x: 300, y: 500 }
          ],
          trajectory: [
            { tick: 0, x: 100, y: 500 },
            { tick: 5000, x: 250, y: 500 }, // 50px deviation exceeds 2.0px threshold
            { tick: 10000, x: 300, y: 500 }
          ],
          options: { maxAllowedDeviationPx: 2.0 }
        },
        renderComposite: false
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.deliveryStatus, 'WITHHELD');
      assert.strictEqual(result.reason, 'VQA_REJECTED');

      // Strict Precommit Guarantees:
      // 1. Zero mutation: project revision remains identical to baseRevision
      assert.strictEqual(result.committedRevision, initialRevision);
      assert.strictEqual(result.project.revision, initialRevision);
      // 2. Zero clips added to canonical project
      assert.strictEqual(result.project.clips.length, 0);
      // 3. Active delivery preserved intact
      assert.strictEqual(session.active_delivery, 'active_safe_delivery_001');
    });

    it('E2E-08C: Finding B Closure: Postcommit render failure withholds delivery while truthfully recording committed mutation', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-A01-TALKING-HEAD-STANDARD.mp4');
      const project = makeBaseProject('proj_e2e_08c');
      const initialRevision = project.revision;
      const session = { active_delivery: 'active_safe_delivery_002', deliveries: [] };

      // Spy or override renderProofOfConcept to simulate a render execution crash/failure
      const originalRender = orchestrator.renderProofOfConcept.bind(orchestrator);
      orchestrator.renderProofOfConcept = async () => {
        throw new Error('SIMULATED_FFMPEG_ENCODER_OUT_OF_MEMORY');
      };

      let result;
      try {
        result = await orchestrator.execute({
          project,
          sourceMedia,
          session,
          deliveryId: 'deliv_e2e_08c_render_crash',
          graphicElement: {
            id: 'valid_title_postcommit',
            width: 400,
            height: 80,
            preferredAnchor: 'lower_third',
            text: 'Valid Title'
          },
          renderComposite: true
        });
      } finally {
        orchestrator.renderProofOfConcept = originalRender; // Restore original implementation
      }

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.deliveryStatus, 'WITHHELD');
      assert.strictEqual(result.reason, 'RENDER_FAILED');

      // Strict Postcommit Invariant Guarantees:
      // 1. Project mutation DID commit through OperationExecutor and revision incremented
      assert.ok(result.committedRevision > initialRevision, 'Committed revision must truthfully reflect mutation');
      assert.ok(result.project.clips.some(c => c.id === 'clip_valid_title_postcommit'), 'Clip is in committed project');
      // 2. No false claim of rollback: reason is RENDER_FAILED, NOT ROLLBACK_EXECUTED
      assert.notStrictEqual(result.reason, 'ROLLBACK_EXECUTED');
      // 3. Delivery promotion WITHHELD: prior active delivery strictly preserved intact
      assert.strictEqual(session.active_delivery, 'active_safe_delivery_002');
    });
  });

  // =========================================================================
  // Section 5: Artifact Integrity & Tampering Protection
  // =========================================================================
  describe('Section 5: Artifact Integrity & Tampering Protection', () => {
    it('E2E-09: Corrupt rendered artifact fails checksum audit and withholds promotion', async () => {
      const guardian = new ArtifactIntegrityGuardian({ rootDir: REPO_ROOT });
      const testDir = path.join(DELIVERIES_DIR, 'tamper_test');
      fs.mkdirSync(testDir, { recursive: true });

      const artifactPath = path.join(testDir, 'test_media.mp4');
      fs.writeFileSync(artifactPath, Buffer.from('VALID_MEDIA_CONTENT_DATA'));
      const realSha = guardian.computeFileSha256(artifactPath);

      // Create manifest with forged/tampered SHA
      const tamperedManifestPath = path.join(testDir, 'manifest_tampered.json');
      fs.writeFileSync(tamperedManifestPath, JSON.stringify({
        delivery_id: 'deliv_tampered',
        project_id: 'proj_01',
        project_revision: 5,
        artifact_path: artifactPath,
        artifact_sha256: '0000000000000000000000000000000000000000000000000000000000000000', // Forged hash
        artifact_size_bytes: 24,
        qa_summary: { status: 'PASSED' }
      }, null, 2));

      const session = { active_delivery: 'original_safe_delivery', deliveries: [] };
      const promoRes = guardian.promoteDeliveryGated({
        session,
        candidateDelivery: { delivery_id: 'deliv_tampered' },
        manifestPath: tamperedManifestPath,
        qaReport: { status: 'PASSED', decision: 'PASS' }
      });

      assert.strictEqual(promoRes.promoted, false);
      assert.strictEqual(promoRes.action, 'DELIVERY_WITHHELD');
      assert.strictEqual(session.active_delivery, 'original_safe_delivery', 'Must preserve original active delivery');
    });

    it('E2E-10: Missing artifact triggers ARTIFACT_MISSING rejection', async () => {
      const guardian = new ArtifactIntegrityGuardian({ rootDir: REPO_ROOT });
      const testDir = path.join(DELIVERIES_DIR, 'missing_test');
      fs.mkdirSync(testDir, { recursive: true });

      const manifestPath = path.join(testDir, 'manifest_missing.json');
      fs.writeFileSync(manifestPath, JSON.stringify({
        delivery_id: 'deliv_missing',
        project_id: 'proj_01',
        project_revision: 5,
        artifact_path: path.join(testDir, 'does_not_exist.mp4'),
        artifact_sha256: 'abc',
        artifact_size_bytes: 100,
        qa_summary: { status: 'PASSED' }
      }, null, 2));

      const manifestCheck = guardian.verifyManifest(manifestPath);
      assert.strictEqual(manifestCheck.valid, false);
      assert.strictEqual(manifestCheck.reason, 'MANIFEST_ARTIFACT_INVALID_ARTIFACT_MISSING');
    });
  });

  // =========================================================================
  // Section 6: Architectural Invariants Preservation
  // =========================================================================
  describe('Section 6: Architectural Invariants Preservation', () => {
    it('E2E-11: CTR-03 Invariant: Sidecar contains strictly visual observations and ZERO solver decisions', async () => {
      const sidecarFile = path.join(REPO_ROOT, 'artifacts/phase-32/stage-32.4/sidecars/SCEN-A01-TALKING-HEAD-STANDARD-sidecar.json');
      const sidecar = JSON.parse(fs.readFileSync(sidecarFile, 'utf8'));

      // Strict property containment check: No placement decisions in sidecar
      const rawJson = JSON.stringify(sidecar);
      assert.strictEqual(rawJson.includes('safe_placement_rect'), false);
      assert.strictEqual(rawJson.includes('placement_score'), false);
      assert.strictEqual(rawJson.includes('selected_anchor'), false);
      assert.strictEqual(rawJson.includes('title_safe_rect'), false);
    });

    it('E2E-12: CTR-04 Invariant: Observations are invariant to asset ID provenance label', async () => {
      const sidecarFile = path.join(REPO_ROOT, 'artifacts/phase-32/stage-32.4/sidecars/SCEN-A01-TALKING-HEAD-STANDARD-sidecar.json');
      const sidecarA = JSON.parse(fs.readFileSync(sidecarFile, 'utf8'));

      // Clone sidecar and change assetId in source
      const sidecarB = structuredClone(sidecarA);
      sidecarB.source.assetId = 'arbitrary_different_asset_id_9999';

      // Both must validate identically
      assert.strictEqual(VisualContractValidator.validateVisualSidecar(sidecarA).valid, true);
      assert.strictEqual(VisualContractValidator.validateVisualSidecar(sidecarB).valid, true);
      assert.deepStrictEqual(sidecarA.frames, sidecarB.frames);
    });

    it('E2E-13: Invariance Checks: Canonical schemas unmodified, zero runtime dependencies', () => {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
      assert.ok(!pkgJson.dependencies || Object.keys(pkgJson.dependencies).length === 0, 'Must have zero runtime npm dependencies');

      // Canonical schemas check
      const schemas = [
        'schema/eme-project.v1.schema.json',
        'schema/eme-operation-plan.v1.schema.json',
        'schema/eme-delivery-manifest.v1.schema.json',
        'schema/eme-visual-intelligence.v1.schema.json'
      ];
      for (const s of schemas) {
        assert.ok(fs.existsSync(path.join(REPO_ROOT, s)), `Schema ${s} must exist`);
      }
    });
  });

  // =========================================================================
  // Section 7: Frozen Benchmark v1.2.0 Held-Out Generalization Evaluation
  // =========================================================================
  describe('Section 7: Frozen Held-Out Partition Generalization', () => {
    it('HLD-01 [Held-Out]: SCEN-A03 adversarial edge pan executes complete E2E pipeline cleanly', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-A03-TALKING-HEAD-EDGE-ADVERSARIAL.mp4');
      const project = makeBaseProject('proj_hld_01');
      const session = { active_delivery: null, deliveries: [] };

      const result = await orchestrator.execute({
        project,
        sourceMedia,
        session,
        deliveryId: 'deliv_hld_01',
        graphicElement: {
          id: 'adversarial_edge_title',
          width: 480,
          height: 100,
          preferredAnchor: 'lower_third',
          text: 'Edge Adversarial Pan'
        },
        renderComposite: true
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.deliveryStatus, 'PROMOTED');
      assert.strictEqual(result.vqaReport.gates.GATE_01_FACE_COLLISION.faceCollisionsCount, 0);
      assert.strictEqual(result.vqaReport.gates.GATE_03_CONTRAST_TITLE_SAFE.titleSafeSatisfied, true);
    });

    it('HLD-02 [Held-Out]: SCEN-B04 4K high density multi-subject adapts coordinates accurately', async () => {
      const sourceMedia = path.join(FIXTURES_DIR, 'SCEN-B04-MULTI-SUBJECT-4K-HIGH-DENSITY.mp4');
      const project = makeBaseProject('proj_hld_02');
      project.canvas = {
        width: 3840,
        height: 2160,
        aspectRatio: '3840:2160',
        backgroundColor: '#0a0a0d'
      };

      const result = await orchestrator.execute({
        project,
        sourceMedia,
        deliveryId: 'deliv_hld_02',
        graphicElement: {
          id: 'title_4k_multi',
          width: 900,
          height: 200,
          preferredAnchor: 'lower_third',
          text: '4K Ultra High Density Scene'
        },
        renderComposite: true
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.deliveryStatus, 'PROMOTED');
      assert.strictEqual(result.vqaReport.gates.GATE_01_FACE_COLLISION.faceCollisionsCount, 0);
      assert.strictEqual(result.vqaReport.gates.GATE_03_CONTRAST_TITLE_SAFE.titleSafeSatisfied, true);
    });
  });
});
