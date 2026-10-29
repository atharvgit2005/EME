#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),evidence=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'eme-native-verification-')));
const args=['--test','--test-reporter=tap','tests/canonical-render.test.js','tests/native-delivery.test.js','tests/contracts-replay.test.js','tests/audio-contracts-canonical.test.js','tests/audio-peak-control.test.js','tests/visual-canonical.test.js','tests/native-interface.test.js'];
const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024});
const raw=(result.stdout||'')+(result.stderr||'');
fs.writeFileSync(path.join(evidence,'native.tap'),raw,{flag:'wx'});
const summary={node:process.version,command:[process.execPath,...args],cwd:root,exitCode:result.status,signal:result.signal,evidence,
 summary:raw.split('\n').filter(l=>/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) /.test(l))};
fs.writeFileSync(path.join(evidence,'summary.json'),JSON.stringify(summary,null,2),{flag:'wx'});
console.log(JSON.stringify(summary));if(result.status!==0)console.log(raw);process.exitCode=result.status===0?0:1;
