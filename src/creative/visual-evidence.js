/** Source-specific annotations mapped through exact source trims and timeline offsets. */
function mapPlanSidecars(plan,project,options) {
 const sources=new Set(plan.narrative_beats.map(b=>b.source_media_ref.asset_id)),frames=[];
 for(const beat of plan.narrative_beats){
  const id=beat.source_media_ref.asset_id;
  const sidecar=options.vtsmSidecars?.[id] || (sources.size===1 || options.vtsmSidecar?.source?.asset_id===id ? options.vtsmSidecar : null);
  if(!sidecar?.frames)continue;
  const source=sidecar.source || {},fps=source.fps,step=fps && Math.ceil(120000*fps.denominator/fps.numerator);
  if(!Number.isFinite(step)||step<=0||!source.width||!source.height)continue;
  const crop=beat.editorial_decisions?.reframing?.enabled ? beat.editorial_decisions.reframing.crop_rect : {x:0,y:0,width:source.width,height:source.height};
  if(!crop || crop.width<=0||crop.height<=0)continue;
  for(const frame of sidecar.frames){
   if(frame.tick<beat.source_range.start_tick || frame.tick>=beat.source_range.end_tick)continue;
   const tick=beat.timeline_range.start_tick+frame.tick-beat.source_range.start_tick;
   const observations=(frame.observations || []).filter(o=>o.type==='face' && (o.confidence ?? 1)>=.5).map(o=>{
    const b=o.bounds;if(!b || !Object.values(b).every(Number.isFinite) || b.width<=0 || b.height<=0)throw Error('ERR_INVALID_FACE_EVIDENCE');
    return{type:'face',bounds:{x:(b.x-crop.x)*project.canvas.width/crop.width,y:(b.y-crop.y)*project.canvas.height/crop.height,width:b.width*project.canvas.width/crop.width,height:b.height*project.canvas.height/crop.height}};
   });
   frames.push({tick,coverage_end_tick:Math.min(beat.timeline_range.end_tick,tick+step),asset_id:id,observations});
  }
 }
 return{source:{width:project.canvas.width,height:project.canvas.height},frames:frames.sort((a,b)=>a.tick-b.tick)};
}
function requireCoverage(sidecar,startTick,durationTicks,fps){
 const end=startTick+durationTicks,step=120000*fps.denominator/fps.numerator;
 for(let i=0;i<Math.ceil(durationTicks/step);i++){
  const tick=startTick+Math.floor(i*step);
  if(!sidecar.frames.some(f=>f.tick<=tick && f.coverage_end_tick>tick && f.observations.some(o=>o.type==='face')))throw Error('ERR_FACE_SAFE_EVIDENCE_REQUIRED: Missing active-frame face coverage');
 }
 return sidecar.frames.filter(f=>f.tick<end && f.coverage_end_tick>startTick);
}
module.exports={mapPlanSidecars,requireCoverage};
