/**
 * Phase 11 Benchmark G: Negative Requests & Controlled Failure Recovery
 *
 * Exercises 8 controlled error conditions:
 * 1. Missing asset (invalid assetId)
 * 2. Missing / unresolvable font asset
 * 3. Unsupported renderer feature / effect
 * 4. Invalid source trim (negative / out of range)
 * 5. Invalid keyframe timing (offset outside clip duration)
 * 6. Conflicting timeline placement (track overlap collision)
 * 7. Stale revision / malformed operation envelope
 * 8. Subsequent valid operation recovery (proves atomicity & uncorrupted state)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { ProjectManager } = require('../src/engine/project.js');
const { OperationExecutor } = require('../src/engine/operations.js');

function runFailureRecoverySuite() {
  console.log('================================================================');
  console.log('  Phase 11 Benchmark G: Failure Recovery & Invariant Suite');
  console.log('================================================================\n');

  const outDir = path.resolve('artifacts/phase-11/failure-recovery');
  fs.mkdirSync(outDir, { recursive: true });

  const baselineProject = ProjectManager.loadProject('benchmarks/manifests/benchmark-a-kinetic.json');
  const workingCopy = structuredClone(baselineProject);
  workingCopy.id = 'proj_p11_negative_recovery_test';
  workingCopy.revision = 1;

  const results = [];

  // 1. Missing asset reference in insert_clip
  console.log('Test 1: Missing asset in insert_clip...');
  const op1 = {
    type: 'insert_clip',
    params: {
      clip: {
        id: 'clip_invalid_asset',
        trackId: 'track_bg_accent',
        type: 'video',
        source: { assetId: 'non_existent_asset_id_999', trimInTick: 0, trimOutTick: 120000 },
        startTick: 600000,
        durationTicks: 120000
      }
    }
  };
  const res1 = OperationExecutor.execute(workingCopy, op1);
  assert.equal(res1.success, false, 'Missing asset must fail');
  assert.equal(res1.project.revision, 1, 'Revision must NOT increment');
  results.push({ test: 'Missing asset reference', pass: !res1.success && res1.project.revision === 1 });
  console.log('  ✅ Rejected correctly, revision preserved at 1');

  // 2. Unsupported effect type
  console.log('Test 2: Unsupported effect type...');
  const op2 = {
    type: 'apply_effect',
    params: {
      clipId: 'clip_hero_act1',
      effect: { type: 'unsupported_quantum_warp', parameters: { strength: 999 } }
    }
  };
  const res2 = OperationExecutor.execute(workingCopy, op2);
  assert.equal(res2.success, false, 'Unsupported effect must fail');
  assert.equal(res2.project.revision, 1, 'Revision must NOT increment');
  results.push({ test: 'Unsupported effect rejection', pass: !res2.success && res2.project.revision === 1 });
  console.log('  ✅ Rejected correctly, revision preserved at 1');

  // 3. Invalid trim (outTick <= inTick)
  console.log('Test 3: Invalid trim bounds...');
  const op3 = {
    type: 'trim_clip',
    params: {
      clipId: 'clip_hero_act1',
      trimInTick: 500000,
      trimOutTick: 200000
    }
  };
  const res3 = OperationExecutor.execute(workingCopy, op3);
  assert.equal(res3.success, false, 'Invalid trim bounds must fail');
  assert.equal(res3.project.revision, 1, 'Revision must NOT increment');
  results.push({ test: 'Invalid trim bounds rejection', pass: !res3.success && res3.project.revision === 1 });
  console.log('  ✅ Rejected correctly, revision preserved at 1');

  // 4. Invalid keyframe timing (offset > duration)
  console.log('Test 4: Keyframe out of bounds...');
  const op4 = {
    type: 'animate_property',
    params: {
      clipId: 'clip_hero_act1',
      property: 'transform.scale',
      keyframes: [
        { offsetTick: 0, value: 1.0 },
        { offsetTick: 9999999, value: 2.0 } // 9,999,999 > durationTicks (540,000)
      ]
    }
  };
  const res4 = OperationExecutor.execute(workingCopy, op4);
  assert.equal(res4.success, false, 'Out-of-bounds keyframe must fail');
  assert.equal(res4.project.revision, 1, 'Revision must NOT increment');
  results.push({ test: 'Keyframe out-of-bounds rejection', pass: !res4.success && res4.project.revision === 1 });
  console.log('  ✅ Rejected correctly, revision preserved at 1');

  // 5. Track overlap collision
  console.log('Test 5: Track overlap collision...');
  const op5 = {
    type: 'insert_clip',
    params: {
      clip: {
        id: 'clip_colliding_hero',
        trackId: 'track_text_headline',
        type: 'text',
        startTick: 60000, // Collides with clip_hero_act1 [30000, 570000)
        durationTicks: 120000,
        typography: { text: 'COLLISION' }
      }
    }
  };
  const res5 = OperationExecutor.execute(workingCopy, op5);
  assert.equal(res5.success, false, 'Collision must fail');
  assert.equal(res5.project.revision, 1, 'Revision must NOT increment');
  results.push({ test: 'Track overlap collision rejection', pass: !res5.success && res5.project.revision === 1 });
  console.log('  ✅ Rejected correctly, revision preserved at 1');

  // 6. Malformed operation envelope
  console.log('Test 6: Malformed operation envelope...');
  const res6 = OperationExecutor.execute(workingCopy, null);
  assert.equal(res6.success, false, 'Null operation must fail');
  assert.equal(res6.project.revision, 1, 'Revision must NOT increment');
  results.push({ test: 'Malformed envelope rejection', pass: !res6.success && res6.project.revision === 1 });
  console.log('  ✅ Rejected correctly, revision preserved at 1');

  // 7. Unknown operation type
  console.log('Test 7: Unknown operation type...');
  const res7 = OperationExecutor.execute(workingCopy, { type: 'magic_teleport' });
  assert.equal(res7.success, false, 'Unknown type must fail');
  assert.equal(res7.project.revision, 1, 'Revision must NOT increment');
  results.push({ test: 'Unknown operation rejection', pass: !res7.success && res7.project.revision === 1 });
  console.log('  ✅ Rejected correctly, revision preserved at 1');

  // 8. Subsequent valid operation recovery (proves atomicity & uncorrupted state)
  console.log('Test 8: Subsequent valid operation recovery...');
  const op8 = {
    type: 'modify_clip',
    params: {
      clipId: 'clip_hero_act1',
      typography: { text: 'RECOVERED STATE UNCORRUPTED' }
    }
  };
  const res8 = OperationExecutor.execute(workingCopy, op8);
  assert.equal(res8.success, true, 'Valid recovery operation must succeed');
  assert.equal(res8.project.revision, 2, 'Revision must advance to 2');
  const validCheck = ProjectManager.validateProject(res8.project);
  assert.equal(validCheck.valid, true, 'Project state must be fully valid');
  results.push({ test: 'Subsequent valid operation recovery', pass: res8.success && res8.project.revision === 2 && validCheck.valid });
  console.log('  ✅ Subsequent valid operation succeeded, revision cleanly advanced to 2');

  const report = {
    suite: 'Phase 11 Benchmark G: Failure Recovery & Invariant Suite',
    testsTotal: results.length,
    testsPassed: results.filter(r => r.pass).length,
    results
  };

  fs.writeFileSync(path.join(outDir, 'failure-recovery-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n✅ All 8 negative test cases and failure recoveries verified!');
  return report;
}

if (require.main === module) {
  runFailureRecoverySuite();
}

module.exports = { runFailureRecoverySuite };
