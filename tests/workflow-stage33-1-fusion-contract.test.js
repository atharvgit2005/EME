/**
 * Test Suite: Stage 33.1 — Fusion Contracts, Time Alignment, and Policy Specification
 *
 * Verifies all Stage 33.1 architectural contracts mandated by Architecture Lead in Protocol AVCS-33:
 * - FUS-01: Exact Audio Sample-to-Ticks Conversion (44.1kHz, 48kHz, 96kHz)
 * - FUS-02: Exact Video Frame-to-Ticks Conversion (24fps, 29.97fps, 30fps, 59.94fps, 60fps)
 * - FUS-03: Deterministic Round-Half-to-Even Quantization on Temporal Ties
 * - FUS-04: Inverse Temporal Round-Trip Bounded Within 1 Canonical Tick
 * - FUS-05: Confidence Normalization: Standard Conversions (0.0 -> 0, 0.5 -> 500, 1.0 -> 1000)
 * - FUS-06: Confidence Normalization: Exact Half-Way Tie-to-Even Behavior
 * - FUS-07: Confidence Normalization: Boundary & Invalid Input Rejection
 * - FUS-08: Architectural Invariant Preservation: CTR-03 Observation Separation Guard
 * - FUS-09: Canonical Schema Freeze: 18 Canonical Schemas 100% Byte-Identical
 * - FUS-10: Auxiliary Schema Inventory: Exactly 7 Auxiliary Schemas (Total 25 Schemas)
 * - FUS-11: Runtime Dependency Boundary: package.json dependencies undefined
 * - FUS-12: Earshot Beat Analysis Contract Validation: Valid Sidecar
 * - FUS-13: Earshot Beat Analysis Contract Validation: Malformed Sidecar Rejection
 * - FUS-14: Phase 32 Visual Intelligence Contract Validation: Valid Sidecar
 * - FUS-15: Phase 32 Visual Intelligence Contract Validation: Malformed & Monotonicity Rejection
 * - FUS-16: Audio-Visual Fusion Evidence Contract Validation: Valid Envelope
 * - FUS-17: Audio-Visual Fusion Evidence Contract Validation: Unnormalized Float Rejection
 * - FUS-18: Freshness Verification (GATE-01): Fresh Evidence Accepted
 * - FUS-19: Freshness Verification (GATE-01): Stale Project Revision Rejection
 * - FUS-20: Freshness Verification (GATE-01): Stale Audio Media Digest Rejection
 * - FUS-21: Freshness Verification (GATE-01): Stale Visual Media Digest Rejection
 * - FUS-22: Deterministic Fingerprinting: Bitwise Identical Digest Across Instances
 * - FUS-23: Deterministic Serialization: Key-Ordering Invariance
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { FusionContractValidator } = require('../src/fusion/fusion-contract-validator');

const ROOT_DIR = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT_DIR, 'schema');
const STAGE_32_6_DIR = path.join(ROOT_DIR, 'artifacts/phase-32/stage-32.6');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

describe('Stage 33.1: Fusion Contracts, Time Alignment, and Policy Specification', () => {
  const validator = new FusionContractValidator();

  describe('Section 1: Exact Rational Temporal Arithmetic & Quantization', () => {
    test('FUS-01: Exact Audio Sample-to-Ticks Conversion (44.1kHz, 48kHz, 96kHz)', () => {
      // 48,000 Hz: 1 sample = 120,000 / 48,000 = 2.5 ticks -> exact integer ticks on even samples
      assert.strictEqual(validator.sampleToTicks(0, 48000), 0);
      assert.strictEqual(validator.sampleToTicks(48000, 48000), 120000); // 1.0 second
      assert.strictEqual(validator.sampleToTicks(24000, 48000), 60000);  // 0.5 second
      assert.strictEqual(validator.sampleToTicks(2, 48000), 5);          // 2 * 120000 / 48000 = 5.0 ticks

      // 96,000 Hz: 1 sample = 120,000 / 96,000 = 1.25 ticks
      assert.strictEqual(validator.sampleToTicks(0, 96000), 0);
      assert.strictEqual(validator.sampleToTicks(96000, 96000), 120000);
      assert.strictEqual(validator.sampleToTicks(4, 96000), 5); // 4 * 1.25 = 5.0 ticks

      // 44,100 Hz: 1 sample = 120,000 / 44,100 = 400 / 147 ticks
      assert.strictEqual(validator.sampleToTicks(0, 44100), 0);
      assert.strictEqual(validator.sampleToTicks(44100, 44100), 120000);
      assert.strictEqual(validator.sampleToTicks(147, 44100), 400); // 147 * (400/147) = 400 exact ticks
    });

    test('FUS-02: Exact Video Frame-to-Ticks Conversion (24fps, 29.97fps, 30fps, 59.94fps, 60fps)', () => {
      // 24 fps (24/1): 1 frame = 120000 / 24 = 5000 ticks exactly
      assert.strictEqual(validator.frameToTicks(0, 24, 1), 0);
      assert.strictEqual(validator.frameToTicks(1, 24, 1), 5000);
      assert.strictEqual(validator.frameToTicks(24, 24, 1), 120000);

      // 30 fps (30/1): 1 frame = 120000 / 30 = 4000 ticks exactly
      assert.strictEqual(validator.frameToTicks(1, 30, 1), 4000);
      assert.strictEqual(validator.frameToTicks(30, 30, 1), 120000);

      // 60 fps (60/1): 1 frame = 120000 / 60 = 2000 ticks exactly
      assert.strictEqual(validator.frameToTicks(1, 60, 1), 2000);
      assert.strictEqual(validator.frameToTicks(60, 60, 1), 120000);

      // 29.97 fps (30000/1001): 1 frame = 120000 * 1001 / 30000 = 4 * 1001 = 4004 ticks exactly!
      assert.strictEqual(validator.frameToTicks(0, 30000, 1001), 0);
      assert.strictEqual(validator.frameToTicks(1, 30000, 1001), 4004);
      assert.strictEqual(validator.frameToTicks(30000, 30000, 1001), 120120000);

      // 59.94 fps (60000/1001): 1 frame = 120000 * 1001 / 60000 = 2 * 1001 = 2002 ticks exactly!
      assert.strictEqual(validator.frameToTicks(1, 60000, 1001), 2002);
      assert.strictEqual(validator.frameToTicks(60000, 60000, 1001), 120120000);
    });

    test('FUS-03: Deterministic Round-Half-to-Even Quantization on Temporal Ties', () => {
      // At 48,000 Hz, sample 1 -> 1 * 120000 / 48000 = 2.5 ticks.
      // Tie at 2.5: nearest even integer is 2.
      assert.strictEqual(validator.sampleToTicks(1, 48000), 2);

      // sample 3 -> 3 * 120000 / 48000 = 7.5 ticks.
      // Tie at 7.5: nearest even integer is 8.
      assert.strictEqual(validator.sampleToTicks(3, 48000), 8);

      // sample 5 -> 5 * 2.5 = 12.5 ticks.
      // Tie at 12.5: nearest even integer is 12.
      assert.strictEqual(validator.sampleToTicks(5, 48000), 12);

      // sample 7 -> 7 * 2.5 = 17.5 ticks.
      // Tie at 17.5: nearest even integer is 18.
      assert.strictEqual(validator.sampleToTicks(7, 48000), 18);
    });

    test('FUS-04: Inverse Temporal Round-Trip Bounded Within 1 Canonical Tick', () => {
      const sampleRates = [44100, 48000, 96000];
      for (const sr of sampleRates) {
        for (let sample = 0; sample < 1000; sample += 37) {
          const ticks = validator.sampleToTicks(sample, sr);
          const recoveredSample = validator.ticksToSample(ticks, sr);
          const recoveredTicks = validator.sampleToTicks(recoveredSample, sr);
          assert.ok(Math.abs(ticks - recoveredTicks) <= 1, `Sample round-trip deviation > 1 tick at sr=${sr}, sample=${sample}`);
        }
      }
    });
  });

  describe('Section 2: Deterministic Confidence Normalization', () => {
    test('FUS-05: Confidence Normalization: Standard Conversions (0.0 -> 0, 0.5 -> 500, 1.0 -> 1000)', () => {
      assert.strictEqual(validator.normalizeAudioConfidence(0.0), 0);
      assert.strictEqual(validator.normalizeAudioConfidence(0.5), 500);
      assert.strictEqual(validator.normalizeAudioConfidence(1.0), 1000);
      assert.strictEqual(validator.normalizeAudioConfidence(0.95), 950);
      assert.strictEqual(validator.normalizeAudioConfidence(0.123), 123);
      assert.strictEqual(validator.normalizeAudioConfidence(0.876), 876);
    });

    test('FUS-06: Confidence Normalization: Exact Half-Way Tie-to-Even Behavior', () => {
      // 0.0005 * 1000 = 0.5 -> tie between 0 and 1 -> even is 0
      assert.strictEqual(validator.normalizeAudioConfidence(0.0005), 0);

      // 0.0015 * 1000 = 1.5 -> tie between 1 and 2 -> even is 2
      assert.strictEqual(validator.normalizeAudioConfidence(0.0015), 2);

      // 0.0025 * 1000 = 2.5 -> tie between 2 and 3 -> even is 2
      assert.strictEqual(validator.normalizeAudioConfidence(0.0025), 2);

      // 0.0035 * 1000 = 3.5 -> tie between 3 and 4 -> even is 4
      assert.strictEqual(validator.normalizeAudioConfidence(0.0035), 4);
    });

    test('FUS-07: Confidence Normalization: Boundary & Invalid Input Rejection', () => {
      assert.throws(() => validator.normalizeAudioConfidence(-0.01), /out of bounds/);
      assert.throws(() => validator.normalizeAudioConfidence(1.0001), /out of bounds/);
      assert.throws(() => validator.normalizeAudioConfidence(NaN), /must be finite number/);
      assert.throws(() => validator.normalizeAudioConfidence(Infinity), /must be finite number/);
      assert.throws(() => validator.normalizeAudioConfidence('0.5'), /must be finite number/);
      assert.throws(() => validator.normalizeAudioConfidence(null), /must be finite number/);
    });
  });

  describe('Section 3: Invariant Preservation (CTR-03, Canonical Schema Immutability, Dependencies)', () => {
    test('FUS-08: Architectural Invariant Preservation: CTR-03 Observation Separation Guard', () => {
      const cleanSidecar = {
        schemaVersion: 'eme-fusion-evidence.v1',
        frames: [{ tick: 0, faces: [{ faceId: 'f1', confidence: 950 }] }]
      };
      assert.doesNotThrow(() => validator.assertPureObservation(cleanSidecar));

      const corruptWithPlacementRect = {
        schemaVersion: 'eme-fusion-evidence.v1',
        safe_placement_rect: { x: 10, y: 10, width: 200, height: 100 }
      };
      assert.throws(() => validator.assertPureObservation(corruptWithPlacementRect), /CTR-03 Invariant Breach/);

      const corruptWithPlacementScore = {
        schemaVersion: 'eme-fusion-evidence.v1',
        frames: [{ tick: 0, placement_score: 98.5 }]
      };
      assert.throws(() => validator.assertPureObservation(corruptWithPlacementScore), /CTR-03 Invariant Breach/);

      const corruptWithOperationPlan = {
        schemaVersion: 'eme-fusion-evidence.v1',
        operationPlan: { operations: [] }
      };
      assert.throws(() => validator.assertPureObservation(corruptWithOperationPlan), /CTR-03 Invariant Breach/);
    });

    test('FUS-09: Canonical Schema Freeze: 18 Canonical Schemas 100% Byte-Identical', () => {
      const schemaRecon = JSON.parse(fs.readFileSync(path.join(STAGE_32_6_DIR, 'schema-inventory-reconciliation.json'), 'utf8'));
      assert.strictEqual(schemaRecon.canonical_schemas_count, 18);

      for (const item of schemaRecon.canonical_schemas) {
        const filePath = path.join(SCHEMA_DIR, item.filename);
        assert.ok(fs.existsSync(filePath), `Canonical schema ${item.filename} must exist`);
        const actualHash = fileSha256(filePath);
        assert.strictEqual(actualHash, item.sha256, `Byte mismatch in canonical schema ${item.filename}`);
      }
    });

    test('FUS-10: Auxiliary Schema Inventory: Exactly 7 Auxiliary Schemas (Total 25 Schemas)', () => {
      const auxiliaryList = [
        'eme-revision-run.v1.schema.json',
        'eme-revision-session.v1.schema.json',
        'eme-sfx-cue.v1.schema.json',
        'eme-source-analysis.v1.schema.json',
        'eme-vtsm-tracking.v1.schema.json',
        'eme-visual-intelligence.v1.schema.json',
        'eme-fusion-evidence.v1.schema.json' // Newly authorized in Phase 33 Stage 33.1
      ];

      for (const filename of auxiliaryList) {
        const filePath = path.join(SCHEMA_DIR, filename);
        assert.ok(fs.existsSync(filePath), `Auxiliary schema ${filename} must exist`);
      }

      const totalSchemas = fs.readdirSync(SCHEMA_DIR).filter(f => f.startsWith('eme-') && f.endsWith('.schema.json'));
      assert.strictEqual(totalSchemas.length, 25, 'Total schemas must be 18 canonical + 7 auxiliary = 25 schemas');
    });

    test('FUS-11: Runtime Dependency Boundary: package.json dependencies undefined', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
      assert.strictEqual(pkg.dependencies, undefined, 'package.json dependencies must be strictly undefined');
    });
  });

  describe('Section 4: Schema & Sidecar Contract Validation', () => {
    test('FUS-12: Earshot Beat Analysis Contract Validation: Valid Sidecar', () => {
      const validBeat = {
        schemaVersion: 'eme-beat-analysis.v1',
        analysisId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        source: {
          sha256: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
          sampleRate: 48000,
          channels: 2,
          durationSamples: 480000,
          durationTicks: 1200000
        },
        config: {
          algorithmVersion: '1.0.0',
          sampleRate: 48000,
          fftSize: 2048,
          hopLength: 512,
          window: 'hann',
          frameCenterConvention: 'center'
        },
        tempo: {
          bpm: 120,
          confidence: 0.95,
          alternativesBpm: [60, 240],
          isAmbiguous: false,
          phaseOffsetSamples: 0,
          phaseOffsetTicks: 0
        },
        events: {
          beats: [
            { id: 'b0', sampleIndex: 0, ticks: 0, confidence: 0.99, strength: 1.0 },
            { id: 'b1', sampleIndex: 24000, ticks: 60000, confidence: 0.92, strength: 0.8 }
          ],
          downbeats: [
            { id: 'db0', barIndex: 0, ticks: 0, confidence: 0.99 }
          ],
          onsets: [{ ticks: 0, strength: 1.0 }]
        }
      };

      const res = validator.validateBeatAnalysis(validBeat);
      assert.strictEqual(res.valid, true);
    });

    test('FUS-13: Earshot Beat Analysis Contract Validation: Malformed Sidecar Rejection', () => {
      const badVersion = { schemaVersion: 'invalid-v2' };
      assert.throws(() => validator.validateBeatAnalysis(badVersion), /Unsupported schemaVersion/);

      const badDigest = {
        schemaVersion: 'eme-beat-analysis.v1',
        analysisId: 'sha256:123',
        source: { sha256: 'not-64-hex', sampleRate: 48000, durationTicks: 120000 },
        events: { beats: [] }
      };
      assert.throws(() => validator.validateBeatAnalysis(badDigest), /Invalid source.sha256/);
    });

    test('FUS-14: Phase 32 Visual Intelligence Contract Validation: Valid Sidecar', () => {
      const validVisual = {
        schemaVersion: 'eme-visual-intelligence.v1',
        sidecarId: 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
        source: {
          assetId: 'asset_vis_01',
          sha256: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
          width: 1920,
          height: 1080,
          fps: { numerator: 24, denominator: 1 },
          durationTicks: 120000,
          timebase: { ticksPerSecond: 120000, intervalConvention: 'half-open' }
        },
        proxy: { width: 960, height: 540, contentRect: { x: 0, y: 0, width: 960, height: 540 } },
        producer: { name: 'vision-worker', version: '1.2.0', modelArchitecture: 'scrfd-500m' },
        coordinateSpace: { units: 'source_pixel', origin: 'top_left', precisionDecimals: 3 },
        frames: [
          {
            tick: 0,
            frameIndex: 0,
            faces: [{ faceId: 'f0', confidence: 950, box: { x: 500.0, y: 300.0, width: 200.0, height: 250.0 } }]
          },
          {
            tick: 5000,
            frameIndex: 1,
            faces: [{ faceId: 'f0', confidence: 960, box: { x: 502.0, y: 300.0, width: 200.0, height: 250.0 } }]
          }
        ]
      };

      const res = validator.validateVisualIntelligence(validVisual);
      assert.strictEqual(res.valid, true);
    });

    test('FUS-15: Phase 32 Visual Intelligence Contract Validation: Malformed & Monotonicity Rejection', () => {
      const nonMonotonic = {
        schemaVersion: 'eme-visual-intelligence.v1',
        sidecarId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        source: {
          assetId: 'asset_01',
          sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          width: 1920,
          height: 1080,
          fps: { numerator: 24, denominator: 1 },
          durationTicks: 120000,
          timebase: { ticksPerSecond: 120000, intervalConvention: 'half-open' }
        },
        frames: [
          { tick: 5000, frameIndex: 1 },
          { tick: 2000, frameIndex: 2 } // Non-monotonic
        ]
      };
      assert.throws(() => validator.validateVisualIntelligence(nonMonotonic), /Temporal monotonicity violated/);
    });

    test('FUS-16: Audio-Visual Fusion Evidence Contract Validation: Valid Envelope', () => {
      const validFusion = {
        schemaVersion: 'eme-fusion-evidence.v1',
        fusionId: 'sha256:aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
        provenance: {
          projectRevision: 2,
          audioSource: {
            assetId: 'audio_stem_01',
            sha256: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
            sampleRate: 48000,
            analysisId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            schemaVersion: 'eme-beat-analysis.v1'
          },
          visualSource: {
            assetId: 'visual_video_01',
            sha256: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
            width: 1920,
            height: 1080,
            fps: { numerator: 24, denominator: 1 },
            sidecarId: 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
            schemaVersion: 'eme-visual-intelligence.v1'
          }
        },
        timebase: {
          ticksPerSecond: 120000,
          durationTicks: 120000,
          intervalConvention: 'half-open'
        },
        policy: {
          policyVersion: 'avcs-policy-v1.0.0',
          confidenceNormalization: 'roundHalfToEven(1000 * c)'
        },
        audioObservations: {
          tempo: { bpm: 120, confidence: 950, isAmbiguous: false, phaseOffsetTicks: 0 },
          beats: [
            { id: 'b0', tick: 0, sampleIndex: 0, confidence: 990, strength: 1.0 },
            { id: 'b1', tick: 60000, sampleIndex: 24000, confidence: 920, strength: 0.8 }
          ],
          downbeats: [{ id: 'db0', tick: 0, barIndex: 0, confidence: 990 }],
          onsets: [{ tick: 0, strength: 1.0 }]
        },
        visualObservations: {
          coordinateSpace: { units: 'source_pixel', origin: 'top_left', precisionDecimals: 3 },
          frames: [
            {
              tick: 0,
              frameIndex: 0,
              faces: [{ faceId: 'f0', confidence: 950, box: { x: 500, y: 300, width: 200, height: 250 } }]
            }
          ]
        }
      };

      const res = validator.validateFusionEvidence(validFusion);
      assert.strictEqual(res.valid, true);
    });

    test('FUS-17: Audio-Visual Fusion Evidence Contract Validation: Unnormalized Float Rejection', () => {
      const unnormalizedFusion = {
        schemaVersion: 'eme-fusion-evidence.v1',
        fusionId: 'sha256:aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
        provenance: {
          projectRevision: 1,
          audioSource: {
            assetId: 'a1',
            sha256: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
            sampleRate: 48000,
            analysisId: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            schemaVersion: 'eme-beat-analysis.v1'
          },
          visualSource: {
            assetId: 'v1',
            sha256: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
            width: 1920,
            height: 1080,
            fps: { numerator: 24, denominator: 1 },
            sidecarId: 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
            schemaVersion: 'eme-visual-intelligence.v1'
          }
        },
        timebase: { ticksPerSecond: 120000, durationTicks: 120000, intervalConvention: 'half-open' },
        policy: { policyVersion: 'avcs-policy-v1.0.0', confidenceNormalization: 'roundHalfToEven(1000 * c)' },
        audioObservations: {
          beats: [
            { id: 'b0', tick: 0, sampleIndex: 0, confidence: 0.95 } // Floating point instead of integer [0, 1000]!
          ]
        }
      };

      assert.throws(() => validator.validateFusionEvidence(unnormalizedFusion), /must be normalized integer \[0, 1000\]/);
    });
  });

  describe('Section 5: Provenance & Freshness Verification (GATE-01)', () => {
    const freshPayload = {
      provenance: {
        projectRevision: 3,
        audioSource: { sha256: 'audio_hash_abc_1234567890abcdef1234567890abcdef1234567890abcdef1234' },
        visualSource: { sha256: 'visual_hash_xyz_1234567890abcdef1234567890abcdef1234567890abcdef1234' }
      }
    };

    test('FUS-18: Freshness Verification (GATE-01): Fresh Evidence Accepted', () => {
      const res = validator.verifyFreshness({
        fusionEvidence: freshPayload,
        currentProjectRevision: 3,
        currentAudioSha256: 'audio_hash_abc_1234567890abcdef1234567890abcdef1234567890abcdef1234',
        currentVisualSha256: 'visual_hash_xyz_1234567890abcdef1234567890abcdef1234567890abcdef1234'
      });
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.status, 'FRESH');
    });

    test('FUS-19: Freshness Verification (GATE-01): Stale Project Revision Rejection', () => {
      const res = validator.verifyFreshness({
        fusionEvidence: freshPayload,
        currentProjectRevision: 4, // Revision bumped
        currentAudioSha256: 'audio_hash_abc_1234567890abcdef1234567890abcdef1234567890abcdef1234',
        currentVisualSha256: 'visual_hash_xyz_1234567890abcdef1234567890abcdef1234567890abcdef1234'
      });
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.reason, 'STALE_PROJECT_REVISION');
    });

    test('FUS-20: Freshness Verification (GATE-01): Stale Audio Media Digest Rejection', () => {
      const res = validator.verifyFreshness({
        fusionEvidence: freshPayload,
        currentProjectRevision: 3,
        currentAudioSha256: 'different_audio_hash_1234567890abcdef1234567890abcdef1234567890abc',
        currentVisualSha256: 'visual_hash_xyz_1234567890abcdef1234567890abcdef1234567890abcdef1234'
      });
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.reason, 'STALE_AUDIO_MEDIA_DIGEST');
    });

    test('FUS-21: Freshness Verification (GATE-01): Stale Visual Media Digest Rejection', () => {
      const res = validator.verifyFreshness({
        fusionEvidence: freshPayload,
        currentProjectRevision: 3,
        currentAudioSha256: 'audio_hash_abc_1234567890abcdef1234567890abcdef1234567890abcdef1234',
        currentVisualSha256: 'different_visual_hash_1234567890abcdef1234567890abcdef1234567890ab'
      });
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.reason, 'STALE_VISUAL_MEDIA_DIGEST');
    });
  });

  describe('Section 6: Deterministic Serialization & Fingerprinting', () => {
    test('FUS-22: Deterministic Fingerprinting: Bitwise Identical Digest Across Instances', () => {
      const payload1 = {
        schemaVersion: 'eme-fusion-evidence.v1',
        timebase: { ticksPerSecond: 120000, durationTicks: 240000, intervalConvention: 'half-open' },
        beats: [{ tick: 0, confidence: 900 }, { tick: 60000, confidence: 850 }]
      };
      const payload2 = {
        beats: [{ tick: 0, confidence: 900 }, { tick: 60000, confidence: 850 }],
        timebase: { durationTicks: 240000, intervalConvention: 'half-open', ticksPerSecond: 120000 },
        schemaVersion: 'eme-fusion-evidence.v1'
      };

      const fp1 = validator.computeFusionFingerprint(payload1);
      const fp2 = validator.computeFusionFingerprint(payload2);

      assert.strictEqual(fp1, fp2);
      assert.ok(fp1.startsWith('sha256:'));
    });

    test('FUS-23: Deterministic Serialization: Key-Ordering Invariance', () => {
      const objA = { z: 1, a: 2, m: { y: 10, x: 20 } };
      const objB = { a: 2, m: { x: 20, y: 10 }, z: 1 };
      assert.strictEqual(validator.canonicalStringify(objA), validator.canonicalStringify(objB));
    });
  });
});
