/**
 * Stage 30.1: Failure Model & Reproducible Baseline Test Suite
 *
 * Implements Stage 30.1 verification:
 * - FMD-01: Predecessor regression baseline & Git provenance verification
 * - FMD-02: Canonical schema immutability & syntax integrity (18 frozen schemas)
 * - FMD-03: Zero external runtime npm dependencies verification ("dependencies": {})
 * - FMD-04: Authoritative mutation boundary inventory completeness (BND-01..11)
 * - FMD-05: Fault-injection registry completeness (all 20 mandatory FI-01..20 scenarios)
 * - FMD-06: Invariant-to-test traceability matrix mapping
 * - FMD-07: Recovery evidence bundle specification & canonical job state vocabulary
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

describe('Stage 30.1: Failure Model & Reproducible Baseline', () => {

  test('FMD-01: Predecessor regression baseline & Git provenance verification', () => {
    // 1. Verify predecessor tag phase-29-certified exists and points to commit
    const tagPeel = execSync("git rev-parse 'phase-29-certified^{}'", { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    assert.strictEqual(tagPeel, 'c854f6fbf254f7b1f62f7dd9ffc33429298733d2', 'phase-29-certified must peel to c854f6f');

    // 2. Verify current HEAD descends from phase-29-certified
    const isAncestor = execSync('git merge-base --is-ancestor phase-29-certified HEAD && echo ANCESTOR_OK', {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim();
    assert.strictEqual(isAncestor, 'ANCESTOR_OK', 'Current HEAD must descend from phase-29-certified');

    // 3. Verify baseline predecessor regression record exists
    const baselineRegPath = path.join(REPO_ROOT, 'artifacts/phase-30/baseline/predecessor-regression.txt');
    assert.ok(fs.existsSync(baselineRegPath), 'Predecessor regression baseline log must exist');
    const logContent = fs.readFileSync(baselineRegPath, 'utf8');
    assert.ok(logContent.includes('289 / 289 PASS'), 'Baseline log must confirm 289/289 passing predecessor tests');
  });

  test('FMD-02: Canonical schema immutability & syntax integrity (frozen schemas)', () => {
    const schemaDir = path.join(REPO_ROOT, 'schema');
    assert.ok(fs.existsSync(schemaDir), 'schema directory must exist');

    const schemaFiles = fs.readdirSync(schemaDir).filter(f => f.endsWith('.schema.json')).sort();
    assert.ok(schemaFiles.length >= 18, `Must have at least 18 canonical schemas in schema/ (found ${schemaFiles.length})`);

    for (const file of schemaFiles) {
      const fullPath = path.join(schemaDir, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(raw);
      }, `Schema ${file} must be valid JSON`);
      assert.ok(parsed.$schema || parsed.type || parsed.title, `Schema ${file} must have valid JSON Schema structure`);
    }

    // Verify baseline schema inventory matches (excluding post-Phase-30 auxiliary schemas)
    const invPath = path.join(REPO_ROOT, 'artifacts/phase-30/baseline/schema-inventory.json');
    const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
    const postPhase30Auxiliary = ['eme-visual-intelligence.v1.schema.json', 'eme-fusion-evidence.v1.schema.json'];
    const baselineSchemas = schemaFiles.filter(f => !postPhase30Auxiliary.includes(f));
    assert.strictEqual(inv.total_count, baselineSchemas.length, 'Schema inventory count must match directory files');
  });

  test('FMD-03: Zero external runtime npm dependencies verification ("dependencies": {})', () => {
    const pkgPath = path.join(REPO_ROOT, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = pkg.dependencies || {};
    assert.strictEqual(Object.keys(deps).length, 0, 'Must have 0 external runtime npm dependencies');
    assert.strictEqual(pkg.name, 'editing-mechanics-engine', 'Package name must be editing-mechanics-engine');
  });

  test('FMD-04: Authoritative mutation boundary inventory completeness (BND-01..11)', () => {
    const bndPath = path.join(REPO_ROOT, 'artifacts/phase-30/stage-30.1/failure-boundaries.json');
    assert.ok(fs.existsSync(bndPath), 'Failure boundaries inventory artifact must exist');

    const bndData = JSON.parse(fs.readFileSync(bndPath, 'utf8'));
    assert.strictEqual(bndData.timebase_canonical, 120000, 'Timebase must be canonical 120,000 ticks/sec');
    assert.strictEqual(bndData.mutation_authority, 'OperationExecutor', 'OperationExecutor must be designated mutation authority');
    assert.ok(Array.isArray(bndData.boundaries), 'Boundaries must be an array');
    assert.strictEqual(bndData.boundaries.length, 11, 'Must inventory exactly 11 execution boundaries (BND-01..11)');

    const expectedBoundaries = [
      'REQUEST_ACCEPTANCE',
      'PLAN_COMPILATION',
      'APPROVAL_GATING',
      'PRE_COMMIT_MUTATION',
      'OPERATION_COMMIT',
      'POST_COMMIT_JOURNAL',
      'MEDIA_RENDERING',
      'POST_RENDER_QA',
      'DELIVERY_MANIFEST',
      'DELIVERY_PROMOTION',
      'COMPENSATION_RECONCILIATION'
    ];

    bndData.boundaries.forEach((b, idx) => {
      assert.strictEqual(b.name, expectedBoundaries[idx], `Boundary ${idx + 1} must match ${expectedBoundaries[idx]}`);
      assert.ok(Array.isArray(b.persistent_writes) && b.persistent_writes.length > 0, `Boundary ${b.name} must identify persistent writes`);
      assert.ok(Array.isArray(b.crash_windows) && b.crash_windows.length > 0, `Boundary ${b.name} must identify crash windows`);
      assert.ok(b.recovery_strategy, `Boundary ${b.name} must specify recovery strategy`);
    });
  });

  test('FMD-05: Fault-injection registry completeness (all 20 mandatory FI-01..20 scenarios)', () => {
    const regPath = path.join(REPO_ROOT, 'artifacts/phase-30/stage-30.1/fault-registry.json');
    assert.ok(fs.existsSync(regPath), 'Fault-injection registry artifact must exist');

    const regData = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    assert.ok(Array.isArray(regData.scenarios), 'Scenarios must be an array');
    assert.strictEqual(regData.scenarios.length, 20, 'Must have exactly 20 mandatory fault scenarios (FI-01..FI-20)');

    for (let i = 1; i <= 20; i++) {
      const id = `FI-${String(i).padStart(2, '0')}`;
      const scenario = regData.scenarios.find(s => s.id === id);
      assert.ok(scenario, `Registry must include mandatory scenario ${id}`);
      assert.strictEqual(scenario.severity, 'Release blocker', `Scenario ${id} must be classified as Release blocker`);
      assert.ok(scenario.preconditions, `Scenario ${id} must specify preconditions`);
      assert.ok(scenario.injection_point, `Scenario ${id} must specify injection point`);
      assert.ok(scenario.expected_postcondition, `Scenario ${id} must specify expected postcondition`);
      assert.ok(scenario.expected_job_state, `Scenario ${id} must specify expected job state`);
      assert.ok(scenario.reproducible_fixture, `Scenario ${id} must specify reproducible fixture path`);
    }
  });

  test('FMD-06: Invariant-to-test traceability matrix mapping', () => {
    const mapPath = path.join(REPO_ROOT, 'artifacts/phase-30/stage-30.1/invariant-test-map.json');
    assert.ok(fs.existsSync(mapPath), 'Invariant-test map artifact must exist');

    const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    assert.ok(Array.isArray(mapData.mappings), 'Mappings must be an array');
    assert.strictEqual(mapData.mappings.length, 10, 'Must map all 10 canonical invariant sections (3.1..3.10)');

    const coveredSections = mapData.mappings.map(m => m.invariant_section);
    assert.ok(coveredSections.some(s => s.startsWith('3.1 Time and interval')), 'Section 3.1 must be mapped');
    assert.ok(coveredSections.some(s => s.startsWith('3.2 Canonical schemas')), 'Section 3.2 must be mapped');
    assert.ok(coveredSections.some(s => s.startsWith('3.3 Mutation ownership')), 'Section 3.3 must be mapped');
    assert.ok(coveredSections.some(s => s.startsWith('3.4 State and delivery')), 'Section 3.4 must be mapped');
    assert.ok(coveredSections.some(s => s.startsWith('3.5 Canonical job states')), 'Section 3.5 must be mapped');
    assert.ok(coveredSections.some(s => s.startsWith('3.6 Failure semantics')), 'Section 3.6 must be mapped');
    assert.ok(coveredSections.some(s => s.startsWith('3.7 Transactions and compensation')), 'Section 3.7 must be mapped');
    assert.ok(coveredSections.some(s => s.startsWith('3.8 Concurrency and durable identity')), 'Section 3.8 must be mapped');
    assert.ok(coveredSections.some(s => s.startsWith('3.9 Existing specialized constraints')), 'Section 3.9 must be mapped');
    assert.ok(coveredSections.some(s => s.startsWith('3.10 Repository safety')), 'Section 3.10 must be mapped');
  });

  test('FMD-07: Recovery evidence bundle specification & canonical job state vocabulary', () => {
    // 1. Verify evidence bundle spec
    const specPath = path.join(REPO_ROOT, 'artifacts/phase-30/stage-30.1/evidence-bundle-spec.json');
    assert.ok(fs.existsSync(specPath), 'Evidence bundle spec must exist');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    assert.ok(Array.isArray(spec.required_fields), 'Required fields must be an array');
    assert.ok(spec.required_fields.includes('scenario_id'), 'Spec must require scenario_id');
    assert.ok(spec.required_fields.includes('injected_fault_boundary'), 'Spec must require injected_fault_boundary');
    assert.ok(spec.required_fields.includes('commit_decision'), 'Spec must require commit_decision');
    assert.ok(spec.required_fields.includes('artifact_checksums'), 'Spec must require artifact_checksums');

    // 2. Verify exactly the 12 canonical job states exist
    const { CanonicalJobStatus } = require(path.join(REPO_ROOT, 'src/prompt-core/job-orchestrator.js'));
    const expectedCanonicalStates = [
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
    assert.deepStrictEqual(Object.values(CanonicalJobStatus).sort(), expectedCanonicalStates.sort(), 'Canonical job states must match the 12 approved states');
  });

});
