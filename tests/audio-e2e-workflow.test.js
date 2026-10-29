/**
 * EME Audio Intelligence - Phase A5 End-to-End Workflow Integration Test
 * Validates the complete pipeline: Audio Ingest -> Beat Analysis -> Actor Plan -> Atomic Execution -> SFX Mixing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AudioIntelligenceFacade } = require('../src/audio/facade.js');
const { validateObject } = require('../src/engine/validator.js');
const { decodeWav } = require('../src/audio/beat/audio-ingest.js');

const PROJECT_SCHEMA = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../schema/eme-project.v1.schema.json'), 'utf8')
);

function createMockE2EProject() {
  return {
    id: 'proj-e2e-audio',
    schemaVersion: '1.0.0',
    revision: 1,
    title: 'Audio E2E Workflow Project',
    canvas: { width: 1080, height: 1920, aspectRatio: '9:16' },
    timebase: {
      fps: { numerator: 60, denominator: 1 },
      ticksPerSecond: 120000,
      durationTicks: 480000, // 4 seconds
      endpointConvention: 'half-open'
    },
    assets: [
      { id: 'asset-video-main', type: 'video', src: '/mock/main_video.mp4', durationTicks: 480000 }
    ],
    tracks: [
      { id: 'track-v1', type: 'video', kind: 'visual', name: 'Primary Video', zIndex: 1, locked: false }
    ],
    clips: [
      {
        id: 'clip-main',
        type: 'video',
        trackId: 'track-v1',
        assetId: 'asset-video-main',
        startTick: 0,
        timelineStartTicks: 0,
        durationTicks: 480000
      }
    ],
    animations: [],
    timeline: {
      tracks: [
        {
          id: 'track-v1',
          type: 'video',
          kind: 'visual',
          name: 'Primary Video',
          zIndex: 1,
          locked: false,
          clips: [
            {
              id: 'clip-main',
              type: 'video',
              trackId: 'track-v1',
              assetId: 'asset-video-main',
              startTick: 0,
              timelineStartTicks: 0,
              durationTicks: 480000
            }
          ]
        }
      ]
    }
  };
}

test('A5.1 Full E2E Workflow: Beat Ingest -> Plan -> Atomic Execution -> SFX Compositing', () => {
  const sampleRate = 44100;
  const durationSeconds = 4.0;
  const totalSamples = Math.round(durationSeconds * sampleRate);
  const pcm = new Float32Array(totalSamples);

  // Synthesize 120 BPM beat track: 8 beats every 0.5s
  for (let b = 0; b < 8; b++) {
    const start = b * 22050;
    // Transient click + kick
    for (let s = start; s < Math.min(totalSamples, start + 3000); s++) {
      const t = (s - start) / sampleRate;
      const freq = b % 4 === 0 ? 60 : 120; // 60 Hz on downbeat
      pcm[s] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 20);
    }
  }

  // 1. Analyze Audio Track via Facade
  const analysisRes = AudioIntelligenceFacade.analyze({
    pcm,
    sampleRate,
    channels: 1
  });

  assert.equal(analysisRes.valid, true, `Analysis schema errors: ${JSON.stringify(analysisRes.errors)}`);
  assert.ok(Math.abs(analysisRes.analysis.tempo.bpm - 120) <= 1.0, `Detected BPM should be ~120, got ${analysisRes.analysis.tempo.bpm}`);
  assert.ok(analysisRes.analysis.events.beats.length >= 7, 'Should detect at least 7 beats');

  // 2. Plan Edits via Facade (Dry-Run)
  const project = createMockE2EProject();
  const planRes = AudioIntelligenceFacade.planEdits(analysisRes.analysis, project, {
    policy: 'social-short',
    dryRun: true
  });

  assert.equal(planRes.valid, true, `Plan schema errors: ${JSON.stringify(planRes.errors)}`);
  assert.equal(planRes.plan.dryRun, true);
  assert.ok(planRes.plan.cues.length > 0, 'Candidate cues should be generated');
  assert.ok(planRes.plan.compiledOperations.length > 0, 'EME operations should be compiled');

  // 3. Execute Edits via Facade (Atomic Execution)
  const execRes = AudioIntelligenceFacade.executeEdits(analysisRes.analysis, project, {
    policy: 'social-short'
  });

  assert.equal(execRes.valid, true);
  assert.ok(execRes.executionResult && execRes.executionResult.success, `Execution error: ${execRes.executionResult?.error}`);
  assert.ok(execRes.executionResult.committedCount > 0, 'Operations should be committed to project state');

  const modifiedProject = execRes.executionResult.project;

  // 4. Validate modified project against core EME schema
  const schemaErrors = validateObject(modifiedProject, PROJECT_SCHEMA, PROJECT_SCHEMA);
  assert.equal(schemaErrors.length, 0, `Modified project schema errors: ${JSON.stringify(schemaErrors)}`);

  // Verify clip was cleanly split
  assert.ok(modifiedProject.clips.length >= 2, 'Project should contain split clips');

  // 5. Generate Procedural SFX for Downbeat Cuts and Mix Audio
  const whooshWav = AudioIntelligenceFacade.generateSfx('whoosh', { durationSeconds: 0.4 });
  const impactWav = AudioIntelligenceFacade.generateSfx('impact', { durationSeconds: 0.8 });

  const whooshPcm = decodeWav(whooshWav).pcm;
  const impactPcm = decodeWav(impactWav).pcm;

  const mixRes = AudioIntelligenceFacade.mix([
    { pcm: whooshPcm, startSample: 0, gain: 0.7, pan: -0.5 },
    { pcm: impactPcm, startSample: 44100, gain: 0.9, pan: 0.0 }
  ], sampleRate * 4, { sampleRate: 48000 });

  assert.equal(mixRes.metrics.passedQa, true, 'Mixer output must pass true-peak QA');
  assert.ok(mixRes.metrics.finalPeakDb <= -0.9, 'Peak dB must remain below -0.9 dBFS');
  assert.ok(Buffer.isBuffer(mixRes.masterWav), 'Master audio must be a valid WAV buffer');
});
