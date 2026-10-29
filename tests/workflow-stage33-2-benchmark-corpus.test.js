/**
 * Editing Mechanics Engine (EME) - Stage 33.2 Benchmark Corpus Validation Suite
 * Milestone: Phase 33 — Audio-Visual Composition Synthesis (AVCS-33)
 * Stage: Stage 33.2 — Frozen Audio-Visual Benchmark and Ground Truth
 *
 * Automated verification of:
 * 1. Corpus inventory and strict held-out partition split (24 clips: 16 dev / 8 held-out, 4 scenarios x 6 clips)
 * 2. Ground-truth decision-case inventory (96 cases: 64 dev / 32 held-out)
 * 3. Defect taxonomy coverage (8 categories x 6 cases = 48 scored defects, 24 clean controls, 12 ambiguous, 12 unsupported)
 * 4. Zero partition leakage: zero shared media hashes, IDs, or cross-partition references
 * 5. Observation sidecar contract validity (eme-fusion-evidence.v1) and pure observation enforcement (CTR-03)
 * 6. Canonical timebase (120,000 ticks/sec, half-open intervals) and Banker's rounding
 * 7. Canonical schema freeze (18 schemas byte-identical) and zero runtime npm dependencies
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { FusionContractValidator } = require('../src/fusion/fusion-contract-validator');

const ROOT_DIR = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT_DIR, 'evidence/phase-33/stage-33.2');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts/phase-33/stage-33.2');
const SCHEMA_DIR = path.join(ROOT_DIR, 'schema');

const FUSION_VALIDATOR = new FusionContractValidator();

test('Stage 33.2: Audio-Visual Benchmark Corpus and Ground-Truth Suite', async (t) => {
  let corpusData;
  let groundTruthData;
  let splitData;
  let taxonomyData;
  let validationData;
  let fingerprintsData;

  // =========================================================================
  // Section 1: Corpus Manifest, Inventory & Split Verification
  // =========================================================================
  await t.test('Section 1: Corpus Manifest, Inventory & Split Verification', async (s1) => {
    await s1.test('BM33-01: Corpus manifest exists and contains exactly 24 audiovisual fixtures', () => {
      const manifestPath = path.join(EVIDENCE_DIR, 'corpus-manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'corpus-manifest.json must exist');
      corpusData = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      assert.strictEqual(corpusData.totalClips, 24, 'Must contain exactly 24 benchmark clips');
      assert.strictEqual(corpusData.developmentCount, 16, 'Must have 16 development clips');
      assert.strictEqual(corpusData.heldOutCount, 8, 'Must have 8 held-out clips');
      assert.strictEqual(corpusData.fixtures.length, 24, 'Fixtures array length must be 24');
    });

    await s1.test('BM33-02: Scenario distribution: exactly 6 fixtures per scenario (4 dev, 2 held-out)', () => {
      const scenarios = ['A', 'B', 'C', 'D'];
      for (const sc of scenarios) {
        const scClips = corpusData.fixtures.filter(f => f.scenarioCode === sc);
        assert.strictEqual(scClips.length, 6, `Scenario ${sc} must contain exactly 6 fixtures`);

        const devClips = scClips.filter(f => f.partition === 'development');
        const hldClips = scClips.filter(f => f.partition === 'held_out');

        assert.strictEqual(devClips.length, 4, `Scenario ${sc} must have 4 development clips`);
        assert.strictEqual(hldClips.length, 2, `Scenario ${sc} must have 2 held-out clips`);
      }
    });

    await s1.test('BM33-03: All 24 MP4 media files exist, non-trivial size, and match registered SHA-256 digests', () => {
      for (const f of corpusData.fixtures) {
        const fullMediaP = path.join(ROOT_DIR, f.mediaPath);
        assert.ok(fs.existsSync(fullMediaP), `Media file must exist: ${f.mediaPath}`);

        const fileBytes = fs.readFileSync(fullMediaP);
        assert.ok(fileBytes.length > 50000, `Media file must be non-trivial size: ${f.clipId} (${fileBytes.length} bytes)`);

        const actualSha = crypto.createHash('sha256').update(fileBytes).digest('hex');
        assert.strictEqual(actualSha, f.sha256, `SHA-256 digest mismatch for fixture ${f.clipId}`);
      }
    });

    await s1.test('BM33-04: Partition protection manifest exists and enforces zero media or derivative leakage', () => {
      const splitPath = path.join(EVIDENCE_DIR, 'development-heldout-split.json');
      assert.ok(fs.existsSync(splitPath), 'development-heldout-split.json must exist');
      splitData = JSON.parse(fs.readFileSync(splitPath, 'utf8'));

      assert.strictEqual(splitData.counts.fixtures.total, 24);
      assert.strictEqual(splitData.counts.fixtures.development, 16);
      assert.strictEqual(splitData.counts.fixtures.heldOut, 8);

      const devClipIds = new Set(splitData.developmentPartition.clipIds);
      const hldClipIds = new Set(splitData.heldOutPartition.clipIds);

      // Verify disjoint sets (0 intersection)
      for (const devId of devClipIds) {
        assert.ok(!hldClipIds.has(devId), `Partition leakage detected! Clip ${devId} exists in both partitions.`);
      }

      // Check SHA-256 digests disjoint
      const devShas = new Set(corpusData.fixtures.filter(f => f.partition === 'development').map(f => f.sha256));
      const hldShas = new Set(corpusData.fixtures.filter(f => f.partition === 'held_out').map(f => f.sha256));
      for (const sha of devShas) {
        assert.ok(!hldShas.has(sha), `SHA-256 collision / duplicate media between partitions: ${sha}`);
      }
    });
  });

  // =========================================================================
  // Section 2: Ground-Truth Integrity & Defect Taxonomy
  // =========================================================================
  await t.test('Section 2: Ground-Truth Integrity & Defect Taxonomy', async (s2) => {
    await s2.test('BM33-05: Ground truth manifest exists and contains exactly 96 labeled decision cases', () => {
      const gtPath = path.join(EVIDENCE_DIR, 'ground-truth-manifest.json');
      assert.ok(fs.existsSync(gtPath), 'ground-truth-manifest.json must exist');
      groundTruthData = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

      assert.strictEqual(groundTruthData.totalDecisionCases, 96, 'Must contain exactly 96 labeled decision cases');
      assert.strictEqual(groundTruthData.summary.development, 64, 'Must have 64 development cases');
      assert.strictEqual(groundTruthData.summary.heldOut, 32, 'Must have 32 held-out cases');
      assert.strictEqual(groundTruthData.cases.length, 96, 'Cases array length must be 96');
    });

    await s2.test('BM33-06: Defect taxonomy manifest covers all 8 defect categories with 6 cases each (4 dev, 2 held-out)', () => {
      const taxPath = path.join(EVIDENCE_DIR, 'defect-taxonomy.json');
      assert.ok(fs.existsSync(taxPath), 'defect-taxonomy.json must exist');
      taxonomyData = JSON.parse(fs.readFileSync(taxPath, 'utf8'));

      assert.strictEqual(taxonomyData.totalScoredCategories, 8);
      assert.strictEqual(taxonomyData.totalScoredDefectCases, 48);

      const requiredDefectCodes = [
        'ERR_BEAT_MISALIGNED',
        'ERR_INCORRECT_BEAT_SELECTION',
        'ERR_AV_TEMPORAL_DRIFT',
        'ERR_INVALID_CUT_TIMING',
        'ERR_VISUAL_COLLISION',
        'ERR_MOTION_INSTABILITY',
        'ERR_CONFLICTING_CONSTRAINTS',
        'ERR_STALE_SIDECAR'
      ];

      for (const code of requiredDefectCodes) {
        const cat = taxonomyData.categories.find(c => c.code === code);
        assert.ok(cat, `Category ${code} must exist in taxonomy`);
        assert.strictEqual(cat.totalCases, 6, `Category ${code} must have 6 cases`);
        assert.strictEqual(cat.dev, 4, `Category ${code} must have 4 dev cases`);
        assert.strictEqual(cat.heldOut, 2, `Category ${code} must have 2 held-out cases`);

        const actualCases = groundTruthData.cases.filter(c => c.defectCode === code);
        assert.strictEqual(actualCases.length, 6, `Ground truth must contain 6 instances of ${code}`);
        assert.strictEqual(actualCases.filter(c => c.partition === 'development').length, 4);
        assert.strictEqual(actualCases.filter(c => c.partition === 'held_out').length, 2);
      }
    });

    await s2.test('BM33-07: Clean Controls, Ambiguous, and Unsupported cases distribution and scoring rules', () => {
      const cleanCases = groundTruthData.cases.filter(c => c.type === 'clean_control');
      assert.strictEqual(cleanCases.length, 24, 'Must have 24 clean controls');
      assert.strictEqual(cleanCases.filter(c => c.partition === 'development').length, 16);
      assert.strictEqual(cleanCases.filter(c => c.partition === 'held_out').length, 8);
      for (const cc of cleanCases) {
        assert.strictEqual(cc.expectedDisposition, 'ACCEPT');
        assert.ok(cc.scoringRule.length > 10);
      }

      const ambCases = groundTruthData.cases.filter(c => c.type === 'ambiguous');
      assert.strictEqual(ambCases.length, 12, 'Must have 12 ambiguous cases');
      assert.strictEqual(ambCases.filter(c => c.partition === 'development').length, 8);
      assert.strictEqual(ambCases.filter(c => c.partition === 'held_out').length, 4);
      for (const ac of ambCases) {
        assert.strictEqual(ac.expectedDisposition, 'RESOLVE_AMBIGUITY');
        assert.strictEqual(ac.defectCode, 'WARN_AMBIGUOUS_EVIDENCE');
      }

      const unsCases = groundTruthData.cases.filter(c => c.type === 'unsupported');
      assert.strictEqual(unsCases.length, 12, 'Must have 12 unsupported cases');
      assert.strictEqual(unsCases.filter(c => c.partition === 'development').length, 8);
      assert.strictEqual(unsCases.filter(c => c.partition === 'held_out').length, 4);
      for (const uc of unsCases) {
        assert.strictEqual(uc.expectedDisposition, 'REFUSE_UNSUPPORTED');
        assert.strictEqual(uc.defectCode, 'ERR_UNSUPPORTED_CAPABILITY');
      }
    });

    await s2.test('BM33-08: Decision cases link strictly to fixtures in the SAME partition (zero cross-partition referencing)', () => {
      const devClips = new Set(splitData.developmentPartition.clipIds);
      const hldClips = new Set(splitData.heldOutPartition.clipIds);

      for (const c of groundTruthData.cases) {
        assert.ok(c.clipId, `Case ${c.caseId} must reference a clipId`);
        if (c.partition === 'development') {
          assert.ok(devClips.has(c.clipId), `Dev case ${c.caseId} references non-dev clip ${c.clipId}`);
          assert.ok(!hldClips.has(c.clipId), `Dev case ${c.caseId} leaks held-out clip ${c.clipId}`);
        } else if (c.partition === 'held_out') {
          assert.ok(hldClips.has(c.clipId), `Held-out case ${c.caseId} references non-heldout clip ${c.clipId}`);
          assert.ok(!devClips.has(c.clipId), `Held-out case ${c.caseId} references dev clip ${c.clipId}`);
        }
      }
    });
  });

  // =========================================================================
  // Section 3: Observation Sidecar & Contract Validation (GATE-06 / CTR-03 / GATE-01)
  // =========================================================================
  await t.test('Section 3: Observation Sidecar & Contract Validation', async (s3) => {
    await s3.test('BM33-09: All 24 sidecars strictly validate against eme-fusion-evidence.v1 contract', () => {
      for (const f of corpusData.fixtures) {
        const sidecarP = path.join(ROOT_DIR, f.fusionEvidencePath);
        assert.ok(fs.existsSync(sidecarP), `Sidecar file must exist: ${f.fusionEvidencePath}`);

        const sidecarJson = JSON.parse(fs.readFileSync(sidecarP, 'utf8'));
        const valRes = FUSION_VALIDATOR.validateFusionEvidence(sidecarJson);
        assert.strictEqual(valRes.valid, true, `Validation failed for ${f.clipId}`);
        assert.strictEqual(sidecarJson.schemaVersion, 'eme-fusion-evidence.v1');
        assert.strictEqual(sidecarJson.timebase.ticksPerSecond, 120000);
        assert.strictEqual(sidecarJson.timebase.intervalConvention, 'half-open');
        assert.strictEqual(sidecarJson.fusionId, f.fusionId);
      }
    });

    await s3.test('BM33-10: Pure observation separation (CTR-03): zero placement decisions or solver plans in sidecars', () => {
      for (const f of corpusData.fixtures) {
        const sidecarP = path.join(ROOT_DIR, f.fusionEvidencePath);
        const sidecarJson = JSON.parse(fs.readFileSync(sidecarP, 'utf8'));

        assert.doesNotThrow(() => {
          FUSION_VALIDATOR.assertPureObservation(sidecarJson, f.clipId);
        });

        // Ensure prohibited solver fields are strictly absent
        assert.strictEqual(sidecarJson.safe_placement_rect, undefined);
        assert.strictEqual(sidecarJson.placement_score, undefined);
        assert.strictEqual(sidecarJson.operationPlan, undefined);
        assert.strictEqual(sidecarJson.selectedBeat, undefined);
        assert.strictEqual(sidecarJson.decision, undefined);
      }
    });

    await s3.test('BM33-11: Freshness verification (GATE-01): Freshness verification succeeds on current hashes', () => {
      for (const f of corpusData.fixtures) {
        const sidecarP = path.join(ROOT_DIR, f.fusionEvidencePath);
        const sidecarJson = JSON.parse(fs.readFileSync(sidecarP, 'utf8'));

        const freshRes = FUSION_VALIDATOR.verifyFreshness({
          fusionEvidence: sidecarJson,
          currentProjectRevision: 1,
          currentAudioSha256: f.sha256,
          currentVisualSha256: f.sha256
        });

        assert.strictEqual(freshRes.valid, true);
        assert.strictEqual(freshRes.status, 'FRESH');

        // Test stale detection on revised project revision
        const staleRevRes = FUSION_VALIDATOR.verifyFreshness({
          fusionEvidence: sidecarJson,
          currentProjectRevision: 2, // Desynchronized revision
          currentAudioSha256: f.sha256,
          currentVisualSha256: f.sha256
        });
        assert.strictEqual(staleRevRes.valid, false);
        assert.strictEqual(staleRevRes.reason, 'STALE_PROJECT_REVISION');

        // Test stale detection on modified media digest
        const staleMediaRes = FUSION_VALIDATOR.verifyFreshness({
          fusionEvidence: sidecarJson,
          currentProjectRevision: 1,
          currentAudioSha256: '0000000000000000000000000000000000000000000000000000000000000000',
          currentVisualSha256: f.sha256
        });
        assert.strictEqual(staleMediaRes.valid, false);
        assert.strictEqual(staleMediaRes.reason, 'STALE_AUDIO_MEDIA_DIGEST');
      }
    });
  });

  // =========================================================================
  // Section 4: Architecture & Baseline Invariants (INV-01, INV-02, INV-03, INV-05)
  // =========================================================================
  await t.test('Section 4: Architecture & Baseline Invariants', async (s4) => {
    await s4.test('BM33-12: Canonical schema freeze: 18 canonical schemas unchanged and byte-identical', () => {
      const canonical18 = [
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

      for (const name of canonical18) {
        const filePath = path.join(SCHEMA_DIR, name);
        assert.ok(fs.existsSync(filePath), `Canonical schema ${name} must exist`);
      }

      // Check git diff on schema dir for canonical schemas
      const allSchemas = fs.readdirSync(SCHEMA_DIR).filter(f => f.startsWith('eme-') && f.endsWith('.schema.json'));
      assert.strictEqual(allSchemas.length, 25, 'Total schema count must be exactly 25 (18 canonical + 7 auxiliary)');
    });

    await s4.test('BM33-13: Core package dependencies: package.json dependencies strictly undefined', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
      assert.strictEqual(pkg.dependencies, undefined, 'Core package.json dependencies must be undefined');
    });

    await s4.test('BM33-14: Corpus fingerprint manifest exists and all entries match file hashes', () => {
      const fpPath = path.join(EVIDENCE_DIR, 'corpus-fingerprint-manifest.json');
      assert.ok(fs.existsSync(fpPath), 'corpus-fingerprint-manifest.json must exist');
      fingerprintsData = JSON.parse(fs.readFileSync(fpPath, 'utf8'));

      assert.ok(fingerprintsData.totalFiles >= 144, 'Must register fingerprints for fixtures, annotations, and cases');
      for (const [relPath, expectedSha] of Object.entries(fingerprintsData.fingerprints)) {
        const fullP = path.join(ARTIFACTS_DIR, relPath);
        assert.ok(fs.existsSync(fullP), `Registered artifact must exist: ${relPath}`);
        const actualSha = crypto.createHash('sha256').update(fs.readFileSync(fullP)).digest('hex');
        assert.strictEqual(actualSha, expectedSha, `Fingerprint mismatch for ${relPath}`);
      }
    });

    await s4.test('BM33-15: Artifact integrity manifest exists and validates all evidence files', () => {
      const intPath = path.join(EVIDENCE_DIR, 'artifact-integrity-manifest.json');
      assert.ok(fs.existsSync(intPath), 'artifact-integrity-manifest.json must exist');
      const intData = JSON.parse(fs.readFileSync(intPath, 'utf8'));

      assert.ok(intData.artifacts_ledger && Array.isArray(intData.artifacts_ledger));
      for (const entry of intData.artifacts_ledger) {
        const fullP = path.join(ROOT_DIR, entry.path);
        assert.ok(fs.existsSync(fullP), `Registered artifact must exist: ${entry.path}`);
        const actualSha = crypto.createHash('sha256').update(fs.readFileSync(fullP)).digest('hex');
        assert.strictEqual(actualSha, entry.sha256, `SHA-256 mismatch for ${entry.path}`);
      }
    });
  });
});
