const test = require('node:test');
const assert = require('node:assert/strict');
const { OperationExecutor } = require('../src/engine/operations.js');

test('OperationExecutor - create_project, add_asset, add_track, insert_clip workflow', () => {
  // 1. Create project
  const res1 = OperationExecutor.execute({}, {
    type: 'create_project',
    params: {
      title: 'Test Project',
      width: 1080,
      height: 1920,
      fps: { numerator: 60, denominator: 1 },
      durationTicks: 360000
    }
  });
  assert.equal(res1.success, true, res1.error);
  assert.equal(res1.project.revision, 0);
  assert.equal(res1.project.title, 'Test Project');

  let project = res1.project;

  // 2. Add asset
  const res2 = OperationExecutor.execute(project, {
    type: 'add_asset',
    params: {
      id: 'font-instrument',
      type: 'font',
      src: 'assets/fonts/InstrumentSerif-Regular.ttf'
    }
  });
  assert.equal(res2.success, true, res2.error);
  assert.equal(res2.project.revision, 1);
  assert.equal(res2.project.assets.length, 1);
  project = res2.project;

  // 3. Add visual track
  const res3 = OperationExecutor.execute(project, {
    type: 'add_track',
    params: {
      id: 'track-text',
      kind: 'visual',
      zIndex: 10
    }
  });
  assert.equal(res3.success, true, res3.error);
  assert.equal(res3.project.revision, 2);
  assert.equal(res3.project.tracks.length, 1);
  project = res3.project;

  // 4. Insert text clip
  const res4 = OperationExecutor.execute(project, {
    type: 'insert_clip',
    params: {
      id: 'clip-title',
      trackId: 'track-text',
      type: 'text',
      startTick: 0,
      durationTicks: 120000,
      typography: { text: 'Hello World', fontSize: 96, fontAssetId: 'font-instrument' }
    }
  });
  assert.equal(res4.success, true, res4.error);
  assert.equal(res4.project.revision, 3);
  assert.equal(res4.project.clips.length, 1);
  project = res4.project;

  // 5. Animate property
  const res5 = OperationExecutor.execute(project, {
    type: 'animate_property',
    params: {
      clipId: 'clip-title',
      property: 'transform.opacity',
      keyframes: [
        { offsetTick: 0, value: 0, easing: 'linear' },
        { offsetTick: 30000, value: 1, easing: 'power2.out' }
      ]
    }
  });
  assert.equal(res5.success, true, res5.error);
  assert.equal(res5.project.revision, 4);
  assert.equal(res5.project.animations.length, 1);
});

test('OperationExecutor - Collision rejection and Atomicity guarantee', () => {
  // Start with a project that has a track and a clip [0, 100000)
  const initRes = OperationExecutor.execute({}, {
    type: 'create_project',
    params: { durationTicks: 300000 }
  });
  const trackRes = OperationExecutor.execute(initRes.project, {
    type: 'add_track',
    params: { id: 'v1', kind: 'visual', zIndex: 0 }
  });
  const clipRes = OperationExecutor.execute(trackRes.project, {
    type: 'insert_clip',
    params: { id: 'c1', trackId: 'v1', type: 'graphic', startTick: 0, durationTicks: 100000 }
  });
  const currentProject = clipRes.project;
  const originalRevision = currentProject.revision;

  // Attempt to insert overlapping clip [50000, 150000) on the same track
  const overlapRes = OperationExecutor.execute(currentProject, {
    type: 'insert_clip',
    params: { id: 'c2', trackId: 'v1', type: 'graphic', startTick: 50000, durationTicks: 100000 }
  });

  // Verify rejection
  assert.equal(overlapRes.success, false);
  assert.equal(overlapRes.errorCode, 'TRACK_COLLISION');

  // Verify ATOMICITY: original state is completely preserved
  assert.equal(currentProject.revision, originalRevision);
  assert.equal(currentProject.clips.length, 1);
  assert.equal(currentProject.clips.some(c => c.id === 'c2'), false);
});

test('OperationExecutor - split_clip and move_clip operations', () => {
  const initRes = OperationExecutor.execute({}, {
    type: 'create_project',
    params: { durationTicks: 300000 }
  });
  const trackRes = OperationExecutor.execute(initRes.project, {
    type: 'add_track',
    params: { id: 'v1', kind: 'visual', zIndex: 0 }
  });
  const clipRes = OperationExecutor.execute(trackRes.project, {
    type: 'insert_clip',
    params: { id: 'c1', trackId: 'v1', type: 'graphic', startTick: 0, durationTicks: 100000 }
  });
  let project = clipRes.project;

  // Split clip c1 at tick 40000 -> c1 [0, 40000) and c1_part2 [40000, 100000)
  const splitRes = OperationExecutor.execute(project, {
    type: 'split_clip',
    params: { clipId: 'c1', splitTick: 40000, newClipId: 'c1_part2' }
  });
  assert.equal(splitRes.success, true, splitRes.error);
  assert.equal(splitRes.project.clips.length, 2);
  const c1 = splitRes.project.clips.find(c => c.id === 'c1');
  const c2 = splitRes.project.clips.find(c => c.id === 'c1_part2');
  assert.equal(c1.durationTicks, 40000);
  assert.equal(c2.startTick, 40000);
  assert.equal(c2.durationTicks, 60000);
  project = splitRes.project;

  // Move c2 to tick 120000
  const moveRes = OperationExecutor.execute(project, {
    type: 'move_clip',
    params: { clipId: 'c1_part2', targetTick: 120000 }
  });
  assert.equal(moveRes.success, true, moveRes.error);
  const moved = moveRes.project.clips.find(c => c.id === 'c1_part2');
  assert.equal(moved.startTick, 120000);
});

test('OperationExecutor - apply_effect and set_audio_envelope', () => {
  const initRes = OperationExecutor.execute({}, {
    type: 'create_project',
    params: { durationTicks: 300000 }
  });
  const audioTrackRes = OperationExecutor.execute(initRes.project, {
    type: 'add_track',
    params: { id: 'a1', kind: 'audio', zIndex: 0 }
  });
  const audioClipRes = OperationExecutor.execute(audioTrackRes.project, {
    type: 'insert_clip',
    params: { id: 'audio-bgm', trackId: 'a1', type: 'audio', startTick: 0, durationTicks: 120000 }
  });
  let project = audioClipRes.project;

  // Set audio envelope
  const envRes = OperationExecutor.execute(project, {
    type: 'set_audio_envelope',
    params: {
      clipId: 'audio-bgm',
      volumeKeyframes: [
        { offsetTick: 0, volume: 0.0 },
        { offsetTick: 24000, volume: 1.0 },
        { offsetTick: 120000, volume: 0.0 }
      ]
    }
  });
  assert.equal(envRes.success, true, envRes.error);
  assert.equal(envRes.project.clips[0].audio.volumeEnvelope.length, 3);
  project = envRes.project;

  // Out-of-bounds audio keyframe must fail and preserve state
  const badEnvRes = OperationExecutor.execute(project, {
    type: 'set_audio_envelope',
    params: {
      clipId: 'audio-bgm',
      volumeKeyframes: [
        { offsetTick: 200000, volume: 1.0 } // > durationTicks (120000)
      ]
    }
  });
  assert.equal(badEnvRes.success, false);
  assert.equal(badEnvRes.errorCode, 'KEYFRAME_OUT_OF_BOUNDS');
});

test('OperationExecutor - delete_clip, ripple_delete, and reorder_tracks', () => {
  // Create project with 2 tracks and 3 clips on track 1
  const init = OperationExecutor.execute({}, {
    type: 'create_project',
    params: { durationTicks: 600000 }
  }).project;

  const withTracks = OperationExecutor.execute(
    OperationExecutor.execute(init, {
      type: 'add_track',
      params: { id: 't1', kind: 'visual', zIndex: 0 }
    }).project,
    {
      type: 'add_track',
      params: { id: 't2', kind: 'visual', zIndex: 1 }
    }
  ).project;

  // Insert clip A [0, 100000), B [100000, 200000), C [200000, 300000)
  let proj = withTracks;
  proj = OperationExecutor.execute(proj, {
    type: 'insert_clip',
    params: { id: 'clip-a', trackId: 't1', type: 'graphic', startTick: 0, durationTicks: 100000 }
  }).project;
  proj = OperationExecutor.execute(proj, {
    type: 'insert_clip',
    params: { id: 'clip-b', trackId: 't1', type: 'graphic', startTick: 100000, durationTicks: 100000 }
  }).project;
  proj = OperationExecutor.execute(proj, {
    type: 'insert_clip',
    params: { id: 'clip-c', trackId: 't1', type: 'graphic', startTick: 200000, durationTicks: 100000 }
  }).project;

  // 1. Test reorder_tracks
  const reorderRes = OperationExecutor.execute(proj, {
    type: 'reorder_tracks',
    params: {
      trackOrders: [
        { trackId: 't1', zIndex: 5 },
        { trackId: 't2', zIndex: 2 }
      ]
    }
  });
  assert.equal(reorderRes.success, true);
  assert.equal(reorderRes.project.tracks.find(t => t.id === 't1').zIndex, 5);
  assert.equal(reorderRes.project.tracks.find(t => t.id === 't2').zIndex, 2);
  proj = reorderRes.project;

  // 2. Test ripple_delete on clip-b [100000, 200000)
  // clip-c was at startTick 200000, should ripple shift left to startTick 100000!
  const rippleRes = OperationExecutor.execute(proj, {
    type: 'ripple_delete',
    params: { clipId: 'clip-b' }
  });
  assert.equal(rippleRes.success, true);
  assert.equal(rippleRes.project.clips.length, 2);
  assert.equal(rippleRes.project.clips.some(c => c.id === 'clip-b'), false);
  const shiftedClipC = rippleRes.project.clips.find(c => c.id === 'clip-c');
  assert.equal(shiftedClipC.startTick, 100000);
  proj = rippleRes.project;

  // 3. Test delete_clip on clip-a
  const deleteRes = OperationExecutor.execute(proj, {
    type: 'delete_clip',
    params: { clipId: 'clip-a' }
  });
  assert.equal(deleteRes.success, true);
  assert.equal(deleteRes.project.clips.length, 1);
  assert.equal(deleteRes.project.clips[0].id, 'clip-c');
});

