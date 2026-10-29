const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../src/engine/project.js');

const HIMACHAL_DIR = '/Users/atharvpaharia100/Desktop/Projects/motion-graphics/himachal-001';
const FINAL_MP4 = path.join(HIMACHAL_DIR, 'jibhi_travel_reel_final.mp4');
const BGM_PATH = path.join(HIMACHAL_DIR, 'assets', 'bgm', 'soundtrack.aac');
const THUMB_DIR = path.join(HIMACHAL_DIR, 'build', 'thumbnails');

const shotsMetadata = [
  { file: 'shot_00.mp4', name: 'Shot 00: Night Bus Departure', durSec: 0.867, desc: 'Night bus journey start' },
  { file: 'shot_01.mp4', name: 'Shot 01: Forest Trail Hiking', durSec: 0.966, desc: 'Forest trail walking' },
  { file: 'shot_02.mp4', name: 'Shot 02: Mountain Highway', durSec: 0.600, desc: 'Mountain valley highway' },
  { file: 'shot_03.mp4', name: 'Shot 03: Sunrise Mist Ridges', durSec: 0.967, desc: 'Sunrise mist over mountain ridges' },
  { file: 'shot_04.mp4', name: 'Shot 04: Summit Ridge Panorama', durSec: 1.467, desc: 'Summit ridge panorama' },
  { file: 'shot_05.mp4', name: 'Shot 05: Running Friends Pasture', durSec: 1.066, desc: 'Running friends with arms outstretched' },
  { file: 'shot_06.mp4', name: 'Shot 06: Meadow Campsite & Cows', durSec: 0.934, desc: 'Mountain meadow campsite & grazing cows' },
  { file: 'shot_07.mp4', name: 'Shot 07: Friends Watching Sunrise', durSec: 0.633, desc: 'Friends sitting on crest watching sunrise' },
  { file: 'shot_08.mp4', name: 'Shot 08: Friends Laughing on Crest', durSec: 0.633, desc: 'Friends smiling and laughing together' },
  { file: 'shot_09.mp4', name: 'Shot 09: Halftone Card on Black', durSec: 0.300, desc: 'Halftone pop-art print card on black' },
  { file: 'shot_10.mp4', name: 'Shot 10: Halftone Car Pass', durSec: 0.234, desc: 'Halftone card over speeding mountain car' },
  { file: 'shot_11.mp4', name: 'Shot 11: Relaxing Lawn Sneakers', durSec: 1.300, desc: 'Relaxing on lawn in sneakers until folding legs' },
  { file: 'shot_12.mp4', name: 'Shot 12: Striding Across Pasture', durSec: 0.966, desc: 'Friends running further down alpine pasture' },
  { file: 'shot_13.mp4', name: 'Shot 13: Sunrise Golden Flare', durSec: 0.967, desc: 'Sunrise golden flare across mountain camp' },
  { file: 'shot_14.mp4', name: 'Shot 14: Handshake Clasp', durSec: 0.800, desc: 'Friends full handshake clasp' },
  { file: 'shot_15.mp4', name: 'Shot 15: Fast Handshake Beat Cut', durSec: 0.333, desc: 'Snappy 10-frame handshake beat cut' },
  { file: 'shot_16.mp4', name: 'Shot 16: Alpine Hiking Trail', durSec: 1.467, desc: 'Alpine hiking trail through pine woods' },
  { file: 'shot_17.mp4', name: 'Shot 17: Cascading Waterfall Top', durSec: 0.667, desc: 'Top of cascading waterfall' },
  { file: 'shot_18.mp4', name: 'Shot 18: Waterfall Turquoise Pool', durSec: 1.000, desc: 'Rushing waterfall spray and plunge pool' },
  { file: 'shot_19.mp4', name: 'Shot 19: Summit Celebration', durSec: 0.800, desc: 'Friends celebrating on summit ridge' },
  { file: 'shot_20.mp4', name: 'Shot 20: Sunrise Fade Out', durSec: 1.388, desc: 'Sunrise horizon with smooth fade to black' }
];

const TICKS_PER_SEC = 120000;
const totalDurationTicks = 2694600; // 22.455s

const assets = [
  {
    id: 'asset_final_reel',
    type: 'video',
    src: FINAL_MP4,
    metadata: {
      title: 'Jibhi Travel Reel Final Master Render',
      resolution: '1920x1080',
      fps: 30,
      durationSec: 22.455
    }
  },
  {
    id: 'asset_seg0_intro',
    type: 'video',
    src: path.join(HIMACHAL_DIR, 'build', 'seg0_intro.mp4'),
    metadata: { title: 'Intro 4-Strip Wipe with Waterfall Halftone Card', durationSec: 1.300 }
  },
  {
    id: 'asset_seg1_title',
    type: 'video',
    src: path.join(HIMACHAL_DIR, 'build', 'seg1_title.mp4'),
    metadata: { title: 'Kinetic Typography Sequence & Shutter Roll Drop', durationSec: 2.800 }
  },
  {
    id: 'asset_bgm_soundtrack',
    type: 'audio',
    src: BGM_PATH,
    metadata: { title: 'Master BGM Soundtrack (Beat-Synced)', durationSec: 22.455 }
  }
];

shotsMetadata.forEach((s, idx) => {
  assets.push({
    id: `asset_shot_${idx.toString().padStart(2, '0')}`,
    type: 'video',
    src: path.join(HIMACHAL_DIR, 'build', 'shots', s.file),
    metadata: { title: s.name, description: s.desc, durationSec: s.durSec }
  });
});

const tracks = [
  {
    id: 'track_v1_main',
    name: 'V1 • Video Shots',
    kind: 'visual',
    zIndex: 10,
    muted: false,
    locked: false
  },
  {
    id: 'track_v2_titles',
    name: 'V2 • Typography & Pop-Art',
    kind: 'visual',
    zIndex: 20,
    muted: false,
    locked: false
  },
  {
    id: 'track_a1_bgm',
    name: 'A1 • Master Soundtrack',
    kind: 'audio',
    zIndex: 0,
    muted: false,
    locked: false
  }
];

const clips = [];

// 1. Seg 0
clips.push({
  id: 'clip_seg0_intro',
  trackId: 'track_v1_main',
  type: 'video',
  startTick: 0,
  durationTicks: 156000,
  source: {
    assetId: 'asset_seg0_intro',
    trimInTick: 0,
    trimOutTick: 156000
  },
  transform: { x: 960, y: 540, scaleX: 1, scaleY: 1, opacity: 1 },
  metadata: {
    label: 'Intro Wipe (4-Strip)',
    thumbnail: path.join(THUMB_DIR, 'seg0_intro.jpg')
  }
});

// 2. Seg 1
clips.push({
  id: 'clip_seg1_title',
  trackId: 'track_v1_main',
  type: 'video',
  startTick: 156000,
  durationTicks: 336000,
  source: {
    assetId: 'asset_seg1_title',
    trimInTick: 0,
    trimOutTick: 336000
  },
  transform: { x: 960, y: 540, scaleX: 1, scaleY: 1, opacity: 1 },
  metadata: {
    label: 'Title Card & Drop',
    thumbnail: path.join(THUMB_DIR, 'seg1_title.jpg')
  }
});

// 3. 21 Beat-Synced Shots
let currentTick = 492000;
shotsMetadata.forEach((s, idx) => {
  const durTicks = Math.round(s.durSec * TICKS_PER_SEC);
  const clipId = `clip_shot_${idx.toString().padStart(2, '0')}`;
  const assetId = `asset_shot_${idx.toString().padStart(2, '0')}`;
  const thumbPath = path.join(THUMB_DIR, `shot_${idx.toString().padStart(2, '0')}.jpg`);

  clips.push({
    id: clipId,
    trackId: 'track_v1_main',
    type: 'video',
    startTick: currentTick,
    durationTicks: durTicks,
    source: {
      assetId: assetId,
      trimInTick: 0,
      trimOutTick: durTicks
    },
    transform: { x: 960, y: 540, scaleX: 1, scaleY: 1, opacity: 1 },
    metadata: {
      label: s.name,
      description: s.desc,
      thumbnail: thumbPath
    }
  });

  currentTick += durTicks;
});

// Correct any integer rounding difference on the last shot
const lastClip = clips[clips.length - 1];
const discrepancy = totalDurationTicks - (lastClip.startTick + lastClip.durationTicks);
if (discrepancy !== 0) {
  lastClip.durationTicks += discrepancy;
  lastClip.source.trimOutTick += discrepancy;
}

// 4. Kinetic Typography Clips on Track V2
clips.push({
  id: 'clip_title_jibhi_anton',
  trackId: 'track_v2_titles',
  type: 'text',
  startTick: 156000,
  durationTicks: 48000,
  transform: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
  typography: {
    text: 'JIBHI',
    fontSize: 98,
    color: '#ffffff',
    textAlign: 'center'
  }
});

clips.push({
  id: 'clip_title_jibhi_futura',
  trackId: 'track_v2_titles',
  type: 'text',
  startTick: 204000,
  durationTicks: 48000,
  transform: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
  typography: {
    text: 'JIBHI',
    fontSize: 102,
    color: '#ef4444',
    textAlign: 'center'
  }
});

clips.push({
  id: 'clip_title_jibhi_didot',
  trackId: 'track_v2_titles',
  type: 'text',
  startTick: 252000,
  durationTicks: 48000,
  transform: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
  typography: {
    text: 'JIBHI',
    fontSize: 112,
    color: '#ffffff',
    textAlign: 'center'
  }
});

clips.push({
  id: 'clip_title_valley',
  trackId: 'track_v2_titles',
  type: 'text',
  startTick: 300000,
  durationTicks: 144000,
  transform: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
  typography: {
    text: 'VALLEY',
    fontSize: 104,
    color: '#38bdf8',
    textAlign: 'center'
  }
});

clips.push({
  id: 'clip_title_himachal',
  trackId: 'track_v2_titles',
  type: 'text',
  startTick: 444000,
  durationTicks: 48000,
  transform: { x: 960, y: 648, anchorX: 0.5, anchorY: 0.5, opacity: 1 },
  typography: {
    text: 'HIMACHAL',
    fontSize: 32,
    color: '#f87171',
    textAlign: 'center'
  }
});

// 5. Master BGM Audio Track on Track A1
clips.push({
  id: 'clip_bgm_master',
  trackId: 'track_a1_bgm',
  type: 'audio',
  startTick: 0,
  durationTicks: totalDurationTicks,
  source: {
    assetId: 'asset_bgm_soundtrack',
    trimInTick: 0,
    trimOutTick: totalDurationTicks
  },
  audio: {
    volume: 1.0
  },
  metadata: {
    label: 'Himachal Master Soundtrack (Beat Cuts)'
  }
});

const project = {
  id: 'proj_himachal_001_jibhi_reel',
  schemaVersion: '1.0.0',
  revision: 1,
  title: 'Himachal Jibhi Travel Reel (Final Cut)',
  canvas: {
    width: 1920,
    height: 1080,
    aspectRatio: '16:9',
    backgroundColor: '#000000'
  },
  timebase: {
    fps: {
      numerator: 30,
      denominator: 1
    },
    ticksPerSecond: TICKS_PER_SEC,
    durationTicks: totalDurationTicks,
    endpointConvention: 'half-open'
  },
  previewVideo: FINAL_MP4,
  assets: assets,
  tracks: tracks,
  clips: clips
};

// Validate project
const val = ProjectManager.validateProject(project);
if (!val.valid) {
  console.error('Validation FAILED:', val.errors);
  process.exit(1);
}

// Write to motion-graphics/himachal-001/himachal-001-eme-project.json
const dest1 = path.join(HIMACHAL_DIR, 'himachal-001-eme-project.json');
fs.writeFileSync(dest1, JSON.stringify(project, null, 2), 'utf8');
console.log('Successfully written to:', dest1);

// Also copy to EME artifacts directory
const dest2 = path.resolve(__dirname, '../artifacts/himachal-001-eme-project.json');
fs.writeFileSync(dest2, JSON.stringify(project, null, 2), 'utf8');
console.log('Successfully written to:', dest2);
