#!/usr/bin/env node
/**
 * Canonical EME Project Generator for Reel 1 Automation Edit
 * Strictly adheres to schema/eme-project.v1.schema.json and EME compilation pipeline.
 *
 * Implements:
 * 1. 120,000 ticks/sec deterministic timebase across 25.625 seconds (3,075,000 ticks)
 * 2. Visual tracks with proper zIndex ordering (Background, Conformed H.264 B-Roll Footage, Graphics, Typography, HUD Reticles)
 * 3. Exact word-synchronized typography reveals based on Whisper audio analysis (master_word_timestamps.json)
 * 4. ff-tracking camera HUD mechanics (corner brackets, coordinate tags, lock pulses)
 * 5. Master audio track (motion-grounded procedural SFX + Inworld AI voiceover)
 */

const fs = require('fs');
const path = require('path');

const TICKS_PER_SEC = 120000;
const DURATION_SEC = 25.625;
const DURATION_TICKS = Math.round(DURATION_SEC * TICKS_PER_SEC); // 3,075,000

function secToTicks(sec) {
  return Math.round(sec * TICKS_PER_SEC);
}

const project = {
  id: "proj_reel_1_automation_edit",
  schemaVersion: "1.0.0",
  revision: 1,
  title: "Instagram Reel Recreation - System Automation & Productivity",
  canvas: {
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    backgroundColor: "#0A0A0E"
  },
  timebase: {
    fps: {
      numerator: 30,
      denominator: 1
    },
    ticksPerSecond: TICKS_PER_SEC,
    durationTicks: DURATION_TICKS,
    endpointConvention: "half-open"
  },
  assets: [
    {
      id: "conformed_speaker_video",
      type: "video",
      src: "assets/conformed_broll/broll_speaker.mp4"
    },
    {
      id: "conformed_desk_video",
      type: "video",
      src: "assets/conformed_broll/broll_desk.mp4"
    },
    {
      id: "conformed_phone_video",
      type: "video",
      src: "assets/conformed_broll/broll_phone.mp4"
    },
    {
      id: "conformed_keyboard_video",
      type: "video",
      src: "assets/conformed_broll/broll_keyboard.mp4"
    },
    {
      id: "master_audio_track",
      type: "audio",
      src: "assets/audio/master_soundtrack_synced.wav"
    },
    {
      id: "font_anton",
      type: "font",
      src: "assets/fonts/files/Anton-Regular.ttf",
      metadata: { fontFamily: "Anton" }
    },
    {
      id: "font_archivo",
      type: "font",
      src: "assets/fonts/files/ArchivoBlack-Regular.ttf",
      metadata: { fontFamily: "Archivo Black" }
    },
    {
      id: "font_mono",
      type: "font",
      src: "assets/fonts/files/JetBrainsMono-Variable.ttf",
      metadata: { fontFamily: "JetBrains Mono" }
    },
    {
      id: "font_inter",
      type: "font",
      src: "assets/fonts/files/Inter-Variable.ttf",
      metadata: { fontFamily: "Inter" }
    },
    {
      id: "font_grotesk",
      type: "font",
      src: "assets/fonts/files/SpaceGrotesk-Variable.ttf",
      metadata: { fontFamily: "Space Grotesk" }
    }
  ],
  tracks: [
    {
      id: "track_bg",
      name: "Canvas Background",
      kind: "visual",
      zIndex: 0,
      muted: false,
      locked: false
    },
    {
      id: "track_footage",
      name: "B-Roll & Subject Footage",
      kind: "visual",
      zIndex: 10,
      muted: false,
      locked: false
    },
    {
      id: "track_typography_base",
      name: "Typography Base Layer",
      kind: "visual",
      zIndex: 20,
      muted: false,
      locked: false
    },
    {
      id: "track_typography_accent",
      name: "Typography Accent / Top Tag",
      kind: "visual",
      zIndex: 25,
      muted: false,
      locked: false
    },
    {
      id: "track_pill_film",
      name: "Pill 1 - Film",
      kind: "visual",
      zIndex: 26,
      muted: false,
      locked: false
    },
    {
      id: "track_pill_edit",
      name: "Pill 2 - Edit",
      kind: "visual",
      zIndex: 27,
      muted: false,
      locked: false
    },
    {
      id: "track_pill_write",
      name: "Pill 3 - Write",
      kind: "visual",
      zIndex: 28,
      muted: false,
      locked: false
    },
    {
      id: "track_pill_dms",
      name: "Pill 4 - Answer DMs",
      kind: "visual",
      zIndex: 29,
      muted: false,
      locked: false
    },
    {
      id: "track_hud_tracker",
      name: "FF-Tracking HUD Brackets & Reticles",
      kind: "visual",
      zIndex: 35,
      muted: false,
      locked: false
    },
    {
      id: "track_master_audio",
      name: "Master Audio Soundtrack",
      kind: "audio",
      zIndex: 0,
      muted: false,
      locked: false
    }
  ],
  clips: [],
  animations: []
};

// -------------------------------------------------------------
// AUDIO TRACK
// -------------------------------------------------------------
project.clips.push({
  id: "clip_audio_master",
  trackId: "track_master_audio",
  type: "audio",
  startTick: 0,
  durationTicks: DURATION_TICKS,
  source: {
    assetId: "master_audio_track",
    trimInTick: 0,
    trimOutTick: DURATION_TICKS
  },
  audio: { volume: 1.0 }
});

// =============================================================
// SCENE 1: HOOK (0.00s - 1.48s)
// "I just got rid of my to-do list."
// =============================================================
project.clips.push({
  id: "s1_bg",
  trackId: "track_bg",
  type: "graphic",
  startTick: 0,
  durationTicks: secToTicks(1.48),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  effects: [{ type: "brightness", parameters: { factor: 0.12 } }]
});

project.clips.push({
  id: "s1_footage",
  trackId: "track_footage",
  type: "video",
  startTick: 0,
  durationTicks: secToTicks(1.48),
  source: {
    assetId: "conformed_speaker_video",
    trimInTick: 0,
    trimOutTick: secToTicks(1.48)
  },
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 0.95 },
  effects: [{ type: "contrast", parameters: { factor: 1.2 } }]
});

project.clips.push({
  id: "s1_tag_top",
  trackId: "track_typography_accent",
  type: "text",
  startTick: secToTicks(0.08),
  durationTicks: secToTicks(1.40),
  transform: { x: 0, y: 460, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='background:rgba(230,30,42,0.92); padding:10px 32px; border-radius:8px; font-family:Inter; font-size:42px; font-weight:800; letter-spacing:4px; color:#ffffff; box-shadow:0 8px 30px rgba(0,0,0,0.5);'>I JUST GOT</div>",
    fontAssetId: "font_inter",
    fontSize: 42,
    color: "#ffffff",
    textAlign: "center"
  }
});

project.clips.push({
  id: "s1_text_hero",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(0.32),
  durationTicks: secToTicks(1.16),
  transform: { x: 0, y: 640, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='display:flex; flex-direction:column; align-items:center;'><span style='color:#E61E2A; font-family:Anton; font-size:120px; line-height:0.95; letter-spacing:3px; text-shadow:0 10px 40px rgba(230,30,42,0.6);'>RID OF MY</span><span style='color:#FFFFFF; font-family:Anton; font-size:140px; line-height:0.95; letter-spacing:4px;'>TO-DO LIST</span></div>",
    fontAssetId: "font_anton",
    fontSize: 120,
    color: "#E61E2A",
    textAlign: "center"
  }
});

project.clips.push({
  id: "s1_hud_reticle",
  trackId: "track_hud_tracker",
  type: "text",
  startTick: secToTicks(0.15),
  durationTicks: secToTicks(1.33),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='position:absolute; left:360px; top:420px; width:360px; height:460px; border:2px dashed rgba(255,0,85,0.7); box-shadow:inset 0 0 20px rgba(255,0,85,0.2);'>
             <div style='position:absolute; top:-4px; left:-4px; width:24px; height:24px; border-top:4px solid #00F0FF; border-left:4px solid #00F0FF;'></div>
             <div style='position:absolute; top:-4px; right:-4px; width:24px; height:24px; border-top:4px solid #00F0FF; border-right:4px solid #00F0FF;'></div>
             <div style='position:absolute; bottom:-4px; left:-4px; width:24px; height:24px; border-bottom:4px solid #00F0FF; border-left:4px solid #00F0FF;'></div>
             <div style='position:absolute; bottom:-4px; right:-4px; width:24px; height:24px; border-bottom:4px solid #00F0FF; border-right:4px solid #00F0FF;'></div>
             <div style='position:absolute; top:-36px; left:0; font-family:\"JetBrains Mono\", monospace; font-size:22px; color:#00F0FF; background:rgba(10,10,14,0.85); padding:4px 12px; border-radius:4px;'>x: 528 y: 660 [LOCK: 1]</div>
           </div>`,
    fontAssetId: "font_mono",
    fontSize: 22,
    color: "#00F0FF",
    textAlign: "left"
  }
});

// =============================================================
// SCENE 2: THE ENDLESS BURDEN (1.48s - 4.68s)
// "Not because I stopped having things to do, but because the list never actually got shorter."
// =============================================================
project.clips.push({
  id: "s2_bg",
  trackId: "track_bg",
  type: "graphic",
  startTick: secToTicks(1.48),
  durationTicks: secToTicks(3.20),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  effects: [{ type: "brightness", parameters: { factor: 0.15 } }]
});

project.clips.push({
  id: "s2_footage",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(1.48),
  durationTicks: secToTicks(3.20),
  source: {
    assetId: "conformed_desk_video",
    trimInTick: secToTicks(1.48),
    trimOutTick: secToTicks(4.68)
  },
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 0.85 }
});

project.clips.push({
  id: "s2_stack_header",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(1.56),
  durationTicks: secToTicks(3.12),
  transform: { x: 0, y: 520, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='display:flex; flex-direction:column; align-items:center; gap:16px;'>
             <div style='font-family:Inter; font-size:38px; color:#A0A0B0; text-transform:uppercase; letter-spacing:6px; font-weight:700;'>THE ENDLESS BURDEN</div>
             <div style='display:flex; gap:14px; justify-content:center;'>
               <span style='background:#161622; border:1px solid #333348; padding:10px 24px; border-radius:8px; font-family:\"Space Grotesk\"; font-size:38px; color:#ffffff;'>NEVER</span>
               <span style='background:#161622; border:1px solid #333348; padding:10px 24px; border-radius:8px; font-family:\"Space Grotesk\"; font-size:38px; color:#ffffff;'>ACTUALLY</span>
               <span style='background:#161622; border:1px solid #333348; padding:10px 24px; border-radius:8px; font-family:\"Space Grotesk\"; font-size:38px; color:#ffffff;'>GOT</span>
             </div>
           </div>`,
    fontAssetId: "font_grotesk",
    fontSize: 38,
    color: "#ffffff",
    textAlign: "center"
  }
});

project.clips.push({
  id: "s2_word_shorter",
  trackId: "track_typography_accent",
  type: "text",
  startTick: secToTicks(4.16),
  durationTicks: secToTicks(0.52),
  transform: { x: 0, y: 840, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='font-family:Anton; font-size:160px; color:#FFF275; letter-spacing:6px; text-shadow:0 0 50px rgba(255,242,117,0.7);'>SHORTER.</div>",
    fontAssetId: "font_anton",
    fontSize: 160,
    color: "#FFF275",
    textAlign: "center"
  }
});

// =============================================================
// SCENE 3: RHYTHMIC TASKS (4.68s - 7.36s)
// "Every day I would film, edit, write, answer DMs."
// =============================================================
project.clips.push({
  id: "s3_bg",
  trackId: "track_bg",
  type: "graphic",
  startTick: secToTicks(4.68),
  durationTicks: secToTicks(2.68),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  effects: [{ type: "brightness", parameters: { factor: 0.1 } }]
});

project.clips.push({
  id: "s3_footage",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(4.68),
  durationTicks: secToTicks(2.68),
  source: {
    assetId: "conformed_keyboard_video",
    trimInTick: secToTicks(4.68),
    trimOutTick: secToTicks(7.36)
  },
  transform: { x: 0, y: 0, scaleX: 1.05, scaleY: 1.05, opacity: 0.88 },
  effects: [{ type: "contrast", parameters: { factor: 1.2 } }]
});

project.clips.push({
  id: "s3_header",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(4.70),
  durationTicks: secToTicks(2.66),
  transform: { x: 0, y: 340, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='background:rgba(10,10,16,0.92); padding:14px 38px; border-radius:10px; border-left:6px solid #E61E2A; font-family:Inter; font-size:42px; font-weight:800; color:#FFFFFF; letter-spacing:3px;'>EVERY SINGLE DAY:</div>",
    fontAssetId: "font_inter",
    fontSize: 42,
    color: "#FFFFFF",
    textAlign: "center"
  }
});

// 5.22s: FILM
project.clips.push({
  id: "s3_pill_film",
  trackId: "track_pill_film",
  type: "text",
  startTick: secToTicks(5.22),
  durationTicks: secToTicks(2.14),
  transform: { x: 0, y: 520, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='display:inline-flex; align-items:center; gap:16px; background:rgba(20,20,32,0.92); border:2px solid #E61E2A; padding:16px 48px; border-radius:50px; box-shadow:0 8px 30px rgba(230,30,42,0.4);'><span style='font-size:36px;'>🎬</span><span style='font-family:Anton; font-size:52px; color:#FFFFFF; letter-spacing:2px;'>FILM</span></div>",
    fontAssetId: "font_anton",
    fontSize: 52,
    color: "#FFFFFF",
    textAlign: "center"
  }
});

// 5.80s: EDIT
project.clips.push({
  id: "s3_pill_edit",
  trackId: "track_pill_edit",
  type: "text",
  startTick: secToTicks(5.80),
  durationTicks: secToTicks(1.56),
  transform: { x: 0, y: 660, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='display:inline-flex; align-items:center; gap:16px; background:rgba(20,20,32,0.92); border:2px solid #9D4EDD; padding:16px 48px; border-radius:50px; box-shadow:0 8px 30px rgba(157,78,221,0.4);'><span style='font-size:36px;'>✂️</span><span style='font-family:Anton; font-size:52px; color:#FFFFFF; letter-spacing:2px;'>EDIT</span></div>",
    fontAssetId: "font_anton",
    fontSize: 52,
    color: "#FFFFFF",
    textAlign: "center"
  }
});

// 6.22s: WRITE
project.clips.push({
  id: "s3_pill_write",
  trackId: "track_pill_write",
  type: "text",
  startTick: secToTicks(6.22),
  durationTicks: secToTicks(1.14),
  transform: { x: 0, y: 800, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='display:inline-flex; align-items:center; gap:16px; background:rgba(20,20,32,0.92); border:2px solid #FFF275; padding:16px 48px; border-radius:50px; box-shadow:0 8px 30px rgba(255,242,117,0.4);'><span style='font-size:36px;'>📝</span><span style='font-family:Anton; font-size:52px; color:#FFFFFF; letter-spacing:2px;'>WRITE</span></div>",
    fontAssetId: "font_anton",
    fontSize: 52,
    color: "#FFFFFF",
    textAlign: "center"
  }
});

// 6.70s: ANSWER DMs
project.clips.push({
  id: "s3_pill_dms",
  trackId: "track_pill_dms",
  type: "text",
  startTick: secToTicks(6.70),
  durationTicks: secToTicks(0.66),
  transform: { x: 0, y: 940, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='display:inline-flex; align-items:center; gap:16px; background:rgba(20,20,32,0.92); border:2px solid #00F0FF; padding:16px 48px; border-radius:50px; box-shadow:0 8px 30px rgba(0,240,255,0.4);'><span style='font-size:36px;'>💬</span><span style='font-family:Anton; font-size:52px; color:#00F0FF; letter-spacing:2px;'>ANSWER DMs</span></div>",
    fontAssetId: "font_anton",
    fontSize: 52,
    color: "#00F0FF",
    textAlign: "center"
  }
});

// =============================================================
// SCENE 4: EXHAUSTION (7.36s - 10.18s)
// "Yeah, it was exhausting. But why do I keep doing it all myself?"
// =============================================================
project.clips.push({
  id: "s4_bg",
  trackId: "track_bg",
  type: "graphic",
  startTick: secToTicks(7.36),
  durationTicks: secToTicks(2.82),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  effects: [{ type: "brightness", parameters: { factor: 0.12 } }]
});

project.clips.push({
  id: "s4_footage",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(7.36),
  durationTicks: secToTicks(2.82),
  source: {
    assetId: "conformed_desk_video",
    trimInTick: secToTicks(7.36),
    trimOutTick: secToTicks(10.18)
  },
  transform: { x: 0, y: 0, scaleX: 1.05, scaleY: 1.05, opacity: 0.85 }
});

project.clips.push({
  id: "s4_text_exhausting",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(7.38),
  durationTicks: secToTicks(2.80),
  transform: { x: 0, y: 620, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='display:flex; flex-direction:column; align-items:center; gap:20px;'>
             <div style='background:#E61E2A; color:#FFFFFF; font-family:Anton; font-size:120px; padding:14px 60px; border-radius:12px; letter-spacing:4px; box-shadow:0 12px 50px rgba(230,30,42,0.6);'>EXHAUSTING.</div>
             <div style='font-family:\"Space Grotesk\"; font-size:44px; color:#FFFFFF; font-weight:600; text-align:center; max-width:850px; text-shadow:0 4px 16px rgba(0,0,0,0.9); line-height:1.3;'>
               Why do I keep doing it all myself?
             </div>
           </div>`,
    fontAssetId: "font_anton",
    fontSize: 120,
    color: "#FFFFFF",
    textAlign: "center"
  }
});

// =============================================================
// SCENE 5: EPIPHANY ZOOM (10.18s - 12.04s)
// "Because I thought that's what being a creator looked like."
// =============================================================
project.clips.push({
  id: "s5_bg",
  trackId: "track_bg",
  type: "graphic",
  startTick: secToTicks(10.18),
  durationTicks: secToTicks(1.86),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  effects: [{ type: "brightness", parameters: { factor: 0.15 } }]
});

project.clips.push({
  id: "s5_footage",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(10.18),
  durationTicks: secToTicks(1.86),
  source: {
    assetId: "conformed_speaker_video",
    trimInTick: secToTicks(10.18),
    trimOutTick: secToTicks(12.04)
  },
  transform: { x: 0, y: 0, scaleX: 1.35, scaleY: 1.35, opacity: 0.92 }
});

project.clips.push({
  id: "s5_text",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(10.20),
  durationTicks: secToTicks(1.84),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='position:relative; width:100%; height:100%;'>
             <div style='position:absolute; top:340px; left:0; width:100%; text-align:center; font-family:Anton; font-size:180px; color:#E61E2A; letter-spacing:6px; line-height:0.85; text-shadow:0 0 50px rgba(230,30,42,0.8);'>BECAUSE</div>
             <div style='position:absolute; top:660px; left:70px; font-family:Inter; font-size:48px; font-weight:800; color:#FFFFFF; line-height:1.2; text-shadow:0 4px 20px rgba(0,0,0,0.95);'>I thought<br/>that's</div>
             <div style='position:absolute; top:660px; right:70px; text-align:right; font-family:Inter; font-size:48px; font-weight:800; color:#FFFFFF; line-height:1.2; text-shadow:0 4px 20px rgba(0,0,0,0.95);'>what being a<br/>creator looked like.</div>
           </div>`,
    fontAssetId: "font_anton",
    fontSize: 180,
    color: "#E61E2A",
    textAlign: "center"
  }
});

// =============================================================
// SCENE 6: THE QUESTION & PUNCH CUT (12.04s - 16.20s)
// "And the question I get asked the most, is how do you manage all of this without burning out? Well, I don't."
// =============================================================
project.clips.push({
  id: "s6_bg",
  trackId: "track_bg",
  type: "graphic",
  startTick: secToTicks(12.04),
  durationTicks: secToTicks(4.16),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  effects: [{ type: "brightness", parameters: { factor: 0.1 } }]
});

// 6A: Workstation setup during question (12.04s - 15.52s)
project.clips.push({
  id: "s6_footage_a",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(12.04),
  durationTicks: secToTicks(3.48),
  source: {
    assetId: "conformed_desk_video",
    trimInTick: secToTicks(12.04),
    trimOutTick: secToTicks(15.52)
  },
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 0.85 }
});

project.clips.push({
  id: "s6_question_card",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(12.14),
  durationTicks: secToTicks(3.38),
  transform: { x: 0, y: 560, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='background:rgba(18,18,28,0.92); border:2px solid #00F0FF; padding:32px 48px; border-radius:20px; box-shadow:0 20px 60px rgba(0,240,255,0.25); max-width:860px;'>
             <div style='font-family:\"JetBrains Mono\"; font-size:26px; color:#00F0FF; margin-bottom:12px;'>FAQ // QUESTION #1</div>
             <div style='font-family:\"Space Grotesk\"; font-size:46px; color:#FFFFFF; font-weight:700; line-height:1.3;'>
               &ldquo;How do you stay on top of everything without burning out?&rdquo;
             </div>
           </div>`,
    fontAssetId: "font_grotesk",
    fontSize: 46,
    color: "#FFFFFF",
    textAlign: "center"
  }
});

// 6B: Punch Cut Close-up on Speaker: "Well, I don't." (15.52s - 16.20s)
project.clips.push({
  id: "s6_footage_b",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(15.52),
  durationTicks: secToTicks(0.68),
  source: {
    assetId: "conformed_speaker_video",
    trimInTick: secToTicks(15.52),
    trimOutTick: secToTicks(16.20)
  },
  transform: { x: 0, y: 0, scaleX: 1.35, scaleY: 1.35, opacity: 0.95 }
});

project.clips.push({
  id: "s6_text_answer",
  trackId: "track_typography_accent",
  type: "text",
  startTick: secToTicks(15.52),
  durationTicks: secToTicks(0.68),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='position:relative; width:100%; height:100%;'>
             <div style='position:absolute; left:60px; top:80px; font-family:Inter; font-size:26px; font-weight:800; color:#FFFFFF; letter-spacing:2px;'>creator &times; <span style='color:#E61E2A;'>AUTOMATION</span></div>
             <div style='position:absolute; top:220px; left:50%; transform:translateX(-50%) rotate(6deg); font-family:Anton; font-size:140px; color:#FFFFFF; letter-spacing:2px; text-shadow:0 10px 40px rgba(0,0,0,0.95);'>I don't,</div>
             <div style='position:absolute; right:60px; top:800px; font-family:Anton; font-size:200px; color:#FFFFFF; line-height:0.85; text-shadow:0 10px 50px rgba(0,0,0,0.95);'>Well,</div>
             <div style='position:absolute; left:40px; top:880px; font-family:Anton; font-size:130px; color:#E61E2A; transform:rotate(-40deg); letter-spacing:4px; text-shadow:0 0 35px rgba(230,30,42,0.8);'>AUTOMATE</div>
             <div style='position:absolute; bottom:120px; left:80px; right:80px; text-align:center; font-family:Inter; font-size:24px; color:rgba(255,255,255,0.7); line-height:1.4;'>Smart automation handles repetitive conversations and actions so you don't have to.</div>
           </div>`,
    fontAssetId: "font_anton",
    fontSize: 200,
    color: "#FFFFFF",
    textAlign: "center"
  }
});

// =============================================================
// SCENE 7: SMARTPHONE AUTOMATION (16.20s - 19.36s)
// "Someone comments a keyword and they get something valuable on my account."
// =============================================================
project.clips.push({
  id: "s7_bg",
  trackId: "track_bg",
  type: "graphic",
  startTick: secToTicks(16.20),
  durationTicks: secToTicks(3.16),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  effects: [{ type: "brightness", parameters: { factor: 0.12 } }]
});

project.clips.push({
  id: "s7_footage",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(16.20),
  durationTicks: secToTicks(3.16),
  source: {
    assetId: "conformed_phone_video",
    trimInTick: secToTicks(16.20),
    trimOutTick: secToTicks(19.36)
  },
  transform: { x: 0, y: 0, scaleX: 1.05, scaleY: 1.05, opacity: 0.9 }
});

project.clips.push({
  id: "s7_glass_card",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(16.40),
  durationTicks: secToTicks(2.96),
  transform: { x: 0, y: 520, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='background:rgba(18,18,28,0.88); backdrop-filter:blur(24px); border:2px solid rgba(0,240,255,0.4); padding:32px 44px; border-radius:24px; box-shadow:0 20px 60px rgba(0,0,0,0.7), inset 0 0 20px rgba(0,240,255,0.15); max-width:820px;'>
             <div style='display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;'>
               <div style='display:flex; align-items:center; gap:16px;'>
                 <span style='font-size:38px;'>⚡</span>
                 <span style='font-family:Inter; font-size:34px; font-weight:800; color:#00F0FF; letter-spacing:2px;'>AUTOMATION TRIGGER</span>
               </div>
               <span style='font-family:\"JetBrains Mono\"; font-size:24px; color:#888899;'>INSTANT</span>
             </div>
             <div style='font-family:Inter; font-size:38px; color:#FFFFFF; font-weight:600; line-height:1.3;'>
               Someone comments a keyword &rarr; resource delivered in seconds.
             </div>
             <div style='margin-top:20px; display:inline-block; background:rgba(230,30,42,0.9); padding:8px 24px; border-radius:12px; font-family:Inter; font-size:28px; font-weight:700; color:#ffffff;'>✨ 100% Hands-Free</div>
           </div>`,
    fontAssetId: "font_inter",
    fontSize: 38,
    color: "#FFFFFF",
    textAlign: "center"
  }
});

// =============================================================
// SCENE 8: TRIPLE PUNCH CUTS (19.36s - 21.90s)
// "No list, no backlog, no catching up at midnight."
// =============================================================

// Background Footage for Cut 1 & 2: Speaker in dark room
project.clips.push({
  id: "s8_footage_speaker",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(19.36),
  durationTicks: secToTicks(1.44),
  source: {
    assetId: "conformed_speaker_video",
    trimInTick: secToTicks(19.36),
    trimOutTick: secToTicks(20.80)
  },
  transform: { x: 0, y: 0, scaleX: 1.15, scaleY: 1.15, opacity: 0.88 },
  effects: [{ type: "contrast", parameters: { factor: 1.25 } }]
});

// Hit 1: "NO LIST" (19.36s - 20.80s, right-aligned vertical stack)
project.clips.push({
  id: "s8_text_no_list",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(19.36),
  durationTicks: secToTicks(1.44),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='position:absolute; right:80px; top:740px; display:flex; flex-direction:column; align-items:flex-end; font-family:Anton; font-size:160px; line-height:0.85; color:#FFFFFF; text-shadow:0 10px 40px rgba(0,0,0,0.95);'><span>NO</span><span>LIST</span></div>",
    fontAssetId: "font_anton",
    fontSize: 160,
    color: "#FFFFFF",
    textAlign: "right"
  }
});

// Hit 2: "NO BACKLOG" (20.00s - 20.80s, left-aligned vertical stack)
project.clips.push({
  id: "s8_text_no_backlog",
  trackId: "track_typography_accent",
  type: "text",
  startTick: secToTicks(20.00),
  durationTicks: secToTicks(0.80),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: "<div style='position:absolute; left:80px; top:740px; display:flex; flex-direction:column; align-items:flex-start; font-family:Anton; font-size:160px; line-height:0.85; color:#FFFFFF; text-shadow:0 10px 40px rgba(0,0,0,0.95);'><span>NO</span><span style='color:#E61E2A; -webkit-text-stroke:2px #FFFFFF;'>BACKLOG</span></div>",
    fontAssetId: "font_anton",
    fontSize: 160,
    color: "#FFFFFF",
    textAlign: "left"
  }
});

// Cut 3 Footage: Keyboard typing at night (20.80s - 21.90s)
project.clips.push({
  id: "s8_footage_midnight",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(20.80),
  durationTicks: secToTicks(1.10),
  source: {
    assetId: "conformed_keyboard_video",
    trimInTick: secToTicks(20.80),
    trimOutTick: secToTicks(21.90)
  },
  transform: { x: 0, y: 0, scaleX: 1.1, scaleY: 1.1, opacity: 0.85 }
});

// Hit 3 Text: "and no CATCHING UP AT MIDNIGHT"
project.clips.push({
  id: "s8_text_midnight",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(20.80),
  durationTicks: secToTicks(1.10),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='position:relative; width:100%; height:100%;'>
             <div style='position:absolute; top:660px; left:280px; font-family:Inter; font-size:56px; font-weight:700; color:#FFFFFF; text-shadow:0 4px 20px rgba(0,0,0,0.9);'>catching up</div>
             <div style='position:absolute; top:740px; left:120px; display:flex; align-items:baseline; gap:16px;'>
               <span style='font-family:Inter; font-size:48px; font-weight:800; color:#FFFFFF;'>at</span>
               <span style='font-family:Anton; font-size:180px; color:#E61E2A; line-height:0.85; letter-spacing:2px; text-shadow:0 0 50px rgba(230,30,42,0.8);'>MIDNIGHT.</span>
             </div>
             <div style='position:absolute; top:1080px; right:120px; font-family:Anton; font-size:110px; color:#FFFFFF; transform:rotate(-8deg); text-shadow:0 10px 40px rgba(0,0,0,0.9);'>and no</div>
           </div>`,
    fontAssetId: "font_anton",
    fontSize: 180,
    color: "#E61E2A",
    textAlign: "center"
  }
});

// =============================================================
// SCENE 9: MORE TIME TO CREATE (21.90s - 23.06s)
// "Just more time to actually create."
// =============================================================
project.clips.push({
  id: "s9_bg",
  trackId: "track_bg",
  type: "graphic",
  startTick: secToTicks(21.90),
  durationTicks: secToTicks(1.16),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  effects: [{ type: "brightness", parameters: { factor: 0.12 } }]
});

project.clips.push({
  id: "s9_footage",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(21.90),
  durationTicks: secToTicks(1.16),
  source: {
    assetId: "conformed_speaker_video",
    trimInTick: secToTicks(21.90),
    trimOutTick: secToTicks(23.06)
  },
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 0.88 }
});

project.clips.push({
  id: "s9_text",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(21.90),
  durationTicks: secToTicks(1.16),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='position:relative; width:100%; height:100%;'>
             <div style='position:absolute; top:680px; left:140px; font-family:Anton; font-size:180px; color:#E61E2A; transform:rotate(-8deg); line-height:0.85; letter-spacing:4px; text-shadow:0 0 40px rgba(230,30,42,0.8);'>JUST</div>
             <div style='position:absolute; top:840px; left:320px; font-family:Inter; font-size:52px; font-weight:700; color:#FFFFFF; transform:rotate(-8deg); text-shadow:0 4px 20px rgba(0,0,0,0.9);'>more time to</div>
             <div style='position:absolute; top:980px; left:80px; font-family:Anton; font-size:150px; color:#FFFFFF; transform:rotate(-8deg); letter-spacing:3px; text-shadow:0 10px 40px rgba(0,0,0,0.95);'>ACTUALLY CREATE.</div>
           </div>`,
    fontAssetId: "font_anton",
    fontSize: 150,
    color: "#FFFFFF",
    textAlign: "center"
  }
});

// =============================================================
// SCENE 10: OUTRO CTA (23.06s - 25.625s)
// "Comment simple and I'll send you exactly how I set it up."
// =============================================================
project.clips.push({
  id: "s10_bg",
  trackId: "track_bg",
  type: "graphic",
  startTick: secToTicks(23.06),
  durationTicks: secToTicks(2.565),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  effects: [{ type: "brightness", parameters: { factor: 0.08 } }]
});

project.clips.push({
  id: "s10_footage",
  trackId: "track_footage",
  type: "video",
  startTick: secToTicks(23.06),
  durationTicks: secToTicks(2.565),
  source: {
    assetId: "conformed_speaker_video",
    trimInTick: secToTicks(23.06),
    trimOutTick: secToTicks(25.625)
  },
  transform: { x: 0, y: 0, scaleX: 1.15, scaleY: 1.15, opacity: 0.92 }
});

project.clips.push({
  id: "s10_cta_card",
  trackId: "track_typography_base",
  type: "text",
  startTick: secToTicks(23.06),
  durationTicks: secToTicks(2.565),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='position:relative; width:100%; height:100%;'>
             <div style='position:absolute; left:70px; top:780px; display:flex; flex-direction:column; align-items:flex-start;'>
               <div style='font-family:Inter; font-size:42px; font-weight:700; color:#FFFFFF; margin-bottom:8px; text-shadow:0 4px 16px rgba(0,0,0,0.9);'>comment.</div>
               <div style='font-family:Anton; font-size:170px; color:#E61E2A; line-height:0.85; letter-spacing:2px; text-shadow:0 0 50px rgba(230,30,42,0.8);'>&ldquo;SIMPLE&rdquo;</div>
             </div>
             <div style='position:absolute; right:70px; top:740px; display:flex; flex-direction:column; align-items:flex-end;'>
               <div style='font-family:Inter; font-size:42px; font-weight:700; color:#FFFFFF; line-height:1.2; text-shadow:0 4px 16px rgba(0,0,0,0.9); text-align:right;'>And<br/>I'll</div>
               <div style='font-family:Anton; font-size:140px; color:#FFFFFF; line-height:0.85; letter-spacing:2px; text-shadow:0 10px 40px rgba(0,0,0,0.95); text-align:right;'>SEND<br/>YOU</div>
               <div style='font-family:Inter; font-size:36px; font-weight:600; color:rgba(255,255,255,0.8); margin-top:8px; text-shadow:0 4px 16px rgba(0,0,0,0.9);'>the full workflow.</div>
             </div>
           </div>`,
    fontAssetId: "font_anton",
    fontSize: 170,
    color: "#E61E2A",
    textAlign: "center"
  }
});

project.clips.push({
  id: "s10_hud_reticle",
  trackId: "track_hud_tracker",
  type: "text",
  startTick: secToTicks(23.20),
  durationTicks: secToTicks(2.425),
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
  typography: {
    text: `<div style='position:absolute; left:180px; top:620px; width:720px; height:540px; border:2px dashed rgba(0,240,255,0.5);'>
             <div style='position:absolute; top:-4px; left:-4px; width:28px; height:28px; border-top:4px solid #00F0FF; border-left:4px solid #00F0FF;'></div>
             <div style='position:absolute; top:-4px; right:-4px; width:28px; height:28px; border-top:4px solid #00F0FF; border-right:4px solid #00F0FF;'></div>
             <div style='position:absolute; bottom:-4px; left:-4px; width:28px; height:28px; border-bottom:4px solid #00F0FF; border-left:4px solid #00F0FF;'></div>
             <div style='position:absolute; bottom:-4px; right:-4px; width:28px; height:28px; border-bottom:4px solid #00F0FF; border-right:4px solid #00F0FF;'></div>
             <div style='position:absolute; top:-38px; left:0; font-family:\"JetBrains Mono\", monospace; font-size:24px; color:#00F0FF; background:rgba(10,10,14,0.85); padding:4px 14px;'>CTA LOCKED: \"SIMPLE\" // x: 540 y: 960</div>
           </div>`,
    fontAssetId: "font_mono",
    fontSize: 24,
    color: "#00F0FF",
    textAlign: "left"
  }
});

// -------------------------------------------------------------
// GSAP ANIMATIONS
// -------------------------------------------------------------

// S1 Hero Text Spring Pop
project.animations.push({
  clipId: "s1_text_hero",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 0.5, easing: "spring" },
    { offsetTick: secToTicks(0.25), value: 1.05, easing: "power2.out" },
    { offsetTick: secToTicks(1.16), value: 1.0, easing: "linear" }
  ]
});

// S2 "SHORTER." slam bounce
project.animations.push({
  clipId: "s2_word_shorter",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 1.8, easing: "spring" },
    { offsetTick: secToTicks(0.20), value: 0.95, easing: "power2.out" },
    { offsetTick: secToTicks(0.52), value: 1.0, easing: "linear" }
  ]
});

// S3 Rhythmic Pill Pops
project.animations.push({
  clipId: "s3_pill_film",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 0.4, easing: "spring" },
    { offsetTick: secToTicks(0.22), value: 1.05, easing: "power2.out" },
    { offsetTick: secToTicks(2.14), value: 1.0, easing: "linear" }
  ]
});
project.animations.push({
  clipId: "s3_pill_edit",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 0.4, easing: "spring" },
    { offsetTick: secToTicks(0.22), value: 1.05, easing: "power2.out" },
    { offsetTick: secToTicks(1.56), value: 1.0, easing: "linear" }
  ]
});
project.animations.push({
  clipId: "s3_pill_write",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 0.4, easing: "spring" },
    { offsetTick: secToTicks(0.22), value: 1.05, easing: "power2.out" },
    { offsetTick: secToTicks(1.14), value: 1.0, easing: "linear" }
  ]
});
project.animations.push({
  clipId: "s3_pill_dms",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 0.4, easing: "spring" },
    { offsetTick: secToTicks(0.22), value: 1.05, easing: "power2.out" },
    { offsetTick: secToTicks(0.66), value: 1.0, easing: "linear" }
  ]
});

// S6 Answer Punch Cut
project.animations.push({
  clipId: "s6_text_answer",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 1.6, easing: "spring" },
    { offsetTick: secToTicks(0.20), value: 1.0, easing: "power2.out" },
    { offsetTick: secToTicks(0.68), value: 1.0, easing: "linear" }
  ]
});

// S7 Glass Card Floating Entrance
project.animations.push({
  clipId: "s7_glass_card",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 0.85, easing: "spring" },
    { offsetTick: secToTicks(0.30), value: 1.02, easing: "power2.out" },
    { offsetTick: secToTicks(2.96), value: 1.0, easing: "linear" }
  ]
});

// S8 Triple Cut Pops
project.animations.push({
  clipId: "s8_text_no_list",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 1.4, easing: "spring" },
    { offsetTick: secToTicks(0.18), value: 1.0, easing: "power2.out" },
    { offsetTick: secToTicks(1.44), value: 1.0, easing: "linear" }
  ]
});
project.animations.push({
  clipId: "s8_text_no_backlog",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 1.4, easing: "spring" },
    { offsetTick: secToTicks(0.18), value: 1.0, easing: "power2.out" },
    { offsetTick: secToTicks(0.80), value: 1.0, easing: "linear" }
  ]
});

// S10 Outro Pulsing Scale
project.animations.push({
  clipId: "s10_cta_card",
  property: "transform.scale",
  keyframes: [
    { offsetTick: 0, value: 0.9, easing: "spring" },
    { offsetTick: secToTicks(0.50), value: 1.05, easing: "easeInOut" },
    { offsetTick: secToTicks(1.00), value: 1.0, easing: "easeInOut" },
    { offsetTick: secToTicks(1.50), value: 1.05, easing: "easeInOut" },
    { offsetTick: secToTicks(2.565), value: 1.0, easing: "linear" }
  ]
});

// Save to projects/reel-1-automation-edit.json
const outPath = path.resolve(__dirname, '../projects/reel-1-automation-edit.json');
fs.writeFileSync(outPath, JSON.stringify(project, null, 2), 'utf8');

console.log(`✅ Generated canonical EME project: ${outPath}`);
console.log(`   Duration: ${DURATION_SEC}s (${DURATION_TICKS} ticks)`);
console.log(`   Tracks: ${project.tracks.length} | Clips: ${project.clips.length} | Assets: ${project.assets.length} | Animations: ${project.animations.length}`);
