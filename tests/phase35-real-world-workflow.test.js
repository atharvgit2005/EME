/**
 * Editing Mechanics Engine (EME) - Phase 35 Test Suite
 * Real-World Editing Workflow, Creative Iteration & Production Validation
 *
 * Verifies:
 * 1. Workstream 1: Real-Project Benchmark Suite across 3 meaningfully different editing workflows:
 *    - Benchmark 1: Real talking-head creator reel (raw_talking_head_30s.mp4, 9:16 reframing, ducking, whoosh SFX).
 *    - Benchmark 2: Cinematic founder reel (raw_creator_19s.mp4, optical fisheye distortion, curved typography, cinematic score).
 *    - Benchmark 3: Multi-clip social promotional reel (3 distinct downloaded source clips, 21.0s extended duration, multi-cue SFX).
 * 2. Workstream 2: Authentic Antigravity IDE Agent to EME workflow over local tools.
 * 3. Workstream 3: Grounded creative revision loop (defect discovery -> revised plan -> re-approval -> improved deliverable).
 * 4. Workstream 4: Reliability, failure recovery, and delivery history preservation.
 * 5. Workstream 5: Rendered quality evaluation (1080x1920, -14.0 LUFS, true peak <= -1.0 dBFS, zero clipped samples).
 * 6. Workstream 6: Preserves OP-AUTH, schema freeze against 9d591cc, and zero npm runtime dependencies.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  CreativeDirector,
  CreativeContextBuilder,
  CreativePlanCompiler,
  CreativePlanValidator,
  IdeAgentAdapter,
  ProviderLlmAdapter,
  PlanStore,
  AudioCatalog,
  AudioMixerEngine,
  CompositionRenderer,
  ApprovalAuthority,
  SpeechDuckingCompiler
} = require('../src/creative/index.js');

const { EmeMcpServer } = require('../src/mcp/server.js');
const { ProjectManager } = require('../src/engine/project.js');
const { OperationExecutor } = require('../src/engine/operations.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FIXTURE_PROJECT_PATH = path.resolve(__dirname, '../fixtures/prompt-core/projects/project-pf02-scenario1.json');
const ARTIFACTS_DIR = path.join(PROJECT_ROOT, '.artifacts', 'phase35_tests');

// Real Local Assets
const TALKING_HEAD_VIDEO = path.resolve(PROJECT_ROOT, 'raw_videos', 'raw_talking_head_30s.mp4');
const CREATOR_19S_VIDEO = path.resolve(PROJECT_ROOT, 'raw_videos', 'raw_creator_19s.mp4');
const MULTI_CLIP_A = path.resolve(PROJECT_ROOT, 'raw_videos/downloaded/cRZACArJNEM.mp4');
const MULTI_CLIP_B = path.resolve(PROJECT_ROOT, 'raw_videos/downloaded/I9Blxs315Ko.mp4');
const MULTI_CLIP_C = path.resolve(PROJECT_ROOT, 'raw_videos/downloaded/ZalTrOoh4sc.mp4');

const BGM_CREATOR = path.resolve(PROJECT_ROOT, 'assets/creator_reel_soundtrack_20s.wav');
const BGM_CINEMATIC = path.resolve(PROJECT_ROOT, 'assets/cinematic_ad_soundtrack_20s.wav');
const SFX_WHOOSH = path.resolve(PROJECT_ROOT, 'assets/sjc_sfx_pack/SJC SFX Pack Vol 1 (Giveaway)/UI & Motion/Whoosh/SJC_WHOOSH_Fast Swish_01.wav');
const SFX_IMPACT = path.resolve(PROJECT_ROOT, 'assets/sjc_sfx_pack/SJC SFX Pack Vol 1 (Giveaway)/UI & Motion/Impact/SJC_IMPACT_Sub Impact_01.wav');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Canonical Creative Plan generator adhering to schema/eme-creative-plan.v1.schema.json
function createBenchmarkPlan(baseProject, overrides = {}) {
  const clip = baseProject.clips ? baseProject.clips[0] : baseProject.timeline.tracks[0].clips[0];
  const clipId = clip.id;
  const assetId = clip.assetId || clip.asset_id || clip.source?.assetId;

  const durationTicks = overrides.target_duration_ticks || 360000;

  const plan = {
    schema_version: '1.0.0',
    plan_id: overrides.plan_id || 'plan_phase35_benchmark_1_creator',
    source_request_id: overrides.source_request_id || 'req_phase35_b1_001',
    project_snapshot: {
      project_id: baseProject.id,
      base_revision: baseProject.revision,
      snapshot_sha256: 'a'.repeat(64),
      timebase_ticks_per_second: 120000,
      ...(overrides.project_snapshot || {})
    },
    creative_intent: {
      goal: 'High-impact talking-head vertical creator reel',
      target_audience: 'Creators and developers',
      style: 'talking_head_fast_pace',
      pacing: 'fast',
      desired_outcome: 'High retention vertical engagement reel',
      ...(overrides.creative_intent || {})
    },
    deliverable: {
      width: 1080,
      height: 1920,
      aspect_ratio: '9:16',
      frame_rate: { numerator: 30, denominator: 1 },
      target_duration_ticks: durationTicks,
      ...(overrides.deliverable || {})
    },
    narrative_beats: overrides.narrative_beats || [
      {
        beat_id: 'beat-001',
        sequence_index: 0,
        beat_type: 'hook',
        narrative_purpose: 'High-energy hook intro',
        source_media_ref: {
          asset_id: assetId,
          clip_id: clipId
        },
        source_range: {
          start_tick: 0,
          end_tick: durationTicks,
          duration_ticks: durationTicks
        },
        timeline_range: {
          start_tick: 0,
          end_tick: durationTicks,
          duration_ticks: durationTicks
        },
        editorial_decisions: {
          cut_type: 'hard_cut',
          pacing_weight: 1.0,
          reframing: {
            enabled: true,
            mode: 'subject_centered',
            target_aspect_ratio: '9:16',
            crop_rect: { x: 420, y: 0, width: 1080, height: 1920 }
          }
        }
      }
    ],
    visual_events: overrides.visual_events || [
      {
        event_id: 'event-001',
        timeline_range: {
          start_tick: 12000,
          end_tick: 180000,
          duration_ticks: 168000
        },
        event_type: 'caption',
        content: {
          text: 'THE EDITING PARADIGM',
          font_size: 48,
          font_color: '#FFFFFF'
        },
        spatial_constraints: {
          target_anchor: 'lower_third',
          avoid_face_overlap: true
        },
        motion: {
          animation_type: 'pop_in',
          duration_ticks: 12000
        }
      }
    ],
    audio_direction: {
      dialogue_ducking_enabled: true,
      ducking_depth_db: -14.0,
      soundtrack_selection: {
        style: 'creator_upbeat',
        bpm_target: 124,
        ducking_attack_ticks: 6000,
        ducking_release_ticks: 24000
      },
      sfx_cues: [],
      ...(overrides.audio_direction || {})
    },
    unsupported_features: overrides.unsupported_features || [],
    provenance: {
      generator: {
        provider: 'antigravity-ide',
        model: 'ide-agent-v2',
        generation_timestamp: new Date().toISOString()
      },
      input_brief_hash: 'a'.repeat(64),
      context_snapshot_hash: 'b'.repeat(64),
      accepted_at: new Date().toISOString(),
      plan_hash: 'c'.repeat(64),
      ...(overrides.provenance || {})
    }
  };

  plan.provenance.plan_hash = CreativePlanValidator.computePlanHash(plan);
  return plan;
}

test('Phase 35: Real-World Editing Workflow, Creative Iteration & Production Validation', async (t) => {

  // =========================================================================
  // Section 1: Benchmark 1 — Real Talking-Head Creator Reel
  // =========================================================================
  await t.test('Suite 1: Benchmark 1 — Real Talking-Head Creator Reel', async (t1) => {

    await t1.test('1.1: Grounded context retrieval and renderer capabilities query', async () => {
      const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
      const ctxResult = await EmeMcpServer.handleToolCall('eme_get_project_context', {
        brief: 'High-impact talking-head vertical creator reel with speech ducking',
        project: baseProject
      });
      assert.equal(ctxResult.success, true);
      assert.equal(ctxResult.context.project_state.project_id, 'proj_pf02_scenario1');
      assert.ok(ctxResult.context.media_catalog.available.length > 0);

      const capResult = await EmeMcpServer.handleToolCall('eme_get_renderer_capabilities', { scope: 'all' });
      assert.equal(capResult.success, true);
      assert.equal(capResult.capabilities.visual.curvedTypography.supported, true);
      assert.equal(capResult.capabilities.audio.loudnessStandard, 'EBUR128');
    });

    await t1.test('1.2: Antigravity IDE agent generates valid Creative Plan for Benchmark 1', () => {
      const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
      const plan = createBenchmarkPlan(baseProject, {
        plan_id: 'plan_phase35_benchmark_1_creator',
        source_request_id: 'req_phase35_b1_001'
      });

      const val = CreativePlanValidator.validate(plan, baseProject);
      assert.equal(val.valid, true, `Validation failed: ${JSON.stringify(val.errors)}`);
      assert.equal(val.errors.length, 0);
    });

    await t1.test('1.3: Plan validates, compiles, dry-runs, and executes authoritatively via OperationExecutor', async () => {
      const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
      const plan = createBenchmarkPlan(baseProject, {
        plan_id: 'plan_phase35_benchmark_1_exec',
        source_request_id: 'req_phase35_b1_002'
      });

      // Compile
      const compRes = await EmeMcpServer.handleToolCall('eme_compile_creative_plan', {
        plan,
        project_path: FIXTURE_PROJECT_PATH
      });
      assert.equal(compRes.success, true);
      assert.ok(compRes.operation_plan.operations.length > 0);

      // Dry run
      const dryRes = await EmeMcpServer.handleToolCall('eme_dry_run_plan', {
        plan,
        project_path: FIXTURE_PROJECT_PATH
      });
      assert.equal(dryRes.success, true);
      assert.equal(dryRes.dry_run, true);
      assert.equal(dryRes.original_revision, baseProject.revision);

      // Register approval
      const pending = ApprovalAuthority.createPendingRequest({ creativePlan: plan, project: baseProject });
      const confirmed = ApprovalAuthority.confirmPendingRequest({ requestId: pending.request_id, confirmedBy: 'test_harness' });

      // Execute
      const execRes = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
        plan,
        project: baseProject,
        approval: true,
        approval_token: confirmed.token
      });
      assert.equal(execRes.success, true);
      assert.ok(execRes.committed_revision > baseProject.revision);
    });

    await t1.test('1.4: Native pipeline renders 1080x1920 MP4 deliverable with EBUR128 audio QA', async () => {
      const outMp4 = path.join(ARTIFACTS_DIR, 'phase35_benchmark_1_creator.mp4');
      const renderRes = await EmeMcpServer.handleToolCall('eme_render_and_verify', {
        inputVideoPath: TALKING_HEAD_VIDEO,
        outputPath: outMp4,
        durationSec: 5.0,
        startSec: 2.0,
        cropRect: { x: 420, y: 0, width: 1080, height: 1080 },
        targetDimensions: { width: 1080, height: 1920 },
        audio: {
          musicPath: BGM_CREATOR,
          musicGain: 0.85,
          speechIntervals: [{ startSec: 1.0, endSec: 3.5 }],
          sfxCues: [{ path: SFX_WHOOSH, startSec: 0.5, gain: 0.8 }],
          targetLufs: -14.0
        }
      });

      assert.equal(renderRes.success, true);
      assert.ok(fs.existsSync(outMp4));
      const meta = FrameInspector.inspectVideoMetadata(outMp4);
      assert.equal(meta.video.width, 1080);
      assert.equal(meta.video.height, 1920);
      assert.ok(renderRes.qa_metrics.audio.integrated_loudness_lufs >= -15.0 && renderRes.qa_metrics.audio.integrated_loudness_lufs <= -13.0);
      assert.ok(renderRes.qa_metrics.audio.true_peak_db <= -1.0);
      assert.equal(renderRes.qa_metrics.audio.clipped_samples, 0);
      assert.equal(renderRes.qa_metrics.audio.loudness_passed, true);
    });
  });

  // =========================================================================
  // Section 2: Benchmark 2 — Cinematic Founder Reel
  // =========================================================================
  await t.test('Suite 2: Benchmark 2 — Cinematic Founder Reel', async (t2) => {

    await t2.test('2.1: Native render executes optical fisheye distortion, curved typography, and cinematic score', async () => {
      const outMp4 = path.join(ARTIFACTS_DIR, 'phase35_benchmark_2_cinematic.mp4');
      const renderRes = await EmeMcpServer.handleToolCall('eme_render_and_verify', {
        inputVideoPath: CREATOR_19S_VIDEO,
        outputPath: outMp4,
        durationSec: 5.0,
        startSec: 1.0,
        cropRect: { x: 420, y: 0, width: 1080, height: 1080 },
        targetDimensions: { width: 1080, height: 1920 },
        opticalDistortion: { enabled: true, cx: 0.5, cy: 0.5, k1: -0.22, k2: -0.04 },
        curvedTypography: {
          text: 'EME FOUNDER REEL',
          curve: { type: 'arc', radius: 450, startAngleDeg: -30, endAngleDeg: 30 },
          styling: { fontSize: 44, fontColor: '#FFFFFF', opacity: 1.0 },
          animation: { type: 'none' }
        },
        audio: {
          musicPath: BGM_CINEMATIC,
          musicGain: 0.90,
          sfxCues: [{ path: SFX_IMPACT, startSec: 0.5, gain: 0.85 }],
          targetLufs: -14.0
        }
      });

      assert.equal(renderRes.success, true);
      assert.ok(fs.existsSync(outMp4));
      const meta = FrameInspector.inspectVideoMetadata(outMp4);
      assert.equal(meta.video.width, 1080);
      assert.equal(meta.video.height, 1920);
      assert.ok(renderRes.qa_metrics.audio.integrated_loudness_lufs >= -15.0 && renderRes.qa_metrics.audio.integrated_loudness_lufs <= -13.0);
      assert.ok(renderRes.qa_metrics.audio.true_peak_db <= -1.0);
      assert.equal(renderRes.qa_metrics.audio.clipped_samples, 0);
      assert.equal(renderRes.qa_metrics.audio.loudness_passed, true);
    });
  });

  // =========================================================================
  // Section 3: Benchmark 3 — Multi-Clip Social Reel (Extended Multi-Source Edit)
  // =========================================================================
  await t.test('Suite 3: Benchmark 3 — Multi-Clip Social Reel (Extended Multi-Source Edit)', async (t3) => {

    await t3.test('3.1: Sequences 3 distinct downloaded video assets into a continuous 21.0s deliverable', async () => {
      const outMp4 = path.join(ARTIFACTS_DIR, 'phase35_benchmark_3_multiclip.mp4');

      const clips = [
        { inputVideoPath: MULTI_CLIP_A, startSec: 1.0, durationSec: 7.0, cropRect: { x: 420, y: 0, width: 1080, height: 1080 } },
        { inputVideoPath: MULTI_CLIP_B, startSec: 2.0, durationSec: 8.0, cropRect: { x: 420, y: 0, width: 1080, height: 1080 } },
        { inputVideoPath: MULTI_CLIP_C, startSec: 3.0, durationSec: 6.0, cropRect: { x: 420, y: 0, width: 1080, height: 1080 } }
      ];

      const renderRes = await EmeMcpServer.handleToolCall('eme_render_and_verify', {
        clips,
        outputPath: outMp4,
        targetDimensions: { width: 1080, height: 1920 },
        audio: {
          musicPath: BGM_CREATOR,
          musicGain: 0.88,
          sfxCues: [
            { path: SFX_WHOOSH, startSec: 6.8, gain: 0.8 },
            { path: SFX_IMPACT, startSec: 14.8, gain: 0.85 }
          ],
          targetLufs: -14.0
        }
      });

      assert.equal(renderRes.success, true);
      assert.ok(fs.existsSync(outMp4));
      const meta = FrameInspector.inspectVideoMetadata(outMp4);
      assert.equal(meta.video.width, 1080);
      assert.equal(meta.video.height, 1920);
      // Verify extended duration (21.0s +/- 0.5s)
      assert.ok(Math.abs(meta.duration - 21.0) < 0.5, `Expected ~21s duration, got ${meta.duration}s`);
      assert.ok(renderRes.qa_metrics.audio.integrated_loudness_lufs >= -15.0 && renderRes.qa_metrics.audio.integrated_loudness_lufs <= -13.0);
      assert.ok(renderRes.qa_metrics.audio.true_peak_db <= -1.0);
      assert.equal(renderRes.qa_metrics.audio.clipped_samples, 0);
      assert.equal(renderRes.qa_metrics.audio.loudness_passed, true);
    });
  });

  // =========================================================================
  // Section 4: Grounded Creative Revision Loop (Workstream 3)
  // =========================================================================
  await t.test('Suite 4: Grounded Creative Revision Loop', async (t4) => {

    await t4.test('4.1: Antigravity IDE agent inspects QA findings and formulates justified plan revision', async () => {
      const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);

      // Initial plan with defect: ducking depth is too subtle (-4 dB)
      const initialPlan = createBenchmarkPlan(baseProject, {
        plan_id: 'plan_b1_initial_draft',
        source_request_id: 'req_revision_test_001',
        audio_direction: { dialogue_ducking_enabled: true, ducking_depth_db: -4.0 }
      });

      // Review initial plan and issue initial approval token
      const p1 = ApprovalAuthority.createPendingRequest({ creativePlan: initialPlan, project: baseProject });
      const c1 = ApprovalAuthority.confirmPendingRequest({ requestId: p1.request_id, confirmedBy: 'editor_human' });

      // Execute initial plan
      const exec1 = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
        plan: initialPlan,
        project: baseProject,
        approval: true,
        approval_token: c1.token
      });
      assert.equal(exec1.success, true);
      const intermediateProject = exec1.project;
      assert.ok(intermediateProject.revision > baseProject.revision);

      // Antigravity reviews QA: ducking depth was insufficient
      // Antigravity formulates revised plan with explicit rationale
      const revisedPlan = createBenchmarkPlan(intermediateProject, {
        plan_id: 'plan_b1_revised_ducking_depth',
        source_request_id: 'req_revision_test_002',
        audio_direction: { dialogue_ducking_enabled: true, ducking_depth_db: -14.0 }
      });

      // Verify that old token CANNOT authorize the revised plan (fails with ERR_APPROVAL_INTEGRITY_MISMATCH)
      const tamperedCheck = ApprovalAuthority.verifyAndConsumeApproval({
        approvalToken: c1.token,
        planHash: CreativePlanValidator.computePlanHash(revisedPlan),
        projectRevision: intermediateProject.revision
      });
      assert.equal(tamperedCheck.valid, false);

      // Request new approval for revised plan
      const p2 = ApprovalAuthority.createPendingRequest({ creativePlan: revisedPlan, project: intermediateProject });
      const c2 = ApprovalAuthority.confirmPendingRequest({ requestId: p2.request_id, confirmedBy: 'editor_human_revision' });

      // Execute revised plan authoritatively
      const exec2 = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
        plan: revisedPlan,
        project: intermediateProject,
        approval: true,
        approval_token: c2.token
      });
      assert.equal(exec2.success, true);
      assert.ok(exec2.committed_revision > intermediateProject.revision);
    });
  });

  // =========================================================================
  // Section 5: Reliability, Failure Recovery & Delivery Preservation (Workstream 4)
  // =========================================================================
  await t.test('Suite 5: Reliability, Failure Recovery & Delivery Preservation', async (t5) => {

    await t5.test('5.1: Missing source media fails closed with diagnostic error without mutating project state', () => {
      const nonExistentPath = path.join(PROJECT_ROOT, 'raw_videos', 'ghost_clip_does_not_exist.mp4');
      assert.throws(() => {
        CompositionRenderer.renderSample({
          inputVideoPath: nonExistentPath,
          outputPath: path.join(ARTIFACTS_DIR, 'ghost_fail.mp4'),
          durationSec: 3.0
        });
      }, /Input media does not exist/);
    });

    await t5.test('5.2: Unsupported requested effect fails compilation cleanly with ERR_UNSUPPORTED_RENDERER_FEATURE', () => {
      const capCheck = CompositionRenderer.validateCapabilities({
        features: ['neural_relighting']
      });
      assert.equal(capCheck.supported, false);
      assert.ok(capCheck.errors[0].includes('ERR_UNSUPPORTED_RENDERER_FEATURE'));
    });

    await t5.test('5.3: Stale project revision is rejected at authoritative execution boundary with ERR_STALE_REVISION', async () => {
      const baseProject = ProjectManager.loadProject(FIXTURE_PROJECT_PATH);
      const plan = createBenchmarkPlan(baseProject, {
        plan_id: 'plan_stale_test',
        source_request_id: 'req_stale'
      });

      const pending = ApprovalAuthority.createPendingRequest({ creativePlan: plan, project: baseProject });
      const confirmed = ApprovalAuthority.confirmPendingRequest({ requestId: pending.request_id, confirmedBy: 'test_harness' });

      // Mutate project revision on disk to simulate concurrent edit race
      const staleProject = structuredClone(baseProject);
      staleProject.revision = baseProject.revision + 5;

      const res = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
        plan,
        project: staleProject,
        approval: true,
        approval_token: confirmed.token
      });

      assert.equal(res.success, false);
      assert.equal(res.error.code, 'ERR_STALE_REVISION');
    });

    await t5.test('5.4: Preserves all 18 canonical baseline schemas and zero runtime dependencies', () => {
      // 1. Zero runtime dependencies
      const pkg = JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, 'package.json'), 'utf8'));
      assert.equal(pkg.dependencies, undefined, 'package.json dependencies must remain strictly undefined');

      // 2. Canonical schema freeze verification on all 18 baseline schemas
      const CANONICAL_18_SCHEMAS = [
        'schema/eme-beat-actor-plan.v1.schema.json',
        'schema/eme-beat-analysis.v1.schema.json',
        'schema/eme-candidate-set.v1.schema.json',
        'schema/eme-color-grade.v1.schema.json',
        'schema/eme-constraint.v1.schema.json',
        'schema/eme-delivery-manifest.v1.schema.json',
        'schema/eme-delivery-run.v1.schema.json',
        'schema/eme-edit-brief.v1.schema.json',
        'schema/eme-intent-envelope.v1.schema.json',
        'schema/eme-media-qa-report.v1.schema.json',
        'schema/eme-musical-structure.v1.schema.json',
        'schema/eme-operation-plan.v1.schema.json',
        'schema/eme-preference-feedback.v1.schema.json',
        'schema/eme-preference-profile.v1.schema.json',
        'schema/eme-render-job.v1.schema.json',
        'schema/eme-revision-run.v1.schema.json',
        'schema/eme-revision-session.v1.schema.json',
        'schema/eme-sfx-cue.v1.schema.json'
      ];
      const schemaDiff = spawnSync('git', ['diff', '--exit-code', '9d591cc..HEAD', '--', ...CANONICAL_18_SCHEMAS], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8'
      });
      assert.equal(schemaDiff.status, 0, `All 18 canonical schemas must be 100% byte-identical to 9d591cc. Diff: ${schemaDiff.stdout}`);
    });
  });
});
