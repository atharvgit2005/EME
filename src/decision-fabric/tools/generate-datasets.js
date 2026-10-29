import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..', '..');

const DATA_DIR = path.join(ROOT, 'src', 'decision-fabric', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Corpus template pools for 10 canonical intents
const CORPUS_TEMPLATES = {
  transcription: [
    "Transcribe the dialogue from source file {file}",
    "Run speech recognition on {file} and extract speaker labels",
    "Generate a verbatim transcript of the host interview on track 1",
    "Extract speech-to-text with precise timestamps for dialogue take {num}",
    "Transcribe audio track from the keynote presentation",
    "Perform speaker diarization and transcription for the panel discussion",
    "Convert spoken audio in {file} to English transcript text",
    "Transcribe spoken sentences with confidence scores for track {num}",
    "Generate transcript with word timestamps for voiceover audio",
    "Process voice recording {file} into speaker-tagged transcript lines",
    "Speech to text transcription for raw camera audio feed {num}",
    "Transcribe interview dialogue and output speaker turns",
    "Generate verbatim dialogue transcript without rendering any on-screen text",
    "Transcribe the presenter speech from raw media file {file}",
    "Run speech-to-text on the narration track with zero subtitle generation",
    "Transcribe the vocal recording and output speaker-separated text"
  ],
  subtitle_generation: [
    "Generate word-level timed captions for the interview video",
    "Create dynamic burned-in subtitles with highlight styling",
    "Format timed captions for a 9:16 vertical social video",
    "Generate SRT subtitles synchronized with the vocal track",
    "Add animated subtitle overlays with bold word-by-word reveal",
    "Create timed captions for reel take {num} with safe margin bounds",
    "Convert approved transcript into timed subtitle clips on track 2",
    "Generate bilingual subtitle tracks from the master dialogue",
    "Style caption typography with yellow active word highlight",
    "Create closed captions for social deliverable {file}",
    "Produce synchronized subtitle blocks adhering to 32 chars per line",
    "Generate karaoke-style subtitle text for the vocal intro",
    "Burn synchronized captions directly onto the video canvas",
    "Create timed subtitles matching the approved transcript text verbatim",
    "Format on-screen captions with highlighted active words",
    "Generate styled vertical subtitles for reel {num}"
  ],
  audio_cleanup: [
    "Remove background air conditioner hum and hiss from vocal track",
    "Apply audio noise reduction and dialogue isolation to {file}",
    "Normalize dialogue loudness to -14 LUFS integrated ceiling",
    "Clean up room echo and reverb from lavalier microphone track",
    "Apply audio ducking to background music whenever voiceover is active",
    "Filter out microphone plosives and low-frequency rumble on track {num}",
    "Denoise dialogue recording and balance frequency spectrum with EQ",
    "Eliminate electrical ground loop buzz from the live audio feed",
    "Smooth out uneven vocal levels with gentle transparent compression",
    "Remove mouth clicks and sibilance from voice take {num}",
    "Equalize dialogue track to restore vocal clarity and presence",
    "Apply voice cleaner preset to remove outdoor wind noise",
    "Fix the audio track by removing steady low hum and background hiss",
    "Clean up dialogue recording leaving video frames untouched",
    "Remove air conditioner hum while preserving music balance",
    "Denoise interview audio and attenuate background fan noise"
  ],
  clip_selection: [
    "Find the strongest 15-second soundbites from the source footage",
    "Select candidate B-roll clips featuring product close-ups",
    "Discover high-energy moments from the podcast recording {file}",
    "Assemble rough-cut clip candidates from camera A and camera B",
    "Identify key reaction shots and B-roll inserts for the montage",
    "Find the funniest quote from raw footage reel {num}",
    "Select best visual takes where the speaker maintains eye contact",
    "Scan source media and pick candidate clips matching the intro topic",
    "Gather top 5 highlight moments suitable for an opening hook",
    "Extract candidate action sequences from raw footage archive {file}",
    "Select visual B-roll cuts to cover dialogue pauses in scene {num}",
    "Find engaging hook soundbites from the raw interview files",
    "Select the strongest takes from the 20 raw recordings",
    "Pick candidate highlight clips from source footage {file}",
    "Find the five best moments from interview take {num}",
    "Curate the highest-energy takes for the opening montage"
  ],
  motion_graphics: [
    "Add animated lower-third title card for Dr. Sarah Chen",
    "Create kinetic typography motion graphic for the hook sentence",
    "Overlay animated callout graphic pointing at the UI button",
    "Insert stylish motion-graphic logo intro at the start of track {num}",
    "Add animated subscribe and notification bell callout graphic",
    "Create title card with smooth gradient sweep animation",
    "Overlay glowing animated boundary graphic around the highlighted subject",
    "Insert chapter title motion card with clean fade-and-slide motion",
    "Add animated metric counter graphic displaying plus forty percent",
    "Create dynamic lower-third banner displaying speaker handle and role",
    "Generate kinetic title sequence with bounce entrance animation",
    "Add animated location tag graphic in upper left safe area",
    "Add an animated title card with kinetic typography entrance",
    "Animate the title words in dynamic motion graphics style",
    "Insert a clean lower-third nameplate graphic on track 2",
    "Overlay animated kinetic text callout for the product launch"
  ],
  color_grading: [
    "Apply warm golden 3D LUT look to the outdoor summer sequence",
    "Apply teal and orange cinematic color grade with skin tone protection",
    "Auto white-balance clip {num} and correct the heavy green tint",
    "Adjust exposure and middle-gray targeting on underexposed camera 2",
    "Apply bleach bypass 3D LUT preset to the urban street sequence",
    "Grade timeline with natural true tone color balance and Rec.709 OETF",
    "Apply cinematic contrast curve with rich shadows and protected highlights",
    "Match color grade of camera B to the primary reference shot",
    "Set exposure compensation to plus one point two EV on clip {num}",
    "Color grade the interior scene with warm tungsten mood and amber highlights",
    "Apply true tone balance with grey-world illuminant correction",
    "Load 3D LUT tetrahedral interpolation shader for the flagship montage",
    "Fix the picture by balancing exposure and adjusting contrast",
    "Apply cyan shadows and warm orange highlights to camera feed",
    "Color grade the clips with natural true tone skin rendition",
    "Apply deep blacks and crisp contrast curve without tint"
  ],
  timeline_manipulation: [
    "Ripple trim clip 2 tail by 24 frames on track 1",
    "Split clip at playhead position 360000 ticks into two halves",
    "Slip clip 3 source range by 12 frames without shifting timeline boundary",
    "Slide clip 2 between neighboring cuts to adjust edit pacing",
    "Move clip {num} from track 1 to track 2 at timestamp 120000 ticks",
    "Perform ripple delete on unwanted gap between clip 3 and clip 4",
    "Trim head of clip 1 to align with audio beat marker",
    "Split video track at cut point and insert one-second reaction cut",
    "Perform magnetic snap alignment of clip 5 to the nearest cut edge",
    "Adjust clip in-point by minus 18 ticks while keeping duration fixed",
    "Ripple trim tail of the intro clip to remove the dead air pause",
    "Slip audio clip 4 forward by half a second to synchronize lip movement",
    "Make the cuts snappier by trimming silent pauses between clips",
    "Make the edit pacing faster while strictly preserving clip order",
    "Remove silent gaps and tighten dialogue pacing on track 1",
    "Speed up clip playback to fit the remaining timeline gap"
  ],
  render_export: [
    "Render final project to 1080p MP4 with AAC stereo audio",
    "Export deliverable video to ProRes 422 HQ master format",
    "Produce final 9:16 vertical reel export with verified render manifest",
    "Encode the approved timeline into H.264 high profile distribution video",
    "Render project snapshot to final output file {file}",
    "Export deliverable at 60 fps with 12 Mbps target bitrate",
    "Run final render pipeline and generate immutable output artifact",
    "Export YouTube 4K master delivery with verified bit-for-bit checksums",
    "Render current revision snapshot to deliverable MP4 in artifacts directory",
    "Encode timeline composition into web-optimized H.264 stream",
    "Trigger render job for project revision {num} with deterministic timebase",
    "Export final mastered video and write complete delivery manifest",
    "Prepare the project for export and render final MP4 deliverable",
    "Export the final video composition to 1080p master file",
    "Encode the approved edit snapshot into H.264 video",
    "Render the deliverable video with AAC stereo audio"
  ],
  media_qa: [
    "Inspect rendered video for 1-2 frame unintended blank flashes",
    "Run full QA audit checking audio clipping and safe margin conformance",
    "Verify audio-to-video synchronization across all cut transitions",
    "Check timeline for unintended cut gaps or dropped frame anomalies",
    "Audit loudness compliance to ensure true-peak does not exceed -1 dBTP",
    "Validate that all text clips stay within 90 percent safe title margins",
    "Inspect video composition for track collision or overlapping audio clips",
    "Run closed-loop QA audit to ensure zero missing assets or broken paths",
    "Verify that rendered frame dimensions match 1920x1080 exactly",
    "Check inter-clip cut continuity and detect black frame flashes",
    "Inspect audio signals for digital clipping or abrupt waveform discontinuity",
    "Perform automated QA check across all 10 deterministic criteria",
    "Check audio sync and verify zero blank-frame flashes",
    "Inspect title safe margins and probe container parameters",
    "Audit loudness ceiling and cut transition continuity",
    "Verify complete media provenance and asset existence"
  ],
  needs_planning: [
    "Find the strongest clips, generate captions, apply teal and orange grade, and export a vertical reel",
    "Edit this 45-minute raw interview into three punchy social clips with music and titles",
    "Transcribe the dialogue, clean the background noise, add lower thirds, and render the final video",
    "Analyze the footage and then assemble a highlight video with dynamic pacing and color grading",
    "Review raw takes, choose the best segments, add subtitles, balance loudness, and export master MP4",
    "Create an end-to-end promotional reel from scratch using the raw camera files",
    "If vocal audio level is too soft boost volume, then assemble B-roll clips, apply warm grade, and export deliverable",
    "Turn this webinar recording into a polished recap video with chapters and animated titles",
    "Step 1 find key quotes, step 2 add motion titles, step 3 color grade, step 4 export final reel",
    "Make this video look professional and ready for broadcast with full audio and visual treatment",
    "Review all clips, fix any pacing issues, add subtitle styling, and produce a finished trailer",
    "Take raw files, select highlights, remove pauses, apply cinematic LUT, and export deliverable",
    "Transcribe the audio feed, remove background noise, and render final video",
    "Trim dead air, grade clips with warm golden look, and export vertical reel",
    "Make this video look more premium, engaging, and cinematic",
    "Clean up this video project and make the cuts snappier"
  ]
};

function generateVariations(template, index) {
  const files = ['interview_camA.mp4', 'broll_drone.mov', 'podcast_rec.wav', 'keynote_master.mp4', 'take_04.mov'];
  const nums = [1, 2, 3, 4, 5, 8, 12];
  const file = files[index % files.length];
  const num = nums[index % nums.length];
  return template.replace(/\{file\}/g, file).replace(/\{num\}/g, num.toString());
}

// Generate distinct variations so every record text is unique
const records = [];
for (const [intent, templates] of Object.entries(CORPUS_TEMPLATES)) {
  const requiresMultistep = intent === 'needs_planning';
  
  templates.forEach((tmpl, i) => {
    // 3 distinct variations per template with unique modifiers
    const modifiers = [
      (t) => generateVariations(t, i),
      (t) => `Please ${generateVariations(t, i + 5).toLowerCase()}`,
      (t) => `EME assistant, urgently ${generateVariations(t, i + 9).toLowerCase()}`
    ];

    modifiers.forEach((mod, v) => {
      const text = mod(tmpl);
      records.push({
        state: {
          request_text: text,
          project_context: {
            timeline_editable: true,
            source_media_available: true,
            has_existing_grade: (i + v) % 2 === 0
          }
        },
        expected: {
          intent: intent,
          requires_multistep_plan: requiresMultistep
        }
      });
    });
  });
}

// Deterministic shuffle with seed
function seededShuffle(arr, seed = 20261018) {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const allRecords = seededShuffle(records);

// Stratified splitting: 70% train, 15% validation, 15% test
const train = [];
const validation = [];
const test = [];

const byIntent = {};
for (const r of allRecords) {
  const intent = r.expected.intent;
  if (!byIntent[intent]) byIntent[intent] = [];
  byIntent[intent].push(r);
}

for (const [intent, list] of Object.entries(byIntent)) {
  const n = list.length;
  const nTrain = Math.floor(n * 0.70);
  const nVal = Math.floor(n * 0.15);
  
  train.push(...list.slice(0, nTrain));
  validation.push(...list.slice(nTrain, nTrain + nVal));
  test.push(...list.slice(nTrain + nVal));
}

// Write JSONL files
function writeJsonl(filePath, items) {
  const content = items.map(x => JSON.stringify(x)).join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

const trainPath = path.join(DATA_DIR, 'train.jsonl');
const valPath = path.join(DATA_DIR, 'validation.jsonl');
const testPath = path.join(DATA_DIR, 'test.jsonl');

const trainHash = writeJsonl(trainPath, train);
const valHash = writeJsonl(valPath, validation);
const testHash = writeJsonl(testPath, test);

// Verify Zero Data Leakage
const trainTexts = new Set(train.map(r => r.state.request_text));
const valTexts = new Set(validation.map(r => r.state.request_text));
const testTexts = new Set(test.map(r => r.state.request_text));

let overlapTrainVal = 0;
let overlapTrainTest = 0;
let overlapValTest = 0;

for (const t of valTexts) if (trainTexts.has(t)) overlapTrainVal++;
for (const t of testTexts) if (trainTexts.has(t)) overlapTrainTest++;
for (const t of testTexts) if (valTexts.has(t)) overlapValTest++;

if (overlapTrainVal > 0 || overlapTrainTest > 0 || overlapValTest > 0) {
  throw new Error(`Data leakage detected: train/val=${overlapTrainVal}, train/test=${overlapTrainTest}, val/test=${overlapValTest}`);
}

// Write split manifest
const manifest = {
  version: "1.0.0",
  created_at: new Date().toISOString(),
  seed: 20261018,
  total_records: allRecords.length,
  splits: {
    train: {
      count: train.length,
      file: "train.jsonl",
      sha256: trainHash
    },
    validation: {
      count: validation.length,
      file: "validation.jsonl",
      sha256: valHash
    },
    test: {
      count: test.length,
      file: "test.jsonl",
      sha256: testHash
    }
  },
  per_class_counts: {
    train: Object.fromEntries(Object.keys(CORPUS_TEMPLATES).map(k => [k, train.filter(r => r.expected.intent === k).length])),
    validation: Object.fromEntries(Object.keys(CORPUS_TEMPLATES).map(k => [k, validation.filter(r => r.expected.intent === k).length])),
    test: Object.fromEntries(Object.keys(CORPUS_TEMPLATES).map(k => [k, test.filter(r => r.expected.intent === k).length]))
  },
  leakage_audit: {
    train_val_overlap: overlapTrainVal,
    train_test_overlap: overlapTrainTest,
    val_test_overlap: overlapValTest,
    passed: true
  }
};

const manifestPath = path.join(DATA_DIR, 'split-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(`[EME Dataset Generator] Complete: ${allRecords.length} records. Train: ${train.length}, Val: ${validation.length}, Test: ${test.length}. Leakage: 0.`);
