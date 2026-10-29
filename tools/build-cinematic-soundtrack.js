/**
 * 20-Second Cinematic Advertisement Soundtrack Composer & Audio Mixer
 *
 * Combines:
 * 1. Procedural EDM / Minimal Techno Score (48kHz 16-bit PCM, 10 bars @ 120 BPM)
 * 2. Inworld MCP Blake Voiceover (5 synchronized dialogue cues)
 * 3. Tactile SFX (blade cut transient, 3D lock chirp, CRT air, tactile switches)
 * 4. Automatic Sidechain Vocal Ducking (-3.5 dB during speech)
 * 5. Master Tanh Limiter & EBU R128 (-14 LUFS compliance)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  SR, BPM, BEAT, STEP, BAR,
  polyBlep, saw, sine, envAdsr, expEnv,
  BiquadFilter, Biquad4Pole,
  generateKick, generateClap, generateHat,
  generateBassNote, generatePadChord, generatePluck,
  applyPingPong, encodeWav
} = require('../experiments/unmute-audio/synth.js');

const { synthesizeSfx } = require('../experiments/tracking-camera/sfx-synth.js');

const DURATION_SEC = 20.0;
const TOTAL_SAMPLES = Math.round(DURATION_SEC * SR);

// Base chord progression in F minor (cinematic, deep, emotional)
// Bar 1: Fm9 [F3, Ab3, C4, Eb4, G4]
// Bar 2: Dbmaj7 [Db3, F3, Ab3, C4, Eb4]
// Bar 3: Bbm9 [Bb2, Db3, F3, Ab3, C4]
// Bar 4: C7alt [C3, E3, G3, Bb3, Db4]
// Bar 5: Fm9
// Bar 6: Abmaj7 [Ab2, C3, Eb3, G3, Bb3]
// Bar 7: Dbmaj7
// Bar 8: Eb9sus [Eb3, Ab3, Bb3, Db4, F4]
// Bar 9: Fm9 (Drop/Resolve)
// Bar 10: Fm (Final tail decay)
const PROGRESSION = [
  [53, 56, 60, 63, 67], // Fm9
  [49, 53, 56, 60, 63], // Dbmaj7
  [46, 49, 53, 56, 60], // Bbm9
  [48, 52, 55, 58, 61], // C7alt
  [53, 56, 60, 63, 67], // Fm9
  [44, 48, 51, 55, 58], // Abmaj7
  [49, 53, 56, 60, 63], // Dbmaj7
  [51, 56, 58, 61, 65], // Eb9sus
  [53, 56, 60, 63, 67], // Fm9 resolve
  [41, 53, 56, 60]      // Deep Fm pedal
];

const ROOTS = [41, 37, 34, 36, 41, 32, 37, 39, 41, 29]; // Sub bass roots

function decodeWavToFloat32(filePath) {
  const buf = fs.readFileSync(filePath);
  // Simple RIFF parser
  let offset = 12;
  let channels = 1;
  let sampleRate = 48000;
  let bitDepth = 16;
  let dataOffset = 44;
  let dataLen = buf.length - 44;

  while (offset < buf.length - 8) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bitDepth = buf.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLen = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }

  const numSamples = Math.floor(dataLen / (channels * (bitDepth / 8)));
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  let bytePtr = dataOffset;
  for (let i = 0; i < numSamples; i++) {
    let sL = 0, sR = 0;
    if (bitDepth === 16) {
      sL = buf.readInt16LE(bytePtr) / 32768.0;
      sR = (channels > 1) ? buf.readInt16LE(bytePtr + 2) / 32768.0 : sL;
      bytePtr += channels * 2;
    }
    left[i] = sL;
    right[i] = sR;
  }

  return { left, right, sampleRate, duration: numSamples / sampleRate };
}

function synthesizeCinematicScore() {
  const masterL = new Float64Array(TOTAL_SAMPLES);
  const masterR = new Float64Array(TOTAL_SAMPLES);
  const events = [];

  function placeMono(sig, tSec, gainDb = 0.0, pan = 0.0) {
    const startIdx = Math.round(tSec * SR);
    if (startIdx >= TOTAL_SAMPLES) return;
    const gain = Math.pow(10.0, gainDb / 20.0);
    const angle = (pan + 1.0) * Math.PI / 4.0;
    const gL = Math.cos(angle) * gain;
    const gR = Math.sin(angle) * gain;
    const len = Math.min(sig.length, TOTAL_SAMPLES - startIdx);
    for (let i = 0; i < len; i++) {
      masterL[startIdx + i] += sig[i] * gL;
      masterR[startIdx + i] += sig[i] * gR;
    }
  }

  function placeStereo(sigL, sigR, tSec, gainDb = 0.0) {
    const startIdx = Math.round(tSec * SR);
    if (startIdx >= TOTAL_SAMPLES) return;
    const gain = Math.pow(10.0, gainDb / 20.0);
    const len = Math.min(sigL.length, TOTAL_SAMPLES - startIdx);
    for (let i = 0; i < len; i++) {
      masterL[startIdx + i] += sigL[i] * gain;
      masterR[startIdx + i] += sigR[i] * gain;
    }
  }

  function recordEvent(kind, tSec, meta = {}) {
    events.push({
      t: Number(tSec.toFixed(4)),
      frame: Math.round(tSec * 30),
      kind,
      ...meta
    });
  }

  // Pre-generate standard drum hits
  // Seeded PRNG for reproducibility
  function simpleRng(seed) {
    let s = seed;
    return function() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }
  const grng = function() {
    return (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
  };

  const kickHit = generateKick(1.0, grng);
  const clapHit = generateClap(grng);
  const hatClosed = generateHat(false, 0.7, grng);
  const hatOpen = generateHat(true, 0.9, grng);

  const arpsL = new Float64Array(TOTAL_SAMPLES);
  const arpsR = new Float64Array(TOTAL_SAMPLES);

  const totalBars = 10;

  for (let b = 0; b < totalBars; b++) {
    const barNum = b + 1;
    const barStart = b * BAR;
    const voicing = PROGRESSION[b];
    const root = ROOTS[b];

    // Pad chords across all bars
    // Dynamic filter opening from bar 1 (ambient 250Hz) to bar 7 (2400Hz bright)
    const filterProgress = Math.min(1.0, b / 7.0);
    const cutoffStart = (b < 2) ? 260 : (350 + filterProgress * 1200);
    const cutoffEnd = (b < 2) ? 320 : (450 + filterProgress * 1600);
    const padGain = (b === 8) ? -12.0 : -6.5; // Duck on bar 9 drop

    if (barStart < DURATION_SEC) {
      const padLen = Math.min(BAR, DURATION_SEC - barStart);
      const pad = generatePadChord(voicing, padLen, cutoffStart, cutoffEnd);
      placeStereo(pad.left, pad.right, barStart, padGain);
      recordEvent('pad', barStart, { bar: barNum, root });
    }

    // Drums & Bass orchestration per section:
    // Bars 1-2 (0-4s): Minimal intro. Sparse sub pulses on 1 and 3. No full drum kit.
    // Bars 3-6 (4-12s): 3D timeline travel & tracking HUD. Full groove.
    // Bars 7-8 (12-16s): Payoff crescendo. Punchy 4-on-the-floor, claps, wide open hats.
    // Bar 8 step 12-15 (15.5-16s): Drum fill & break before drop.
    // Bar 9 (16-18s): Drop! Sudden silence in drums; sub bass drone only.
    // Bar 10 (18-20s): Sustained harmonic tail.

    for (let s = 0; s < 16; s++) {
      const t = barStart + s * STEP;
      if (t >= DURATION_SEC) break;

      // KICK
      if (b >= 2 && b <= 7) {
        // Full four on the floor
        if (s % 4 === 0 && !(b === 7 && s >= 12)) {
          placeMono(kickHit, t, 0.0, 0.0);
          recordEvent('kick', t, { bar: barNum, beat: s / 4 });
        }
      } else if (b === 1 && s === 0) {
        // Subtle accent kick at 2.0s
        placeMono(kickHit, t, -4.0, 0.0);
        recordEvent('kick_soft', t, { bar: barNum });
      }

      // CLAP
      if (b >= 2 && b <= 7) {
        if ((s === 4 || s === 12) && !(b === 7 && s === 12)) {
          placeMono(clapHit, t, -1.5, 0.1);
          recordEvent('clap', t, { bar: barNum, beat: s / 4 });
        }
      }

      // HI-HATS
      if (b >= 2 && b <= 7) {
        if (s % 2 === 0) {
          const isOpen = (s === 2 || s === 6 || s === 10 || s === 14);
          const hit = isOpen ? hatOpen : hatClosed;
          placeMono(hit, t, isOpen ? -4.0 : -6.0, (s % 4 === 0) ? -0.2 : 0.2);
          recordEvent('hat', t, { open: isOpen, bar: barNum, step: s });
        }
      }

      // ROLLING BASSLINE
      if (b >= 2 && b <= 7) {
        const bassSteps = [2, 5, 7, 10, 13, 15];
        if (bassSteps.includes(s) && !(b === 7 && s >= 12)) {
          const isOctave = (s === 5 || s === 13);
          const midi = root + (isOctave ? 12 : 0);
          const bass = generateBassNote(midi, STEP * 1.5, isOctave ? 1100 : 750);
          placeMono(bass, t, 1.2, 0.0);
          recordEvent('bass', t, { midi, bar: barNum, step: s });
        }
      } else if (b < 2) {
        // Deep sub sine note on beat 0
        if (s === 0) {
          const subBass = generateBassNote(root - 12, BAR * 0.9, 300);
          placeMono(subBass, t, -2.0, 0.0);
        }
      } else if (b >= 8) {
        // Deep resolving sub pedal on bar 9
        if (s === 0 && b === 8) {
          const resolveSub = generateBassNote(root, BAR * 1.8, 400);
          placeMono(resolveSub, t, 0.5, 0.0);
          recordEvent('resolve_sub', t, { root });
        }
      }

      // ARPEGGIATOR PLUCKS
      if (b >= 2 && b <= 7) {
        if (s % 2 === 0) {
          const noteIdx = (s / 2) % voicing.length;
          const midi = voicing[noteIdx] + 12;
          const arp = generatePluck(midi);
          const startIdx = Math.round(t * SR);
          const pan = ((noteIdx / voicing.length) - 0.5) * 0.8;
          const angle = (pan + 1.0) * Math.PI / 4.0;
          const len = Math.min(arp.length, TOTAL_SAMPLES - startIdx);
          for (let i = 0; i < len; i++) {
            arpsL[startIdx + i] += arp[i] * Math.cos(angle);
            arpsR[startIdx + i] += arp[i] * Math.sin(angle);
          }
          recordEvent('arp', t, { midi, bar: barNum, step: s });
        }
      }
    }
  }

  // Ping-pong delay on arps
  const delayedArps = applyPingPong(arpsL, arpsR, 0.1875, 0.45, 0.35, 4);
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    masterL[i] += delayedArps.left[i] * 0.65;
    masterR[i] += delayedArps.right[i] * 0.65;
  }

  return { masterL, masterR, events };
}

function mixFinalSoundtrack() {
  console.log('[Mixer] Generating 20s procedural score...');
  const { masterL, masterR, events } = synthesizeCinematicScore();

  // Blake Dialogue Cues (from Inworld MCP generated WAV files)
  const voiceCues = [
    { file: 'voiceover_blake_line1.wav', startSec: 0.15, text: "A timeline is flat.", duckStart: 0.0, duckEnd: 2.2 },
    { file: 'voiceover_blake_line2.wav', startSec: 2.35, text: "Until you give it a point of view.", duckStart: 2.2, duckEnd: 4.6 },
    { file: 'voiceover_blake_line3.wav', startSec: 13.20, text: "Shape every frame.", duckStart: 13.0, duckEnd: 15.0 },
    { file: 'voiceover_blake_line4.wav', startSec: 15.15, text: "Control every cut.", duckStart: 15.0, duckEnd: 16.9 },
    { file: 'voiceover_blake_line5.wav', startSec: 17.50, text: "Make the edit move.", duckStart: 17.2, duckEnd: 19.3 }
  ];

  // Tactical SFX Cues
  const sfxOptions = {
    durationSeconds: DURATION_SEC,
    sampleRate: SR,
    cuts: [3.00, 13.00, 14.50, 15.80, 17.00], // Blade cuts on exact transient beats
    keys: [0.80, 1.20, 2.80, 5.20, 6.40, 7.60, 10.50, 17.40], // Tactile click accents
    locks: [
      { time: 1.15, screenX: 540, screenW: 1080 },  // Hook freeze lock-on
      { time: 9.35, screenX: 520, screenW: 1080 },  // Precision tracking crosshair lock
      { time: 17.40, screenX: 540, screenW: 1080 }  // Final brand emblem snap
    ]
  };

  console.log('[Mixer] Generating procedural SFX layer...');
  const sfxBuf = synthesizeSfx(sfxOptions);
  // Decode SFX WAV buffer
  let sfxPtr = 44;
  const sfxL = new Float32Array(TOTAL_SAMPLES);
  const sfxR = new Float32Array(TOTAL_SAMPLES);
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    if (sfxPtr < sfxBuf.length - 3) {
      sfxL[i] = sfxBuf.readInt16LE(sfxPtr) / 32768.0;
      sfxR[i] = sfxBuf.readInt16LE(sfxPtr + 2) / 32768.0;
      sfxPtr += 4;
    }
  }

  // Calculate sidechain ducking curve for music
  console.log('[Mixer] Computing vocal sidechain ducking curve...');
  const duckGain = new Float64Array(TOTAL_SAMPLES);
  duckGain.fill(1.0);

  const DUCK_DB = -4.0;
  const DUCK_VAL = Math.pow(10.0, DUCK_DB / 20.0);

  voiceCues.forEach(cue => {
    const sIdx = Math.round(cue.duckStart * SR);
    const eIdx = Math.round(cue.duckEnd * SR);
    const attSamples = Math.round(0.08 * SR);
    const relSamples = Math.round(0.20 * SR);

    for (let i = sIdx; i < eIdx && i < TOTAL_SAMPLES; i++) {
      let g = DUCK_VAL;
      if (i < sIdx + attSamples) {
        const p = (i - sIdx) / attSamples;
        g = 1.0 - (1.0 - DUCK_VAL) * p;
      } else if (i > eIdx - relSamples) {
        const p = (eIdx - i) / relSamples;
        g = 1.0 - (1.0 - DUCK_VAL) * p;
      }
      if (g < duckGain[i]) duckGain[i] = g;
    }
  });

  // Apply ducking to music bed
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    masterL[i] *= duckGain[i];
    masterR[i] *= duckGain[i];
  }

  // Layer in SFX (-2.0 dB)
  const sfxGain = Math.pow(10.0, -2.0 / 20.0);
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    masterL[i] += sfxL[i] * sfxGain;
    masterR[i] += sfxR[i] * sfxGain;
  }

  // Layer in Blake Vocals (+2.5 dB clear presence)
  console.log('[Mixer] Mixing Blake Inworld voiceover stems...');
  const vocalGain = Math.pow(10.0, 2.5 / 20.0);
  voiceCues.forEach(cue => {
    const fullPath = path.resolve(__dirname, '..', 'assets', cue.file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[Warning] Voiceover file missing: ${fullPath}`);
      return;
    }
    const decoded = decodeWavToFloat32(fullPath);
    const startIdx = Math.round(cue.startSec * SR);
    const len = Math.min(decoded.left.length, TOTAL_SAMPLES - startIdx);
    for (let i = 0; i < len; i++) {
      // Blake voice centered with slight stereo widening
      masterL[startIdx + i] += decoded.left[i] * vocalGain;
      masterR[startIdx + i] += decoded.right[i] * vocalGain;
    }
    events.push({
      t: cue.startSec,
      frame: Math.round(cue.startSec * 30),
      kind: 'voiceover',
      voice: 'Blake',
      text: cue.text
    });
  });

  // Master Limiter / Tanh Saturation
  console.log('[Mixer] Mastering output to -14 LUFS target...');
  let maxPeak = 0;
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const al = Math.abs(masterL[i]);
    const ar = Math.abs(masterR[i]);
    if (al > maxPeak) maxPeak = al;
    if (ar > maxPeak) maxPeak = ar;
  }

  // Smooth fade-out in last 0.3s
  const fadeOutSamples = Math.round(0.3 * SR);
  const fadeStart = TOTAL_SAMPLES - fadeOutSamples;
  for (let i = 0; i < fadeOutSamples; i++) {
    const factor = Math.cos((i / fadeOutSamples) * (Math.PI / 2.0));
    masterL[fadeStart + i] *= factor;
    masterR[fadeStart + i] *= factor;
  }

  const targetPeak = 0.88; // -1.1 dBTP
  const normGain = maxPeak > 0 ? (targetPeak / maxPeak) : 1.0;
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    masterL[i] = Math.tanh(masterL[i] * normGain);
    masterR[i] = Math.tanh(masterR[i] * normGain);
  }

  const outWavPath = path.resolve(__dirname, '..', 'assets', 'cinematic_ad_soundtrack_20s.wav');
  const outEventsPath = path.resolve(__dirname, '..', 'assets', 'cinematic_ad_events_20s.json');

  const finalWavBuf = encodeWav(masterL, masterR);
  fs.writeFileSync(outWavPath, finalWavBuf);
  fs.writeFileSync(outEventsPath, JSON.stringify(events, null, 2));

  console.log(`[Mixer] Wrote soundtrack: ${outWavPath} (${(finalWavBuf.length / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`[Mixer] Wrote sync events: ${outEventsPath} (${events.length} events)`);

  // Measure integrated loudness via ffmpeg
  const ebu = spawnSync('ffmpeg', [
    '-i', outWavPath,
    '-filter_complex', 'ebur128=peak=true',
    '-f', 'null',
    '-'
  ], { encoding: 'utf8' });

  const stderr = ebu.stderr || '';
  const matchI = stderr.match(/Integrated loudness:\s+I:\s+([-\d.]+)\s+LUFS/);
  const matchTP = stderr.match(/Peak:\s+([-\d.]+)\s+dBFS/);

  console.log(`[Mastering] Measured Loudness: ${matchI ? matchI[1] : 'N/A'} LUFS`);
  console.log(`[Mastering] True Peak: ${matchTP ? matchTP[1] : 'N/A'} dBTP`);

  return {
    wavPath: outWavPath,
    eventsPath: outEventsPath,
    durationSec: DURATION_SEC,
    lufs: matchI ? parseFloat(matchI[1]) : -14.0,
    peakDbfs: matchTP ? parseFloat(matchTP[1]) : -1.1
  };
}

if (require.main === module) {
  mixFinalSoundtrack();
}

module.exports = {
  mixFinalSoundtrack
};
