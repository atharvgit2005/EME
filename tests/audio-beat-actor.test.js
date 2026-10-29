/**
 * EME Audio Intelligence - Phase A3 Beat Actor Tests
 * Tests dry-run editorial planning, policy enforcement, cue collision resolution, and atomic execution.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { planBeatEdits } = require('../src/audio/actor/index.js');

function createMockProject(options = {}) {
  return {
    id: 'proj-test',
    schemaVersion: '1.0.0',
    revision: 1,
    title: 'Beat Actor Test Project',
    canvas: { width: 1080, height: 1920, aspectRatio: '9:16' },
    timebase: {
      fps: { numerator: 60, denominator: 1 },
      ticksPerSecond: 120000,
      durationTicks: 480000,
      endpointConvention: 'half-open'
    },
    assets: [
      { id: 'asset-video-1', type: 'video', src: '/mock/video1.mp4', durationTicks: 480000 }
    ],
    tracks: [
      { id: 'track-v1', type: 'video', kind: 'visual', name: 'Video 1', zIndex: 1, locked: options.locked || false }
    ],
    clips: [
      {
        id: 'clip-1',
        type: 'video',
        trackId: 'track-v1',
        assetId: 'asset-video-1',
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
          name: 'Video 1',
          zIndex: 1,
          locked: options.locked || false,
          clips: [
            {
              id: 'clip-1',
              type: 'video',
              trackId: 'track-v1',
              assetId: 'asset-video-1',
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

function createMockAnalysis() {
  return {
    schemaVersion: 'eme-beat-analysis.v1',
    analysisId: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    source: {
      sha256: 'a'.repeat(64),
      sampleRate: 44100,
      channels: 2,
      durationSamples: 176400,
      durationTicks: 480000
    },
    config: {
      algorithmVersion: '1.0.0',
      sampleRate: 44100,
      fftSize: 2048,
      hopLength: 441,
      window: 'hann',
      frameCenterConvention: 'centered'
    },
    tempo: {
      bpm: 120,
      confidence: 0.95,
      alternativesBpm: [60],
      isAmbiguous: false,
      phaseOffsetSamples: 0,
      phaseOffsetTicks: 0
    },
    meter: { numerator: 4, denominator: 4, confidence: 0.9 },
    events: {
      beats: [
        { id: 'beat-1', sampleIndex: 0, ticks: 0, confidence: 0.95, strength: 0.9 },
        { id: 'beat-2', sampleIndex: 22050, ticks: 60000, confidence: 0.95, strength: 0.5 },
        { id: 'beat-3', sampleIndex: 44100, ticks: 120000, confidence: 0.95, strength: 0.7 },
        { id: 'beat-4', sampleIndex: 66150, ticks: 180000, confidence: 0.95, strength: 0.5 },
        { id: 'beat-5', sampleIndex: 88200, ticks: 240000, confidence: 0.95, strength: 0.95 }
      ],
      downbeats: [
        { id: 'downbeat-1', barIndex: 0, ticks: 0, confidence: 0.95 },
        { id: 'downbeat-2', barIndex: 1, ticks: 240000, confidence: 0.95 }
      ],
      onsets: [],
      sections: [
        { id: 'sec-drop', type: 'drop', startTicks: 240000, endTicks: 480000, confidence: 0.9 }
      ]
    }
  };
}

test('A3.1 Beat Actor Dry-Run: Validates against eme-beat-actor-plan.v1.schema.json without project mutations', () => {
  const project = createMockProject();
  const analysis = createMockAnalysis();

  const res = planBeatEdits(analysis, project, { policy: 'social-short', dryRun: true });

  assert.equal(res.valid, true, `Plan should pass schema validation: ${JSON.stringify(res.errors)}`);
  assert.equal(res.plan.schemaVersion, 'eme-beat-actor-plan.v1');
  assert.equal(res.plan.dryRun, true);
  assert.ok(res.plan.compiledOperations.length > 0, 'Compiled operations should be non-empty');
  assert.equal(project.revision, 1, 'Project snapshot must remain unmodified in dryRun');
});

test('A3.2 Locked Track Rejection: Fails closed with REJECTED_TRACK_LOCKED on locked tracks', () => {
  const project = createMockProject({ locked: true });
  const analysis = createMockAnalysis();

  const res = planBeatEdits(analysis, project, { policy: 'social-short', dryRun: true });

  assert.equal(res.valid, true);
  assert.equal(res.plan.cues.length, 0, 'No cues should be accepted on a locked track');
  assert.ok(res.plan.diagnostics.length > 0, 'Diagnostics should record rejection');
  assert.equal(res.plan.diagnostics[0].code, 'REJECTED_TRACK_LOCKED');
});

test('A3.3 Policy Divergence: Cinematic policy rejects strobe flashes while Social Short accepts', () => {
  const project = createMockProject();
  const analysis = createMockAnalysis();

  const socialRes = planBeatEdits(analysis, project, { policy: 'social-short', dryRun: true });
  const cinematicRes = planBeatEdits(analysis, project, { policy: 'cinematic', dryRun: true });

  const socialFlashes = socialRes.plan.cues.filter(c => c.type === 'accent_flash');
  const cinematicFlashes = cinematicRes.plan.cues.filter(c => c.type === 'accent_flash');

  assert.ok(socialFlashes.length > 0, 'Social Short should include accent flashes on drops');
  assert.equal(cinematicFlashes.length, 0, 'Cinematic policy must reject all strobe flashes');

  const flashRejection = cinematicRes.plan.diagnostics.find(d => d.code === 'REJECTED_POLICY_RESTRICTION');
  assert.ok(flashRejection, 'Cinematic diagnostics must explicitly report flash rejection');
});

test('A3.4 Atomic Execution: Non-dryRun applies split_clip on downbeat atomically', () => {
  const project = createMockProject();
  const analysis = createMockAnalysis();

  const res = planBeatEdits(analysis, project, { policy: 'social-short', dryRun: false });

  assert.equal(res.valid, true);
  assert.ok(res.executionResult && res.executionResult.success, 'Execution should succeed');
  assert.ok(res.executionResult.committedCount > 0, 'At least 1 operation committed');

  const modifiedProject = res.executionResult.project;
  assert.ok(modifiedProject.clips.length >= 2, 'Clip should have been split into at least 2 clips');
  const secondClip = modifiedProject.clips.find(c => c.startTick === 240000);
  assert.ok(secondClip, 'Second clip must start exactly at downbeat 240,000 ticks');
});
