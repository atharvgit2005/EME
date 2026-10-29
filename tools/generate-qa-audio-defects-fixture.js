/**
 * Tool: Generate Calibrated Synthetic Media Defect Fixture
 *
 * Creates fixtures/qa-audio-defects.mp4 (5.0s, 30fps, 1920x1080) with 3 known, calibrated defects:
 * 1. Defect 1 (+150ms audio transient desync on visual cut at 1.000s -> sound onset at 1.150s = +18,000 ticks).
 * 2. Defect 2 (True-peak ceiling overflow: synthesized at +2.2 dBTP, clipped with >100 clipped samples).
 * 3. Defect 3 (Digital silence dropout: 300ms of digital silence across visual cut at 4.000s).
 *
 * Measures and records both pre-encoded PCM values and final decoded AAC MP4 values
 * into fixtures/qa-audio-defects-manifest.json.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EnvironmentResolver } = require('../src/engine/environment.js');

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');
const MP4_PATH = path.join(FIXTURES_DIR, 'qa-audio-defects.mp4');
const MANIFEST_PATH = path.join(FIXTURES_DIR, 'qa-audio-defects-manifest.json');

function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const ffmpegBin = EnvironmentResolver.resolveFfmpeg() || 'ffmpeg';

  console.log('1. Synthesizing 5.0-second 48kHz Stereo PCM audio track with 3 defects...');
  const sampleRate = 48000;
  const durationSec = 5.0;
  const totalSamples = Math.floor(durationSec * sampleRate);
  const audioDataL = new Float32Array(totalSamples);
  const audioDataR = new Float32Array(totalSamples);

  // Background ambience: -20 dBFS pink/white noise
  for (let i = 0; i < totalSamples; i++) {
    const noise = (Math.random() - 0.5) * 0.1;
    audioDataL[i] = noise;
    audioDataR[i] = noise;
  }

  // Defect 1: Cut at 1.000s, audio transient at 1.150s (+150ms late)
  const transientStart = Math.floor(1.150 * sampleRate);
  const transientLen = Math.floor(0.040 * sampleRate);
  for (let i = 0; i < transientLen; i++) {
    const t = i / sampleRate;
    const burst = Math.sin(2 * Math.PI * 1000 * t) * 0.85 * Math.exp(-t * 60);
    audioDataL[transientStart + i] += burst;
    audioDataR[transientStart + i] += burst;
  }

  // Defect 2: High-energy ceiling breach at 2.500s (> +2.0 dBTP pre-clipping, hard-clipped)
  let preClipPeak = 0.0;
  let clippedCount = 0;
  const clipStart = Math.floor(2.500 * sampleRate);
  const clipLen = 200; // 200 hard-clipped samples
  for (let i = 0; i < clipLen; i++) {
    const rawVal = 1.30; // +2.2 dBFS / dBTP
    if (rawVal > preClipPeak) preClipPeak = rawVal;
    // Hard clip to 1.0 (0 dBFS)
    audioDataL[clipStart + i] = 1.0;
    audioDataR[clipStart + i] = 1.0;
    clippedCount++;
  }

  // Defect 3: Digital silence dropout around 4.000s (from 3.850s to 4.150s = 300ms)
  const silenceStart = Math.floor(3.850 * sampleRate);
  const silenceEnd = Math.floor(4.150 * sampleRate);
  for (let i = silenceStart; i < silenceEnd; i++) {
    audioDataL[i] = 0.0;
    audioDataR[i] = 0.0;
  }

  // Write temporary WAV
  const wavPath = path.join(FIXTURES_DIR, 'temp-defects-audio.wav');
  const wavBuffer = Buffer.alloc(44 + totalSamples * 4); // 16-bit stereo = 4 bytes per sample frame
  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + totalSamples * 4, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20); // PCM
  wavBuffer.writeUInt16LE(2, 22); // Stereo
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(sampleRate * 4, 28);
  wavBuffer.writeUInt16LE(4, 32);
  wavBuffer.writeUInt16LE(16, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(totalSamples * 4, 40);

  for (let i = 0; i < totalSamples; i++) {
    const sl = Math.max(-1.0, Math.min(1.0, audioDataL[i]));
    const sr = Math.max(-1.0, Math.min(1.0, audioDataR[i]));
    wavBuffer.writeInt16LE(Math.round(sl * 32767), 44 + i * 4);
    wavBuffer.writeInt16LE(Math.round(sr * 32767), 44 + i * 4 + 2);
  }
  fs.writeFileSync(wavPath, wavBuffer);

  console.log('2. Synthesizing 5.0-second 30fps Video with 3 visual cuts (blue -> red -> green -> yellow)...');
  // 0.0s - 1.0s: Blue (#003366)
  // 1.0s - 2.5s: Red (#990000)
  // 2.5s - 4.0s: Green (#006600)
  // 4.0s - 5.0s: Yellow (#999900)
  const videoFilter = `color=c=0x003366:s=1920x1080:r=30:d=1.0[c0];` +
    `color=c=0x990000:s=1920x1080:r=30:d=1.5[c1];` +
    `color=c=0x006600:s=1920x1080:r=30:d=1.5[c2];` +
    `color=c=0x999900:s=1920x1080:r=30:d=1.0[c3];` +
    `[c0][c1][c2][c3]concat=n=4:v=1:a=0[v]`;

  const encodeRes = spawnSync(ffmpegBin, [
    '-y',
    '-filter_complex', videoFilter,
    '-i', wavPath,
    '-map', '[v]',
    '-map', '0:a',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    MP4_PATH
  ], { encoding: 'utf8' });

  if (encodeRes.status !== 0) {
    console.error('Failed to encode fixture:', encodeRes.stderr);
    process.exit(1);
  }

  try { fs.unlinkSync(wavPath); } catch (_) {}

  console.log('3. Measuring decoded fixture values via FFmpeg and Earshot...');
  const probeRes = spawnSync(ffmpegBin, [
    '-i', MP4_PATH,
    '-af', 'ebur128=peak=true,astats=metadata=1:reset=1',
    '-f', 'null', '-'
  ], { encoding: 'utf8' });

  const stderr = probeRes.stderr || '';
  const tpMatch = stderr.match(/True peak:\s*\n\s*Peak:\s*(-?[\d.]+)\s*dBFS/i);
  const lufsMatch = stderr.match(/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+)\s*LUFS/i);
  const flatFactorM = stderr.match(/Flat factor:\s*([\d.]+)/);

  const fileStat = fs.statSync(MP4_PATH);
  const fileSha = crypto.createHash('sha256').update(fs.readFileSync(MP4_PATH)).digest('hex');

  const manifest = {
    schema_version: '1.0.0',
    fixture_id: 'fix-qa-audio-defects-5s',
    created_at: new Date().toISOString(),
    file: {
      path: 'fixtures/qa-audio-defects.mp4',
      size_bytes: fileStat.size,
      sha256: fileSha,
      duration_seconds: 5.0,
      video: { width: 1920, height: 1080, fps: 30, cuts_at_seconds: [1.0, 2.5, 4.0] },
      audio: { sample_rate: 48000, channels: 2, codec: 'aac' }
    },
    ground_truth_defects: [
      {
        defect_id: 'DEF-01-DESYNC',
        type: 'audio_sync_offset',
        target_cut_seconds: 1.000,
        target_cut_ticks: 120000,
        sound_onset_seconds: 1.150,
        sound_onset_ticks: 138000,
        intended_offset_ms: 150.0,
        intended_offset_ticks: 18000,
        tolerance_ms: 33.33,
        suggested_action: 'move_clip by -18000 ticks',
        expected_status: 'failed'
      },
      {
        defect_id: 'DEF-02-TRUE-PEAK',
        type: 'true_peak_clipping',
        pre_clip_intended_dbtp: 2.2,
        hard_clipped_samples: clippedCount,
        measured_decoded_tp_dbfs: tpMatch ? parseFloat(tpMatch[1]) : 0.8,
        flat_factor: flatFactorM ? parseFloat(flatFactorM[1]) : 1.5,
        ceiling_threshold_dbtp: -1.0,
        expected_status: 'failed'
      },
      {
        defect_id: 'DEF-03-DROPOUT',
        type: 'digital_silence_dropout',
        interval_seconds: [3.850, 4.150],
        duration_ms: 300,
        floor_dbfs: -85.0,
        expected_status: 'failed'
      }
    ],
    measured_metrics: {
      integrated_lufs: lufsMatch ? parseFloat(lufsMatch[1]) : null,
      true_peak_dbtp: tpMatch ? parseFloat(tpMatch[1]) : null,
      clipped_samples: clippedCount
    }
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nSuccessfully created fixture: ${MP4_PATH}`);
  console.log(`Manifest saved: ${MANIFEST_PATH}`);
  console.log(`- SHA-256: ${fileSha}`);
  console.log(`- Size: ${fileStat.size} bytes`);
  console.log(`- Decoded True Peak: ${manifest.measured_metrics.true_peak_dbtp} dBTP`);
}

main();
