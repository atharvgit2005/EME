const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../src/engine/project.js');

test('ProjectManager - Validate existing Benchmark A and Benchmark B examples', () => {
  const benchA = ProjectManager.loadProject('examples/benchmark-a-motion-graphics.json');
  assert.equal(benchA.id, 'proj_benchmark_a_motion_graphics');
  assert.equal(benchA.schemaVersion, '1.0.0');
  assert.equal(benchA.revision, 1);
  assert.equal(benchA.tracks.length, 5);
  assert.equal(benchA.clips.length, 6);

  const benchB = ProjectManager.loadProject('examples/benchmark-b-xray-compositing.json');
  assert.equal(benchB.id, 'proj_benchmark_b_xray_compositing');
  assert.equal(benchB.schemaVersion, '1.0.0');
  assert.equal(benchB.revision, 1);
  assert.equal(benchB.tracks.length, 3);
  assert.equal(benchB.clips.length, 3);
});

test('ProjectManager - Save and reload project preserves integrity', () => {
  const benchA = ProjectManager.loadProject('examples/benchmark-a-motion-graphics.json');
  const tempPath = path.resolve('artifacts/phase-3/test-roundtrip.json');
  ProjectManager.saveProject(tempPath, benchA);

  const reloaded = ProjectManager.loadProject(tempPath);
  assert.deepEqual(reloaded, benchA);
  fs.unlinkSync(tempPath);
});

test('ProjectManager - Invalid project structures fail validation', () => {
  // Missing required field
  const invalid1 = { schemaVersion: '1.0.0' };
  const res1 = ProjectManager.validateProject(invalid1);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some(e => e.includes('Missing required property')));

  // Negative revision
  const invalid2 = {
    ...ProjectManager.loadProject('examples/benchmark-a-motion-graphics.json'),
    revision: -1
  };
  const res2 = ProjectManager.validateProject(invalid2);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some(e => e.includes('Revision must be a non-negative integer')));

  // Clip referencing non-existent track
  const invalid3 = structuredClone(ProjectManager.loadProject('examples/benchmark-a-motion-graphics.json'));
  invalid3.clips[0].trackId = 'track-does-not-exist';
  const res3 = ProjectManager.validateProject(invalid3);
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some(e => e.includes('references non-existent trackId')));
});
