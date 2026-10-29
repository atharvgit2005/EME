/**
 * Editing Mechanics Engine (EME) - Phase 34.5 Speech-Aware Ducking Compiler
 *
 * Implements:
 * 1. Speech interval detection and interval merging.
 * 2. Deterministic integer arithmetic conversion between 120,000 ticks/s and 48,000 Hz samples.
 * 3. Time-varying gain envelope generation conforming to CID-03 ducking profile.
 * 4. Sample-accurate gain curve synthesis for native mixing.
 */

const fs = require('node:fs');
const path = require('node:path');
const { TICKS_PER_SECOND, MediaTime } = require('../engine/time.js');

const CID03_DUCKING_PROFILE = Object.freeze({
  attenuationDb: -24.0,       // -24 dB attenuation (~0.063 linear)
  attackMs: 300,             // 300ms attack ramp (36,000 ticks)
  releaseMs: 450,            // 450ms release recovery (54,000 ticks)
  thresholdDb: -26.0,        // Voice detection threshold in dBFS
  mergeToleranceMs: 400      // Merge speech gaps under 400ms (48,000 ticks)
});

class SpeechDuckingCompiler {
  static get DEFAULT_PROFILE() {
    return CID03_DUCKING_PROFILE;
  }

  /**
   * Rational conversion from exact EME integer ticks to audio sample index.
   * At 48,000 Hz, sample = round(ticks * 48000 / 120000) = round(ticks * 2 / 5).
   *
   * @param {number} ticks Non-negative integer tick
   * @param {number} [sampleRate=48000]
   * @returns {number}
   */
  static ticksToSamples(ticks, sampleRate = 48000) {
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new Error(`ERR_INVALID_TICK: Expected non-negative integer tick, got: ${ticks}`);
    }
    return MediaTime.ticksToAudioSamples(ticks, sampleRate);
  }

  /**
   * Rational conversion from audio sample index to exact EME integer ticks.
   *
   * @param {number} samples
   * @param {number} [sampleRate=48000]
   * @returns {number}
   */
  static samplesToTicks(samples, sampleRate = 48000) {
    if(!Number.isSafeInteger(samples)||samples<0||!Number.isSafeInteger(sampleRate)||sampleRate<=0)throw new Error('ERR_INVALID_SAMPLE_POSITION');
    const numerator=BigInt(samples)*BigInt(TICKS_PER_SECOND),denominator=BigInt(sampleRate);
    const ticks=Number((numerator+denominator/2n)/denominator);
    if(!Number.isSafeInteger(ticks))throw new Error('ERR_INVALID_SAMPLE_POSITION');return ticks;
  }

  /**
   * Converts dBFS value to linear gain factor.
   * @param {number} db
   * @returns {number}
   */
  static dbToLinear(db) {
    return Math.pow(10, db / 20.0);
  }

  /**
   * Merges speech intervals separated by less than mergeToleranceMs to prevent pumping.
   *
   * @param {Array<{startTick: number, endTick: number}>} rawIntervals
   * @param {number} [mergeToleranceTicks=48000] 400ms default
   * @returns {Array<{startTick: number, endTick: number}>}
   */
  static mergeSpeechIntervals(rawIntervals = [], mergeToleranceTicks = 48000) {
    if (!rawIntervals || rawIntervals.length === 0) return [];

    // Sort ascending by startTick
    const sorted = [...rawIntervals].sort((a, b) => a.startTick - b.startTick);
    const merged = [{ ...sorted[0] }];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const prev = merged[merged.length - 1];

      // Overlap or gap within tolerance
      if (current.startTick <= prev.endTick + mergeToleranceTicks) {
        prev.endTick = Math.max(prev.endTick, current.endTick);
      } else {
        merged.push({ ...current });
      }
    }

    return merged;
  }

  /**
   * Detects continuous speech intervals from 16-bit PCM WAV audio.
   *
   * @param {string} wavPath Path to 16-bit mono or stereo WAV file
   * @param {object} [options]
   * @param {number} [options.sampleRate=48000]
   * @param {number} [options.thresholdDb=-26.0]
   * @param {number} [options.windowMs=40]
   * @returns {Array<{startTick: number, endTick: number, startSec: number, endSec: number}>}
   */
  static detectSpeechIntervalsFromWav(wavPath, options = {}) {
    if (!fs.existsSync(wavPath)) {
      throw new Error(`ERR_FILE_NOT_FOUND: Audio file does not exist: ${wavPath}`);
    }

    const buf = fs.readFileSync(wavPath);
    if (buf.toString('ascii',0,4)!=='RIFF' || buf.toString('ascii',8,12)!=='WAVE') throw new Error('ERR_UNSUPPORTED_SPEECH_AUDIO: PCM WAV required');
    let format, dataOffset, dataLength;
    for(let offset=12;offset+8<=buf.length;) {
      const kind=buf.toString('ascii',offset,offset+4),length=buf.readUInt32LE(offset+4),begin=offset+8;
      if(begin+length>buf.length)throw new Error('ERR_INVALID_SPEECH_AUDIO: Truncated chunk');
      if(kind==='fmt ') {if(length<16)throw new Error('ERR_INVALID_SPEECH_AUDIO');format={encoding:buf.readUInt16LE(begin),channels:buf.readUInt16LE(begin+2),sampleRate:buf.readUInt32LE(begin+4),bits:buf.readUInt16LE(begin+14)};}
      if(kind==='data'){dataOffset=begin;dataLength=length;}
      offset=begin+length+(length%2);
    }
    if(!format || dataOffset===undefined || format.encoding!==1 || format.bits!==16 || ![1,2].includes(format.channels) || !format.sampleRate)throw new Error('ERR_UNSUPPORTED_SPEECH_AUDIO: 16-bit mono/stereo PCM required');
    if(options.sampleRate!==undefined && options.sampleRate!==format.sampleRate)throw new Error('ERR_SPEECH_SAMPLE_RATE_MISMATCH');
    const {sampleRate,channels}=format;
    const thresholdLinear=this.dbToLinear(options.thresholdDb ?? -26);
    const windowSamples=Math.max(1,Math.round((options.windowMs ?? 40)*sampleRate/1000));
    const totalSamples=Math.floor(dataLength/(2*channels));

    const rawIntervals = [];
    let inSpeech = false;
    let segStartSample = 0;

    for (let i = 0; i < totalSamples; i += windowSamples) {
      const end = Math.min(totalSamples, i + windowSamples);
      let sumSq = 0.0;
      for (let s = i; s < end; s++) {
        for(let channel=0;channel<channels;channel++){const norm=buf.readInt16LE(dataOffset+2*(s*channels+channel))/32768;sumSq+=norm*norm;}
      }
      const rms = Math.sqrt(sumSq / Math.max(1, (end - i)*channels));

      if (rms >= thresholdLinear) {
        if (!inSpeech) {
          inSpeech = true;
          segStartSample = i;
        }
      } else {
        if (inSpeech) {
          inSpeech = false;
          const segEndSample = i;
          const startTick = this.samplesToTicks(segStartSample, sampleRate);
          const endTick = this.samplesToTicks(segEndSample, sampleRate);
          rawIntervals.push({
            startTick,
            endTick,
            startSec: startTick / TICKS_PER_SECOND,
            endSec: endTick / TICKS_PER_SECOND
          });
        }
      }
    }

    if (inSpeech) {
      const startTick = this.samplesToTicks(segStartSample, sampleRate);
      const endTick = this.samplesToTicks(totalSamples, sampleRate);
      rawIntervals.push({
        startTick,
        endTick,
        startSec: startTick / TICKS_PER_SECOND,
        endSec: endTick / TICKS_PER_SECOND
      });
    }

    const mergeToleranceTicks = Math.round(((options.mergeToleranceMs ?? 400) / 1000) * TICKS_PER_SECOND);
    return this.mergeSpeechIntervals(rawIntervals, mergeToleranceTicks);
  }

  /**
   * Compiles time-varying music gain envelope keyframes from speech intervals.
   * Conforms strictly to schema/eme-project.v1.schema.json clip.audio.volumeEnvelope.
   *
   * @param {object} params
   * @param {Array<{startTick: number, endTick: number}>} params.speechIntervals
   * @param {number} params.totalDurationTicks Project timeline duration in EME ticks
   * @param {object} [params.profile=CID03_DUCKING_PROFILE]
   * @param {number} [params.baseVolume=1.0] Default music volume outside speech
   * @returns {Array<{offsetTick: number, volume: number}>}
   */
  static compileGainEnvelope({
    speechIntervals = [],
    totalDurationTicks,
    profile = CID03_DUCKING_PROFILE,
    baseVolume = 1.0
  }) {
    if (!Number.isSafeInteger(totalDurationTicks) || totalDurationTicks <= 0) {
      throw new Error(`ERR_INVALID_DURATION: totalDurationTicks must be positive integer, got: ${totalDurationTicks}`);
    }

    speechIntervals = require('./audio-contracts.js').normalizeSpeechIntervals(speechIntervals);
    const attackTicks = profile.attackTicks ?? MediaTime.secondsToTicks((profile.attackMs ?? 300) / 1000);
    const releaseTicks = profile.releaseTicks ?? MediaTime.secondsToTicks((profile.releaseMs ?? 450) / 1000);
    if (![attackTicks,releaseTicks].every(v=>Number.isSafeInteger(v)&&v>=0)) throw new Error('ERR_INVALID_DUCKING_PROFILE');
    speechIntervals = this.mergeSpeechIntervals(speechIntervals, profile.mergeToleranceTicks ?? MediaTime.secondsToTicks((profile.mergeToleranceMs ?? 400)/1000));
    const attenuationDb = profile.attenuationDb ?? CID03_DUCKING_PROFILE.attenuationDb;
    if (!Number.isFinite(attenuationDb) || attenuationDb>0 || attenuationDb < -96 || !Number.isFinite(baseVolume) || baseVolume<0 || baseVolume>2) throw new Error('ERR_INVALID_DUCKING_PROFILE');
    const attenuationLinear = parseFloat(this.dbToLinear(attenuationDb).toFixed(4));


    // If no speech intervals, return flat envelope
    if (!speechIntervals || speechIntervals.length === 0) {
      return [
        { offsetTick: 0, volume: baseVolume },
        { offsetTick: totalDurationTicks, volume: baseVolume }
      ];
    }

    const points = new Set([0,totalDurationTicks]);
    const segments = speechIntervals.map(s=>({start:Math.min(totalDurationTicks,s.startTick),end:Math.min(totalDurationTicks,s.endTick)})).filter(s=>s.end>s.start);
    const attenuated = attenuationLinear * baseVolume;
    for (const s of segments) for (const tick of [s.start-attackTicks,s.start,s.end,s.end+releaseTicks]) points.add(Math.max(0,Math.min(totalDurationTicks,tick)));
    // Release/attack intersections preserve overlapping ramps without dropping a later speech onset.
    for (let i=1;i<segments.length;i++) {
      const previous=segments[i-1],next=segments[i];
      if (attackTicks && releaseTicks && previous.end+releaseTicks>next.start-attackTicks) {
        const numerator=BigInt(previous.end)*BigInt(attackTicks)+BigInt(next.start)*BigInt(releaseTicks),denominator=BigInt(attackTicks+releaseTicks);
        points.add(Number((numerator+denominator/2n)/denominator));
      }
    }
    const valueAt = tick => {
      let gain=baseVolume;
      for (const s of segments) {
        let value=baseVolume;
        if(tick>=s.start && tick<=s.end)value=attenuated;
        else if(attackTicks && tick>s.start-attackTicks && tick<s.start)value=baseVolume+(attenuated-baseVolume)*(tick-s.start+attackTicks)/attackTicks;
        else if(releaseTicks && tick>s.end && tick<s.end+releaseTicks)value=attenuated+(baseVolume-attenuated)*(tick-s.end)/releaseTicks;
        gain=Math.min(gain,value);
      }
      return Number(gain.toFixed(4));
    };
    return [...points].filter(t=>t>=0 && t<=totalDurationTicks).sort((a,b)=>a-b).map(offsetTick=>({offsetTick,volume:valueAt(offsetTick)}));
  }

  /**
   * Generates a sample-accurate Float32Array gain curve at sampleRate for native mixing.
   *
   * @param {Array<{offsetTick: number, volume: number}>} keyframes
   * @param {number} totalSamples Duration in samples
   * @param {number} [sampleRate=48000]
   * @returns {Float32Array}
   */
  static generateSampleGainCurve(keyframes, totalSamples, sampleRate = 48000) {
    const curve = new Float32Array(totalSamples);
    if (!keyframes || keyframes.length === 0) {
      curve.fill(1.0);
      return curve;
    }

    // Map keyframes to sample domain
    const sampleKfs = keyframes.map(kf => ({
      sample: this.ticksToSamples(kf.offsetTick, sampleRate),
      volume: kf.volume
    }));

    let curKfIdx = 0;
    for (let s = 0; s < totalSamples; s++) {
      while (curKfIdx < sampleKfs.length - 1 && sampleKfs[curKfIdx + 1].sample <= s) {
        curKfIdx++;
      }

      const p0 = sampleKfs[curKfIdx];
      const p1 = sampleKfs[curKfIdx + 1];

      if (s < p0.sample || !p1 || p0.sample >= p1.sample) {
        curve[s] = p0.volume;
      } else {
        const t = (s - p0.sample) / (p1.sample - p0.sample);
        curve[s] = p0.volume + (p1.volume - p0.volume) * t;
      }
    }

    return curve;
  }
}

module.exports = {
  SpeechDuckingCompiler,
  CID03_DUCKING_PROFILE
};
