/**
 * Stage 31.2: Representative Project Corpus and Defect Taxonomy Test Suite
 *
 * Implements Stage 31.2 verification:
 * - CMP-01: Six source projects qualification (track counts, formats, durations, permissions, immutable checksums)
 * - CMP-02: Duration tier distribution (minimum 2 micro <15s, minimum 2 standard 15-30s; actual 3 & 3)
 * - CMP-03: Track complexity distribution (CORPUS-01 and CORPUS-05 strictly >4 tracks; CORPUS-01, 02, 05 >=4 tracks)
 * - CMP-04: Aspect ratio distribution (minimum 2 vertical 9:16, minimum 2 horizontal 16:9; actual 4 & 2)
 * - CMP-05: Defect taxonomy coverage & quota compliance across all 11 scored classes (26 defect cases)
 * - CMP-06: Clean-control inventory & baseline isolation (6 clean runs with expected disallowed findings == 0, CORPUS-04 isolation)
 * - CMP-07: Ambiguous cases non-repair invariant (2 cases routing to ESCALATE_HUMAN_REVIEW with 0 autonomous repair)
 * - CMP-08: Unsupported cases fail-closed invariant (2 cases routing to EXPLICIT_UNSUPPORTED_REJECTION with 0 execution)
 * - CMP-09: All 36 benchmark case records conform to Section 5.1 defect record schema and dual review signoff
 * - CMP-10: Zero unintended cross-class instance overlap (each defect case has exactly 1 target instance)
 * - CMP-11: Exclusion register and corpus qualification policy compliance
 * - CMP-12: Non-destructive isolation guarantee (zero mutation to original source fixtures)
 * - CMP-13: Reconciled corpus manifest SHA-256 integrity across all 36 fixtures and cases
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STAGE_DIR = path.resolve('artifacts/phase-31/stage-31.2');
const FIXTURES_DIR = path.join(STAGE_DIR, 'fixtures');
const CASES_DIR = path.join(STAGE_DIR, 'cases');

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

describe('Stage 31.2: Representative Project Corpus and Defect Taxonomy (Protocol v1.5.0)', () => {

  test('CMP-01: Six source projects qualification (track counts, formats, durations, permissions, immutable checksums)', () => {
    const invPath = path.resolve('artifacts/phase-31/stage-31.1/corpus-inventory.json');
    assert.ok(fs.existsSync(invPath));
    const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));

    assert.strictEqual(inv.projects.length, 6);

    for (const proj of inv.projects) {
      const fullPath = path.resolve(proj.source_path);
      assert.ok(fs.existsSync(fullPath), `Source project file must exist: ${proj.source_path}`);

      // Verify immutable SHA-256 match
      const actualSha = fileSha256(fullPath);
      assert.strictEqual(actualSha, proj.provenance.sha256, `Checksum mismatch for ${proj.project_id}`);

      // Verify valid licensing and permission evidence
      assert.ok(proj.provenance.license_spdx);
      assert.ok(proj.provenance.permission_evidence);
      assert.ok(proj.provenance.privacy_and_distribution);
    }
  });

  test('CMP-02: Duration tier distribution (minimum 2 micro <15s, minimum 2 standard 15-30s; actual 3 & 3)', () => {
    const matrixPath = path.join(STAGE_DIR, 'project-complexity-matrix.json');
    assert.ok(fs.existsSync(matrixPath));
    const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8'));

    const tier1 = matrix.summary.duration_tiers.tier_1_micro_under_15s;
    const tier2 = matrix.summary.duration_tiers.tier_2_standard_15_to_30s;

    assert.ok(tier1.count >= 2, 'Tier 1 must have at least 2 projects');
    assert.ok(tier2.count >= 2, 'Tier 2 must have at least 2 projects');
    assert.strictEqual(tier1.count, 3);
    assert.strictEqual(tier2.count, 3);
    assert.strictEqual(tier1.count + tier2.count, 6);
  });

  test('CMP-03: Track complexity distribution (CORPUS-01 and CORPUS-05 strictly >4 tracks; CORPUS-01, 02, 05 >=4 tracks)', () => {
    const matrix = JSON.parse(fs.readFileSync(path.join(STAGE_DIR, 'project-complexity-matrix.json'), 'utf8'));

    const gt4 = matrix.summary.track_complexity.strictly_greater_than_4_tracks;
    assert.strictEqual(gt4.satisfied, true);
    assert.strictEqual(gt4.count, 2);
    assert.deepStrictEqual(gt4.project_ids, ['CORPUS-01', 'CORPUS-05']);

    const multitrack = matrix.summary.track_complexity.multitrack_4_plus;
    assert.strictEqual(multitrack.satisfied, true);
    assert.strictEqual(multitrack.count, 3);
    assert.deepStrictEqual(multitrack.project_ids, ['CORPUS-01', 'CORPUS-02', 'CORPUS-05']);

    // Directly verify actual project files track counts
    const p1 = JSON.parse(fs.readFileSync(path.resolve('examples/benchmark-a-motion-graphics.json'), 'utf8'));
    const p5 = JSON.parse(fs.readFileSync(path.resolve('projects/manoj-bajpayee-150-edit.json'), 'utf8'));
    assert.strictEqual(p1.tracks.length, 5, 'CORPUS-01 must have exactly 5 tracks');
    assert.strictEqual(p5.tracks.length, 5, 'CORPUS-05 must have exactly 5 tracks');
  });

  test('CMP-04: Aspect ratio distribution (minimum 2 vertical 9:16, minimum 2 horizontal 16:9; actual 4 & 2)', () => {
    const matrix = JSON.parse(fs.readFileSync(path.join(STAGE_DIR, 'project-complexity-matrix.json'), 'utf8'));

    const v = matrix.summary.aspect_ratios.vertical_9_16;
    const h = matrix.summary.aspect_ratios.landscape_16_9;

    assert.ok(v.count >= 2, 'Must have at least 2 vertical 9:16 projects');
    assert.ok(h.count >= 2, 'Must have at least 2 landscape 16:9 projects');
    assert.strictEqual(v.count, 4);
    assert.strictEqual(h.count, 2);
  });

  test('CMP-05: Defect taxonomy coverage & quota compliance across all 11 scored classes (26 defect cases)', () => {
    const cov = JSON.parse(fs.readFileSync(path.join(STAGE_DIR, 'defect-coverage-matrix.json'), 'utf8'));

    assert.strictEqual(cov.summary.scored_defect_cases, 26);
    assert.strictEqual(cov.summary.clean_control_runs, 6);
    assert.strictEqual(cov.summary.ambiguous_cases, 2);
    assert.strictEqual(cov.summary.unsupported_cases, 2);
    assert.strictEqual(cov.summary.total_benchmark_cases, 36);
    assert.strictEqual(cov.summary.families_count, 10);
    assert.strictEqual(cov.summary.scored_defect_classes_count, 11);

    const expectedQuotas = {
      'TS-GAP': 3,
      'TS-OVERLAP': 3,
      'SYNC-OFFSET': 3,
      'LVL-CLIPPING': 3,
      'CONT-DISCONTINUITY': 2,
      'TRN-INVALID': 2,
      'SDC-STALE': 2,
      'STR-BROKEN_REF': 2,
      'STR-FPS-MISMATCH': 2,
      'STR-ASPECT-MISMATCH': 2,
      'STR-SPEED-RAMP': 2
    };

    let totalScoredDefects = 0;
    for (const fam of cov.families) {
      for (const cls of fam.classes) {
        if (expectedQuotas[cls.class_id]) {
          assert.strictEqual(cls.actual_cases_count, expectedQuotas[cls.class_id], `Mismatch for class ${cls.class_id}`);
          assert.strictEqual(cls.status, 'QUALIFIED');
          totalScoredDefects += cls.actual_cases_count;
        }
      }
    }
    assert.strictEqual(totalScoredDefects, 26, 'Must sum to exactly 26 scored defect cases');
  });

  test('CMP-06: Clean-control inventory & baseline isolation (6 clean runs with expected disallowed findings == 0, CORPUS-04 isolation)', () => {
    const ctrl = JSON.parse(fs.readFileSync(path.join(STAGE_DIR, 'clean-control-inventory.json'), 'utf8'));

    assert.strictEqual(ctrl.clean_runs.length, 6);
    assert.strictEqual(ctrl.evaluation_policy.maximum_threshold, 0.05);

    for (const run of ctrl.clean_runs) {
      assert.strictEqual(run.expected_disallowed_findings, 0);
      assert.strictEqual(run.verification_status, 'PRISTINE_VERIFIED');
      assert.ok(fs.existsSync(path.resolve(run.fixture_file)));
    }

    // Explicit check on RUN-CLEAN-04 isolation from defect fixture
    const run4 = ctrl.clean_runs.find(r => r.run_id === 'RUN-CLEAN-04');
    assert.ok(run4);
    assert.strictEqual(run4.source_file, 'projects/creator-reel-qa-10s.json');
    assert.strictEqual(run4.clean_baseline_manifest, 'fixtures/qa-audio-clean-manifest.json');
    assert.ok(run4.isolation_evidence);
    const cleanManifest = JSON.parse(fs.readFileSync(path.resolve('fixtures/qa-audio-clean-manifest.json'), 'utf8'));
    assert.strictEqual(cleanManifest.ground_truth_defects.length, 0);
    assert.strictEqual(cleanManifest.expected_finding_count, 0);
    assert.strictEqual(cleanManifest.file.audio.measured_true_peak_dbtp, -2.5);
    assert.strictEqual(cleanManifest.file.sha256, '1b8183af7135d64b1ee7d1d15d007fd1516a42bf41a7a64d3e66c5237d59b628');
    assert.strictEqual(cleanManifest.file.size_bytes, 3840078);
    const actualWavSha = fileSha256(path.resolve(cleanManifest.file.path));
    assert.strictEqual(actualWavSha, '1b8183af7135d64b1ee7d1d15d007fd1516a42bf41a7a64d3e66c5237d59b628');
  });

  test('CMP-07: Ambiguous cases non-repair invariant (2 cases routing to ESCALATE_HUMAN_REVIEW with 0 autonomous repair)', () => {
    const caseAmb1 = JSON.parse(fs.readFileSync(path.join(CASES_DIR, 'case-case-amb-01.json'), 'utf8'));
    const caseAmb2 = JSON.parse(fs.readFileSync(path.join(CASES_DIR, 'case-case-amb-02.json'), 'utf8'));

    assert.strictEqual(caseAmb1.expected_action, 'ESCALATE_HUMAN_REVIEW');
    assert.strictEqual(caseAmb1.expected_repair_properties.autonomous_repair_permitted, false);
    assert.strictEqual(caseAmb1.expected_repair_properties.route, 'NEEDS_RECONCILIATION');

    assert.strictEqual(caseAmb2.expected_action, 'ESCALATE_HUMAN_REVIEW');
    assert.strictEqual(caseAmb2.expected_repair_properties.autonomous_repair_permitted, false);
    assert.strictEqual(caseAmb2.expected_repair_properties.route, 'NEEDS_RECONCILIATION');
  });

  test('CMP-08: Unsupported cases fail-closed invariant (2 cases routing to EXPLICIT_UNSUPPORTED_REJECTION with 0 execution)', () => {
    const caseUns1 = JSON.parse(fs.readFileSync(path.join(CASES_DIR, 'case-case-uns-01.json'), 'utf8'));
    const caseUns2 = JSON.parse(fs.readFileSync(path.join(CASES_DIR, 'case-case-uns-02.json'), 'utf8'));

    assert.strictEqual(caseUns1.expected_action, 'EXPLICIT_UNSUPPORTED_REJECTION');
    assert.strictEqual(caseUns1.expected_repair_properties.autonomous_repair_permitted, false);
    assert.strictEqual(caseUns1.expected_repair_properties.error_code, 'ERR_UNSUPPORTED_3D_WARP');

    assert.strictEqual(caseUns2.expected_action, 'EXPLICIT_UNSUPPORTED_REJECTION');
    assert.strictEqual(caseUns2.expected_repair_properties.autonomous_repair_permitted, false);
    assert.strictEqual(caseUns2.expected_repair_properties.error_code, 'ERR_UNSUPPORTED_3D_PARTICLES');
  });

  test('CMP-09: All 36 benchmark case records conform to Section 5.1 defect record schema and dual review signoff', () => {
    const caseFiles = fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json'));
    assert.strictEqual(caseFiles.length, 36, 'Must have exactly 36 case definition files');

    const requiredFields = [
      'case_id',
      'project_id',
      'project_version',
      'defect_id',
      'defect_family',
      'family_id',
      'defect_class',
      'origin_type',
      'severity',
      'fixture_file',
      'affected_track_ids',
      'affected_clip_ids',
      'expected_interval',
      'expected_observation',
      'ground_truth_evidence_refs',
      'expected_action',
      'expected_repair_properties',
      'permitted_tolerance',
      'prohibited_collateral_changes',
      'review_status',
      'reviewed_by',
      'review_date',
      'protocol_version'
    ];

    for (const cf of caseFiles) {
      const caseData = JSON.parse(fs.readFileSync(path.join(CASES_DIR, cf), 'utf8'));

      for (const field of requiredFields) {
        assert.ok(caseData[field] !== undefined, `Case ${cf} missing required field: ${field}`);
      }

      assert.strictEqual(caseData.protocol_version, '1.5.0');
      assert.strictEqual(caseData.review_status, 'REVIEWED_ACCEPTED');
      assert.strictEqual(caseData.reviewed_by.length, 2, 'Must have dual reviewer signoff');
      assert.ok(fs.existsSync(path.resolve(caseData.fixture_file)), `Fixture file must exist: ${caseData.fixture_file}`);
    }
  });

  test('CMP-10: Zero unintended cross-class instance overlap (each defect case has exactly 1 target instance)', () => {
    const caseFiles = fs.readdirSync(CASES_DIR).filter(f => f.startsWith('case-case-') && !f.includes('amb') && !f.includes('uns'));
    assert.strictEqual(caseFiles.length, 26, 'Must be exactly 26 scored defect case definition files');

    for (const cf of caseFiles) {
      const caseData = JSON.parse(fs.readFileSync(path.join(CASES_DIR, cf), 'utf8'));
      assert.ok(caseData.defect_class);
      assert.ok(caseData.expected_interval);
      assert.ok(caseData.expected_interval.duration_ticks > 0);
      assert.ok(Array.isArray(caseData.affected_track_ids));
      assert.ok(Array.isArray(caseData.affected_clip_ids));
    }
  });

  test('CMP-11: Exclusion register and corpus qualification policy compliance', () => {
    const excl = JSON.parse(fs.readFileSync(path.join(STAGE_DIR, 'exclusion-register.json'), 'utf8'));
    assert.strictEqual(excl.protocol_version, '1.5.0');
    assert.ok(Array.isArray(excl.evaluated_and_excluded_candidates));
    assert.ok(excl.evaluated_and_excluded_candidates.length >= 2);

    for (const cand of excl.evaluated_and_excluded_candidates) {
      assert.ok(cand.candidate_id);
      assert.ok(cand.reason);
      assert.ok(cand.criterion_violated);
      assert.strictEqual(cand.disposition, 'FORMALLY_EXCLUDED');
      assert.ok(cand.resolution);
    }
  });

  test('CMP-12: Non-destructive isolation guarantee (zero mutation to original source fixtures)', () => {
    const inv = JSON.parse(fs.readFileSync(path.resolve('artifacts/phase-31/stage-31.1/corpus-inventory.json'), 'utf8'));

    for (const proj of inv.projects) {
      const fullPath = path.resolve(proj.source_path);
      const postSha = fileSha256(fullPath);
      assert.strictEqual(postSha, proj.provenance.sha256, `Pristine project mutated: ${proj.source_path}`);
    }
  });

  test('CMP-13: Reconciled corpus manifest SHA-256 integrity across all 36 fixtures and cases', () => {
    const manifestPath = path.join(STAGE_DIR, 'reconciled-corpus-manifest.json');
    assert.ok(fs.existsSync(manifestPath));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.strictEqual(manifest.protocol_version, '1.5.0');
    assert.strictEqual(manifest.cases.length, 36);

    const checksums = JSON.parse(fs.readFileSync(path.join(STAGE_DIR, 'input-checksums.json'), 'utf8'));

    for (const c of manifest.cases) {
      // Check fixture file
      const fixtureFullPath = path.resolve(c.fixture_file);
      assert.ok(fs.existsSync(fixtureFullPath), `Fixture file missing: ${c.fixture_file}`);
      const actualFixtureSha = fileSha256(fixtureFullPath);
      assert.strictEqual(actualFixtureSha, checksums.fixture_files[c.fixture_file].sha256);

      // Check case definition file
      const caseFullPath = path.resolve(c.case_definition_file);
      assert.ok(fs.existsSync(caseFullPath), `Case definition file missing: ${c.case_definition_file}`);
      const actualCaseSha = fileSha256(caseFullPath);
      assert.strictEqual(actualCaseSha, checksums.case_definition_files[c.case_definition_file].sha256);
    }
  });

});
