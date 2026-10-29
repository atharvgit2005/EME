const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {CurvedTypography}=require('../creative/curved-typography.js');
const {computeFileSha256BoundedSync:hash}=require('../prompt-core/job-orchestrator.js');
function resolveFont(clip,assets=new Map()) {
 if(clip.typography?.fontAssetId && !assets.has(clip.typography.fontAssetId))throw Error('ERR_FONT_ASSET_UNAVAILABLE');
 const font=clip.properties?.render_font?.path || (clip.typography?.fontAssetId && assets.get(clip.typography.fontAssetId)) || ['/System/Library/Fonts/Helvetica.ttc','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(p=>fs.existsSync(p));
 if(!font)throw Error('ERR_FONT_UNAVAILABLE');
 const sha256=hash(font);if(clip.properties?.render_font?.sha256 && clip.properties.render_font.sha256!==sha256)throw Error('ERR_FONT_INTEGRITY_MISMATCH');return{path:font,sha256};
}
function rasterizeGraphic({clip,canvas,fps,outputDir,font}) {
 let frames,inputPath,sequence=false;
 const curve=clip.properties?.curved_typography;
 if(curve){
  const config=CurvedTypography.validateParams(curve);
  if(config.text!==clip.typography.text || config.timeline.startTick!==clip.startTick || config.timeline.durationTicks!==clip.durationTicks)throw Error('ERR_TYPOGRAPHY_PAYLOAD_MISMATCH');
  sequence=config.animation.type!=='none';inputPath=path.join(outputDir,sequence?'glyph_%04d.png':'glyph.png');
  const count=Math.max(1,Math.ceil(clip.durationTicks*fps.numerator/(120000*fps.denominator)));
  const result=CurvedTypography.rasterize({...config,fontPath:font.path,canvas,mode:sequence?'sequence':'single',totalFrames:count,outputPattern:inputPath,outputPath:inputPath});
  frames=sequence?result.frames:[result.frame];
 }else{
  inputPath=path.join(outputDir,'glyph.png');const t=clip.typography || {};
  const result=spawnSync('python3',[path.join(__dirname,'canonical-text-rasterizer.py')],{input:JSON.stringify({width:canvas.width,height:canvas.height,text:t.text || '',size:t.fontSize || 64,color:t.color || '#ffffff',align:t.textAlign || 'center',font:font.path,output:inputPath}),encoding:'utf8',timeout:30000});
  if(result.status!==0)throw Error(`ERR_TEXT_RASTERIZATION: ${result.stderr}`);frames=[JSON.parse(result.stdout)];
 }
 const visible=frames.map(f=>f.alpha_bounds).filter(Boolean);
 if(!visible.length)throw Error('ERR_GRAPHIC_INVISIBLE');
 const minX=Math.min(...visible.map(b=>b[0])),minY=Math.min(...visible.map(b=>b[1])),maxX=Math.max(...visible.map(b=>b[2])),maxY=Math.max(...visible.map(b=>b[3]));
 return{inputPath,sequence,frames,bounds:{x:minX,y:minY,width:maxX-minX,height:maxY-minY},font};
}
function transformedBounds(bounds,canvas,transform={}){
 const angle=(transform.rotation || 0)*Math.PI/180,sx=transform.scaleX ?? 1,sy=transform.scaleY ?? 1;
 const corners=[[bounds.x,bounds.y],[bounds.x+bounds.width,bounds.y],[bounds.x,bounds.y+bounds.height],[bounds.x+bounds.width,bounds.y+bounds.height]].map(([x,y])=>{const dx=(x-canvas.width/2)*sx,dy=(y-canvas.height/2)*sy;return[canvas.width/2+dx*Math.cos(angle)-dy*Math.sin(angle)+(transform.x || 0),canvas.height/2+dx*Math.sin(angle)+dy*Math.cos(angle)+(transform.y || 0)];});
 const x=Math.min(...corners.map(p=>p[0])),y=Math.min(...corners.map(p=>p[1]));return{x,y,width:Math.max(...corners.map(p=>p[0]))-x,height:Math.max(...corners.map(p=>p[1]))-y};
}
function assertFaceSafe(bounds,faces,canvas,margin=0){
 if(bounds.x<0 || bounds.y<0 || bounds.x+bounds.width>canvas.width || bounds.y+bounds.height>canvas.height)throw Error('ERR_GRAPHIC_OUTSIDE_CANVAS');
 for(const frame of faces)for(const face of frame.observations.filter(o=>o.type==='face').map(o=>o.bounds))if(bounds.x<face.x+face.width+margin && bounds.x+bounds.width>face.x-margin && bounds.y<face.y+face.height+margin && bounds.y+bounds.height>face.y-margin)throw Error('ERR_FACE_SAFE_COLLISION');
}
module.exports={resolveFont,rasterizeGraphic,transformedBounds,assertFaceSafe};
