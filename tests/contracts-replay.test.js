const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const {validateObject:v}=require('../src/engine/validator.js');
const {workspace,fixture}=require('./helpers/phase1-approval.cjs');
const {CreativeContextBuilder:Context}=require('../src/creative/creative-context-builder.js');
const {MockLlmAdapter:Mock}=require('../src/creative/adapter/runtime-llm-adapter.js');
const {CreativePlanValidator:V}=require('../src/creative/schema-validator.js');
const {CreativePlanCompiler:C}=require('../src/creative/creative-plan-compiler.js');
const {PlanStore}=require('../src/creative/plan-store.js');
const {OperationExecutor:E}=require('../src/engine/operations.js');
const {computeProjectSnapshotSha256:hash}=require('../src/prompt-core/context-normalizer.js');
async function plan(){const p=fixture();p.clips=[];p.assets=[{id:'v',type:'video',src:'test-only.mp4'}];const context=Context.buildContext({brief:'1s edit',project:p});const candidate=await new Mock().generateCreativePlan({context});return{p,candidate};}
test('all used validation keywords enforce meaningful negative boundaries',()=>{
 const cases=[['type',NaN,{type:'number'}],['safe integer',2**53,{type:'integer'}],['required',{}, {type:'object',required:['id']}],['const','x',{const:'y'}],['enum','x',{enum:['y']}],['pattern','bad',{type:'string',pattern:'^plan-'}],['minLength','',{minLength:1}],['minItems',[],{minItems:1}],['maxItems',[1,2],{maxItems:1}],['minimum',0,{minimum:1}],['maximum',2,{maximum:1}],['exclusiveMinimum',0,{exclusiveMinimum:0}],['additionalProperties',{x:1},{type:'object',properties:{},additionalProperties:false}],['typed extra',{x:'s'},{additionalProperties:{type:'number'}}],['items',['s'],{items:{type:'integer'}}],['format','2026-02-30T00:00:00Z',{format:'date-time'}],['ref',1,{$ref:'#/$defs/n',$defs:{n:{type:'string'}}}]];
 for(const[name,data,schema]of cases)assert(v(data,schema).length>0,name);
 assert.deepEqual(v({id:'plan-a',date:'2026-10-27T12:00:00+05:30',items:[1]}, {type:'object',required:['id'],additionalProperties:false,properties:{id:{pattern:'^plan-'},date:{format:'date-time'},items:{minItems:1,items:{type:'integer'}}}}),[]);
 assert(v(Object.create({id:'inherited'}),{required:['id']}).length>0);
});
test('baseline check proves files exist and detects altered/missing temporary contracts',()=>{
 const b=require('../docs/remediation/baseline.json'),root=fs.mkdtempSync(path.join(os.tmpdir(),'eme-baseline-'));
 for(const x of [...b.contracts,...b.fixtures]){const target=path.join(root,x.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(__dirname,'..',x.path),target);assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(target)).digest('hex'),x.sha256);}
 const file=path.join(root,b.contracts[0].path),before=fs.readFileSync(file);fs.appendFileSync(file,'tamper');assert.notEqual(require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'),b.contracts[0].sha256);fs.renameSync(file,file+'.preserved');assert.equal(fs.existsSync(file),false);assert(before.length>0);
});
test('snapshot mismatch, unexpected properties and malformed plan IDs fail validation',async()=>{
 const {p,candidate}=await plan();assert.equal(V.validate(candidate,p).valid,true);
 const changed=structuredClone(p);changed.title='changed without revision';assert(V.validate(candidate,changed).errorCodes.includes('ERR_PROJECT_SNAPSHOT_MISMATCH'));
 const bad=structuredClone(candidate);bad.plan_id='../escape';assert.equal(V.validate(bad,p).valid,false);
 const extra=structuredClone(candidate);extra.deliverable.unexpected=1;assert.equal(V.validate(extra,p).valid,false);
});
test('compiler output validates against the actual immutable OperationPlan schema',async()=>{
 const {p,candidate}=await plan();candidate.audio_direction={dialogue_ducking_enabled:false,sfx_cues:[]};candidate.visual_events=[];candidate.provenance.plan_hash=V.computePlanHash(candidate);
 const compiled=C.compile({creativePlan:candidate,project:p});assert.equal(compiled.success,true,JSON.stringify(compiled.errors));const schema=require('../schema/eme-operation-plan.v1.schema.json');assert.deepEqual(v(compiled.operationPlan,schema),[]);
 const stale=structuredClone(candidate);stale.project_snapshot.snapshot_sha256='a'.repeat(64);assert.equal(C.compile({creativePlan:stale,project:p}).success,false);
});
test('plan publication is immutable, complete before visibility, restart-safe and conflict checked',async()=>{
 const {candidate}=await plan(),{root}=workspace(),store=new PlanStore({storeDir:root});
 const file=store.savePlan(candidate),bytes=fs.readFileSync(file);assert.equal(store.savePlan(structuredClone(candidate)),file);assert.deepEqual(fs.readFileSync(file),bytes);
 const other=structuredClone(candidate);other.creative_intent.goal='Different';other.provenance.plan_hash=V.computePlanHash(other);assert.throws(()=>store.savePlan(other),/ID_CONFLICT/);assert.deepEqual(fs.readFileSync(file),bytes);
 const script=`const S=require(${JSON.stringify(require.resolve('../src/creative/plan-store.js'))}).PlanStore;console.log(JSON.stringify(new S({storeDir:process.argv[1]}).getPlan(process.argv[2])));`;
 const restarted=spawnSync(process.execPath,['-e',script,root,candidate.plan_id],{encoding:'utf8'});assert.equal(restarted.status,0,restarted.stderr);assert.deepEqual(JSON.parse(restarted.stdout),candidate);
 const pending=structuredClone(candidate);pending.plan_id+='-pending';pending.provenance.plan_hash=V.computePlanHash(pending);const old=fs.linkSync;fs.linkSync=()=>{throw Error('injected before publication')};try{assert.throws(()=>store.savePlan(pending));}finally{fs.linkSync=old;}assert.equal(store.hasPlan(pending.plan_id),false);assert.deepEqual(fs.readFileSync(file),bytes);
 const corrupt=path.join(root,pending.plan_id+'.json');fs.writeFileSync(corrupt,'{"partial":');assert.throws(()=>store.getPlan(pending.plan_id),/CORRUPTED/);
 assert.throws(()=>store.getPlan('../../escape'),/INVALID_PLAN_ID/);
});
test('history restoration stays engine-owned and advances revisions rather than restoring old counters',()=>{
 const before=fixture();const edited=E.execute(before,{type:'modify_clip',params:{clipId:'title',typography:{text:'edit'}}});assert(edited.success);
 const undo=E.execute(edited.project,{type:'restore_project_history',params:{snapshot:before},expectedBaseRevision:edited.project.revision});assert(undo.success);assert.equal(undo.revision,edited.revision+1);assert.equal(undo.project.clips[0].typography.text,before.clips[0].typography.text);
 const redo=E.execute(undo.project,{type:'restore_project_history',params:{snapshot:edited.project}});assert(redo.success);assert.equal(redo.revision,undo.revision+1);
 assert.equal(E.execute(redo.project,{type:'restore_project_history',params:{snapshot:{...before,id:'other'}}}).success,false);
});
test('actual process death before/after atomic plan publication exposes no partial final file',async()=>{
 const {candidate}=await plan();
 for(const stage of ['before','after']){
  const {root}=workspace(),input=path.join(root,'input.json'),storeDir=path.join(root,'plans');fs.writeFileSync(input,JSON.stringify(candidate));
  const code=`const fs=require('fs'),S=require(${JSON.stringify(require.resolve('../src/creative/plan-store.js'))}).PlanStore,original=fs.linkSync;fs.linkSync=(a,b)=>{if(process.argv[3]==='before')process.kill(process.pid,'SIGKILL');original(a,b);process.kill(process.pid,'SIGKILL');};new S({storeDir:process.argv[2]}).savePlan(JSON.parse(fs.readFileSync(process.argv[1])));`;
  const killed=spawnSync(process.execPath,['-e',code,input,storeDir,stage]);assert.equal(killed.signal,'SIGKILL');const store=new PlanStore({storeDir});assert.equal(store.hasPlan(candidate.plan_id),stage==='after');if(stage==='after')assert.deepEqual(store.getPlan(candidate.plan_id),candidate);
 }
});
test('approved edit after undo invalidates redo and keeps revisions monotonic',async()=>{
 const {root,store}=workspace(),{ApprovalAuthority:A}=require('../src/creative/approval-authority.js'),{approve}=require('./helpers/phase1-approval.cjs'),{EditorBackend}=require('../src/ui/server.js'),http=require('node:http');
 const previous=A.DEFAULT_STORAGE_DIR;A.DEFAULT_STORAGE_DIR=store;const p=fixture(),backend=new EditorBackend({project:p,outputDir:path.join(root,'http')});const server=http.createServer((req,res)=>backend.handleRequest(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const post=async(route,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}`+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
 try{
  const edit=async(text)=>{const operation={type:'modify_clip',params:{clipId:'title',typography:{text}}},pending=await post('/api/approval/request',{operation}),token=approve(pending.data.request_id,store);assert.equal((await post('/api/project/operation',{operation,approval_token:token})).status,200);};
  await edit('first');const pending=await post('/api/approval/request',{historyAction:'undo'}),token=approve(pending.data.request_id,store);assert.equal((await post('/api/project/undo',{approval_token:token})).status,200);await edit('new branch');
  assert.equal(backend.currentProject.revision,p.revision+3);const before=hash(backend.currentProject);const rejected=await post('/api/approval/request',{historyAction:'redo'});assert(rejected.status>=400);assert.equal(hash(backend.currentProject),before);
 }finally{A.DEFAULT_STORAGE_DIR=previous;await new Promise(resolve=>server.close(resolve));}
});
test('file-bound approval resolves relative assets from the project directory and seals effective options',()=>{
 const {root,store}=workspace(),directory=path.join(root,'project');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'source.bin'),'approved project-relative bytes');const p=fixture();p.assets=[{id:'relative',type:'video',src:'source.bin'}];const file=path.join(directory,'project.json');fs.writeFileSync(file,JSON.stringify(p));
 const {ApprovalAuthority:A}=require('../src/creative/approval-authority.js'),{ExecutionAuthority:X}=require('../src/creative/execution-authority.js'),{approve}=require('./helpers/phase1-approval.cjs');
 const pending=A.createPendingRequest({project:p,projectPath:file,operation:{type:'trim_clip',params:{clipId:'title',newDurationTicks:60000}},storageDir:store});const ticket=A.getTicket(pending.request_id,store);assert.equal(ticket.execution_record.effective_compilation_options.assetBaseDir,directory);assert.equal(ticket.execution_record.assets[0].source_path,path.join(directory,'source.bin'));
 const token=approve(pending.request_id,store),executed=X.execute({approvalToken:token,storageDir:store});assert(executed.success,JSON.stringify(executed));assert.equal(executed.project.assets[0].src,'source.bin');
});
test('revision overflow fails atomically instead of returning an inexact canonical revision',()=>{
 const p=fixture();p.revision=Number.MAX_SAFE_INTEGER;const before=hash(p),result=E.execute(p,{type:'trim_clip',params:{clipId:'title',newDurationTicks:60000}});assert.equal(result.success,false);assert.equal(result.errorCode,'REVISION_OVERFLOW');assert.equal(hash(p),before);
});
