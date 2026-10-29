#!/usr/bin/env node
/** Non-destructive aggregate acceptance runner. All raw output is preserved under a fresh root. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),evidence=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'eme-remediation-verification-'))),results=[];
for(const script of ['verify-contract-baseline.cjs','verify-portable-inputs.cjs','verify-approval-phase1.cjs','verify-native-delivery.cjs']){
 const command=[process.execPath,path.join(root,'scripts',script)],r=spawnSync(command[0],command.slice(1),{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});
 const raw=(r.stdout||'')+(r.stderr||'')+(r.error?`\n${r.error.stack}`:''),log=path.join(evidence,script+'.txt');fs.writeFileSync(log,raw,{flag:'wx'});
 const children=raw.split('\n').filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l)}catch(_){return null}}).filter(Boolean);
 results.push({command,exitCode:r.status,signal:r.signal,log,children});console.log(JSON.stringify({script,exitCode:r.status,log,children}));
}
const summary={node:process.version,cwd:root,evidence,results};fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});console.log(JSON.stringify({evidence,allPassed:results.every(r=>r.exitCode===0)}));process.exitCode=results.every(r=>r.exitCode===0)?0:1;
