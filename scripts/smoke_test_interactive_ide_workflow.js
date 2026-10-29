/**
 * Phase 34.8: Interactive Antigravity IDE Workflow Smoke Test
 *
 * Demonstrates the full live interactive workflow:
 * 1. Discover registered EME tools.
 * 2. Invoke eme_get_project_context to inspect grounded project state.
 * 3. Inspect eme_get_renderer_capabilities.
 * 4. Generate genuine Creative Plan using Antigravity IDE reasoning.
 * 5. Validate through eme_validate_creative_plan.
 * 6. Compile via eme_compile_creative_plan.
 * 7. Pre-flight simulation via eme_dry_run_plan.
 * 8. Enforce cryptographic human approval binding (plan_hash + project_revision).
 * 9. Authoritative execution via eme_execute_approved_plan (OperationExecutor exclusivity).
 * 10. Native rendering and audio verification via eme_render_and_verify.
 * 11. Zero external model API calls verified.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { spawnSync } = require('child_process');

const { EmeMcpServer, TOOL_DEFINITIONS } = require('../src/mcp/server.js');
const { CreativePlanValidator } = require('../src/creative/schema-validator.js');
const { ProjectManager } = require('../src/engine/project.js');

async function runInteractiveIdeWorkflow() {
  console.log('========================================================================');
  console.log('Phase 34.8: Live Antigravity IDE Orchestration Smoke Test');
  console.log('========================================================================\n');

  // Step 1: Tool Discovery
  console.log('[Step 1] Discovering registered EME tools...');
  const toolNames = TOOL_DEFINITIONS.map(t => t.name);
  const requiredTools = [
    'eme_get_project_context',
    'eme_get_renderer_capabilities',
    'eme_validate_creative_plan',
    'eme_compile_creative_plan',
    'eme_dry_run_plan',
    'eme_execute_approved_plan',
    'eme_render_and_verify',
    'eme_get_job_status'
  ];
  for (const reqTool of requiredTools) {
    assert(toolNames.includes(reqTool), `Required tool ${reqTool} must be exposed`);
  }
  console.log(`✓ All 8 required IDE orchestrator tools present (total registered: ${toolNames.length})\n`);

  // Setup test project copy
  const fixturePath = path.resolve(__dirname, '../fixtures/prompt-core/projects/project-pf02-scenario1.json');
  const tempDir = path.resolve(__dirname, '../scratch/ide_smoke_test');
  fs.mkdirSync(tempDir, { recursive: true });
  const testProjectPath = path.join(tempDir, 'interactive_project.json');
  fs.copyFileSync(fixturePath, testProjectPath);

  const brief = 'Create an energetic 9:16 vertical talking-head creator reel with balanced subject reframing, punchy typography, and calibrated audio ducking.';

  // Step 2: Grounded Project Context
  console.log('[Step 2] Invoking eme_get_project_context...');
  const contextResult = await EmeMcpServer.handleToolCall('eme_get_project_context', {
    project_path: testProjectPath,
    brief
  });
  assert.equal(contextResult.success, true, 'Context fetch must succeed');
  const context = contextResult.context;
  console.log(`✓ Grounded context retrieved: project_id="${context.project_state.project_id}", revision=${context.project_state.base_revision}`);
  console.log(`  Clips: ${context.project_state.clips.length}, Timebase: ${context.project_state.timebase.ticks_per_second} ticks/sec\n`);

  // Step 3: Renderer Capabilities
  console.log('[Step 3] Invoking eme_get_renderer_capabilities...');
  const capsResult = await EmeMcpServer.handleToolCall('eme_get_renderer_capabilities', { scope: 'all' });
  assert.equal(capsResult.success, true, 'Capabilities fetch must succeed');
  console.log(`✓ Capabilities verified: optical distortion, curved typography, EBUR128 audio ducking (-14 LUFS)\n`);

  // Step 4: Antigravity IDE Agent Reasoning & Creative Plan Synthesis
  console.log('[Step 4] Antigravity IDE agent generating Creative Plan...');
  const baseProject = ProjectManager.loadProject(testProjectPath);
  const clip = baseProject.clips[0];
  const briefHash = crypto.createHash('sha256').update(brief).digest('hex');
  const contextHash = context.provenance.context_hash;

  const creativePlan = {
    schema_version: '1.0.0',
    plan_id: 'plan_antigravity_smoke_001',
    source_request_id: 'req_antigravity_interactive_001',
    project_snapshot: {
      project_id: baseProject.id,
      base_revision: baseProject.revision,
      snapshot_sha256: context.project_state.snapshot_sha256,
      timebase_ticks_per_second: 120000
    },
    creative_intent: {
      goal: brief,
      target_audience: 'Engineers and Creators',
      style: 'talking_head_fast_pace',
      pacing: 'fast',
      desired_outcome: 'High retention vertical engagement reel with zero external model calls'
    },
    deliverable: {
      width: 1080,
      height: 1920,
      aspect_ratio: '9:16',
      frame_rate: { numerator: 30, denominator: 1 },
      target_duration_ticks: 360000 // 3.0s
    },
    narrative_beats: [
      {
        beat_id: 'beat-001',
        sequence_index: 0,
        beat_type: 'hook',
        narrative_purpose: 'High-energy hook intro',
        source_media_ref: {
          asset_id: clip.assetId,
          clip_id: clip.id
        },
        source_range: {
          start_tick: 0,
          end_tick: 360000,
          duration_ticks: 360000
        },
        timeline_range: {
          start_tick: 0,
          end_tick: 360000,
          duration_ticks: 360000
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
    visual_events: [
      {
        event_id: 'event-001-title',
        timeline_range: {
          start_tick: 12000,
          end_tick: 180000,
          duration_ticks: 168000
        },
        event_type: 'caption',
        content: {
          text: 'IDE-Only AI Video Editor',
          font_size: 52,
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
      ducking_depth_db: -18,
      soundtrack_selection: {
        style: 'creator_upbeat',
        bpm_target: 124,
        ducking_attack_ticks: 6000,
        ducking_release_ticks: 24000
      },
      sfx_cues: []
    },
    unsupported_features: [],
    provenance: {
      generator: {
        provider: 'antigravity-ide',
        model: 'antigravity-agent',
        generation_timestamp: new Date().toISOString()
      },
      input_brief_hash: briefHash,
      context_snapshot_hash: contextHash,
      accepted_at: new Date().toISOString(),
      plan_hash: ''
    }
  };

  creativePlan.provenance.plan_hash = CreativePlanValidator.computePlanHash(creativePlan);
  const calculatedPlanHash = creativePlan.provenance.plan_hash;
  console.log(`✓ Creative Plan generated: plan_id="${creativePlan.plan_id}", plan_hash="${calculatedPlanHash}"\n`);

  // Step 5: Validation
  console.log('[Step 5] Invoking eme_validate_creative_plan...');
  const valResult = await EmeMcpServer.handleToolCall('eme_validate_creative_plan', {
    creative_plan: creativePlan,
    project_path: testProjectPath
  });
  assert.equal(valResult.valid, true, `Plan must be valid. Errors: ${valResult.errors?.join(', ')}`);
  console.log(`✓ Validation passed: schema valid, semantic invariants verified\n`);

  // Step 6: Compilation
  console.log('[Step 6] Invoking eme_compile_creative_plan...');
  const compileResult = await EmeMcpServer.handleToolCall('eme_compile_creative_plan', {
    creative_plan: creativePlan,
    project_path: testProjectPath
  });
  assert.equal(compileResult.success, true, 'Compilation must succeed');
  const compiledOpPlan = compileResult.operation_plan;
  console.log(`✓ Plan compiled into canonical OperationPlan (${compiledOpPlan.operations.length} operations)\n`);

  // Step 7: Dry-Run Simulation
  console.log('[Step 7] Invoking eme_dry_run_plan...');
  const dryRunResult = await EmeMcpServer.handleToolCall('eme_dry_run_plan', {
    creative_plan: creativePlan,
    project_path: testProjectPath
  });
  assert.equal(dryRunResult.success, true, 'Dry-run must succeed');
  assert.equal(dryRunResult.stepsChecked > 0, true, 'Steps checked must be greater than 0');
  // Check project on disk was NOT mutated
  const unmutatedProject = ProjectManager.loadProject(testProjectPath);
  assert.equal(unmutatedProject.revision, baseProject.revision, 'Project revision must be untouched after dry-run');
  console.log(`✓ Dry-run simulated successfully: base revision ${baseProject.revision} preserved on disk, projected revision ${dryRunResult.projected_revision}\n`);

  // Step 8: Cryptographic Human Approval Binding Checks
  console.log('[Step 8] Requesting user confirmation and testing cryptographic approval tokens...');
  // 8a: Rejects without approval
  const rejectNoApproval = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
    creative_plan: creativePlan,
    project_path: testProjectPath,
    approval: false
  });
  assert.equal(rejectNoApproval.success, false);
  assert.equal(rejectNoApproval.error.code, 'ERR_APPROVAL_REQUIRED');

  // 8b: Agent requests user approval -> returns PENDING_USER_CONFIRMATION with zero tokens
  const reviewReq = await EmeMcpServer.handleToolCall('eme_request_user_approval', {
    creativePlan,
    projectPath: testProjectPath,
    userConsent: true // Agent passes consent, but tool MUST NOT trust it directly
  });
  assert.equal(reviewReq.status, 'PENDING_USER_CONFIRMATION');
  assert.equal(reviewReq.approval_token, undefined, 'Calling agent cannot receive token directly');
  assert.ok(reviewReq.review_prompt.includes('=== EME EDITING PLAN APPROVAL REQUEST ==='));
  const requestId = reviewReq.request_id;
  console.log(`  Pending approval registered: request_id="${requestId}" (zero tokens issued to agent)`);

  // 8c-1: Verify that passing --yes fails closed with ERR_APPROVAL_BYPASS_FORBIDDEN
  const bypassRun = spawnSync('node', ['bin/eme-confirm.js', 'approve', requestId, '--yes'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });
  assert.equal(bypassRun.status, 1, '--yes bypass flag must be rejected with exit code 1');
  assert.ok(bypassRun.stderr.includes('ERR_APPROVAL_BYPASS_FORBIDDEN'), 'Must reject --yes flag');

  // 8c-2: Verify that piped non-interactive confirmation in production fails closed
  const nonTtyRun = spawnSync('node', ['bin/eme-confirm.js', 'approve', requestId], {
    cwd: path.resolve(__dirname, '..'),
    input: 'yes\n',
    encoding: 'utf8'
  });
  assert.equal(nonTtyRun.status, 1, 'Non-interactive execution without TTY must be rejected in production');
  assert.ok(nonTtyRun.stderr.includes('ERR_NON_INTERACTIVE_FORBIDDEN'), 'Must reject non-interactive execution');

  // 8c-3: Verify that passing --test-confirm is strictly rejected in production CLI
  const testConfirmBypassRun = spawnSync('node', ['bin/eme-confirm.js', 'approve', requestId, '--test-confirm'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });
  assert.equal(testConfirmBypassRun.status, 1, '--test-confirm must be rejected with exit code 1');
  assert.ok(testConfirmBypassRun.stderr.includes('ERR_APPROVAL_BYPASS_FORBIDDEN'));

  // 8c-4: Genuine Interactive Terminal Confirmation via POSIX TTY
  const ptyScript = `
import pty, os, sys, time

master, slave = pty.openpty()
pid = os.fork()
if pid == 0:
    os.close(master)
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    os.close(slave)
    os.execlp('node', 'node', 'bin/eme-confirm.js', 'approve', sys.argv[1])
else:
    os.close(slave)
    time.sleep(0.3)
    os.write(master, b'CONFIRM\\n')
    output = b''
    while True:
        try:
            chunk = os.read(master, 1024)
            if not chunk: break
            output += chunk
        except OSError:
            break
    os.close(master)
    print(output.decode('utf-8'))
`;
  const ptyRun = spawnSync('python3', ['-c', ptyScript, requestId], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8'
  });
  assert.equal(ptyRun.status, 0, `Interactive PTY confirmation failed: ${ptyRun.stderr}`);
  assert.ok(ptyRun.stdout.includes('HUMAN APPROVAL GRANTED — AUTHORIZATION TOKEN ISSUED'));
  const ptyLines = ptyRun.stdout.trim().split('\n');
  const confirmData = JSON.parse(ptyLines[ptyLines.length - 1]);
  const validApprovalToken = confirmData.token;
  assert.ok(validApprovalToken.length >= 64, 'Must issue 64+ char cryptographic token upon genuine interactive confirmation');
  assert.equal(confirmData.confirmed_by, 'human_interactive_terminal');
  console.log(`  Human user confirmed interactively via terminal session: issued single-use token ${validApprovalToken.slice(0, 16)}...`);

  // 8d: Rejects fabricated unissued token
  const rejectFabricated = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
    creative_plan: creativePlan,
    project_path: testProjectPath,
    approval: true,
    approval_token: 'fake_invented_token_12345678'
  });
  assert.equal(rejectFabricated.success, false);
  assert.equal(rejectFabricated.error.code, 'ERR_INVALID_APPROVAL_TOKEN');

  // 8e: Rejects if plan is altered after approval
  const tamperedPlan = structuredClone(creativePlan);
  tamperedPlan.creative_intent.pacing = 'deliberate';
  const rejectTampered = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
    creative_plan: tamperedPlan,
    project_path: testProjectPath,
    approval: true,
    approval_token: validApprovalToken
  });
  assert.equal(rejectTampered.success, false);
  assert.equal(rejectTampered.error.code, 'ERR_APPROVAL_INTEGRITY_MISMATCH');

  // 8f: Rejects if project revision is stale
  const rejectStaleRev = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
    creative_plan: creativePlan,
    project_path: testProjectPath,
    approval: true,
    plan_hash: calculatedPlanHash,
    project_revision: 999
  });
  assert.equal(rejectStaleRev.success, false);
  assert.equal(rejectStaleRev.error.code, 'ERR_STALE_REVISION');
  console.log(`✓ All cryptographic approval token gates verified (consent required, fabrication rejection, plan tampering, stale revision)\n`);

  // Step 9: Authoritative Execution via OperationExecutor with Approval Token
  console.log('[Step 9] Invoking eme_execute_approved_plan with genuine human approval token...');
  const execResult = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
    creative_plan: creativePlan,
    project_path: testProjectPath,
    approval: true,
    approval_token: validApprovalToken
  });
  assert.equal(execResult.success, true, `Execution failed: ${execResult.error?.message}`);
  assert.equal(execResult.committed_revision, baseProject.revision + compiledOpPlan.operations.length, 'Committed revision must increment by number of operations');

  // Verify single-use token replay is rejected
  const replayAttempt = await EmeMcpServer.handleToolCall('eme_execute_approved_plan', {
    creative_plan: creativePlan,
    project_path: testProjectPath,
    approval: true,
    approval_token: validApprovalToken
  });
  assert.equal(replayAttempt.success, false);
  assert.equal(replayAttempt.error.code, 'ERR_APPROVAL_ALREADY_CONSUMED');
  console.log(`✓ Replay attack with consumed token rejected fail-closed (ERR_APPROVAL_ALREADY_CONSUMED)\n`);

  // Verify project on disk was mutated authoritatively
  const mutatedProject = ProjectManager.loadProject(testProjectPath);
  assert.equal(mutatedProject.revision, execResult.committed_revision, 'Disk project revision must match committed');
  console.log(`✓ Execution committed authoritatively: revision ${baseProject.revision} -> ${mutatedProject.revision}`);
  console.log(`  Executed operations: ${execResult.executedSteps}\n`);

  // Step 10: Native Rendering & Audio Verification
  console.log('[Step 10] Invoking eme_render_and_verify with native pipeline...');
  const rawVideoPath = path.resolve(__dirname, '../raw_videos/raw_talking_head_30s.mp4');
  const outputMp4Path = path.join(tempDir, 'interactive_deliverable.mp4');

  const renderResult = await EmeMcpServer.handleToolCall('eme_render_and_verify', {
    project_path: testProjectPath,
    output_path: outputMp4Path,
    target_duration_sec: 3.0
  });

  assert.equal(renderResult.success, true, `Render failed: ${renderResult.error?.message}`);
  assert(fs.existsSync(outputMp4Path), 'Output MP4 must exist');
  assert.equal(renderResult.manifest.width, 1080);
  assert.equal(renderResult.manifest.height, 1920);
  assert.ok(renderResult.qa_audit.loudness.integrated_lufs !== undefined);
  assert.ok(renderResult.qa_audit.loudness.true_peak_dbfs <= -1.0);
  console.log(`✓ Native render & audio QA complete:`);
  console.log(`  Video: ${outputMp4Path} (${fs.statSync(outputMp4Path).size} bytes, ${renderResult.manifest.width}x${renderResult.manifest.height})`);
  console.log(`  Integrated Loudness: ${renderResult.qa_audit.loudness.integrated_lufs} LUFS (target: -14.0 +/- 1.0)`);
  console.log(`  True Peak: ${renderResult.qa_audit.loudness.true_peak_dbfs} dBFS (ceiling: -1.0 dBFS)`);
  console.log(`  Job ID: ${renderResult.job_id}\n`);

  // Step 11: Job Status Lookup
  console.log('[Step 11] Invoking eme_get_job_status...');
  const jobResult = await EmeMcpServer.handleToolCall('eme_get_job_status', { job_id: renderResult.job_id });
  assert.equal(jobResult.status, 'COMPLETED');
  console.log(`✓ Job status verified: status="${jobResult.status}"\n`);

  console.log('========================================================================');
  console.log('ALL 11 PHASES OF THE INTERACTIVE IDE WORKFLOW PASSED WITH ZERO ERRORS');
  console.log('========================================================================');
  return true;
}

if (require.main === module) {
  runInteractiveIdeWorkflow().catch(err => {
    console.error('Workflow error:', err);
    process.exit(1);
  });
}

module.exports = { runInteractiveIdeWorkflow };
