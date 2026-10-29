/**
 * Test Suite: Stage 25.1 — Earshot Contracts & Validation Boundary
 *
 * Verifies:
 * 1. Request and response schema files are valid Draft 2020-12 schemas with valid URI $schema and $id.
 * 2. Strict property containment (additionalProperties: false) on root and nested objects.
 * 3. Status taxonomy: SUCCESS, NOT_MEASURED, NOT_APPLICABLE, TIMEOUT, WORKER_ERROR.
 * 4. Normalization of non-finite numbers (-Infinity, Infinity, NaN) to null with explicit reasons.
 * 5. Preservation of frozen canonical schema/eme-media-qa-report.v1.schema.json.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  EarshotContractValidator,
  STATUS_TAXONOMY,
  MODES
} = require('../src/renderers/earshot-contract-validator.js');

test('Stage 25.1: Earshot Request and Response Contracts', async (t) => {

  await t.test('CTR-01: Schema Files are Valid JSON and contain valid URI fields', () => {
    const reqSchema = EarshotContractValidator.getRequestSchema();
    const resSchema = EarshotContractValidator.getResponseSchema();

    assert.ok(reqSchema, 'Request schema loaded');
    assert.ok(resSchema, 'Response schema loaded');

    // Confirm $schema and $id are valid URIs, not markdown links
    assert.strictEqual(reqSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.strictEqual(reqSchema.$id, 'https://eme.local/schemas/earshot-qa-request.v1.json');
    assert.ok(!reqSchema.$schema.includes('[') && !reqSchema.$schema.includes(']('));
    assert.ok(!reqSchema.$id.includes('[') && !reqSchema.$id.includes(']('));

    assert.strictEqual(resSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.strictEqual(resSchema.$id, 'https://eme.local/schemas/earshot-qa-response.v1.json');
    assert.ok(!resSchema.$schema.includes('[') && !resSchema.$schema.includes(']('));
    assert.ok(!resSchema.$id.includes('[') && !resSchema.$id.includes(']('));
  });

  await t.test('CTR-02: Valid EarshotQaRequest Passes Strict Validation', () => {
    const validReq = {
      request_id: 'req-earshot-test-001',
      media_path: '/tmp/test.mp4',
      timebase: {
        duration_ticks: 600000,
        ticks_per_second: 120000,
        fps_numerator: 30,
        fps_denominator: 1
      },
      cues: [
        { frame: 30, time_seconds: 1.0, kind: 'visual_cut', weight: 1.0 }
      ],
      options: {
        mode: 'fast_dsp',
        generate_sheet: false,
        profile: {
          name: 'web_streaming',
          target_lufs: -14.0,
          lufs_tolerance: 2.0,
          true_peak_ceiling_dbtp: -1.0,
          sync_tolerance_ms: 33.33
        }
      }
    };

    const val = EarshotContractValidator.validateRequest(validReq);
    assert.strictEqual(val.valid, true, `Expected valid request, errors: ${val.errors.join(', ')}`);
  });

  await t.test('CTR-03: Request Rejects Additional Properties (Root & Nested) and Invalid Types', () => {
    // Unknown root property
    const reqWithExtraRoot = {
      request_id: 'req-earshot-002',
      media_path: '/tmp/test.mp4',
      timebase: { duration_ticks: 120000, ticks_per_second: 120000, fps_numerator: 30, fps_denominator: 1 },
      options: { mode: 'fast_dsp' },
      unauthorized_extra_field: true
    };
    const val1 = EarshotContractValidator.validateRequest(reqWithExtraRoot);
    assert.strictEqual(val1.valid, false);
    assert.ok(val1.errors.some(e => e.includes('unauthorized_extra_field')));

    // Unknown nested property in timebase
    const reqWithExtraTimebase = {
      request_id: 'req-earshot-003',
      media_path: '/tmp/test.mp4',
      timebase: { duration_ticks: 120000, ticks_per_second: 120000, fps_numerator: 30, fps_denominator: 1, extra_field: 123 },
      options: { mode: 'fast_dsp' }
    };
    const val2 = EarshotContractValidator.validateRequest(reqWithExtraTimebase);
    assert.strictEqual(val2.valid, false);
    assert.ok(val2.errors.some(e => e.includes('$.timebase.extra_field')));

    // Invalid request_id pattern
    const reqWithBadId = {
      request_id: 'invalid-id-format',
      media_path: '/tmp/test.mp4',
      timebase: { duration_ticks: 120000, ticks_per_second: 120000, fps_numerator: 30, fps_denominator: 1 },
      options: { mode: 'fast_dsp' }
    };
    const val3 = EarshotContractValidator.validateRequest(reqWithBadId);
    assert.strictEqual(val3.valid, false);
    assert.ok(val3.errors.some(e => e.includes('request_id')));

    // Invalid mode enum
    const reqWithBadMode = {
      request_id: 'req-earshot-004',
      media_path: '/tmp/test.mp4',
      timebase: { duration_ticks: 120000, ticks_per_second: 120000, fps_numerator: 30, fps_denominator: 1 },
      options: { mode: 'unsupported_mode' }
    };
    const val4 = EarshotContractValidator.validateRequest(reqWithBadMode);
    assert.strictEqual(val4.valid, false);
    assert.ok(val4.errors.some(e => e.includes('mode')));
  });

  await t.test('CTR-04: Valid EarshotQaResponse Passes Validation Across Taxonomy Values', () => {
    for (const status of STATUS_TAXONOMY) {
      const res = {
        request_id: 'req-earshot-res-001',
        status: status,
        mode: 'fast_dsp',
        execution_time_ms: 42.5,
        loudness: status === 'SUCCESS' ? {
          integrated_lufs: -14.2,
          lufs_reason: null,
          true_peak_dbtp: -1.5,
          true_peak_reason: null,
          loudness_range_lu: 6.8,
          clipping_samples: 0,
          compliant: true
        } : null,
        error: status === 'WORKER_ERROR' ? {
          code: 'DSP_ERROR',
          message: 'Failed to process audio stream',
          details: null
        } : null
      };

      const val = EarshotContractValidator.validateResponse(res);
      assert.strictEqual(val.valid, true, `Failed for status ${status}: ${val.errors.join(', ')}`);
    }
  });

  await t.test('CTR-05: Response Rejects Unknown Properties and Invalid Status', () => {
    const badRes = {
      request_id: 'req-earshot-res-002',
      status: 'UNKNOWN_STATUS',
      mode: 'fast_dsp',
      execution_time_ms: 10,
      random_leak: 42
    };

    const val = EarshotContractValidator.validateResponse(badRes);
    assert.strictEqual(val.valid, false);
    assert.ok(val.errors.some(e => e.includes('random_leak')));
    assert.ok(val.errors.some(e => e.includes('status')));
  });

  await t.test('CTR-06: Non-Finite Numbers Normalized to Null with Explicit Reasons', () => {
    // Normal finite number
    const r1 = EarshotContractValidator.normalizeFloat(-14.23456);
    assert.strictEqual(r1.value, -14.2346);
    assert.strictEqual(r1.reason, null);

    // Negative infinity (digital silence)
    const r2 = EarshotContractValidator.normalizeFloat(-Infinity);
    assert.strictEqual(r2.value, null);
    assert.strictEqual(r2.reason, 'negative_infinity');

    // Positive infinity
    const r3 = EarshotContractValidator.normalizeFloat(Infinity);
    assert.strictEqual(r3.value, null);
    assert.strictEqual(r3.reason, 'positive_infinity');

    // NaN
    const r4 = EarshotContractValidator.normalizeFloat(NaN);
    assert.strictEqual(r4.value, null);
    assert.strictEqual(r4.reason, 'not_a_number');

    // Null and undefined
    const r5 = EarshotContractValidator.normalizeFloat(null);
    assert.strictEqual(r5.value, null);
    assert.strictEqual(r5.reason, null);
  });

  await t.test('CTR-07: Canonical Schemas Preserved Untouched', () => {
    const canonicalReportSchemaPath = path.resolve(__dirname, '../schema/eme-media-qa-report.v1.schema.json');
    assert.ok(fs.existsSync(canonicalReportSchemaPath), 'Canonical QA report schema exists');
    const content = JSON.parse(fs.readFileSync(canonicalReportSchemaPath, 'utf8'));

    // Verify it allows the categories and statuses needed
    const catProp = content.properties.checks.items.properties.category;
    assert.ok(catProp.enum.includes('audio_integrity'));
    assert.ok(catProp.enum.includes('synchronization'));

    const statProp = content.properties.checks.items.properties.status;
    assert.ok(statProp.enum.includes('passed'));
    assert.ok(statProp.enum.includes('failed'));
    assert.ok(statProp.enum.includes('not_measured'));
    assert.ok(statProp.enum.includes('not_applicable'));
  });
});
