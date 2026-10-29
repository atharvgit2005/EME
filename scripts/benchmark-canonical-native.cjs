#!/usr/bin/env node
/** Deterministic fixture benchmark. Automated PTY confirmation; never live IDE/human evidence. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {OperationExecutor:E}=require('../src/engine/operations.js');
const {CreativeContextBuilder:Context}=require('../src/creative/creative-context-builder.js');
const {MockLlmAdapter:Mock}=require('../src/creative/adapter/runtime-llm-adapter.js');
const {CreativePlanValidator:V}=require('../src/creative/schema-validator.js');
const {PlanStore}=require('../src/creative/plan-store.js');
const {ApprovalAuthority:A}=require('../src/creative/approval-authority.js');
const {ExecutionAuthority:X}=require('../src/creative/execution-authority.js');
const {NativeDelivery}=require('../src/prompt-core/native-delivery.js');
const {approve}=require('../tests/helpers/phase1-approval.cjs');
const {FrameInspector}=require('../src/renderers/inspector.js');
const {computeFileSha256BoundedSync:hash}=require('../src/prompt-core/job-orchestrator.js');
async function main(){
 const visualOnly=process.argv.includes('--visual-only'),peakControl=!process.argv.includes('--without-peak-control');
 const input=process.argv[2];if(!input)throw Error('Usage: node scripts/benchmark-canonical-native.cjs <existing 1920x1080 before/after fixture>');
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'eme-review-benchmark-'))),store=path.join(root,'approvals');fs.mkdirSync(store);
 const op=(p,type,params)=>{const r=E.execute(p,{type,params});if(!r.success)throw Error(r.error);return r.project;};
 let p=op({},'create_project',{id:`review-${crypto.randomUUID()}`,width:540,height:960,fps:{numerator:30,denominator:1},durationTicks:240000});
 p=op(p,'add_asset',{id:'source',type:'video',src:path.resolve(input),sha256:hash(input),metadata:{dimensions:{width:1920,height:1080},licensing:{evidence_status:'not_reviewed'}}});
 const brief=(visualOnly?'VISUAL-ONLY PREVIEW, intentionally no audio. ':'')+'Two second portrait crop of the left before panel; retain dialogue with an explicit lookahead peak-control envelope, put animated yellow CANONICAL EDIT safely below the annotated head region.';
 const plan=await new Mock().generateCreativePlan({context:Context.buildContext({brief,project:p})});plan.deliverable={width:540,height:960,aspect_ratio:'9:16',frame_rate:p.timebase.fps,target_duration_ticks:240000};
 for(const b of plan.narrative_beats){b.editorial_decisions.reframing.enabled=true;b.editorial_decisions.reframing.crop_rect={x:353,y:216,width:456,height:810};}
 plan.visual_events=[{event_id:'event-review',event_type:'kinetic_text',timeline_range:{start_tick:0,end_tick:240000,duration_ticks:240000},content:{text:'CANONICAL EDIT',font_size:32,font_color:'#ffff00'},spatial_constraints:{target_anchor:'lower_third',avoid_face_overlap:true,safe_margin_ratio:.05},motion:{animation_type:'none'}}];plan.audio_direction={dialogue_ducking_enabled:false,sfx_cues:[]};plan.provenance.plan_hash=V.computePlanHash(plan);
 const sidecar={source:{asset_id:'source',width:1920,height:1080,fps:{numerator:30000,denominator:1001}},frames:Array.from({length:60},(_,i)=>({tick:i*4004,observations:[{type:'face',bounds:{x:430,y:250,width:270,height:340},confidence:1}]}))};
 const options={preserveSourceDialogue:!visualOnly,...(!visualOnly && peakControl?{dialoguePeakControl:{ceilingDb:-18,windowTicks:1200,lookaheadTicks:2400,releaseTicks:12000}}:{}),curvedTypography:{text:'CANONICAL EDIT',curve:{centerX:270,centerY:750,radius:180,startAngleDeg:150,endAngleDeg:30},animation:{type:'fade_and_sweep',sweepShiftDeg:20,fadeRatio:.1}},vtsmSidecars:{source:sidecar}};
 const projectPath=path.join(root,'project.json');fs.writeFileSync(projectPath,JSON.stringify(p));new PlanStore({storeDir:path.join(root,'plans')}).savePlan(plan);fs.writeFileSync(path.join(root,'brief.txt'),brief);fs.writeFileSync(path.join(root,'options.json'),JSON.stringify(options,null,2));
 const pending=A.createPendingRequest({project:p,projectPath,creativePlan:plan,options,storageDir:store}),token=approve(pending.request_id,store),executed=X.execute({approvalToken:token,storageDir:store});if(!executed.success)throw Error(JSON.stringify(executed));
 const delivered=visualOnly?require('../src/prompt-core/render-orchestrator.js').RenderOrchestrator.renderCommitted({executionId:executed.execution_id,outputDir:root,storageDir:store}):new NativeDelivery({storageDir:path.join(root,'deliveries'),approvalDir:store}).run({executionId:executed.execution_id,outputDir:root});
 const frames=[];if(delivered.success || delivered.rendered)for(const t of [.5,1.5]){const target=path.join(root,`frame-${t}.png`);FrameInspector.inspectFromVideo(delivered.outputPath,target,{time:t});frames.push(target);}
 const result={root,brief,input:{path:path.resolve(input),sha256:hash(input),licensing:'unreviewed'},creative_plan_hash:plan.provenance.plan_hash,approval:'automated PTY fixture; not human authentication',reasoning:'deterministic mock; not live IDE',face_evidence:'manually specified conservative rectangle; not measured tracking',visual_review:'pending',listening_review:'pending',frames,delivery:delivered};fs.writeFileSync(path.join(root,'benchmark.json'),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));if(!delivered.success && !(visualOnly && delivered.rendered))process.exitCode=1;
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
