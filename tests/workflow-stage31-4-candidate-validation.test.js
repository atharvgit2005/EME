/**
 * Test Suite: Stage 31.4 — Candidate Repair, Render, and Earshot QA Validation (Protocol v1.5.0)
 *
 * Verifies all 13 discrete criteria mandated by Architecture Lead in Protocol v1.5.0 & Directive:
 * - VAL-01: Preflight input integrity & SHA-256 pre-verification (clean audio, source projects, fixtures)
 * - VAL-02: Candidate generation & OperationExecutor mutation authority (22/22 candidates)
 * - VAL-03: Structural & temporal verification (integer ticks, half-open intervals, schema validity)
 * - VAL-04: Prohibited collateral change prevention (zero modification to prohibited tracks)
 * - VAL-05: Offline rendering execution & artifact checksum integrity (28 rendered WAVs)
 * - VAL-06: Earshot QA: SYNC-OFFSET residual drift <= 4,000 ticks (<= 33.33ms) & CHK_EARSHOT_SYNC passed
 * - VAL-07: Earshot QA: LVL-CLIPPING post-repair peak <= -1.0 dBTP ceiling & 0 clipped samples
 * - VAL-08: Earshot QA: CONT-DISCONTINUITY crossfade QA pass & zero clicks/pops
 * - VAL-09: Earshot QA: TS-GAP & TS-OVERLAP continuity and collision elimination
 * - VAL-10: Original-project & fixture state preservation (SHA-256 verification, 0 mutations)
 * - VAL-11: Active-delivery safety invariant (session.active_delivery preserved 100% untouched)
 * - VAL-12: Candidate repair success rate (22/22 = 100% of eligible repairable defects resolved)
 * - VAL-13: Deliverable completeness and forensic audit trail reconciliation (all 8 artifacts present)
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
const STAGE_31_4_DIR = path.join(ROOT_DIR, 'artifacts/phase-31/stage-31.4');
const CANDIDATES_DIR = path.join(STAGE_31_4_DIR, 'candidates');
const RENDERS_DIR = path.join(STAGE_31_4_DIR, 'renders');

describe('Stage 31.4: Candidate Repair, Render, and Earshot QA Validation (Protocol v1.5.0)', () => {

  test('VAL-01: Preflight input integrity & SHA-256 pre-verification (clean audio, source projects, fixtures)', () => {
    // 1. Clean audio asset
    const cleanAudioPath = path.join(ROOT_DIR, 'assets/creator_reel_soundtrack_20s.wav');
    assert.ok(fs.existsSync(cleanAudioPath), 'assets/creator_reel_soundtrack_20s.wav must exist');
    const audioSha = fileSha256(cleanAudioPath);
    assert.strictEqual(audioSha, '1b8183af7135d64b1ee7d1d15d007fd1516a42bf41a7a64d3e66c5237d59b628');
    assert.strictEqual(fs.statSync(cleanAudioPath).size, 3840078);

    // 2. Pristine source projects
    const checksums = JSON.parse(fs.readFileSync(path.join(STAGE_31_2_DIR, 'input-checksums.json'), 'utf8'));
    assert.ok(checksums.pristine_source_projects);
    for (const [relPath, info] of Object.entries(checksums.pristine_source_projects)) {
      const fullPath = path.join(ROOT_DIR, relPath);
      assert.ok(fs.existsSync(fullPath), `Source project must exist: ${relPath}`);
      assert.strictEqual(fileSha256(fullPath), info.sha256);
      assert.strictEqual(fs.statSync(fullPath).size, info.size_bytes);
    }

    // 3. Benchmark fixtures
    const manifest = JSON.parse(fs.readFileSync(path.join(STAGE_31_2_DIR, 'reconciled-corpus-manifest.json'), 'utf8'));
    assert.strictEqual(manifest.cases.length, 36);
    for (const c of manifest.cases) {
      const fullPath = path.join(ROOT_DIR, c.fixture_file);
      assert.ok(fs.existsSync(fullPath), `Fixture must exist: ${c.fixture_file}`);
      assert.strictEqual(fileSha256(fullPath), checksums.fixture_files[c.fixture_file]?.sha256);
    }
  });

  test('VAL-02: Candidate generation & OperationExecutor mutation authority (22/22 candidates)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'candidate-repair-manifest.json'), 'utf8'));
    assert.strictEqual(manifest.summary.eligible_repair_cases, 22);
    assert.strictEqual(manifest.summary.candidates_generated, 22);
    assert.strictEqual(manifest.candidates.length, 22);

    for (const cand of manifest.candidates) {
      assert.ok(cand.case_id);
      assert.ok(cand.defect_class);
      assert.strictEqual(cand.status, 'CANDIDATE_GENERATED');
      assert.ok(cand.operations_applied.length >= 1, `Candidate ${cand.case_id} must have at least 1 operation applied`);
      assert.ok(cand.candidate_file);
      assert.ok(cand.candidate_sha256);
      assert.ok(cand.candidate_size_bytes > 0);

      // Verify file exists on disk and matches SHA-256
      const candPath = path.join(ROOT_DIR, cand.candidate_file);
      assert.ok(fs.existsSync(candPath), `Candidate file must exist on disk: ${cand.candidate_file}`);
      assert.strictEqual(fileSha256(candPath), cand.candidate_sha256);
    }

    // Explicit verification for CASE-SDC-STALE-02
    const stale02 = manifest.candidates.find(c => c.case_id === 'CASE-SDC-STALE-02');
    assert.ok(stale02, 'CASE-SDC-STALE-02 candidate record must exist');
    assert.strictEqual(stale02.operations_applied_count, 1);
    assert.strictEqual(stale02.operations_applied[0].type, 'invalidate_and_regenerate_sidecar');
    assert.notStrictEqual(
      stale02.candidate_sha256,
      'd7dbe13fbfa84c027e08249de45f71b8e7883c6c21d2a0781a393921e01b2bd0',
      'Candidate SHA-256 must not match baseline fixture'
    );
    const stale02Path = path.join(ROOT_DIR, stale02.candidate_file);
    const stale02Content = JSON.parse(fs.readFileSync(stale02Path, 'utf8'));
    assert.strictEqual(stale02Content.status, 'VALID');
    assert.strictEqual(stale02Content.invalidated_stale_sha256, 'deadbeef00000000000000000000000000000000000000000000000000000000');
    assert.notStrictEqual(stale02Content.cached_asset_sha256, 'deadbeef00000000000000000000000000000000000000000000000000000000');

    // Independent byte-level checksum verification against authoritative referenced asset
    const refProjPath = path.join(ROOT_DIR, stale02Content.project_reference);
    const refProj = JSON.parse(fs.readFileSync(refProjPath, 'utf8'));
    const targetAssetDef = (refProj.assets || []).find(a => a.id === 'raw_manoj_roto');
    assert.ok(targetAssetDef, 'Asset raw_manoj_roto must exist in projects/manoj-bajpayee-150-edit.json');
    const assetFullPath = path.join(ROOT_DIR, targetAssetDef.src);
    assert.ok(fs.existsSync(assetFullPath), `Referenced asset file must exist on disk: ${assetFullPath}`);
    const actualAssetBytes = fs.readFileSync(assetFullPath);
    const expectedAuthoritativeSha256 = sha256(actualAssetBytes);

    // Direct equality assertion: Candidate cached_asset_sha256 must strictly equal actual file SHA-256
    assert.strictEqual(
      stale02Content.cached_asset_sha256,
      expectedAuthoritativeSha256,
      'Candidate cached_asset_sha256 must strictly match independent byte-level SHA-256 of referenced asset'
    );
    // Direct equality assertion: Operation journal reconciled_asset_sha256 must strictly equal actual file SHA-256
    assert.strictEqual(
      stale02.operations_applied[0].params.reconciled_asset_sha256,
      expectedAuthoritativeSha256,
      'Operation reconciled_asset_sha256 must strictly match independent byte-level SHA-256 of referenced asset'
    );
  });

  test('VAL-03: Structural & temporal verification (integer ticks, half-open intervals, schema validity)', () => {
    const structReport = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'structural-validation-report.json'), 'utf8'));
    assert.strictEqual(structReport.total_candidates_checked, 22);
    assert.strictEqual(structReport.integer_ticks_compliant_count, 22);
    assert.strictEqual(structReport.half_open_endpoints_compliant_count, 22);
    assert.strictEqual(structReport.positive_durations_compliant_count, 22);
    assert.strictEqual(structReport.all_structural_invariants_satisfied, true);

    for (const v of structReport.validations) {
      assert.strictEqual(v.integer_tick_arithmetic, true);
      assert.strictEqual(v.half_open_endpoint_convention, true);
      assert.strictEqual(v.positive_durations_invariant, true);
      assert.strictEqual(v.structural_check_passed, true);
    }
  });

  test('VAL-04: Prohibited collateral change prevention (zero modification to prohibited tracks)', () => {
    const structReport = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'structural-validation-report.json'), 'utf8'));
    assert.strictEqual(structReport.collateral_preservation_compliant_count, 22);

    for (const v of structReport.validations) {
      assert.strictEqual(v.collateral_violation_count, 0, `Collateral violation detected in ${v.case_id}`);
      assert.strictEqual(v.collateral_preservation_passed, true);
    }
  });

  test('VAL-05: Offline rendering execution & artifact checksum integrity (28 rendered WAVs)', () => {
    const inventory = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'render-inventory.json'), 'utf8'));
    assert.strictEqual(inventory.audio_cases_count, 14);
    assert.strictEqual(inventory.total_renders, 28);
    assert.strictEqual(inventory.renders.length, 14);

    const checksumsFileContent = fs.readFileSync(path.join(STAGE_31_4_DIR, 'artifact-checksums.sha256'), 'utf8');

    for (const item of inventory.renders) {
      const baseAbs = path.join(ROOT_DIR, item.baseline_render.file);
      const candAbs = path.join(ROOT_DIR, item.candidate_render.file);

      assert.ok(fs.existsSync(baseAbs), `Baseline render file must exist: ${item.baseline_render.file}`);
      assert.ok(fs.existsSync(candAbs), `Candidate render file must exist: ${item.candidate_render.file}`);

      const actualBaseSha = fileSha256(baseAbs);
      const actualCandSha = fileSha256(candAbs);

      assert.strictEqual(actualBaseSha, item.baseline_render.sha256);
      assert.strictEqual(actualCandSha, item.candidate_render.sha256);
      assert.ok(checksumsFileContent.includes(item.baseline_render.sha256));
      assert.ok(checksumsFileContent.includes(item.candidate_render.sha256));
    }
  });

  test('VAL-06: Earshot QA: SYNC-OFFSET residual drift <= 4,000 ticks (<= 33.33ms) & CHK_EARSHOT_SYNC passed', () => {
    const qaDoc = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'earshot-qa-reports.json'), 'utf8'));
    const syncReports = qaDoc.reports.filter(r => r.defect_class === 'SYNC-OFFSET');
    assert.strictEqual(syncReports.length, 3);

    for (const r of syncReports) {
      assert.strictEqual(r.comparison.defect_resolved, true);
      assert.strictEqual(r.comparison.candidate_qa_passed, true);

      // Verify Baseline failed sync check
      const baseSync = r.baseline_qa.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
      assert.ok(baseSync, 'Baseline CHK_EARSHOT_SYNC must exist');
      assert.strictEqual(baseSync.status, 'failed', 'Baseline sync check must fail');
      assert.ok(baseSync.measured_value.max_offset_ms > 33.33, 'Baseline offset exceeds tolerance');

      // Verify Candidate passed sync check within frame tolerance
      const candSync = r.candidate_qa.checks.find(c => c.id === 'CHK_EARSHOT_SYNC');
      assert.ok(candSync, 'Candidate CHK_EARSHOT_SYNC must exist');
      assert.strictEqual(candSync.status, 'passed', 'Candidate sync check must pass');
      assert.ok(candSync.measured_value.max_offset_ms <= 33.33, 'Candidate offset must be <= 33.33ms');
      assert.ok(candSync.measured_value.max_offset_ticks <= 4000, 'Candidate residual drift must be <= 4000 ticks');
    }
  });

  test('VAL-07: Earshot QA: LVL-CLIPPING post-repair peak <= -1.0 dBTP ceiling & 0 clipped samples', () => {
    const qaDoc = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'earshot-qa-reports.json'), 'utf8'));
    const clipReports = qaDoc.reports.filter(r => r.defect_class === 'LVL-CLIPPING');
    assert.strictEqual(clipReports.length, 3);

    for (const r of clipReports) {
      assert.strictEqual(r.comparison.defect_resolved, true);
      assert.strictEqual(r.comparison.candidate_qa_passed, true);

      // Verify Baseline failed true peak check
      const basePeak = r.baseline_qa.checks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');
      assert.ok(basePeak, 'Baseline CHK_EARSHOT_TRUE_PEAK must exist');
      assert.strictEqual(basePeak.status, 'failed', 'Baseline true peak check must fail');
      assert.ok(basePeak.measured_value.true_peak_dbtp > -1.0, 'Baseline true peak exceeds -1.0 dBTP ceiling');

      // Verify Candidate passed true peak check
      const candPeak = r.candidate_qa.checks.find(c => c.id === 'CHK_EARSHOT_TRUE_PEAK');
      assert.ok(candPeak, 'Candidate CHK_EARSHOT_TRUE_PEAK must exist');
      assert.strictEqual(candPeak.status, 'passed', 'Candidate true peak check must pass');
      assert.ok(candPeak.measured_value.true_peak_dbtp <= -1.0, 'Candidate true peak must be <= -1.0 dBTP ceiling');
      assert.strictEqual(candPeak.measured_value.clipped_samples, 0, 'Candidate must have 0 clipped samples');
    }
  });

  test('VAL-08: Earshot QA: CONT-DISCONTINUITY crossfade QA pass & zero clicks/pops', () => {
    const qaDoc = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'earshot-qa-reports.json'), 'utf8'));
    const discReports = qaDoc.reports.filter(r => r.defect_class === 'CONT-DISCONTINUITY');
    assert.strictEqual(discReports.length, 2);

    for (const r of discReports) {
      assert.strictEqual(r.comparison.defect_resolved, true);
      assert.strictEqual(r.comparison.candidate_qa_passed, true);

      // Verify Baseline failed SFX integrity check
      const baseSfx = r.baseline_qa.checks.find(c => c.id === 'CHK_EARSHOT_SFX_INTEGRITY');
      assert.ok(baseSfx, 'Baseline CHK_EARSHOT_SFX_INTEGRITY must exist');
      assert.strictEqual(baseSfx.status, 'failed', 'Baseline SFX check must fail');

      // Verify Candidate passed SFX integrity check with zero clicks
      const candSfx = r.candidate_qa.checks.find(c => c.id === 'CHK_EARSHOT_SFX_INTEGRITY');
      assert.ok(candSfx, 'Candidate CHK_EARSHOT_SFX_INTEGRITY must exist');
      assert.strictEqual(candSfx.status, 'passed', 'Candidate SFX check must pass');
      assert.strictEqual(candSfx.measured_value.clicks, 0, 'Candidate must have 0 clicks');
      assert.strictEqual(candSfx.measured_value.double_hits, 0, 'Candidate must have 0 double hits');
      assert.strictEqual(candSfx.measured_value.status, 'ok', 'Candidate SFX status must be ok');
    }
  });

  test('VAL-09: Earshot QA: TS-GAP & TS-OVERLAP continuity and collision elimination', () => {
    const qaDoc = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'earshot-qa-reports.json'), 'utf8'));
    const tsReports = qaDoc.reports.filter(r => r.defect_class === 'TS-GAP' || r.defect_class === 'TS-OVERLAP');
    assert.strictEqual(tsReports.length, 6);

    for (const r of tsReports) {
      assert.strictEqual(r.comparison.defect_resolved, true);
      assert.strictEqual(r.comparison.candidate_qa_passed, true);
    }
  });

  test('VAL-10: Original-project & fixture state preservation (SHA-256 verification, 0 mutations)', () => {
    const pres = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'active-delivery-preservation.json'), 'utf8'));
    assert.strictEqual(pres.status, 'PASSED');
    assert.strictEqual(pres.total_fixtures_evaluated, 36);
    assert.strictEqual(pres.mutated_fixtures_count, 0);
    assert.strictEqual(pres.original_projects_preserved, true);

    // Independently verify all 36 fixtures on disk
    for (const [caseId, data] of Object.entries(pres.post_evaluation_fixture_hashes)) {
      const liveSha = fileSha256(path.join(ROOT_DIR, data.file));
      assert.strictEqual(liveSha, data.pre_hash, `Fixture ${caseId} was mutated!`);
      assert.strictEqual(data.match, true);
    }

    // Independently verify all pristine source projects on disk
    for (const [relPath, data] of Object.entries(pres.post_evaluation_source_project_hashes)) {
      const liveSha = fileSha256(path.join(ROOT_DIR, relPath));
      assert.strictEqual(liveSha, data.pre_hash, `Source project ${relPath} was mutated!`);
      assert.strictEqual(data.match, true);
    }
  });

  test('VAL-11: Active-delivery safety invariant (session.active_delivery preserved 100% untouched)', () => {
    const pres = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'active-delivery-preservation.json'), 'utf8'));
    assert.strictEqual(pres.active_delivery_preserved, true);
    assert.strictEqual(pres.active_delivery_audit.identity_match, true);
    assert.strictEqual(pres.active_delivery_audit.candidate_promotions_committed, 0);
    assert.strictEqual(pres.active_delivery_audit.candidate_promotions_attempted, 0);
    assert.strictEqual(pres.active_delivery_audit.pre_digest, pres.active_delivery_audit.post_digest);
    assert.deepStrictEqual(
      pres.active_delivery_audit.post_evaluation_delivery,
      pres.active_delivery_audit.pre_evaluation_delivery,
      'Active delivery before and after candidate evaluation must be deeply identical'
    );
  });

  test('VAL-12: Candidate repair success rate (22/22 = 100% of eligible repairable defects resolved)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'candidate-repair-manifest.json'), 'utf8'));
    assert.strictEqual(manifest.summary.eligible_repair_cases, 22);
    assert.strictEqual(manifest.summary.candidates_generated, 22);
    assert.strictEqual(manifest.summary.candidate_repair_success_rate, 1.0);
  });

  test('VAL-13: Deliverable completeness and forensic audit trail reconciliation (all 8 artifacts present)', () => {
    const mandatedDeliverables = [
      'candidate-repair-manifest.json',
      'candidate-change-inventory.json',
      'render-inventory.json',
      'render-manifest.json',
      'artifact-checksums.sha256',
      'earshot-qa-reports.json',
      'earshot-qa-results.jsonl',
      'structural-validation-report.json',
      'baseline-comparisons.json',
      'active-delivery-preservation.json',
      'stage-report.md',
      'operation-execution-journal.json'
    ];

    for (const relFile of mandatedDeliverables) {
      const fullPath = path.join(STAGE_31_4_DIR, relFile);
      assert.ok(fs.existsSync(fullPath), `Mandated deliverable must exist: ${relFile}`);
      assert.ok(fs.statSync(fullPath).size > 0, `Deliverable must not be empty: ${relFile}`);
    }

    // Verify operation execution journal entries
    const journal = JSON.parse(fs.readFileSync(path.join(STAGE_31_4_DIR, 'operation-execution-journal.json'), 'utf8'));
    assert.strictEqual(journal.protocol_version, '1.5.0');
    assert.ok(journal.entries.length >= 22, 'Journal must record operations for all candidate repairs');
    const journalStale02 = journal.entries.find(e => e.case_id === 'CASE-SDC-STALE-02');
    assert.ok(journalStale02, 'Journal must have entry for CASE-SDC-STALE-02');
    assert.strictEqual(journalStale02.operation_type, 'invalidate_and_regenerate_sidecar');
    assert.strictEqual(journalStale02.result, 'SUCCESS');
    assert.deepStrictEqual(journalStale02.affected_resources, ['raw_manoj_roto']);

    // Verify candidate directory has 22 files
    const candidateFiles = fs.readdirSync(CANDIDATES_DIR).filter(f => f.endsWith('.json'));
    assert.strictEqual(candidateFiles.length, 22, 'Candidates directory must contain 22 JSON files');

    // Verify render directory has 28 WAV files
    const renderFiles = fs.readdirSync(RENDERS_DIR).filter(f => f.endsWith('.wav'));
    assert.strictEqual(renderFiles.length, 28, 'Renders directory must contain 28 WAV files');
  });

});
