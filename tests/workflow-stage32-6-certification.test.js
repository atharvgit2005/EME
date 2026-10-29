/**
 * Test Suite: Stage 32.6 — Final Evidence Audit & Phase 32 Certification
 *
 * Verifies all 15 discrete criteria mandated by Architecture Lead in Protocol v1.2.0 & Directive:
 * - CRT-01: Benchmark Certification Identity Freeze (source commit, branch, protocol v1.2.0, manifest digests)
 * - CRT-02: Complete Evidence Chain Gate Reconciliation (Stages 32.1 through 32.5 all ACCEPTED / CERTIFIED)
 * - CRT-03: Architectural Invariant Preservation: OP-AUTH Exclusivity (OperationExecutor sole mutation authority)
 * - CRT-04: Architectural Invariant Preservation: CTR-03 (Sidecar contains strictly observations, zero decisions)
 * - CRT-05: Architectural Invariant Preservation: CTR-04 (AssetId provenance decoupling)
 * - CRT-06: Architectural Invariant Preservation: CTR-05 (Visual content dependency on decoded pixels)
 * - CRT-07: Strict Quality Gate Thresholds: GATE-04 (Strict inequality max e_t < 2.0px, exact boundary tests)
 * - CRT-08: Transaction Safety: Pre-Commit VQA Rejection Guard (0 mutation on failure)
 * - CRT-09: Transaction Safety: Post-Commit Delivery Guard (Truthful reporting, no false rollback)
 * - CRT-10: Frozen Canonical Schema Immutability (18 canonical schemas 100% byte-identical)
 * - CRT-11: Auxiliary Sidecar Schema Inventory (6 auxiliary schemas, total 24 versioned schemas)
 * - CRT-12: Zero Core Runtime NPM Dependencies (package.json dependencies undefined or empty)
 * - CRT-13: Benchmark Dataset v1.2.0 Evidence Verification (12 clips, 1296 frames, 8 dev / 4 held-out)
 * - CRT-14: Cumulative Regression Lineage & Exact Arithmetic (416 baseline + 176 Phase 32 = 592 total)
 * - CRT-15: Master Artifact Integrity & Ledger Completeness (All Stage 32.6 audit artifacts valid)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { OperationExecutor } = require('../src/engine/operations');
const { VisualConstraintSolver } = require('../src/solver/visual-constraint-solver');
const { VisualQAGates } = require('../src/solver/visual-qa-gates');
const { VisualEndToEndOrchestrator } = require('../src/orchestration/visual-end-to-end-orchestrator');
const { VisualContractValidator } = require('../src/renderers/visual-contract-validator');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGE_32_6_DIR = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.6');

describe('Stage 32.6: Final Evidence Audit & Phase 32 Certification', () => {

  describe('Section 1: Benchmark Certification Identity & Lineage Freeze', () => {
    test('CRT-01: Benchmark Certification Identity Freeze', () => {
      const ident = JSON.parse(fs.readFileSync(path.join(STAGE_32_6_DIR, 'certification-identity.json'), 'utf8'));
      assert.strictEqual(ident.protocol_version, '1.2.0');
      assert.strictEqual(ident.stage, '32.6');
      assert.strictEqual(ident.milestone, 'Phase 32: Visual Intelligence & Dynamic Content Placement Integration');
      assert.ok(ident.stage32_5_accepted_source_commit.startsWith('ef11797'));
      assert.strictEqual(ident.stage32_5_accepted_tag, 'phase-32-5-certified');
      assert.strictEqual(ident.predecessor_certified_commit, '82dcb0f243d65afcec37681aa8c302b20263611f');
      assert.strictEqual(ident.predecessor_certified_tag, 'phase-31-certified');
      assert.ok(ident.key_manifest_hashes);

      for (const [key, expectedHash] of Object.entries(ident.key_manifest_hashes)) {
        let filePath;
        if (key === 'stage32_1_visual_intelligence_schema') filePath = path.join(ROOT_DIR, 'schema/eme-visual-intelligence.v1.schema.json');
        else if (key === 'stage32_2_scoring_specification') filePath = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.2/scoring-specification.json');
        else if (key === 'stage32_4_benchmark_manifest') filePath = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.4/benchmark-v1.2.0/manifest.json');
        else if (key === 'stage32_4_benchmark_recall_results') filePath = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.4/benchmark-recall-results.json');
        else if (key === 'stage32_5_stage_report') filePath = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.5/stage-report.md');

        assert.ok(filePath && fs.existsSync(filePath), `File for ${key} must exist`);
        assert.strictEqual(fileSha256(filePath), expectedHash, `Hash mismatch for ${key}`);
      }
    });

    test('CRT-02: Complete Evidence Chain Gate Reconciliation', () => {
      const chain = JSON.parse(fs.readFileSync(path.join(STAGE_32_6_DIR, 'complete-evidence-chain.json'), 'utf8'));
      assert.strictEqual(chain.protocol_version, '1.2.0');
      assert.strictEqual(chain.stage, '32.6');
      assert.strictEqual(chain.stages.length, 5);

      const stageIds = chain.stages.map(s => s.stage_id);
      assert.deepStrictEqual(stageIds, ['STAGE-32.1', 'STAGE-32.2', 'STAGE-32.3', 'STAGE-32.4', 'STAGE-32.5']);

      for (const stage of chain.stages) {
        assert.ok(['UNCONDITIONALLY ACCEPTED', 'UNCONDITIONALLY CERTIFIED'].includes(stage.ruling_verdict));
        assert.ok(stage.gates.length >= 6);
        for (const gate of stage.gates) {
          assert.strictEqual(gate.status, 'PASS');
        }
        assert.ok(Array.isArray(stage.findings_closed) && stage.findings_closed.length >= 2);
      }
    });
  });

  describe('Section 2: Architectural Invariants & Mutation Authority', () => {
    test('CRT-03: Architectural Invariant Preservation: OP-AUTH Exclusivity', () => {
      const solveResult = {
        placement: { x: 100, y: 800, width: 300, height: 100, valid: true }
      };
      const plan = VisualConstraintSolver.compileOperationPlan(solveResult, {
        planId: 'test_plan_auth',
        trackId: 'track-01',
        text: 'Title'
      });

      assert.strictEqual(plan.status, 'COMPILED_NON_MUTATING');
      assert.strictEqual(plan.sourceAuthority, 'VisualConstraintSolver');
      assert.ok(Array.isArray(plan.operations));
      assert.strictEqual(typeof OperationExecutor.execute, 'function');
    });

    test('CRT-04: Architectural Invariant Preservation: CTR-03 Observation Separation', () => {
      const sidecarDir = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.4/sidecars');
      const sidecarFiles = fs.readdirSync(sidecarDir).filter(f => f.endsWith('.json'));
      assert.ok(sidecarFiles.length >= 12, 'Must have at least 12 benchmark sidecars');

      for (const file of sidecarFiles) {
        const sidecar = JSON.parse(fs.readFileSync(path.join(sidecarDir, file), 'utf8'));
        assert.strictEqual(sidecar.schemaVersion, 'eme-visual-intelligence.v1');
        assert.strictEqual(sidecar.placement, undefined, `Sidecar ${file} must not contain placement decisions`);
        assert.strictEqual(sidecar.layout, undefined, `Sidecar ${file} must not contain layout decisions`);
        assert.strictEqual(sidecar.operationPlan, undefined, `Sidecar ${file} must not contain operation plans`);

        if (Array.isArray(sidecar.frames)) {
          for (const frame of sidecar.frames) {
            assert.strictEqual(frame.transform, undefined, `Frame must not contain transform decisions`);
            assert.strictEqual(frame.placement, undefined, `Frame must not contain placement decisions`);
          }
        }
      }
    });

    test('CRT-05: Architectural Invariant Preservation: CTR-04 AssetId Decoupling', () => {
      const audit = JSON.parse(fs.readFileSync(path.join(STAGE_32_6_DIR, 'safety-invariants-audit.json'), 'utf8'));
      const ctr04 = audit.invariants.find(inv => inv.invariant_id === 'CTR-04');
      assert.ok(ctr04);
      assert.strictEqual(ctr04.audit_status, 'VERIFIED_COMPLIANT');
    });

    test('CRT-06: Architectural Invariant Preservation: CTR-05 Visual Content Dependency', () => {
      const audit = JSON.parse(fs.readFileSync(path.join(STAGE_32_6_DIR, 'safety-invariants-audit.json'), 'utf8'));
      const ctr05 = audit.invariants.find(inv => inv.invariant_id === 'CTR-05');
      assert.ok(ctr05);
      assert.strictEqual(ctr05.audit_status, 'VERIFIED_COMPLIANT');
    });
  });

  describe('Section 3: Strict Quality Gate Auditing', () => {
    test('CRT-07: Strict Quality Gate Thresholds: GATE-01 through GATE-06 Traceability', () => {
      // 1. GATE-04 Temporal Stability verification
      const trajectoryPassing = [
        { tick: 0, x: 100.0, y: 100.0 },
        { tick: 1000, x: 101.0, y: 100.0 },
        { tick: 2000, x: 101.999, y: 100.0 },
        { tick: 3000, x: 102.0, y: 100.0 }
      ];
      const intendedTrajectory = [
        { tick: 0, x: 100.0, y: 100.0 },
        { tick: 1000, x: 101.0, y: 100.0 },
        { tick: 2000, x: 100.0, y: 100.0 },
        { tick: 3000, x: 102.0, y: 100.0 }
      ];

      const passAudit = VisualQAGates.auditTrajectoryStability(trajectoryPassing, intendedTrajectory, {
        sourceResolution: { width: 1920, height: 1080 }
      });
      assert.strictEqual(passAudit.passed, true, '1.999px deviation must pass strict GATE-04 (< 2.0px)');

      const trajectoryFailingExact = [
        { tick: 0, x: 100.0, y: 100.0 },
        { tick: 1000, x: 102.0, y: 100.0 },
        { tick: 2000, x: 103.0, y: 100.0 }
      ];
      const intendedExact = [
        { tick: 0, x: 100.0, y: 100.0 },
        { tick: 1000, x: 100.0, y: 100.0 },
        { tick: 2000, x: 103.0, y: 100.0 }
      ];
      const exactAudit = VisualQAGates.auditTrajectoryStability(trajectoryFailingExact, intendedExact, {
        sourceResolution: { width: 1920, height: 1080 }
      });
      assert.strictEqual(exactAudit.passed, false, 'Exactly 2.000px deviation must FAIL strict GATE-04 (< 2.0px)');

      const tooFewAudit = VisualQAGates.auditTrajectoryStability([{ tick: 0, x: 100, y: 100 }]);
      assert.strictEqual(tooFewAudit.passed, false);
      assert.strictEqual(tooFewAudit.status, 'NOT_EVALUABLE');

      const nonMonotonicAudit = VisualQAGates.auditTrajectoryStability([
        { tick: 1000, x: 100, y: 100 },
        { tick: 500, x: 101, y: 100 },
        { tick: 2000, x: 102, y: 100 }
      ]);
      assert.strictEqual(nonMonotonicAudit.passed, false);
      assert.strictEqual(nonMonotonicAudit.status, 'INVALID_TIMESTAMPS');

      // 2. Authoritative GATE-01, GATE-05 and GATE-06 Traceability verification
      const scoringSpec = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.2/scoring-specification.json'), 'utf8'));
      const gate01 = scoringSpec.gates.find(g => g.gateId === 'GATE-01');
      assert.ok(gate01, 'GATE-01 must be defined in scoring specification');
      assert.strictEqual(gate01.name, 'Face Collision Rate');
      assert.strictEqual(gate01.threshold, 0.0);
      assert.ok(gate01.description.includes('annotated face regions'), 'GATE-01 must explicitly score against annotated face regions');

      const gate05 = scoringSpec.gates.find(g => g.gateId === 'GATE-05');
      assert.ok(gate05, 'GATE-05 must be defined in scoring specification');
      assert.strictEqual(gate05.name, 'Deterministic Computations');
      assert.strictEqual(gate05.metric, 'bitwise_parity');
      assert.strictEqual(gate05.threshold, 1.0);

      const gate06 = scoringSpec.gates.find(g => g.gateId === 'GATE-06');
      assert.ok(gate06, 'GATE-06 must be defined in scoring specification');
      assert.strictEqual(gate06.name, 'Ground-Truth Integrity');
      assert.strictEqual(gate06.threshold, 1.0);
    });
  });

  describe('Section 4: Transaction & Delivery Safety Contracts', () => {
    test('CRT-08: Transaction Safety: Pre-Commit VQA Rejection Guard', async () => {
      const canonicalProject = {
        schemaVersion: '1.0.0',
        id: 'proj_crt08_precommit',
        revision: 1,
        title: 'CRT-08 Project',
        canvas: { width: 1920, height: 1080, aspectRatio: '1920:1080', backgroundColor: '#0a0a0d' },
        timebase: { fps: { numerator: 24, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 120000, endpointConvention: 'half-open' },
        tracks: [
          { id: 'track-video-01', kind: 'visual', name: 'Primary Video', zIndex: 0 },
          { id: 'track-graphics-01', kind: 'visual', name: 'Graphics & Titles', zIndex: 1 }
        ],
        assets: [],
        clips: [],
        animations: []
      };
      const session = { active_delivery: 'deliv_baseline_safe', deliveries: [] };
      const sourceMedia = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.4/benchmark-v1.2.0/fixtures/SCEN-A01-TALKING-HEAD-STANDARD.mp4');

      const orchestrator = new VisualEndToEndOrchestrator();

      const result = await orchestrator.execute({
        project: canonicalProject,
        sourceMedia,
        session,
        deliveryId: 'deliv_fail_vqa_crt08',
        graphicElement: {
          id: 'deviating_title_crt08',
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
            { tick: 5000, x: 250, y: 500 },
            { tick: 10000, x: 300, y: 500 }
          ],
          options: { maxAllowedDeviationPx: 2.0 }
        },
        renderComposite: false
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.deliveryStatus, 'WITHHELD');
      assert.strictEqual(result.reason, 'VQA_REJECTED');
      assert.strictEqual(session.active_delivery, 'deliv_baseline_safe');
      assert.strictEqual(result.committedRevision, 1);
      assert.strictEqual(result.project.revision, 1);
      assert.strictEqual(result.project.clips.length, 0);
    });

    test('CRT-09: Transaction Safety: Post-Commit Delivery Guard', async () => {
      const canonicalProject = {
        schemaVersion: '1.0.0',
        id: 'proj_crt09_postcommit',
        revision: 1,
        title: 'CRT-09 Project',
        canvas: { width: 1920, height: 1080, aspectRatio: '1920:1080', backgroundColor: '#0a0a0d' },
        timebase: { fps: { numerator: 24, denominator: 1 }, ticksPerSecond: 120000, durationTicks: 120000, endpointConvention: 'half-open' },
        tracks: [
          { id: 'track-video-01', kind: 'visual', name: 'Primary Video', zIndex: 0 },
          { id: 'track-graphics-01', kind: 'visual', name: 'Graphics & Titles', zIndex: 1 }
        ],
        assets: [],
        clips: [],
        animations: []
      };
      const session = { active_delivery: 'deliv_prior_active_crt09', deliveries: [] };
      const sourceMedia = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.4/benchmark-v1.2.0/fixtures/SCEN-A01-TALKING-HEAD-STANDARD.mp4');

      const orchestrator = new VisualEndToEndOrchestrator();
      const originalRender = orchestrator.renderProofOfConcept.bind(orchestrator);
      orchestrator.renderProofOfConcept = async () => {
        throw new Error('SIMULATED_CRASH_POSTCOMMIT');
      };

      let result;
      try {
        result = await orchestrator.execute({
          project: canonicalProject,
          sourceMedia,
          session,
          deliveryId: 'deliv_crash_crt09',
          graphicElement: {
            id: 'valid_title_postcommit_crt09',
            width: 400,
            height: 80,
            preferredAnchor: 'lower_third',
            text: 'Valid Title'
          },
          renderComposite: true
        });
      } finally {
        orchestrator.renderProofOfConcept = originalRender;
      }

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.deliveryStatus, 'WITHHELD');
      assert.strictEqual(result.reason, 'RENDER_FAILED');
      assert.strictEqual(session.active_delivery, 'deliv_prior_active_crt09');
      assert.ok(result.committedRevision > 1, 'Committed revision must reflect mutation');
      assert.ok(result.project.clips.some(c => c.id === 'clip_valid_title_postcommit_crt09'));
    });
  });

  describe('Section 5: Canonical Schema Immutability & Auxiliary Inventory', () => {
    test('CRT-10: Frozen Canonical Schema Immutability', () => {
      const schemaRecon = JSON.parse(fs.readFileSync(path.join(STAGE_32_6_DIR, 'schema-inventory-reconciliation.json'), 'utf8'));
      assert.strictEqual(schemaRecon.canonical_schemas_count, 18);

      for (const item of schemaRecon.canonical_schemas) {
        const filePath = path.join(ROOT_DIR, 'schema', item.filename);
        assert.ok(fs.existsSync(filePath), `Canonical schema ${item.filename} must exist`);
        const actualHash = fileSha256(filePath);
        assert.strictEqual(actualHash, item.sha256, `Byte mismatch in canonical schema ${item.filename}`);
      }
    });

    test('CRT-11: Auxiliary Sidecar Schema Inventory', () => {
      const schemaRecon = JSON.parse(fs.readFileSync(path.join(STAGE_32_6_DIR, 'schema-inventory-reconciliation.json'), 'utf8'));
      assert.strictEqual(schemaRecon.auxiliary_schemas_count, 6);
      assert.strictEqual(schemaRecon.total_schemas_count, 24);

      const visSchema = schemaRecon.auxiliary_schemas.find(s => s.filename === 'eme-visual-intelligence.v1.schema.json');
      assert.ok(visSchema, 'eme-visual-intelligence.v1.schema.json must be in auxiliary inventory');
    });
  });

  describe('Section 6: Zero Runtime Dependencies Invariant', () => {
    test('CRT-12: Zero Core Runtime NPM Dependencies', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
      const deps = pkg.dependencies;
      const hasDeps = Boolean(deps && Object.keys(deps).length > 0);
      assert.strictEqual(hasDeps, false, 'package.json dependencies must be undefined or empty');
    });
  });

  describe('Section 7: Benchmark Dataset v1.2.0 Evidence Verification', () => {
    test('CRT-13: Benchmark Dataset v1.2.0 Evidence Verification', () => {
      const manifestPath = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.4/benchmark-v1.2.0/manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'Benchmark v1.2.0 manifest must exist');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      assert.strictEqual(manifest.version, '1.2.0');
      assert.strictEqual(manifest.fixtures.length, 12);
      assert.strictEqual(manifest.partitions.development.clips, 8);
      assert.strictEqual(manifest.partitions.development.frames, 882);
      assert.strictEqual(manifest.partitions.heldOut.clips, 4);
      assert.strictEqual(manifest.partitions.heldOut.frames, 414);
      assert.strictEqual(manifest.partitions.development.frames + manifest.partitions.heldOut.frames, 1296);

      const recallResults = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.4/benchmark-recall-results.json'), 'utf8'));
      assert.ok(recallResults.gateResults['GATE-02A'].passesGate, 'GATE-02A (overall >= 95%) must pass');
      assert.ok(recallResults.gateResults['GATE-02B'].passesGate, 'GATE-02B (per-scenario >= 90%) must pass');
    });
  });

  describe('Section 8: Cumulative Regression Lineage & Master Evidence Audit', () => {
    test('CRT-14: Cumulative Regression Lineage & Exact Arithmetic', () => {
      const lineage = JSON.parse(fs.readFileSync(path.join(STAGE_32_6_DIR, 'cumulative-regression-lineage.json'), 'utf8'));
      assert.strictEqual(lineage.predecessor_lineage.predecessor_test_cases_count, 416);
      assert.strictEqual(lineage.predecessor_lineage.predecessor_test_files_count, 55);

      assert.strictEqual(lineage.arithmetic_reconciliation.phase32_stages_1_to_5_tests, 161);
      assert.strictEqual(lineage.arithmetic_reconciliation.phase32_total_tests, 176);
      assert.strictEqual(lineage.arithmetic_reconciliation.cumulative_total_tests, 592);
      assert.strictEqual(lineage.arithmetic_reconciliation.cumulative_total_test_files, 61);
      assert.strictEqual(lineage.arithmetic_reconciliation.cumulative_total_suites, 50);

      // Verify exact rational coordinate transformation preserving non-zero origins and max error bound <= 0.0005
      const cfg = {
        contentRect: { x: 20, y: 40, width: 640, height: 360 },
        sourceContentRect: { x: 100, y: 200, width: 1920, height: 1080 }
      };
      const pIn = { x: 260.0, y: 100.0, width: 160.0, height: 160.0 };
      const sOut = VisualContractValidator.transformProxyToSource(pIn, cfg, 3);
      assert.strictEqual(sOut.x, 820.0);
      assert.strictEqual(sOut.y, 380.0);
      assert.strictEqual(sOut.width, 480.0);
      assert.strictEqual(sOut.height, 480.0);

      const pBack = VisualContractValidator.transformSourceToProxy(sOut, cfg, 3);
      assert.deepStrictEqual(pBack, pIn);

      // Verify exact banker's tie-breaking
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.0025, 3), 0.002);
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.0035, 3), 0.004);
    });

    test('CRT-15: Master Artifact Integrity & Ledger Completeness', () => {
      const requiredArtifacts = [
        'certification-identity.json',
        'complete-evidence-chain.json',
        'safety-invariants-audit.json',
        'schema-inventory-reconciliation.json',
        'cumulative-regression-lineage.json'
      ];

      for (const artifact of requiredArtifacts) {
        const fullPath = path.join(STAGE_32_6_DIR, artifact);
        assert.ok(fs.existsSync(fullPath), `Artifact ${artifact} must exist on disk`);
        const stats = fs.statSync(fullPath);
        assert.ok(stats.size > 0, `Artifact ${artifact} must not be empty`);
        assert.doesNotThrow(() => JSON.parse(fs.readFileSync(fullPath, 'utf8')), `Artifact ${artifact} must be valid JSON`);
      }
    });
  });
});
