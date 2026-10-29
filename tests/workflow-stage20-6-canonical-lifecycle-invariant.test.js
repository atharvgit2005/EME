/**
 * Phase 20 (Stage 20.6) Test Suite: Canonical Job Lifecycle Invariant & Terminal Immutability
 * Conforms to ChatGPT Architecture Lead Directives (Gate 20-A & Gate 20-D)
 *
 * Verifies:
 * - LIFECYCLE-01: Exact 12 canonical states defined in CanonicalJobStatus matching Phase 19 certification.
 * - LIFECYCLE-02: StatusNormalizationMap deterministically maps all legacy lifecycle states into the 12 canonical states.
 * - LIFECYCLE-03: Canonical transition map validates all permitted state transitions and rejects illegal transitions.
 * - LIFECYCLE-04: Terminal state immutability strictly latches SUCCEEDED, FAILED, and CANCELLED against subsequent changes.
 * - LIFECYCLE-05: NEEDS_RECONCILIATION state transition enables deterministic recovery reconciliation.
 * - LIFECYCLE-06: Gate 20-D.A: A COMMITTED record with no verified delivery evidence cannot be promoted to SUCCEEDED (maps to NEEDS_RECONCILIATION).
 * - LIFECYCLE-07: Gate 20-D.A: A COMMITTED record with complete, valid terminal-delivery evidence normalizes to SUCCEEDED under historical contract.
 * - LIFECYCLE-08: Gate 20-D.B: A VALIDATING record missing approval or authorization evidence cannot become READY_TO_EXECUTE.
 * - LIFECYCLE-09: Gate 20-D.B: A VALIDATING record with approval, verified plan hash, and expected revision migrates to READY_TO_EXECUTE.
 * - LIFECYCLE-10: Gate 20-D.C: OrchestrationJobManager.loadJob safely reconciles persisted disk records using evidence-based normalization.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { OperationPlanCompiler } = require('../src/prompt-core/operation-plan-compiler.js');
const {
  CanonicalJobStatus,
  CanonicalJobTransitions,
  StatusNormalizationMap,
  normalizeJobStatus,
  normalizePersistedJob,
  computeFileSha256BoundedSync,
  OrchestrationJobManager
} = require('../src/prompt-core/job-orchestrator.js');

const CERTIFIED_CANONICAL_STATES = [
  'ACCEPTED',
  'PLANNING',
  'AWAITING_APPROVAL',
  'READY_TO_EXECUTE',
  'EXECUTING',
  'VERIFYING',
  'RENDERING',
  'PUBLISHING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'NEEDS_RECONCILIATION'
];

test('LIFECYCLE-01: Exact 12 canonical states defined in CanonicalJobStatus matching Phase 19 certification', () => {
  const actualKeys = Object.keys(CanonicalJobStatus).sort();
  const actualValues = Object.values(CanonicalJobStatus).sort();
  const expectedSorted = [...CERTIFIED_CANONICAL_STATES].sort();

  assert.strictEqual(actualKeys.length, 12, 'CanonicalJobStatus must contain exactly 12 states');
  assert.deepStrictEqual(actualKeys, expectedSorted, 'State keys must match certified Phase 19 specification');
  assert.deepStrictEqual(actualValues, expectedSorted, 'State values must match certified Phase 19 specification');
  assert.strictEqual(Object.isFrozen(CanonicalJobStatus), true, 'CanonicalJobStatus must be immutable and frozen');
});

test('LIFECYCLE-02: StatusNormalizationMap deterministically maps all legacy lifecycle states into the 12 canonical states', () => {
  // Read schema/eme-job.v1.schema.json to ensure every schema status is accounted for
  const legacySchemaPath = path.resolve(__dirname, '../schema/eme-job.v1.schema.json');
  assert.ok(fs.existsSync(legacySchemaPath), 'Legacy job schema must exist');

  const legacySchema = JSON.parse(fs.readFileSync(legacySchemaPath, 'utf8'));
  const schemaStatuses = legacySchema.properties.status.enum;

  const validCanonicalSet = new Set(CERTIFIED_CANONICAL_STATES);

  // Every legacy schema status must normalize into a valid canonical state
  for (const status of schemaStatuses) {
    const normalized = normalizeJobStatus(status);
    assert.ok(
      validCanonicalSet.has(normalized),
      `Legacy status '${status}' must normalize to a canonical state, got: ${normalized}`
    );
  }

  // Every canonical state must normalize to itself idempotently
  for (const state of CERTIFIED_CANONICAL_STATES) {
    assert.strictEqual(
      normalizeJobStatus(state),
      state,
      `Canonical state '${state}' must normalize to itself`
    );
  }
});

test('LIFECYCLE-03: Canonical transition map validates all permitted state transitions and rejects illegal transitions', () => {
  // 1. Initial state ACCEPTED can only transition to PLANNING, FAILED, CANCELLED
  const acceptedTransitions = CanonicalJobTransitions[CanonicalJobStatus.ACCEPTED];
  assert.deepStrictEqual(acceptedTransitions.sort(), [
    CanonicalJobStatus.CANCELLED,
    CanonicalJobStatus.FAILED,
    CanonicalJobStatus.PLANNING
  ].sort());

  // 2. PLANNING can reach AWAITING_APPROVAL, READY_TO_EXECUTE, EXECUTING, FAILED, CANCELLED
  const planningTransitions = CanonicalJobTransitions[CanonicalJobStatus.PLANNING];
  assert.ok(planningTransitions.includes(CanonicalJobStatus.AWAITING_APPROVAL));
  assert.ok(planningTransitions.includes(CanonicalJobStatus.READY_TO_EXECUTE));

  // 3. Normalization maps legacy and variant aliases cleanly
  assert.strictEqual(normalizeJobStatus('COMMITTED'), CanonicalJobStatus.SUCCEEDED);
  assert.strictEqual(normalizeJobStatus('COMPLETED'), CanonicalJobStatus.SUCCEEDED);
  assert.strictEqual(normalizeJobStatus('RECOVERING'), CanonicalJobStatus.NEEDS_RECONCILIATION);
  assert.strictEqual(normalizeJobStatus('VALIDATING'), CanonicalJobStatus.READY_TO_EXECUTE);
  assert.strictEqual(normalizeJobStatus('QA_EVALUATING'), CanonicalJobStatus.VERIFYING);
});

test('LIFECYCLE-04: Terminal state immutability strictly latches SUCCEEDED, FAILED, and CANCELLED against subsequent changes', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-immutability-${Date.now()}`);
  const jm = new OrchestrationJobManager(tmpDir);

  const job = jm.createJob({ prompt: 'Test terminal immutability' });
  assert.strictEqual(job.status, CanonicalJobStatus.ACCEPTED);

  // Advance to terminal state SUCCEEDED through the canonical path
  jm.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(job.job_id, CanonicalJobStatus.READY_TO_EXECUTE);
  jm.transition(job.job_id, CanonicalJobStatus.EXECUTING);
  jm.transition(job.job_id, CanonicalJobStatus.RENDERING);
  jm.transition(job.job_id, CanonicalJobStatus.VERIFYING);
  jm.transition(job.job_id, CanonicalJobStatus.PUBLISHING);
  const succeededJob = jm.transition(job.job_id, CanonicalJobStatus.SUCCEEDED);
  assert.strictEqual(succeededJob.status, CanonicalJobStatus.SUCCEEDED);

  // Attempt illegal subsequent transition on terminal state
  const attemptAfterTerminal = jm.transition(job.job_id, CanonicalJobStatus.FAILED, { error: 'Late fault' });
  assert.strictEqual(
    attemptAfterTerminal.status,
    CanonicalJobStatus.SUCCEEDED,
    'Terminal status SUCCEEDED must be latched and immutable'
  );

  // Verify second job for CANCELLED terminal latch
  const job2 = jm.createJob({ prompt: 'Test cancelled terminal' });
  jm.transition(job2.job_id, CanonicalJobStatus.CANCELLED);
  const cancelAttempt = jm.transition(job2.job_id, CanonicalJobStatus.PLANNING);
  assert.strictEqual(
    cancelAttempt.status,
    CanonicalJobStatus.CANCELLED,
    'Terminal status CANCELLED must be latched and immutable'
  );

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

test('LIFECYCLE-05: NEEDS_RECONCILIATION state transition enables deterministic recovery reconciliation', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-reconciliation-${Date.now()}`);
  const jm = new OrchestrationJobManager(tmpDir);

  const job = jm.createJob({ prompt: 'Test reconciliation lifecycle' });
  jm.transition(job.job_id, CanonicalJobStatus.PLANNING);
  jm.transition(job.job_id, CanonicalJobStatus.READY_TO_EXECUTE);

  // Interrupt during execution triggering reconciliation
  const reconJob = jm.transition(job.job_id, CanonicalJobStatus.NEEDS_RECONCILIATION, {
    reason: 'Power loss during execution step'
  });

  assert.strictEqual(reconJob.status, CanonicalJobStatus.NEEDS_RECONCILIATION);
  assert.strictEqual(reconJob.canonical_status, CanonicalJobStatus.NEEDS_RECONCILIATION);

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

test('LIFECYCLE-06: Gate 20-D.A: A COMMITTED record with no verified delivery evidence cannot be promoted to SUCCEEDED', () => {
  // Legacy record that merely committed a project mutation or unverified plan
  const unverifiedCommittedRecord = {
    job_id: 'job_unverified_001',
    status: 'COMMITTED',
    project_revision: 3,
    // Note: missing active_delivery, delivery_manifest, and qa_report
  };

  const normalized = normalizePersistedJob(unverifiedCommittedRecord);
  assert.strictEqual(
    normalized,
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'Unverified COMMITTED record must normalize to NEEDS_RECONCILIATION to prevent false-positive delivery claims'
  );

  // Same via normalizeJobStatus with record context
  assert.strictEqual(
    normalizeJobStatus('COMMITTED', unverifiedCommittedRecord),
    CanonicalJobStatus.NEEDS_RECONCILIATION
  );
});

test('LIFECYCLE-07: Gate 20-D.A (Rev 4): A COMMITTED record with complete, valid terminal-delivery evidence normalizes to SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-07-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'master.mp4');
  const mediaBytes = Buffer.from('authoritative-verified-master-mp4-payload-2026');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  const manifestPath = path.join(tmpDir, 'master.manifest.json');
  const manifestData = {
    schema_version: '1.0.0',
    delivery_run_id: 'del_run_123',
    media_path: mediaPath,
    media_sha256: mediaSha256,
    sha256: mediaSha256
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifestData), 'utf8');

  const verifiedCommittedRecord = {
    job_id: 'job_verified_002',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_123',
      revision_id: 'rev_4',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    artifacts: {
      delivery_manifest: manifestPath,
      manifest_id: 'manifest_abc',
      sha256: mediaSha256
    },
    result: {
      qa_report: {
        passed: true,
        score: 92.5,
        delivery_run_id: 'del_run_123',
        media_path: mediaPath
      }
    },
    qa_score: 92.5
  };

  try {
    const normalized = normalizePersistedJob(verifiedCommittedRecord);
    assert.strictEqual(
      normalized,
      CanonicalJobStatus.SUCCEEDED,
      'Verified COMMITTED record with actual existing media, matching hash, and passing QA safely normalizes to SUCCEEDED'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-08: Gate 20-D.B: A VALIDATING record missing approval or authorization evidence cannot become READY_TO_EXECUTE', () => {
  // 1. Missing required approval
  const unapprovedRecord = {
    job_id: 'job_unapproved_003',
    status: 'VALIDATING',
    approvalState: { required: true, approved: false },
    plan_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
  };
  assert.strictEqual(
    normalizePersistedJob(unapprovedRecord),
    CanonicalJobStatus.AWAITING_APPROVAL,
    'Unapproved VALIDATING record must map to AWAITING_APPROVAL, never READY_TO_EXECUTE'
  );

  // 2. Missing plan hash
  const noPlanRecord = {
    job_id: 'job_noplan_004',
    status: 'VALIDATING',
    approvalState: { required: false, approved: true }
    // plan_hash missing
  };
  assert.strictEqual(
    normalizePersistedJob(noPlanRecord),
    CanonicalJobStatus.PLANNING,
    'VALIDATING record missing verified plan hash must map to PLANNING, never READY_TO_EXECUTE'
  );
});

test('LIFECYCLE-09: Gate 20-D.B (Rev 4): A VALIDATING record with approval, verified plan hash, and expected revision migrates to READY_TO_EXECUTE', () => {
  const plan = {
    schema_version: '1.0.0',
    plan_id: 'plan_canonical_09',
    operations: [{ type: 'cut', trackId: 'v1', at: 120000 }]
  };
  const planHash = OperationPlanCompiler.computePlanHash(plan);

  const readyRecord = {
    job_id: 'job_ready_005',
    status: 'VALIDATING',
    approvalState: { required: true, approved: true, approvedBy: 'lead-editor' },
    plan,
    plan_hash: planHash,
    projectRevision: 5,
    expected_base_revision: 5
  };

  assert.strictEqual(
    normalizePersistedJob(readyRecord),
    CanonicalJobStatus.READY_TO_EXECUTE,
    'Fully authorized and validated record with verifiable plan safely migrates to READY_TO_EXECUTE'
  );
});

test('LIFECYCLE-10: Gate 20-D.C: OrchestrationJobManager.loadJob safely reconciles persisted disk records using evidence-based normalization', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-disk-reconciliation-${Date.now()}`);
  const jm = new OrchestrationJobManager(tmpDir);

  // 1. Persist a raw historical unverified COMMITTED record directly to disk
  const legacyUnverifiedFile = path.join(tmpDir, 'job_disk_001.json');
  fs.writeFileSync(legacyUnverifiedFile, JSON.stringify({
    job_id: 'job_disk_001',
    status: 'COMMITTED',
    created_at: new Date().toISOString()
    // No delivery evidence!
  }), 'utf8');

  const loadedUnverified = jm.loadJob('job_disk_001');
  assert.strictEqual(
    loadedUnverified.canonical_status,
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'Persisted unverified COMMITTED record must load with canonical_status NEEDS_RECONCILIATION'
  );

  // 2. Persist a raw historical unapproved VALIDATING record directly to disk
  const legacyUnapprovedFile = path.join(tmpDir, 'job_disk_002.json');
  fs.writeFileSync(legacyUnapprovedFile, JSON.stringify({
    job_id: 'job_disk_002',
    status: 'VALIDATING',
    approvalState: { required: true, approved: false },
    created_at: new Date().toISOString()
  }), 'utf8');

  const loadedUnapproved = jm.loadJob('job_disk_002');
  assert.strictEqual(
    loadedUnapproved.canonical_status,
    CanonicalJobStatus.AWAITING_APPROVAL,
    'Persisted unapproved VALIDATING record must load with canonical_status AWAITING_APPROVAL'
  );

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

test('LIFECYCLE-11: Gate 20-D.A (Rev 3): A COMMITTED record with active delivery and manifest but NO QA report cannot become SUCCEEDED', () => {
  const missingQaRecord = {
    job_id: 'job_no_qa_011',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_11',
      media_path: 'artifacts/deliverables/master.mp4',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    artifacts: {
      manifest_id: 'manifest_11'
    }
  };

  assert.strictEqual(
    normalizePersistedJob(missingQaRecord),
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'Missing QA report must fail safely to NEEDS_RECONCILIATION'
  );
});

test('LIFECYCLE-12: Gate 20-D.A (Rev 3): A COMMITTED record with passed: true but missing or invalid score cannot become SUCCEEDED', () => {
  const noScoreRecord = {
    job_id: 'job_no_score_012',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_12',
      media_path: 'artifacts/deliverables/master.mp4',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    artifacts: { manifest_id: 'manifest_12' },
    result: {
      qa_report: { passed: true }
    }
  };

  assert.strictEqual(
    normalizePersistedJob(noScoreRecord),
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'Passed QA without valid finite score must normalize to NEEDS_RECONCILIATION'
  );

  const nanScoreRecord = {
    ...noScoreRecord,
    result: { qa_report: { passed: true, score: NaN } }
  };
  assert.strictEqual(
    normalizePersistedJob(nanScoreRecord),
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'NaN score must normalize to NEEDS_RECONCILIATION'
  );
});

test('LIFECYCLE-13: Gate 20-D.A (Rev 3): A COMMITTED record with QA score below 85.0 threshold cannot become SUCCEEDED', () => {
  const belowThresholdRecord = {
    job_id: 'job_below_85_013',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_13',
      media_path: 'artifacts/deliverables/master.mp4',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    artifacts: { manifest_id: 'manifest_13' },
    result: {
      qa_report: { passed: true, score: 84.9 }
    }
  };

  assert.strictEqual(
    normalizePersistedJob(belowThresholdRecord),
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'QA score below 85.0 (84.9) must fail closed to NEEDS_RECONCILIATION'
  );
});

test('LIFECYCLE-14: Gate 20-D.A (Rev 4): A COMMITTED record with a valid-looking digest but missing media fails safe', () => {
  const missingMediaRecord = {
    job_id: 'job_missing_media_014',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_14',
      media_path: '/non/existent/path/master_nonexistent_2026.mp4',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    artifacts: {
      manifest_id: 'manifest_14'
    },
    result: {
      qa_report: { passed: true, score: 95.0 }
    }
  };

  assert.strictEqual(
    normalizePersistedJob(missingMediaRecord),
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'Missing media file on disk must fail safe to NEEDS_RECONCILIATION'
  );
});

test('LIFECYCLE-15: Gate 20-D.A (Rev 4): A manifest whose digest does not match the media cannot produce SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-15-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media15.mp4');
  const mediaBytes = Buffer.from('actual-media-bytes-for-test-15');
  fs.writeFileSync(mediaPath, mediaBytes);

  // Mismatched expected digest!
  const incorrectDigest = '0'.repeat(64);

  const mismatchedRecord = {
    job_id: 'job_mismatch_15',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_15',
      media_path: mediaPath,
      sha256: incorrectDigest
    },
    delivery_manifest: {
      media_path: mediaPath,
      media_sha256: incorrectDigest
    },
    result: {
      qa_report: { passed: true, score: 95.0 }
    }
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(mismatchedRecord),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'Media whose bytes do not hash to expected digest must fail safe to NEEDS_RECONCILIATION'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-16: Gate 20-D.A (Rev 4): A manifest referring to a different delivery artifact cannot produce SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-16-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media16.mp4');
  const mediaBytes = Buffer.from('media-bytes-16');
  fs.writeFileSync(mediaPath, mediaBytes);
  const actualHash = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  // Manifest points to a different delivery run!
  const conflictingManifestRecord = {
    job_id: 'job_conflict_16',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_16_A',
      media_path: mediaPath,
      sha256: actualHash
    },
    delivery_manifest: {
      delivery_run_id: 'del_run_16_B', // Different delivery run ID!
      media_path: mediaPath,
      media_sha256: actualHash
    },
    result: {
      qa_report: { passed: true, score: 95.0 }
    }
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(conflictingManifestRecord),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'Manifest pointing to different delivery artifact must fail safe to NEEDS_RECONCILIATION'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-17: Gate 20-D.B (Rev 4): A VALIDATING record with syntactically valid plan hash but no plan content cannot become READY_TO_EXECUTE', () => {
  const noContentRecord = {
    job_id: 'job_no_plan_content_017',
    status: 'VALIDATING',
    approvalState: { required: false },
    plan_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    expected_base_revision: 3
    // plan content completely absent!
  };

  assert.strictEqual(
    normalizePersistedJob(noContentRecord),
    CanonicalJobStatus.PLANNING,
    'Valid plan hash with missing plan content must normalize to PLANNING, never READY_TO_EXECUTE'
  );
});

test('LIFECYCLE-18: Gate 20-D.B (Rev 4): A persisted plan whose actual hash differs from its stored hash cannot become READY_TO_EXECUTE', () => {
  const plan = {
    schema_version: '1.0.0',
    plan_id: 'plan_18',
    operations: [{ type: 'split', trackId: 'v1', at: 50000 }]
  };

  const mismatchedRecord = {
    job_id: 'job_mismatched_plan_018',
    status: 'VALIDATING',
    approvalState: { required: false },
    plan,
    plan_hash: '1111111111111111111111111111111111111111111111111111111111111111', // Tampered!
    expected_base_revision: 2
  };

  assert.strictEqual(
    normalizePersistedJob(mismatchedRecord),
    CanonicalJobStatus.PLANNING,
    'Plan with mismatched actual hash must normalize to PLANNING, never READY_TO_EXECUTE'
  );
});

test('LIFECYCLE-19: Gate 20-D.B (Rev 4): A plan whose content and hash match, with valid authorization and expected revision evidence, migrates safely', () => {
  const plan = {
    schema_version: '1.0.0',
    plan_id: 'plan_19_valid',
    operations: [
      { type: 'cut', trackId: 'v1', at: 120000 },
      { type: 'transition', trackId: 'v1', transitionType: 'crossfade', durationTicks: 24000 }
    ]
  };
  const verifiedHash = OperationPlanCompiler.computePlanHash(plan);

  const validRecord = {
    job_id: 'job_valid_19',
    status: 'VALIDATING',
    approvalState: { required: true, approved: true, approvedBy: 'chief-editor' },
    plan,
    plan_hash: verifiedHash,
    expected_base_revision: 5
  };

  assert.strictEqual(
    normalizePersistedJob(validRecord),
    CanonicalJobStatus.READY_TO_EXECUTE,
    'Verified plan content with matching hash and authorization safely normalizes to READY_TO_EXECUTE'
  );
});

test('LIFECYCLE-20: Gate 20-D.C (Rev 4): OrchestrationJobManager.loadJob reconciles verified delivery to SUCCEEDED and authorized plan to READY_TO_EXECUTE from disk', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-disk-rev4-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const jm = new OrchestrationJobManager(tmpDir);

  // 1. Create real delivery media and manifest on disk
  const mediaPath = path.join(tmpDir, 'loaded_master.mp4');
  const mediaBytes = Buffer.from('authoritative-disk-media-bytes-2026');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  const manifestPath = path.join(tmpDir, 'loaded_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schema_version: '1.0.0',
    delivery_run_id: 'del_disk_01',
    media_path: mediaPath,
    media_sha256: mediaSha256
  }), 'utf8');

  // Persist verified COMMITTED job to disk
  const fullyVerifiedFile = path.join(tmpDir, 'job_disk_verified.json');
  fs.writeFileSync(fullyVerifiedFile, JSON.stringify({
    job_id: 'job_disk_verified',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_disk_01',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    artifacts: { delivery_manifest: manifestPath },
    result: {
      qa_report: {
        passed: true,
        score: 96.0,
        delivery_run_id: 'del_disk_01',
        media_path: mediaPath
      }
    },
    created_at: new Date().toISOString()
  }), 'utf8');

  const loadedVerified = jm.loadJob('job_disk_verified');
  assert.strictEqual(
    loadedVerified.canonical_status,
    CanonicalJobStatus.SUCCEEDED,
    'Fully verified COMMITTED record on disk with actual verified bytes reconciles to SUCCEEDED'
  );

  // 2. Persist authorized VALIDATING record with matching plan hash on disk
  const plan = {
    schema_version: '1.0.0',
    plan_id: 'plan_disk_02',
    operations: [{ type: 'cut', trackId: 'v1', at: 60000 }]
  };
  const planHash = OperationPlanCompiler.computePlanHash(plan);

  const fullyAuthorizedFile = path.join(tmpDir, 'job_disk_authorized.json');
  fs.writeFileSync(fullyAuthorizedFile, JSON.stringify({
    job_id: 'job_disk_authorized',
    status: 'VALIDATING',
    approvalState: { required: true, approved: true, approvedBy: 'lead-editor' },
    plan,
    plan_hash: planHash,
    expected_base_revision: 4,
    created_at: new Date().toISOString()
  }), 'utf8');

  const loadedAuthorized = jm.loadJob('job_disk_authorized');
  assert.strictEqual(
    loadedAuthorized.canonical_status,
    CanonicalJobStatus.READY_TO_EXECUTE,
    'Fully authorized VALIDATING record on disk with matching plan hash reconciles to READY_TO_EXECUTE'
  );

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

test('LIFECYCLE-21: Gate 20-D.A (Rev 5): A manifest missing its digest cannot produce SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-21-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media21.mp4');
  const mediaBytes = Buffer.from('media-bytes-for-lifecycle-21');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  // Manifest has identity but is missing digest (media_sha256 and sha256 missing)
  const recordMissingManifestDigest = {
    job_id: 'job_no_manifest_digest_21',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_21',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    delivery_manifest: {
      delivery_run_id: 'del_run_21',
      media_path: mediaPath
      // No sha256 or media_sha256!
    },
    result: {
      qa_report: {
        passed: true,
        score: 95.0,
        delivery_run_id: 'del_run_21',
        media_path: mediaPath
      }
    }
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(recordMissingManifestDigest),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'Manifest missing its digest must fail safe to NEEDS_RECONCILIATION'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-22: Gate 20-D.A (Rev 5): A manifest with a valid-looking 64-hex digest that mismatches actual media cannot produce SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-22-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media22.mp4');
  const mediaBytes = Buffer.from('media-bytes-for-lifecycle-22');
  fs.writeFileSync(mediaPath, mediaBytes);
  const actualSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  // Valid 64-hex format, but different from actual media digest
  const divergentValidDigest = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

  const recordMismatchedManifestDigest = {
    job_id: 'job_mismatched_manifest_digest_22',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_22',
      media_path: mediaPath,
      sha256: actualSha256
    },
    delivery_manifest: {
      delivery_run_id: 'del_run_22',
      media_path: mediaPath,
      media_sha256: divergentValidDigest // Valid 64-hex string, but does not match actual bytes
    },
    result: {
      qa_report: {
        passed: true,
        score: 95.0,
        delivery_run_id: 'del_run_22',
        media_path: mediaPath
      }
    }
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(recordMismatchedManifestDigest),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'Manifest with divergent 64-hex digest must fail safe to NEEDS_RECONCILIATION'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-23: Gate 20-D.A (Rev 5): A manifest missing required artifact identity (media_path or delivery_run_id) cannot produce SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-23-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media23.mp4');
  const mediaBytes = Buffer.from('media-bytes-for-lifecycle-23');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  // Case A: Missing media_path in manifest
  const recordMissingManifestPath = {
    job_id: 'job_missing_path_23',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_23',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    delivery_manifest: {
      delivery_run_id: 'del_run_23',
      media_sha256: mediaSha256
      // media_path missing!
    },
    result: {
      qa_report: {
        passed: true,
        score: 95.0,
        delivery_run_id: 'del_run_23',
        media_path: mediaPath
      }
    }
  };

  // Case B: Missing delivery_run_id in manifest
  const recordMissingManifestRunId = {
    job_id: 'job_missing_run_id_23',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_23',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    delivery_manifest: {
      media_path: mediaPath,
      media_sha256: mediaSha256
      // delivery_run_id missing!
    },
    result: {
      qa_report: {
        passed: true,
        score: 95.0,
        delivery_run_id: 'del_run_23',
        media_path: mediaPath
      }
    }
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(recordMissingManifestPath),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'Manifest missing media_path must fail safe to NEEDS_RECONCILIATION'
    );
    assert.strictEqual(
      normalizePersistedJob(recordMissingManifestRunId),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'Manifest missing delivery_run_id must fail safe to NEEDS_RECONCILIATION'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-24: Gate 20-D.A (Rev 5): A QA report lacking artifact binding cannot produce SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-24-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media24.mp4');
  const mediaBytes = Buffer.from('media-bytes-for-lifecycle-24');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  // QA report passes with high score, but has ZERO delivery artifact identity or binding
  const recordUnboundQa = {
    job_id: 'job_unbound_qa_24',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_24',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    delivery_manifest: {
      delivery_run_id: 'del_run_24',
      media_path: mediaPath,
      media_sha256: mediaSha256
    },
    result: {
      qa_report: {
        passed: true,
        score: 98.0
        // No delivery_run_id, media_path, sha256, or certified report_id!
      }
    }
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(recordUnboundQa),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'QA report without artifact binding must fail safe to NEEDS_RECONCILIATION'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-25: Gate 20-D.A (Rev 5): A QA report referring to a different delivery cannot produce SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-25-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media25.mp4');
  const mediaBytes = Buffer.from('media-bytes-for-lifecycle-25');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  // Case A: QA report with conflicting delivery_run_id
  const conflictingRunIdRecord = {
    job_id: 'job_conflict_qa_run_25',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_25_ACTIVE',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    delivery_manifest: {
      delivery_run_id: 'del_run_25_ACTIVE',
      media_path: mediaPath,
      media_sha256: mediaSha256
    },
    result: {
      qa_report: {
        passed: true,
        score: 95.0,
        delivery_run_id: 'del_run_25_FOREIGN' // Different delivery run!
      }
    }
  };

  // Case B: QA report with conflicting media_path
  const conflictingMediaPathRecord = {
    job_id: 'job_conflict_qa_media_25',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_25_ACTIVE',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    delivery_manifest: {
      delivery_run_id: 'del_run_25_ACTIVE',
      media_path: mediaPath,
      media_sha256: mediaSha256
    },
    result: {
      qa_report: {
        passed: true,
        score: 95.0,
        media_path: '/unrelated/path/foreign.mp4' // Different media path!
      }
    }
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(conflictingRunIdRecord),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'QA report with conflicting delivery_run_id must fail safe to NEEDS_RECONCILIATION'
    );
    assert.strictEqual(
      normalizePersistedJob(conflictingMediaPathRecord),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'QA report with conflicting media_path must fail safe to NEEDS_RECONCILIATION'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-26: Gate 20-D.A (Rev 5): Resource-safe bounded streaming hashing (computeFileSha256BoundedSync) verifies digests accurately without unconstrained memory usage', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-26-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const filePath = path.join(tmpDir, 'large_payload_sim.bin');
  // Generate multi-chunk deterministic payload (256 KB)
  const chunkSize = 1024;
  const chunkCount = 256;
  const fd = fs.openSync(filePath, 'w');
  const referenceHash = crypto.createHash('sha256');

  for (let i = 0; i < chunkCount; i++) {
    const chunk = Buffer.alloc(chunkSize, (i % 256));
    fs.writeSync(fd, chunk);
    referenceHash.update(chunk);
  }
  fs.closeSync(fd);

  const expectedDigest = referenceHash.digest('hex');

  // Verify bounded streaming hash using small 4KB chunks (forces 64 incremental buffer reads)
  const streamingDigest = computeFileSha256BoundedSync(filePath, 4096);
  assert.strictEqual(
    streamingDigest,
    expectedDigest,
    'computeFileSha256BoundedSync must produce bit-exact SHA-256 digest across incremental chunks'
  );

  // Verify fail-safe on non-existent file
  assert.throws(
    () => computeFileSha256BoundedSync(path.join(tmpDir, 'non_existent_file.bin')),
    /ENOENT/,
    'computeFileSha256BoundedSync must fail closed with ENOENT for missing files'
  );

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

test('LIFECYCLE-27: Gate 20-D.A (Rev 6): A QA report missing score cannot normalize to SUCCEEDED even if job.qa_score is valid and >= 85.0', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-27-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media27.mp4');
  const mediaBytes = Buffer.from('media-bytes-for-lifecycle-27');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  // qa_report itself omits score, but top-level job has qa_score: 92.0
  const recordWithTopLevelFallback = {
    job_id: 'job_fallback_score_27',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_27',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    delivery_manifest: {
      delivery_run_id: 'del_run_27',
      media_path: mediaPath,
      media_sha256: mediaSha256
    },
    result: {
      qa_report: {
        passed: true,
        // score missing from qa_report itself!
        delivery_run_id: 'del_run_27',
        media_path: mediaPath
      }
    },
    qa_score: 92.0 // Top-level fallback must NOT substitute for missing QA report score
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(recordWithTopLevelFallback),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'Missing QA report score cannot be satisfied by job.qa_score fallback and must fail safe'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-28: Gate 20-D.A (Rev 6): Malformed manifest or QA digest/identity fields fail safe to NEEDS_RECONCILIATION without throwing exceptions', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-28-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media28.mp4');
  const mediaBytes = Buffer.from('media-bytes-for-lifecycle-28');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  // Case A: Non-string manifest digest (number)
  const numManifestDigest = {
    job_id: 'job_malformed_man_num_28',
    status: 'COMMITTED',
    active_delivery: { delivery_run_id: 'del_28', media_path: mediaPath, sha256: mediaSha256 },
    delivery_manifest: { delivery_run_id: 'del_28', media_path: mediaPath, media_sha256: 123456789 },
    result: { qa_report: { passed: true, score: 95.0, delivery_run_id: 'del_28', media_path: mediaPath } }
  };
  assert.strictEqual(
    normalizePersistedJob(numManifestDigest),
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'Numeric manifest digest must fail safe to NEEDS_RECONCILIATION without throwing'
  );

  // Case B: Object manifest digest
  const objManifestDigest = {
    job_id: 'job_malformed_man_obj_28',
    status: 'COMMITTED',
    active_delivery: { delivery_run_id: 'del_28', media_path: mediaPath, sha256: mediaSha256 },
    delivery_manifest: { delivery_run_id: 'del_28', media_path: mediaPath, media_sha256: { corrupted: true } },
    result: { qa_report: { passed: true, score: 95.0, delivery_run_id: 'del_28', media_path: mediaPath } }
  };
  assert.strictEqual(
    normalizePersistedJob(objManifestDigest),
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'Object manifest digest must fail safe to NEEDS_RECONCILIATION without throwing'
  );

  // Case C: Malformed QA digest (non-hex string or number)
  const malformedQaDigest = {
    job_id: 'job_malformed_qa_digest_28',
    status: 'COMMITTED',
    active_delivery: { delivery_run_id: 'del_28', media_path: mediaPath, sha256: mediaSha256 },
    delivery_manifest: { delivery_run_id: 'del_28', media_path: mediaPath, media_sha256: mediaSha256 },
    result: {
      qa_report: {
        passed: true,
        score: 95.0,
        delivery_run_id: 'del_28',
        media_path: mediaPath,
        media_sha256: 99999 // Non-string QA digest
      }
    }
  };
  assert.strictEqual(
    normalizePersistedJob(malformedQaDigest),
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'Malformed QA digest must fail safe to NEEDS_RECONCILIATION without throwing'
  );

  // Case D: Non-string manifest identity
  const nonStringIdentity = {
    job_id: 'job_non_str_identity_28',
    status: 'COMMITTED',
    active_delivery: { delivery_run_id: 'del_28', media_path: mediaPath, sha256: mediaSha256 },
    delivery_manifest: { delivery_run_id: 12345, media_path: mediaPath, media_sha256: mediaSha256 },
    result: { qa_report: { passed: true, score: 95.0, delivery_run_id: 'del_28', media_path: mediaPath } }
  };
  assert.strictEqual(
    normalizePersistedJob(nonStringIdentity),
    CanonicalJobStatus.NEEDS_RECONCILIATION,
    'Non-string delivery_run_id in manifest must fail safe without throwing'
  );

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

test('LIFECYCLE-29: Gate 20-D.A (Rev 7): A matching qa_report_id found only in job.artifacts cannot authorize SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-29-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media29.mp4');
  const mediaBytes = Buffer.from('media-bytes-for-lifecycle-29');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  // Manifest has identity and digest, but does NOT certify the QA report ID
  const manifestWithoutQaCert = {
    delivery_run_id: 'del_run_29',
    media_path: mediaPath,
    media_sha256: mediaSha256
    // No qa_certification or qa_report_id in manifest!
  };

  const recordWithArtifactOnlyQaId = {
    job_id: 'job_artifact_only_qa_29',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_29',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    delivery_manifest: manifestWithoutQaCert,
    artifacts: {
      qa_report_id: 'qarep-artifact-only-29' // Found only in job.artifacts!
    },
    result: {
      qa_report: {
        passed: true,
        score: 96.0,
        report_id: 'qarep-artifact-only-29' // Relies solely on report_id
      }
    }
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(recordWithArtifactOnlyQaId),
      CanonicalJobStatus.NEEDS_RECONCILIATION,
      'A report ID found only in job.artifacts cannot authorize SUCCEEDED when absent from manifest'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});

test('LIFECYCLE-30: Gate 20-D.A (Rev 7): A QA report ID matching the manifest certified report ID safely normalizes to SUCCEEDED', () => {
  const tmpDir = path.join(os.tmpdir(), `eme-test-lifecycle-30-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const mediaPath = path.join(tmpDir, 'media30.mp4');
  const mediaBytes = Buffer.from('media-bytes-for-lifecycle-30');
  fs.writeFileSync(mediaPath, mediaBytes);
  const mediaSha256 = crypto.createHash('sha256').update(mediaBytes).digest('hex');

  const certifiedReportId = 'qarep-manifest-certified-30';

  // Manifest explicitly certifies the QA report ID
  const manifestWithQaCert = {
    delivery_run_id: 'del_run_30',
    media_path: mediaPath,
    media_sha256: mediaSha256,
    qa_certification: {
      report_id: certifiedReportId
    }
  };

  const recordWithManifestCertifiedQaId = {
    job_id: 'job_manifest_certified_qa_30',
    status: 'COMMITTED',
    active_delivery: {
      delivery_run_id: 'del_run_30',
      media_path: mediaPath,
      sha256: mediaSha256
    },
    delivery_manifest: manifestWithQaCert,
    result: {
      qa_report: {
        passed: true,
        score: 96.0,
        report_id: certifiedReportId // Matches manifest certified report_id
      }
    }
  };

  try {
    assert.strictEqual(
      normalizePersistedJob(recordWithManifestCertifiedQaId),
      CanonicalJobStatus.SUCCEEDED,
      'QA report ID explicitly certified by the manifest safely authorizes normalization to SUCCEEDED'
    );
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});





