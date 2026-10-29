/**
 * Pure Node.js Procedural Synthesizer Engine (0 external npm dependencies).
 * Reverse-engineered & ported from https://github.com/mrsarac/ff-unmute
 *
 * Implements:
 * - PolyBLEP bandlimited saw oscillator
 * - Resonant Biquad filters (Butterworth lowpass, bandpass, highpass)
 * - ADSR and exponential decay envelope generators
 * - Kick: Swept exponential sine (156 -> 46 Hz) + noise click + tanh saturation
 * - Clap: Multi-flam (4-tap) bandpass noise burst
 * - Hi-Hat: 5-oscillator metallic square bank + white noise + highpass
 * - Bass: 25% pulse wave from offset PolyBLEP saws + sine sub + swept cutoff
 * - Pad: 5-voice detuned stereo unison saws + dynamic lowpass sweep
 * - Arp Pluck: Square/saw hybrid with decaying resonant cutoff
 * - Ping-Pong: Stereo cross-channel feedback delay line
 * - Dynamic Duration: Configurable duration T (seconds) with parametric bars
 * - Outputs: 48 kHz 16-bit stereo PCM WAV + events.json
 */

const fs = require('fs');
const path = require('path');

const SR = 48000;
const BPM = 120;
const BEAT = 60.0 / BPM;       // 0.5 s
const STEP = BEAT / 4;         // 0.125 s (16th note)
const BAR = BEAT * 4;          // 2.0 s

// Seeded PRNG (Mulberry32) for bit-for-bit reproducible noise
function createRng(seed = 1209) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gaussian random generator (Box-Muller)
function createGaussianRng(seed = 1209) {
  const uniform = createRng(seed);
  return function() {
    let u = 0, v = 0;
    while (u === 0) u = uniform();
    while (v === 0) v = uniform();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };
}

function midiToHz(m) {
  return 440.0 * Math.pow(2.0, (m - 69.0) / 12.0);
}

// ---------- DSP Oscillators and Filters ----------

function polyBlep(phase, dt) {
  if (phase < dt) {
    const x = phase / dt;
    return x + x - x * x - 1.0;
  } else if (phase > 1.0 - dt) {
    const x = (phase - 1.0) / dt;
    return x * x + x + x + 1.0;
  }
  return 0.0;
}

function saw(freq, n, phase0 = 0.0) {
  const out = new Float64Array(n);
  const dt = freq / SR;
  let phase = phase0 % 1.0;
  if (phase < 0) phase += 1.0;
  for (let i = 0; i < n; i++) {
    out[i] = 2.0 * phase - 1.0 - polyBlep(phase, dt);
    phase += dt;
    if (phase >= 1.0) phase -= 1.0;
  }
  return out;
}

function sine(freqArrayOrVal, n, phase0 = 0.0) {
  const out = new Float64Array(n);
  let phase = phase0 % 1.0;
  const isArr = typeof freqArrayOrVal !== 'number';
  for (let i = 0; i < n; i++) {
    const f = isArr ? freqArrayOrVal[i] : freqArrayOrVal;
    out[i] = Math.sin(2.0 * Math.PI * phase);
    phase += f / SR;
    if (phase >= 1.0) phase -= 1.0;
  }
  return out;
}

function envAdsr(n, a, d, s, r, hold = null) {
  const out = new Float64Array(n);
  const holdTime = hold === null ? (n / SR - r) : hold;
  const aSamples = Math.max(1, Math.round(a * SR));
  const dSamples = Math.max(1, Math.round(d * SR));
  const holdSamples = Math.max(0, Math.round(holdTime * SR));
  const rSamples = Math.max(1, Math.round(r * SR));

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i < aSamples) {
      out[i] = i / aSamples;
    } else if (i < aSamples + dSamples) {
      const frac = (i - aSamples) / dSamples;
      out[i] = 1.0 - (1.0 - s) * frac;
    } else if (i < holdSamples) {
      out[i] = s;
    } else {
      const relIdx = i - holdSamples;
      const frac = Math.max(0.0, Math.min(1.0, relIdx / rSamples));
      out[i] = s * (1.0 - frac);
    }
  }
  return out;
}

function expEnv(n, attack, decay) {
  const out = new Float64Array(n);
  const aInv = 1.0 / Math.max(attack, 1e-4);
  const dInv = 1.0 / Math.max(decay, 1e-4);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const att = Math.min(1.0, t * aInv);
    out[i] = att * Math.exp(-t * dInv);
  }
  return out;
}

// Biquad Filter (Direct Form II Transposed)
class BiquadFilter {
  constructor(type, cutoff, q = Math.SQRT1_2) {
    this.type = type;
    this.cutoff = cutoff;
    this.q = q;
    this.s1 = 0;
    this.s2 = 0;
    this.calcCoeffs();
  }

  calcCoeffs() {
    const c = Math.max(10.0, Math.min(SR * 0.48, this.cutoff));
    const omega = 2.0 * Math.PI * c / SR;
    const sinOmega = Math.sin(omega);
    const cosOmega = Math.cos(omega);
    const alpha = sinOmega / (2.0 * this.q);

    let b0, b1, b2, a0, a1, a2;
    if (this.type === 'lowpass') {
      b0 = (1.0 - cosOmega) / 2.0;
      b1 = 1.0 - cosOmega;
      b2 = (1.0 - cosOmega) / 2.0;
      a0 = 1.0 + alpha;
      a1 = -2.0 * cosOmega;
      a2 = 1.0 - alpha;
    } else if (this.type === 'highpass') {
      b0 = (1.0 + cosOmega) / 2.0;
      b1 = -(1.0 + cosOmega);
      b2 = (1.0 + cosOmega) / 2.0;
      a0 = 1.0 + alpha;
      a1 = -2.0 * cosOmega;
      a2 = 1.0 - alpha;
    } else if (this.type === 'bandpass') {
      b0 = sinOmega / 2.0;
      b1 = 0.0;
      b2 = -sinOmega / 2.0;
      a0 = 1.0 + alpha;
      a1 = -2.0 * cosOmega;
      a2 = 1.0 - alpha;
    }

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  setCutoff(c) {
    this.cutoff = c;
    this.calcCoeffs();
  }

  process(x) {
    const y = this.b0 * x + this.s1;
    this.s1 = this.b1 * x - this.a1 * y + this.s2;
    this.s2 = this.b2 * x - this.a2 * y;
    return y;
  }

  processArray(arr) {
    const out = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] = this.process(arr[i]);
    }
    return out;
  }
}

// 4-Pole (24dB/octave) Filter (Cascaded Biquads)
class Biquad4Pole {
  constructor(type, cutoff) {
    this.stage1 = new BiquadFilter(type, cutoff, 0.54119610);
    this.stage2 = new BiquadFilter(type, cutoff, 1.3065630);
  }

  processArray(arr) {
    return this.stage2.processArray(this.stage1.processArray(arr));
  }
}

function filterBandpass(arr, low, high) {
  const center = Math.sqrt(low * high);
  const bw = high - low;
  const q = center / Math.max(1.0, bw);
  const f = new BiquadFilter('bandpass', center, q);
  return f.processArray(arr);
}

function filterLowpass(arr, cutoff) {
  const f = new BiquadFilter('lowpass', cutoff);
  return f.processArray(arr);
}

function filterHighpass(arr, cutoff) {
  const f = new BiquadFilter('highpass', cutoff);
  return f.processArray(arr);
}

// Swept lowpass filter block by block
function sweepLowpass(arr, cutoffArray, blockSize = 128) {
  const out = new Float64Array(arr.length);
  const filter = new BiquadFilter('lowpass', cutoffArray[0]);
  for (let i = 0; i < arr.length; i += blockSize) {
    const midIdx = Math.min(arr.length - 1, i + Math.floor(blockSize / 2));
    filter.setCutoff(cutoffArray[midIdx]);
    const end = Math.min(arr.length, i + blockSize);
    for (let j = i; j < end; j++) {
      out[j] = filter.process(arr[j]);
    }
  }
  return out;
}

// ---------- Instruments ----------

function generateKick(accent = 1.0, grng) {
  const n = Math.round(SR * 0.45);
  const freqs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    freqs[i] = 46.0 + 110.0 * Math.exp(-t / 0.035);
  }
  const body = sine(freqs, n);
  const bodyEnv = expEnv(n, 0.001, 0.17);
  for (let i = 0; i < n; i++) body[i] *= bodyEnv[i];

  const clickNoise = new Float64Array(n);
  for (let i = 0; i < n; i++) clickNoise[i] = grng();
  const clickFiltered = filterBandpass(clickNoise, 1800, 5000);
  const clickEnv = expEnv(n, 0.0002, 0.004);

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const raw = (body[i] + 0.18 * clickFiltered[i] * clickEnv[i]) * 1.6 * accent;
    out[i] = Math.tanh(raw);
  }
  return out;
}

function generateClap(grng) {
  const n = Math.round(SR * 0.35);
  const noise = new Float64Array(n);
  for (let i = 0; i < n; i++) noise[i] = grng();
  const bpNoise = filterBandpass(noise, 900, 2600);

  const env = new Float64Array(n);
  const offsets = [0.0, 0.009, 0.019, 0.031];
  for (let k = 0; k < offsets.length; k++) {
    const offset = offsets[k];
    const startIdx = Math.round(offset * SR);
    const subN = n - startIdx;
    if (subN > 0) {
      const subEnv = expEnv(subN, 0.0005, k < 3 ? 0.012 : 0.11);
      const amp = k < 3 ? 0.7 : 1.0;
      for (let j = 0; j < subN; j++) {
        env[startIdx + j] += amp * subEnv[j];
      }
    }
  }

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = bpNoise[i] * env[i];
  return out;
}

function generateHat(isOpen = false, accent = 1.0, grng) {
  const duration = isOpen ? 0.22 : 0.05;
  const n = Math.round(SR * duration);
  const metalFreqs = [2950, 4100, 5300, 6900, 8200];
  const sig = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let metal = 0;
    for (let f of metalFreqs) {
      metal += Math.sin(2.0 * Math.PI * f * t) >= 0 ? 1.0 : -1.0;
    }
    sig[i] = metal * 0.15 + grng() * 0.6;
  }

  const highpassed = new Biquad4Pole('highpass', 7200).processArray(sig);
  const env = expEnv(n, 0.0005, isOpen ? 0.06 : 0.012);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = highpassed[i] * env[i] * accent;
  }
  return out;
}

function generateBassNote(midi, length, cutoffPeak) {
  const n = Math.round(SR * length);
  const f = midiToHz(midi);

  // 25% pulse from two PolyBLEP saws
  const saw1 = saw(f, n, 0.0);
  const saw2 = saw(f, n, 0.25);
  const pulse = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    pulse[i] = 0.75 * (saw1[i] - saw2[i]);
  }

  const sub = sine(f, n);
  const cutoffArr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    cutoffArr[i] = 140.0 + cutoffPeak * Math.exp(-t / 0.09);
  }

  const sweptPulse = sweepLowpass(pulse, cutoffArr, 128);
  const adsr = envAdsr(n, 0.003, 0.08, 0.7, 0.03);

  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    raw[i] = Math.tanh((sweptPulse[i] * 0.9 + sub[i] * 0.45) * adsr[i] * 1.4);
  }
  return filterHighpass(raw, 38);
}

function generatePadChord(midis, length, cutoffStart, cutoffEnd) {
  const n = Math.round(SR * length);
  const left = new Float64Array(n);
  const right = new Float64Array(n);
  const detunes = [-0.11, -0.05, 0.0, 0.06, 0.12];

  for (let m of midis) {
    const baseFreq = midiToHz(m);
    for (let k = 0; k < detunes.length; k++) {
      const det = detunes[k];
      const freq = baseFreq * Math.pow(2.0, det / 12.0);
      const voice = saw(freq, n, (k * 0.23) % 1.0);
      if (k % 2 === 1) {
        for (let i = 0; i < n; i++) left[i] += voice[i];
      } else {
        for (let i = 0; i < n; i++) right[i] += voice[i];
      }
      if (k === 2) {
        for (let i = 0; i < n; i++) {
          left[i] += voice[i] * 0.5;
          right[i] += voice[i] * 0.5;
        }
      }
    }
  }

  const cutoffArr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const frac = i / n;
    cutoffArr[i] = cutoffStart + (cutoffEnd - cutoffStart) * frac;
  }

  const sweptLeft = sweepLowpass(left, cutoffArr, 128);
  const sweptRight = sweepLowpass(right, cutoffArr, 128);
  const adsr = envAdsr(n, 0.35, 0.4, 0.85, 0.6);

  const norm = midis.length * 3.2;
  const outL = new Float64Array(n);
  const outR = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    outL[i] = (sweptLeft[i] * adsr[i]) / norm;
    outR[i] = (sweptRight[i] * adsr[i]) / norm;
  }
  return { left: outL, right: outR };
}

function generatePluck(midi) {
  const n = Math.round(SR * 0.35);
  const f = midiToHz(midi);
  const sawWave = saw(f, n);
  const sqWave = new Float64Array(n);
  const dt = f / SR;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    sqWave[i] = (phase < 0.5 ? 1.0 : -1.0) * 0.6 + sawWave[i] * 0.4;
    phase += dt;
    if (phase >= 1.0) phase -= 1.0;
  }

  const cutoffArr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    cutoffArr[i] = 600.0 + 3200.0 * Math.exp(-t / 0.05);
  }

  const swept = sweepLowpass(sqWave, cutoffArr, 128);
  const env = expEnv(n, 0.002, 0.12);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = swept[i] * env[i];
  return out;
}

// Ping-Pong Stereo Delay
function applyPingPong(stereoL, stereoR, delayS, feedback, wet, repeats = 4) {
  const n = stereoL.length;
  const dSamples = Math.round(SR * delayS);
  const outL = new Float64Array(stereoL);
  const outR = new Float64Array(stereoR);

  let tapL = new Float64Array(stereoL);
  let tapR = new Float64Array(stereoR);

  for (let k = 1; k <= repeats; k++) {
    // Filter and attenuate
    tapL = filterLowpass(tapL, 4500);
    tapR = filterLowpass(tapR, 4500);
    for (let i = 0; i < n; i++) {
      tapL[i] *= feedback;
      tapR[i] *= feedback;
    }

    // Ping-pong channel swap
    const nextL = tapR;
    const nextR = tapL;

    const offset = k * dSamples;
    if (offset < n) {
      const len = n - offset;
      for (let j = 0; j < len; j++) {
        outL[offset + j] += nextL[j] * wet;
        outR[offset + j] += nextR[j] * wet;
      }
    }
    tapL = nextL;
    tapR = nextR;
  }
  return { left: outL, right: outR };
}

// ---------- Score & Progression Generator ----------

const CHORD_VOICINGS = {
  Am: [57, 60, 64, 69],  // A3, C4, E4, A4
  F:  [53, 57, 60, 65],  // F3, A3, C4, F4
  Dm: [50, 57, 62, 65],  // D3, A3, D4, F4
  E:  [52, 56, 59, 64],  // E3, G#3, B3, E4
};

const CHORD_ROOTS = {
  Am: 33, // A1
  F:  29, // F1
  Dm: 26, // D1
  E:  28, // E1
};

const BASE_PROGRESSION = ['Am', 'Am', 'Am', 'F', 'Dm', 'E', 'F', 'Am'];

/**
 * Generates dynamic multi-track procedural composition for any duration T (seconds).
 * Scales bars, tracks, HUD event timestamps, and stereo audio buffer.
 */
function synthesizeComposition(durationSec = 16.0, seed = 1209) {
  const totalSamples = Math.round(durationSec * SR);
  const totalBars = Math.ceil(durationSec / BAR);
  const grng = createGaussianRng(seed);

  const masterL = new Float64Array(totalSamples);
  const masterR = new Float64Array(totalSamples);
  const events = [];

  function placeMono(sig, tSec, gainDb = 0.0, pan = 0.0) {
    const startIdx = Math.round(tSec * SR);
    if (startIdx >= totalSamples) return;
    const gain = Math.pow(10.0, gainDb / 20.0);
    // Constant-power pan: angle from 0 to pi/2
    const angle = (pan + 1.0) * Math.PI / 4.0;
    const gL = Math.cos(angle) * gain;
    const gR = Math.sin(angle) * gain;
    const len = Math.min(sig.length, totalSamples - startIdx);
    for (let i = 0; i < len; i++) {
      masterL[startIdx + i] += sig[i] * gL;
      masterR[startIdx + i] += sig[i] * gR;
    }
  }

  function placeStereo(sigL, sigR, tSec, gainDb = 0.0) {
    const startIdx = Math.round(tSec * SR);
    if (startIdx >= totalSamples) return;
    const gain = Math.pow(10.0, gainDb / 20.0);
    const len = Math.min(sigL.length, totalSamples - startIdx);
    for (let i = 0; i < len; i++) {
      masterL[startIdx + i] += sigL[i] * gain;
      masterR[startIdx + i] += sigR[i] * gain;
    }
  }

  function recordEvent(kind, tSec, meta = {}) {
    const frame = Math.round(tSec * 30);
    const sample = Math.round(tSec * SR);
    events.push({
      t: Number(tSec.toFixed(4)),
      frame,
      sample,
      kind,
      ...meta
    });
  }

  // Pre-generate standard drum hits
  const kickHit = generateKick(1.0, grng);
  const clapHit = generateClap(grng);
  const hatClosed = generateHat(false, 0.8, grng);
  const hatOpen = generateHat(true, 1.0, grng);

  // Arp delay buffer
  const arpsL = new Float64Array(totalSamples);
  const arpsR = new Float64Array(totalSamples);

  for (let b = 0; b < totalBars; b++) {
    const barNum = b + 1;
    const barStart = b * BAR;
    const chordName = BASE_PROGRESSION[b % BASE_PROGRESSION.length];
    const voicing = CHORD_VOICINGS[chordName];
    const root = CHORD_ROOTS[chordName];

    // Progression Pad
    if (barStart < durationSec) {
      const padLen = Math.min(BAR, durationSec - barStart);
      const cutoffStart = 300 + (b / totalBars) * 900;
      const cutoffEnd = 400 + ((b + 1) / totalBars) * 1100;
      const pad = generatePadChord(voicing, padLen, cutoffStart, cutoffEnd);
      placeStereo(pad.left, pad.right, barStart, -6.0);
      recordEvent('pad', barStart, { chord: chordName, bar: barNum });
    }

    // Drum & Bass Patterns
    // 16 steps per bar
    for (let s = 0; s < 16; s++) {
      const t = barStart + s * STEP;
      if (t >= durationSec) break;

      // Four-on-the-floor Kick (beats 0, 4, 8, 12)
      if (s % 4 === 0) {
        placeMono(kickHit, t, 0.0, 0.0);
        recordEvent('kick', t, { bar: barNum, beat: s / 4 });
      }

      // Clap on 2 and 4 (beats 4, 12)
      if (s === 4 || s === 12) {
        placeMono(clapHit, t, -1.0, 0.1);
        recordEvent('clap', t, { bar: barNum, beat: s / 4 });
      }

      // Hats: rolling 16th groove with off-beat accents
      if (s % 2 === 0) {
        const isOpen = (s === 2 || s === 6 || s === 10 || s === 14);
        const hit = isOpen ? hatOpen : hatClosed;
        placeMono(hit, t, isOpen ? -3.5 : -5.0, (s % 4 === 0) ? -0.2 : 0.2);
        recordEvent('hat', t, { open: isOpen, bar: barNum, step: s });
      }

      // Off-beat Rolling Bass (steps 2, 5, 7, 10, 13, 15)
      const bassSteps = [2, 5, 7, 10, 13, 15];
      if (bassSteps.includes(s)) {
        const isOctave = (s === 5 || s === 13);
        const midi = root + (isOctave ? 12 : 0);
        const bass = generateBassNote(midi, STEP * 1.5, isOctave ? 1200 : 800);
        placeMono(bass, t, 1.5, 0.0);
        recordEvent('bass', t, { midi, bar: barNum, step: s });
      }

      // Arpeggiator: chord tones cycling in 8th notes
      if (s % 2 === 0) {
        const noteIdx = (s / 2) % voicing.length;
        const midi = voicing[noteIdx] + 12; // Octave up
        const arp = generatePluck(midi);
        const startIdx = Math.round(t * SR);
        const pan = ((noteIdx / voicing.length) - 0.5) * 0.8;
        const angle = (pan + 1.0) * Math.PI / 4.0;
        const len = Math.min(arp.length, totalSamples - startIdx);
        for (let i = 0; i < len; i++) {
          arpsL[startIdx + i] += arp[i] * Math.cos(angle);
          arpsR[startIdx + i] += arp[i] * Math.sin(angle);
        }
        recordEvent('arp', t, { midi, bar: barNum, step: s });
      }
    }
  }

  // Apply Ping-Pong Delay to Arpeggiator Stem
  const delayedArps = applyPingPong(arpsL, arpsR, 0.1875, 0.45, 0.35, 4);
  for (let i = 0; i < totalSamples; i++) {
    masterL[i] += delayedArps.left[i] * 0.7;
    masterR[i] += delayedArps.right[i] * 0.7;
  }

  // Peak Limiter / Soft Saturation & Master Gain
  let maxPeak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const absL = Math.abs(masterL[i]);
    const absR = Math.abs(masterR[i]);
    if (absL > maxPeak) maxPeak = absL;
    if (absR > maxPeak) maxPeak = absR;
  }

  // Normalize to -1.5 dB peak (0.841)
  const targetPeak = 0.841;
  const masterGain = maxPeak > 0 ? (targetPeak / maxPeak) : 1.0;
  for (let i = 0; i < totalSamples; i++) {
    masterL[i] = Math.tanh(masterL[i] * masterGain);
    masterR[i] = Math.tanh(masterR[i] * masterGain);
  }

  return {
    sampleRate: SR,
    durationSec,
    totalSamples,
    totalBars,
    events,
    left: masterL,
    right: masterR
  };
}

// ---------- WAV Export (RIFF PCM 16-bit stereo) ----------

function encodeWav(left, right) {
  const numSamples = left.length;
  const numChannels = 2;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = SR * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sL = Math.max(-1.0, Math.min(1.0, left[i]));
    const sR = Math.max(-1.0, Math.min(1.0, right[i]));
    const valL = sL < 0 ? Math.round(sL * 32768) : Math.round(sL * 32767);
    const valR = sR < 0 ? Math.round(sR * 32768) : Math.round(sR * 32767);
    buffer.writeInt16LE(valL, offset);
    buffer.writeInt16LE(valR, offset + 2);
    offset += 4;
  }

  return buffer;
}

// CLI runner if invoked directly
if (require.main === module) {
  const durationArg = parseFloat(process.argv[2] || '16.0');
  const outDir = process.argv[3] || path.join(__dirname, 'dist');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`[Synth] Synthesizing composition for duration: ${durationArg.toFixed(2)}s...`);
  const result = synthesizeComposition(durationArg);

  const wavBuf = encodeWav(result.left, result.right);
  const wavPath = path.join(outDir, 'music.wav');
  fs.writeFileSync(wavPath, wavBuf);

  const eventsPath = path.join(outDir, 'events.json');
  fs.writeFileSync(eventsPath, JSON.stringify(result.events, null, 2));

  console.log(`[Synth] Exported WAV: ${wavPath} (${(wavBuf.length / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`[Synth] Exported Events: ${eventsPath} (${result.events.length} events scheduled)`);
}

module.exports = {
  SR,
  BPM,
  BEAT,
  STEP,
  BAR,
  polyBlep,
  saw,
  sine,
  envAdsr,
  expEnv,
  BiquadFilter,
  Biquad4Pole,
  generateKick,
  generateClap,
  generateHat,
  generateBassNote,
  generatePadChord,
  generatePluck,
  applyPingPong,
  synthesizeComposition,
  encodeWav
};
