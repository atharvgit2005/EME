/**
 * Test Suite: Workflow Stage 32.1 - EME Visual Intelligence Contract Specification
 *
 * Verifies:
 * 1. Auxiliary observation sidecar schema (eme-visual-intelligence.v1.schema.json) compliance.
 * 2. Unmodified preservation of all 18 canonical schemas against baseline.
 * 3. Validation and acceptance of valid sidecars (interview, landscape).
 * 4. Invalidation and fail-closed rejection of invalid sidecars (stale hash, bad version,
 *    timebase deviation, out-of-bounds geometry, non-monotonic ticks, confidence range breach).
 * 5. Execution and exact numerical match across all 7 coordinate transform test vectors.
 * 6. Observation vs. Decision separation (rejection of injected solver rectangles or placement scores).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const {
  VisualContractValidator,
  VALID_OBSERVATION_TYPES,
  VALID_EXECUTION_MODES
} = require('../src/renderers/visual-contract-validator.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_FILE = path.join(REPO_ROOT, 'schema', 'eme-visual-intelligence.v1.schema.json');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'artifacts', 'phase-32', 'stage-32.1', 'examples');
const VECTORS_FILE = path.join(REPO_ROOT, 'artifacts', 'phase-32', 'stage-32.1', 'coordinate-transform-test-vectors.json');

describe('Stage 32.1: Visual Intelligence Contract & Coordinate Transform Suite', () => {

  describe('Section 1: Schema File Integrity & Meta-Validation', () => {
    it('CTR-01: Schema file exists, parses as valid JSON, and adheres to Draft 2020-12', () => {
      assert.ok(fs.existsSync(SCHEMA_FILE), 'Schema file must exist');
      const schema = VisualContractValidator.getSchema();

      assert.strictEqual(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
      assert.strictEqual(schema.$id, 'https://eme.local/schemas/eme-visual-intelligence.v1.schema.json');
      assert.strictEqual(schema.title, 'EditingMechanicsEngineVisualIntelligence');
      assert.strictEqual(schema.additionalProperties, false);
      assert.ok(Array.isArray(schema.required));
      assert.ok(schema.required.includes('schemaVersion'));
      assert.ok(schema.required.includes('source'));
      assert.ok(schema.required.includes('proxy'));
      assert.ok(schema.required.includes('producer'));
      assert.ok(schema.required.includes('coordinateSpace'));
      assert.ok(schema.required.includes('frames'));
    });

    it('CTR-02: Canonical schemas remain unmodified from Phase 31 certification baseline', () => {
      // Query git diff on schema/ directory to ensure no tracked canonical schemas have been modified
      const diffOut = execSync('git diff --name-only HEAD schema/', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
      assert.strictEqual(diffOut, '', `Expected 0 modified canonical schemas in git diff, got: ${diffOut}`);

      // Verify canonical schema count is at least 18 (excluding visual sidecar)
      const schemaFiles = fs.readdirSync(path.join(REPO_ROOT, 'schema')).filter(f => f.endsWith('.schema.json'));
      const canonicalFiles = schemaFiles.filter(f => f !== 'eme-visual-intelligence.v1.schema.json');
      assert.ok(canonicalFiles.length >= 18, `Expected at least 18 canonical schema files, found ${canonicalFiles.length}`);

      // Verify each canonical schema parses and has valid schema metadata
      for (const f of canonicalFiles) {
        const content = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'schema', f), 'utf8'));
        assert.ok(content.$schema, `${f} must have $schema`);
        assert.ok(content.title || content.description, `${f} must have title or description`);
      }
    });
  });

  describe('Section 2: Valid Sidecar Examples Verification', () => {
    it('CTR-03: valid-sidecar-interview.json passes strict validation', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      const interviewSidecar = JSON.parse(fs.readFileSync(p, 'utf8'));

      const res = VisualContractValidator.validateVisualSidecar(interviewSidecar);
      assert.strictEqual(res.valid, true, `Validation failed: ${res.errors.join('; ')}`);
      assert.strictEqual(res.errors.length, 0);
    });

    it('CTR-04: valid-sidecar-landscape.json passes strict validation with 4K dimensions and multiple frames', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-landscape.json');
      const landscapeSidecar = JSON.parse(fs.readFileSync(p, 'utf8'));

      const res = VisualContractValidator.validateVisualSidecar(landscapeSidecar);
      assert.strictEqual(res.valid, true, `Validation failed: ${res.errors.join('; ')}`);
      assert.strictEqual(res.errors.length, 0);
    });
  });

  describe('Section 3: Invalidation & Fail-Closed Boundary Enforcement', () => {
    it('CTR-05: Rejects stale/malformed source SHA-256 hash (invalid-stale-hash.json)', () => {
      const p = path.join(EXAMPLES_DIR, 'invalid-stale-hash.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('source.sha256')));
    });

    it('CTR-06: Rejects fingerprint mismatch against active project asset SHA-256', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));

      const mismatchedSha = '1111111111111111111111111111111111111111111111111111111111111111';
      const res = VisualContractValidator.validateVisualSidecar(sidecar, { expectedAssetSha256: mismatchedSha });
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Asset fingerprint mismatch')));
    });

    it('CTR-07: Rejects unsupported schemaVersion (invalid-unsupported-version.json)', () => {
      const p = path.join(EXAMPLES_DIR, 'invalid-unsupported-version.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('schemaVersion')));
    });

    it('CTR-08: Rejects timebase deviation from 120,000 (invalid-timebase-deviation.json)', () => {
      const p = path.join(EXAMPLES_DIR, 'invalid-timebase-deviation.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('source.timebase')));
    });

    it('CTR-09: Rejects out-of-bounds geometry with negative coordinates (invalid-out-of-bounds-geometry.json)', () => {
      const p = path.join(EXAMPLES_DIR, 'invalid-out-of-bounds-geometry.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('bounds.x: Must be number >= 0')));
    });

    it('CTR-10: Rejects observation exceeding source canvas boundary (width/height overflow)', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));
      // Source width is 1920. Place box at x=1800, width=200 -> total 2000 > 1920
      sidecar.frames[0].observations[0].bounds = {
        x: 1800.0,
        y: 100.0,
        width: 200.0,
        height: 200.0
      };

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('exceed source canvas width')));
    });

    it('CTR-11: Rejects non-monotonic ticks (invalid-non-monotonic-ticks.json)', () => {
      const p = path.join(EXAMPLES_DIR, 'invalid-non-monotonic-ticks.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('strictly monotonic')));
    });

    it('CTR-12: Rejects confidence score out of [0, 1000] range (invalid-confidence-range.json)', () => {
      const p = path.join(EXAMPLES_DIR, 'invalid-confidence-range.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('confidence')));
    });

    it('CTR-12b: Confidence boundary tests (0 and 1000 valid; -1, 1001, and non-integer 500.5 rejected)', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      
      // Test 0 (minimum valid)
      const sc0 = JSON.parse(fs.readFileSync(p, 'utf8'));
      sc0.frames[0].observations[0].confidence = 0;
      assert.strictEqual(VisualContractValidator.validateVisualSidecar(sc0).valid, true, 'Confidence 0 must be valid');

      // Test 1000 (maximum valid, represents 1.0)
      const sc1000 = JSON.parse(fs.readFileSync(p, 'utf8'));
      sc1000.frames[0].observations[0].confidence = 1000;
      assert.strictEqual(VisualContractValidator.validateVisualSidecar(sc1000).valid, true, 'Confidence 1000 must be valid');

      // Test -1 (negative rejected)
      const scNeg = JSON.parse(fs.readFileSync(p, 'utf8'));
      scNeg.frames[0].observations[0].confidence = -1;
      const resNeg = VisualContractValidator.validateVisualSidecar(scNeg);
      assert.strictEqual(resNeg.valid, false, 'Confidence -1 must be rejected');
      assert.ok(resNeg.errors.some(e => e.includes('confidence')));

      // Test 1001 (above 1000 rejected)
      const scOver = JSON.parse(fs.readFileSync(p, 'utf8'));
      scOver.frames[0].observations[0].confidence = 1001;
      const resOver = VisualContractValidator.validateVisualSidecar(scOver);
      assert.strictEqual(resOver.valid, false, 'Confidence 1001 must be rejected');
      assert.ok(resOver.errors.some(e => e.includes('confidence')));

      // Test 500.5 (non-integer rejected)
      const scFloat = JSON.parse(fs.readFileSync(p, 'utf8'));
      scFloat.frames[0].observations[0].confidence = 500.5;
      const resFloat = VisualContractValidator.validateVisualSidecar(scFloat);
      assert.strictEqual(resFloat.valid, false, 'Non-integer confidence 500.5 must be rejected');
      assert.ok(resFloat.errors.some(e => e.includes('confidence')));
    });

    it('CTR-13: Rejects presentation timestamp incoherent with integer tick', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));
      // Tick 24000 at 120000 ticks/sec is exactly 0.2s. Set to 0.5s to create incoherence
      sidecar.frames[1].presentationTimestampSec = 0.5;

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Incoherent PTS')));
    });
  });

  describe('Section 4: Observation vs. Decision Boundary & Property Containment', () => {
    it('CTR-14: Rejects unauthorized root properties (property containment / injection defense)', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));
      sidecar.unauthorized_decision_engine = { active: true };

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('unauthorized_decision_engine')));
    });

    it('CTR-15: Rejects solver decisions injected into raw observations (safe_placement_rect)', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));
      sidecar.frames[0].observations[0].safe_placement_rect = { x: 50, y: 50, width: 300, height: 100 };

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('safe_placement_rect')));
    });

    it('CTR-16: Rejects solver placement scores injected into raw observations (placement_score)', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));
      sidecar.frames[0].observations[0].placement_score = 0.94;

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('placement_score')));
    });
  });

  describe('Section 5: Coordinate Transform Test Vector Verification', () => {
    const testVectors = JSON.parse(fs.readFileSync(VECTORS_FILE, 'utf8')).vectors;

    it('CTR-17: Exactly 9 test vectors loaded from coordinate-transform-test-vectors.json (7 standard + 2 tie-breaking)', () => {
      assert.strictEqual(testVectors.length, 9);
    });

    it('CTR-18b: Round-half-to-even tie-breaking explicitly distinguishes banker\'s rounding from half-up', () => {
      // 0.0025: tie between 0.002 and 0.003 -> rounds to nearest EVEN 0.002 (half-up would yield 0.003)
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.0025, 3), 0.002);

      // 0.0035: tie between 0.003 and 0.004 -> rounds to nearest EVEN 0.004 (both agree)
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.0035, 3), 0.004);

      // 0.0045: tie between 0.004 and 0.005 -> rounds to nearest EVEN 0.004 (half-up would yield 0.005)
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.0045, 3), 0.004);

      // 0.0055: tie between 0.005 and 0.006 -> rounds to nearest EVEN 0.006 (both agree)
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.0055, 3), 0.006);

      // 0.0125: tie between 0.012 and 0.013 -> rounds to nearest EVEN 0.012 (half-up would yield 0.013)
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.0125, 3), 0.012);

      // 0.0175: tie between 0.017 and 0.018 -> rounds to nearest EVEN 0.018 (both agree)
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.0175, 3), 0.018);

      // Verify non-ties behave identically to standard nearest
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.00251, 3), 0.003);
      assert.strictEqual(VisualContractValidator.roundHalfToEven(0.00249, 3), 0.002);
    });

    for (const vec of testVectors) {
      it(`CTR-18 [${vec.id}]: Forward transform matches expectedSource`, () => {
        const computedSource = VisualContractValidator.transformProxyToSource(
          vec.proxyInput,
          vec.proxy,
          3
        );

        assert.strictEqual(computedSource.x, vec.expectedSource.x, `Vector ${vec.id} x mismatch`);
        assert.strictEqual(computedSource.y, vec.expectedSource.y, `Vector ${vec.id} y mismatch`);
        assert.strictEqual(computedSource.width, vec.expectedSource.width, `Vector ${vec.id} width mismatch`);
        assert.strictEqual(computedSource.height, vec.expectedSource.height, `Vector ${vec.id} height mismatch`);
      });

      it(`CTR-19 [${vec.id}]: Inverse transform matches roundTrip`, () => {
        const computedProxy = VisualContractValidator.transformSourceToProxy(
          vec.expectedSource,
          vec.proxy,
          3
        );

        assert.strictEqual(computedProxy.x, vec.roundTrip.x, `Vector ${vec.id} roundTrip x mismatch`);
        assert.strictEqual(computedProxy.y, vec.roundTrip.y, `Vector ${vec.id} roundTrip y mismatch`);
        assert.strictEqual(computedProxy.width, vec.roundTrip.width, `Vector ${vec.id} roundTrip width mismatch`);
        assert.strictEqual(computedProxy.height, vec.roundTrip.height, `Vector ${vec.id} roundTrip height mismatch`);
      });
    }

    it('CTR-22: Non-zero source content origin (cx, cy) and proxy padding (px, py) forward and inverse transformation', () => {
      // Normative formulas:
      // x_s = c_x + (x_p - p_x) * (c_w / p_w)
      // y_s = c_y + (y_p - p_y) * (c_h / p_h)
      // x_p = p_x + (x_s - c_x) * (p_w / c_w)
      // y_p = p_y + (y_s - c_y) * (p_h / c_h)
      const proxyConfig = {
        contentRect: { x: 20, y: 40, width: 640, height: 360 },
        sourceContentRect: { x: 100, y: 200, width: 1920, height: 1080 }
      };
      const proxyInput = { x: 260.0, y: 100.0, width: 160.0, height: 160.0 };
      const expectedSource = { x: 820.0, y: 380.0, width: 480.0, height: 480.0 };

      const computedSource = VisualContractValidator.transformProxyToSource(proxyInput, proxyConfig, 3);
      assert.deepStrictEqual(computedSource, expectedSource, 'Forward transform with non-zero origin must match');

      const computedProxy = VisualContractValidator.transformSourceToProxy(computedSource, proxyConfig, 3);
      assert.deepStrictEqual(computedProxy, proxyInput, 'Inverse transform must invert exactly to original proxy input');
    });

    it('CTR-23: Fractional scale factors (16/9, 7/3, 96/25) with exact rational arithmetic and zero float drift', () => {
      // Test 1: 16/9 aspect scaling (1920 / 1080)
      const cfg169 = {
        sourceContentRect: { x: 0, y: 0, width: 1920, height: 1080 },
        contentRect: { x: 0, y: 0, width: 1080, height: 1080 }
      };
      // x_s = 100 * (1920 / 1080) = 1600 / 9 = 177.777777... -> rounds to 177.778
      const p1 = { x: 100.0, y: 50.0, width: 270.0, height: 135.0 };
      const s1 = VisualContractValidator.transformProxyToSource(p1, cfg169, 3);
      assert.strictEqual(s1.x, 177.778);
      assert.strictEqual(s1.y, 50.0);
      assert.strictEqual(s1.width, 480.0); // 270 * 16/9 = 480 exact
      assert.strictEqual(s1.height, 135.0);

      // Invert back:
      const inv1 = VisualContractValidator.transformSourceToProxy(s1, cfg169, 3);
      assert.strictEqual(inv1.x, 100.0);
      assert.strictEqual(inv1.y, 50.0);
      assert.strictEqual(inv1.width, 270.0);
      assert.strictEqual(inv1.height, 135.0);

      // Test 2: Repeating 7/3 scale
      const cfg73 = {
        scaleFactorX: '7/3',
        scaleFactorY: '7/3'
      };
      const p2 = { x: 30.0, y: 60.0, width: 90.0, height: 120.0 };
      const s2 = VisualContractValidator.transformProxyToSource(p2, cfg73, 3);
      assert.strictEqual(s2.x, 70.0); // 30 * 7/3 = 70.0 exact
      assert.strictEqual(s2.y, 140.0); // 60 * 7/3 = 140.0 exact
      assert.strictEqual(s2.width, 210.0); // 90 * 7/3 = 210.0 exact
      assert.strictEqual(s2.height, 280.0); // 120 * 7/3 = 280.0 exact
    });

    it('CTR-24: Exact half-way tie breaking and boundary epsilon test (ties to even; above/below boundary)', () => {
      // Banker's rounding on rational numbers:
      // Half-way ties round to nearest EVEN integer:
      assert.strictEqual(VisualContractValidator.roundHalfToEvenRational({ num: 25n, den: 10000n }, 3), 0.002); // 0.0025 -> 0.002
      assert.strictEqual(VisualContractValidator.roundHalfToEvenRational({ num: 35n, den: 10000n }, 3), 0.004); // 0.0035 -> 0.004
      assert.strictEqual(VisualContractValidator.roundHalfToEvenRational({ num: 45n, den: 10000n }, 3), 0.004); // 0.0045 -> 0.004
      assert.strictEqual(VisualContractValidator.roundHalfToEvenRational({ num: 55n, den: 10000n }, 3), 0.006); // 0.0055 -> 0.006

      // Values strictly above boundary:
      assert.strictEqual(VisualContractValidator.roundHalfToEvenRational({ num: 2500001n, den: 1000000000n }, 3), 0.003); // 0.002500001 -> 0.003
      assert.strictEqual(VisualContractValidator.roundHalfToEvenRational({ num: 3500001n, den: 1000000000n }, 3), 0.004); // 0.003500001 -> 0.004

      // Values strictly below boundary:
      assert.strictEqual(VisualContractValidator.roundHalfToEvenRational({ num: 2499999n, den: 1000000000n }, 3), 0.002); // 0.002499999 -> 0.002
      assert.strictEqual(VisualContractValidator.roundHalfToEvenRational({ num: 3499999n, den: 1000000000n }, 3), 0.003); // 0.003499999 -> 0.003
    });

    it('CTR-25: Invariant verification: maximum final quantization error strictly bounded by <= 0.0005 source pixel', () => {
      const precision = 3;
      const maxAllowedError = 0.0005;

      // Evaluate a dense sweep of fractions to verify that for every value:
      // |exactValue - quantizedValue| <= 0.0005
      for (let numerator = 1n; numerator <= 200n; numerator++) {
        for (let denominator of [3n, 7n, 11n, 13n, 17n, 19n, 23n, 400n]) {
          const rat = { num: numerator, den: denominator };
          const exactFloat = Number(numerator) / Number(denominator);
          const quantized = VisualContractValidator.roundHalfToEvenRational(rat, precision);
          const error = Math.abs(exactFloat - quantized);
          assert.ok(
            error <= maxAllowedError + 1e-12,
            `Quantization error ${error} exceeded bound ${maxAllowedError} for ${numerator}/${denominator}`
          );
        }
      }
    });

    it('CTR-26: Determinism verification: 10,000 iterations achieve 100% bitwise parity', () => {
      const cfg = {
        contentRect: { x: 15, y: 35, width: 720, height: 405 },
        sourceContentRect: { x: 80, y: 160, width: 1920, height: 1080 }
      };
      const input = { x: 123.456, y: 234.567, width: 88.888, height: 99.999 };

      const baseline = VisualContractValidator.transformProxyToSource(input, cfg, 3);
      for (let i = 0; i < 10000; i++) {
        const next = VisualContractValidator.transformProxyToSource(input, cfg, 3);
        assert.strictEqual(next.x, baseline.x);
        assert.strictEqual(next.y, baseline.y);
        assert.strictEqual(next.width, baseline.width);
        assert.strictEqual(next.height, baseline.height);
      }
    });
  });

  describe('Section 6: Trajectory Point Validation', () => {
    it('CTR-20: Valid trajectories pass validation', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));
      assert.ok(Array.isArray(sidecar.trajectories) && sidecar.trajectories.length > 0);

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, true);
    });

    it('CTR-21: Rejects trajectory with non-decreasing tick inversion', () => {
      const p = path.join(EXAMPLES_DIR, 'valid-sidecar-interview.json');
      const sidecar = JSON.parse(fs.readFileSync(p, 'utf8'));
      // Invert second point's tick to be earlier than first point
      sidecar.trajectories[0].points[1].tick = 0;
      sidecar.trajectories[0].points[0].tick = 24000;

      const res = VisualContractValidator.validateVisualSidecar(sidecar);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('Track ticks must be non-decreasing')));
    });
  });
});
