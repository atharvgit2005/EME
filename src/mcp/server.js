/**
 * Editing Mechanics Engine (EME) - Model Context Protocol (MCP) Server
 *
 * Exposes atomic editing operations and rendering commands to AI agents (Antigravity).
 * Supports standard JSON-RPC 2.0 over stdio and programmatic invocation.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { OperationExecutor } = require('../engine/operations.js');
const { ProjectManager } = require('../engine/project.js');
const { HyperFramesCompiler } = require('../renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../renderers/inspector.js');
const { HyperFramesCapabilities } = require('../renderers/hyperframes/capabilities.js');
const { CreativeDirector } = require('../creative/creative-director.js');
const { CreativeContextBuilder, VERIFIED_SUPPORTED_OPERATIONS } = require('../creative/creative-context-builder.js');
const { CreativePlanValidator } = require('../creative/schema-validator.js');
const { CreativePlanCompiler } = require('../creative/creative-plan-compiler.js');
const { AudioCatalog } = require('../creative/audio-catalog.js');
const { AudioMixerEngine } = require('../creative/audio-mixer-engine.js');
const { CompositionRenderer } = require('../creative/composition-renderer.js');
const { SpeechDuckingCompiler } = require('../creative/speech-ducking-compiler.js');
const { ApprovalAuthority } = require('../creative/approval-authority.js');
const { ExecutionAuthority } = require('../creative/execution-authority.js');

const TOOL_DEFINITIONS = [
  {
    name: 'eme_create_project',
    description: 'Execute an interactively approved project-creation operation',
    inputSchema: {
      type: 'object',
      required: ['approval_token'],
      properties: {
        approval_token: { type: 'string', description: 'Token from bin/eme-confirm.js for these exact creation parameters' },
        title: { type: 'string' },
        width: { type: 'integer', default: 1080 },
        height: { type: 'integer', default: 1920 },
        fps: { type: 'object', properties: { numerator: { type: 'integer' }, denominator: { type: 'integer' } } },
        durationTicks: { type: 'integer', default: 360000 },
        backgroundColor: { type: 'string', default: '#0a0a0d' }
      }
    }
  },
  {
    name: 'eme_execute_operation',
    description: 'Execute an atomic EME editing operation against a project state',
    inputSchema: {
      type: 'object',
      required: ['project', 'operation', 'approval_token'],
      properties: {
        project: { type: 'object' },
        approval_token: { type: 'string' },
        projectPath: { type: 'string' },
        operation: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string' },
            params: { type: 'object' }
          }
        }
      }
    }
  },
  {
    name: 'eme_validate_project',
    description: 'Validate a canonical EME project state against schema and semantic invariants',
    inputSchema: {
      type: 'object',
      required: ['project'],
      properties: {
        project: { type: 'object' }
      }
    }
  },
  {
    name: 'eme_compile_composition',
    description: 'Compile a canonical EME project into a self-contained HyperFrames HTML composition',
    inputSchema: {
      type: 'object',
      required: ['project', 'outputDir'],
      properties: {
        project: { type: 'object' },
        outputDir: { type: 'string' }
      }
    }
  },
  {
    name: 'eme_render_video',
    description: 'Compile and render an EME project to an MP4 video file',
    inputSchema: {
      type: 'object',
      required: ['project', 'outputMp4Path'],
      properties: {
        project: { type: 'object' },
        outputMp4Path: { type: 'string' },
        fps: { type: 'number' }
      }
    }
  },
  {
    name: 'eme_inspect_frame',
    description: 'Extract and inspect a still PNG frame from a rendered video at exact time/ticks',
    inputSchema: {
      type: 'object',
      required: ['videoPath', 'outputPngPath'],
      properties: {
        videoPath: { type: 'string' },
        outputPngPath: { type: 'string' },
        time: { type: 'number' },
        tick: { type: 'integer' }
      }
    }
  },
  {
    name: 'eme_inspect_project',
    description: 'Inspect canonical project summary, tracks, clips, assets, and validation status',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        project: { type: 'object' }
      }
    }
  },
  {
    name: 'eme_query_capabilities',
    description: 'Query supported media types, blend modes, filters, and animatable properties of the renderer',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'eme_inspect_metadata',
    description: 'Inspect MP4 video container and stream metadata (duration, resolution, fps, codecs, frame count)',
    inputSchema: {
      type: 'object',
      required: ['videoPath'],
      properties: {
        videoPath: { type: 'string' }
      }
    }
  },
  {
    name: 'eme_route_request',
    description: 'Shadow-Mode System 1 Intent Router: Diagnostically routes editing prompt and reports consensus (Advisory Only)',
    inputSchema: {
      type: 'object',
      required: ['request_text'],
      properties: {
        request_text: { type: 'string', description: 'Raw user request or editing prompt' },
        project_context: { type: 'object', description: 'Optional project state context' }
      }
    }
  },
  {
    name: 'eme_triage_color_mood',
    description: 'Shadow-Mode Color Mood Triager: Diagnostically maps creative brief to candidate certified 3D LUT (Advisory Only)',
    inputSchema: {
      type: 'object',
      required: ['creativeBrief'],
      properties: {
        creativeBrief: { type: 'string', description: 'Color mood description or creative brief text' },
        projectContext: { type: 'object', description: 'Optional project context' }
      }
    }
  },
  {
    name: 'eme_arbitrate_timeline',
    description: 'Shadow-Mode Timeline Arbiter: Diagnostically evaluates gap risk, pacing energy, and snapping mode (Advisory Only)',
    inputSchema: {
      type: 'object',
      properties: {
        auditFindings: { type: 'object', description: 'Deterministic timeline audit findings' },
        editIntent: { type: 'string', description: 'User pacing and snapping intent' }
      }
    }
  },
  {
    name: 'eme_vtsm_init_tracking',
    description: 'Visual-Temporal State Machine: Initialize an authorized tracking session for a media asset (Advisory Only)',
    inputSchema: {
      type: 'object',
      required: ['projectId', 'mediaPath'],
      properties: {
        projectId: { type: 'string', description: 'EME project UUID' },
        mediaPath: { type: 'string', description: 'Path to source media file within authorized roots' },
        promptBoxes: { type: 'array', description: 'Optional initial prompt bounding boxes [[x, y, w, h]]' },
        label: { type: 'string', description: 'Optional entity track label' }
      }
    }
  },
  {
    name: 'eme_vtsm_propagate_range',
    description: 'Visual-Temporal State Machine: Propagate object tracking across video frames and persist to sidecar (Advisory Only)',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string', description: 'Tracking session UUID' },
        ablationMode: { type: 'string', default: 'vtsm03_adaptive_hybrid' },
        flowAlgo: { type: 'string', default: 'sparse_lk' }
      }
    }
  },
  {
    name: 'eme_vtsm_get_frame_mask',
    description: 'Visual-Temporal State Machine: Retrieve tracked spatial mask and bounding box for a specific frame or tick (Advisory Only)',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string', description: 'Tracking session UUID' },
        frameIdx: { type: 'integer', description: 'Frame index (0-based)' },
        tick: { type: 'integer', description: 'Timeline position in 120,000 ticks/sec' }
      }
    }
  },
  {
    name: 'eme_vtsm_cancel_tracking',
    description: 'Visual-Temporal State Machine: Cancel or reset an active tracking session (Advisory Only)',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string', description: 'Tracking session UUID' }
      }
    }
  },
  {
    name: 'eme_vtsm_get_session_status',
    description: 'Visual-Temporal State Machine: Inspect tracking session lifecycle, frame count, and provenance (Advisory Only)',
    inputSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string', description: 'Tracking session UUID' }
      }
    }
  },
  {
    name: 'eme_get_project_context',
    description: 'Construct grounded EME creative context from authentic project data and local catalog assets (Antigravity IDE AI Orchestrator)',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: 'User natural language editing brief' },
        project: { type: 'object', description: 'Canonical EME project snapshot' },
        projectPath: { type: 'string', description: 'Path to EME project JSON file' },
        vtsmSidecarPath: { type: 'string', description: 'Optional path to VTSM tracking sidecar' }
      }
    }
  },
  {
    name: 'eme_get_renderer_capabilities',
    description: 'Query grounded visual, audio, optical distortion, curved typography, and timebase capabilities supported by EME',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'visual', 'audio', 'timebase'], default: 'all' }
      }
    }
  },
  {
    name: 'eme_validate_creative_plan',
    description: 'Validate an IDE-generated Creative Plan against schema/eme-creative-plan.v1.schema.json and semantic invariants',
    inputSchema: {
      type: 'object',
      required: ['creativePlan'],
      properties: {
        creativePlan: { type: 'object', description: 'Candidate Creative Plan generated by Antigravity IDE agent' },
        project: { type: 'object', description: 'Optional canonical project snapshot for reference checking' },
        projectPath: { type: 'string', description: 'Optional path to project JSON' }
      }
    }
  },
  {
    name: 'eme_compile_creative_plan',
    description: 'Compile an accepted Creative Plan into a canonical declarative OperationPlan (120,000 ticks/sec, half-open intervals)',
    inputSchema: {
      type: 'object',
      required: ['creativePlan'],
      properties: {
        creativePlan: { type: 'object', description: 'Validated Creative Plan' },
        project: { type: 'object', description: 'Canonical project snapshot' },
        projectPath: { type: 'string', description: 'Path to project JSON' },
        options: { type: 'object', description: 'Optional compilation options (speechIntervals, musicCriteria, sfxCues)' }
      }
    }
  },
  {
    name: 'eme_dry_run_plan',
    description: 'Non-mutating pre-flight dry run simulation of an OperationPlan against project state',
    inputSchema: {
      type: 'object',
      properties: {
        operationPlan: { type: 'object', description: 'Compiled canonical OperationPlan' },
        creativePlan: { type: 'object', description: 'Alternative: compile and simulate directly from Creative Plan' },
        project: { type: 'object', description: 'Project snapshot' },
        projectPath: { type: 'string', description: 'Path to project JSON' },
        options: { type: 'object' }
      }
    }
  },
  {
    name: 'eme_execute_approved_plan',
    description: 'Authoritatively execute an approved OperationPlan or Creative Plan via OperationExecutor (OP-AUTH preserved)',
    inputSchema: {
      type: 'object',
      required: ['approval_token'],
      properties: {
        approval_token: { type: 'string', description: 'Trusted single-use token for a sealed execution record' },
        operationPlan: { type: 'object', description: 'Compiled canonical OperationPlan' },
        creativePlan: { type: 'object', description: 'Creative Plan to compile and execute' },
        project: { type: 'object', description: 'Project snapshot to mutate' },
        projectPath: { type: 'string', description: 'Path to project JSON' },
        options: { type: 'object' }
      }
    }
  },
  {
    name: 'eme_render_and_verify',
    description: 'Render an immutable approved committed snapshot through the managed native pipeline',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['executionId', 'outputDir'],
      properties: { executionId: { type: 'string' }, outputDir: { type: 'string' } }
    }
  },
  {
    name: 'eme_get_job_status',
    description: 'Inspect status, technical QA report, and SHA-256 integrity of rendered deliverable or job',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Optional job UUID' },
        job_id: { type: 'string', description: 'Durable native job identity alias' }
      }
    }
  },
  {
    name: 'eme_request_user_approval',
    description: 'Prepare a sealed execution for out-of-band review; never issues an authorization token',
    inputSchema: {
      type: 'object',
      properties: {
        creativePlan: { type: 'object', description: 'Validated candidate Creative Plan' },
        operationPlan: { type: 'object', description: 'Alternative exact canonical OperationPlan' },
        operation: { type: 'object', description: 'Alternative atomic operation, including project creation' },
        options: { type: 'object', description: 'All compilation options, sealed into the request' },
        project: { type: 'object', description: 'Optional project snapshot' },
        projectPath: { type: 'string', description: 'Optional bound canonical commit path' }
      }
    }
  }
];

function assertSafePath(targetPath, options = {}) {
  if (!targetPath) return;
  const resolved = path.resolve(targetPath);
  const root = path.resolve(__dirname, '../../');
  const allowedRoots = [
    root,
    path.resolve(root, '..')
  ];
  if (options.allowTmp !== false) {
    allowedRoots.push('/tmp');
    allowedRoots.push(path.resolve('/private/tmp'));
    allowedRoots.push(require('node:os').tmpdir());
  }

  // Check if target or its existing ancestor resolves outside allowed roots
  let current = resolved;
  while (!fs.existsSync(current) && path.dirname(current) !== current) {
    current = path.dirname(current);
  }

  let real = resolved;
  if (fs.existsSync(current)) {
    try {
      const realParent = fs.realpathSync(current);
      const remainder = path.relative(current, resolved);
      real = remainder ? path.join(realParent, remainder) : realParent;
    } catch (_) {}
  }

  const isSafe = allowedRoots.some(allowed => {
    try { allowed=fs.realpathSync(allowed); } catch (_) { allowed=path.resolve(allowed); }
    return real===allowed || real.startsWith(allowed+path.sep);
  });
  if (!isSafe) {
    throw new Error(`Security policy violation: Path "${targetPath}" resolves outside authorized roots.`);
  }
  return resolved;
}

class EmeMcpServer {
  static jobs = new Map();

  static getTools() {
    return TOOL_DEFINITIONS;
  }

  static async handleToolCall(name, args = {}) {
    switch (name) {
      case 'eme_create_project': {
        const { approval_token, approvalToken, token, projectPath, approval, require_token, requireToken, ...params } = args;
        if (projectPath) assertSafePath(projectPath);
        return ExecutionAuthority.execute({
          project: {}, operation: { type: 'create_project', params }, projectPath,
          approvalToken: approval_token || approvalToken || token
        });
      }
      case 'eme_execute_operation': {
        const projectPath = args.projectPath || args.project_path;
        if (projectPath) assertSafePath(projectPath);
        return ExecutionAuthority.execute({ project: args.project, operation: args.operation, projectPath,
          approvalToken: args.approval_token || args.approvalToken || args.token });
      }
      case 'eme_validate_project': {
        return ProjectManager.validateProject(args.project);
      }
      case 'eme_compile_composition': {
        assertSafePath(args.outputDir);
        return HyperFramesCompiler.compile(args.project, args.outputDir);
      }
      case 'eme_render_video': {
        assertSafePath(args.outputMp4Path);
        const tempCompDir = args.outputMp4Path + '.comp';
        HyperFramesCompiler.compile(args.project, tempCompDir);
        const res = HyperFramesRenderer.render(tempCompDir, args.outputMp4Path, { fps: args.fps });
        return {...res,verification:'DEMO_UNVERIFIED',qaPassed:false};
      }
      case 'eme_inspect_frame': {
        assertSafePath(args.outputPngPath);
        return FrameInspector.inspectFromVideo(args.videoPath, args.outputPngPath, {
          time: args.time,
          tick: args.tick
        });
      }
      case 'eme_inspect_project': {
        let proj = args.project;
        if (!proj && args.projectPath) {
          assertSafePath(args.projectPath);
          proj = ProjectManager.loadProject(args.projectPath);
        }
        if (!proj) {
          throw new Error('Either project or projectPath must be provided to eme_inspect_project');
        }
        const validation = ProjectManager.validateProject(proj);
        return {
          id: proj.id,
          title: proj.title,
          revision: proj.revision,
          width: proj.canvas && proj.canvas.width,
          height: proj.canvas && proj.canvas.height,
          fps: proj.canvas && proj.canvas.fps,
          durationTicks: proj.timeline && proj.timeline.durationTicks,
          tracksCount: (proj.tracks || []).length,
          clipsCount: (proj.clips || []).length,
          assetsCount: (proj.assets || []).length,
          validation
        };
      }
      case 'eme_query_capabilities': {
        return HyperFramesCapabilities.getSupported();
      }
      case 'eme_inspect_metadata': {
        assertSafePath(args.videoPath);
        return FrameInspector.inspectVideoMetadata(args.videoPath);
      }
      case 'eme_route_request': {
        const { LayaDecisionAdapter } = await import('../decision-fabric/adapter/laya-decision-adapter.js');
        const adapter = new LayaDecisionAdapter();
        const state = {
          request_text: args.request_text,
          project_context: args.project_context || {}
        };
        const baseline = adapter.baselineRouter.predict(state);
        const layaDecision = await adapter.routeRequest(state);
        const baselineRoute = baseline.answers.intent.choice;
        const layaRoute = layaDecision.decision.route;
        return {
          advisoryOnly: true,
          shadowMode: true,
          baselineRoute,
          layaRoute,
          consensus: baselineRoute === layaRoute,
          decision: layaDecision.decision,
          traceId: layaDecision.traceId,
          timestamp: layaDecision.timestamp
        };
      }
      case 'eme_triage_color_mood': {
        const { LayaDecisionAdapter } = await import('../decision-fabric/adapter/laya-decision-adapter.js');
        const adapter = new LayaDecisionAdapter();
        const res = await adapter.triageColorMood(args.creativeBrief, args.projectContext);
        return {
          ...res,
          advisoryOnly: true,
          shadowMode: true,
          applied: false
        };
      }
      case 'eme_arbitrate_timeline': {
        const { LayaDecisionAdapter } = await import('../decision-fabric/adapter/laya-decision-adapter.js');
        const adapter = new LayaDecisionAdapter();
        const res = await adapter.arbitrateTimeline(args.auditFindings, args.editIntent);
        return {
          ...res,
          advisoryOnly: true,
          shadowMode: true,
          mutated: false
        };
      }
      case 'eme_vtsm_init_tracking': {
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        return service.initTracking(args);
      }
      case 'eme_vtsm_propagate_range': {
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        return service.propagateRange(args);
      }
      case 'eme_vtsm_get_frame_mask': {
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        return service.getFrameMask(args);
      }
      case 'eme_vtsm_cancel_tracking': {
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        return service.cancelTracking(args);
      }
      case 'eme_vtsm_get_session_status': {
        const { getVtsmService } = require('../engine/vtsm-service.js');
        const service = getVtsmService();
        return service.getSessionStatus(args);
      }
      case 'eme_get_project_context': {
        const projectPath = args.projectPath || args.project_path;
        let proj = args.project;
        if (!proj && projectPath) {
          assertSafePath(projectPath);
          proj = ProjectManager.loadProject(projectPath);
        }
        if (!proj) {
          throw new Error('Either project object or valid projectPath must be provided');
        }
        let vtsmSidecar = null;
        const vtsmPath = args.vtsmSidecarPath || args.vtsm_sidecar_path;
        if (vtsmPath) {
          assertSafePath(vtsmPath);
          vtsmSidecar = JSON.parse(fs.readFileSync(vtsmPath, 'utf8'));
        }
        const catalogAssets = AudioCatalog.listAssets({}, path.resolve(__dirname, '../../'));
        const context = CreativeContextBuilder.buildContext({
          brief: args.brief || 'Default Brief',
          project: proj,
          vtsmSidecar,
          availableAssets: catalogAssets
        });
        return { success: true, context };
      }
      case 'eme_get_renderer_capabilities': {
        return {
          success: true,
          capabilities: {
            timebase: {
              ticksPerSecond: 120000,
              endpointConvention: 'half-open'
            },
            visual: {
              targetResolutions: ['1080x1920 (9:16 vertical)', '1920x1080 (16:9 horizontal)'],
              reframingModes: ['subject_centered', 'rule_of_thirds', 'none'],
              opticalDistortion: {
                supported: true,
                model: 'ffmpeg_lenscorrection',
                parameters: ['cx','cy','k1','k2','interpolation']
              },
              curvedTypography: {
                supported: true,
                curves: ['arc'],
                animations: ['none','fade_in_out','curve_reveal','curve_sweep','fade_and_sweep']
              }
            },
            audio: {
              sampleRateHz: 48000,
              bitDepth: 16,
              channels: 'stereo',
              tracks: ['dialogue', 'music', 'sfx'],
              speechDucking: {
                attenuationDb: -24.0,
                attackMs: 300,
                releaseMs: 450,
                gapBridgingMs: 400
              },
              loudnessStandard: 'EBUR128',
              targetLufs: -14.0,
              lufsTolerance: 1.0,
              truePeakCeilingDbFs: -1.0
            },
            backends: require('../renderers/native-capabilities.js').BACKENDS,
            supportedOperations: VERIFIED_SUPPORTED_OPERATIONS
          }
        };
      }
      case 'eme_validate_creative_plan': {
        const plan = args.creativePlan || args.creative_plan || args.plan;
        const projectPath = args.projectPath || args.project_path;
        let proj = args.project;
        if (!proj && projectPath) {
          assertSafePath(projectPath);
          proj = ProjectManager.loadProject(projectPath);
        }
        const validation = CreativePlanValidator.validate(plan, proj);
        let planHash = null;
        if (validation.valid) {
          planHash = CreativePlanValidator.computePlanHash(plan);
        }
        return {
          valid: validation.valid,
          plan_id: plan?.plan_id,
          errors: validation.errors,
          errorCodes: validation.errorCodes,
          diagnostics: validation.diagnostics,
          planHash
        };
      }
      case 'eme_compile_creative_plan': {
        const plan = args.creativePlan || args.creative_plan || args.plan;
        const projectPath = args.projectPath || args.project_path;
        let proj = args.project;
        if (!proj && projectPath) {
          assertSafePath(projectPath);
          proj = ProjectManager.loadProject(projectPath);
        }
        if (!proj) throw new Error('Project snapshot or projectPath is required');
        const cRes = CreativePlanCompiler.compile({
          creativePlan: plan,
          project: proj,
          options: args.options || {}
        });
        return {
          success: cRes.success,
          operation_plan: cRes.operationPlan,
          errors: cRes.errors
        };
      }
      case 'eme_dry_run_plan': {
        const projectPath = args.projectPath || args.project_path;
        let proj = args.project;
        if (!proj && projectPath) {
          assertSafePath(projectPath);
          proj = ProjectManager.loadProject(projectPath);
        }
        if (!proj) throw new Error('Project snapshot or projectPath is required');
        let opPlan = args.operationPlan || args.operation_plan;
        const creativePlan = args.creativePlan || args.creative_plan || args.plan;
        if (!opPlan && creativePlan) {
          const cRes = CreativePlanCompiler.compile({ creativePlan, project: proj, options: args.options || {} });
          if (!cRes.success) return { success: false, errors: cRes.errors };
          opPlan = cRes.operationPlan;
        }
        if (!opPlan) throw new Error('Either operationPlan or creativePlan is required');

        const schema=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../schema/eme-operation-plan.v1.schema.json'),'utf8'));
        const invalid=require('../engine/validator.js').validateObject(opPlan,schema,schema);
        if(invalid.length)return{success:false,stepsChecked:0,error:'ERR_INVALID_OPERATION_PLAN',errors:invalid};
        if(opPlan.project_snapshot.project_id!==proj.id || opPlan.project_snapshot.snapshot_sha256!==require('../creative/execution-record.js').digest(proj))return{success:false,stepsChecked:0,error:'ERR_PROJECT_SNAPSHOT_MISMATCH'};
        let candidate = structuredClone(proj);
        let stepsChecked = 0;
        const basePlanRev = opPlan.project_snapshot?.base_revision;
        if (basePlanRev !== undefined && basePlanRev !== candidate.revision) {
          return {
            success: false,
            stepsChecked: 0,
            error: `ERR_STALE_REVISION: expected base ${basePlanRev}, project at ${candidate.revision}`
          };
        }
        for (const op of opPlan.operations) {
          const execRes = OperationExecutor.execute(candidate, {
            type: op.type,
            params: op.params,
            expectedBaseRevision: (op.step_index === 0 && basePlanRev !== undefined) ? basePlanRev : candidate.revision
          });
          if (!execRes.success) {
            return {
              success: false,
              stepsChecked,
              error: `Dry run simulation failed at step ${op.step_index}: ${execRes.error}`
            };
          }
          candidate = execRes.project;
          stepsChecked++;
        }
        return {
          success: true,
          dry_run: true,
          stepsChecked,
          original_revision: proj.revision,
          projected_revision: candidate.revision,
          projectedRevision: candidate.revision
        };
      }
      case 'eme_request_user_approval': {
        const creativePlan = args.creativePlan || args.creative_plan || args.plan;
        const operationPlan = args.operationPlan || args.operation_plan;
        const operation = args.operation;
        const projectPath = args.projectPath || args.project_path;
        let project = args.project;
        if (projectPath) {
          assertSafePath(projectPath);
          if (fs.existsSync(projectPath)) {
            const disk = ProjectManager.loadProject(projectPath);
            if (project && require('../creative/execution-record.js').digest(project) !== require('../creative/execution-record.js').digest(disk)) {
              throw new Error('ERR_PROJECT_SNAPSHOT_MISMATCH: supplied project differs from disk');
            }
            project = disk;
          }
        }
        if (!project && operation?.type === 'create_project') project = {};
        if (!project) throw new Error('Project snapshot or projectPath is required');
        const pending = ApprovalAuthority.createPendingRequest({
          creativePlan, operationPlan, operation, project, projectPath,
          options: args.options || {}, assetBaseDir: path.resolve(__dirname, '../..')
        });
        return { success: true, ...pending,
          message: 'Pending review only. Confirm the sealed execution through bin/eme-confirm.js.' };
      }
      case 'eme_execute_approved_plan': {
        const projectPath = args.projectPath || args.project_path;
        if (projectPath) assertSafePath(projectPath);
        return ExecutionAuthority.execute({
          creativePlan: args.creativePlan || args.creative_plan || args.plan,
          operationPlan: args.operationPlan || args.operation_plan,
          project: args.project, projectPath, options: args.options,
          approvalToken: args.approval_token || args.approvalToken || args.token
        });
      }
      case 'eme_render_and_verify': {
        const allowed = ['executionId', 'outputDir'];
        for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`ERR_RENDER_OVERRIDE_FORBIDDEN: ${key}`);
        if (!args.executionId || !args.outputDir) throw new Error('ERR_COMMITTED_SNAPSHOT_REQUIRED: executionId and outputDir required');
        assertSafePath(args.outputDir);
        return new (require('../prompt-core/native-delivery.js').NativeDelivery)().run(args);
      }
      case 'eme_get_job_status': {
        if (Object.keys(args).some(k => !['jobId','job_id'].includes(k))) throw new Error('ERR_UNVERIFIED_ARTIFACT: Status requires a durable native job identity');
        return new (require('../prompt-core/native-delivery.js').NativeDelivery)().getStatus(args.jobId || args.job_id);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  static startStdio() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', async (line) => {
      if (!line.trim()) return;
      try {
        const req = JSON.parse(line);
        const response = await this.handleJsonRpc(req);
        if (response) {
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } catch (err) {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error', data: err.message }
        }) + '\n');
      }
    });
  }

  static async handleJsonRpc(req) {
    if(!req || typeof req!=='object' || req.jsonrpc!=='2.0' || typeof req.method!=='string')return{jsonrpc:'2.0',id:req?.id ?? null,error:{code:-32600,message:'Invalid Request'}};
    const { id, method, params } = req;
    if(id===undefined)return null; // Notifications never invoke a mutation or receive a response.
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'eme-mcp-server', version: '0.1.0' },
          capabilities: { tools: {} }
        }
      };
    }
    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOL_DEFINITIONS }
      };
    }
    if (method === 'tools/call') {
      try {
        const result = await this.handleToolCall(params.name, params.arguments);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
          }
        };
      } catch (e) {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: e.message }
        };
      }
    }
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    };
  }
}

if (require.main === module) {
  EmeMcpServer.startStdio();
}

module.exports = {
  EmeMcpServer,
  TOOL_DEFINITIONS,
  assertSafePath
};
