// Real sample peaks for timeline display. Source media remains authoritative.
const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const SAMPLE_RATE = 1000;
const BIN_SAMPLES = 50;
const MAX_SECONDS = 120;
const MAX_OUTPUT_BYTES = 512 * 1024;
const CACHE_FILES = 32;
const cache = new Map();

function failure(message, code, status) {
  return Object.assign(new Error(message), { code, status });
}

async function snapshot(mediaPath) {
  try {
    const realPath = await fs.promises.realpath(mediaPath);
    const stat = await fs.promises.stat(realPath, { bigint: true });
    if (!stat.isFile()) throw Error("Not an ordinary media file");
    return {
      realPath,
      stamp: [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(
        ":",
      ),
    };
  } catch {
    throw failure(
      "The waveform source is unavailable. Reimport the media.",
      "ERR_WAVEFORM_SOURCE_INTEGRITY",
      409,
    );
  }
}

async function hash(file) {
  const digest = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file, { highWaterMark: 65536 }))
    digest.update(chunk);
  return digest.digest("hex");
}

async function verifySource(mediaPath, expectedSha256, previous = null) {
  const before = await snapshot(mediaPath);
  let sha256;
  try {
    sha256 = await hash(before.realPath);
  } catch {
    throw failure(
      "The waveform source changed or became unreadable. Reimport the media.",
      "ERR_WAVEFORM_SOURCE_INTEGRITY",
      409,
    );
  }
  const after = await snapshot(mediaPath);
  if (
    sha256 !== expectedSha256 ||
    before.realPath !== after.realPath ||
    before.stamp !== after.stamp ||
    (previous &&
      (previous.realPath !== after.realPath || previous.stamp !== after.stamp))
  )
    throw failure(
      "The waveform source changed. Reimport the media.",
      "ERR_WAVEFORM_SOURCE_INTEGRITY",
      409,
    );
  return after;
}

function decode(mediaPath, seconds) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        "ffmpeg",
        [
          "-nostdin",
          "-v",
          "error",
          "-i",
          mediaPath,
          "-map",
          "0:a:0",
          "-vn",
          "-t",
          String(seconds),
          "-ac",
          "1",
          "-ar",
          String(SAMPLE_RATE),
          "-acodec",
          "pcm_f32le",
          "-f",
          "f32le",
          "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch {
      resolve({ reason: "FFmpeg could not be started.", cacheable: false });
      return;
    }
    const chunks = [];
    let length = 0,
      stderr = "",
      reason = null;
    const timer = setTimeout(() => {
      reason = "Audio waveform analysis timed out.";
      child.kill("SIGKILL");
    }, 30000);
    child.stdout.on("data", (chunk) => {
      length += chunk.length;
      if (length > MAX_OUTPUT_BYTES) {
        reason = "Decoded audio exceeded the waveform size limit.";
        child.kill("SIGKILL");
      } else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-8192);
    });
    child.once("error", (error) => {
      reason =
        error.code === "ENOENT"
          ? "FFmpeg is unavailable. Install it to show audio waveforms."
          : "FFmpeg could not read the audio source.";
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (reason) return resolve({ reason, cacheable: false });
      if (code !== 0) {
        const noAudio = /matches no streams|does not contain any stream/i.test(
          stderr,
        );
        return resolve({
          reason: noAudio
            ? "This media has no audio stream."
            : "The audio stream could not be decoded.",
          cacheable: noAudio,
        });
      }
      if (!length)
        return resolve({
          reason: "This interval has no decoded audio samples.",
          cacheable: true,
        });
      if (length % 4)
        return resolve({
          reason: "The decoded audio samples were incomplete.",
          cacheable: false,
        });
      resolve({ pcm: Buffer.concat(chunks, length), cacheable: true });
    });
  });
}

/**
 * Read at most 120 seconds of mono PCM. Peaks use absolute sample amplitude,
 * clamped to [0,1], without normalizing quiet clips to full height. The 1kHz
 * display signal is a coarse waveform, not a full-band loudness/true-peak meter.
 * durationSeconds is actual decoded coverage; binSeconds maps peaks to source time.
 */
async function getWaveform({ mediaPath, sourceSha256, duration } = {}) {
  if (
    typeof mediaPath !== "string" ||
    !mediaPath ||
    typeof sourceSha256 !== "string" ||
    !/^[a-f0-9]{64}$/i.test(sourceSha256) ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    throw failure(
      "Waveform analysis needs a media path, SHA-256 and positive duration.",
      "ERR_WAVEFORM_INPUT",
      400,
    );

  sourceSha256 = sourceSha256.toLowerCase();
  const initial = await verifySource(mediaPath, sourceSha256);
  const hit = cache.get(initial.realPath);
  if (
    hit?.sourceSha256 === sourceSha256 &&
    hit.stamp === initial.stamp &&
    hit.duration === duration
  ) {
    await verifySource(mediaPath, sourceSha256, initial);
    cache.delete(initial.realPath);
    cache.set(initial.realPath, hit);
    return structuredClone(hit.result);
  }

  const decoded = await decode(
    initial.realPath,
    Math.min(duration, MAX_SECONDS),
  );
  await verifySource(mediaPath, sourceSha256, initial);
  const result = {
    available: !!decoded.pcm,
    peaks: [],
    binSeconds: BIN_SAMPLES / SAMPLE_RATE,
    durationSeconds: 0,
    sourceSha256,
    truncated: duration > MAX_SECONDS,
  };
  if (decoded.pcm) {
    const samples = decoded.pcm.length / 4;
    for (let start = 0; start < samples; start += BIN_SAMPLES) {
      let peak = 0;
      for (let i = start; i < Math.min(samples, start + BIN_SAMPLES); i++) {
        const value = Math.abs(decoded.pcm.readFloatLE(i * 4));
        if (!Number.isFinite(value)) {
          return {
            ...result,
            available: false,
            peaks: [],
            reason: "The decoded audio contains invalid samples.",
          };
        }
        peak = Math.max(peak, value);
      }
      result.peaks.push(Math.min(1, peak));
    }
    result.durationSeconds = samples / SAMPLE_RATE;
  } else result.reason = decoded.reason;

  if (decoded.cacheable) {
    cache.delete(initial.realPath);
    cache.set(initial.realPath, {
      sourceSha256,
      stamp: initial.stamp,
      duration,
      result: structuredClone(result),
    });
    while (cache.size > CACHE_FILES) cache.delete(cache.keys().next().value);
  }
  return result;
}

module.exports = { getWaveform };
