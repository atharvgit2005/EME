/**
 * Editing Mechanics Engine (EME) - Audio Ingest & PCM Decoder
 * Decodes WAV buffers into mono Float32Array PCM with deterministic metadata.
 */

const crypto = require('node:crypto');

const TICKS_PER_SECOND = 120000;

/**
 * Parses a standard RIFF/WAVE buffer into mono Float32Array.
 * @param {Buffer|Uint8Array} buffer WAV file buffer
 * @returns {{ pcm: Float32Array, sampleRate: number, channels: number, sha256: string, durationSeconds: number, durationTicks: number }}
 */
function decodeWav(buffer) {
  if (!buffer || buffer.length < 44) {
    throw new Error('Invalid WAV file: buffer is too small');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Verify RIFF header
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV file: missing RIFF/WAVE header');
  }

  // Parse chunks
  let offset = 12;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(offset + 8);
      numChannels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
    // Align to 2-byte boundary if odd
    if (chunkSize % 2 !== 0) offset += 1;
  }

  if (dataOffset === -1) {
    throw new Error('Invalid WAV file: missing data chunk');
  }

  // Verify format (1 = PCM, 3 = IEEE float)
  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new Error(`Unsupported WAV audio format: ${audioFormat}. Only linear PCM or IEEE Float supported.`);
  }

  const bytesPerSample = bitsPerSample / 8;
  const numFrames = Math.floor(dataLength / (bytesPerSample * numChannels));
  const monoPcm = new Float32Array(numFrames);

  if (audioFormat === 1 && bitsPerSample === 16) {
    for (let i = 0; i < numFrames; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const sampleOffset = dataOffset + (i * numChannels + ch) * 2;
        const s16 = buffer.readInt16LE(sampleOffset);
        sum += s16 / 32768.0;
      }
      monoPcm[i] = sum / numChannels;
    }
  } else if (audioFormat === 1 && bitsPerSample === 24) {
    for (let i = 0; i < numFrames; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const sampleOffset = dataOffset + (i * numChannels + ch) * 3;
        const b0 = buffer[sampleOffset];
        const b1 = buffer[sampleOffset + 1];
        const b2 = buffer[sampleOffset + 2];
        let val = (b2 << 24) | (b1 << 16) | (b0 << 8);
        val = val >> 8; // sign extension
        sum += val / 8388608.0;
      }
      monoPcm[i] = sum / numChannels;
    }
  } else if (audioFormat === 3 && bitsPerSample === 32) {
    for (let i = 0; i < numFrames; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        const sampleOffset = dataOffset + (i * numChannels + ch) * 4;
        sum += buffer.readFloatLE(sampleOffset);
      }
      monoPcm[i] = sum / numChannels;
    }
  } else {
    throw new Error(`Unsupported bit depth: ${bitsPerSample}-bit in WAV`);
  }

  const durationSeconds = numFrames / sampleRate;
  const durationTicks = Math.round((numFrames * TICKS_PER_SECOND) / sampleRate);

  return {
    pcm: monoPcm,
    sampleRate,
    channels: numChannels,
    sha256,
    durationSamples: numFrames,
    durationSeconds,
    durationTicks
  };
}

/**
 * Converts sample index to integer EME ticks without floating-point accumulation.
 */
function sampleToTicks(sampleIndex, sampleRate) {
  return Math.round((sampleIndex * TICKS_PER_SECOND) / sampleRate);
}

/**
 * Converts integer EME ticks to nearest sample index.
 */
function ticksToSample(ticks, sampleRate) {
  return Math.round((ticks * sampleRate) / TICKS_PER_SECOND);
}

module.exports = {
  decodeWav,
  sampleToTicks,
  ticksToSample,
  TICKS_PER_SECOND
};
