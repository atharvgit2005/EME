const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {workspace}=require('./helpers/phase1-approval.cjs');
const {AudioMixerEngine:Audio}=require('../src/creative/audio-mixer-engine.js');
test('explicit peak control becomes immutable canonical tick gains and preserves the delivery target',()=>{
 const {root}=workspace(),source=path.join(root,'peaky.wav'),left=new Float32Array(96000),right=new Float32Array(96000);
 for(let i=0;i<left.length;i++){left[i]=right[i]=.08*Math.sin(2*Math.PI*440*i/48000);}for(let i=20000;i<20010;i++)left[i]=right[i]=.9;
 Audio.encodeWav(left,right,source);const original=fs.readFileSync(source),assets=new Map([['speech',source]]),clip={id:'voice',type:'audio',startTick:0,durationTicks:240000,source:{assetId:'speech',trimInTick:0,trimOutTick:240000},audio:{volume:1}};
 assert.throws(()=>Audio.renderCanonicalTracks({clips:[clip],assets,durationTicks:240000,outputPath:path.join(root,'uncontrolled.wav')}),/HEADROOM/);
 const profile={ceilingDb:-18,windowTicks:1200,lookaheadTicks:2400,releaseTicks:12000},before=JSON.stringify(profile);
 const envelope=Audio.compilePeakControlEnvelope({sourcePath:source,startTick:0,durationTicks:240000,profile});assert.equal(JSON.stringify(profile),before);assert.deepEqual(fs.readFileSync(source),original);assert.equal(envelope[0].offsetTick,0);assert.equal(envelope.at(-1).offsetTick,240000);assert(envelope.some(p=>p.volume<1));for(let i=1;i<envelope.length;i++)assert(envelope[i].offsetTick>envelope[i-1].offsetTick);
 const result=Audio.renderCanonicalTracks({clips:[{...clip,audio:{volume:1,volumeEnvelope:envelope}}],assets,durationTicks:240000,outputPath:path.join(root,'controlled.wav')});assert(result.audit.loudnessPassed);assert(Math.abs(result.audit.integratedLufs+14)<=1);assert(result.audit.truePeakDb<=-1);assert.equal(result.audit.clippedSamples,0);
 assert.throws(()=>Audio.compilePeakControlEnvelope({sourcePath:source,startTick:0,durationTicks:240000,profile:{ceilingDb:1}}),/PROFILE/);
 console.log('EXPLICIT_PEAK_CONTROL '+JSON.stringify({keyframes:envelope.length,audit:result.audit}));
});
