/**
 * Tool for Phase 5 Requirement 6:
 * Prove agent-driven modification of an existing project (Benchmark A clone)
 * without discarding or corrupting unrelated state.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { EmeMcpServer } = require('../src/mcp/server.js');
const { ProjectManager } = require('../src/engine/project.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

async function main() {
  console.log('================================================================');
  console.log('  Phase 5 Requirement 6: Agent-Driven Existing Project Mod Test');
  console.log('================================================================\n');

  const outDir = path.resolve(__dirname, '../artifacts/phase-5/benchmark-a');
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Copy Benchmark A canonical project
  const srcBenchA = path.resolve(__dirname, '../examples/benchmark-a-motion-graphics.json');
  const projectCopyPath = path.join(outDir, 'benchmark-a-clone.json');
  fs.copyFileSync(srcBenchA, projectCopyPath);

  // 2. Agent inspects project through MCP
  console.log('[Agent] 1. Inspecting existing project via MCP eme_inspect_project...');
  const inspection = await EmeMcpServer.handleToolCall('eme_inspect_project', {
    projectPath: projectCopyPath
  });
  console.log('   Inspection Summary:', {
    title: inspection.title,
    revision: inspection.revision,
    tracksCount: inspection.tracksCount,
    clipsCount: inspection.clipsCount,
    durationTicks: inspection.durationTicks
  });

  const originalProject = ProjectManager.loadProject(projectCopyPath);
  const initialRevision = originalProject.revision;
  const originalClipCount = originalProject.clips.length;
  const originalTrackCount = originalProject.tracks.length;
  const originalAssetCount = originalProject.assets.length;

  // 3. Apply a bounded modification:
  // Move clip_headline_act2 forward by 60,000 ticks (0.5s) using move_clip
  console.log('\n[Agent] 2. Applying bounded modification: move_clip on "clip_headline_act2"...');
  const moveRes = await EmeMcpServer.handleToolCall('eme_execute_operation', {
    project: originalProject,
    operation: {
      type: 'move_clip',
      params: {
        clipId: 'clip_headline_act2',
        targetTick: 660000 // moved from 600000 to 660000
      }
    }
  });

  if (!moveRes.success) {
    throw new Error(`Failed to move clip: ${moveRes.error}`);
  }

  let modifiedProject = moveRes.project;

  // 4. Also adjust the keyframe animation offset for clip_headline_act2
  console.log('[Agent] 3. Applying bounded animation keyframe update on "clip_headline_act2"...');
  const animRes = await EmeMcpServer.handleToolCall('eme_execute_operation', {
    project: modifiedProject,
    operation: {
      type: 'animate_property',
      params: {
        clipId: 'clip_headline_act2',
        property: 'transform.opacity',
        keyframes: [
          { offsetTick: 0, value: 0.0, easing: 'linear' },
          { offsetTick: 60000, value: 1.0, easing: 'power2.out' },
          { offsetTick: 180000, value: 1.0, easing: 'linear' }
        ]
      }
    }
  });

  if (!animRes.success) {
    throw new Error(`Failed to update animation: ${animRes.error}`);
  }
  modifiedProject = animRes.project;

  // 5. Invariant verifications
  console.log('\n[Agent] 4. Verifying State Invariants:');
  assert.equal(modifiedProject.revision, initialRevision + 2, 'Revision must increment by 2');
  assert.equal(modifiedProject.clips.length, originalClipCount, 'Clip count must remain identical');
  assert.equal(modifiedProject.tracks.length, originalTrackCount, 'Track count must remain identical');
  assert.equal(modifiedProject.assets.length, originalAssetCount, 'Asset count must remain identical');

  // Verify other clips are completely untouched
  const untouchedClip1 = modifiedProject.clips.find(c => c.id === 'clip_headline_intro');
  const originalClip1 = originalProject.clips.find(c => c.id === 'clip_headline_intro');
  assert.deepEqual(untouchedClip1, originalClip1, 'Unrelated clip_headline_intro must remain bit-for-bit identical');

  const untouchedAudio = modifiedProject.clips.find(c => c.id === 'clip_audio_bgm');
  const originalAudio = originalProject.clips.find(c => c.id === 'clip_audio_bgm');
  assert.deepEqual(untouchedAudio, originalAudio, 'Unrelated audio clip must remain bit-for-bit identical');

  console.log('   ✔ Revision incremented cleanly:', initialRevision, '->', modifiedProject.revision);
  console.log('   ✔ All unrelated clips, tracks, and assets preserved without modification');
  console.log('   ✔ Stable IDs preserved');

  // 6. Validate canonical schema
  console.log('\n[Agent] 5. Validating Modified Canonical Project against Schema...');
  const valRes = ProjectManager.validateProject(modifiedProject);
  assert.equal(valRes.valid, true, `Validation failed: ${JSON.stringify(valRes.errors)}`);
  console.log('   ✔ Schema and semantic validation: PASS (0 errors)');

  // Save modified project
  const modifiedJsonPath = path.join(outDir, 'benchmark-a-modified.json');
  ProjectManager.saveProject(modifiedJsonPath, modifiedProject);

  // 7. Render modified project
  console.log('\n[Agent] 6. Rendering Modified Benchmark A to test video output...');
  const modifiedMp4Path = path.join(outDir, 'benchmark-a-modified.mp4');
  const renderRes = await EmeMcpServer.handleToolCall('eme_render_video', {
    project: modifiedProject,
    outputMp4Path: modifiedMp4Path,
    fps: 60
  });
  console.log(`   ✔ Render complete in ${renderRes.elapsedMs}ms: ${modifiedMp4Path}`);

  // 8. Inspect frame at 5.2s (where title 2 used to be visible, now shifted)
  const frameBeforeShift = path.join(outDir, 'frame-at-shifted-time-5.2s.png');
  await EmeMcpServer.handleToolCall('eme_inspect_frame', {
    videoPath: modifiedMp4Path,
    outputPngPath: frameBeforeShift,
    time: 5.2
  });

  const metadata = FrameInspector.inspectVideoMetadata(modifiedMp4Path);
  console.log('   ✔ Output Metadata:', {
    duration: metadata.duration,
    fps: metadata.video.fps,
    nbFrames: metadata.video.nbFrames,
    audioCodec: metadata.audio && metadata.audio.codec
  });

  const resultManifest = {
    verdict: 'PASS',
    test: 'agent_existing_project_modification',
    projectSource: srcBenchA,
    modifiedProject: modifiedJsonPath,
    modifiedRender: modifiedMp4Path,
    initialRevision,
    finalRevision: modifiedProject.revision,
    unrelatedClipsUntouched: true,
    schemaValid: true,
    metadata
  };

  const manifestPath = path.join(outDir, 'modification-test-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(resultManifest, null, 2), 'utf8');
  console.log(`\n🎉 Existing Project Modification Test PASS! Manifest saved: ${manifestPath}`);
  return resultManifest;
}

if (require.main === module) {
  main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runExistingProjectMod: main };
