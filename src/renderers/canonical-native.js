/** Explicit canonical snapshot -> native backend adapter, managed by RenderOrchestrator. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { EnvironmentResolver } = require('../engine/environment.js');
const { ProjectManager } = require('../engine/project.js');
const { digest, fail } = require('../creative/execution-record.js');
const { computeFileSha256BoundedSync: fileHash } = require('../prompt-core/job-orchestrator.js');
const { CompositionRenderer } = require('../creative/composition-renderer.js');
const VERSION = require('./native-capabilities.js').BACKENDS.verifiedNative.version;
const sec = ticks => ticks / 120000;
const number = (v, fallback) => {
  v = v ?? fallback;
  if (!Number.isFinite(v)) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', 'Finite numeric values required');
  return v;
};
function only(value, keys, label) {
  for (const key of Object.keys(value || {})) if (!keys.includes(key)) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', `${label}.${key}`);
}
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.status !== 0 || result.error) fail('ERR_NATIVE_RENDER_FAILED', `${cmd}: ${result.error?.message || result.stderr}`);
  return result;
}
function color(value = '#ffffff') {
  if (!/^#[a-fA-F0-9]{6}$/.test(value)) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', `Color requires #RRGGBB: ${value}`);
  return value;
}
function keyframeExpression(keyframes, clock, fallback) {
  if (!keyframes) return String(fallback);
  let expression=String(keyframes.at(-1).value);
  for(let i=keyframes.length-2;i>=0;i--){const a=keyframes[i],b=keyframes[i+1];expression=`if(lt(${clock},${sec(b.offsetTick)}),${a.value}+(${b.value-a.value})*(${clock}-${sec(a.offsetTick)})/${sec(b.offsetTick-a.offsetTick)},${expression})`;}
  return `if(lt(${clock},${sec(keyframes[0].offsetTick)}),${keyframes[0].value},${expression})`;
}
class CanonicalNativeAdapter {
  static VERSION = VERSION;
  static stageAssets(snapshot, stagingDir) {
    const staged = new Map();
    for (const asset of snapshot.project.assets) {
      const binding = snapshot.assets.find(a => a.asset_id === asset.id);
      if (!binding || fs.realpathSync(binding.source_path)!==binding.real_path || fileHash(binding.source_path) !== binding.sha256) fail('ERR_ASSET_INTEGRITY_MISMATCH', asset.id);
      const dest = path.join(stagingDir, `asset-${digest(asset.id)}${path.extname(binding.source_path)}`);
      fs.copyFileSync(binding.source_path, dest, fs.constants.COPYFILE_EXCL);
      if (fileHash(dest) !== binding.sha256) fail('ERR_ASSET_INTEGRITY_MISMATCH', asset.id);
      staged.set(asset.id, dest);
    }
    for (const binding of snapshot.assets) {
      if(staged.has(binding.asset_id))continue;
      if(fs.realpathSync(binding.source_path)!==binding.real_path || fileHash(binding.source_path)!==binding.sha256)fail('ERR_ASSET_INTEGRITY_MISMATCH',binding.asset_id);
      const dest=path.join(stagingDir,`aux-${digest(binding.asset_id)}${path.extname(binding.source_path)}`);fs.copyFileSync(binding.source_path,dest,fs.constants.COPYFILE_EXCL);
      if(fileHash(dest)!==binding.sha256)fail('ERR_ASSET_INTEGRITY_MISMATCH',binding.asset_id);staged.set(binding.asset_id,dest);
    }
    return staged;
  }
  static render({ snapshot, stagingDir, outputPath }) {
    const p = snapshot.project;
    ProjectManager.validate(p);
    if (digest(p) !== snapshot.provenance.snapshot_sha256) fail('ERR_COMMITTED_SNAPSHOT_MISMATCH', 'Render snapshot changed');
    if(p.deliveryProfile && ((p.deliveryProfile.truePeakCeiling!==undefined && p.deliveryProfile.truePeakCeiling!==-1) || Object.keys(p.deliveryProfile).some(k=>!['truePeakCeiling'].includes(k))))fail('ERR_UNSUPPORTED_OUTPUT_PROFILE','Alternative delivery profile requires an explicit implementation');
    if (p.colorGrade?.enabled) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', 'Native canonical animation/color grade unsupported');
    const { width, height } = p.canvas, { fps, durationTicks } = p.timebase;
    if (width % 2 || height % 2 || durationTicks <= 0) fail('ERR_UNSUPPORTED_OUTPUT_PROFILE', 'H264 requires even dimensions and positive duration');
    const rate = `${fps.numerator}/${fps.denominator}`, duration = sec(durationTicks);
    const assets = this.stageAssets(snapshot, stagingDir);
    const tracks = new Map(p.tracks.map(t => [t.id, t]));
    const clips = p.clips.filter(c => !tracks.get(c.trackId).muted).sort((a,b) => tracks.get(a.trackId).zIndex-tracks.get(b.trackId).zIndex || a.startTick-b.startTick || a.id.localeCompare(b.id));
    const args = ['-nostdin', '-v', 'error', '-n', '-filter_complex_threads', '1'];
    const filters = [`color=c=${color(p.canvas.backgroundColor || '#000000')}:s=${width}x${height}:r=${rate}:d=${duration}[base]`];
    const audioLabels = []; let inputs = 0, layer = 'base';
    const fontEvidence = [], subjectEvidence = [], animations=new Map();
    for(const animation of p.animations || []){
      const clip=p.clips.find(c=>c.id===animation.clipId);
      if(!clip || !['transform.opacity','transform.x','transform.y'].includes(animation.property) || !animation.keyframes?.length)fail('ERR_UNSUPPORTED_CANONICAL_ANIMATION','Only linear opacity/x/y keyframes supported');
      let last=-1;
      for(const k of animation.keyframes){if(k.easing!=='linear' || !Number.isFinite(k.value) || !Number.isSafeInteger(k.offsetTick) || k.offsetTick<=last || k.offsetTick>clip.durationTicks)fail('ERR_UNSUPPORTED_CANONICAL_ANIMATION','Invalid or nonlinear keyframes');if(animation.property==='transform.opacity' && (k.value<0||k.value>1))fail('ERR_UNSUPPORTED_CANONICAL_ANIMATION','Opacity bounds');last=k.offsetTick;}
      const key=`${clip.id}:${animation.property}`;if(animations.has(key))fail('ERR_UNSUPPORTED_CANONICAL_ANIMATION','Duplicate animation channels');animations.set(key,animation.keyframes);
    }
    for (const [i, c] of clips.entries()) {
      only(c,['id','trackId','type','startTick','durationTicks','source','assetId','transform','typography','effects','audio','properties','metadata','colorGrade'],`clip:${c.id}`);
      if (c.startTick + c.durationTicks > durationTicks || c.colorGrade?.enabled) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', `${c.id}: duration or colorGrade`);
      only(c.properties, ['reframing', 'optical_distortion', 'curved_typography', 'render_font', 'face_safe', 'text_backing', 'subject_safe'], `${c.id}.properties`);
      if (c.type === 'audio') continue; // Sample-accurate canonical mixer owns audio below.
      only(c.source,['assetId','trimInTick','trimOutTick'],'source');
      if(c.type!=='text' && (c.typography || c.properties?.curved_typography || c.properties?.face_safe || c.properties?.render_font || c.properties?.text_backing || c.properties?.subject_safe))fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY','Required graphic typography/face-safe payload is supported only on text clips');
      const t = c.transform || {};
      only(t, ['x','y','scaleX','scaleY','rotation','opacity','anchorX','anchorY'], 'transform');
      if ((t.anchorX ?? .5) !== .5 || (t.anchorY ?? .5) !== .5) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', 'Noncentral transform anchor');
      const sx = number(t.scaleX, 1), sy = number(t.scaleY, 1), opacity = number(t.opacity, 1);
      if (sx <= 0 || sy <= 0 || opacity < 0 || opacity > 1) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', 'Invalid transform scale/opacity');
      const start = sec(c.startTick), len = sec(c.durationTicks), end = start + len;
      let src = assets.get(c.source?.assetId || c.assetId);
      let graphic=null;
      if (c.type === 'text') {
        const typo=c.typography || {};
        only(typo,['text','fontAssetId','fontSize','color','textAlign','letterSpacing','lineHeight'],'typography');
        if(typo.letterSpacing || (typo.lineHeight!==undefined && typo.lineHeight!==1.2))fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY','Typography spacing');
        const graphics=require('./graphic-rasterizer.js'),copy=structuredClone(c);
        const binding=snapshot.assets.find(a=>a.source_path===c.properties?.render_font?.path);
        if(binding)copy.properties.render_font.path=assets.get(binding.asset_id);
        const font=graphics.resolveFont(copy,assets);fontEvidence.push({sha256:font.sha256,clip_id:c.id});
        const directory=path.join(stagingDir,`graphic-${i}`);fs.mkdirSync(directory);
        graphic=graphics.rasterizeGraphic({clip:copy,canvas:p.canvas,fps,outputDir:directory,font});src=graphic.inputPath;
        if(c.properties?.subject_safe){
          const subject=c.properties.subject_safe;
          const sceneBinding=snapshot.assets.find(a=>a.source_path===subject.evidence?.path);
          if(!binding || !sceneBinding || sceneBinding.sha256!==subject.evidence.sha256)fail('ERR_SUBJECT_TITLE_BINDING','Font and scene bytes must be bound to the approved execution');
          const doc=JSON.parse(fs.readFileSync(assets.get(sceneBinding.asset_id),'utf8'));
          const subjectVideo=p.clips.find(v=>v.id===subject.videoClipId);
          const actualSource=assets.get(subjectVideo?.source?.assetId || subjectVideo?.assetId);
          if(!actualSource)fail('ERR_SUBJECT_TITLE_BINDING','Tracked footage is unavailable');
          const dimensions=require('./inspector.js').FrameInspector.inspectVideoMetadata(actualSource).video;
          if(dimensions.width!==doc.source.width || dimensions.height!==doc.source.height)fail('ERR_SUBJECT_TITLE_BINDING','Actual source dimensions differ from scene coordinates');
          subjectEvidence.push(require('../scene/title-placement.js').verifySubjectTitle({project:p,clip:c,doc,bounds:graphic.bounds}));
        }
        const safe=c.properties?.face_safe;
        if(safe?.required){
          if(digest(safe.local_bounds)!==digest(graphic.bounds))fail('ERR_GRAPHIC_BOUNDS_MISMATCH','Graphic bounds differ from approved placement');
          require('../creative/visual-evidence.js').requireCoverage({frames:safe.scene_frames},c.startTick,c.durationTicks,fps);
          const videos=p.clips.filter(v=>v.type==='video' && !tracks.get(v.trackId).muted).map(v=>({clip_id:v.id,sha256:digest(v)}));
          if(digest(videos)!==digest(safe.video_bindings))fail('ERR_FACE_SAFE_VIDEO_BINDING','Video composition differs from approved face evidence');
          if(animations.has(`${c.id}:transform.x`) || animations.has(`${c.id}:transform.y`))fail('ERR_FACE_SAFE_ANIMATION_UNSUPPORTED','Required placement cannot use additional position animation');
          graphics.assertFaceSafe(graphics.transformedBounds(graphic.bounds,p.canvas,t),safe.scene_frames,p.canvas,safe.margin_px);
        }
      }
      if (!src) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', `No bound source for ${c.id}`);
      const input = inputs++;
      if(graphic?.sequence)args.push('-framerate',rate,'-start_number','0');
      else if (c.type === 'text' || c.type === 'graphic') args.push('-loop','1','-framerate',rate);
      args.push('-i', src);
      const trim = sec(c.source?.trimInTick || 0);
      if (c.source?.trimOutTick !== undefined && c.source.trimOutTick - (c.source.trimInTick || 0) !== c.durationTicks) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', 'Speed changes/source duration mismatch');
      only(c.audio,['volume'],'visual clip audio');
      if (c.audio && number(c.audio.volume, 1) !== 0) fail('ERR_UNSUPPORTED_CANONICAL_PROPERTY', 'Declare source dialogue as an explicit audio track');
      let chain = `[${input}:v]trim=start=${trim}:duration=${len},setpts=PTS-STARTPTS`;
      const crop = c.properties?.reframing?.crop_rect;
      if (crop) {
        for (const k of ['x','y','width','height']) if (!Number.isSafeInteger(crop[k]) || crop[k] < (k==='width'||k==='height'?1:0)) fail('ERR_INVALID_CROP', k);
        const metadata=require('./inspector.js').FrameInspector.inspectVideoMetadata(src);
        if(crop.x+crop.width>metadata.video.width || crop.y+crop.height>metadata.video.height)fail('ERR_INVALID_CROP','Crop exceeds actual source dimensions');
        chain += `,crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}:exact=1`;
      }
      if(c.type==='video') {
        const metadata=require('./inspector.js').FrameInspector.inspectVideoMetadata(src);
        const sourceWidth=crop?.width || metadata.video.width,sourceHeight=crop?.height || metadata.video.height;
        if(Math.abs(sourceWidth/sourceHeight-width/height)>Math.max(1/width,1/height))fail(crop?'ERR_CROP_ASPECT_MISMATCH':'ERR_EXPLICIT_CROP_REQUIRED','Source region must match canvas aspect within one pixel; supply an explicit compatible crop');
      }
      const distortion = c.properties?.optical_distortion;
      if (distortion && distortion.enabled!==false) { const d = CompositionRenderer.validateOpticalDistortionParams(distortion); chain += `,lenscorrection=cx=${d.cx}:cy=${d.cy}:k1=${d.k1}:k2=${d.k2}:i=${d.interpolation}`; }
      for (const effect of c.effects || []) {
        const e = effect.parameters || {};
        if (effect.type === 'invert') { only(e, [], 'invert'); chain += ',negate'; }
        else if (effect.type === 'brightness') { only(e,['factor'],'brightness'); const factor=number(e.factor,1);if(factor<0)fail('ERR_UNSUPPORTED_RENDERER_FEATURE','Negative brightness factor');chain += `,colorchannelmixer=rr=${factor}:gg=${factor}:bb=${factor}`; }
        else if (effect.type === 'contrast') { only(e,['factor'],'contrast'); const factor=number(e.factor,1);if(factor<0)fail('ERR_UNSUPPORTED_RENDERER_FEATURE','Negative contrast factor');chain += `,eq=contrast=${factor}`; }
        else if (effect.type === 'blur') { only(e,['radius'],'blur'); chain += `,boxblur=${number(e.radius,1)}`; }
        else if (effect.type === 'transition' && e.effect === 'optical_fisheye_distortion' && distortion && digest(CompositionRenderer.validateOpticalDistortionParams(Object.fromEntries(Object.entries(e).filter(([k])=>k!=='effect')))) === digest(CompositionRenderer.validateOpticalDistortionParams(distortion))) { /* duplicate canonical payload */ }
        else if(effect.type==='transition' && e.effect==='curved_typography' && c.properties?.curved_typography && digest({curve:e.curve,styling:e.styling,animation:e.animation})===digest({curve:c.properties.curved_typography.curve,styling:c.properties.curved_typography.styling,animation:c.properties.curved_typography.animation})){ /* matching canonical geometry */ }
        else fail('ERR_UNSUPPORTED_RENDERER_FEATURE', `${effect.type}:${e.effect || ''}`);
      }
      const sw = Math.max(2,Math.round(width*sx/2)*2), sh = Math.max(2,Math.round(height*sy/2)*2);
      chain += `,scale=${sw}:${sh},setsar=1,format=rgba,colorchannelmixer=aa=${animations.has(`${c.id}:transform.opacity`)?1:opacity}`;
      const opacityKeys=animations.get(`${c.id}:transform.opacity`);
      if(opacityKeys)chain+=`,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${keyframeExpression(opacityKeys,'T',1)})'`;
      const rotation = number(t.rotation,0)*Math.PI/180;
      if (rotation) chain += `,rotate=${rotation}:ow=rotw(${rotation}):oh=roth(${rotation}):c=none`;
      chain += `,setpts=PTS+${start}/TB[v${i}]`; filters.push(chain);
      const x = keyframeExpression(animations.get(`${c.id}:transform.x`),`(t-${start})`,number(t.x,0)), y = keyframeExpression(animations.get(`${c.id}:transform.y`),`(t-${start})`,number(t.y,0)), next = `layer${i}`;
      filters.push(`[${layer}][v${i}]overlay=x='(main_w-overlay_w)/2+${x}':y='(main_h-overlay_h)/2+${y}':enable='gte(t,${start})*lt(t,${end})':eof_action=pass:repeatlast=0[${next}]`);
      layer = next;
    }
    let audioMaster = null;
    if (clips.some(c => c.type === 'audio')) {
      audioMaster = require('../creative/audio-mixer-engine.js').AudioMixerEngine.renderCanonicalTracks({clips,assets,durationTicks,outputPath:path.join(stagingDir,'canonical-master.wav')});
      args.push('-i',audioMaster.outputPath);
      filters.push(`[${inputs}:a]anull[audio]`);audioLabels.push('[audio]');
    }
    args.push('-filter_complex',filters.join(';'),'-map',`[${layer}]`);
    if (audioLabels.length) args.push('-map','[audio]','-c:a','aac','-b:a','192k','-ar','48000','-ac','2');
    args.push('-t',String(duration),'-r',rate,'-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',outputPath);
    run(EnvironmentResolver.resolveFfmpeg() || 'ffmpeg', args);
    return { success:true, outputPath, provenance: {...snapshot.provenance, renderer:VERSION, output_profile:{width,height,frame_rate:fps,duration_ticks:durationTicks}, fonts:fontEvidence, subject_titles:subjectEvidence, audio_master:audioMaster ? {master_gain_db:audioMaster.master_gain_db,audit:audioMaster.audit} : null}, sha256:fileHash(outputPath) };
  }
}
module.exports = { CanonicalNativeAdapter };
