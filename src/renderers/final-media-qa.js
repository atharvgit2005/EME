/** Mandatory technical delivery checks. No absent metric can produce PASS. */
const { spawnSync } = require('node:child_process');
const { FrameInspector } = require('./inspector.js');
const { AudioMixerEngine } = require('../creative/audio-mixer-engine.js');
const { EnvironmentResolver } = require('../engine/environment.js');
const { computeFileSha256BoundedSync: hash } = require('../prompt-core/job-orchestrator.js');
const { fail } = require('../creative/execution-record.js');
function auditFinalMedia(project, file) {
  const before = hash(file), metadata = FrameInspector.inspectVideoMetadata(file);
  const decode = spawnSync(EnvironmentResolver.resolveFfmpeg() || 'ffmpeg', ['-nostdin','-v','error','-xerror','-i',file,'-map','0:v:0','-map','0:a:0','-f','null','-'], { encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024 });
  if (decode.error || decode.status !== 0 || decode.stderr?.trim()) fail('ERR_FINAL_DECODE_FAILED', decode.error?.message || decode.stderr);
  const fps = project.timebase.fps.numerator/project.timebase.fps.denominator, tolerance = 1/fps;
  const audio = AudioMixerEngine.auditAudioMix({ masterAudioPath:file });
  const checks = [
    {id:'video_profile',passed:metadata.video.codec==='h264' && metadata.video.width===project.canvas.width && metadata.video.height===project.canvas.height && Math.abs(metadata.video.fps-fps)<1e-6},
    {id:'duration',passed:Math.abs(metadata.duration-project.timebase.durationTicks/120000)<=tolerance},
    {id:'audio_stream',passed:Boolean(metadata.audio && metadata.audio.codec==='aac' && metadata.audio.sampleRate===48000 && metadata.audio.channels===2)},
    {id:'final_loudness_peak_clipping',passed:audio.loudnessPassed===true},
    {id:'full_decode',passed:true},
    {id:'stable_checksum',passed:before===hash(file)}
  ];
  // Inspect stream durations and start offsets against one actual output-frame tolerance.
  const probe = spawnSync(EnvironmentResolver.resolveFfprobe() || 'ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8',timeout:30000});
  if (probe.status !== 0 || probe.error) fail('ERR_SYNC_MEASUREMENT_FAILED', 'ffprobe failed');
  let streams;
  try { streams=JSON.parse(probe.stdout).streams; } catch (_) { fail('ERR_SYNC_MEASUREMENT_FAILED','Malformed ffprobe output'); }
  const v=streams?.find(s=>s.codec_type==='video'), a=streams?.find(s=>s.codec_type==='audio');
  const times=[Number(v?.duration),Number(a?.duration),Number(v?.start_time),Number(a?.start_time)];
  const sync = times.every(Number.isFinite) && Math.abs(times[0]-times[1])<=tolerance && Math.abs(times[2]-times[3])<=tolerance;
  checks.push({id:'av_frame_sync',passed:sync,stream_times:times,tolerance_sec:tolerance});
  const passed=checks.every(c=>c.passed===true);
  return { status:passed?'PASSED':'FAILED',decision:passed?'PASS':'FAIL',passed,checks,metadata,audio,
    artifact_path:file,artifact_sha256:before,measured_at:new Date().toISOString(),profile:{target_lufs:-14,lufs_tolerance:1,true_peak_ceiling_dbfs:-1,clipped_samples:0} };
}
module.exports={auditFinalMedia};
