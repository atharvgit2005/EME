const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {workspace,approve}=require('./helpers/phase1-approval.cjs');
const {command,rms}=require('./helpers/canonical-media.cjs');
const {MediaTime:Time}=require('../src/engine/time.js');
const {normalizeSpeechIntervals,normalizeSfxCue}=require('../src/creative/audio-contracts.js');
const {SpeechDuckingCompiler:Duck}=require('../src/creative/speech-ducking-compiler.js');
const {AudioCatalog:Catalog}=require('../src/creative/audio-catalog.js');
const {CreativeContextBuilder:Context}=require('../src/creative/creative-context-builder.js');
const {CreativePlanCompiler:Compiler}=require('../src/creative/creative-plan-compiler.js');
const {MockLlmAdapter:Mock}=require('../src/creative/adapter/runtime-llm-adapter.js');
const {CreativePlanValidator:Validator}=require('../src/creative/schema-validator.js');
const {OperationExecutor:E}=require('../src/engine/operations.js');
const {ApprovalAuthority:A}=require('../src/creative/approval-authority.js');
const {ExecutionAuthority:X}=require('../src/creative/execution-authority.js');
const {NativeDelivery}=require('../src/prompt-core/native-delivery.js');
function op(p,type,params){const r=E.execute(p,{type,params});assert(r.success,r.error);return r.project;}
test('rational second conversion, interval normalization, exact attack/release and immutable input',()=>{
 assert.equal(Time.secondsToTicks(.1+.2),36000);assert.equal(Time.secondsToTicks(1e-5),1);assert.equal(Time.secondsToTicks(1.23456789),148148);assert.throws(()=>Time.secondsToTicks(Infinity));
 assert.deepEqual(normalizeSpeechIntervals([{startSec:1,endSec:1.5}]),[{startTick:120000,endTick:180000}]);assert.throws(()=>normalizeSpeechIntervals([{startSec:1,endSec:2,startTick:1,endTick:2}]),/AMBIGUOUS/);
 const original=[{startTick:120000,endTick:180000}],before=JSON.stringify(original),profile={attenuationDb:-20,attackTicks:12000,releaseTicks:24000,mergeToleranceMs:0};
 const curve=Duck.compileGainEnvelope({speechIntervals:original,totalDurationTicks:360000,profile});assert.equal(JSON.stringify(original),before);
 for(const [tick,gain]of [[108000,1],[120000,.1],[180000,.1],[204000,1]])assert.equal(curve.find(p=>p.offsetTick===tick).volume,gain);
 const samples=Duck.generateSampleGainCurve(curve,144000);assert(Math.abs(samples[48000]-.1)<1e-5);assert(Math.abs(samples[81600]-1)<1e-5);
 assert.deepEqual(normalizeSfxCue({cue_id:'c',asset_id:'hit',trigger_tick:120000,sfx_type:'impact'}),{assetId:'hit',startTick:120000,gain:.8});assert.throws(()=>normalizeSfxCue({asset_id:'a',assetId:'b',trigger_tick:0}));
});
test('catalog/context round trip verifies bytes/metadata and labels rights as declarations',()=>{
 const {root}=workspace(),relative='assets/creator_reel_soundtrack_20s.wav',target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});command('ffmpeg',['-v','error','-n','-f','lavfi','-i','sine=frequency=220:sample_rate=44100:duration=1','-ac','1',target]);
 const entries=Catalog.listAvailableAssets(root),verified=Catalog.getAsset('bgm_creator_reel',root);assert(verified.available);assert.equal(verified.duration_sec,1);assert.equal(verified.channels,1);assert.equal(verified.sample_rate,44100);assert.equal(verified.licensing.evidence_status,'declaration_only');assert(entries.some(a=>!a.available));
 const asset=Catalog.toProjectAsset(verified);assert.equal(asset.src,target);assert.equal(asset.sha256,require('node:crypto').createHash('sha256').update(fs.readFileSync(target)).digest('hex'));
 const project=op({},'create_project',{id:'catalog'}),context=Context.buildContext({brief:'catalog',project,availableAssets:entries}),found=context.media_catalog.available.find(a=>a.asset_id===verified.asset_id);assert.equal(found.src,target);assert.equal(found.sha256,asset.sha256);assert(context.media_catalog.missing.length>0);
 assert.throws(()=>Catalog.getAsset('bgm_snowfall',root),/UNAVAILABLE/);
});
function bandRms(file,start,frequency){const b=command('ffmpeg',['-v','error','-ss',String(start),'-i',file,'-t','0.15','-af',`bandpass=f=${frequency}:width_type=h:width=30`,'-f','f32le','-ar','48000','-ac','1','-']);let n=0;for(let i=0;i<b.length;i+=4)n+=b.readFloatLE(i)**2;return Math.sqrt(n/(b.length/4));}
test('approved Creative Plan carries explicit dialogue/music/ducking/SFX through final native mux',async()=>{
 const {root,store}=workspace(),video=path.join(root,'dialogue.mp4'),music=path.join(root,'music.wav'),sfx=path.join(root,'sfx.wav');
 command('ffmpeg',['-v','error','-n','-f','lavfi','-i','color=green:s=192x108:r=30:d=2','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-c:a','aac','-ac','2',video]);
 for(const [file,freq,duration,channels]of [[music,220,2,1],[sfx,880,.3,2]])command('ffmpeg',['-v','error','-n','-f','lavfi','-i',`sine=frequency=${freq}:sample_rate=48000:duration=${duration}`,'-ac',String(channels),file]);
 let p=op({},'create_project',{id:'audio-delivery',width:192,height:108,fps:{numerator:30,denominator:1},durationTicks:240000});p=op(p,'add_track',{id:'visual',kind:'visual'});
 for(const[id,type,src,durationSec]of [['source','video',video,2],['music','audio',music,2],['hit','audio',sfx,.3]])p=op(p,'add_asset',{id,type,src,metadata:{durationSec}});
 const creative=await new Mock().generateCreativePlan({context:Context.buildContext({brief:'2 second edit',project:p})});creative.visual_events=[];for(const beat of creative.narrative_beats)beat.editorial_decisions.reframing.enabled=false;creative.deliverable={width:192,height:108,aspect_ratio:'16:9',frame_rate:{numerator:30,denominator:1},target_duration_ticks:240000};
 creative.audio_direction={dialogue_ducking_enabled:true,ducking_depth_db:-20,soundtrack_selection:{asset_id:'music',ducking_attack_ticks:12000,ducking_release_ticks:24000},sfx_cues:[{cue_id:'hit',asset_id:'hit',trigger_tick:120000,sfx_type:'impact'}]};creative.provenance.plan_hash=Validator.computePlanHash(creative);
 const options={preserveSourceDialogue:true,dialogueGain:.5,speechIntervals:[{startSec:.5,endSec:1}]};
 const compiled=Compiler.compile({creativePlan:creative,project:p,options});assert(compiled.success,JSON.stringify(compiled.errors));const cue=compiled.operationPlan.operations.find(o=>o.params.id==='clip_sfx_1');assert.equal(cue.params.startTick,120000);assert.equal(cue.params.durationTicks,36000);assert(compiled.operationPlan.operations.some(o=>o.params.metadata?.role==='dialogue'));
 const projectPath=path.join(root,'project.json');fs.writeFileSync(projectPath,JSON.stringify(p));const pending=A.createPendingRequest({project:p,projectPath,creativePlan:creative,options,storageDir:store}),token=approve(pending.request_id,store),executed=X.execute({approvalToken:token,storageDir:store});assert(executed.success,JSON.stringify(executed));
 const delivery=new NativeDelivery({storageDir:path.join(root,'deliveries'),approvalDir:store}).run({executionId:executed.execution_id,outputDir:root});assert(delivery.success,JSON.stringify(delivery));
 const outside=bandRms(delivery.outputPath,.15,220),inside=bandRms(delivery.outputPath,.7,220),dialogue=bandRms(delivery.outputPath,.7,440),cueBefore=bandRms(delivery.outputPath,.7,880),cueDuring=bandRms(delivery.outputPath,1.05,880);
 assert(outside>inside*6,JSON.stringify({outside,inside}));assert(dialogue>.005);assert(cueDuring>cueBefore*4,JSON.stringify({cueBefore,cueDuring}));
 assert(Math.abs(delivery.qa_metrics.audio.integratedLufs+14)<=1);assert.equal(delivery.qa_metrics.audio.clippedSamples,0);
 console.log('AUDIO_CANONICAL_ACCEPTANCE '+JSON.stringify({artifact:delivery.outputPath,sha256:delivery.sha256,plan_hash:creative.provenance.plan_hash,audio:delivery.qa_metrics.audio,outside,inside,dialogue,cueBefore,cueDuring,provenance:delivery.provenance}));
 const without=Compiler.compile({creativePlan:creative,project:p,options:{speechIntervals:options.speechIntervals}});assert(without.success,JSON.stringify(without.errors));assert(!without.operationPlan.operations.some(o=>o.params.metadata?.role==='dialogue'));
});
test('speech detection measures mono/stereo PCM frame timing and rejects unsupported metadata',()=>{
 const {root}=workspace();let reference;
 for(const channels of [1,2]){
  const file=path.join(root,`speech-${channels}.wav`);
  command('ffmpeg',['-v','error','-n','-f','lavfi','-i','sine=frequency=500:sample_rate=44100:duration=1','-af',"volume='if(between(t,0.2,0.6),1,0)':eval=frame",'-ac',String(channels),'-c:a','pcm_s16le',file]);
  const intervals=Duck.detectSpeechIntervalsFromWav(file,{thresholdDb:-35,windowMs:20,mergeToleranceMs:0});assert.equal(intervals.length,1);assert(Math.abs(intervals[0].startTick-24000)<4800);assert(Math.abs(intervals[0].endTick-72000)<4800);if(reference)assert.deepEqual(intervals,reference);reference=intervals;
  assert.throws(()=>Duck.detectSpeechIntervalsFromWav(file,{sampleRate:48000}),/MISMATCH/);
 }
 const corrupt=path.join(root,'corrupt.wav');fs.writeFileSync(corrupt,'bad');assert.throws(()=>Duck.detectSpeechIntervalsFromWav(corrupt),/UNSUPPORTED/);
});
test('music replacement preserves existing dialogue clips and missing inputs fail closed',async()=>{
 const {root}=workspace(),media=path.join(root,'tone.wav');command('ffmpeg',['-v','error','-n','-f','lavfi','-i','sine=frequency=500:duration=1',media]);
 let p=op({},'create_project',{id:'dialogue-preserved',durationTicks:120000});p=op(p,'add_asset',{id:'speech',type:'audio',src:media});p=op(p,'add_asset',{id:'picture',type:'video',src:media});p=op(p,'add_track',{id:'dialogue',kind:'audio'});p=op(p,'insert_clip',{id:'existing-dialogue',trackId:'dialogue',type:'audio',startTick:0,durationTicks:120000,source:{assetId:'speech',trimInTick:0,trimOutTick:120000}});
 const candidate=await new Mock().generateCreativePlan({context:Context.buildContext({brief:'1 second',project:p})});candidate.audio_direction={dialogue_ducking_enabled:false,soundtrack_selection:{asset_id:'speech'}};candidate.visual_events=[];candidate.deliverable.width=p.canvas.width;candidate.deliverable.height=p.canvas.height;candidate.deliverable.target_duration_ticks=p.timebase.durationTicks;candidate.deliverable.frame_rate=p.timebase.fps;candidate.provenance.plan_hash=Validator.computePlanHash(candidate);
 const result=Compiler.compile({creativePlan:candidate,project:p});assert(result.success,JSON.stringify(result.errors));assert(!result.operationPlan.operations.some(o=>o.type==='delete_clip'&&o.params.clipId==='existing-dialogue'));
 const Audio=require('../src/creative/audio-mixer-engine.js').AudioMixerEngine;assert.throws(()=>Audio.renderMix({dialoguePath:path.join(root,'missing.wav'),outputPath:path.join(root,'out.wav')}),/UNAVAILABLE/);
 const old=fs.readFileSync;fs.readFileSync=function(file,...rest){if(String(file).endsWith('snowfall.mp3')){const e=Error('unreadable');e.code='EPERM';throw e;}return old.call(this,file,...rest);};try{const list=Catalog.listAvailableAssets(root);assert.equal(list.find(a=>a.asset_id==='bgm_snowfall').available,false);}finally{fs.readFileSync=old;}
});
