const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {workspace}=require('./helpers/phase1-approval.cjs');
const {fixture,commit,command}=require('./helpers/canonical-media.cjs');
const {NativeDelivery}=require('../src/prompt-core/native-delivery.js');
const {QualityAssuranceEngine:QA}=require('../src/renderers/qa-engine.js');
const {AudioMixerEngine:Audio}=require('../src/creative/audio-mixer-engine.js');
const {EnvironmentResolver:Env}=require('../src/engine/environment.js');
const {ArtifactIntegrityGuardian:Guardian}=require('../src/orchestration/artifact-integrity-guardian.js');
const {RenderOrchestrator:R}=require('../src/prompt-core/render-orchestrator.js');
const {digest}=require('../src/creative/execution-record.js');
function setup(){const {root,store}=workspace(),p=fixture(root);p.clips.find(c=>c.id==='tone').audio={volume:2}; const asset=p.assets.find(a=>a.id==='tone'), calibrated=path.join(root,'delivery-tone.wav'); command('ffmpeg',['-v','error','-n','-i',asset.src,'-af','volume=1.22',calibrated]); asset.src=calibrated; return{root,store,p};}
function service(root,store){return new NativeDelivery({storageDir:path.join(root,'delivery'),approvalDir:store});}
test('real final mux measurements gate durable promotion, restart, idempotency and drift',()=>{
 const {root,store,p}=setup(),{result}=commit(p,root,store),d=service(root,store);
 const out=d.run({executionId:result.execution_id,outputDir:root});
 assert.equal(out.success,true,JSON.stringify(out));assert.equal(out.status,'SUCCEEDED');
 assert.equal(out.qa_metrics.audio.clippedSamples,0);assert(out.qa_metrics.audio.truePeakDb<=-1);assert(Math.abs(out.qa_metrics.audio.integratedLufs+14)<=1);
 const again=service(root,store).run({executionId:result.execution_id,outputDir:root});assert.equal(again.outputPath,out.outputPath);
 const code=`const D=require(${JSON.stringify(require.resolve('../src/prompt-core/native-delivery.js'))}).NativeDelivery; console.log(JSON.stringify(new D(JSON.parse(process.argv[1])).getStatus(process.argv[2])));`;
 const restarted=JSON.parse(command(process.execPath,['-e',code,JSON.stringify({storageDir:d.storageDir,approvalDir:store}),out.jobId]));assert.equal(restarted.status,'SUCCEEDED');
 fs.appendFileSync(out.outputPath,'altered');const drift=d.getStatus(out.jobId);assert.equal(drift.success,false);assert.equal(drift.integrity_status,'INTEGRITY_DRIFT_ALERT');
 console.log('DELIVERY_MEASUREMENTS '+JSON.stringify({outputPath:out.outputPath,sha256:out.sha256,audio:out.qa_metrics.audio,metadata:out.qa_metrics.metadata,manifestPath:out.manifestPath}));
});
test('measurement/decode failures, malformed media and missing audio cannot pass',()=>{
 const {root}=workspace(),invalid=path.join(root,'invalid.mp4');fs.writeFileSync(invalid,'not media');assert.throws(()=>Audio.auditAudioMix({masterAudioPath:invalid}));
 assert.throws(()=>QA.auditFinalMedia({timebase:{fps:{numerator:30,denominator:1},durationTicks:120000},canvas:{width:160,height:120}},invalid));
 const silent=path.join(root,'noaudio.mp4');command('ffmpeg',['-v','error','-n','-f','lavfi','-i','color=blue:s=160x120:r=30:d=1','-c:v','libx264',silent]);
 assert.throws(()=>Audio.auditAudioMix({masterAudioPath:silent}));
 const old=Env.resolveFfmpeg;Env.resolveFfmpeg=()=>path.join(root,'missing-binary');try{assert.throws(()=>Audio.auditAudioMix({masterAudioPath:silent}),/MEASUREMENT_FAILED/);}finally{Env.resolveFfmpeg=old;}
 const wav=path.join(root,'silent.wav');command('ffmpeg',['-v','error','-n','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','1',wav]);assert.throws(()=>Audio.auditAudioMix({masterAudioPath:wav}),/non-finite/);
});
test('failed replacement stages preserve the prior verified active delivery',async t=>{
 const {root,store,p}=setup(),{result}=commit(p,root,store),d=service(root,store);const first=d.run({executionId:result.execution_id,outputDir:root});assert.equal(first.success,true,JSON.stringify(first));
 for(const point of ['render','measurement','manifest','hash','promotion','stale'])await t.test(point,()=>{
  const prior=fs.readFileSync(d.sessionPath(p.id));const outputDir=path.join(root,point);let restore;
  if(point==='render'){const old=R.renderCommitted;R.renderCommitted=()=>{throw Error('injected render')};restore=()=>R.renderCommitted=old;}
  if(point==='measurement'){const old=QA.auditFinalMedia;QA.auditFinalMedia=()=>{throw Error('injected final measurement decode')};restore=()=>QA.auditFinalMedia=old;}
  if(point==='manifest'){const old=fs.renameSync;fs.renameSync=(a,b)=>{if(b.endsWith('manifest.json'))throw Error('injected manifest');return old(a,b)};restore=()=>fs.renameSync=old;}
  if(point==='hash'){const old=Guardian.prototype.verifyManifest;Guardian.prototype.verifyManifest=function(file){const m=JSON.parse(fs.readFileSync(file));fs.appendFileSync(m.artifact_path,'tamper');return old.call(this,file)};restore=()=>Guardian.prototype.verifyManifest=old;}
  if(point==='promotion'){const old=d.guardian.promoteDeliveryGated;d.guardian.promoteDeliveryGated=()=>({promoted:false,reason:'injected'});restore=()=>d.guardian.promoteDeliveryGated=old;}
  if(point==='stale'){const old=d.liveMatches;d.liveMatches=()=>false;restore=()=>d.liveMatches=old;}
  try{const failed=d.run({executionId:result.execution_id,outputDir});assert.equal(failed.success,false);assert.equal(failed.publication_committed,false);assert.deepEqual(fs.readFileSync(d.sessionPath(p.id)),prior);assert.equal(d.getStatus(failed.jobId).status,'FAILED');}finally{restore();}
 });
});
test('post-publication persistence failure reports committed truth and preserves publication',()=>{
 const {root,store,p}=setup(),{result}=commit(p,root,store),d=service(root,store),old=fs.renameSync;
 fs.renameSync=(a,b)=>{if(b.includes('/jobs/')){const j=JSON.parse(fs.readFileSync(a));if(j.status==='SUCCEEDED')throw Error('injected acknowledgement');}return old(a,b);};
 let out;try{out=d.run({executionId:result.execution_id,outputDir:root});}finally{fs.renameSync=old;}
 assert.equal(out.success,false);assert.equal(out.publication_committed,true);assert.equal(out.status,'NEEDS_RECONCILIATION');assert.equal(d.session(p.id).active_delivery,out.jobId);
});
test('interrupted durable jobs never become successful from artifact existence',()=>{
 const {root,store,p}=setup(),{result}=commit(p,root,store),d=service(root,store),jobId=`job_native_${digest({executionId:result.execution_id,outputRoot:root})}`;
 const jm=d.jobs();jm.createJob({jobId,request:{project_id:p.id},initialMeta:{native_owner:{pid:2147483647,hostname:require('node:os').hostname()}}});for(const s of ['PLANNING','EXECUTING','RENDERING'])jm.transition(jobId,s);
 assert.equal(service(root,store).getStatus(jobId).status,'NEEDS_RECONCILIATION');assert.equal(d.session(p.id).active_delivery,null);
});
function child(config){const {spawn}=require('node:child_process');const c=spawn(process.execPath,[path.join(__dirname,'helpers/native-delivery-child.cjs'),JSON.stringify(config)],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';c.stdout.on('data',b=>stdout+=b);c.stderr.on('data',b=>stderr+=b);const done=new Promise((resolve,reject)=>{c.on('error',reject);c.on('close',(code,signal)=>resolve({code,signal,stdout,stderr}));});const barrier=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Barrier timeout')),10000);c.stdout.on('data',()=>{if(stdout.includes('BARRIER')){clearTimeout(timer);resolve();}});c.on('close',()=>{clearTimeout(timer);resolve();});});return{c,done,barrier};}
test('competing processes cannot render/publish the same delivery twice',async()=>{
 const {root,store,p}=setup(),{result}=commit(p,root,store),d=service(root,store),config={service:{storageDir:d.storageDir,approvalDir:store},request:{executionId:result.execution_id,outputDir:root}};
 const first=child({...config,mode:'barrier',gate:path.join(root,'gate')});await first.barrier;
 const second=await child(config).done;assert.equal(second.code,0,second.stderr);assert.equal(JSON.parse(second.stdout).status,'RENDERING');
 fs.writeFileSync(path.join(root,'gate'),'go',{flag:'wx'});const completed=await first.done;assert.equal(completed.code,0,completed.stderr);assert.equal(JSON.parse(completed.stdout.trim().split('\n').at(-1)).status,'SUCCEEDED');assert.equal(d.session(p.id).deliveries.length,1);
 console.log('NATIVE_RACE: processes=2 successful_publications=1 competing_retry=RENDERING');
});
test('SIGKILL before render and after publication recover truth across processes',async t=>{
 for(const mode of ['barrier','after-publication'])await t.test(mode,async()=>{
  const {root,store,p}=setup(),{result}=commit(p,root,store),d=service(root,store),config={mode,gate:path.join(root,'gate'),service:{storageDir:d.storageDir,approvalDir:store},request:{executionId:result.execution_id,outputDir:root}};
  const worker=child(config);if(mode==='barrier'){await worker.barrier;worker.c.kill('SIGKILL');}const killed=await worker.done;assert.equal(killed.signal,'SIGKILL');
  const jobId=`job_native_${digest({executionId:result.execution_id,outputRoot:root})}`,status=service(root,store).getStatus(jobId);
  assert.equal(status.status,mode==='barrier'?'NEEDS_RECONCILIATION':'SUCCEEDED');
  if(mode==='barrier')assert.equal(d.session(p.id).active_delivery,null);else{assert.equal(status.recovered_after_commit,true);assert.equal(d.session(p.id).deliveries.length,1);}
 });
});
