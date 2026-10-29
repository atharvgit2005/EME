/**
 * Benchmark v1.2.0 Corpus Generation Runner
 */

const fs = require('fs');
const path = require('path');
const { SyntheticVisualGeneratorV120 } = require('../src/benchmarks/synthetic-visual-generator-v120');

const BASE_OUT = path.resolve('artifacts/phase-32/stage-32.4/benchmark-v1.2.0');
const FIXTURES_DIR = path.join(BASE_OUT, 'fixtures');
const ANNO_DIR = path.join(BASE_OUT, 'annotations');

fs.mkdirSync(FIXTURES_DIR, { recursive: true });
fs.mkdirSync(ANNO_DIR, { recursive: true });

console.log('Generating Benchmark v1.2.0 Corpus across 12 fixtures...');

const defs = SyntheticVisualGeneratorV120.getClipDefinitions();
const manifest = {
  version: '1.2.0',
  generatedAt: new Date().toISOString(),
  targetSemantics: 'synthetic-visual-chrominance-segmentation',
  partitions: {
    development: { clips: 8, frames: 0, faces: 0 },
    heldOut: { clips: 4, frames: 0, faces: 0 }
  },
  fixtures: []
};

for (const def of defs) {
  console.log(`\n--> Rendering ${def.id} (${def.width}x${def.height}, ${def.fps}fps, ${def.frameCount} frames)...`);
  const videoPath = path.join(FIXTURES_DIR, `${def.id}.mp4`);
  const sha256 = SyntheticVisualGeneratorV120.generateVideoFile(def, videoPath);
  console.log(`    SHA256: ${sha256}`);

  console.log(`    Verifying pixel presence in decoded frames...`);
  const targetPx = SyntheticVisualGeneratorV120.verifyDecodedPixels(videoPath, def);
  console.log(`    Decoded target pixels in frame 0: ${targetPx}`);

  const { gt, sidecar } = SyntheticVisualGeneratorV120.generateAnnotations(def, sha256);
  fs.writeFileSync(path.join(ANNO_DIR, `${def.id}-ground-truth.json`), JSON.stringify(gt, null, 2), 'utf8');
  fs.writeFileSync(path.join(ANNO_DIR, `${def.id}-sidecar.json`), JSON.stringify(sidecar, null, 2), 'utf8');

  const targetPartition = def.isHeldOut ? manifest.partitions.heldOut : manifest.partitions.development;
  targetPartition.frames += def.frameCount;
  targetPartition.faces += gt.totalFaceInstances;

  manifest.fixtures.push({
    id: def.id,
    isHeldOut: def.isHeldOut,
    width: def.width,
    height: def.height,
    fps: def.fps,
    frameCount: def.frameCount,
    totalFaceInstances: gt.totalFaceInstances,
    sourceMediaSha256: sha256,
    videoFile: `fixtures/${def.id}.mp4`,
    groundTruthFile: `annotations/${def.id}-ground-truth.json`,
    sidecarFile: `annotations/${def.id}-sidecar.json`
  });
}

fs.writeFileSync(path.join(BASE_OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log('\n======================================================');
console.log('Benchmark v1.2.0 Corpus Generated Successfully!');
console.log('Development Partition: frames =', manifest.partitions.development.frames, 'faces =', manifest.partitions.development.faces);
console.log('Held-Out Partition:    frames =', manifest.partitions.heldOut.frames, 'faces =', manifest.partitions.heldOut.faces);
console.log('Total Frames:          ', manifest.partitions.development.frames + manifest.partitions.heldOut.frames);
console.log('Total Face Instances:  ', manifest.partitions.development.faces + manifest.partitions.heldOut.faces);
console.log('Manifest written to:', path.join(BASE_OUT, 'manifest.json'));
console.log('======================================================');
