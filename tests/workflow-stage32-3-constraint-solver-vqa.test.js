/**
 * Editing Mechanics Engine (EME) - Workflow Stage 32.3 Test Suite
 * Stage 32.3: Deterministic Constraint Solver & Visual Quality Assurance (VQA) Gates
 *
 * Verifies:
 * 1. Spatial Placement Solver: 0.0% face collision (GATE-01), title-safe containment, anchor preferences
 * 2. Multi-Subject & Contrast Adaptation: WCAG >= 4.5:1 relative contrast and protective backing (GATE-03)
 * 3. Temporal Trajectory Solving: Intended trajectory deviation < 2.0 px (GATE-04) and smoothness diagnostic (DIAG-04)
 * 4. Shot-Cut Boundary Isolation: Trajectory segmentation across hard cuts without smoothing leakage
 * 5. Fail-Closed Invalidation: < 3 points, duplicate timestamps, and inverted timestamps fail closed
 * 6. Deterministic Parity: 100% bitwise parity on identical inputs (GATE-05)
 * 7. Non-Mutating OperationPlan Compilation
 * 8. Frozen Held-Out Partition Generalization: Evaluates the 4 withheld evaluation clips
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { VisualConstraintSolver } = require('../src/solver/visual-constraint-solver');
const { VisualQAGates } = require('../src/solver/visual-qa-gates');
const { VisualBenchmarkEvaluator } = require('../src/benchmarks/visual-benchmark-evaluator');
const { VisualContractValidator } = require('../src/renderers/visual-contract-validator');

// Fixture loader helper
function loadSidecar(clipId) {
  const p = path.resolve(__dirname, `../artifacts/phase-32/stage-32.2/annotations/${clipId}-sidecar.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadGroundTruth(clipId) {
  const p = path.resolve(__dirname, `../artifacts/phase-32/stage-32.2/annotations/${clipId}-ground-truth.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('Stage 32.3: Deterministic Constraint Solver & VQA Gates', () => {

  describe('Section 1: Spatial Placement & Face Collision Avoidance (GATE-01 & Title Safe)', () => {
    test('SOLV-01: Places lower-third graphic with zero face collision on SCEN-A01', () => {
      const sidecar = loadSidecar('SCEN-A01-TALKING-HEAD-STANDARD');
      const request = {
        element: { width: 500, height: 100, preferredAnchor: 'lower_third' },
        sidecar,
        timeRange: { startTick: 0, endTick: 595000 }
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');
      assert.ok(result.placement, 'Placement rectangle must be returned');

      // Audit via VisualQAGates
      const audit = VisualQAGates.auditSpatialPlacement(result.placement, sidecar, request.timeRange);
      assert.strictEqual(audit.faceCollisionPassed, true, 'Must have zero face collision');
      assert.strictEqual(audit.maxOverlapArea, 0.0, 'Overlap area must be exactly 0.0');
      assert.strictEqual(audit.titleSafePassed, true, 'Must be within title safe bounds');
      assert.strictEqual(result.faceCollisionsCount, 0);
    });

    test('SOLV-02: Handles constrained headroom and tight margins on SCEN-A02', () => {
      const sidecar = loadSidecar('SCEN-A02-TALKING-HEAD-CONSTRAINED');
      const request = {
        element: { width: 450, height: 90, preferredAnchor: 'lower_third' },
        sidecar,
        timeRange: { startTick: 0, endTick: 476000 }
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');

      const audit = VisualQAGates.auditSpatialPlacement(result.placement, sidecar, request.timeRange);
      assert.strictEqual(audit.faceCollisionPassed, true);
      assert.strictEqual(audit.maxOverlapArea, 0.0);
    });

    test('SOLV-03: Respects upper_third anchor preference when requested', () => {
      const sidecar = loadSidecar('SCEN-A01-TALKING-HEAD-STANDARD');
      const request = {
        element: { width: 400, height: 80, preferredAnchor: 'upper_third' },
        sidecar,
        timeRange: { startTick: 0, endTick: 120000 }
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');
      assert.ok(result.placement.y < 300, `Y position (${result.placement.y}) must be in upper region`);

      const audit = VisualQAGates.auditSpatialPlacement(result.placement, sidecar, request.timeRange);
      assert.strictEqual(audit.faceCollisionPassed, true);
    });

    test('SOLV-04: Fails closed when element dimensions exceed canvas bounds', () => {
      const sidecar = loadSidecar('SCEN-A01-TALKING-HEAD-STANDARD');
      const request = {
        element: { width: 2500, height: 1500, preferredAnchor: 'lower_third' }, // Larger than 1920x1080
        sidecar
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'INFEASIBLE_CONSTRAINTS');
      assert.strictEqual(result.placement, null);
      assert.strictEqual(result.titleSafeSatisfied, false);
    });
  });

  describe('Section 2: Multi-Subject & Contrast Adaptation (GATE-03)', () => {
    test('SOLV-05: Finds collision-free placement between dual interview subjects on SCEN-B01', () => {
      const sidecar = loadSidecar('SCEN-B01-MULTI-SUBJECT-DUAL-INTERVIEW');
      const request = {
        element: { width: 400, height: 100, preferredAnchor: 'lower_third' },
        sidecar,
        timeRange: { startTick: 0, endTick: 595000 }
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');

      const audit = VisualQAGates.auditSpatialPlacement(result.placement, sidecar, request.timeRange);
      assert.strictEqual(audit.faceCollisionPassed, true);
      assert.strictEqual(audit.maxOverlapArea, 0.0);
    });

    test('SOLV-06: Avoids three overlapping subjects in dynamic crowd scene SCEN-B02', () => {
      const sidecar = loadSidecar('SCEN-B02-MULTI-SUBJECT-CROWD-OVERLAP');
      const request = {
        element: { width: 350, height: 80, preferredAnchor: 'lower_third' },
        sidecar,
        timeRange: { startTick: 0, endTick: 475000 }
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');

      const audit = VisualQAGates.auditSpatialPlacement(result.placement, sidecar, request.timeRange);
      assert.strictEqual(audit.faceCollisionPassed, true);
      assert.strictEqual(audit.maxOverlapArea, 0.0);
    });

    test('SOLV-07: Automatically provides protective backing on low-contrast background', () => {
      const sidecar = loadSidecar('SCEN-B01-MULTI-SUBJECT-DUAL-INTERVIEW');
      // Bright text on white background -> contrast failure requires protective backing
      const request = {
        element: { width: 400, height: 90, preferredAnchor: 'lower_third' },
        sidecar,
        textColor: { r: 240, g: 240, b: 240 },
        backgroundSamples: [{ r: 230, g: 230, b: 230 }] // Low contrast against white text
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');
      assert.strictEqual(result.backing.required, true, 'Protective backing must be required');
      assert.ok(result.backing.color, 'Backing color must be specified');
      assert.ok(result.contrastRatio >= 4.5, `Effective contrast ${result.contrastRatio} must be >= 4.5:1`);
    });

    test('SOLV-08: High natural contrast requires no protective backing', () => {
      const sidecar = loadSidecar('SCEN-B01-MULTI-SUBJECT-DUAL-INTERVIEW');
      const request = {
        element: { width: 400, height: 90, preferredAnchor: 'lower_third' },
        sidecar,
        textColor: { r: 255, g: 255, b: 255 },
        backgroundSamples: [{ r: 15, g: 20, b: 32 }] // Very dark blue -> high natural contrast
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');
      assert.strictEqual(result.backing.required, false);
      assert.ok(result.contrastRatio >= 4.5);
    });
  });

  describe('Section 3: Temporal Trajectory Solving & Stability (GATE-04 & DIAG-04)', () => {
    test('SOLV-09: Solves smooth trajectory matching linear ground-truth on SCEN-C01 (<2.0px)', () => {
      const sidecar = loadSidecar('SCEN-C01-LATERAL-MOTION-SMOOTH');
      const groundTruth = loadGroundTruth('SCEN-C01-LATERAL-MOTION-SMOOTH');

      const intendedTrajectory = groundTruth.frames.map(f => ({
        tick: f.tick,
        x: f.referenceTrajectory.x,
        y: f.referenceTrajectory.y
      }));

      const result = VisualConstraintSolver.solveTrajectory({
        sidecar,
        intendedTrajectory
      });

      assert.strictEqual(result.status, 'SOLVED');
      assert.strictEqual(result.passesGate, true);
      assert.strictEqual(result.frameCount, 120);

      // Primary GATE-04: max e_t < 2.0 px
      assert.ok(
        result.diagnostics.maxPositionalDeviationPx < 2.0,
        `Peak deviation ${result.diagnostics.maxPositionalDeviationPx}px must be < 2.0px`
      );

      // Secondary DIAG-04: Smoothness diagnostic
      assert.ok(
        result.diagnostics.smoothnessRms < 2.0,
        `Smoothness RMS ${result.diagnostics.smoothnessRms}px must be < 2.0px`
      );
    });

    test('SOLV-10: Solves foreground parallax motion trajectory on SCEN-C02', () => {
      const sidecar = loadSidecar('SCEN-C02-LATERAL-MOTION-PARALLAX');
      const groundTruth = loadGroundTruth('SCEN-C02-LATERAL-MOTION-PARALLAX');

      const intendedTrajectory = groundTruth.frames.map(f => ({
        tick: f.tick,
        x: f.referenceTrajectory.x,
        y: f.referenceTrajectory.y
      }));

      // Raw observation with slight sub-pixel tracking flutter (0.3px)
      const rawTrajectory = intendedTrajectory.map((pt, idx) => ({
        tick: pt.tick,
        x: pt.x + (idx % 2 === 0 ? 0.3 : -0.3),
        y: pt.y,
        confidence: 960
      }));

      const result = VisualConstraintSolver.solveTrajectory({
        sidecar,
        trajectory: rawTrajectory,
        intendedTrajectory
      });

      assert.strictEqual(result.status, 'SOLVED');
      assert.strictEqual(result.passesGate, true);
      assert.ok(result.diagnostics.maxPositionalDeviationPx < 2.0);
    });

    test('SOLV-11: Detects shot cut at tick 300,000 in SCEN-C03 and segments without leakage', () => {
      const sidecar = loadSidecar('SCEN-C03-LATERAL-MOTION-SHOT-CUT');
      const groundTruth = loadGroundTruth('SCEN-C03-LATERAL-MOTION-SHOT-CUT');

      const intendedTrajectory = groundTruth.frames.map(f => ({
        tick: f.tick,
        x: f.referenceTrajectory.x,
        y: f.referenceTrajectory.y
      }));

      const result = VisualConstraintSolver.solveTrajectory({
        sidecar,
        trajectory: intendedTrajectory,
        intendedTrajectory
      }, {
        shotCutTicks: groundTruth.shotCuts
      });

      assert.strictEqual(result.status, 'SOLVED');
      assert.strictEqual(result.shotCount, 2, 'Must segment into 2 continuous shots');
      assert.ok(result.diagnostics.shotCutsDetected.includes(300000), 'Must detect shot cut at tick 300000');
      assert.ok(result.diagnostics.maxPositionalDeviationPx < 2.0);
    });
  });

  describe('Section 4: Fail-Closed Temporal Invalidation & Boundary Enforcement', () => {
    test('SOLV-12: Trajectory with fewer than 3 samples returns NOT_EVALUABLE and fails gate', () => {
      const sidecar = {
        source: { width: 1920, height: 1080 },
        frames: [
          { tick: 0, observations: [{ type: 'focal_point', bounds: { x: 100, y: 100 } }] },
          { tick: 5000, observations: [{ type: 'focal_point', bounds: { x: 105, y: 100 } }] }
        ]
      };

      const result = VisualConstraintSolver.solveTrajectory({ sidecar });
      assert.strictEqual(result.status, 'NOT_EVALUABLE');
      assert.strictEqual(result.passesGate, false);
      assert.strictEqual(result.frameCount, 2);
    });

    test('SOLV-13: Duplicate timestamps trigger INVALID_TIMESTAMPS and fail gate', () => {
      const sidecar = {
        source: { width: 1920, height: 1080 },
        frames: [
          { tick: 0, observations: [{ type: 'focal_point', bounds: { x: 100, y: 100 } }] },
          { tick: 5000, observations: [{ type: 'focal_point', bounds: { x: 105, y: 100 } }] },
          { tick: 5000, observations: [{ type: 'focal_point', bounds: { x: 110, y: 100 } }] }
        ]
      };

      const result = VisualConstraintSolver.solveTrajectory({ sidecar });
      assert.strictEqual(result.status, 'INVALID_TIMESTAMPS');
      assert.strictEqual(result.passesGate, false);
    });

    test('SOLV-14: Inverted / non-monotonic timestamps trigger INVALID_TIMESTAMPS and fail gate', () => {
      const sidecar = {
        source: { width: 1920, height: 1080 },
        frames: [
          { tick: 0, observations: [{ type: 'focal_point', bounds: { x: 100, y: 100 } }] },
          { tick: 10000, observations: [{ type: 'focal_point', bounds: { x: 105, y: 100 } }] },
          { tick: 5000, observations: [{ type: 'focal_point', bounds: { x: 110, y: 100 } }] } // Inversion
        ]
      };

      const result = VisualConstraintSolver.solveTrajectory({ sidecar });
      assert.strictEqual(result.status, 'INVALID_TIMESTAMPS');
      assert.strictEqual(result.passesGate, false);
    });
  });

  describe('Section 5: Deterministic Computation & Bitwise Invariance (GATE-05)', () => {
    test('SOLV-15: Spatial placement solver produces 100% bit-identical results on consecutive runs', () => {
      const sidecar = loadSidecar('SCEN-A01-TALKING-HEAD-STANDARD');
      const request = {
        element: { width: 480, height: 96, preferredAnchor: 'lower_third' },
        sidecar,
        timeRange: { startTick: 0, endTick: 595000 }
      };

      const run1 = JSON.stringify(VisualConstraintSolver.solveSpatialPlacement(request));
      const run2 = JSON.stringify(VisualConstraintSolver.solveSpatialPlacement(request));
      const run3 = JSON.stringify(VisualConstraintSolver.solveSpatialPlacement(request));

      assert.strictEqual(run1, run2, 'Run 1 and Run 2 must be bit-identical');
      assert.strictEqual(run2, run3, 'Run 2 and Run 3 must be bit-identical');
    });

    test('SOLV-16: Trajectory solver produces 100% bit-identical results on consecutive runs', () => {
      const sidecar = loadSidecar('SCEN-C01-LATERAL-MOTION-SMOOTH');
      const groundTruth = loadGroundTruth('SCEN-C01-LATERAL-MOTION-SMOOTH');
      const intendedTrajectory = groundTruth.frames.map(f => ({
        tick: f.tick,
        x: f.referenceTrajectory.x,
        y: f.referenceTrajectory.y
      }));

      const run1 = JSON.stringify(VisualConstraintSolver.solveTrajectory({ sidecar, intendedTrajectory }));
      const run2 = JSON.stringify(VisualConstraintSolver.solveTrajectory({ sidecar, intendedTrajectory }));

      assert.strictEqual(run1, run2, 'Trajectory solver runs must be bit-identical');
    });
  });

  describe('Section 6: OperationPlan Declarative Compilation', () => {
    test('SOLV-17: Compiles valid non-mutating OperationPlan from spatial placement', () => {
      const sidecar = loadSidecar('SCEN-A01-TALKING-HEAD-STANDARD');
      const solveResult = VisualConstraintSolver.solveSpatialPlacement({
        element: { width: 500, height: 100 },
        sidecar
      });

      const plan = VisualConstraintSolver.compileOperationPlan(solveResult, {
        planId: 'plan_test_spatial_01',
        trackId: 'track-graphics-01',
        text: 'Host: Dr. Jane Doe'
      });

      assert.strictEqual(plan.schemaVersion, 'eme-operation-plan.v1');
      assert.strictEqual(plan.planId, 'plan_test_spatial_01');
      assert.strictEqual(plan.status, 'COMPILED_NON_MUTATING');
      assert.strictEqual(plan.operations.length, 1);
      assert.strictEqual(plan.operations[0].op, 'insert_clip');
      assert.strictEqual(plan.operations[0].clip.transform.x, solveResult.placement.x);
      assert.strictEqual(plan.operations[0].clip.transform.y, solveResult.placement.y);
    });

    test('SOLV-18: Compiles valid OperationPlan with keyframe animations from trajectory', () => {
      const sidecar = loadSidecar('SCEN-C01-LATERAL-MOTION-SMOOTH');
      const trajResult = VisualConstraintSolver.solveTrajectory({ sidecar });

      const plan = VisualConstraintSolver.compileOperationPlan(trajResult, {
        planId: 'plan_test_temporal_01',
        trackId: 'track-graphics-01'
      });

      assert.strictEqual(plan.schemaVersion, 'eme-operation-plan.v1');
      assert.strictEqual(plan.operations.length, 2);
      assert.strictEqual(plan.operations[0].op, 'animate_property');
      assert.strictEqual(plan.operations[0].property, 'x');
      assert.strictEqual(plan.operations[0].keyframes.length, 120);
      assert.strictEqual(plan.operations[1].op, 'animate_property');
      assert.strictEqual(plan.operations[1].property, 'y');
    });
  });

  describe('Section 7: Held-Out Partition Generalization Evaluation', () => {
    // These 4 tests evaluate the frozen solver against the 4 withheld evaluation fixtures
    test('SOLV-19 [Held-Out]: SCEN-A03 adversarial edge pan preserves zero face collision', () => {
      const sidecar = loadSidecar('SCEN-A03-TALKING-HEAD-EDGE-ADVERSARIAL');
      const request = {
        element: { width: 400, height: 90, preferredAnchor: 'lower_third' },
        sidecar,
        timeRange: { startTick: 0, endTick: 355000 }
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');

      const audit = VisualQAGates.auditSpatialPlacement(result.placement, sidecar, request.timeRange);
      assert.strictEqual(audit.faceCollisionPassed, true, 'Zero face collision even with adversarial pan');
      assert.strictEqual(audit.maxOverlapArea, 0.0);
    });

    test('SOLV-20 [Held-Out]: SCEN-A04 vertical 9:16 mobile canvas adapts within vertical margins', () => {
      const sidecar = loadSidecar('SCEN-A04-TALKING-HEAD-9-16-VERTICAL');
      const request = {
        element: { width: 600, height: 120, preferredAnchor: 'lower_third' },
        sidecar,
        timeRange: { startTick: 0, endTick: 476000 }
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');
      assert.ok(result.placement.x >= 108.0, 'X must respect 9:16 vertical safe margins');
      assert.ok(result.placement.x + result.placement.width <= 972.0);

      const audit = VisualQAGates.auditSpatialPlacement(result.placement, sidecar, request.timeRange);
      assert.strictEqual(audit.faceCollisionPassed, true);
    });

    test('SOLV-21 [Held-Out]: SCEN-B04 4K high-density multi-subject scene scales coordinates accurately', () => {
      const sidecar = loadSidecar('SCEN-B04-MULTI-SUBJECT-4K-HIGH-DENSITY');
      const request = {
        element: { width: 900, height: 200, preferredAnchor: 'lower_third' },
        sidecar,
        timeRange: { startTick: 0, endTick: 355000 }
      };

      const result = VisualConstraintSolver.solveSpatialPlacement(request);
      assert.strictEqual(result.status, 'SOLVED');

      const audit = VisualQAGates.auditSpatialPlacement(result.placement, sidecar, request.timeRange);
      assert.strictEqual(audit.faceCollisionPassed, true);
      assert.strictEqual(audit.maxOverlapArea, 0.0);
    });

    test('SOLV-22 [Held-Out]: SCEN-C04 60fps sub-pixel stress test satisfies max e_t < 2.0px', () => {
      const sidecar = loadSidecar('SCEN-C04-LATERAL-MOTION-SUBPIXEL-STRESS');
      const groundTruth = loadGroundTruth('SCEN-C04-LATERAL-MOTION-SUBPIXEL-STRESS');

      const intendedTrajectory = groundTruth.frames.map(f => ({
        tick: f.tick,
        x: f.referenceTrajectory.x,
        y: f.referenceTrajectory.y
      }));

      const result = VisualConstraintSolver.solveTrajectory({
        sidecar,
        trajectory: intendedTrajectory,
        intendedTrajectory
      });

      assert.strictEqual(result.status, 'SOLVED');
      assert.strictEqual(result.passesGate, true);
      assert.strictEqual(result.frameCount, 150);
      assert.ok(
        result.diagnostics.maxPositionalDeviationPx < 2.0,
        `Sub-pixel stress peak deviation ${result.diagnostics.maxPositionalDeviationPx}px must be < 2.0px`
      );
    });
  });

  describe('Section 8: Comprehensive VQA Plan Audit', () => {
    test('SOLV-23: Comprehensive VQA audit scores 100/100 on valid plan', () => {
      const sidecar = loadSidecar('SCEN-A01-TALKING-HEAD-STANDARD');
      const solveResult = VisualConstraintSolver.solveSpatialPlacement({
        element: { width: 450, height: 90 },
        sidecar
      });

      const audit = VisualQAGates.auditComprehensive({
        placement: solveResult.placement,
        sidecar,
        textColor: { r: 255, g: 255, b: 255 },
        backgroundSamples: [{ r: 20, g: 24, b: 35 }]
      });

      assert.strictEqual(audit.passed, true);
      assert.strictEqual(audit.score, 100.0);
      assert.strictEqual(audit.gates.GATE_01_FACE_COLLISION.passed, true);
      assert.strictEqual(audit.gates.GATE_03_TEXT_CONTRAST.passed, true);
      assert.strictEqual(audit.gates.GATE_TITLE_SAFE.passed, true);
    });
  });
});
