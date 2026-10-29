const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { workspace, approve } = require('./phase1-approval.cjs');
const { OperationExecutor: E } = require('../../src/engine/operations.js');
const { ApprovalAuthority: A } = require('../../src/creative/approval-authority.js');
const { ExecutionAuthority: X } = require('../../src/creative/execution-authority.js');
const { loadCommittedSnapshot } = require('../../src/creative/committed-snapshot.js');
const { CanonicalNativeAdapter: Native } = require('../../src/renderers/canonical-native.js');
const { RenderOrchestrator: R } = require('../../src/prompt-core/render-orchestrator.js');
const { digest } = require('../../src/creative/execution-record.js');
function command(cmd,args,opts={}) { const r=spawnSync(cmd,args,{maxBuffer:8*1024*1024,...opts}); assert.equal(r.status,0,String(r.stderr));return r.stdout; }
function op(p,type,params) { const r=E.execute(p,{type,params});assert.equal(r.success,true,r.error);return r.project; }
function createMedia(root) {
  const a=path.join(root,'changing.mp4'), b=path.join(root,'blue.mp4'), audio=path.join(root,'tone.wav');
  command('ffmpeg',['-v','error','-n','-f','lavfi','-i','color=red:s=160x120:r=30:d=1','-f','lavfi','-i','color=green:s=160x120:r=30:d=1','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264',a]);
  command('ffmpeg',['-v','error','-n','-f','lavfi','-i','color=blue:s=160x120:r=30:d=1','-c:v','libx264',b]);
  command('ffmpeg',['-v','error','-n','-f','lavfi','-i','sine=frequency=440:duration=2:sample_rate=48000',audio]);
  return {a,b,audio};
}
function fixture(root) {
  const {a,b,audio}=createMedia(root);
  let p=op({},'create_project',{id:'canonical-render-fixture',width:160,height:120,fps:{numerator:30,denominator:1},durationTicks:240000,backgroundColor:'#000000'});
  for (const [id,kind,zIndex] of [['v','visual',0],['g','visual',10],['a','audio',0]]) p=op(p,'add_track',{id,kind,zIndex});
  for (const [id,type,src] of [['a','video',a],['b','video',b],['tone','audio',audio]]) p=op(p,'add_asset',{id,type,src});
  p=op(p,'insert_clip',{id:'first',trackId:'v',type:'video',startTick:0,durationTicks:120000,source:{assetId:'a',trimInTick:120000,trimOutTick:240000}});
  p=op(p,'insert_clip',{id:'second',trackId:'v',type:'video',startTick:120000,durationTicks:120000,source:{assetId:'b',trimInTick:0,trimOutTick:120000},transform:{scaleX:.5,scaleY:.5,x:20,y:0},effects:[{type:'invert',parameters:{}}]});
  p=op(p,'insert_clip',{id:'caption',trackId:'g',type:'text',startTick:36000,durationTicks:48000,typography:{text:'CANONICAL',fontSize:20,color:'#ffffff'}});
  p=op(p,'insert_clip',{id:'tone',trackId:'a',type:'audio',startTick:0,durationTicks:240000,source:{assetId:'tone',trimInTick:0,trimOutTick:240000},audio:{volume:1,volumeEnvelope:[{offsetTick:0,volume:0.1},{offsetTick:119999,volume:0.1},{offsetTick:120000,volume:1}]}});
  return p;
}
function frame(file,t) { return command('ffmpeg',['-v','error','-ss',String(t),'-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']); }
function pixel(f,x,y) {return [...f.subarray((y*160+x)*3,(y*160+x)*3+3)];}
function rms(file,start) { const b=command('ffmpeg',['-v','error','-ss',String(start),'-i',file,'-t','0.2','-f','f32le','-ar','48000','-ac','1','-']);let n=0;for(let i=0;i<b.length;i+=4)n+=b.readFloatLE(i)**2;return Math.sqrt(n/(b.length/4)); }
function commit(p,root,store) {
  const projectPath=path.join(root,'project.json');fs.writeFileSync(projectPath,JSON.stringify(p));
  const request=A.createPendingRequest({project:p,projectPath,operation:{type:'modify_clip',params:{clipId:'caption',transform:{x:10,y:0}}},storageDir:store});
  const token=approve(request.request_id,store);
  const result=X.execute({approvalToken:token,storageDir:store});assert.equal(result.success,true,JSON.stringify(result));
  return {result,projectPath};
}
module.exports={fixture,commit,command,frame,rms,pixel};
