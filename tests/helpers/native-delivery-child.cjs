const fs=require('node:fs');
const {NativeDelivery}=require('../../src/prompt-core/native-delivery.js');
const {RenderOrchestrator}=require('../../src/prompt-core/render-orchestrator.js');
const config=JSON.parse(process.argv[2]);
if(config.mode==='barrier') {
 const old=RenderOrchestrator.renderCommitted;
 RenderOrchestrator.renderCommitted=function(...args){
  process.stdout.write('BARRIER\n');
  const until=Date.now()+15000;
  while(!fs.existsSync(config.gate)) {if(Date.now()>until)throw Error('Timed out');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}
  return old.apply(this,args);
 };
}
if(config.mode==='after-publication') {
 const old=fs.renameSync;
 fs.renameSync=function(a,b){const result=old(a,b);if(b.includes('/sessions/'))process.kill(process.pid,'SIGKILL');return result;};
}
const delivery=new NativeDelivery(config.service);
process.stdout.write(JSON.stringify(delivery.run(config.request))+'\n');
