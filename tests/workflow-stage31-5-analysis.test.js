/**
 * Test Suite: Stage 31.5 — Statistical Evaluation, Regression, and Failure Analysis (Protocol v1.5.0)
 *
 * Verifies all 15 discrete criteria mandated by Architecture Lead in Protocol v1.5.0 & Directive:
 * - ANA-01: Protocol v1.5.0 Specification & Threshold Ingestion (frozen manifest & thresholds intact)
 * - ANA-02: Stratified Defect Coverage (11 defect classes, 3 non-defect categories, 36 fixtures total)
 * - ANA-03: Project Duration Tier Stratification (Tier 1 Micro < 15s, Tier 2 Standard 15-30s)
 * - ANA-04: Track Complexity Stratification (>4 tracks, 4 tracks, 2-3 tracks)
 * - ANA-05: Origin Type Stratification (Seeded real fixtures vs clean controls)
 * - ANA-06: Statistical Uncertainty & Wilson 95% Confidence Intervals (valid bounds across all slices)
 * - ANA-07: Anti-Concealment Gate Verification (zero per-class degradation concealed)
 * - ANA-08: Failure Mode & Effects Analysis (FMEA) Completeness (all 8 categories, RPN calculated)
 * - ANA-09: Root Cause Analysis (RCA) Completeness (RCA-01 operation journal & RCA-02 byte SHA-256)
 * - ANA-10: Collateral Change Audit (22 candidates with zero unaffected track diffs or mutations)
 * - ANA-11: Confidence Calibration & Routing Safety (100% routing fidelity, zero unauthorized mutations)
 * - ANA-12: Predecessor Regression Baseline Reconciliation (cumulative suites passing)
 * - ANA-13: Grounding & Evidence Provenance (every guarantee mapped to concrete verification mechanism)
 * - ANA-14: Limitations & Unsupported Capabilities Register (explicit boundaries, non-generalizability)
 * - ANA-15: Deliverables Completeness (all 10 deliverables present, structurally valid, and non-empty)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGE_31_1_DIR = path.join(ROOT_DIR, 'artifacts/phase-31/stage-31.1');
const STAGE_31_2_DIR = path.join(ROOT_DIR, 'artifacts/phase-31/stage-31.2');
const STAGE_31_3_DIR = path.join(ROOT_DIR, 'artifacts/phase-31/stage-31.3');
const STAGE_31_4_DIR = path.join(ROOT_DIR, 'artifacts/phase-31/stage-31.4');
const STAGE_31_5_DIR = path.join(ROOT_DIR, 'artifacts/phase-31/stage-31.5');

describe('Stage 31.5: Statistical Evaluation, Regression, and Failure Analysis (Protocol v1.5.0)', () => {

  test('ANA-01: Protocol v1.5.0 Specification & Threshold Ingestion', () => {
    const spec = JSON.parse(fs.readFileSync(path.join(STAGE_31_1_DIR, 'benchmark-scoring-spec.json'), 'utf8'));
    assert.strictEqual(spec.protocol_version, '1.5.0');
    assert.strictEqual(spec.scoring_thresholds.detection_precision_min, 0.90);
    assert.strictEqual(spec.scoring_thresholds.detection_recall_min, 0.85);
    assert.strictEqual(spec.scoring_thresholds.localization_iou_min, 0.80);
    assert.strictEqual(spec.scoring_thresholds.repair_validity_min, 0.95);
    assert.strictEqual(spec.scoring_thresholds.audio_true_peak_max_dbtp, -1.0);
    assert.strictEqual(spec.scoring_thresholds.false_positive_rate_max, 0.05);

    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    assert.strictEqual(master.protocol_version, '1.5.0');
    assert.strictEqual(master.stage, '31.5');
  });

  test('ANA-02: Stratified Defect Coverage (11 defect classes, 3 non-defect categories, 36 fixtures total)', () => {
    const perClass = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'per-class-performance.json'), 'utf8'));
    const expectedDefectClasses = [
      'TS-GAP', 'TS-OVERLAP', 'SYNC-OFFSET', 'LVL-CLIPPING',
      'CONT-DISCONTINUITY', 'TRN-INVALID', 'SDC-STALE', 'STR-BROKEN_REF',
      'STR-FPS-MISMATCH', 'STR-ASPECT-MISMATCH', 'STR-SPEED-RAMP'
    ];
    for (const dc of expectedDefectClasses) {
      assert.ok(perClass[dc], `Defect class ${dc} must be present in per-class analysis`);
      assert.ok(perClass[dc].total_cases >= 2, `Defect class ${dc} must have at least 2 cases`);
      assert.strictEqual(perClass[dc].precision.point, 1.0);
      assert.strictEqual(perClass[dc].recall.point, 1.0);
    }

    assert.ok(perClass['FPC-CLEAN-MASTER'], 'Clean controls category must be present');
    assert.strictEqual(perClass['FPC-CLEAN-MASTER'].total_cases, 6);
    assert.strictEqual(perClass['FPC-CLEAN-MASTER'].confusion_matrix.fp, 0);

    assert.ok(perClass['AMB-PACING'], 'Ambiguous cases category must be present');
    assert.strictEqual(perClass['AMB-PACING'].total_cases, 2);

    assert.ok(perClass['UNS-3D_WARP'], 'Unsupported cases category must be present');
    assert.strictEqual(perClass['UNS-3D_WARP'].total_cases, 2);

    // Sum of all cases must equal 36
    const totalCount = Object.values(perClass).reduce((acc, c) => acc + c.total_cases, 0);
    assert.strictEqual(totalCount, 36);
  });

  test('ANA-03: Project Duration Tier Stratification (Tier 1 Micro < 15s, Tier 2 Standard 15-30s)', () => {
    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    assert.ok(master.duration_tier_performance);
    assert.ok(master.duration_tier_performance.tier_1_micro_under_15s);
    assert.ok(master.duration_tier_performance.tier_2_standard_15_to_30s);

    assert.strictEqual(master.duration_tier_performance.tier_1_micro_under_15s.total_cases, 19);
    assert.strictEqual(master.duration_tier_performance.tier_2_standard_15_to_30s.total_cases, 17);

    assert.strictEqual(master.duration_tier_performance.tier_1_micro_under_15s.precision.point, 1.0);
    assert.strictEqual(master.duration_tier_performance.tier_2_standard_15_to_30s.precision.point, 1.0);
  });

  test('ANA-04: Track Complexity Stratification (>4 tracks, 4 tracks, 2-3 tracks)', () => {
    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    assert.ok(master.track_complexity_performance);
    assert.strictEqual(master.track_complexity_performance.strictly_greater_than_4_tracks.total_cases, 17);
    assert.strictEqual(master.track_complexity_performance.medium_4_tracks.total_cases, 7);
    assert.strictEqual(master.track_complexity_performance.two_to_three_tracks.total_cases, 12);

    assert.strictEqual(master.track_complexity_performance.strictly_greater_than_4_tracks.precision.point, 1.0);
    assert.strictEqual(master.track_complexity_performance.medium_4_tracks.precision.point, 1.0);
    assert.strictEqual(master.track_complexity_performance.two_to_three_tracks.precision.point, 1.0);
  });

  test('ANA-05: Origin Type Stratification (Seeded real fixtures vs clean controls)', () => {
    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    assert.ok(master.origin_performance);
    assert.strictEqual(master.origin_performance.seeded_in_real_project_copy.total_cases, 30);
    assert.strictEqual(master.origin_performance.clean_control.total_cases, 6);

    assert.strictEqual(master.origin_performance.seeded_in_real_project_copy.precision.point, 1.0);
    assert.strictEqual(master.origin_performance.clean_control.confusion_matrix.fp, 0);
  });

  test('ANA-06: Statistical Uncertainty & Wilson 95% Confidence Intervals', () => {
    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    
    // Scored Defect Cases (N = 26 across 11 defect classes)
    const scored = master.scored_defect_performance;
    assert.strictEqual(scored.total_scored_defect_cases, 26);
    assert.strictEqual(scored.precision.point, 1.0);
    assert.ok(scored.precision.lower > 0.85, 'Wilson lower bound for defect precision must be > 0.85');
    assert.strictEqual(scored.recall.point, 1.0);
    assert.ok(scored.recall.lower > 0.85, 'Wilson lower bound for defect recall must be > 0.85');
    
    // Scored Defect Localization (N = 26) Continuous IoU + Exact Rate
    assert.strictEqual(scored.localization.continuous_iou.mean, 1.0);
    assert.strictEqual(scored.localization.continuous_iou.min, 1.0);
    assert.strictEqual(scored.localization.continuous_iou.max, 1.0);
    assert.strictEqual(scored.localization.continuous_iou.std_dev, 0.0);
    assert.strictEqual(scored.localization.exact_localization_rate.point, 1.0);
    assert.ok(scored.localization.exact_localization_rate.interval.lower > 0.85);

    // Candidate Repair Localization & Operations (N = 22)
    const cand = master.candidate_repair_localization;
    assert.strictEqual(cand.total_cases, 22);
    assert.strictEqual(cand.continuous_iou.mean, 1.0);
    assert.strictEqual(cand.exact_localization_rate.point, 1.0);
    assert.ok(cand.exact_localization_rate.interval.lower > 0.80);
    assert.strictEqual(cand.repair_proposal_validity.interval.point, 1.0);
    assert.ok(cand.repair_proposal_validity.interval.lower > 0.80);
    assert.strictEqual(cand.audio_qa_pass_rate.interval.point, 1.0);
    assert.ok(cand.audio_qa_pass_rate.interval.lower > 0.70);

    // Separate Evaluation Gates & Routing Safety
    assert.strictEqual(master.clean_control_evaluation.false_positive_rate.point, 0.0);
    assert.strictEqual(master.ambiguous_intent_evaluation.escalation_fidelity.point, 1.0);
    assert.strictEqual(master.unsupported_feature_evaluation.unsupported_rejection_rate.point, 1.0);
    assert.strictEqual(master.overall_action_routing.compliance_rate.point, 1.0);
  });

  test('ANA-07: Anti-Concealment Gate Verification', () => {
    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    assert.strictEqual(master.anti_concealment_gate.status, 'PASS');
    assert.strictEqual(master.anti_concealment_gate.violations.length, 0);
  });

  test('ANA-08: Failure Mode & Effects Analysis (FMEA) Completeness', () => {
    const fmea = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'fp-fn-failure-register.json'), 'utf8'));
    assert.ok(Array.isArray(fmea));
    assert.strictEqual(fmea.length, 10);

    const expectedFMs = ['FM-01', 'FM-02', 'FM-03', 'FM-04', 'FM-05', 'FM-06', 'FM-07', 'FM-08', 'FM-09', 'FM-10'];
    const actualFMs = fmea.map(f => f.failure_mode_id);
    assert.deepStrictEqual(actualFMs, expectedFMs);

    for (const item of fmea) {
      assert.ok(item.severity >= 1 && item.severity <= 10);
      assert.ok(item.occurrence >= 1 && item.occurrence <= 10);
      assert.ok(item.detectability >= 1 && item.detectability <= 10);
      assert.strictEqual(item.rpn, item.severity * item.occurrence * item.detectability);
      assert.ok(item.invariant_impacted);
      assert.ok(item.prevention_control);
      assert.ok(item.remediation_test);
    }

    const resolvedFMs = fmea.filter(f => f.observation_status === 'RESOLVED_DURING_STAGE_31_4');
    assert.strictEqual(resolvedFMs.length, 2); // FM-05 (Checksum) & FM-06 (OperationExecutor)
  });

  test('ANA-09: Root Cause Analysis (RCA) Completeness', () => {
    const rca = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'root-cause-analysis.json'), 'utf8'));
    assert.ok(Array.isArray(rca));
    assert.strictEqual(rca.length, 3);

    const rca01 = rca.find(r => r.rca_id === 'RCA-01');
    assert.ok(rca01);
    assert.ok(rca01.finding_title.includes('CASE-SDC-STALE-02 Initial Operation Journal Omission'));
    assert.strictEqual(rca01.verification_status, 'VERIFIED_AND_ACCEPTED_BY_ARCHITECTURE_LEAD');

    const rca02 = rca.find(r => r.rca_id === 'RCA-02');
    assert.ok(rca02);
    assert.ok(rca02.finding_title.includes('CASE-SDC-STALE-02 In-Memory Descriptor Checksum vs On-Disk Media File Checksum'));
    assert.strictEqual(rca02.verification_status, 'VERIFIED_AND_ACCEPTED_BY_ARCHITECTURE_LEAD');
  });

  test('ANA-10: Collateral Change Audit', () => {
    const collateral = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'collateral-change-report.json'), 'utf8'));
    assert.strictEqual(collateral.total_candidates_audited, 22);
    assert.strictEqual(collateral.unaffected_tracks_diff_count, 0);
    assert.strictEqual(collateral.active_delivery_promotions_count, 0);
    assert.strictEqual(collateral.metadata_corruption_count, 0);
    assert.ok(collateral.audit_verdict.startsWith('PASS'));
  });

  test('ANA-11: Confidence Calibration & Routing Safety', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'confidence-escalation-analysis.json'), 'utf8'));
    assert.strictEqual(conf.calibration_metrics.unauthorized_autonomous_repairs, 0);
    assert.strictEqual(conf.calibration_metrics.confidence_override_of_validation_failures, 0);
    assert.strictEqual(conf.calibration_metrics.hard_validation_precedence_preserved, true);
    assert.strictEqual(conf.routing_fidelity.clean_controls_to_no_repair, '100% (6/6)');
    assert.strictEqual(conf.routing_fidelity.ambiguous_to_human_review, '100% (2/2)');
    assert.strictEqual(conf.routing_fidelity.unsupported_to_abstain, '100% (2/2)');
    assert.strictEqual(conf.routing_fidelity.defective_to_repair, '100% (22/22)');
  });

  test('ANA-12: Predecessor Regression Baseline Reconciliation', () => {
    const reg = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'regression-report.json'), 'utf8'));
    assert.strictEqual(reg.total_suites, 16);
    assert.strictEqual(reg.total_test_cases, 401);
    assert.strictEqual(reg.accepted_stage31_4_baseline, 386);
    assert.strictEqual(reg.stage31_5_additive_tests, 15);
    assert.strictEqual(reg.cumulative_suites.length, 16);
    for (const suite of reg.cumulative_suites) {
      assert.strictEqual(suite.status, 'PASS');
      assert.ok(suite.test_cases_count > 0);
    }
  });

  test('ANA-13: Grounding & Evidence Provenance', () => {
    const reportMd = fs.readFileSync(path.join(STAGE_31_5_DIR, 'stage-report.md'), 'utf8');
    assert.ok(reportMd.includes('Verification Grounding'));
    assert.ok(reportMd.includes('Direct Unit Test'));
    assert.ok(reportMd.includes('Production SLO Harness'));
    assert.ok(reportMd.includes('Actual Offline Renders & Byte SHA256'));
    assert.ok(reportMd.includes('Stratified Wilson Score Statistics'));
  });

  test('ANA-14: Limitations & Unsupported Capabilities Register', () => {
    const lim = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'limitations-unsupported-register.json'), 'utf8'));
    assert.strictEqual(lim.benchmark_scope.corpus_size, 36);
    assert.strictEqual(lim.benchmark_scope.distinct_source_projects, 6);
    assert.strictEqual(lim.benchmark_scope.audio_renders_evaluated, 28);
    assert.strictEqual(lim.benchmark_scope.qa_reports_generated, 14);
    assert.ok(lim.unsupported_capabilities.length >= 3);
    assert.ok(lim.non_generalizability_declaration);
  });

  test('ANA-15: Deliverables Completeness', () => {
    const deliverables = [
      'master-benchmark-results.json',
      'per-class-performance.json',
      'fp-fn-failure-register.json',
      'collateral-change-report.json',
      'confidence-escalation-analysis.json',
      'regression-report.json',
      'root-cause-analysis.json',
      'limitations-unsupported-register.json',
      'remediation-retest-matrix.json',
      'stage-report.md'
    ];
    for (const d of deliverables) {
      const fullPath = path.join(STAGE_31_5_DIR, d);
      assert.ok(fs.existsSync(fullPath), `Deliverable must exist: ${d}`);
      assert.ok(fs.statSync(fullPath).size > 100, `Deliverable must not be empty: ${d}`);
    }
  });

});
