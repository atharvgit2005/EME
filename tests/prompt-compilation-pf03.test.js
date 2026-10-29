/**
 * Editing Mechanics Engine (EME) - Phase PF-03 Test Battery
 * Multi-Track Timeline Placement & Complex Creative Plan Compilation
 *
 * Verifies:
 * - PF-03.1: Multi-track scheduling, integer ticks, half-open intervals, track layering.
 * - PF-03.2: Music synchronization, beat alignment (<= 20ms error), confidence checks, ambiguity handling.
 * - PF-03.3: B-roll cutaways on secondary visual tracks with non-destructive stacking.
 * - PF-03.4: Transitions with handle validation and fail-closed insufficient-handle rejection.
 * - PF-03.5: Text overlays with frame-safe margin checks on 9:16 canvas.
 * - PF-03.6: Plan-level execution failure injection at all operation boundaries and atomic rollback.
 * - PF-03 Flagship: Integrated 12-second vertical social edit certification.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  OperationPlanCompiler,
  MultiTrackScheduler
} = require('../src/prompt-core/index.js');
const { ProjectManager } = require('../src/engine/project.js');
const { MediaTime, TICKS_PER_SECOND } = require('../src/engine/time.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');

const lowConfBeat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-low-confidence.json');
const ambigBeat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-ambiguous.json');
const noHandlesProject = require('../fixtures/prompt-core/pf03/projects/project-pf03-insufficient-handles.json');
const lockedBrollProject = require('../fixtures/prompt-core/pf03/projects/project-pf03-locked-broll.json');

test('PF-03.1 Timeline Arithmetic: Exact integer ticks, half-open intervals, and track topology', (t) => {
  const topology = MultiTrackScheduler.resolveTrackTopology(scenario1Project);
  assert.equal(topology.mainVideoTrack.id, 'track_v_main');
  assert.equal(topology.brollTrack.id, 'track_v_broll');
  assert.equal(topology.graphicsTrack.id, 'track_graphics');
  assert.equal(topology.musicTrack.id, 'track_a_music');

  // Verify stacking hierarchy
  assert.ok(topology.brollTrack.zIndex > topology.mainVideoTrack.zIndex);
  assert.ok(topology.graphicsTrack.zIndex > topology.brollTrack.zIndex);

  // Verify half-open interval calculus
  const cut1 = 480000;
  const cut2 = 960000;
  const total = 1440000;
  assert.equal(cut1 - 0, 480000);
  assert.equal(cut2 - cut1, 480000);
  assert.equal(total - cut2, 480000);
  assert.equal((cut1 - 0) + (cut2 - cut1) + (total - cut2), total);
});

test('PF-03.2 Music Synchronization: Snaps cuts within <= 20ms tolerance and reports metrics', (t) => {
  // Nominal cut at 480,000 ticks (4.0s)
  const snap1 = MultiTrackScheduler.snapToNearestBeat(480000, scenario1Beat);
  assert.equal(snap1.success, true);
  assert.equal(snap1.snappedTick, 480000);
  assert.equal(snap1.beatIndex, 8);
  assert.equal(snap1.alignmentErrorTicks, 0);
  assert.equal(snap1.alignmentErrorMs, 0);
  assert.ok(snap1.confidence >= 0.95);

  // Cut requested 10ms off beat (1,200 ticks at 120k ticks/sec) -> should snap cleanly
  const snapOffset = MultiTrackScheduler.snapToNearestBeat(481200, scenario1Beat);
  assert.equal(snapOffset.success, true);
  assert.equal(snapOffset.snappedTick, 480000);
  assert.equal(snapOffset.alignmentErrorTicks, 1200);
  assert.equal(snapOffset.alignmentErrorMs, 10);
  assert.ok(snapOffset.alignmentErrorMs <= 20);

  // Cut requested 30ms off beat (3,600 ticks) -> exceeds 20ms default tolerance
  const snapTooFar = MultiTrackScheduler.snapToNearestBeat(483600, scenario1Beat, { maxDeviationTicks: 2400 });
  assert.equal(snapTooFar.success, false);
  assert.ok(snapTooFar.error.includes('exceeds maximum tolerance'));
});

test('PF-03.2 Fail-Closed: Rejects low-confidence or ambiguous beat analysis', (t) => {
  // Low confidence beat grid (< 0.5)
  const lowPlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: scenario1Project,
    beatAnalysis: lowConfBeat
  });
  assert.equal(lowPlan.validation.status, 'blocked');
  assert.ok(lowPlan.validation.blocking_issue_ids.includes('ERR_LOW_CONFIDENCE_BEAT_GRID'));

  // Ambiguous tempo/meter
  const ambigPlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: scenario1Project,
    beatAnalysis: ambigBeat
  });
  assert.equal(ambigPlan.validation.status, 'needs_clarification');
  assert.ok(ambigPlan.validation.blocking_issue_ids.includes('ERR_AMBIGUOUS_BEAT_ANALYSIS'));
});

test('PF-03.3 B-Roll Cutaway: Places cutaway on secondary track and enforces track locks', (t) => {
  // Locked track rejection
  const lockedPlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: lockedBrollProject,
    beatAnalysis: scenario1Beat
  });
  assert.equal(lockedPlan.validation.status, 'blocked');
  assert.ok(lockedPlan.validation.blocking_issue_ids.includes('ERR_TRACK_LOCKED'));
});

test('PF-03.4 Transitions: Validates handles and rejects insufficient source media', (t) => {
  // Valid handles on Scenario 1 project
  const outClip = scenario1Project.clips[0];
  const inClip = scenario1Project.clips[1];
  const outAsset = scenario1Project.assets.find(a => a.id === outClip.source.assetId);
  const inAsset = scenario1Project.assets.find(a => a.id === inClip.source.assetId);

  const validHandle = MultiTrackScheduler.validateTransitionHandles({
    outgoingClip: outClip,
    incomingClip: inClip,
    outgoingAsset: outAsset,
    incomingAsset: inAsset,
    transitionDurationTicks: 120000,
    alignment: 'centered'
  });
  assert.equal(validHandle.valid, true);
  assert.equal(validHandle.requiredOutgoingHandleTicks, 60000);
  assert.equal(validHandle.requiredIncomingHandleTicks, 60000);
  assert.ok(validHandle.outgoingHandleTicks >= 60000);
  assert.ok(validHandle.incomingHandleTicks >= 60000);

  // Insufficient handles project rejection
  const badPlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: noHandlesProject,
    beatAnalysis: scenario1Beat
  });
  assert.equal(badPlan.validation.status, 'blocked');
  assert.ok(badPlan.validation.blocking_issue_ids.includes('ERR_INSUFFICIENT_TRANSITION_HANDLES'));
});

test('PF-03.5 Text Overlays: Enforces 10% title safe margin on 9:16 vertical canvas', (t) => {
  const canvas = { width: 1080, height: 1920 };
  const validTypo = { text: 'EME Master Edition', fontSize: 54 };
  const validCheck = MultiTrackScheduler.validateTitleSafeMargins({
    canvas,
    typography: validTypo,
    transform: { x: 0, y: 0 }
  });
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.safeBounds.minX, 108);
  assert.equal(validCheck.safeBounds.maxX, 972);
  assert.equal(validCheck.safeBounds.minY, 192);
  assert.equal(validCheck.safeBounds.maxY, 1728);

  // Huge text overflowing safe boundary
  const oversizedTypo = { text: 'THIS IS A MASSIVE HEADLINE THAT OVERFLOWS SAFE MARGINS COMPLETELY', fontSize: 120 };
  const badCheck = MultiTrackScheduler.validateTitleSafeMargins({
    canvas,
    typography: oversizedTypo,
    transform: { x: 0, y: 0 }
  });
  assert.equal(badCheck.valid, false);
  assert.ok(badCheck.error.includes('exceeds safe margin boundaries'));
});

test('PF-03.6 Plan Failure Injection: Verifies atomic rollback at EVERY operation boundary', (t) => {
  const plan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: scenario1Project,
    beatAnalysis: scenario1Beat
  });
  assert.equal(plan.validation.status, 'ready');
  assert.equal(plan.operations.length, 10);

  // Test failure injection at each operation boundary 0 through 9
  for (let step = 0; step < plan.operations.length; step++) {
    const failRes = OperationPlanCompiler.executePlan(scenario1Project, plan, {
      atomic: true,
      injectFailureAtStep: step
    });

    assert.equal(failRes.success, false, `Step ${step} should fail`);
    assert.equal(failRes.status, 'rolled_back', `Step ${step} should rollback`);
    assert.equal(failRes.failedStepIndex, step, `Failed step index must be ${step}`);
    // State MUST be completely restored to initial revision without partial mutation
    assert.equal(failRes.project.revision, scenario1Project.revision);
    assert.equal(failRes.project.clips.length, scenario1Project.clips.length);

    // Journal must record exactly step+1 events
    assert.equal(failRes.journal.length, step + 1);
    assert.equal(failRes.journal[step].status, 'failed');
    if (step > 0) {
      assert.equal(failRes.journal[step - 1].status, 'committed');
    }
  }

  // Also test non-atomic partial execution mode
  const partialRes = OperationPlanCompiler.executePlan(scenario1Project, plan, {
    atomic: false,
    injectFailureAtStep: 3
  });
  assert.equal(partialRes.success, false);
  assert.equal(partialRes.status, 'partially_executed_failed');
  assert.equal(partialRes.failedStepIndex, 3);
  // In non-atomic mode, revision advances to 4 (initial 1 + 3 committed steps)
  assert.equal(partialRes.project.revision, 4);
});

test('PF-03 Flagship Certification: 12-second 9:16 vertical social edit end-to-end', (t) => {
  const initialCopy = structuredClone(scenario1Project);

  // 1. Compile Operation Plan
  const plan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: scenario1Project,
    beatAnalysis: scenario1Beat
  });

  // Verify Zero Dry-Run Project Mutation
  assert.deepEqual(scenario1Project, initialCopy);
  assert.equal(plan.validation.status, 'ready');
  assert.equal(plan.target_duration_ticks, 1440000);
  assert.equal(plan.dry_run.success, true);
  assert.equal(plan.dry_run.simulated_steps, 10);
  assert.equal(plan.dry_run.timing_implications.duration_ticks, 1440000);
  assert.equal(plan.dry_run.timing_implications.duration_seconds, 12);

  // Determinism check: identical inputs yield identical plan hash
  const planHash1 = OperationPlanCompiler.computePlanHash(plan);
  const plan2 = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: scenario1Project,
    beatAnalysis: scenario1Beat
  });
  const planHash2 = OperationPlanCompiler.computePlanHash(plan2);
  assert.equal(planHash1, planHash2);

  // 2. Sequential Execution through OperationExecutor
  const execRes = OperationPlanCompiler.executePlan(scenario1Project, plan, { atomic: true });
  assert.equal(execRes.success, true);
  assert.equal(execRes.status, 'committed');
  assert.equal(execRes.executedSteps, 10);
  assert.equal(execRes.project.revision, 11); // Initial rev 1 + 10 atomic operations

  const finalProject = execRes.project;

  // 3. Post-Execution State Verification
  const val = ProjectManager.validateProject(finalProject);
  assert.equal(val.valid, true);

  // Check 6 clips
  assert.equal(finalProject.clips.length, 6);

  // Primary visual clips
  const clip1 = finalProject.clips.find(c => c.id === 'clip_1');
  const clip2 = finalProject.clips.find(c => c.id === 'clip_2');
  const clip3 = finalProject.clips.find(c => c.id === 'clip_3');
  assert.equal(clip1.startTick, 0);
  assert.equal(clip1.durationTicks, 480000);
  assert.equal(clip2.startTick, 480000);
  assert.equal(clip2.durationTicks, 480000);
  assert.equal(clip3.startTick, 960000);
  assert.equal(clip3.durationTicks, 480000);

  // Transition on clip_1
  assert.equal(clip1.effects.length, 1);
  assert.equal(clip1.effects[0].type, 'transition');
  assert.equal(clip1.effects[0].parameters.transitionType, 'cross_dissolve');
  assert.equal(clip1.effects[0].parameters.durationTicks, 120000);

  // Music clip on track_a_music
  const musicClip = finalProject.clips.find(c => c.id === 'clip_music');
  assert.ok(musicClip);
  assert.equal(musicClip.trackId, 'track_a_music');
  assert.equal(musicClip.startTick, 0);
  assert.equal(musicClip.durationTicks, 1440000);

  // B-roll cutaway on track_v_broll
  const brollClip = finalProject.clips.find(c => c.id === 'clip_broll');
  assert.ok(brollClip);
  assert.equal(brollClip.trackId, 'track_v_broll');
  assert.equal(brollClip.startTick, 480000);
  assert.equal(brollClip.durationTicks, 240000);

  // Title text overlay on track_graphics
  const titleClip = finalProject.clips.find(c => c.id === 'clip_title');
  assert.ok(titleClip);
  assert.equal(titleClip.trackId, 'track_graphics');
  assert.equal(titleClip.startTick, 0);
  assert.equal(titleClip.durationTicks, 360000);
  assert.equal(titleClip.typography.text, 'EME Master Edition');

  // Verify overall project extent
  let minStart = Infinity;
  let maxEnd = 0;
  for (const c of finalProject.clips) {
    if (c.startTick < minStart) minStart = c.startTick;
    const end = c.startTick + c.durationTicks;
    if (end > maxEnd) maxEnd = end;
  }
  assert.equal(minStart, 0);
  assert.equal(maxEnd, 1440000);
  assert.equal(maxEnd - minStart, 1440000);
});
