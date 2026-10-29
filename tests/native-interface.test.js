const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {spawn,spawnSync}=require('node:child_process');
const {workspace}=require('./helpers/phase1-approval.cjs');
const {fixture,commit}=require('./helpers/canonical-media.cjs');
const {EditorBackend}=require('../src/ui/server.js');
const {NativeDelivery}=require('../src/prompt-core/native-delivery.js');
const {assertSafePath}=require('../src/mcp/server.js');
test('HTTP delivery shares the sealed native route and rejects unbound/override requests',async()=>{
 const {root,store}=workspace(),p=fixture(root),{result}=commit(p,root,store),backend=new EditorBackend({project:p,outputDir:root});backend.nativeDelivery=new NativeDelivery({storageDir:path.join(root,'deliveries'),approvalDir:store});const server=http.createServer((req,res)=>backend.handleRequest(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
 try{
  assert.equal((await post('/api/deliver',{})).status,400);assert.equal((await post('/api/render',{delivery:true,clips:[]})).status,400);
  const response=await post('/api/deliver',{executionId:result.execution_id,outputDir:root});assert.equal(response.status,200,JSON.stringify(response.data));assert.equal(response.data.status,'SUCCEEDED');assert.equal(response.data.provenance.snapshot_sha256,require('../src/creative/execution-record.js').digest(result.project));
  const status=await(await fetch(base+'/api/delivery/status?jobId='+response.data.jobId)).json();assert.equal(status.status,'SUCCEEDED');assert.equal(status.sha256,response.data.sha256);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
function startServer(root){const child=spawn(process.execPath,[path.join(root,'bin/eme-mcp.js')],{cwd:root,stdio:['pipe','pipe','pipe']});let pending=new Map(),buffer='',stderr='',id=0;child.stderr.on('data',b=>stderr+=b);child.stdout.on('data',b=>{buffer+=b;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);const message=JSON.parse(line),item=pending.get(message.id);assert(item,`Unexpected stdout: ${line}`);pending.delete(message.id);clearTimeout(item.timer);item.resolve(message);}});const call=(method,params)=>new Promise((resolve,reject)=>{const requestId=++id,timer=setTimeout(()=>reject(Error('MCP timeout: '+stderr)),30000);pending.set(requestId,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})+'\n');});const tool=async(name,args)=>{const r=await call('tools/call',{name,arguments:args});if(r.error)throw Error(r.error.message);return JSON.parse(r.result.content[0].text);};return{child,call,tool,close:()=>new Promise(resolve=>{child.on('exit',resolve);child.stdin.end();})};}
test('production stdio MCP executes, restarts, renders and reports durable delivery without model regeneration',async()=>{
 const {root}=workspace(),repo=path.resolve(__dirname,'..'),isolated=path.join(root,'checkout');fs.mkdirSync(isolated);
 for(const name of ['src','schema','bin'])fs.cpSync(path.join(repo,name),path.join(isolated,name),{recursive:true,errorOnExist:true,force:false});fs.mkdirSync(path.join(isolated,'tests'));fs.cpSync(path.join(repo,'tests/helpers'),path.join(isolated,'tests/helpers'),{recursive:true,errorOnExist:true,force:false});
 const input=path.join(isolated,'inputs');fs.mkdirSync(input);const p=fixture(input),projectPath=path.join(isolated,'project.json');fs.writeFileSync(projectPath,JSON.stringify(p));let server=startServer(isolated);
 try{
  assert.equal((await server.call('initialize',{})).result.serverInfo.name,'eme-mcp-server');server.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');const listed=await server.call('tools/list',{});assert(listed.result.tools.some(t=>t.name==='eme_render_and_verify'));
  const pending=await server.tool('eme_request_user_approval',{projectPath,operation:{type:'modify_clip',params:{clipId:'caption',transform:{x:10,y:0}}}});assert(pending.success);
  const token=require(path.join(isolated,'tests/helpers/phase1-approval.cjs')).approve(pending.request_id,path.join(isolated,'.eme/approvals/v2'));
  const execution=await server.tool('eme_execute_approved_plan',{approval_token:token});assert(execution.success,JSON.stringify(execution));
  await server.close();server=startServer(isolated);
  const delivery=await server.tool('eme_render_and_verify',{executionId:execution.execution_id,outputDir:path.join(isolated,'renders')});assert(delivery.success,JSON.stringify(delivery));const status=await server.tool('eme_get_job_status',{jobId:delivery.jobId});assert.equal(status.status,'SUCCEEDED');
  const reused=await server.tool('eme_execute_approved_plan',{approval_token:token});assert.equal(reused.success,false);assert.equal(reused.error.code,'ERR_APPROVAL_ALREADY_CONSUMED');
  const cli=spawnSync(process.execPath,[path.join(isolated,'bin/eme.js'),'deliver-committed','--execution-id',execution.execution_id,'--output-dir',path.join(isolated,'renders')],{encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).sha256,delivery.sha256);
  const record={workflow:'production local stdio; deterministic media; automated PTY; no live IDE inference',tools:listed.result.tools.length,project_revision:execution.revision,artifact:delivery.outputPath,sha256:delivery.sha256,qa:delivery.qa_metrics,root:isolated};fs.writeFileSync(path.join(root,'stdio-workflow.json'),JSON.stringify(record,null,2),{flag:'wx'});console.log('STDIO_WORKFLOW '+JSON.stringify({root:isolated,tools:record.tools,sha256:record.sha256,artifact:record.artifact}));
 }finally{await server.close();}
});
test('legacy delivery flags fail closed; package entry and safe path boundaries are valid',()=>{
 const cli=path.resolve(__dirname,'../bin/eme.js');for(const args of [['render','not-a-project','--deliver'],['prompt','render']]){const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/WITHHELD|withheld/);}
 assert.equal(typeof require('..').ExecutionAuthority.execute,'function');assert.throws(()=>assertSafePath(os.tmpdir()+'-unauthorized/sibling.txt'),/Security policy/);assert.equal(typeof assertSafePath(path.join(os.tmpdir(),'allowed.txt')),'string');
});
test('MCP dry-run verifies the actual snapshot digest and remains side-effect free',async()=>{
 const {root,store}=workspace(),p=fixture(root),{ApprovalAuthority}=require('../src/creative/approval-authority.js'),{EmeMcpServer}=require('../src/mcp/server.js'),{digest}=require('../src/creative/execution-record.js');
 const pending=ApprovalAuthority.createPendingRequest({project:p,operation:{type:'modify_clip',params:{clipId:'caption',transform:{x:4}}},storageDir:store});const before=digest(p),good=await EmeMcpServer.handleToolCall('eme_dry_run_plan',{project:p,operationPlan:pending.operation_plan});assert(good.success);
 const bad=structuredClone(pending.operation_plan);bad.project_snapshot.snapshot_sha256='a'.repeat(64);const result=await EmeMcpServer.handleToolCall('eme_dry_run_plan',{project:p,operationPlan:bad});assert.equal(result.success,false);assert.equal(result.stepsChecked,0);assert.equal(digest(p),before);
});
