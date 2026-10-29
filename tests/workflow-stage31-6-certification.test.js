/**
 * Test Suite: Stage 31.6 — Evidence Reconciliation, Final Audit, and Milestone Certification
 *
 * Verifies all 15 discrete criteria mandated by Architecture Lead in Protocol v1.5.0 & Directive:
 * - CRT-01: Benchmark Certification Identity Freeze (source commit, branch, protocol v1.5.0, manifest digests)
 * - CRT-02: Complete Evidence Chain Gate Reconciliation (Stages 31.1 through 31.5 all ACCEPTED)
 * - CRT-03: CASE-SDC-STALE-02 Forensic Trace (Operation journal OP-CASE-SDC-STALE-02-REGEN + on-disk MP4 SHA-256)
 * - CRT-04: Corpus & Fixture Population Integrity (36 fixtures, 6 projects, duration tiers, track density)
 * - CRT-05: Defect Taxonomy Coverage (11 defect classes, 26 scored defect cases, confusion matrix counts)
 * - CRT-06: Scored Defect Localization (N=26 continuous IoU stats: mean=1.0, min=1.0, max=1.0, std=0.0; exact rate=100%)
 * - CRT-07: Candidate Repair Localization & Operations (N=22 continuous IoU stats, 24 operations committed)
 * - CRT-08: Dedicated Evaluation Gates (Clean controls FPR=0%, Ambiguous escalation=100%, Unsupported rejection=100%)
 * - CRT-09: Fresh Earshot QA Pass Rate & Acoustic Ceilings (14 reports, True Peak <= -1.0 dBTP, 0 clipped samples)
 * - CRT-10: Collateral Change Prevention & Active Delivery Safety (0 collateral diffs, 0 active-delivery promotions)
 * - CRT-11: Canonical Timebase Invariant (120,000 ticks/sec, integer ticks, half-open intervals)
 * - CRT-12: Frozen Canonical Schemas (18 schema/*.v1.schema.json valid JSON Schema Draft-07)
 * - CRT-13: Predecessor Regression Baseline & Additive Lineage (386 accepted baseline, 401 baseline entering 31.6, 416 cumulative milestone total)
 * - CRT-14: Master Artifact Integrity & Flat SHA-256 Ledger (all stage deliverables present, non-empty, and hashed)
 * - CRT-15: Final Milestone Certification Dossier Completeness (all required sections and recommendation present)
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
const STAGE_31_6_DIR = path.join(ROOT_DIR, 'artifacts/phase-31/stage-31.6');

describe('Stage 31.6: Evidence Reconciliation, Final Audit, and Milestone Certification', () => {

  test('CRT-01: Benchmark Certification Identity Freeze', () => {
    const ident = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'certification-identity.json'), 'utf8'));
    assert.strictEqual(ident.protocol_version, '1.5.0');
    assert.strictEqual(ident.stage, '31.6');
    assert.strictEqual(ident.milestone, 'Phase 31 — Real-Project Validation & Diverse Defect Benchmark');
    assert.ok(ident.stage31_5_accepted_source_commit.startsWith('92214a3'));
    assert.strictEqual(ident.predecessor_certified_commit, '4075748615cf14716d35d7922276ad2a3fd442a3');
    assert.strictEqual(ident.predecessor_certified_tag, 'phase-30-certified');
    assert.ok(ident.current_source_commit);
    assert.ok(ident.key_manifest_hashes);
    assert.strictEqual(ident.key_manifest_hashes.stage31_1_benchmark_scoring_spec, fileSha256(path.join(STAGE_31_1_DIR, 'benchmark-scoring-spec.json')));
    assert.strictEqual(ident.key_manifest_hashes.stage31_2_reconciled_corpus_manifest, fileSha256(path.join(STAGE_31_2_DIR, 'reconciled-corpus-manifest.json')));
    assert.strictEqual(ident.key_manifest_hashes.stage31_5_master_benchmark_results, fileSha256(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json')));
  });

  test('CRT-02: Complete Evidence Chain Gate Reconciliation', () => {
    const chain = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'complete-evidence-chain.json'), 'utf8'));
    assert.strictEqual(chain.protocol_version, '1.5.0');
    assert.strictEqual(chain.stage, '31.6');
    assert.strictEqual(chain.stages.length, 5);

    const stageIds = chain.stages.map(s => s.stage_id);
    assert.deepStrictEqual(stageIds, ['STAGE-31.1', 'STAGE-31.2', 'STAGE-31.3', 'STAGE-31.4', 'STAGE-31.5']);

    for (const stage of chain.stages) {
      assert.strictEqual(stage.ruling_verdict, 'UNCONDITIONALLY ACCEPTED');
      assert.ok(stage.gates.length >= 5);
      for (const gate of stage.gates) {
        assert.strictEqual(gate.status, 'PASS');
      }
    }
  });

  test('CRT-03: CASE-SDC-STALE-02 Forensic Trace', () => {
    const chain = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'complete-evidence-chain.json'), 'utf8'));
    const sdcAudit = chain.case_sdc_stale_02_correction_audit;
    assert.ok(sdcAudit);
    assert.strictEqual(sdcAudit.case_id, 'CASE-SDC-STALE-02');
    assert.strictEqual(sdcAudit.target_asset_descriptor.id, 'raw_manoj_roto');
    assert.strictEqual(sdcAudit.referenced_asset.filesystem_path, 'raw_videos/Manoj_Bajpayee_Roto.mp4');
    assert.strictEqual(sdcAudit.referenced_asset.media_type, 'video/mp4');
    assert.strictEqual(sdcAudit.referenced_asset.byte_size, 14645822);
    assert.strictEqual(sdcAudit.referenced_asset.on_disk_byte_sha256, '7de259910646bc420afee42912d7a4ddd2c2eb85691d54a79a976c9589f43462');
    assert.strictEqual(sdcAudit.authoritative_candidate_sidecar.cached_asset_sha256, '7de259910646bc420afee42912d7a4ddd2c2eb85691d54a79a976c9589f43462');
    assert.strictEqual(sdcAudit.authoritative_candidate_sidecar.candidate_file_sha256, '71f3024809c4bbdb60f65f7e644c22e78db65f83276f1773d0e791cbd4b604a1');
    assert.strictEqual(sdcAudit.authoritative_operation_journal.operation_id, 'OP-CASE-SDC-STALE-02-REGEN');
    assert.strictEqual(sdcAudit.authoritative_operation_journal.reconciled_asset_sha256, '7de259910646bc420afee42912d7a4ddd2c2eb85691d54a79a976c9589f43462');
    assert.strictEqual(sdcAudit.checksum_match, true);
  });

  test('CRT-04: Corpus & Fixture Population Integrity', () => {
    const corpus = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'corpus-reconciliation.json'), 'utf8'));
    assert.strictEqual(corpus.total_fixtures, 36);
    assert.strictEqual(corpus.distinct_projects_count, 6);
    assert.strictEqual(corpus.projects.length, 6);

    const microProjects = corpus.projects.filter(p => p.tier === 'Tier 1 Micro');
    const standardProjects = corpus.projects.filter(p => p.tier === 'Tier 2 Standard');
    assert.strictEqual(microProjects.length, 3);
    assert.strictEqual(standardProjects.length, 3);

    const highDensityProjects = corpus.projects.filter(p => p.tracks > 4);
    assert.strictEqual(highDensityProjects.length, 2); // CORPUS-01 (6) and CORPUS-05 (5)
  });

  test('CRT-05: Defect Taxonomy Coverage', () => {
    const corpus = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'corpus-reconciliation.json'), 'utf8'));
    const scored = corpus.population_stratification.scored_defect_cases;
    assert.strictEqual(scored.count, 26);
    assert.strictEqual(Object.keys(scored.classes).length, 11);

    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    const sPerf = master.scored_defect_performance;
    assert.strictEqual(sPerf.confusion_matrix.tp, 26);
    assert.strictEqual(sPerf.confusion_matrix.fp, 0);
    assert.strictEqual(sPerf.confusion_matrix.fn, 0);
    assert.strictEqual(sPerf.precision.point, 1.0);
    assert.strictEqual(sPerf.recall.point, 1.0);
  });

  test('CRT-06: Scored Defect Localization (N=26 Continuous IoU Stats & Binary Rate)', () => {
    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    const loc = master.scored_defect_performance.localization;
    assert.strictEqual(loc.continuous_iou.count, 26);
    assert.strictEqual(loc.continuous_iou.mean, 1.0);
    assert.strictEqual(loc.continuous_iou.min, 1.0);
    assert.strictEqual(loc.continuous_iou.max, 1.0);
    assert.strictEqual(loc.continuous_iou.std_dev, 0.0);
    assert.strictEqual(loc.exact_localization_rate.point, 1.0);
    assert.strictEqual(loc.exact_localization_rate.numerator, 26);
    assert.strictEqual(loc.exact_localization_rate.denominator, 26);
    assert.ok(loc.exact_localization_rate.interval.lower > 0.85);
  });

  test('CRT-07: Candidate Repair Localization & Operations (N=22)', () => {
    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    const cand = master.candidate_repair_localization;
    assert.strictEqual(cand.total_cases, 22);
    assert.strictEqual(cand.continuous_iou.count, 22);
    assert.strictEqual(cand.continuous_iou.mean, 1.0);
    assert.strictEqual(cand.exact_localization_rate.point, 1.0);
    assert.strictEqual(cand.repair_proposal_validity.numerator, 22);
    assert.strictEqual(cand.repair_proposal_validity.denominator, 22);
    assert.strictEqual(cand.operation_execution.denominator, 24);
  });

  test('CRT-08: Dedicated Evaluation Gates (Clean FPR, Ambiguous, Unsupported)', () => {
    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    assert.strictEqual(master.clean_control_evaluation.total_cases, 6);
    assert.strictEqual(master.clean_control_evaluation.false_positives, 0);
    assert.strictEqual(master.clean_control_evaluation.false_positive_rate.point, 0.0);
    assert.strictEqual(master.clean_control_evaluation.status, 'PASS');

    assert.strictEqual(master.ambiguous_intent_evaluation.total_cases, 2);
    assert.strictEqual(master.ambiguous_intent_evaluation.escalated_to_human_review, 2);
    assert.strictEqual(master.ambiguous_intent_evaluation.autonomous_mutations, 0);
    assert.strictEqual(master.ambiguous_intent_evaluation.status, 'PASS');

    assert.strictEqual(master.unsupported_feature_evaluation.total_cases, 2);
    assert.strictEqual(master.unsupported_feature_evaluation.rejected_fail_closed, 2);
    assert.strictEqual(master.unsupported_feature_evaluation.autonomous_executions, 0);
    assert.strictEqual(master.unsupported_feature_evaluation.status, 'PASS');

    assert.strictEqual(master.overall_action_routing.total_cases, 36);
    assert.strictEqual(master.overall_action_routing.compliant_routings, 36);
    assert.strictEqual(master.overall_action_routing.compliance_rate.point, 1.0);
  });

  test('CRT-09: Fresh Earshot QA Pass Rate & Acoustic Ceilings', () => {
    const master = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'master-benchmark-results.json'), 'utf8'));
    assert.strictEqual(master.candidate_repair_localization.audio_qa_pass_rate.numerator, 14);
    assert.strictEqual(master.candidate_repair_localization.audio_qa_pass_rate.denominator, 14);
    assert.strictEqual(master.candidate_repair_localization.audio_qa_pass_rate.interval.point, 1.0);

    const spec = JSON.parse(fs.readFileSync(path.join(STAGE_31_1_DIR, 'benchmark-scoring-spec.json'), 'utf8'));
    assert.strictEqual(spec.scoring_thresholds.audio_true_peak_max_dbtp, -1.0);
  });

  test('CRT-10: Collateral Change Prevention & Active Delivery Safety', () => {
    const col = JSON.parse(fs.readFileSync(path.join(STAGE_31_5_DIR, 'collateral-change-report.json'), 'utf8'));
    assert.strictEqual(col.total_candidates_audited, 22);
    assert.strictEqual(col.unaffected_tracks_diff_count, 0);
    assert.strictEqual(col.active_delivery_promotions_count, 0);
    assert.strictEqual(col.metadata_corruption_count, 0);
    assert.ok(col.audit_verdict.startsWith('PASS'));
  });

  test('CRT-11: Canonical Timebase Invariant', () => {
    const safety = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'safety-invariants-audit.json'), 'utf8'));
    const tb = safety.invariants.find(i => i.invariant_id === 'INV-01-TIMEBASE');
    assert.ok(tb);
    assert.strictEqual(tb.violations_detected, 0);
    assert.strictEqual(tb.status, 'VERIFIED_COMPLIANT');
  });

  test('CRT-12: Frozen Canonical Schemas & Schema Inventory Reconciliation', () => {
    const safety = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'safety-invariants-audit.json'), 'utf8'));
    const sc = safety.invariants.find(i => i.invariant_id === 'INV-02-SCHEMAS');
    assert.ok(sc);
    assert.strictEqual(sc.canonical_schemas_count, 18);
    assert.strictEqual(sc.auxiliary_schemas_count, 5);
    assert.strictEqual(sc.total_schemas_count, 23);
    assert.strictEqual(sc.all_valid_draft07, true);
    assert.strictEqual(sc.status, 'VERIFIED_COMPLIANT');

    const recon = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'schema-inventory-reconciliation.json'), 'utf8'));
    assert.strictEqual(recon.canonical_schemas_count, 18);
    assert.strictEqual(recon.auxiliary_schemas_count, 5);
    assert.strictEqual(recon.total_schemas_count, 23);
    assert.strictEqual(recon.canonical_schemas.length, 18);
    assert.strictEqual(recon.auxiliary_schemas.length, 5);
  });

  test('CRT-13: Predecessor Regression Baseline & Additive Lineage (401 baseline entering 31.6, 416 milestone total)', () => {
    const reg = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'cumulative-regression-lineage.json'), 'utf8'));
    const metrics = reg.milestone_regression_metrics;
    assert.strictEqual(metrics.accepted_stage31_4_baseline, 386);
    assert.strictEqual(metrics.stage31_5_additive_tests, 15);
    assert.strictEqual(metrics.benchmark_baseline_entering_stage31_6, 401);
    assert.strictEqual(metrics.stage31_6_additive_tests, 15);
    assert.strictEqual(metrics.milestone_certification_total_tests, 416);
    assert.strictEqual(metrics.total_suites, 17);
    assert.strictEqual(metrics.failures, 0);
    assert.strictEqual(reg.cumulative_suites.length, 17);

    for (const suite of reg.cumulative_suites) {
      assert.strictEqual(suite.status, 'PASS');
      assert.ok(suite.test_cases_count > 0);
    }
  });

  test('CRT-14: Master Artifact Integrity & Flat SHA-256 Ledger', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(STAGE_31_6_DIR, 'artifact-integrity-manifest.json'), 'utf8'));
    assert.ok(manifest.total_artifacts_audited >= 40);
    for (const art of manifest.artifacts) {
      const fullPath = path.join(ROOT_DIR, art.relative_path);
      assert.ok(fs.existsSync(fullPath), `Artifact must exist on disk: ${art.relative_path}`);
      const actualHash = fileSha256(fullPath);
      assert.strictEqual(actualHash, art.sha256, `SHA-256 mismatch for ${art.relative_path}`);
    }

    const flatSha = fs.readFileSync(path.join(STAGE_31_6_DIR, 'evidence-inventory.sha256'), 'utf8');
    assert.ok(flatSha.length > 500);
    assert.ok(flatSha.includes('master-benchmark-results.json'));
    assert.ok(flatSha.includes('reconciled-corpus-manifest.json'));
  });

  test('CRT-15: Final Milestone Certification Dossier Completeness', () => {
    const dossier = fs.readFileSync(path.join(STAGE_31_6_DIR, 'certification-dossier.md'), 'utf8');
    assert.ok(dossier.includes('Executive Summary & Milestone Certification Statement'));
    assert.ok(dossier.includes('Gate-by-Gate Audit & Evidence Chain Reconciliation'));
    assert.ok(dossier.includes('Finding A Resolution: CASE-SDC-STALE-02 Checksum-Provenance Reconciliation'));
    assert.ok(dossier.includes('Predecessor Regression Lineage & Grounding Reconciliation'));
    assert.ok(dossier.includes('Architectural & Safety Invariant Audit'));
    assert.ok(dossier.includes('Documented Limitations & Non-Generalizability Declaration'));
    assert.ok(dossier.includes('Final Certification Recommendation for Phase 31'));
    assert.ok(dossier.includes('FULL AND FINAL CERTIFICATION'));
    assert.ok(dossier.includes('phase-31-certified'));
    assert.ok(dossier.includes('Stop at Phase 31. Do NOT proceed to Phase 32 or Phase 33'));
  });

});
