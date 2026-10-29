const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {workspace,approve}=require('./helpers/phase1-approval.cjs');
const {fixture,commit,command,frame}=require('./helpers/canonical-media.cjs');
const {CompositionRenderer:Composition}=require('../src/creative/composition-renderer.js');
const {CurvedTypography:Curve}=require('../src/creative/curved-typography.js');
const {HyperFramesCapabilities:HF}=require('../src/renderers/hyperframes/capabilities.js');
const {EmeMcpServer:MCP}=require('../src/mcp/server.js');
const {NativeDelivery}=require('../src/prompt-core/native-delivery.js');
const {CanonicalNativeAdapter:Native}=require('../src/renderers/canonical-native.js');
const {loadCommittedSnapshot}=require('../src/creative/committed-snapshot.js');
const {digest}=require('../src/creative/execution-record.js');
const {mapPlanSidecars,requireCoverage}=require('../src/creative/visual-evidence.js');
const {CreativeContextBuilder:Context}=require('../src/creative/creative-context-builder.js');
const {MockLlmAdapter:Mock}=require('../src/creative/adapter/runtime-llm-adapter.js');
const {CreativePlanCompiler:Compiler}=require('../src/creative/creative-plan-compiler.js');
const {CreativePlanValidator:Validator}=require('../src/creative/schema-validator.js');
const {ApprovalAuthority:A}=require('../src/creative/approval-authority.js');
const {ExecutionAuthority:X}=require('../src/creative/execution-authority.js');
function delivery(root,store,id){return new NativeDelivery({storageDir:path.join(root,'deliveries'),approvalDir:store}).run({executionId:id,outputDir:root});}
test('capability matrix rejects unknown names, unsupported distortion coefficients and SVG curves',async()=>{
 assert.equal(Composition.validateCapabilities({features:['unknown-capability']}).supported,false);assert.throws(()=>Composition.validateOpticalDistortionParams({p1:.2}),/Unsupported parameter/);assert.throws(()=>Curve.validateParams({text:'Test',curve:{type:'path',svgPath:'M 0 0'}}),/Unsupported curve/);
 assert.equal(HF.validate({clips:[{id:'a',type:'video',properties:{optical_distortion:{k1:.2}}}]}).supported,false);assert.equal(HF.validate({clips:[{id:'a',type:'video',effects:[{type:'transition',parameters:{effect:'curved_typography'}}]}]}).supported,false);
 const matrix=await MCP.handleToolCall('eme_get_renderer_capabilities',{});assert.deepEqual(matrix.capabilities.visual.opticalDistortion.parameters,['cx','cy','k1','k2','interpolation']);assert.deepEqual(matrix.capabilities.visual.curvedTypography.curves,['arc']);
});
test('source-specific crops, source trims, offsets and half-open annotation coverage map correctly',()=>{
 const project={canvas:{width:160,height:120}},beats=[{source_media_ref:{asset_id:'a'},source_range:{start_tick:12000,end_tick:24000},timeline_range:{start_tick:0,end_tick:12000},editorial_decisions:{reframing:{enabled:true,crop_rect:{x:100,y:0,width:200,height:100}}}},{source_media_ref:{asset_id:'b'},source_range:{start_tick:0,end_tick:12000},timeline_range:{start_tick:12000,end_tick:24000},editorial_decisions:{reframing:{enabled:true,crop_rect:{x:0,y:50,width:400,height:200}}}}];
 const side=(width,height,start,bounds)=>({source:{width,height,fps:{numerator:30,denominator:1}},frames:[0,4000,8000].map(t=>({tick:start+t,observations:[{type:'face',bounds}]}))});
 const mapped=mapPlanSidecars({narrative_beats:beats},project,{vtsmSidecars:{a:side(400,100,12000,{x:150,y:10,width:20,height:20}),b:side(400,300,0,{x:100,y:100,width:40,height:40})}});
 assert.deepEqual(mapped.frames[0].observations[0].bounds,{x:40,y:12,width:16,height:24});assert.deepEqual(mapped.frames[3].observations[0].bounds,{x:40,y:30,width:16,height:24});assert.equal(mapped.frames[3].tick,12000);
 assert.equal(requireCoverage(mapped,0,24000,{numerator:30,denominator:1}).length,6);assert.throws(()=>requireCoverage({...mapped,frames:mapped.frames.slice(1)},0,24000,{numerator:30,denominator:1}),/EVIDENCE_REQUIRED/);
 assert.equal(mapPlanSidecars({narrative_beats:beats},project,{vtsmSidecar:side(400,100,0,{x:0,y:0,width:1,height:1})}).frames.length,0);
});
test('approved optical distortion alters decoded pixels against a real undistorted control',()=>{
 const {root,store}=workspace(),p=fixture(root),grid=path.join(root,'grid.mp4');command('ffmpeg',['-v','error','-n','-f','lavfi','-i','testsrc2=s=160x120:r=30:d=2','-c:v','libx264',grid]);p.assets[0].src=grid;p.clips[0].properties={optical_distortion:{cx:.5,cy:.5,k1:-.35,k2:-.1,interpolation:'bilinear'}};
 const {result}=commit(p,root,store),out=delivery(root,store,result.execution_id);assert(out.success,JSON.stringify(out));const snapshot=structuredClone(loadCommittedSnapshot(result.execution_id,store));delete snapshot.project.clips[0].properties;snapshot.provenance.snapshot_sha256=digest(snapshot.project);const stagingDir=path.join(root,'control');fs.mkdirSync(stagingDir);Native.render({snapshot,stagingDir,outputPath:path.join(stagingDir,'control.mp4')});
 const a=frame(out.outputPath,.2),b=frame(path.join(stagingDir,'control.mp4'),.2);let diff=0;for(let i=0;i<a.length;i++)diff+=Math.abs(a[i]-b[i]);assert(diff/a.length>5,`diff=${diff/a.length}`);
 console.log('OPTICAL_ACCEPTANCE '+JSON.stringify({artifact:out.outputPath,sha256:out.sha256,mean_absolute_pixel_difference:diff/a.length}));
});
function yellowPixels(buffer){const points=[];for(let i=0;i<buffer.length;i+=3)if(buffer[i]>130&&buffer[i+1]>130&&buffer[i+2]<80)points.push([((i/3)%160),Math.floor(i/3/160)]);return{count:points.length,x:points.reduce((s,p)=>s+p[0],0)/Math.max(1,points.length),y:points.reduce((s,p)=>s+p[1],0)/Math.max(1,points.length)};}
test('approved animated curved typography reaches final mux with color, motion and exact intervals',()=>{
 const {root,store}=workspace(),p=fixture(root),caption=p.clips.find(c=>c.id==='caption');p.clips.find(c=>c.id==='second').effects=[];
 caption.startTick=36000;caption.durationTicks=120000;caption.typography={text:'CANONICAL',fontSize:12,color:'#ffff00'};caption.properties={curved_typography:Curve.validateParams({text:'CANONICAL',curve:{centerX:80,centerY:95,radius:42,startAngleDeg:155,endAngleDeg:25},styling:{fontSize:12,color:'#ffff00'},animation:{type:'fade_and_sweep',sweepShiftDeg:70,fadeRatio:.1},timeline:{startTick:36000,durationTicks:120000}})};
 const {result}=commit(p,root,store),out=delivery(root,store,result.execution_id);assert(out.success,JSON.stringify(out));
 const before=yellowPixels(frame(out.outputPath,.1)),early=yellowPixels(frame(out.outputPath,.5)),late=yellowPixels(frame(out.outputPath,1.1)),after=yellowPixels(frame(out.outputPath,1.5));assert.equal(before.count,0);assert(early.count>20);assert(late.count>20);assert.equal(after.count,0);assert(Math.hypot(early.x-late.x,early.y-late.y)>3,JSON.stringify({early,late}));
 const frames=[];for(const t of [.5,1.1]){const file=path.join(root,`curved-${t}.png`);command('ffmpeg',['-v','error','-n','-ss',String(t),'-i',out.outputPath,'-frames:v','1',file]);frames.push(file);}
 console.log('CURVED_ACCEPTANCE '+JSON.stringify({artifact:out.outputPath,sha256:out.sha256,early,late,frames}));
});
async function faceFixture(){const {root,store}=workspace(),p=fixture(root);p.canvas={width:108,height:192,aspectRatio:'9:16',backgroundColor:'#000000'};p.clips=p.clips.filter(c=>c.type!=='text');const plan=await new Mock().generateCreativePlan({context:Context.buildContext({brief:'2 second edit',project:p})});plan.audio_direction={dialogue_ducking_enabled:false,sfx_cues:[]};plan.deliverable.width=108;plan.deliverable.height=192;plan.deliverable.frame_rate=p.timebase.fps;for(const b of plan.narrative_beats){b.editorial_decisions.reframing.enabled=true;b.editorial_decisions.reframing.crop_rect={x:46,y:0,width:68,height:120};}plan.visual_events=[{event_id:'event-safe',event_type:'caption',timeline_range:{start_tick:0,end_tick:240000,duration_ticks:240000},content:{text:'SAFE',font_size:14,font_color:'#ffffff'},spatial_constraints:{target_anchor:'lower_third',avoid_face_overlap:true,safe_margin_ratio:.05},motion:{animation_type:'none'}}];plan.provenance.plan_hash=Validator.computePlanHash(plan);
 const side={source:{width:160,height:120,fps:{numerator:30,denominator:1}},frames:Array.from({length:60},(_,i)=>({tick:i*4000,observations:[{type:'face',bounds:{x:50,y:25,width:60,height:55},confidence:1}]}))};return{root,store,p,plan,side};}
test('required face-safe placement uses raster bounds; missing/infeasible evidence fails closed',async()=>{
 const {root,store,p,plan,side}=await faceFixture();
 assert.equal(Compiler.compile({creativePlan:plan,project:p}).success,false);
 const options={vtsmSidecars:Object.fromEntries(p.assets.filter(a=>a.type==='video').map(a=>[a.id,side]))};
 const compiled=Compiler.compile({creativePlan:plan,project:p,options});assert(compiled.success,JSON.stringify(compiled.errors));const text=compiled.operationPlan.operations.find(o=>o.params.id==='clip_event_1');assert.equal(text.params.properties.face_safe.required,true);assert(text.params.properties.face_safe.local_bounds.width>0);
 const impossible=structuredClone(options);for(const s of Object.values(impossible.vtsmSidecars))for(const f of s.frames)f.observations[0].bounds={x:0,y:0,width:160,height:120};assert.equal(Compiler.compile({creativePlan:plan,project:p,options:impossible}).success,false);
 const partial=structuredClone(options);for(const s of Object.values(partial.vtsmSidecars))s.frames=s.frames.slice(1);assert.equal(Compiler.compile({creativePlan:plan,project:p,options:partial}).success,false);
 const projectPath=path.join(root,'project.json');fs.writeFileSync(projectPath,JSON.stringify(p));const pending=A.createPendingRequest({project:p,projectPath,creativePlan:plan,options,storageDir:store}),token=approve(pending.request_id,store),executed=X.execute({approvalToken:token,storageDir:store});assert(executed.success,JSON.stringify(executed));const out=delivery(root,store,executed.execution_id);assert(out.success,JSON.stringify(out));
 const image=path.join(root,'face-safe.png');command('ffmpeg',['-v','error','-n','-ss','0.2','-i',out.outputPath,'-frames:v','1',image]);
 console.log('FACE_SAFE_ACCEPTANCE '+JSON.stringify({artifact:out.outputPath,sha256:out.sha256,image,placement:text.params.transform,bounds:text.params.properties.face_safe.local_bounds}));
 const snapshot=structuredClone(loadCommittedSnapshot(executed.execution_id,store));snapshot.project.clips.find(c=>c.type==='video').transform.x=1;snapshot.provenance.snapshot_sha256=digest(snapshot.project);const stagingDir=path.join(root,'changed-video');fs.mkdirSync(stagingDir);assert.throws(()=>Native.render({snapshot,stagingDir,outputPath:path.join(stagingDir,'out.mp4')}),/VIDEO_BINDING/);
});
test('native linear opacity/x/y animation changes actual pixels; unsupported curves fail explicitly',()=>{
 const {root,store}=workspace(),p=fixture(root);p.animations=[{clipId:'caption',property:'transform.x',keyframes:[{offsetTick:0,value:-15,easing:'linear'},{offsetTick:48000,value:15,easing:'linear'}]},{clipId:'caption',property:'transform.opacity',keyframes:[{offsetTick:0,value:0,easing:'linear'},{offsetTick:12000,value:1,easing:'linear'},{offsetTick:48000,value:0,easing:'linear'}]}];
 const {result}=commit(p,root,store),out=delivery(root,store,result.execution_id);assert(out.success,JSON.stringify(out));const a=frame(out.outputPath,.4),b=frame(out.outputPath,.6);assert.notDeepEqual(a,b);
 const snap=structuredClone(loadCommittedSnapshot(result.execution_id,store));snap.project.animations[0].keyframes[0].easing='spring';snap.provenance.snapshot_sha256=digest(snap.project);const stage=path.join(root,'bad');fs.mkdirSync(stage);assert.throws(()=>Native.render({snapshot:snap,stagingDir:stage,outputPath:path.join(stage,'out.mp4')}),/ANIMATION/);
});
test('advertised brightness/contrast/blur filters alter real decoded media and preserve canonical parameter names',()=>{
 const {root,store}=workspace(),p=fixture(root),grid=path.join(root,'grid.mp4');command('ffmpeg',['-v','error','-n','-f','lavfi','-i','testsrc2=s=160x120:r=30:d=2','-c:v','libx264',grid]);p.assets[0].src=grid;const {result}=commit(p,root,store),original=loadCommittedSnapshot(result.execution_id,store);
 const controls=path.join(root,'neutral');fs.mkdirSync(controls);Native.render({snapshot:original,stagingDir:controls,outputPath:path.join(controls,'out.mp4')});const reference=frame(path.join(controls,'out.mp4'),.2);
 for(const[type,parameters]of [['brightness',{factor:.5}],['contrast',{factor:.4}],['blur',{radius:4}]]){const snapshot=structuredClone(original);snapshot.project.clips[0].effects=[{type,parameters}];snapshot.provenance.snapshot_sha256=digest(snapshot.project);const stage=path.join(root,type);fs.mkdirSync(stage);Native.render({snapshot,stagingDir:stage,outputPath:path.join(stage,'out.mp4')});const actual=frame(path.join(stage,'out.mp4'),.2);let difference=0;for(let i=0;i<actual.length;i++)difference+=Math.abs(actual[i]-reference[i]);assert(difference/actual.length>2,`${type}: ${difference/actual.length}`);}
});
test('compiler rejects ignored profile, motion, coefficient and option requests rather than approximating',async()=>{
 const {p,plan,side}=await faceFixture();const mismatch=structuredClone(plan);mismatch.deliverable.width+=2;assert.equal(Compiler.compile({creativePlan:mismatch,project:p}).errorCodes[0],'ERR_CANONICAL_OUTPUT_PROFILE_MISMATCH');
 const noText=structuredClone(plan);noText.visual_events=[];assert.equal(Compiler.compile({creativePlan:noText,project:p,options:{opticalDistortion:{p1:.1}}}).success,false);assert.equal(Compiler.compile({creativePlan:noText,project:p,options:{unknownVisualOption:true}}).success,false);
 const motion=structuredClone(plan);motion.visual_events[0].motion.animation_type='slide_up';assert.equal(Compiler.compile({creativePlan:motion,project:p}).errorCodes[0],'ERR_UNSUPPORTED_CANONICAL_ANIMATION');
});
test('native output honors integer and fractional frame rates with frame-derived sync',async t=>{
 for(const fps of [{numerator:24,denominator:1},{numerator:30000,denominator:1001}])await t.test(`${fps.numerator}/${fps.denominator}`,()=>{
  const {root,store}=workspace(),p=fixture(root);p.timebase.fps=fps;const {result}=commit(p,root,store),out=delivery(root,store,result.execution_id);assert(out.success,JSON.stringify(out));assert(Math.abs(out.qa_metrics.metadata.video.fps-fps.numerator/fps.denominator)<1e-6);assert.equal(out.qa_metrics.checks.find(c=>c.id==='av_frame_sync').passed,true);
 });
});
test('incompatible aspect ratios require an explicit crop instead of silent stretching',()=>{
 const {root,store}=workspace(),p=fixture(root),{result}=commit(p,root,store),snapshot=structuredClone(loadCommittedSnapshot(result.execution_id,store));snapshot.project.canvas.height=240;snapshot.provenance.snapshot_sha256=digest(snapshot.project);const stage=path.join(root,'aspect');fs.mkdirSync(stage);assert.throws(()=>Native.render({snapshot,stagingDir:stage,outputPath:path.join(stage,'out.mp4')}),/EXPLICIT_CROP_REQUIRED/);
});
test('required face-safe constraints on unsupported non-text graphics cannot be silently omitted',()=>{
 const {root,store}=workspace(),p=fixture(root),{result}=commit(p,root,store),snapshot=structuredClone(loadCommittedSnapshot(result.execution_id,store));snapshot.project.clips[0].properties={face_safe:{required:true}};snapshot.provenance.snapshot_sha256=digest(snapshot.project);const stage=path.join(root,'unsupported-face');fs.mkdirSync(stage);assert.throws(()=>Native.render({snapshot,stagingDir:stage,outputPath:path.join(stage,'out.mp4')}),/only on text/);
});
