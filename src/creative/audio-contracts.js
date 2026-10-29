const {MediaTime}=require('../engine/time.js');
function normalizeSpeechIntervals(intervals=[]) {
  return intervals.map(interval=>{
    const start=interval.startTick ?? MediaTime.secondsToTicks(interval.startSec);
    const end=interval.endTick ?? MediaTime.secondsToTicks(interval.endSec);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<0 || end<=start) throw new Error('ERR_INVALID_SPEECH_INTERVAL: Exact increasing ticks required');
    if ((interval.startSec!==undefined && MediaTime.secondsToTicks(interval.startSec)!==start) || (interval.endSec!==undefined && MediaTime.secondsToTicks(interval.endSec)!==end)) throw new Error('ERR_AMBIGUOUS_SPEECH_INTERVAL');
    return {startTick:start,endTick:end};
  });
}
function normalizeSfxCue(cue) {
  if (cue.asset_id!==undefined && cue.assetId!==undefined && cue.asset_id!==cue.assetId) throw new Error('ERR_AMBIGUOUS_SFX_CUE');
  if (cue.trigger_tick!==undefined && cue.startTick!==undefined && cue.trigger_tick!==cue.startTick) throw new Error('ERR_AMBIGUOUS_SFX_CUE');
  const assetId=cue.asset_id ?? cue.assetId, startTick=cue.trigger_tick ?? cue.startTick;
  if (!assetId || !Number.isSafeInteger(startTick) || startTick<0) throw new Error('ERR_INVALID_SFX_CUE: Explicit asset identity and trigger ticks required');
  return {assetId,startTick,...(cue.durationTicks!==undefined?{durationTicks:cue.durationTicks}:{}),gain:cue.gain ?? .8};
}
module.exports={normalizeSpeechIntervals,normalizeSfxCue};
