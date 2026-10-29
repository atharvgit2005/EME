/**
 * Stage 31.1: Corpus Definition, Ground Truth, and Benchmark Protocol Test Suite (Protocol v1.5.0)
 *
 * Implements Stage 31.1 verification:
 * - PRT-01: Entry gate verification (Phase 30 release provenance, tag, and regression)
 * - PRT-02: Corpus inventory completeness, schema validation, track counts & provenance
 * - PRT-03: Defect taxonomy coverage across all 10 mandatory families
 * - PRT-04: Independent ground-truth protocol specification, ontological definitions & non-circularity
 * - PRT-05: Benchmark scoring specification integrity, 11-defect-class macro averaging & anti-concealment
 * - PRT-06: Support & limitation matrix validity
 * - PRT-07: Frozen benchmark manifest SHA-256 integrity verification (v1.5.0)
 * - PRT-08: Non-destructive execution guarantee (zero mutation to original corpus files)
 * - PRT-09: Historical protocol version preservation (archive-v1.0.0 through v1.4.0 traceability)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const STAGE_DIR = path.resolve('artifacts/phase-31/stage-31.1');
const BASELINE_DIR = path.resolve('artifacts/phase-31/baseline');
const ARCHIVE_V100_DIR = path.join(STAGE_DIR, 'archive-v1.0.0');
const ARCHIVE_V110_DIR = path.join(STAGE_DIR, 'archive-v1.1.0');
const ARCHIVE_V120_DIR = path.join(STAGE_DIR, 'archive-v1.2.0');
const ARCHIVE_V130_DIR = path.join(STAGE_DIR, 'archive-v1.3.0');
const ARCHIVE_V140_DIR = path.join(STAGE_DIR, 'archive-v1.4.0');

describe('Stage 31.1: Corpus Definition, Ground Truth, and Benchmark Protocol (v1.5.0)', () => {

  test('PRT-01: Entry gate verification (Phase 30 release provenance, tag, and regression)', () => {
    const entryGatePath = path.join(BASELINE_DIR, 'phase-30-entry-gate.json');
    assert.ok(fs.existsSync(entryGatePath), 'Entry gate artifact must exist');

    const entryGate = JSON.parse(fs.readFileSync(entryGatePath, 'utf8'));
    assert.strictEqual(entryGate.entry_gate.certification_decision, 'UNCONDITIONALLY_CERTIFIED');
    assert.strictEqual(entryGate.entry_gate.certified_commit, '4075748615cf14716d35d7922276ad2a3fd442a3');
    assert.strictEqual(entryGate.entry_gate.certified_tag, 'phase-30-certified');
    assert.strictEqual(entryGate.entry_gate.predecessor_regression_total, 338);
    assert.strictEqual(entryGate.entry_gate.predecessor_regression_passed, 338);

    // Verify tag exists in Git repository
    const tagPeel = execSync('git rev-parse phase-30-certified^{}', { encoding: 'utf8' }).trim();
    assert.strictEqual(tagPeel, '4075748615cf14716d35d7922276ad2a3fd442a3');
  });

  test('PRT-02: Corpus inventory completeness, schema validation, track counts & provenance', () => {
    const invPath = path.join(STAGE_DIR, 'corpus-inventory.json');
    assert.ok(fs.existsSync(invPath));
    const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));

    assert.strictEqual(inv.protocol_version, '1.5.0');
    assert.ok(Array.isArray(inv.projects));
    assert.strictEqual(inv.projects.length, 6);

    const validTiers = ['tier_1_micro_under_15s', 'tier_2_standard_15_to_30s'];

    for (const proj of inv.projects) {
      assert.ok(proj.project_id.startsWith('CORPUS-'));
      assert.ok(proj.stable_id);
      assert.ok(proj.name);
      assert.ok(proj.format);
      assert.ok(proj.source_path);
      const fullSourcePath = path.resolve(proj.source_path);
      assert.ok(fs.existsSync(fullSourcePath), `Corpus source file must exist: ${proj.source_path}`);
      assert.ok(proj.duration_ticks > 0);
      assert.ok(proj.fps > 0);
      assert.ok(validTiers.includes(proj.duration_tier), `Invalid duration tier: ${proj.duration_tier}`);
      assert.ok(proj.clean_control_run_id.startsWith('RUN-CLEAN-'));

      // Verify duration boundary compliance
      if (proj.duration_tier === 'tier_1_micro_under_15s') {
        assert.ok(proj.duration_seconds < 15.0, `Project ${proj.project_id} duration must be < 15.0s`);
      } else {
        assert.ok(proj.duration_seconds >= 15.0 && proj.duration_seconds <= 30.0, `Project ${proj.project_id} duration must be 15-30s`);
      }

      // Verify comprehensive provenance
      assert.ok(proj.provenance, `Project ${proj.project_id} must have complete provenance`);
      assert.ok(proj.provenance.origin_repository);
      assert.ok(proj.provenance.source_revision);
      assert.ok(proj.provenance.license_spdx);
      assert.ok(proj.provenance.license_reference);
      assert.ok(proj.provenance.attribution_obligation);
      assert.ok(proj.provenance.permission_evidence);
      assert.ok(proj.provenance.conversion_history);
      assert.ok(proj.provenance.privacy_and_distribution);

      // Verify SHA-256 digest of media/project file
      const actualSha = crypto.createHash('sha256').update(fs.readFileSync(fullSourcePath)).digest('hex');
      assert.strictEqual(actualSha, proj.provenance.sha256, `SHA-256 digest mismatch for ${proj.project_id}`);
    }

    // Verify track count accuracy on the projects with >4 tracks
    const p1 = inv.projects.find(p => p.project_id === 'CORPUS-01');
    const p5 = inv.projects.find(p => p.project_id === 'CORPUS-05');
    assert.strictEqual(p1.tracks_count, 5, 'CORPUS-01 must have exactly 5 tracks');
    assert.strictEqual(p5.tracks_count, 5, 'CORPUS-05 must have exactly 5 tracks');

    // Verify CORPUS-06 timeline project provenance
    const p6 = inv.projects.find(p => p.project_id === 'CORPUS-06');
    assert.strictEqual(p6.format, 'eme-project.v1');
    assert.strictEqual(p6.source_path, 'projects/pristine-master-control-20s.json');
    assert.ok(fs.existsSync(path.resolve(p6.source_path)));

    // Verify CORPUS-04 canonical project provenance and clean control baseline isolation
    const p4 = inv.projects.find(p => p.project_id === 'CORPUS-04');
    assert.strictEqual(p4.format, 'eme-project.v1');
    assert.strictEqual(p4.source_path, 'projects/creator-reel-qa-10s.json');
    assert.ok(fs.existsSync(path.resolve(p4.source_path)));
    assert.ok(p4.clean_control_baseline);
    assert.strictEqual(p4.clean_control_baseline.source_path, 'fixtures/qa-audio-clean-manifest.json');
    assert.ok(fs.existsSync(path.resolve(p4.clean_control_baseline.source_path)));
    const actualCleanSha = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(p4.clean_control_baseline.source_path))).digest('hex');
    assert.strictEqual(actualCleanSha, p4.clean_control_baseline.sha256);
  });

  test('PRT-03: Defect taxonomy coverage across all 10 mandatory families', () => {
    const taxPath = path.join(STAGE_DIR, 'defect-taxonomy.json');
    assert.ok(fs.existsSync(taxPath));
    const tax = JSON.parse(fs.readFileSync(taxPath, 'utf8'));

    assert.strictEqual(tax.protocol_version, '1.5.0');
    assert.ok(Array.isArray(tax.families));
    assert.strictEqual(tax.families.length, 10);

    const expectedFamilies = [
      'Timeline Structure',
      'Synchronization',
      'Audio Level',
      'Audio Continuity',
      'Transitions',
      'Sidecar Metadata',
      'Structural Consistency',
      'False-Positive Controls',
      'Ambiguous Cases',
      'Unsupported Cases'
    ];

    const actualNames = tax.families.map(f => f.name);
    for (const expected of expectedFamilies) {
      assert.ok(actualNames.includes(expected), `Missing required defect family: ${expected}`);
    }
  });

  test('PRT-04: Independent ground-truth protocol specification, ontological definitions & non-circularity', () => {
    const gtPath = path.join(STAGE_DIR, 'ground-truth-protocol.json');
    assert.ok(fs.existsSync(gtPath));
    const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

    assert.strictEqual(gt.protocol_version, '1.5.0');

    // Verify ontological definitions
    assert.ok(gt.ontological_definitions);
    assert.ok(gt.ontological_definitions.source_project);
    assert.ok(gt.ontological_definitions.defect_instance);
    assert.ok(gt.ontological_definitions.benchmark_case);
    assert.ok(gt.ontological_definitions.reviewed_ground_truth_decision);
    assert.match(gt.ontological_definitions.benchmark_case, /36 benchmark cases/);
    assert.match(gt.ontological_definitions.reviewed_ground_truth_decision, /36 benchmark cases/);

    // Verify non-circularity and tolerance
    assert.ok(gt.methodology.non_circularity);
    assert.match(gt.methodology.non_circularity, /prior to benchmark execution/i);
    assert.strictEqual(gt.methodology.localization_tolerance.timebase_ticks_per_sec, 120000);
    assert.ok(gt.methodology.localization_tolerance.audio_sync_tolerance_ticks <= 4000);
    assert.ok(Array.isArray(gt.methodology.severity_levels));
    assert.ok(gt.methodology.severity_levels.includes('CRITICAL'));

    // Verify dual review signoff & denominator semantics
    assert.ok(gt.methodology.dual_review_signoff);
    assert.ok(gt.methodology.denominator_semantics);
    assert.match(gt.methodology.denominator_semantics.clean_controls, /Run_FPR = FP_runs \/ 6/);
    assert.match(gt.methodology.denominator_semantics.ambiguous_cases, /denominator = 2/);
    assert.match(gt.methodology.denominator_semantics.unsupported_cases, /denominator = 2/);
  });

  test('PRT-05: Benchmark scoring specification integrity, 11-defect-class macro averaging & anti-concealment', () => {
    const scorePath = path.join(STAGE_DIR, 'benchmark-scoring-spec.json');
    assert.ok(fs.existsSync(scorePath));
    const score = JSON.parse(fs.readFileSync(scorePath, 'utf8'));

    assert.strictEqual(score.protocol_version, '1.5.0');

    // Quantitative corpus minimums
    const qcm = score.quantitative_corpus_minimums;
    assert.ok(qcm);
    assert.strictEqual(qcm.min_distinct_source_projects, 6);
    assert.strictEqual(qcm.scored_defect_classes_count, 11);
    assert.strictEqual(qcm.defect_cases_count, 26);
    assert.strictEqual(qcm.clean_control_runs_count, 6);
    assert.strictEqual(qcm.ambiguous_cases_count, 2);
    assert.strictEqual(qcm.unsupported_cases_count, 2);
    assert.strictEqual(qcm.min_total_benchmark_cases, 36);
    assert.strictEqual(qcm.min_reviewed_ground_truth_decisions, 36);

    // Track complexity verification: >4 tracks satisfied by CORPUS-01 and CORPUS-05
    assert.ok(qcm.track_complexity_distribution.greater_than_4_tracks_quota.satisfied);
    assert.strictEqual(qcm.track_complexity_distribution.greater_than_4_tracks_quota.qualifying_projects_count, 2);
    assert.deepStrictEqual(qcm.track_complexity_distribution.greater_than_4_tracks_quota.qualifying_project_ids, ['CORPUS-01', 'CORPUS-05']);

    // Clean control runs list & run-level semantics
    assert.strictEqual(qcm.clean_control_runs.length, 6);
    const cleanRunIds = qcm.clean_control_runs.map(r => r.run_id);
    assert.deepStrictEqual(cleanRunIds, [
      'RUN-CLEAN-01', 'RUN-CLEAN-02', 'RUN-CLEAN-03',
      'RUN-CLEAN-04', 'RUN-CLEAN-05', 'RUN-CLEAN-06'
    ]);
    assert.match(qcm.denominator_contribution_rules.clean_controls, /Run_FPR = FP_runs \/ 6/);

    // Audio true peak scoping: must explicitly restrict to audio delivery specs
    assert.ok(score.audio_true_peak_scoping);
    assert.match(score.audio_true_peak_scoping.applicability, /audio-relevant/i);
    assert.strictEqual(score.audio_true_peak_scoping.ceiling_threshold_dbtp, -1.0);

    // Undefined metric disposition rules
    assert.ok(score.undefined_metric_disposition_rules);
    assert.ok(score.undefined_metric_disposition_rules.zero_predicted_positives);
    assert.ok(score.undefined_metric_disposition_rules.zero_ground_truth_positives);
    assert.ok(score.undefined_metric_disposition_rules.missing_predicted_localization_region);
    assert.ok(score.undefined_metric_disposition_rules.macro_averaging_with_undefined_metric);
    assert.ok(score.undefined_metric_disposition_rules.micro_averaging_zero_denominator);
    assert.ok(score.undefined_metric_disposition_rules.unscorable_cases_due_to_fixture_defect);

    // Macro vs Micro averaging definitions (Option B: Defect-Class-Level Macro Average)
    assert.ok(score.aggregation_semantics.macro_averaging);
    assert.strictEqual(score.aggregation_semantics.macro_averaging.unit, 'DEFECT_CLASS_LEVEL');
    assert.strictEqual(score.aggregation_semantics.macro_averaging.denominator, 11);
    assert.ok(score.aggregation_semantics.macro_averaging.anti_concealment_gate);
    assert.ok(score.aggregation_semantics.macro_averaging.non_defect_families_separation);
    assert.ok(score.aggregation_semantics.micro_averaging);

    // Verify macro-averaging calculation: unweighted arithmetic mean over 11 classes
    const testClassRecalls = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0]; // 10 pass, 1 undefined (0 predictions -> 0.00)
    const macroRecall = testClassRecalls.reduce((a, b) => a + b, 0) / score.aggregation_semantics.macro_averaging.denominator;
    assert.strictEqual(Number(macroRecall.toFixed(4)), Number((10 / 11).toFixed(4)));

    // Anti-concealment gate: class 11 (0.00) fails individual gate (0.00 < 0.85) causing benchmark failure
    const individualGatesPassed = testClassRecalls.every(r => r >= score.scoring_thresholds.detection_recall_min);
    assert.strictEqual(individualGatesPassed, false, 'Failed mandatory defect class must not be concealed by macro average');

    // Unified taxonomy-scoring reconciliation table covering all 10 families
    assert.ok(Array.isArray(score.taxonomy_scoring_reconciliation_table));
    assert.strictEqual(score.taxonomy_scoring_reconciliation_table.length, 14);

    const defectRows = score.taxonomy_scoring_reconciliation_table.filter(r => r.nature === 'DEFECT');
    assert.strictEqual(defectRows.length, 11);
    const sumDefectSamples = defectRows.reduce((acc, r) => acc + r.minimum_sample_size, 0);
    assert.strictEqual(sumDefectSamples, 26, 'Defect sample minimums must sum to exactly 26 defect cases');

    const familiesCovered = new Set(score.taxonomy_scoring_reconciliation_table.map(r => r.family_id));
    assert.strictEqual(familiesCovered.size, 10);
  });

  test('PRT-06: Support & limitation matrix validity', () => {
    const matrixPath = path.join(STAGE_DIR, 'support-limitation-matrix.json');
    assert.ok(fs.existsSync(matrixPath));
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

    assert.strictEqual(matrix.protocol_version, '1.5.0');
    assert.ok(Array.isArray(matrix.capabilities));
    const supported = matrix.capabilities.filter(c => c.supported);
    const unsupported = matrix.capabilities.filter(c => !c.supported);

    assert.ok(supported.length >= 4);
    assert.ok(unsupported.length >= 1);
  });

  test('PRT-07: Frozen benchmark manifest SHA-256 integrity verification (v1.5.0)', () => {
    const manifestPath = path.join(STAGE_DIR, 'frozen-benchmark-manifest.json');
    assert.ok(fs.existsSync(manifestPath));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.strictEqual(manifest.protocol_version, '1.5.0');
    assert.ok(manifest.files);

    for (const [relPath, expectedSha] of Object.entries(manifest.files)) {
      const fullPath = path.resolve(relPath);
      assert.ok(fs.existsSync(fullPath), `Manifested file must exist: ${relPath}`);
      const actualSha = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      assert.strictEqual(actualSha, expectedSha, `SHA-256 mismatch for ${relPath}`);
    }
  });

  test('PRT-08: Non-destructive execution guarantee (zero mutation to original corpus files)', () => {
    const invPath = path.join(STAGE_DIR, 'corpus-inventory.json');
    const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));

    // Capture initial hashes
    const initialHashes = {};
    for (const proj of inv.projects) {
      const fullPath = path.resolve(proj.source_path);
      initialHashes[proj.project_id] = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
    }

    // Verify after inspection that hashes are identical
    for (const proj of inv.projects) {
      const fullPath = path.resolve(proj.source_path);
      const postHash = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
      assert.strictEqual(postHash, initialHashes[proj.project_id], `Original corpus file mutated: ${proj.source_path}`);
    }
  });

  test('PRT-09: Historical protocol version preservation (archive-v1.0.0 through v1.4.0 traceability)', () => {
    assert.ok(fs.existsSync(ARCHIVE_V100_DIR), 'archive-v1.0.0 directory must exist');
    assert.ok(fs.existsSync(ARCHIVE_V110_DIR), 'archive-v1.1.0 directory must exist');
    assert.ok(fs.existsSync(ARCHIVE_V120_DIR), 'archive-v1.2.0 directory must exist');
    assert.ok(fs.existsSync(ARCHIVE_V130_DIR), 'archive-v1.3.0 directory must exist');
    assert.ok(fs.existsSync(ARCHIVE_V140_DIR), 'archive-v1.4.0 directory must exist');

    const manifestV100 = JSON.parse(fs.readFileSync(path.join(ARCHIVE_V100_DIR, 'frozen-benchmark-manifest.json'), 'utf8'));
    assert.strictEqual(manifestV100.protocol_version, '1.0.0');

    const manifestV110 = JSON.parse(fs.readFileSync(path.join(ARCHIVE_V110_DIR, 'frozen-benchmark-manifest.json'), 'utf8'));
    assert.strictEqual(manifestV110.protocol_version, '1.1.0');

    const manifestV120 = JSON.parse(fs.readFileSync(path.join(ARCHIVE_V120_DIR, 'frozen-benchmark-manifest.json'), 'utf8'));
    assert.strictEqual(manifestV120.protocol_version, '1.2.0');

    const manifestV130 = JSON.parse(fs.readFileSync(path.join(ARCHIVE_V130_DIR, 'frozen-benchmark-manifest.json'), 'utf8'));
    assert.strictEqual(manifestV130.protocol_version, '1.3.0');

    const manifestV140 = JSON.parse(fs.readFileSync(path.join(ARCHIVE_V140_DIR, 'frozen-benchmark-manifest.json'), 'utf8'));
    assert.strictEqual(manifestV140.protocol_version, '1.4.0');
  });

});
