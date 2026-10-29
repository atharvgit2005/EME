/**
 * Editing Mechanics Engine (EME) - Phase 34.5 Native Audio Mixer & Mastering Engine
 *
 * Implements:
 * 1. Multi-track audio mixing (Dialogue, Ducked Music, SFX Cues).
 * 2. True-peak limiting with -1.0 dBFS ceiling.
 * 3. EBUR128 / integrated loudness & true-peak measurement.
 * 4. Video/audio container muxing.
 * 5. Quantitative ducking & sonic quality verification.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const { EnvironmentResolver } = require('../engine/environment.js');
const { SpeechDuckingCompiler, CID03_DUCKING_PROFILE } = require('./speech-ducking-compiler.js');

const SAMPLE_RATE = 48000;

class AudioMixerEngine {
  /** Compile explicit lookahead peak control into canonical tick gain keyframes before approval. */
  static compilePeakControlEnvelope({sourcePath,startTick,durationTicks,profile}) {
    const {MediaTime}=require('../engine/time.js');
    const {ceilingDb=-18,windowTicks=1200,lookaheadTicks=2400,releaseTicks=12000}=profile;
    if(!Number.isFinite(ceilingDb) || ceilingDb> -6 || ceilingDb< -40 || ![windowTicks,lookaheadTicks,releaseTicks].every(v=>Number.isSafeInteger(v)&&v>=0) || windowTicks<120 || durationTicks<=0)throw new Error('ERR_INVALID_PEAK_CONTROL_PROFILE');
    const pcm=this.decodeToPcm(sourcePath,durationTicks/120000,startTick/120000),step=MediaTime.ticksToAudioSamples(windowTicks,48000),ceiling=Math.pow(10,ceilingDb/20),gains=[];
    for(let start=0;start<pcm.left.length;start+=step){let peak=0;for(let i=start;i<Math.min(start+step,pcm.left.length);i++)peak=Math.max(peak,Math.abs(pcm.left[i]),Math.abs(pcm.right[i]));gains.push(Math.min(1,ceiling/Math.max(peak,1e-12)));}
    const attack=Math.ceil(lookaheadTicks/windowTicks),release=Math.ceil(releaseTicks/windowTicks),envelope=[];
    for(let i=0;i<gains.length;i++){let gain=1;for(let j=Math.max(0,i-release);j<=Math.min(gains.length-1,i+attack);j++)gain=Math.min(gain,gains[j]);const offsetTick=i*windowTicks;if(offsetTick<durationTicks)envelope.push({offsetTick,volume:Math.floor(gain*10000)/10000});}
    if(!envelope.length)throw new Error('ERR_AUDIO_PEAK_CONTROL_EMPTY');
    envelope.push({offsetTick:durationTicks,volume:envelope.at(-1).volume});return envelope;
  }

  /** Canonical audio has explicit source, trim, timeline placement and tick envelopes. */
  static renderCanonicalTracks({ clips, assets, durationTicks, outputPath }) {
    const { MediaTime } = require('../engine/time.js');
    const total = MediaTime.ticksToAudioSamples(durationTicks, SAMPLE_RATE);
    const left = new Float32Array(total), right = new Float32Array(total);
    for (const clip of clips.filter(c => c.type === 'audio')) {
      if (clip.effects?.length || clip.transform || Object.keys(clip.properties || {}).length || Object.keys(clip.audio || {}).some(k=>!['volume','volumeEnvelope'].includes(k))) throw new Error('ERR_UNSUPPORTED_CANONICAL_AUDIO');
      const src = assets.get(clip.source?.assetId || clip.assetId);
      if (!src) throw new Error('ERR_AUDIO_ASSET_UNAVAILABLE');
      if (clip.source?.trimOutTick !== undefined && clip.source.trimOutTick-(clip.source.trimInTick || 0)!==clip.durationTicks) throw new Error('ERR_UNSUPPORTED_CANONICAL_AUDIO: Source speed change');
      const pcm = this.decodeToPcm(src, clip.durationTicks/120000, (clip.source?.trimInTick || 0)/120000);
      const length = MediaTime.ticksToAudioSamples(clip.durationTicks,SAMPLE_RATE), start = MediaTime.ticksToAudioSamples(clip.startTick,SAMPLE_RATE);
      if (pcm.left.length < length-1) throw new Error('ERR_AUDIO_SOURCE_TOO_SHORT');
      const envelope = clip.audio?.volumeEnvelope || [];
      let previous=-1;
      for (const point of envelope) { if (!Number.isSafeInteger(point.offsetTick) || point.offsetTick<=previous || !Number.isFinite(point.volume) || point.volume<0 || point.volume>2) throw new Error('ERR_INVALID_AUDIO_ENVELOPE'); previous=point.offsetTick; }
      const curve = SpeechDuckingCompiler.generateSampleGainCurve(envelope,length,SAMPLE_RATE);
      const gain = clip.audio?.volume ?? 1;
      if (!Number.isFinite(gain) || gain<0 || gain>2) throw new Error('ERR_INVALID_AUDIO_GAIN');
      for (let i=0;i<Math.min(length,pcm.left.length);i++) { if (start+i>=total) throw new Error('ERR_AUDIO_TIMELINE_OVERFLOW'); left[start+i]+=pcm.left[i]*curve[i]*gain;right[start+i]+=pcm.right[i]*curve[i]*gain; }
    }
    let peak=0;
    for(let i=0;i<total;i++) { if(!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error('ERR_INVALID_AUDIO_PCM');peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i])); }
    const attenuation=peak>.8?.8/peak:1;
    for(let i=0;i<total;i++){left[i]*=attenuation;right[i]*=attenuation;}
    const rawPath=outputPath+'.raw.wav';this.encodeWav(left,right,rawPath);
    const raw=this.auditAudioMix({masterAudioPath:rawPath}),delta=-14-raw.integratedLoudnessLufs;
    if (raw.truePeakDb+delta> -1.5) throw new Error('ERR_AUDIO_MASTER_HEADROOM: Explicit dynamics processing required to meet delivery profile');
    const ffmpeg=EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';
    const mastered=spawnSync(ffmpeg,['-nostdin','-v','error','-n','-i',rawPath,'-af',`volume=${Math.pow(10,delta/20)}`,'-ar','48000','-ac','2','-c:a','pcm_s24le',outputPath],{encoding:'utf8',timeout:120000});
    if(mastered.status!==0 || mastered.error) throw new Error(`ERR_AUDIO_MASTER_FAILED: ${mastered.error?.message || mastered.stderr}`);
    const audit=this.auditAudioMix({masterAudioPath:outputPath});
    if(!audit.loudnessPassed) throw new Error('ERR_AUDIO_MASTER_QA_FAILED');
    return {outputPath,audit,master_gain_db:delta,pre_encode_attenuation:attenuation};
  }

  /**
   * Decodes an audio file (MP3, WAV, AAC, etc.) into 48kHz Float32 stereo PCM buffers using FFmpeg.
   *
   * @param {string} inputPath
   * @param {number} [durationSec]
   * @param {number} [startSec=0.0]
   * @returns {{ left: Float32Array, right: Float32Array, sampleRate: number, durationSec: number }}
   */
  static decodeToPcm(inputPath, durationSec = null, startSec = 0.0) {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`ERR_AUDIO_DECODE_FAILED: Audio file does not exist: ${inputPath}`);
    }

    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';
    const args = ['-v', 'error', '-ss', startSec.toFixed(9)];
    if (durationSec !== null && durationSec > 0) {
      args.push('-t', durationSec.toFixed(9));
    }
    args.push(
      '-i', inputPath,
      '-f', 'f32le',
      '-ar', String(SAMPLE_RATE),
      '-ac', '2',
      '-'
    );

    const res = spawnSync(ffmpegBin, args, { maxBuffer: 100 * 1024 * 1024 });
    if (res.status !== 0 || res.error || !res.stdout || res.stdout.length === 0 || res.stdout.length % 8 !== 0) {
      throw new Error(`ERR_AUDIO_DECODE_FAILED: FFmpeg PCM decode failed for "${inputPath}": ${res.stderr?.toString() || 'Empty stdout'}`);
    }

    const f32 = new Float32Array(res.stdout.buffer, res.stdout.byteOffset, res.stdout.length / 4);
    const numFrames = Math.floor(f32.length / 2);
    const left = new Float32Array(numFrames);
    const right = new Float32Array(numFrames);

    for (let i = 0; i < numFrames; i++) {
      if (!Number.isFinite(f32[i * 2]) || !Number.isFinite(f32[i * 2 + 1])) throw new Error('ERR_AUDIO_DECODE_FAILED: Non-finite PCM sample');
      left[i] = f32[i * 2];
      right[i] = f32[i * 2 + 1];
    }

    return {
      left,
      right,
      sampleRate: SAMPLE_RATE,
      durationSec: numFrames / SAMPLE_RATE
    };
  }

  /**
   * Encodes stereo Float32Array PCM into a standard 16-bit 48kHz stereo WAV file.
   *
   * @param {Float32Array} left
   * @param {Float32Array} right
   * @param {string} outputPath
   * @param {number} [sampleRate=48000]
   */
  static encodeWav(left, right, outputPath, sampleRate = 48000) {
    const numFrames = Math.min(left.length, right.length);
    const dataSize = numFrames * 4; // 2 channels * 2 bytes (16-bit)
    const headerSize = 44;
    const buf = Buffer.alloc(headerSize + dataSize);

    // RIFF Chunk Descriptor
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);

    // fmt sub-chunk
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);          // Subchunk1Size (16 for PCM)
    buf.writeUInt16LE(1, 20);           // AudioFormat (1 for PCM)
    buf.writeUInt16LE(2, 22);           // NumChannels (2)
    buf.writeUInt32LE(sampleRate, 24);  // SampleRate
    buf.writeUInt32LE(sampleRate * 4, 28); // ByteRate (SampleRate * 2 * 2)
    buf.writeUInt16LE(4, 32);           // BlockAlign (2 channels * 2 bytes)
    buf.writeUInt16LE(16, 34);          // BitsPerSample (16)

    // data sub-chunk
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);

    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      // Clamped 16-bit conversion
      const sL = Math.max(-1.0, Math.min(1.0, left[i]));
      const sR = Math.max(-1.0, Math.min(1.0, right[i]));
      const intL = sL < 0 ? Math.round(sL * 32768) : Math.round(sL * 32767);
      const intR = sR < 0 ? Math.round(sR * 32768) : Math.round(sR * 32767);

      buf.writeInt16LE(intL, offset);
      buf.writeInt16LE(intR, offset + 2);
      offset += 4;
    }

    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(outputPath, buf);
  }

  /**
   * Renders a multi-track mixdown (Dialogue, Ducked Music, SFX) with true-peak limiting.
   *
   * @param {object} params
   * @param {string} [params.dialoguePath] Source dialogue / VO file
   * @param {number} [params.dialogueGain=1.0]
   * @param {string} [params.musicPath] Background music file
   * @param {number} [params.musicGain=0.6]
   * @param {Array<{offsetTick: number, volume: number}>} [params.musicVolumeEnvelope=null]
   * @param {Array<{path: string, startSec: number, gain?: number}>} [params.sfxCues=[]]
   * @param {number} [params.durationSec=3.0] Total duration to render
   * @param {string} params.outputPath Destination WAV path
   * @param {number} [params.startSec=0.0]
   * @returns {{
   *   outputPath: string,
   *   durationSec: number,
   *   sha256: string,
   *   metrics: {
   *     rawPeakDb: number,
   *     finalPeakDb: number,
   *     clippedSamples: number,
   *     passedQa: boolean
   *   }
   * }}
   */
  static renderMix({
    dialoguePath = null,
    dialogueGain = 0.85,
    musicPath = null,
    musicGain = 0.85,
    musicVolumeEnvelope = null,
    sfxCues = [],
    durationSec = 3.0,
    outputPath,
    startSec = 0.0,
    targetLufs = -14.0
  }) {
    const totalSamples = Math.round(durationSec * SAMPLE_RATE);
    const masterLeft = new Float32Array(totalSamples);
    const masterRight = new Float32Array(totalSamples);

    // 1. Layer 1: Dialogue Track
    if (dialoguePath && !fs.existsSync(dialoguePath)) throw new Error('ERR_AUDIO_ASSET_UNAVAILABLE: Dialogue');
    if (dialoguePath) {
      const diagPcm = this.decodeToPcm(dialoguePath, durationSec, startSec);
      const limit = Math.min(totalSamples, diagPcm.left.length);
      for (let i = 0; i < limit; i++) {
        masterLeft[i] += diagPcm.left[i] * dialogueGain;
        masterRight[i] += diagPcm.right[i] * dialogueGain;
      }
    }

    // 2. Layer 2: Background Music with Ducking
    if (musicPath && !fs.existsSync(musicPath)) throw new Error('ERR_AUDIO_ASSET_UNAVAILABLE: Music');
    if (musicPath) {
      const musicPcm = this.decodeToPcm(musicPath, durationSec, 0.0);
      let gainCurve = null;
      if (musicVolumeEnvelope && musicVolumeEnvelope.length > 0) {
        gainCurve = SpeechDuckingCompiler.generateSampleGainCurve(musicVolumeEnvelope, totalSamples, SAMPLE_RATE);
      }

      const limit = Math.min(totalSamples, musicPcm.left.length);
      for (let i = 0; i < limit; i++) {
        const duckGain = gainCurve ? gainCurve[i] : 1.0;
        const netGain = musicGain * duckGain;
        masterLeft[i] += musicPcm.left[i] * netGain;
        masterRight[i] += musicPcm.right[i] * netGain;
      }
    }

    // 3. Layer 3: SFX Cues
    for (const cue of sfxCues) {
      if (!cue.path || !fs.existsSync(cue.path)) throw new Error('ERR_AUDIO_ASSET_UNAVAILABLE: SFX');
      if (cue.path) {
        const cuePcm = this.decodeToPcm(cue.path);
        const cueStartSample = Math.round(cue.startSec * SAMPLE_RATE);
        const cueGain = cue.gain !== undefined ? cue.gain : 0.8;
        const end = Math.min(totalSamples, cueStartSample + cuePcm.left.length);

        for (let s = cueStartSample; s < end; s++) {
          const srcIdx = s - cueStartSample;
          masterLeft[s] += cuePcm.left[srcIdx] * cueGain;
          masterRight[s] += cuePcm.right[srcIdx] * cueGain;
        }
      }
    }

    // 4. Measure Raw Peak & QA Metrics
    let maxRaw = 0.0;
    for (let i = 0; i < totalSamples; i++) {
      const aL = Math.abs(masterLeft[i]);
      const aR = Math.abs(masterRight[i]);
      if (aL > maxRaw) maxRaw = aL;
      if (aR > maxRaw) maxRaw = aR;
    }
    const rawPeakDb = Number((20 * Math.log10(Math.max(1e-6, maxRaw))).toFixed(2));

    // 5. True-Peak Limiter (Ceiling: -1.0 dBFS = 0.891 linear)
    const ceilingLinear = 0.89125;
    const masterAtten = maxRaw > ceilingLinear ? (ceilingLinear / maxRaw) : 1.0;

    let maxFinal = 0.0;
    let clippedCount = 0;
    for (let i = 0; i < totalSamples; i++) {
      // Soft saturation limiting
      masterLeft[i] = Math.tanh(masterLeft[i] * masterAtten);
      masterRight[i] = Math.tanh(masterRight[i] * masterAtten);

      const aL = Math.abs(masterLeft[i]);
      const aR = Math.abs(masterRight[i]);
      if (aL > maxFinal) maxFinal = aL;
      if (aR > maxFinal) maxFinal = aR;
      if (aL >= 1.0 || aR >= 1.0) clippedCount++;
    }

    // 6. Initial Encode Master WAV
    this.encodeWav(masterLeft, masterRight, outputPath, SAMPLE_RATE);

    // 7. Calibrate Integrated Loudness to Target (-14.0 +/- 1.0 LUFS) with True-Peak Limiting
    if (targetLufs !== null) {
      try {
        const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';
        const targetTp = -2.7;
        const targetLra = durationSec < 10.0 ? 7.0 : 11.0;
        let curAudit = this.auditAudioMix({ masterAudioPath: outputPath });

        for (let iter = 0; iter < 3; iter++) {
          const curLufs = curAudit.integratedLoudnessLufs;
          // Target interval: tightly around [-14.4, -13.6] so muxed AAC lands squarely within [-14.5, -13.5]
          if (curLufs < -14.4 || curLufs > -13.6) {
            const delta = targetLufs - curLufs;
            let compI;
            if (iter === 0) {
              compI = targetLufs + (durationSec < 10.0 ? 0.8 : 0.0);
            } else {
              compI = Math.min(-11.0, Math.max(-16.0, targetLufs + 1.0 * delta));
            }
            const tempCalibrated = outputPath + '.cal.wav';
            const loudnormRes = spawnSync(ffmpegBin, [
              '-y',
              '-i', outputPath,
              '-af', `loudnorm=I=${compI.toFixed(1)}:TP=${targetTp.toFixed(1)}:LRA=${targetLra.toFixed(1)}`,
              '-ar', String(SAMPLE_RATE),
              tempCalibrated
            ], { encoding: 'utf8' });

            if (loudnormRes.status === 0 && fs.existsSync(tempCalibrated)) {
              fs.copyFileSync(tempCalibrated, outputPath);
              try { fs.unlinkSync(tempCalibrated); } catch (_) {}
              curAudit = this.auditAudioMix({ masterAudioPath: outputPath });
            } else {
              throw new Error(`Calibration subprocess failed: ${loudnormRes.stderr}`);
            }
          } else {
            break;
          }
        }
      } catch (error) { throw new Error(`ERR_AUDIO_CALIBRATION_FAILED: ${error.message}`); }
    }

    const actualAudit = this.auditAudioMix({masterAudioPath:outputPath});
    const finalPeakDb = Number((20 * Math.log10(Math.max(1e-6, maxFinal))).toFixed(2));
    const fileBuf = fs.readFileSync(outputPath);
    const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');

    return {
      outputPath,
      durationSec,
      sha256,
      metrics: {
        rawPeakDb,
        finalPeakDb: actualAudit.truePeakDb,
        clippedSamples: actualAudit.clippedSamples,
        passedQa: actualAudit.loudnessPassed
      }
    };
  }

  /**
   * Muxes an audio master WAV with a 9:16 vertical video file.
   *
   * @param {object} params
   * @param {string} params.videoPath
   * @param {string} params.audioPath
   * @param {string} params.outputPath
   * @param {number} [params.durationSec]
   * @returns {string} Output MP4 path
   */
  static muxVideoAudio({ videoPath, audioPath, outputPath, durationSec = null }) {
    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';
    const outResolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(outResolved), { recursive: true });

    const args = [
      '-y',
      '-i', path.resolve(videoPath),
      '-i', path.resolve(audioPath)
    ];

    if (durationSec !== null && durationSec > 0) {
      args.push('-t', durationSec.toFixed(9));
    }

    args.push(
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-shortest',
      outResolved
    );

    const res = spawnSync(ffmpegBin, args, { encoding: 'utf8' });
    if (res.status !== 0 || !fs.existsSync(outResolved)) {
      throw new Error(`ERR_MUX_FAILED: Video/Audio muxing failed (exit code ${res.status}): ${res.stderr}`);
    }

    return outResolved;
  }

  /**
   * Quantitatively audits the rendered master audio.
   * Verifies:
   * 1. Integrated loudness (target -14 LUFS +/- 1.5 LU) via FFmpeg ebur128.
   * 2. True peak <= -1.0 dBFS.
   * 3. 0 clipped samples.
   * 4. Speech ducking attenuation: compares speech region music RMS vs baseline.
   *
   * @param {object} params
   * @param {string} params.masterAudioPath Rendered mix with ducking
   * @param {string} [params.baselineAudioPath] Control mix without ducking
   * @param {Array<{startSec: number, endSec: number}>} [params.speechIntervals=[]]
   * @returns {{
   *   integratedLoudnessLufs: number,
   *   truePeakDb: number,
   *   loudnessPassed: boolean,
   *   duckingPassed: boolean,
   *   attenuationDbDelta: number,
   *   verified: boolean
   * }}
   */
  static auditAudioMix({ masterAudioPath, baselineAudioPath = null, speechIntervals = [] }) {
    if (!fs.existsSync(masterAudioPath)) {
      throw new Error(`Master audio path does not exist: ${masterAudioPath}`);
    }

    const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';

    // 1. Measure EBUR128 Loudness via FFmpeg
    const ebuRes = spawnSync(ffmpegBin, [
      '-nostats',
      '-i', masterAudioPath,
      '-filter_complex', 'ebur128=peak=true',
      '-f', 'null',
      '-'
    ], { encoding: 'utf8' });

    if (ebuRes.status !== 0 || ebuRes.error) throw new Error(`ERR_AUDIO_MEASUREMENT_FAILED: ${ebuRes.error?.message || ebuRes.stderr}`);
    let integratedLoudness;
    let truePeakDb;

    const stderr = ebuRes.stderr || '';
    const summaryIdx = stderr.lastIndexOf('Summary:');
    const summaryText = summaryIdx !== -1 ? stderr.slice(summaryIdx) : stderr;

    const lufsMatch = summaryText.match(/I:\s+([-\d.]+)\s+LUFS/);
    if (lufsMatch) integratedLoudness = parseFloat(lufsMatch[1]);

    const peakMatch = summaryText.match(/Peak:\s+([-\d.]+)\s+dBFS/) || summaryText.match(/True peak:\s+([-\d.]+)\s+dBFS/);
    if (peakMatch) truePeakDb = parseFloat(peakMatch[1]);

    if (summaryIdx < 0 || !Number.isFinite(integratedLoudness) || !Number.isFinite(truePeakDb)) throw new Error('ERR_AUDIO_MEASUREMENT_FAILED: Missing/non-finite EBU summary');

    // 2. Measure Speech Attenuation Delta against Baseline if baseline provided
    let attenuationDbDelta = null;
    let duckingPassed = speechIntervals.length === 0 ? null : false;
    if (baselineAudioPath && !fs.existsSync(baselineAudioPath)) throw new Error('ERR_AUDIO_MEASUREMENT_FAILED: Missing ducking control');

    if (baselineAudioPath && fs.existsSync(baselineAudioPath) && speechIntervals.length > 0) {
      const masterPcm = this.decodeToPcm(masterAudioPath);
      const basePcm = this.decodeToPcm(baselineAudioPath);

      // Measure RMS during speech intervals
      let masterSpeechSumSq = 0.0;
      let baseSpeechSumSq = 0.0;
      let totalSpeechSamples = 0;

      for (const seg of speechIntervals) {
        const start = Math.round(seg.startSec * SAMPLE_RATE);
        const end = Math.min(masterPcm.left.length, Math.round(seg.endSec * SAMPLE_RATE));
        for (let s = start; s < end; s++) {
          masterSpeechSumSq += masterPcm.left[s] * masterPcm.left[s];
          baseSpeechSumSq += basePcm.left[s] * basePcm.left[s];
          totalSpeechSamples++;
        }
      }

      if (totalSpeechSamples > 0) {
        const masterRms = Math.sqrt(masterSpeechSumSq / totalSpeechSamples);
        const baseRms = Math.sqrt(baseSpeechSumSq / totalSpeechSamples);

        const masterDb = 20 * Math.log10(Math.max(1e-6, masterRms));
        const baseDb = 20 * Math.log10(Math.max(1e-6, baseRms));

        attenuationDbDelta = parseFloat((baseDb - masterDb).toFixed(2));
        // Ducking verified if speech-region energy is noticeably reduced
        duckingPassed = attenuationDbDelta >= 2.0; // noticeably lower in ducked mix
      }
    }

    let clippedSamples = 0;
    {
      const masterPcm = this.decodeToPcm(masterAudioPath);
      for (let i = 0; i < masterPcm.left.length; i++) {
        if (Math.abs(masterPcm.left[i]) >= 0.999 || (masterPcm.right && Math.abs(masterPcm.right[i]) >= 0.999)) {
          clippedSamples++;
        }
      }
    }

    const loudnessPassed = integratedLoudness >= -15.0 && integratedLoudness <= -13.0 && truePeakDb <= -1.0 && clippedSamples === 0;

    return {
      integratedLoudnessLufs: integratedLoudness,
      integratedLufs: integratedLoudness,
      truePeakDb,
      truePeakDbfs: truePeakDb,
      clippedSamples,
      clippedSamplesCount: clippedSamples,
      loudnessPassed,
      duckingPassed,
      attenuationDbDelta,
      verified: loudnessPassed && (speechIntervals.length === 0 || duckingPassed === true)
    };
  }
}

module.exports = {
  AudioMixerEngine,
  SAMPLE_RATE
};
