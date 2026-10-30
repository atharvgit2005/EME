const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { getWaveform } = require("../src/studio/waveform.js");

function sha(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}
function root(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eme-waveform-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-nostdin", "-v", "error", "-n", ...args], {
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(r.status, 0, r.stderr || r.error?.message);
}
function varyingAudio(dir) {
  const file = path.join(dir, "varying.wav");
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "aevalsrc=if(lt(t\\,0.5)\\,0.1\\,0.8)*sin(2*PI*100*t):s=8000:d=1",
    "-c:a",
    "pcm_s16le",
    file,
  ]);
  return file;
}

test("Real audio produces time-aligned amplitude peaks and cache results cannot be mutated", async (t) => {
  const dir = root(t),
    file = varyingAudio(dir),
    sourceSha256 = sha(file);
  const input = { mediaPath: file, sourceSha256, duration: 1 };
  const r = await getWaveform(input);
  assert.equal(r.available, true);
  assert.equal(r.binSeconds, 0.05);
  assert.equal(r.durationSeconds, 1);
  assert.equal(r.peaks.length, 20);
  assert.equal(r.sourceSha256, sourceSha256);
  assert.equal(r.truncated, false);
  assert.ok(r.peaks.every((p) => p >= 0 && p <= 1));
  assert.ok(r.peaks[3] > 0.05 && r.peaks[3] < 0.2);
  assert.ok(r.peaks[15] > 0.6 && r.peaks[15] < 0.9);
  r.peaks[0] = 99;
  const cached = await getWaveform(input);
  assert.ok(cached.peaks[0] < 0.2);
  const half = await getWaveform({ ...input, duration: 0.5 });
  assert.equal(half.peaks.length, 10);
  assert.equal(half.durationSeconds, 0.5);
});

test("Analysis caps long audio at 120 seconds without inventing later bins", async (t) => {
  const dir = root(t),
    file = path.join(dir, "long.wav");
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=100:sample_rate=1000:duration=125",
    "-c:a",
    "pcm_s16le",
    file,
  ]);
  const r = await getWaveform({
    mediaPath: file,
    sourceSha256: sha(file),
    duration: 125,
  });
  assert.equal(r.available, true);
  assert.equal(r.truncated, true);
  assert.equal(r.durationSeconds, 120);
  assert.equal(r.peaks.length, 2400);
});

test("A real silent video and an undecodable source return no fabricated waveform", async (t) => {
  const dir = root(t),
    file = path.join(dir, "no-audio.mp4");
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=64x64:r=30:d=0.2",
    "-c:v",
    "libx264",
    "-an",
    file,
  ]);
  const r = await getWaveform({
    mediaPath: file,
    sourceSha256: sha(file),
    duration: 0.2,
  });
  assert.equal(r.available, false);
  assert.deepEqual(r.peaks, []);
  assert.match(r.reason, /no audio stream/);
  const broken = path.join(dir, "broken.wav");
  fs.writeFileSync(broken, "not a media file");
  const unavailable = await getWaveform({
    mediaPath: broken,
    sourceSha256: sha(broken),
    duration: 1,
  });
  assert.equal(unavailable.available, false);
  assert.deepEqual(unavailable.peaks, []);
  assert.match(unavailable.reason, /could not be decoded/);
});

test("Required source bindings are checked on new paths and cache hits", async (t) => {
  const dir = root(t),
    file = varyingAudio(dir),
    sourceSha256 = sha(file);
  await assert.rejects(
    getWaveform({ mediaPath: file, duration: 1 }),
    /SHA-256/,
  );
  await assert.rejects(
    getWaveform({ mediaPath: file, sourceSha256, duration: Infinity }),
    /positive duration/,
  );
  const input = { mediaPath: file, sourceSha256, duration: 1 };
  await getWaveform(input);
  fs.appendFileSync(file, "changed");
  await assert.rejects(
    getWaveform(input),
    (e) => e.code === "ERR_WAVEFORM_SOURCE_INTEGRITY" && e.status === 409,
  );
  const fresh = await getWaveform({ ...input, sourceSha256: sha(file) });
  assert.equal(fresh.available, true);
  assert.notEqual(fresh.sourceSha256, sourceSha256);
  const other = path.join(dir, "other.wav");
  fs.writeFileSync(other, "other source");
  await assert.rejects(
    getWaveform({ ...input, mediaPath: other }),
    /source changed/,
  );
});

test("Changing media after hashing but during an actual FFmpeg decode rejects the result", async (t) => {
  const dir = root(t),
    file = varyingAudio(dir),
    sourceSha256 = sha(file);
  const actual = spawnSync("which", ["ffmpeg"], {
    encoding: "utf8",
  }).stdout.trim();
  assert.ok(actual);
  const bin = path.join(dir, "bin"),
    marker = path.join(dir, "started"),
    gate = path.join(dir, "continue");
  fs.mkdirSync(bin);
  const wrapper = path.join(bin, "ffmpeg");
  fs.writeFileSync(
    wrapper,
    `#!${process.execPath}\nconst fs=require('node:fs'),{spawn}=require('node:child_process');fs.writeFileSync(${JSON.stringify(marker)},'started');const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)})){clearInterval(timer);const c=spawn(${JSON.stringify(actual)},process.argv.slice(2),{stdio:['ignore','inherit','inherit']});c.on('error',()=>process.exit(1));c.on('exit',code=>process.exit(code??1));}},10);\n`,
    { mode: 0o755 },
  );
  const oldPath = process.env.PATH;
  process.env.PATH = bin + path.delimiter + oldPath;
  t.after(() => {
    process.env.PATH = oldPath;
  });
  const pending = getWaveform({ mediaPath: file, sourceSha256, duration: 1 });
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(marker) && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 10));
  assert.ok(
    fs.existsSync(marker),
    "Controlled wrapper must reach decode after the initial hash",
  );
  fs.appendFileSync(file, "changed during decode");
  fs.writeFileSync(gate, "continue");
  await assert.rejects(
    pending,
    (e) => e.code === "ERR_WAVEFORM_SOURCE_INTEGRITY",
  );
});
