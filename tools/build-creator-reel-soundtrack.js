const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE = path.resolve(__dirname, '..');
const SJC_BASE = path.join(WORKSPACE, 'assets/sjc_sfx_pack/SJC SFX Pack Vol 1 (Giveaway)');
const VO_BASE = path.join(WORKSPACE, 'assets/creator_reel_vo');
const OUTPUT_WAV = path.join(WORKSPACE, 'assets/creator_reel_soundtrack_20s.wav');

// SFX paths
const SFX = {
  flash1: path.join(SJC_BASE, 'Camera/Flashbulb/SJC_FLASHBULB_Flashbulb_01.wav'),
  flash2: path.join(SJC_BASE, 'Camera/Flashbulb/SJC_FLASHBULB_Flashbulb_02.wav'),
  flash3: path.join(SJC_BASE, 'Camera/Flashbulb/SJC_FLASHBULB_Flashbulb_03.wav'),
  shutter1: path.join(SJC_BASE, 'Camera/Film Camera/SJC_FILMCAMERA_Leaf Shutter_01.wav'),
  shutter2: path.join(SJC_BASE, 'Camera/Film Camera/SJC_FILMCAMERA_Leaf Shutter_02.wav'),
  shutter3: path.join(SJC_BASE, 'Camera/Film Camera/SJC_FILMCAMERA_Leaf Shutter_03.wav'),
  crank1: path.join(SJC_BASE, 'Camera/Film Camera/SJC_FILMCAMERA_Film Advance_01.wav'),
  crank2: path.join(SJC_BASE, 'Camera/Film Camera/SJC_FILMCAMERA_Film Advance_02.wav'),
  switchClick: path.join(SJC_BASE, 'UI & Motion/Click/SJC_CLICK_Switch_02.wav'),
  softClick: path.join(SJC_BASE, 'UI & Motion/Click/SJC_CLICK_Soft Click_01.wav'),
  tonalClick1: path.join(SJC_BASE, 'UI & Motion/Click/SJC_CLICK_Tonal Click Single_01.wav'),
  tonalDouble: path.join(SJC_BASE, 'UI & Motion/Click/SJC_CLICK_Tonal Click Double_01.wav'),
  whooshFast1: path.join(SJC_BASE, 'UI & Motion/Whoosh/SJC_WHOOSH_Fast Swish_01.wav'),
  whooshFast2: path.join(SJC_BASE, 'UI & Motion/Whoosh/SJC_WHOOSH_Fast Swish_02.wav'),
  whooshLiquid: path.join(SJC_BASE, 'UI & Motion/Whoosh/SJC_WHOOSH_Liquid_01.wav'),
  whooshResonant: path.join(SJC_BASE, 'UI & Motion/Whoosh/SJC_WHOOSH_Resonant Light_01.wav'),
  whooshFlange: path.join(SJC_BASE, 'UI & Motion/Whoosh/SJC_WHOOSH_Flange Fast_01.wav'),
  impactSub: path.join(SJC_BASE, 'UI & Motion/Impact/SJC_IMPACT_Sub Impact_01.wav'),
  typewriter: path.join(SJC_BASE, 'UI & Motion/Text/SJC_TEXT_Keyboard Short_01.wav'),
};

// VO lines with start times
const VO_CUES = [
  { file: path.join(VO_BASE, 'vo_line1.wav'), timeMs: 300 },   // "Six hours."
  { file: path.join(VO_BASE, 'vo_line2.wav'), timeMs: 1600 },  // "For a fifteen-second reel."
  { file: path.join(VO_BASE, 'vo_line3.wav'), timeMs: 3600 },  // "That's not editing. That's hostage negotiation."
  { file: path.join(VO_BASE, 'vo_line4.wav'), timeMs: 7300 },  // "Here's the fix."
  { file: path.join(VO_BASE, 'vo_line5.wav'), timeMs: 8800 },  // "Drop. Cut. Caption. Sound design."
  { file: path.join(VO_BASE, 'vo_line6.wav'), timeMs: 12600 }, // "EME does it in the beat."
  { file: path.join(VO_BASE, 'vo_line7.wav'), timeMs: 14500 }, // "Same reel. Six minutes."
  { file: path.join(VO_BASE, 'vo_line8.wav'), timeMs: 16800 }, // "Stop editing. Start shipping."
];

// SFX cues with start times and gain
const SFX_CUES = [
  { file: SFX.flash1, timeMs: 0, gain: 0.9 },
  { file: SFX.shutter1, timeMs: 350, gain: 0.8 },
  { file: SFX.switchClick, timeMs: 800, gain: 0.7 },
  { file: SFX.whooshFast1, timeMs: 1500, gain: 0.6 },
  { file: SFX.softClick, timeMs: 1800, gain: 0.5 },
  { file: SFX.softClick, timeMs: 2200, gain: 0.5 },
  { file: SFX.shutter2, timeMs: 2700, gain: 0.8 },
  { file: SFX.crank1, timeMs: 3600, gain: 0.8 },
  { file: SFX.impactSub, timeMs: 4400, gain: 1.0 },
  { file: SFX.whooshLiquid, timeMs: 5400, gain: 0.7 },
  { file: SFX.flash3, timeMs: 7200, gain: 0.85 },
  { file: SFX.whooshResonant, timeMs: 7600, gain: 0.75 },
  { file: SFX.tonalClick1, timeMs: 8800, gain: 0.8 },
  { file: SFX.shutter3, timeMs: 9600, gain: 0.8 },
  { file: SFX.typewriter, timeMs: 10400, gain: 0.8 },
  { file: SFX.flash2, timeMs: 11400, gain: 0.85 },
  { file: SFX.whooshFlange, timeMs: 12500, gain: 0.7 },
  { file: SFX.switchClick, timeMs: 13600, gain: 0.75 },
  { file: SFX.crank2, timeMs: 14400, gain: 0.8 },
  { file: SFX.shutter1, timeMs: 15300, gain: 0.85 },
  { file: SFX.shutter2, timeMs: 15420, gain: 0.85 },
  { file: SFX.shutter3, timeMs: 15540, gain: 0.9 },
  { file: SFX.whooshFast2, timeMs: 16700, gain: 0.7 },
  { file: SFX.tonalDouble, timeMs: 17800, gain: 0.8 },
  { file: SFX.flash1, timeMs: 19400, gain: 0.9 },
];

function buildSoundtrack() {
  console.log('Synthesizing procedural 20s creator reel soundtrack & mixing SJC SFX...');

  // 1. Procedural rhythmic synth bed (120 BPM in D minor)
  const sampleRate = 48000;
  const totalSamples = sampleRate * 20; // exactly 20.0s
  const musicBuffer = new Float32Array(totalSamples);

  // 120 BPM: 0.5s per beat, 10 bars = 40 beats = 20s
  for (let s = 0; s < totalSamples; s++) {
    const t = s / sampleRate;
    const beat = t * 2.0; // 2 beats/sec

    // Kick on every beat (t_beat from 0 to 0.5)
    const tBeat = t % 0.5;
    const kickFreq = 110 * Math.exp(-tBeat * 24) + 40;
    const kickAmp = Math.exp(-tBeat * 14);
    const kick = Math.sin(2 * Math.PI * kickFreq * tBeat) * kickAmp * 0.45;

    // Sub bassline (D1 = 36.7 Hz, F1 = 43.6 Hz, G1 = 49.0 Hz, A1 = 55.0 Hz)
    const bar = Math.floor(beat / 4);
    const bassNote = bar % 4 === 0 ? 36.7 : (bar % 4 === 1 ? 43.6 : (bar % 4 === 2 ? 49.0 : 36.7));
    const bass = Math.sin(2 * Math.PI * bassNote * t) * 0.25;

    // Filtered high-hat pulse on 16th notes
    const t16 = t % 0.125;
    const hatNoise = (Math.random() * 2 - 1) * Math.exp(-t16 * 60) * 0.12;

    // Arpeggiated synth stab (D minor pentatonic: D3 146.8Hz, F3 174.6Hz, A3 220Hz, C4 261.6Hz)
    const arpNotes = [146.83, 174.61, 220.00, 261.63, 293.66];
    const arpIdx = Math.floor(t * 8) % arpNotes.length;
    const arpT = t % 0.125;
    const arpAmp = Math.exp(-arpT * 18) * 0.08;
    const arp = Math.sin(2 * Math.PI * arpNotes[arpIdx] * arpT) * arpAmp;

    // Fade in over first 0.5s, fade out last 0.8s
    let env = 1.0;
    if (t < 0.5) env = t / 0.5;
    if (t > 19.2) env = Math.max(0, (20.0 - t) / 0.8);

    musicBuffer[s] = (kick + bass + hatNoise + arp) * env;
  }

  // Sidechain ducking during voiceover times
  for (const vo of VO_CUES) {
    const startS = Math.floor((vo.timeMs / 1000) * sampleRate);
    const voDurationS = 2.5 * sampleRate; // approximate VO window
    const endS = Math.min(totalSamples, startS + voDurationS);
    for (let s = startS; s < endS; s++) {
      musicBuffer[s] *= 0.32; // -10 dB ducking during speech
    }
  }

  // Write music bed to temp WAV
  const tempMusicWav = path.join(WORKSPACE, 'assets/temp_music_bed.wav');
  writeWav(tempMusicWav, musicBuffer, sampleRate);

  // 2. Build FFmpeg filter_complex command to mix Music + 8 VO lines + 25 SFX cues
  const inputs = ['-i', tempMusicWav];
  let filterStr = '[0:a]volume=0.9[a_music];';
  let mixInputs = '[a_music]';
  let inputCount = 1;

  // Add VO inputs
  for (let i = 0; i < VO_CUES.length; i++) {
    inputs.push('-i', VO_CUES[i].file);
    const delayMs = VO_CUES[i].timeMs;
    filterStr += `[${inputCount}:a]adelay=${delayMs}|${delayMs},volume=1.2[a_vo${i}];`;
    mixInputs += `[a_vo${i}]`;
    inputCount++;
  }

  // Add SFX inputs
  for (let i = 0; i < SFX_CUES.length; i++) {
    inputs.push('-i', SFX_CUES[i].file);
    const delayMs = SFX_CUES[i].timeMs;
    const gain = SFX_CUES[i].gain;
    filterStr += `[${inputCount}:a]adelay=${delayMs}|${delayMs},volume=${gain}[a_sfx${i}];`;
    mixInputs += `[a_sfx${i}]`;
    inputCount++;
  }

  const totalTracks = 1 + VO_CUES.length + SFX_CUES.length;
  filterStr += `${mixInputs}amix=inputs=${totalTracks}:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-14.5:LRA=7:TP=-1.5[a_out]`;

  const ffmpegArgs = [
    '-y',
    ...inputs,
    '-filter_complex', filterStr,
    '-map', '[a_out]',
    '-ar', '48000',
    '-ac', '2',
    '-t', '20.000',
    OUTPUT_WAV
  ];

  console.log(`Executing FFmpeg mix with ${totalTracks} audio tracks...`);
  const res = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error('FFmpeg mix error:', res.stderr);
    throw new Error('Audio mix failed');
  }

  // Clean temp file
  if (fs.existsSync(tempMusicWav)) fs.unlinkSync(tempMusicWav);

  console.log(`Master soundtrack generated: ${OUTPUT_WAV}`);
}

function writeWav(filename, float32Array, sampleRate) {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = float32Array.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.floor(val), offset);
    offset += 2;
  }

  fs.writeFileSync(filename, buffer);
}

if (require.main === module) {
  buildSoundtrack();
}

module.exports = { buildSoundtrack };
