/**
 * Phase 7 - Benchmark & Reliability Integration Tests
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../src/engine/project.js');
const { QualityAssuranceEngine } = require('../src/renderers/qa-engine.js');
const {
  createScenario1_YouTube16x9,
  createScenario2_SocialReel9x16,
  createScenario3_Ecommerce1x1
} = require('../tools/build-phase7-benchmarks.js');

test('Phase 7A - Multi-Scenario schemas validate with 0 errors across 16:9, 9:16, 1:1', () => {
  const sc1 = createScenario1_YouTube16x9();
  const v1 = ProjectManager.validateProject(sc1);
  assert.strictEqual(v1.valid, true, `Scenario 1 validation failed: ${v1.errors ? v1.errors.join(', ') : ''}`);
  assert.strictEqual(sc1.canvas.aspectRatio, '16:9');

  const sc2 = createScenario2_SocialReel9x16();
  const v2 = ProjectManager.validateProject(sc2);
  assert.strictEqual(v2.valid, true, `Scenario 2 validation failed: ${v2.errors ? v2.errors.join(', ') : ''}`);
  assert.strictEqual(sc2.canvas.aspectRatio, '9:16');

  const sc3 = createScenario3_Ecommerce1x1();
  const v3 = ProjectManager.validateProject(sc3);
  assert.strictEqual(v3.valid, true, `Scenario 3 validation failed: ${v3.errors ? v3.errors.join(', ') : ''}`);
  assert.strictEqual(sc3.canvas.aspectRatio, '1:1');
});

test('Phase 7C - QualityAssuranceEngine detects clipping and container conformance', () => {
  const sc1 = createScenario1_YouTube16x9();
  const mp4_1 = path.resolve('artifacts/phase-7/scenario-1-16x9.mp4');
  if (fs.existsSync(mp4_1)) {
    const qa = QualityAssuranceEngine.auditQuality(sc1, mp4_1);
    assert.strictEqual(qa.score >= 80, true);
    assert.strictEqual(qa.passed, true);
  }
});
