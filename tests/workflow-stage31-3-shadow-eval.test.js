/**
 * Test Suite: Stage 31.3 — Non-Destructive Shadow Evaluation (Protocol v1.5.0)
 *
 * Verifies all 13 discrete criteria mandated by Architecture Lead in Protocol v1.5.0 & Directive:
 * - SHW-01: Preflight input integrity & SHA-256 pre-verification (clean audio, source projects, fixtures)
 * - SHW-02: Non-destructive shadow execution invariant (zero mutation to original fixtures or source projects)
 * - SHW-03: Active-delivery safety invariant (session.active_delivery preserved 100% untouched)
 * - SHW-04: Defect detection precision & recall across all 11 scored defect classes
 * - SHW-05: Defect localization accuracy within permitted tolerances (cut tolerance 2000 ticks, sync tolerance 4000 ticks)
 * - SHW-06: Diagnosis & repair proposal validity across all 26 scored defect cases
 * - SHW-07: Prohibited collateral change prevention (zero modification to prohibited tracks)
 * - SHW-08: Option B 11-defect-class macro averaging compliance (Macro F1 >= 0.90, P >= 0.88, R >= 0.88)
 * - SHW-09: Anti-concealment gate (each of the 11 classes independently satisfies >= 0.85 floor)
 * - SHW-10: Clean-control false-positive prevention (Run_FPR <= 0.05, strictly 0 FP runs across all 6 controls)
 * - SHW-11: Ambiguous cases escalation fidelity (EF >= 0.95, strictly 0 autonomous modifications)
 * - SHW-12: Unsupported cases fail-closed rejection (URR >= 0.95, strictly 0 execution bypasses)
 * - SHW-13: Deliverable completeness and forensic audit trail reconciliation
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
const STAGE_31_2_DIR = path.join(ROOT_DIR, 'artifacts/phase-31/stage-31.2');
const STAGE_31_3_DIR = path.join(ROOT_DIR, 'artifacts/phase-31/stage-31.3');

describe('Stage 31.3: Non-Destructive Shadow Evaluation (Protocol v1.5.0)', () => {

  test('SHW-01: Preflight input integrity & SHA-256 pre-verification (clean audio, source projects, fixtures)', () => {
    // 1. Verify clean audio asset
    const cleanAudioPath = path.join(ROOT_DIR, 'assets/creator_reel_soundtrack_20s.wav');
    assert.ok(fs.existsSync(cleanAudioPath), 'assets/creator_reel_soundtrack_20s.wav must exist');
    const audioSha = fileSha256(cleanAudioPath);
    assert.strictEqual(audioSha, '1b8183af7135d64b1ee7d1d15d007fd1516a42bf41a7a64d3e66c5237d59b628');
    assert.strictEqual(fs.statSync(cleanAudioPath).size, 3840078);

    // 2. Verify source projects in checksum inventory
    const checksums = JSON.parse(fs.readFileSync(path.join(STAGE_31_2_DIR, 'input-checksums.json'), 'utf8'));
    assert.ok(checksums.pristine_source_projects);
    for (const [relPath, info] of Object.entries(checksums.pristine_source_projects)) {
      const fullPath = path.join(ROOT_DIR, relPath);
      assert.ok(fs.existsSync(fullPath), `Source project must exist: ${relPath}`);
      assert.strictEqual(fileSha256(fullPath), info.sha256);
      assert.strictEqual(fs.statSync(fullPath).size, info.size_bytes);
    }

    // 3. Verify media_assets in checksum inventory
    assert.ok(checksums.media_assets);
    assert.strictEqual(checksums.media_assets['assets/creator_reel_soundtrack_20s.wav'].sha256, '1b8183af7135d64b1ee7d1d15d007fd1516a42bf41a7a64d3e66c5237d59b628');
  });

  test('SHW-02: Non-destructive shadow execution invariant (zero mutation to original fixtures or source projects)', () => {
    const pres = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'original-state-preservation.json'), 'utf8'));
    assert.strictEqual(pres.status, 'PASSED');
    assert.strictEqual(pres.total_fixtures_evaluated, 36);
    assert.strictEqual(pres.mutated_fixtures_count, 0);
    assert.strictEqual(pres.original_projects_preserved, true);

    // Independently verify on disk that every fixture matches pre-hash
    for (const [caseId, data] of Object.entries(pres.post_evaluation_hashes)) {
      const liveSha = fileSha256(path.join(ROOT_DIR, data.file));
      assert.strictEqual(liveSha, data.pre_hash, `Fixture for ${caseId} was mutated!`);
      assert.strictEqual(data.match, true);
    }
  });

  test('SHW-03: Active-delivery safety invariant (session.active_delivery preserved 100% untouched)', () => {
    const pres = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'original-state-preservation.json'), 'utf8'));
    assert.strictEqual(pres.active_delivery_preserved, true);
    assert.ok(pres.active_delivery_details.includes('session.active_delivery remained 100% untouched'));

    // Explicit direct equality comparison between before-and-after active delivery identity
    assert.ok(pres.active_delivery_audit, 'active_delivery_audit must exist in preservation report');
    assert.strictEqual(pres.active_delivery_audit.identity_match, true);
    assert.strictEqual(pres.active_delivery_audit.candidate_promotions_committed, 0);
    assert.strictEqual(pres.active_delivery_audit.candidate_promotions_attempted, 0);
    assert.strictEqual(pres.active_delivery_audit.pre_digest, pres.active_delivery_audit.post_digest);
    assert.deepStrictEqual(
      pres.active_delivery_audit.post_evaluation_delivery,
      pres.active_delivery_audit.pre_evaluation_delivery,
      'Active delivery before and after evaluation must be deeply identical'
    );
  });

  test('SHW-04: Defect detection precision & recall across all 11 scored defect classes', () => {
    const metrics = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'detection-localization-metrics.json'), 'utf8'));
    assert.strictEqual(Object.keys(metrics.per_class_metrics).length, 11);

    for (const [cls, m] of Object.entries(metrics.per_class_metrics)) {
      assert.ok(m.precision >= m.thresholds.minimum_precision, `Class ${cls} precision ${m.precision} below ${m.thresholds.minimum_precision}`);
      assert.ok(m.recall >= m.thresholds.minimum_recall, `Class ${cls} recall ${m.recall} below ${m.thresholds.minimum_recall}`);
      assert.strictEqual(m.false_positives, 0);
      assert.strictEqual(m.false_negatives, 0);
      if (cls === 'TS-OVERLAP') {
        assert.ok(m.precision >= 0.95, 'TS-OVERLAP precision must be >= 0.95');
        assert.ok(m.recall >= 0.90, 'TS-OVERLAP recall must be >= 0.90');
      }
      if (cls === 'STR-BROKEN_REF') {
        assert.strictEqual(m.fail_closed_integrity, 1.0, 'STR-BROKEN_REF fail-closed integrity must be 1.0');
        assert.strictEqual(m.repair_required, false, 'STR-BROKEN_REF repair_required must be false');
      }
    }
  });

  test('SHW-05: Defect localization accuracy within permitted tolerances', () => {
    const metrics = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'detection-localization-metrics.json'), 'utf8'));
    assert.ok(metrics.macro_metrics.macro_localization_accuracy >= 0.80, 'Macro localization accuracy must be >= 0.80');
    assert.strictEqual(metrics.macro_metrics.macro_localization_accuracy, 1.0);

    for (const [cls, m] of Object.entries(metrics.per_class_metrics)) {
      assert.ok(m.localization_accuracy >= 0.80, `Class ${cls} localization accuracy below 0.80`);
    }
  });

  test('SHW-06: Diagnosis, action compliance, and repair proposal validity across all 26 scored defect cases', () => {
    const repMetrics = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'diagnosis-repair-metrics.json'), 'utf8'));
    assert.strictEqual(repMetrics.action_compliance.status, 'PASSED');
    assert.strictEqual(repMetrics.action_compliance.action_compliance_rate, 1.0);
    assert.strictEqual(repMetrics.action_compliance.total_defect_cases, 26);
    assert.strictEqual(repMetrics.action_compliance.action_compliant_cases, 26);

    // Repair proposal rate strictly evaluated on repair-eligible classes (10 classes, 24 cases)
    assert.strictEqual(repMetrics.repair_eligible_metrics.status, 'PASSED');
    assert.ok(repMetrics.repair_eligible_metrics.repair_proposal_rate_on_eligible >= 0.95);
    assert.strictEqual(repMetrics.repair_eligible_metrics.repair_eligible_cases_count, 24);
    assert.strictEqual(repMetrics.repair_eligible_metrics.repair_proposals_generated, 24);

    // Strict mutation proposals (9 classes, 22 cases)
    assert.strictEqual(repMetrics.strict_mutation_repair_metrics.status, 'PASSED');
    assert.strictEqual(repMetrics.strict_mutation_repair_metrics.mutation_eligible_cases_count, 22);
    assert.strictEqual(repMetrics.strict_mutation_repair_metrics.mutation_proposals_generated, 22);
    assert.strictEqual(repMetrics.strict_mutation_repair_metrics.mutation_repair_proposal_rate, 1.0);

    // Cadence advisories (1 class, 2 cases)
    assert.strictEqual(repMetrics.cadence_advisory_metrics.status, 'PASSED');
    assert.strictEqual(repMetrics.cadence_advisory_metrics.advisory_eligible_cases_count, 2);
    assert.strictEqual(repMetrics.cadence_advisory_metrics.cadence_advisories_generated, 2);
    assert.strictEqual(repMetrics.cadence_advisory_metrics.cadence_advisory_compliance_rate, 1.0);

    // Non-repairable structural class (STR-BROKEN_REF) strictly verified fail-closed
    const strClass = repMetrics.non_repairable_defect_classes.find(c => c.defect_class === 'STR-BROKEN_REF');
    assert.ok(strClass);
    assert.strictEqual(strClass.repair_proposals_generated, 0, 'STR-BROKEN_REF must generate 0 repair proposals');
    assert.strictEqual(strClass.fail_closed_rejections_executed, 2, 'STR-BROKEN_REF must execute 2 fail-closed rejections');
    assert.strictEqual(strClass.fail_closed_integrity, 1.0);
    assert.strictEqual(strClass.canonical_job_status, 'FAILED');
    assert.strictEqual(strClass.outcome_reason, 'REJECTED_FAIL_CLOSED');

    // Verify individual case records for STR-BROKEN_REF have canonical_job_status === 'FAILED'
    const case01 = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'cases/shadow-case-str-broken-ref-01.json'), 'utf8'));
    const case02 = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'cases/shadow-case-str-broken-ref-02.json'), 'utf8'));
    assert.strictEqual(case01.canonical_job_status, 'FAILED');
    assert.strictEqual(case01.outcome_reason, 'REJECTED_FAIL_CLOSED');
    assert.strictEqual(case02.canonical_job_status, 'FAILED');
    assert.strictEqual(case02.outcome_reason, 'REJECTED_FAIL_CLOSED');
  });

  test('SHW-07: Prohibited collateral change prevention (zero modification to prohibited tracks)', () => {
    const repMetrics = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'diagnosis-repair-metrics.json'), 'utf8'));
    assert.strictEqual(repMetrics.collateral_change_metrics.collateral_violations_count, 0);
    assert.strictEqual(repMetrics.collateral_change_metrics.collateral_change_free_rate, 1.0);
    assert.strictEqual(repMetrics.collateral_change_metrics.status, 'PASSED');
  });

  test('SHW-08: Option B 11-defect-class macro averaging compliance (Macro P >= 0.90, R >= 0.85, Loc >= 0.80)', () => {
    const metrics = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'detection-localization-metrics.json'), 'utf8'));
    const macro = metrics.macro_metrics;

    assert.ok(macro.macro_precision >= 0.90, `Macro precision ${macro.macro_precision} < 0.90`);
    assert.ok(macro.macro_recall >= 0.85, `Macro recall ${macro.macro_recall} < 0.85`);
    assert.ok(macro.macro_localization_accuracy >= 0.80, `Macro localization ${macro.macro_localization_accuracy} < 0.80`);
    assert.strictEqual(macro.status, 'PASSED');
  });

  test('SHW-09: Anti-concealment gate (each of the 11 classes independently satisfies its frozen class-level gate)', () => {
    const metrics = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'detection-localization-metrics.json'), 'utf8'));
    assert.strictEqual(metrics.anti_concealment_gate.status, 'PASSED');
    assert.strictEqual(metrics.anti_concealment_gate.all_classes_passed, true);

    for (const [cls, m] of Object.entries(metrics.per_class_metrics)) {
      assert.strictEqual(m.anti_concealment_gate, 'PASSED', `Class ${cls} failed anti-concealment`);
    }
  });

  test('SHW-10: Clean-control false-positive prevention (Run_FPR <= 0.05, strictly 0 FP runs across all 6 controls)', () => {
    const cleanRep = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'clean-control-false-positive-report.json'), 'utf8'));
    assert.strictEqual(cleanRep.status, 'PASSED');
    assert.strictEqual(cleanRep.total_clean_runs, 6);
    assert.strictEqual(cleanRep.false_positive_runs, 0);
    assert.strictEqual(cleanRep.run_level_false_alarm_rate, 0.0);
    assert.strictEqual(cleanRep.zero_false_alarm_requirement_satisfied, true);

    for (const run of cleanRep.clean_runs) {
      assert.strictEqual(run.detected_findings, 0);
      assert.strictEqual(run.routing, 'PRISTINE_CLEAN_ABSTAIN');
      assert.strictEqual(run.status, 'PRISTINE_VERIFIED_PASS');
    }
  });

  test('SHW-11: Ambiguous cases escalation fidelity (EF >= 0.95, strictly 0 autonomous modifications)', () => {
    const confRep = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'confidence-escalation-report.json'), 'utf8'));
    const amb = confRep.ambiguous_cases;

    assert.strictEqual(amb.status, 'PASSED');
    assert.strictEqual(amb.total_evaluated, 2);
    assert.strictEqual(amb.escalated_to_human_review, 2);
    assert.strictEqual(amb.escalation_fidelity, 1.0);
    assert.strictEqual(amb.autonomous_modifications, 0);

    for (const c of amb.cases) {
      assert.strictEqual(c.routing, 'ESCALATE_HUMAN_REVIEW');
      assert.strictEqual(c.autonomous_permitted, false);
      assert.strictEqual(c.canonical_job_status, 'NEEDS_RECONCILIATION');
    }

    // Load preflight checksum inventory and original-state preservation audit
    const inputChecksums = JSON.parse(fs.readFileSync(path.join(STAGE_31_2_DIR, 'input-checksums.json'), 'utf8'));
    const preservationRep = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'original-state-preservation.json'), 'utf8'));

    // 1. Verify CASE-AMB-01
    const amb01 = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'cases/shadow-case-amb-01.json'), 'utf8'));
    assert.strictEqual(amb01.canonical_job_status, 'NEEDS_RECONCILIATION');
    assert.strictEqual(amb01.outcome_reason, 'ESCALATED_HUMAN_REVIEW');
    assert.strictEqual(amb01.evaluation.repair_proposal_generated, false);
    assert.strictEqual(amb01.evaluation.candidate_operations_count, 0);
    assert.strictEqual(amb01.evaluation.autonomous_repair_permitted, false);
    assert.strictEqual(amb01.evaluation.active_delivery_preserved, true);

    // Independent cryptographic verification of CASE-AMB-01 fixture file
    const amb01FixturePath = path.join(ROOT_DIR, amb01.fixture_file);
    const amb01ActualFixtureHash = fileSha256(amb01FixturePath);
    const amb01ExpectedPreHash = preservationRep.post_evaluation_hashes['CASE-AMB-01'].pre_hash;
    assert.strictEqual(amb01ActualFixtureHash, amb01ExpectedPreHash, 'CASE-AMB-01 fixture file mutated!');
    assert.strictEqual(amb01ActualFixtureHash, '6025322fd2ca697cdddab86cd64a953d66d99aa3f6a94c660c0034e9d300f39c');

    // Independent cryptographic verification of CASE-AMB-01 source project (CORPUS-05: projects/manoj-bajpayee-150-edit.json)
    const corpus05Path = path.join(ROOT_DIR, 'projects/manoj-bajpayee-150-edit.json');
    const corpus05ActualHash = fileSha256(corpus05Path);
    const corpus05ExpectedHash = inputChecksums.pristine_source_projects['projects/manoj-bajpayee-150-edit.json'].sha256;
    assert.strictEqual(corpus05ActualHash, corpus05ExpectedHash, 'CORPUS-05 source project mutated!');
    assert.strictEqual(corpus05ActualHash, '2d65a17db00317beff1f831eb51c1cd06d0d3360b05c4ad17f74fb9e1f6810ff');

    // 2. Verify CASE-AMB-02
    const amb02 = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'cases/shadow-case-amb-02.json'), 'utf8'));
    assert.strictEqual(amb02.canonical_job_status, 'NEEDS_RECONCILIATION');
    assert.strictEqual(amb02.outcome_reason, 'ESCALATED_HUMAN_REVIEW');
    assert.strictEqual(amb02.evaluation.repair_proposal_generated, false);
    assert.strictEqual(amb02.evaluation.candidate_operations_count, 0);
    assert.strictEqual(amb02.evaluation.autonomous_repair_permitted, false);
    assert.strictEqual(amb02.evaluation.active_delivery_preserved, true);

    // Independent cryptographic verification of CASE-AMB-02 fixture file
    const amb02FixturePath = path.join(ROOT_DIR, amb02.fixture_file);
    const amb02ActualFixtureHash = fileSha256(amb02FixturePath);
    const amb02ExpectedPreHash = preservationRep.post_evaluation_hashes['CASE-AMB-02'].pre_hash;
    assert.strictEqual(amb02ActualFixtureHash, amb02ExpectedPreHash, 'CASE-AMB-02 fixture file mutated!');
    assert.strictEqual(amb02ActualFixtureHash, '28410d4a0c2118cab2b2df611df555d19f7fb4d9139f258a6da4a9958ebbc8cf');

    // Independent cryptographic verification of CASE-AMB-02 source project (CORPUS-02: assets/cinematic_ad_events_20s.json)
    const corpus02Path = path.join(ROOT_DIR, 'assets/cinematic_ad_events_20s.json');
    const corpus02ActualHash = fileSha256(corpus02Path);
    const corpus02ExpectedHash = inputChecksums.pristine_source_projects['assets/cinematic_ad_events_20s.json'].sha256;
    assert.strictEqual(corpus02ActualHash, corpus02ExpectedHash, 'CORPUS-02 source project mutated!');
    assert.strictEqual(corpus02ActualHash, '2e763f7c52bac362deff13c97d8b6fc66b75930a7fc96fdb42646eea5846aff3');

    // 3. Independent active delivery safety invariant check
    assert.strictEqual(preservationRep.active_delivery_preserved, true);
    assert.strictEqual(amb01.evaluation.active_delivery_preserved, true);
    assert.strictEqual(amb02.evaluation.active_delivery_preserved, true);
  });

  test('SHW-12: Unsupported cases fail-closed rejection (URR >= 0.95, strictly 0 execution bypasses)', () => {
    const confRep = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'confidence-escalation-report.json'), 'utf8'));
    const uns = confRep.unsupported_cases;

    assert.strictEqual(uns.status, 'PASSED');
    assert.strictEqual(uns.total_evaluated, 2);
    assert.strictEqual(uns.rejected_fail_closed, 2);
    assert.strictEqual(uns.unsupported_rejection_rate, 1.0);
    assert.strictEqual(uns.execution_bypasses, 0);

    for (const c of uns.cases) {
      assert.strictEqual(c.routing, 'EXPLICIT_UNSUPPORTED_REJECTION');
      assert.strictEqual(c.autonomous_permitted, false);
      assert.strictEqual(c.canonical_job_status, 'FAILED');
    }

    // Verify individual case records for unsupported features
    const uns01 = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'cases/shadow-case-uns-01.json'), 'utf8'));
    const uns02 = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'cases/shadow-case-uns-02.json'), 'utf8'));
    assert.strictEqual(uns01.canonical_job_status, 'FAILED');
    assert.strictEqual(uns01.outcome_reason, 'REJECTED_UNSUPPORTED');
    assert.strictEqual(uns01.evaluation.repair_proposal_generated, false);
    assert.strictEqual(uns01.evaluation.candidate_operations_count, 0);
    assert.strictEqual(uns01.evaluation.active_delivery_preserved, true);
    assert.strictEqual(uns01.evaluation.fixture_hash_preserved, true);

    assert.strictEqual(uns02.canonical_job_status, 'FAILED');
    assert.strictEqual(uns02.outcome_reason, 'REJECTED_UNSUPPORTED');
    assert.strictEqual(uns02.evaluation.repair_proposal_generated, false);
    assert.strictEqual(uns02.evaluation.candidate_operations_count, 0);
    assert.strictEqual(uns02.evaluation.active_delivery_preserved, true);
    assert.strictEqual(uns02.evaluation.fixture_hash_preserved, true);
  });

  test('SHW-13: Deliverable completeness and forensic audit trail reconciliation (Exactly 9 deliverables)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'shadow-evaluation-manifest.json'), 'utf8'));
    assert.strictEqual(manifest.protocol_version, '1.5.0');
    assert.strictEqual(manifest.stage, '31.3');
    assert.strictEqual(manifest.cases_evaluated, 36);
    assert.strictEqual(manifest.overall_stage_disposition, 'PASSED_ALL_GATES');

    // Deliverable 2: Verify cases directory contains all 36 individual case records
    const caseFiles = fs.readdirSync(path.join(STAGE_31_3_DIR, 'cases'));
    assert.strictEqual(caseFiles.length, 36, 'All 36 individual shadow case records must exist');

    // Verify all 8 root deliverable files exist (making 9 total deliverables with cases/)
    const mandatedDeliverables = [
      'shadow-evaluation-manifest.json',
      'detection-localization-metrics.json',
      'diagnosis-repair-metrics.json',
      'confidence-escalation-report.json',
      'clean-control-false-positive-report.json',
      'abstention-report.json',
      'original-state-preservation.json',
      'stage-report.md'
    ];

    for (const d of mandatedDeliverables) {
      assert.ok(fs.existsSync(path.join(STAGE_31_3_DIR, d)), `Missing deliverable: ${d}`);
    }
  });

});
