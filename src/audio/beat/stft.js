/**
 * Editing Mechanics Engine (EME) - Deterministic Short-Time Fourier Transform (STFT)
 * Pure JavaScript Radix-2 FFT with Hann windowing and exact sample-centering convention.
 */

// Twiddle factor cache by FFT size
const twiddleCache = new Map();
const bitRevCache = new Map();
const windowCache = new Map();

function getHannWindow(N) {
  if (!windowCache.has(N)) {
    const win = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      win[n] = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * n) / (N - 1)));
    }
    windowCache.set(N, win);
  }
  return windowCache.get(N);
}

function getBitReversal(N) {
  if (!bitRevCache.has(N)) {
    const rev = new Uint32Array(N);
    const bits = Math.log2(N);
    for (let i = 0; i < N; i++) {
      let r = 0;
      for (let j = 0; j < bits; j++) {
        r = (r << 1) | ((i >> j) & 1);
      }
      rev[i] = r;
    }
    bitRevCache.set(N, rev);
  }
  return bitRevCache.get(N);
}

function getTwiddles(N) {
  if (!twiddleCache.has(N)) {
    const half = N / 2;
    const cos = new Float32Array(half);
    const sin = new Float32Array(half);
    for (let k = 0; k < half; k++) {
      const angle = (-2.0 * Math.PI * k) / N;
      cos[k] = Math.cos(angle);
      sin[k] = Math.sin(angle);
    }
    twiddleCache.set(N, { cos, sin });
  }
  return twiddleCache.get(N);
}

/**
 * In-place Radix-2 Cooley-Tukey Complex FFT.
 * @param {Float32Array} re Real component array of length N (power of two)
 * @param {Float32Array} im Imaginary component array of length N
 */
function fft(re, im) {
  const N = re.length;
  const bitRev = getBitReversal(N);

  // Bit reversal permutation
  for (let i = 0; i < N; i++) {
    const j = bitRev[i];
    if (i < j) {
      const tempR = re[i];
      re[i] = re[j];
      re[j] = tempR;

      const tempI = im[i];
      im[i] = im[j];
      im[j] = tempI;
    }
  }

  // Cooley-Tukey butterflies
  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const step = N / len;
    const { cos: twCos, sin: twSin } = getTwiddles(N);

    for (let i = 0; i < N; i += len) {
      for (let j = 0; j < halfLen; j++) {
        const k = j * step;
        const uR = re[i + j];
        const uI = im[i + j];

        const vR = re[i + j + halfLen];
        const vI = im[i + j + halfLen];

        const c = twCos[k];
        const s = twSin[k];

        const tR = vR * c - vI * s;
        const tI = vR * s + vI * c;

        re[i + j] = uR + tR;
        im[i + j] = uI + tI;

        re[i + j + halfLen] = uR - tR;
        im[i + j + halfLen] = uI - tI;
      }
    }
  }
}

/**
 * Computes deterministic STFT over mono PCM.
 * @param {Float32Array} pcm Input audio samples
 * @param {object} config { fftSize, hopLength, window, frameCenterConvention }
 * @returns {{ magnitudes: Float32Array[], logMagnitudes: Float32Array[], sampleIndices: number[], numFrames: number, numBins: number }}
 */
function computeStft(pcm, config) {
  const N = config.fftSize;
  const H = config.hopLength;
  const numBins = (N / 2) + 1;
  const window = getHannWindow(N);

  const numFrames = Math.max(1, Math.floor((pcm.length - N) / H) + 1);

  const magnitudes = new Array(numFrames);
  const logMagnitudes = new Array(numFrames);
  const sampleIndices = new Array(numFrames);

  const re = new Float32Array(N);
  const im = new Float32Array(N);

  for (let m = 0; m < numFrames; m++) {
    const startSample = m * H;
    const centerSample = startSample + (N / 2);

    // Apply Hann window
    for (let n = 0; n < N; n++) {
      const idx = startSample + n;
      re[n] = (idx < pcm.length) ? pcm[idx] * window[n] : 0.0;
      im[n] = 0.0;
    }

    // Run FFT
    fft(re, im);

    // Compute magnitude and log1p magnitude up to Nyquist bin (k = 0 ... N/2)
    const mag = new Float32Array(numBins);
    const logMag = new Float32Array(numBins);

    for (let k = 0; k < numBins; k++) {
      const r = re[k];
      const i = im[k];
      const mVal = Math.sqrt(r * r + i * i);
      mag[k] = mVal;
      logMag[k] = Math.log1p(mVal);
    }

    magnitudes[m] = mag;
    logMagnitudes[m] = logMag;
    sampleIndices[m] = centerSample;
  }

  return {
    magnitudes,
    logMagnitudes,
    sampleIndices,
    numFrames,
    numBins,
    fftSize: N,
    hopLength: H
  };
}

module.exports = {
  computeStft,
  fft,
  getHannWindow
};
