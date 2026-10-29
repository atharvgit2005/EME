#!/usr/bin/env node

/**
 * Editing Mechanics Engine (EME) - CLI Entry Point
 */

const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../engine/project.js');
const { OperationExecutor } = require('../engine/operations.js');
const { HyperFramesCompiler } = require('../renderers/hyperframes/compiler.js');
const { HyperFramesRenderer } = require('../renderers/hyperframes/renderer.js');
const { FrameInspector } = require('../renderers/inspector.js');

function printUsage() {
  console.log(`
Editing Mechanics Engine (EME) CLI v0.1.0-rc1

USAGE:
  eme <command> [options]

COMMANDS:
  init <project.json>          Withheld: use approved create_project execution
  deliver-committed            Verify/publish --execution-id <id> --output-dir <directory>
  delivery-status              Inspect --job-id <native job id>
  execute-approved             Execute a sealed record with --approval-token <token>
  validate <project.json>      Validate project schema and semantic invariants
  inspect <project.json>       Inspect project metadata, tracks, clips, and assets
  compile <project.json>       Compile canonical project to HyperFrames composition
  render <project.json>        Compile and render project to MP4 video
  inspect-frame <target>       Extract frame at specific time or tick to PNG
  capabilities                 List supported renderer formats, blend modes, and easings
  prompt inspect <project.json> Inspect prompt intent, constraints, and brief readiness (non-executing)
  editor, serve [project.json] Start EME Visual Control Surface HTTP server
  version, --version           Print EME version
  help, --help                 Show this help message

OPTIONS:
  --out <path>                 Output directory or file
  --width <w>                  Canvas width (default: 1080)
  --height <h>                 Canvas height (default: 1920)
  --fps <fps>                  Frame rate (default: 60)
  --duration-ticks <ticks>     Duration in integer ticks (default: 360000 = 3s)
  --title <title>              Project title
  --tick <ticks>               Frame extraction tick offset
  --time <seconds>             Frame extraction timestamp in seconds

EXAMPLES:
  eme init my-project.json --width 1080 --height 1920 --fps 60
  eme validate my-project.json
  eme inspect my-project.json
  eme doctor
  eme capabilities
  eme render my-project.json --out out.mp4
`);
}

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed[key] = args[i + 1];
        i++;
      } else {
        parsed[key] = true;
      }
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

function runCli(customArgs = null) {
  const rawArgs = customArgs || process.argv.slice(2);
  const args = parseArgs(rawArgs);
  const command = args._[0];

  if (args.version || command === 'version' || command === '--version') {
    const pkg = require('../../package.json');
    console.log(`Editing Mechanics Engine (EME) v${pkg.version}`);
    process.exit(0);
  }

  if (!command || command === 'help' || args.help || command === '--help') {
    printUsage();
    process.exit(0);
  }

  try {
    // Legacy prompt workflows may compile/execute more than the reviewed change.
    // Keep planning/read paths, but never let --execute or a boolean approve commits.
    if (command === 'prompt') {
      const sub = args._[1];
      const sessionAction = args._[2];
      if ((sub === 'plan' && args.execute) ||
          ['render', 'auto', 'revise', 'candidates', 'generate-candidates', 'select-candidate'].includes(sub) ||
          (sub === 'session' && sessionAction && sessionAction !== 'inspect')) {
        throw new Error('ERR_APPROVAL_REQUIRED: Legacy workflow commits are withheld. Prepare exact operations through MCP and use eme execute-approved --approval-token <token>.');
      }
    }
    switch (command) {
      case 'deliver-committed': {
        const allowed=['_','execution-id','output-dir'];
        if(Object.keys(args).some(k=>!allowed.includes(k)) || !args['execution-id'] || !args['output-dir'])throw new Error('Use deliver-committed --execution-id <id> --output-dir <directory>; editorial overrides are forbidden');
        const result=new (require('../prompt-core/native-delivery.js').NativeDelivery)().run({executionId:args['execution-id'],outputDir:args['output-dir']});
        console.log(JSON.stringify(result,null,2));if(!result.success)process.exitCode=1;break;
      }
      case 'delivery-status': {
        const result=new (require('../prompt-core/native-delivery.js').NativeDelivery)().getStatus(args['job-id']);console.log(JSON.stringify(result,null,2));break;
      }
      case 'execute-approved': {
        const { ExecutionAuthority } = require('../creative/execution-authority.js');
        const result = ExecutionAuthority.execute({ projectPath: args.project,
          approvalToken: args['approval-token'] });
        console.log(JSON.stringify(result));
        if (!result.success) process.exitCode = 1;
        break;
      }
      case 'doctor': {
        const { EnvironmentResolver } = require('../engine/environment.js');
        const report = EnvironmentResolver.runDoctor();
        console.log('EME System & Runtime Diagnostic (Doctor):\n');
        console.log(`  Node.js:      ${report.node.ok ? '✔' : '✖'} ${report.node.version} (${report.node.path})`);
        console.log(`  FFmpeg:       ${report.ffmpeg.ok ? '✔' : '✖'} ${report.ffmpeg.version || 'Not found'}`);
        console.log(`  ffprobe:      ${report.ffprobe.ok ? '✔' : '✖'} ${report.ffprobe.version || 'Not found'}`);
        console.log(`  HyperFrames:  ${report.hyperframes.ok ? '✔' : '✖'} v${report.hyperframes.version} (${report.hyperframes.resolvedCmd || 'Unresolved'})`);

        const allOk = report.node.ok && report.ffmpeg.ok && report.ffprobe.ok && report.hyperframes.ok;
        console.log(`\nOverall Health: ${allOk ? '✅ READY FOR PRODUCTION' : '⚠️ PREREQUISITE WARNINGS DETECTED'}\n`);
        if (!allOk) process.exit(1);
        break;
      }

      case 'capabilities': {
        const { HyperFramesCapabilities } = require('../renderers/hyperframes/capabilities.js');
        const caps = HyperFramesCapabilities.getSupported();
        console.log('EME Renderer Capabilities:\n');
        console.log(`  Formats:     ${caps.formats.join(', ')}`);
        console.log(`  Media Types: ${caps.mediaTypes.join(', ')}`);
        console.log(`  Blend Modes: ${caps.blendModes.join(', ')}`);
        console.log(`  Filters:     ${caps.filters.join(', ')}`);
        console.log(`  Easings:     ${caps.easings.join(', ')}`);
        break;
      }

      case 'inspect': {
        const targetPath = args._[1];
        if (!targetPath) {
          console.error('Error: specify project JSON to inspect: eme inspect <project.json>');
          process.exit(1);
        }
        const project = ProjectManager.loadProject(targetPath);
        const validation = ProjectManager.validateProject(project);
        console.log(`Project Summary: ${project.title || targetPath}`);
        console.log(`  ID:            ${project.id}`);
        console.log(`  Schema Ver:    ${project.schemaVersion}`);
        console.log(`  Revision:      ${project.revision}`);
        console.log(`  Resolution:    ${project.canvas ? project.canvas.width : 1080}x${project.canvas ? project.canvas.height : 1920}`);
        console.log(`  Tracks:        ${(project.tracks || []).length}`);
        console.log(`  Clips:         ${(project.clips || []).length}`);
        console.log(`  Assets:        ${(project.assets || []).length}`);
        console.log(`  Valid:         ${validation.valid ? '✔ YES' : '❌ NO (' + validation.errors.length + ' errors)'}`);
        break;
      }

      case 'init': {
        throw new Error('ERR_APPROVAL_REQUIRED: Prepare a create_project operation through eme_request_user_approval, confirm it with eme-confirm, then use execute-approved.');
      }
      case 'validate': {
        const targetPath = args._[1];
        if (!targetPath) {
          console.error('Error: specify project JSON to validate: eme validate <project.json>');
          process.exit(1);
        }
        const project = ProjectManager.loadProject(targetPath);
        const res = ProjectManager.validateProject(project);
        if (res.valid) {
          console.log(`✅ Project ${targetPath} is strictly valid!`);
          console.log(`   Schema Version: ${project.schemaVersion} | Revision: ${project.revision}`);
          console.log(`   Tracks: ${project.tracks.length} | Clips: ${project.clips.length} | Assets: ${project.assets.length}`);
        } else {
          console.error(`❌ Project validation failed with ${res.errors.length} error(s):`);
          res.errors.forEach(e => console.error(`   - ${e}`));
          process.exit(1);
        }
        break;
      }

      case 'compile': {
        const targetPath = args._[1];
        const outDir = args.out || 'dist/composition';
        if (!targetPath) {
          console.error('Error: specify project JSON to compile: eme compile <project.json> --out <dir>');
          process.exit(1);
        }
        const project = ProjectManager.loadProject(targetPath);
        const compiled = HyperFramesCompiler.compile(project, outDir);
        console.log(`✅ Compiled HyperFrames composition to: ${compiled.outputDir}`);
        console.log(`   Entry: ${compiled.entryHtmlPath} | Duration: ${compiled.durationSeconds}s @ ${compiled.fps}fps`);
        break;
      }

      case 'render': {
        if(args.deliver || args.delivery || args['closed-loop'])throw new Error('ERR_LEGACY_DELIVERY_WITHHELD: Use deliver-committed --execution-id <id> --output-dir <directory>');
        const targetPath = args._[1];
        const outMp4 = args.out || 'dist/rendered.mp4';
        if (!targetPath) {
          console.error('Error: specify project JSON to render: eme render <project.json> --out <output.mp4>');
          process.exit(1);
        }
        const project = ProjectManager.loadProject(targetPath);

        const tempCompDir = path.join(path.dirname(path.resolve(outMp4)), '.eme-comp-' + Date.now());
        console.log(`Compiling project to intermediate composition: ${tempCompDir}`);
        HyperFramesCompiler.compile(project, tempCompDir);

        console.log(`Rendering MP4 via HyperFrames...`);
        const renderRes = HyperFramesRenderer.render(tempCompDir, outMp4);
        console.log(`Demonstration export (UNVERIFIED): ${renderRes.outputPath}`);
        console.log(`   Elapsed: ${renderRes.elapsedMs}ms`);
        if (renderRes.metadata.verified) {
          console.log(`   Resolution: ${renderRes.metadata.width}x${renderRes.metadata.height} | Duration: ${renderRes.metadata.duration}s | Codec: ${renderRes.metadata.codec}`);
        }
        break;
      }

      case 'inspect-frame': {
        const target = args._[1];
        const outPng = args.out || 'inspected-frame.png';
        if (!target) {
          console.error('Error: specify target video or project: eme inspect-frame <target> --out <frame.png>');
          process.exit(1);
        }
        const opts = {};
        if (args.tick !== undefined) opts.tick = parseInt(args.tick, 10);
        if (args.time !== undefined) opts.time = parseFloat(args.time);

        const res = FrameInspector.inspectFromVideo(target, outPng, opts);
        console.log(`✅ Inspected frame extracted to: ${res.framePath}`);
        console.log(`   Timestamp: ${res.timestampSec}s | File Size: ${res.sizeBytes} bytes`);
        break;
      }

      case 'verify-artifacts': {
        const manifestPath = args._[1];
        if (!manifestPath) {
          console.error('Error: specify manifest path: eme verify-artifacts <manifest.json>');
          process.exit(1);
        }
        const { ArtifactVerifier } = require('../orchestration/artifact-verifier.js');
        const res = ArtifactVerifier.verifyManifest(manifestPath);
        if (res.valid) {
          console.log(`✅ Manifest verified successfully: ${path.resolve(manifestPath)}`);
          console.log(`   Job ID: ${res.manifest.jobId} | Project ID: ${res.manifest.projectId} | QA Score: ${res.manifest.qaScore}/100`);
          console.log(`   Output Hash Verified: ${res.manifest.outputSha256}`);
        } else {
          console.error(`❌ Manifest verification failed:`);
          for (const err of res.errors) console.error(`   - ${err}`);
          process.exit(1);
        }
        break;
      }

      case 'decision-fabric': {
        const sub = args._[1];
        if (sub === 'shadow') {
          const inputFile = args.input || path.resolve(__dirname, '../decision-fabric/data/test.jsonl');
          const outputFile = args.out || args.output || path.resolve(__dirname, '../decision-fabric/reports/shadow-run.json');

          if (!fs.existsSync(inputFile)) {
            console.error(`Error: input file not found: ${inputFile}`);
            process.exit(1);
          }

          (async () => {
            const { LayaDecisionAdapter } = await import('../decision-fabric/adapter/laya-decision-adapter.js');
            const adapter = new LayaDecisionAdapter();
            const lines = fs.readFileSync(inputFile, 'utf8').trim().split('\n').filter(Boolean);
            const records = lines.map(l => JSON.parse(l));

            let agreeCount = 0;
            const comparisons = [];
            const startTime = performance.now();

            for (const r of records) {
              const state = r.state || { request_text: r.text || '' };
              const t0 = performance.now();
              const baseRes = adapter.baselineRouter.predict(state);
              const layaRes = await adapter.routeRequest(state);
              const t1 = performance.now();

              const baseRoute = baseRes.answers.intent.choice;
              const layaRoute = layaRes.decision.route;
              const agrees = baseRoute === layaRoute;
              if (agrees) agreeCount++;

              comparisons.push({
                requestSnippet: (state.request_text || '').substring(0, 80),
                baselineRoute: baseRoute,
                layaRoute: layaRoute,
                consensus: agrees,
                layaAction: layaRes.decision.action,
                latencyMs: Number((t1 - t0).toFixed(3))
              });
            }

            const totalDuration = performance.now() - startTime;
            const consensusRate = Number((agreeCount / records.length).toFixed(4));

            const report = {
              version: '1.0.0',
              timestamp: new Date().toISOString(),
              mode: 'shadow_diagnostic',
              inputFile: path.resolve(inputFile),
              totalCases: records.length,
              consensusRate,
              agreementCount: agreeCount,
              disagreementCount: records.length - agreeCount,
              totalDurationMs: Number(totalDuration.toFixed(2)),
              averageLatencyMs: Number((totalDuration / records.length).toFixed(3)),
              comparisons
            };

            const outDir = path.dirname(outputFile);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8');

            console.log(`\n=== EME Decision Fabric Shadow Run ===`);
            console.log(`Evaluated: ${records.length} cases`);
            console.log(`Consensus: ${(consensusRate * 100).toFixed(1)}% (${agreeCount}/${records.length} agreement)`);
            console.log(`Disagreements: ${records.length - agreeCount}`);
            console.log(`Average Latency: ${report.averageLatencyMs} ms`);
            console.log(`Report written: ${path.resolve(outputFile)}\n`);
          })().catch(err => {
            console.error(`❌ Shadow run failed: ${err.message}`);
            process.exit(1);
          });
          return;
        } else {
          console.error(`Usage: eme decision-fabric shadow --input <fixtures.jsonl> --out <report.json>`);
          process.exit(1);
        }
      }

      case 'prompt': {
        const subCommand = args._[1];
        if (subCommand === 'inspect') {
          const projectFile = args.project || args._[2];
          const rawPrompt = args.prompt;

          if (!projectFile) {
            console.error('❌ Error: Project file is required. Specify via --project <file> or as positional argument.');
            process.exit(1);
          }
          if (!rawPrompt) {
            console.error('❌ Error: Prompt text is required. Specify via --prompt "<text>".');
            process.exit(1);
          }

          const resolvedPath = path.resolve(projectFile);
          if (!fs.existsSync(resolvedPath)) {
            console.error(`❌ Error: Project file not found at ${resolvedPath}`);
            process.exit(1);
          }

          const project = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
          const { compileEditBrief } = require('../prompt-core/index.js');
          const result = compileEditBrief({ rawPrompt, project });

          if (args.json) {
            console.log(JSON.stringify(result.brief, null, 2));
            break;
          }

          console.log('\n=== EME Prompt Inspection (Non-Executing) ===');
          console.log(`Brief ID:         ${result.brief.brief_id}`);
          console.log(`Project:          ${result.brief.project_snapshot.project_id} (rev ${result.brief.project_snapshot.base_revision})`);
          console.log(`Snapshot SHA-256: ${result.brief.project_snapshot.snapshot_sha256.substring(0, 16)}...`);
          console.log(`Goal:             ${result.brief.goal.objective}`);
          console.log(`Requested Changes: ${result.brief.requested_changes.length}`);
          result.brief.requested_changes.forEach((ch, idx) => {
            console.log(`  [${idx + 1}] (${ch.domain}) ${ch.description} -> targets: [${ch.target_ids.join(', ')}]`);
          });
          console.log(`Hard Constraints: ${result.brief.constraints.length}`);
          result.brief.constraints.forEach((c, idx) => {
            console.log(`  [${idx + 1}] ${c.constraint_id} (${c.type}) on_violation=${c.on_violation}: "${c.origin?.source_text}"`);
          });
          if (result.brief.ambiguities.length > 0) {
            console.log(`Ambiguities/Conflicts: ${result.brief.ambiguities.length}`);
            result.brief.ambiguities.forEach((a, idx) => {
              console.log(`  [${idx + 1}] [${a.kind}] ${a.description} (blocking: ${a.is_blocking})`);
            });
          }
          console.log(`\nReadiness Status: ${result.validation.status.toUpperCase()}`);
          if (result.validation.blocking_issue_ids.length > 0) {
            console.log(`Blocking Issues:  ${result.validation.blocking_issue_ids.join(', ')}`);
          }
          console.log(`Schema Valid:     ${result.valid ? '✔ VALID' : '✖ INVALID'}`);

          if (args.out) {
            const outPath = path.resolve(args.out);
            fs.writeFileSync(outPath, JSON.stringify(result.brief, null, 2), 'utf8');
            console.log(`\nBrief written to: ${outPath}`);
          }
          console.log('');
          break;
        } else if (subCommand === 'plan') {
          const projectFile = args.project || args._[2];
          const rawPrompt = args.prompt;
          const briefFile = args.brief;
          const beatFile = args['beat-analysis'] || args.beat;

          if (!projectFile) {
            console.error('❌ Error: Project file is required. Specify via --project <file> or as positional argument.');
            process.exit(1);
          }

          const resolvedProjectPath = path.resolve(projectFile);
          if (!fs.existsSync(resolvedProjectPath)) {
            console.error(`❌ Error: Project file not found at ${resolvedProjectPath}`);
            process.exit(1);
          }

          const project = JSON.parse(fs.readFileSync(resolvedProjectPath, 'utf8'));
          const { compileEditBrief, OperationPlanCompiler } = require('../prompt-core/index.js');

          let beatAnalysis;
          if (beatFile) {
            const resolvedBeatPath = path.resolve(beatFile);
            if (!fs.existsSync(resolvedBeatPath)) {
              console.error(`❌ Error: Beat analysis file not found at ${resolvedBeatPath}`);
              process.exit(1);
            }
            beatAnalysis = JSON.parse(fs.readFileSync(resolvedBeatPath, 'utf8'));
          }

          let brief;
          if (briefFile) {
            const resolvedBriefPath = path.resolve(briefFile);
            if (!fs.existsSync(resolvedBriefPath)) {
              console.error(`❌ Error: Brief file not found at ${resolvedBriefPath}`);
              process.exit(1);
            }
            brief = JSON.parse(fs.readFileSync(resolvedBriefPath, 'utf8'));
          } else if (rawPrompt) {
            const briefRes = compileEditBrief({ rawPrompt, project });
            brief = briefRes.brief;
          } else {
            console.error('❌ Error: Either --prompt "<text>" or --brief <file> is required.');
            process.exit(1);
          }

          const plan = OperationPlanCompiler.compilePlan({ brief, project, beatAnalysis });

          if (args.json) {
            console.log(JSON.stringify(plan, null, 2));
          } else {
            console.log('\n=== EME Operation Plan Compilation (PF-02 & PF-03) ===');
            console.log(`Plan ID:          ${plan.plan_id}`);
            console.log(`Source Brief:     ${plan.source_brief_id}`);
            console.log(`Project:          ${plan.project_snapshot.project_id} (rev ${plan.project_snapshot.base_revision})`);
            console.log(`Target Duration:  ${plan.target_duration_ticks} ticks (${plan.target_duration_ticks / 120000}s)`);
            console.log(`Operations Count: ${plan.operations.length}`);
            plan.operations.forEach((op, idx) => {
              console.log(`  [${idx + 1}] (${op.type}) target: ${op.target_id} -> ${op.expected_effects?.description || JSON.stringify(op.params)}`);
            });
            console.log(`\nDry-Run Status:   ${plan.dry_run.success ? '✔ SUCCESS' : '✖ FAILED'}`);
            console.log(`Simulated Steps:  ${plan.dry_run.simulated_steps}/${plan.operations.length}`);
            console.log(`Final Revision:   ${plan.dry_run.final_revision}`);
            console.log(`Affected Clips:   [${plan.dry_run.affected_clips.join(', ')}]`);
            console.log(`Timing Result:    ${plan.dry_run.timing_implications.duration_ticks} ticks (${plan.dry_run.timing_implications.duration_seconds}s)`);
            console.log(`Plan Validation:  ${plan.validation.status.toUpperCase()}`);

            if (plan.validation.blocking_issue_ids.length > 0) {
              console.log(`Blocking Issues:  ${plan.validation.blocking_issue_ids.join(', ')}`);
            }
          }

          if (args.out) {
            const outPath = path.resolve(args.out);
            fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
            if (!args.json) console.log(`\nPlan saved to: ${outPath}`);
          }

          if (args.execute && plan.validation.status === 'ready') {
            console.log('\nExecuting approved plan via OperationExecutor...');
            const execRes = OperationPlanCompiler.executePlan(project, plan, { atomic: args.atomic !== false });
            if (execRes.success) {
              console.log(`✅ Execution complete: ${execRes.executedSteps} steps applied. New revision: ${execRes.project.revision}`);
              if (args.save) {
                fs.writeFileSync(resolvedProjectPath, JSON.stringify(execRes.project, null, 2), 'utf8');
                console.log(`Project saved to: ${resolvedProjectPath}`);
              }
            } else {
              console.error(`❌ Execution failed (status: ${execRes.status}) at step ${execRes.failedStepIndex}: ${execRes.error}`);
              process.exit(1);
            }
          }
          console.log('');
          break;
        } else if (subCommand === 'render') {
          const projectFile = args.project || args._[2];
          const planFile = args.plan;
          const beatFile = args['beat-analysis'] || args.beat;
          const outDir = args.out || 'artifacts/deliverables';
          const profileFile = args.profile;

          if (!projectFile) {
            console.error('❌ Error: Project file is required. Specify via --project <file>.');
            process.exit(1);
          }
          if (!planFile) {
            console.error('❌ Error: Approved operation plan file is required. Specify via --plan <file>.');
            process.exit(1);
          }

          const resolvedProjectPath = path.resolve(projectFile);
          const resolvedPlanPath = path.resolve(planFile);

          if (!fs.existsSync(resolvedProjectPath)) {
            console.error(`❌ Error: Project file not found at ${resolvedProjectPath}`);
            process.exit(1);
          }
          if (!fs.existsSync(resolvedPlanPath)) {
            console.error(`❌ Error: Plan file not found at ${resolvedPlanPath}`);
            process.exit(1);
          }

          const project = JSON.parse(fs.readFileSync(resolvedProjectPath, 'utf8'));
          const plan = JSON.parse(fs.readFileSync(resolvedPlanPath, 'utf8'));

          let beatAnalysis;
          if (beatFile) {
            const resolvedBeatPath = path.resolve(beatFile);
            if (fs.existsSync(resolvedBeatPath)) {
              beatAnalysis = JSON.parse(fs.readFileSync(resolvedBeatPath, 'utf8'));
            }
          }

          let outputProfile = {};
          if (profileFile) {
            const resolvedProfilePath = path.resolve(profileFile);
            if (fs.existsSync(resolvedProfilePath)) {
              outputProfile = JSON.parse(fs.readFileSync(resolvedProfilePath, 'utf8'));
            }
          }

          const { RenderOrchestrator } = require('../prompt-core/index.js');

          if (!args.json) {
            console.log('\n=== EME Closed-Loop Render & QA (PF-04) ===');
            console.log(`Project:       ${project.id || 'unnamed'} (rev ${project.revision})`);
            console.log(`Plan Hash:     ${plan.plan_id || 'unknown'}`);
            console.log(`Destination:   ${outDir}`);
          }

          const closedLoopRes = RenderOrchestrator.runClosedLoop({
            project,
            plan,
            beatAnalysis,
            outputProfile,
            outputDir
          });

          if (args.json) {
            console.log(JSON.stringify(closedLoopRes, null, 2));
          } else {
            if (closedLoopRes.success) {
              console.log(`\n✅ Render & Independent QA Verification Passed!`);
              console.log(`Deliverable:   ${closedLoopRes.deliverablePath}`);
              console.log(`Manifest:      ${closedLoopRes.manifestPath}`);
              console.log(`File SHA-256:  ${closedLoopRes.manifest.deliverable.sha256}`);
              console.log(`QA Score:      ${closedLoopRes.qaReport.score}/100 (Decision: ${closedLoopRes.qaReport.decision})`);
              console.log(`Checks Passed: ${closedLoopRes.manifest.qa_certification.passed_checks}/${closedLoopRes.manifest.qa_certification.total_checks}`);
            } else {
              console.error(`\n❌ Render & Verification Failed: ${closedLoopRes.error}`);
              if (closedLoopRes.qaReport) {
                console.error(`QA Decision:   ${closedLoopRes.qaReport.decision} (Score: ${closedLoopRes.qaReport.score}/100)`);
                (closedLoopRes.qaReport.checks || []).filter(c => c.status === 'failed').forEach(c => {
                  console.error(`   - [${c.severity}] ${c.name}: ${c.detail}`);
                });
              }
              process.exit(1);
            }
          }
          console.log('');
          break;
        } else if (subCommand === 'auto') {
          const projectFile = args.project || args._[2];
          const rawPrompt = args.prompt;
          const beatFile = args['beat-analysis'] || args.beat;
          const outDir = args.out || 'artifacts/deliverables';
          const profileFile = args.profile;

          if (!projectFile) {
            console.error('❌ Error: Project file is required. Specify via --project <file>.');
            process.exit(1);
          }
          if (!rawPrompt) {
            console.error('❌ Error: Natural language prompt is required. Specify via --prompt "<text>".');
            process.exit(1);
          }

          const resolvedProjectPath = path.resolve(projectFile);
          if (!fs.existsSync(resolvedProjectPath)) {
            console.error(`❌ Error: Project file not found at ${resolvedProjectPath}`);
            process.exit(1);
          }

          const project = JSON.parse(fs.readFileSync(resolvedProjectPath, 'utf8'));

          let beatAnalysis;
          if (beatFile) {
            const resolvedBeatPath = path.resolve(beatFile);
            if (fs.existsSync(resolvedBeatPath)) {
              beatAnalysis = JSON.parse(fs.readFileSync(resolvedBeatPath, 'utf8'));
            }
          }

          let outputProfile = {};
          if (profileFile) {
            const resolvedProfilePath = path.resolve(profileFile);
            if (fs.existsSync(resolvedProfilePath)) {
              outputProfile = JSON.parse(fs.readFileSync(resolvedProfilePath, 'utf8'));
            }
          }

          const { PromptDeliverableOrchestrator } = require('../prompt-core/index.js');

          if (!args.json) {
            console.log('\n=== EME Autonomous Prompt-to-Verified-Deliverable (PF-05) ===');
            console.log(`Prompt:        "${rawPrompt}"`);
            console.log(`Base Project:  ${project.id || 'unnamed'} (rev ${project.revision})`);
            console.log(`Destination:   ${outDir}`);
          }

          const runDoc = PromptDeliverableOrchestrator.runAutonomous({
            rawPrompt,
            project,
            beatAnalysis,
            outputProfile,
            outputDir,
            options: { atomic: args.atomic !== false }
          });

          if (args.json) {
            console.log(JSON.stringify(runDoc, null, 2));
          } else {
            console.log(`\nRun ID:              ${runDoc.run_id}`);
            console.log(`Execution Status:    ${runDoc.execution.status.toUpperCase()} (${runDoc.execution.executed_steps} steps, rev ${runDoc.project_snapshot.final_revision})`);
            console.log(`Plan Hash:           ${runDoc.plan_summary.canonical_plan_hash}`);
            console.log(`Media QA Decision:   ${runDoc.qa_summary.decision} (Score: ${runDoc.qa_summary.score}/100, ${runDoc.qa_summary.passed_checks}/${runDoc.qa_summary.total_checks} gates)`);
            console.log(`Intent Verification: ${runDoc.intent_verification.status.toUpperCase()}`);
            runDoc.intent_verification.criteria.forEach(c => {
              console.log(`  - [${c.status === 'passed' ? '✔' : '✖'}] ${c.criterion_id}: ${c.detail}`);
            });

            if (runDoc.status === 'verified') {
              console.log(`\n🎉 CERTIFIED DELIVERABLE PUBLISHED!`);
              console.log(`Media File:          ${runDoc.deliverable?.media_path}`);
              console.log(`SHA-256:             ${runDoc.deliverable?.sha256}`);
              console.log(`Manifest:            ${runDoc.deliverable?.manifest_path}`);
              console.log(`Delivery Run Doc:    ${runDoc._runPath}`);
            } else {
              console.error(`\n❌ Autonomous Execution Failed (Terminal Status: ${runDoc.status})`);
              if (runDoc.diagnostics.length > 0) {
                console.error('Diagnostics:');
                runDoc.diagnostics.forEach(d => console.error(`  - ${d}`));
              }
              process.exit(1);
            }
          }
          console.log('');
          break;
        } else if (subCommand === 'revise') {
          const projectFile = args.project || args._[2];
          const priorRunFile = args['prior-run'] || args.prior;
          const rawPrompt = args.prompt;
          const beatFile = args['beat-analysis'] || args.beat;
          const outDir = args.out || 'artifacts/deliverables';

          if (!projectFile) {
            console.error('❌ Error: Project file is required. Specify via --project <file>.');
            process.exit(1);
          }
          if (!priorRunFile) {
            console.error('❌ Error: Prior run document is required. Specify via --prior-run <file>.');
            process.exit(1);
          }
          if (!rawPrompt) {
            console.error('❌ Error: Natural language revision prompt is required. Specify via --prompt "<text>".');
            process.exit(1);
          }

          const project = JSON.parse(fs.readFileSync(path.resolve(projectFile), 'utf8'));
          const priorRunDoc = JSON.parse(fs.readFileSync(path.resolve(priorRunFile), 'utf8'));

          let beatAnalysis;
          if (beatFile && fs.existsSync(path.resolve(beatFile))) {
            beatAnalysis = JSON.parse(fs.readFileSync(path.resolve(beatFile), 'utf8'));
          }

          const { RevisionOrchestrator } = require('../prompt-core/index.js');

          if (!args.json) {
            console.log('\n=== EME Conversational Revision & Iteration (PF-06) ===');
            console.log(`Prompt:        "${rawPrompt}"`);
            console.log(`Prior Run ID:  ${priorRunDoc.run_id}`);
            console.log(`Base Project:  ${project.id || 'unnamed'} (rev ${project.revision})`);
            console.log(`Destination:   ${outDir}`);
          }

          const revDoc = RevisionOrchestrator.runRevision({
            rawPrompt,
            priorRunDoc,
            project,
            beatAnalysis,
            outputDir
          });

          if (args.json) {
            console.log(JSON.stringify(revDoc, null, 2));
          } else {
            console.log(`\nRevision Run ID:     ${revDoc.revision_run_id}`);
            console.log(`Prior Delivery ID:   ${revDoc.prior_run_id}`);
            console.log(`Execution Status:    ${revDoc.execution_result.status.toUpperCase()} (rev ${revDoc.execution_result.base_revision} -> ${revDoc.execution_result.final_revision})`);
            console.log(`Terminal Status:     ${revDoc.status.toUpperCase()}`);

            if (revDoc.status === 'verified') {
              console.log(`\n🎉 CERTIFIED REVISED DELIVERABLE PUBLISHED!`);
              console.log(`Media File:          ${revDoc.deliverable?.media_path}`);
              console.log(`SHA-256:             ${revDoc.deliverable?.sha256}`);
              console.log(`Manifest:            ${revDoc.deliverable?.manifest_path}`);
            } else if (revDoc.status === 'conflict_blocked') {
              console.error(`\n⛔ Revision Blocked Due to Hard Constraint Conflict:`);
              revDoc.diagnostics.forEach(d => console.error(`  - ${d}`));
              process.exit(1);
            } else {
              console.error(`\n❌ Revision Execution Failed (Status: ${revDoc.status})`);
              revDoc.diagnostics.forEach(d => console.error(`  - ${d}`));
              process.exit(1);
            }
          }
          console.log('');
          break;
        } else if (subCommand === 'candidates' || subCommand === 'generate-candidates') {
          const projectFile = args.project || args._[2];
          const rawPrompt = args.prompt;
          const beatFile = args['beat-analysis'] || args.beat;
          const priorRunFile = args['prior-run'] || args.prior;
          const outDir = args.out || 'artifacts/deliverables';

          if (!projectFile) {
            console.error('❌ Error: Project file is required. Specify via --project <file>.');
            process.exit(1);
          }
          if (!rawPrompt && !priorRunFile) {
            console.error('❌ Error: Natural language prompt is required via --prompt "<text>".');
            process.exit(1);
          }

          const project = JSON.parse(fs.readFileSync(path.resolve(projectFile), 'utf8'));
          let priorRunDoc;
          if (priorRunFile && fs.existsSync(path.resolve(priorRunFile))) {
            priorRunDoc = JSON.parse(fs.readFileSync(path.resolve(priorRunFile), 'utf8'));
          }

          let beatAnalysis;
          if (beatFile && fs.existsSync(path.resolve(beatFile))) {
            beatAnalysis = JSON.parse(fs.readFileSync(path.resolve(beatFile), 'utf8'));
          }

          const { CandidateOrchestrator } = require('../prompt-core/index.js');

          if (!args.json) {
            console.log('\n=== EME Multi-Variant Candidate Generation (PF-07) ===');
            console.log(`Prompt:        "${rawPrompt || 'Multi-variant exploration'}"`);
            console.log(`Base Project:  ${project.id || 'unnamed'} (rev ${project.revision})`);
            console.log(`Destination:   ${outDir}`);
          }

          const csetDoc = CandidateOrchestrator.generateCandidates({
            rawPrompt,
            project,
            beatAnalysis,
            priorRunDoc,
            outputDir: outDir
          });

          if (args.json) {
            console.log(JSON.stringify(csetDoc, null, 2));
          } else {
            console.log(`\nCandidate Set ID: ${csetDoc.candidate_set_id}`);
            console.log(`Status:           ${csetDoc.status.toUpperCase()}`);
            console.log(`Candidates Generated: ${csetDoc.candidates.length}\n`);

            console.log('--- Candidate Comparison Matrix ---');
            csetDoc.comparison_matrix.forEach((row, idx) => {
              console.log(`[Candidate ${idx + 1}] ID: ${row.candidate_id} | Profile: ${row.profile_name.toUpperCase()} | Status: ${row.status.toUpperCase()}`);
              console.log(`   Cuts: ${row.cuts_count} | Transitions: ${row.transition_style} | Pacing: ${row.pacing_style} | QA Score: ${row.qa_score}/100`);
            });

            console.log(`\nCandidate Set Document: ${csetDoc._docPath}`);
          }
          console.log('');
          break;
        } else if (subCommand === 'select-candidate') {
          const csetFile = args['candidate-set'] || args._[2];
          const candId = args['candidate-id'] || args.id;
          const outDir = args.out || 'artifacts/deliverables';

          if (!csetFile) {
            console.error('❌ Error: Candidate set file is required. Specify via --candidate-set <file>.');
            process.exit(1);
          }
          if (!candId) {
            console.error('❌ Error: Candidate ID is required. Specify via --candidate-id <id>.');
            process.exit(1);
          }

          const resolvedPath = path.resolve(csetFile);
          if (!fs.existsSync(resolvedPath)) {
            console.error(`❌ Error: Candidate set file not found at ${resolvedPath}`);
            process.exit(1);
          }

          const candidateSetDoc = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
          candidateSetDoc._docPath = resolvedPath;

          const { CandidateOrchestrator } = require('../prompt-core/index.js');
          const res = CandidateOrchestrator.selectCandidate({
            candidateSetDoc,
            candidateId: candId,
            outputDir: outDir
          });

          if (!res.success) {
            console.error(`❌ Selection Failed: ${res.error}`);
            process.exit(1);
          }

          if (args.json) {
            console.log(JSON.stringify(res.deliveryRun, null, 2));
          } else {
            console.log('\n=== Candidate Selection Committed ===');
            console.log(`Selected Candidate: ${candId}`);
            console.log(`Delivery Run ID:    ${res.deliveryRun.run_id}`);
            console.log(`Manifest ID:        ${res.deliveryRun.deliverable.manifest_id}`);
            console.log(`Media File:         ${res.deliveryRun.deliverable.media_path}`);
            console.log(`Delivery Run Path:  ${res.deliveryRun._runPath}`);
          }
          console.log('');
          break;
        } else if (subCommand === 'session') {
          const action = args._[2];
          const sessionFile = args.session || args._[3];
          const outDir = args.out || 'artifacts/deliverables';
          const { RevisionSessionManager, CandidateOrchestrator, ProjectManager } = require('../prompt-core/index.js');

          if (action === 'init' || action === 'create') {
            const promptText = args.prompt || 'Conversational Editing Session';
            const csetFile = args['candidate-set'] || args.candidates;
            let candidateSetDoc;
            if (csetFile && fs.existsSync(path.resolve(csetFile))) {
              candidateSetDoc = JSON.parse(fs.readFileSync(path.resolve(csetFile), 'utf8'));
              candidateSetDoc._docPath = path.resolve(csetFile);
            }

            const session = RevisionSessionManager.createSession({
              prompt: promptText,
              candidateSetDoc,
              outputDir: outDir
            });

            if (args.json) {
              console.log(JSON.stringify(session, null, 2));
            } else {
              console.log('\n=== EME Revision Session Initialized ===');
              console.log(`Session ID:      ${session.session_id}`);
              console.log(`State:           ${session.state.toUpperCase()}`);
              console.log(`Original Prompt: "${session.request.original_prompt}"`);
              console.log(`Candidate Set:   ${session.candidate_set_id || 'None'}`);
              console.log(`Session File:    ${session._docPath}`);
            }
            console.log('');
            break;
          } else if (action === 'select' || action === 'bind-candidate') {
            if (!sessionFile) {
              console.error('❌ Error: Session document file is required via --session <file>.');
              process.exit(1);
            }
            const csetFile = args['candidate-set'] || args.candidates;
            const candId = args['candidate-id'] || args.id;
            if (!csetFile || !candId) {
              console.error('❌ Error: Both --candidate-set <file> and --candidate-id <id> are required.');
              process.exit(1);
            }

            const session = JSON.parse(fs.readFileSync(path.resolve(sessionFile), 'utf8'));
            const candidateSetDoc = JSON.parse(fs.readFileSync(path.resolve(csetFile), 'utf8'));
            candidateSetDoc._docPath = path.resolve(csetFile);

            const res = RevisionSessionManager.bindSelectedCandidate({
              session,
              candidateSetDoc,
              candidateId: candId,
              outputDir: outDir
            });

            if (!res.success) {
              console.error(`❌ Candidate Binding Failed: ${res.error}`);
              process.exit(1);
            }

            if (args.json) {
              console.log(JSON.stringify(res.session, null, 2));
            } else {
              console.log('\n=== Candidate Bound to Active Delivery ===');
              console.log(`Session ID:      ${session.session_id}`);
              console.log(`State:           ${session.state.toUpperCase()}`);
              console.log(`Active Delivery: ${session.active_delivery?.revision_id} (${session.active_delivery?.manifest_id})`);
              console.log(`Media Path:      ${session.active_delivery?.media_path}`);
            }
            console.log('');
            break;
          } else if (action === 'revise') {
            if (!sessionFile) {
              console.error('❌ Error: Session document file is required via --session <file>.');
              process.exit(1);
            }
            const revPrompt = args.prompt;
            if (!revPrompt) {
              console.error('❌ Error: Revision prompt is required via --prompt "<text>".');
              process.exit(1);
            }

            const session = JSON.parse(fs.readFileSync(path.resolve(sessionFile), 'utf8'));
            let project;
            if (args.project && fs.existsSync(path.resolve(args.project))) {
              project = JSON.parse(fs.readFileSync(path.resolve(args.project), 'utf8'));
            }

            const res = RevisionSessionManager.applyRevision({
              session,
              revisionPrompt: revPrompt,
              project,
              outputDir: outDir,
              options: { expectedVersion: args['expected-version'] ? parseInt(args['expected-version'], 10) : undefined }
            });

            if (args.json) {
              console.log(JSON.stringify(res, null, 2));
            } else {
              if (res.success) {
                console.log('\n🎉 Revision Verified and Activated!');
                console.log(`Session ID:      ${session.session_id}`);
                console.log(`Revision ID:     ${session.active_delivery?.revision_id}`);
                console.log(`Manifest ID:     ${session.active_delivery?.manifest_id}`);
                console.log(`Media File:      ${session.active_delivery?.media_path}`);
                console.log(`SHA-256:         ${session.active_delivery?.sha256}`);
                console.log(`Version:         v${session.concurrency.version}`);
              } else {
                console.error(`\n❌ Revision Failed Verification: ${res.error}`);
                console.error(`Active Delivery: Prior verified deliverable "${session.active_delivery?.revision_id}" remains active.`);
                process.exit(1);
              }
            }
            console.log('');
            break;
          } else if (action === 'undo') {
            if (!sessionFile) {
              console.error('❌ Error: Session document file is required via --session <file>.');
              process.exit(1);
            }
            const session = JSON.parse(fs.readFileSync(path.resolve(sessionFile), 'utf8'));
            const res = RevisionSessionManager.undo({ session, outputDir: outDir });
            if (!res.success) {
              console.error(`❌ Undo Failed: ${res.error}`);
              process.exit(1);
            }
            if (args.json) {
              console.log(JSON.stringify(session, null, 2));
            } else {
              console.log('\n=== Revision Undone ===');
              console.log(`Active Delivery: ${session.active_delivery?.revision_id} (${session.active_delivery?.manifest_id})`);
              console.log(`Undo Stack:      [${session.undo_redo.undo_stack.join(', ')}]`);
              console.log(`Redo Stack:      [${session.undo_redo.redo_stack.join(', ')}]`);
            }
            console.log('');
            break;
          } else if (action === 'redo') {
            if (!sessionFile) {
              console.error('❌ Error: Session document file is required via --session <file>.');
              process.exit(1);
            }
            const session = JSON.parse(fs.readFileSync(path.resolve(sessionFile), 'utf8'));
            const res = RevisionSessionManager.redo({ session, outputDir: outDir });
            if (!res.success) {
              console.error(`❌ Redo Failed: ${res.error}`);
              process.exit(1);
            }
            if (args.json) {
              console.log(JSON.stringify(session, null, 2));
            } else {
              console.log('\n=== Revision Redone ===');
              console.log(`Active Delivery: ${session.active_delivery?.revision_id} (${session.active_delivery?.manifest_id})`);
              console.log(`Undo Stack:      [${session.undo_redo.undo_stack.join(', ')}]`);
              console.log(`Redo Stack:      [${session.undo_redo.redo_stack.join(', ')}]`);
            }
            console.log('');
            break;
          } else if (action === 'recover') {
            if (!sessionFile) {
              console.error('❌ Error: Session document file is required via --session <file>.');
              process.exit(1);
            }
            const session = JSON.parse(fs.readFileSync(path.resolve(sessionFile), 'utf8'));
            const res = RevisionSessionManager.recoverSession({ session, outputDir: outDir });
            if (args.json) {
              console.log(JSON.stringify(res, null, 2));
            } else {
              console.log('\n=== Idempotent Session Recovery Executed ===');
              console.log(`Session State:   ${session.state.toUpperCase()}`);
              console.log(`Recovery Status: ${session.recovery.status.toUpperCase()}`);
              console.log(`Active Delivery: ${session.active_delivery?.revision_id} (${session.active_delivery?.manifest_id})`);
            }
            console.log('');
            break;
          } else if (action === 'inspect' || !action) {
            if (!sessionFile) {
              console.error('❌ Error: Session document file is required via --session <file>.');
              process.exit(1);
            }
            const session = JSON.parse(fs.readFileSync(path.resolve(sessionFile), 'utf8'));
            if (args.json) {
              console.log(JSON.stringify(session, null, 2));
            } else {
              console.log('\n=== EME Revision Session Status ===');
              console.log(`Session ID:      ${session.session_id}`);
              console.log(`State:           ${session.state.toUpperCase()}`);
              console.log(`Concurrency Ver: v${session.concurrency.version}`);
              console.log(`Active Delivery: ${session.active_delivery ? `${session.active_delivery.revision_id} (${session.active_delivery.manifest_id})` : 'None'}`);
              if (session.active_delivery) {
                console.log(`  Media Path:    ${session.active_delivery.media_path}`);
                console.log(`  SHA-256:       ${session.active_delivery.sha256}`);
              }
              console.log(`Undo Stack:      [${session.undo_redo.undo_stack.join(', ')}]`);
              console.log(`Redo Stack:      [${session.undo_redo.redo_stack.join(', ')}]`);
              console.log(`History Entries: ${session.history.length}`);
              session.history.forEach((h, i) => {
                console.log(`  [${i + 1}] ${h.revision_id} (${h.status.toUpperCase()}) QA=${h.qa_score}/100: "${h.prompt.substring(0, 60)}"`);
              });
              console.log(`Recovery Status: ${session.recovery.status.toUpperCase()}`);
            }
            console.log('');
            break;
          } else {
            console.error(`Unknown session action: "${action}". Valid actions: init, select, revise, undo, redo, inspect, recover.`);
            process.exit(1);
          }
        } else {
          console.error(`Usage: eme prompt inspect --project <file> --prompt "<text>" [--out <file>] [--json]`);
          console.error(`       eme prompt plan --project <file> [--prompt "<text>" | --brief <file>] [--execute] [--out <file>] [--json]`);
          console.error(`       eme prompt render --project <file> --plan <file> [--beat-analysis <file>] [--out <dir>] [--json]`);
          console.error(`       eme prompt auto --project <file> --prompt "<text>" [--beat-analysis <file>] [--out <dir>] [--json]`);
          console.error(`       eme prompt revise --project <file> --prior-run <file> --prompt "<text>" [--beat-analysis <file>] [--out <dir>] [--json]`);
          console.error(`       eme prompt candidates --project <file> --prompt "<text>" [--beat-analysis <file>] [--out <dir>] [--json]`);
          console.error(`       eme prompt select-candidate --candidate-set <file> --candidate-id <id> [--out <dir>] [--json]`);
          console.error(`       eme prompt session <init|select|revise|undo|redo|inspect|recover> --session <file> [options]`);
          process.exit(1);
        }
      }

      case 'editor':
      case 'serve': {
        const port = parseInt(args.port, 10) || 4720;
        const projectFile = args.project || args._[1];
        const outDir = args.out || 'artifacts/deliverables';
        const { EditorBackend } = require('../ui/server.js');
        let project = null;
        if (projectFile && fs.existsSync(path.resolve(projectFile))) {
          project = JSON.parse(fs.readFileSync(path.resolve(projectFile), 'utf8'));
        }
        const backend = new EditorBackend({ port, project, outputDir: outDir });
        backend.start().then(() => {
          console.log(`[EME Editor] Visual Control Surface running at http://localhost:${port}`);
        }).catch(err => {
          console.error(`❌ Failed to start editor server: ${err.message}`);
          process.exit(1);
        });
        break;
      }

      default:
        console.error(`Unknown command: "${command}"`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`❌ CLI Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = { runCli };
