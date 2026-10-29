/**
 * 20-Second Cinematic Advertisement HyperFrames Composition Generator
 *
 * Produces: artifacts/cinematic-ad-20s/index.html
 * - 1080 x 1920 (9:16 portrait)
 * - 30 fps, 20.0 seconds (600 frames)
 * - Complete 6-shot creative sequence conforming to Pinterest visual direction & creative brief
 */

const fs = require('fs');
const path = require('path');

const COMP_DIR = path.resolve(__dirname, '..', 'artifacts', 'cinematic-ad-20s');
fs.mkdirSync(COMP_DIR, { recursive: true });

function fileToBase64(filePath, mimeType) {
  const buf = fs.readFileSync(filePath);
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

console.log('[Ad Builder] Encoding hero image assets to base64...');
const shot1EyeBase64 = fileToBase64(path.resolve(__dirname, '..', 'assets', 'shot1_eye.jpg'), 'image/jpeg');
const shot4RunnerBase64 = fileToBase64(path.resolve(__dirname, '..', 'assets', 'shot4_runner.jpg'), 'image/jpeg');
const emeUiBase64 = fileToBase64(path.resolve(__dirname, '..', 'assets', 'eme_ui_desktop.png'), 'image/png');

console.log('[Ad Builder] Generating standalone HyperFrames index.html...');

const htmlContent = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>EME Cinematic Advertisement — "A timeline is flat until you give it a point of view"</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&family=Syne:wght@700;800&display=swap');

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        -webkit-font-smoothing: antialiased;
      }

      body {
        width: 1080px;
        height: 1920px;
        background: #030712;
        overflow: hidden;
        font-family: 'Inter', -apple-system, sans-serif;
        color: #f8fafc;
        position: relative;
      }

      /* 3D Viewport Root */
      #stage {
        position: relative;
        width: 1080px;
        height: 1920px;
        perspective: 1300px;
        perspective-origin: 50% 50%;
        overflow: hidden;
        background: #020617;
      }

      /* Ambient Technical Grid */
      .bg-grid {
        position: absolute;
        inset: -200px;
        background-image: 
          linear-gradient(to right, rgba(56, 189, 248, 0.035) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(56, 189, 248, 0.035) 1px, transparent 1px);
        background-size: 60px 60px;
        pointer-events: none;
      }

      /* Vignette Overlay */
      .cinematic-vignette {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 50% 50%, transparent 45%, rgba(2, 6, 23, 0.85) 100%);
        pointer-events: none;
        z-index: 50;
      }

      /* Film Grain Simulation */
      .film-grain {
        position: absolute;
        inset: 0;
        opacity: 0.04;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        pointer-events: none;
        z-index: 55;
      }

      /* Safe Area Guides (Editorial HUD) */
      .hud-frame-guide {
        position: absolute;
        inset: 60px 50px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        pointer-events: none;
        z-index: 60;
      }
      .hud-frame-corner {
        position: absolute;
        width: 16px;
        height: 16px;
        border-color: rgba(56, 189, 248, 0.5);
        border-style: solid;
      }
      .hud-tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
      .hud-tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
      .hud-bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
      .hud-br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

      .hud-top-telemetry {
        position: absolute;
        top: 24px;
        left: 28px;
        right: 28px;
        display: flex;
        justify-content: space-between;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        letter-spacing: 0.12em;
        color: #94a3b8;
        z-index: 61;
      }
      .hud-bottom-telemetry {
        position: absolute;
        bottom: 24px;
        left: 28px;
        right: 28px;
        display: flex;
        justify-content: space-between;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        letter-spacing: 0.12em;
        color: #64748b;
        z-index: 61;
      }

      /* Shot Containers */
      .shot-container {
        position: absolute;
        inset: 0;
        display: none;
        transform-style: preserve-3d;
      }

      /* ---------------------------------------------------- */
      /* SHOT 1: THE HOOK (00:00 - 00:02)                     */
      /* ---------------------------------------------------- */
      #shot-1 {
        display: block;
      }
      #shot-1-card {
        position: absolute;
        width: 1080px;
        height: 1920px;
        top: 0;
        left: 0;
        transform-origin: 50% 50%;
        transform-style: preserve-3d;
      }
      #shot-1-img {
        position: absolute;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform-origin: 50% 50%;
      }
      #shot-1-scanline {
        position: absolute;
        width: 100%;
        height: 2px;
        top: 720px;
        left: 0;
        background: linear-gradient(90deg, transparent 0%, #38bdf8 30%, #60a5fa 70%, transparent 100%);
        box-shadow: 0 0 12px #38bdf8;
        opacity: 0;
        z-index: 10;
      }
      #shot-1-tracker {
        position: absolute;
        width: 160px;
        height: 160px;
        top: 640px;
        left: 460px;
        border: 1px solid rgba(56, 189, 248, 0.8);
        border-radius: 4px;
        opacity: 0;
        z-index: 12;
      }
      #shot-1-tracker::before {
        content: '+';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #38bdf8;
        font-family: 'JetBrains Mono', monospace;
        font-size: 20px;
      }
      #shot-1-tracker-badge {
        position: absolute;
        top: -28px;
        left: 0;
        background: #0284c7;
        color: #fff;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 2px;
        letter-spacing: 0.1em;
        font-weight: 700;
        white-space: nowrap;
      }
      #shot-1-title {
        position: absolute;
        bottom: 220px;
        left: 60px;
        right: 60px;
        font-family: 'Syne', sans-serif;
        font-size: 50px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #ffffff;
        text-shadow: 0 10px 30px rgba(0,0,0,0.95);
        background: rgba(2, 6, 23, 0.78);
        padding: 20px 24px;
        border-radius: 14px;
        border: 1px solid rgba(56, 189, 248, 0.3);
        backdrop-filter: blur(12px);
        transform: translateZ(250px);
        opacity: 0;
        z-index: 70;
        line-height: 1.2;
        text-align: center;
      }
      #shot-1-sub {
        font-family: 'JetBrains Mono', monospace;
        font-size: 14px;
        letter-spacing: 0.22em;
        color: #38bdf8;
        margin-bottom: 12px;
        display: block;
        text-align: center;
      }

      /* ---------------------------------------------------- */
      /* SHOT 2: RAW TO EDIT MATCH CUT (00:02 - 00:05)         */
      /* ---------------------------------------------------- */
      #shot-2 {
        display: none;
      }
      #shot-2-daw-card {
        position: absolute;
        width: 960px;
        height: 1440px;
        top: 120px;
        left: 60px;
        background: #090e1a;
        border: 1px solid #1e293b;
        border-radius: 18px;
        box-shadow: 0 35px 80px rgba(0,0,0,0.8);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 15;
      }
      .daw-card-header {
        height: 64px;
        background: #0f172a;
        border-bottom: 1px solid #1e293b;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
      }
      .eme-logo-pill {
        display: inline-flex;
        align-items: center;
        background: #2563eb;
        color: #ffffff;
        font-family: 'Syne', sans-serif;
        font-size: 13px;
        font-weight: 800;
        padding: 4px 12px;
        border-radius: 6px;
        letter-spacing: 0.1em;
      }
      .daw-project-name {
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        color: #cbd5e1;
        letter-spacing: 0.08em;
      }
      .daw-timecode-badge {
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        color: #38bdf8;
        font-weight: 700;
      }

      /* Workstation Monitor Preview */
      .daw-monitor {
        position: relative;
        width: 912px;
        height: 980px;
        margin: 24px auto 0;
        background: #020617;
        border-radius: 12px;
        border: 1px solid #1e293b;
        overflow: hidden;
      }
      .daw-monitor-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .daw-monitor-overlay {
        position: absolute;
        inset: 16px;
        border: 1px dashed rgba(255,255,255,0.15);
        pointer-events: none;
      }
      .daw-monitor-status {
        position: absolute;
        top: 14px;
        left: 16px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #10b981;
        background: rgba(0,0,0,0.6);
        padding: 3px 8px;
        border-radius: 4px;
      }

      /* Workstation Multi-Track Timeline */
      .daw-timeline-section {
        position: relative;
        width: 912px;
        height: 500px;
        margin: 20px auto 0;
        background: #070c18;
        border-radius: 12px;
        border: 1px solid #1e293b;
        padding: 16px;
        overflow: hidden;
      }
      .daw-timeline-track {
        position: relative;
        width: 100%;
        height: 72px;
        margin-bottom: 12px;
        background: #0b1222;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.05);
        display: flex;
        align-items: center;
        padding-left: 100px;
        overflow: hidden;
      }
      .daw-track-header {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 90px;
        background: #0f172a;
        border-right: 1px solid #1e293b;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        font-weight: 700;
        color: #94a3b8;
      }
      .daw-clip-block {
        position: absolute;
        height: 52px;
        border-radius: 5px;
        display: flex;
        align-items: center;
        padding: 0 14px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        font-weight: 600;
        color: #fff;
        box-shadow: 0 4px 10px rgba(0,0,0,0.4);
      }
      .clip-video-main {
        background: linear-gradient(90deg, #d97706, #b45309);
        border: 1px solid #f59e0b;
      }
      .clip-video-cut {
        background: linear-gradient(90deg, #0284c7, #0369a1);
        border: 1px solid #38bdf8;
      }
      .clip-audio-vo {
        background: linear-gradient(90deg, #7c3aed, #6d28d9);
        border: 1px solid #a855f7;
      }
      .clip-audio-bgm {
        background: linear-gradient(90deg, #059669, #047857);
        border: 1px solid #10b981;
      }

      /* Playhead */
      #daw-playhead {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #ef4444;
        box-shadow: 0 0 10px #ef4444;
        left: 360px;
        z-index: 25;
      }
      #daw-playhead::before {
        content: '';
        position: absolute;
        top: 0;
        left: -6px;
        border-left: 7px solid transparent;
        border-right: 7px solid transparent;
        border-top: 10px solid #ef4444;
      }

      #shot-2-title {
        position: absolute;
        bottom: 160px;
        left: 60px;
        right: 60px;
        font-family: 'Syne', sans-serif;
        font-size: 42px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #ffffff;
        text-shadow: 0 10px 30px rgba(0,0,0,0.95);
        background: rgba(2, 6, 23, 0.82);
        padding: 16px 20px;
        border-radius: 14px;
        border: 1px solid rgba(56, 189, 248, 0.3);
        backdrop-filter: blur(12px);
        transform: translateZ(250px);
        z-index: 70;
        line-height: 1.25;
        text-align: center;
        opacity: 0;
      }

      /* ---------------------------------------------------- */
      /* SHOT 3: 3D TIMELINE FLIGHT (00:05 - 00:09)           */
      /* ---------------------------------------------------- */
      #shot-3 {
        display: none;
      }
      #shot-3-world {
        position: absolute;
        width: 2400px;
        height: 1920px;
        top: 0;
        left: -300px;
        transform-style: preserve-3d;
        transform-origin: 50% 50%;
      }
      .timeline-track-3d {
        position: absolute;
        width: 2800px;
        height: 120px;
        background: #090f1d;
        border: 1px solid #1e293b;
        border-radius: 8px;
        display: flex;
        align-items: center;
        padding-left: 20px;
      }
      .clip-card-3d {
        position: absolute;
        height: 96px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 0 18px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        color: #fff;
        border: 1px solid rgba(255,255,255,0.15);
        box-shadow: 0 10px 25px rgba(0,0,0,0.6);
      }
      .badge-floating-card {
        position: absolute;
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid #38bdf8;
        padding: 10px 18px;
        border-radius: 8px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: #38bdf8;
        box-shadow: 0 15px 35px rgba(0,0,0,0.7);
        backdrop-filter: blur(10px);
        transform-style: preserve-3d;
      }

      /* ---------------------------------------------------- */
      /* SHOT 4: PRECISION IN MOTION (00:09 - 00:13)          */
      /* ---------------------------------------------------- */
      #shot-4 {
        display: none;
      }
      #shot-4-canvas {
        position: absolute;
        inset: 0;
        transform-style: preserve-3d;
      }
      #shot-4-img {
        position: absolute;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      #shot-4-grade-split {
        position: absolute;
        top: 0;
        bottom: 0;
        right: 0;
        width: 50%;
        overflow: hidden;
        border-left: 2px solid #38bdf8;
        box-shadow: -4px 0 20px rgba(56, 189, 248, 0.5);
      }
      #shot-4-grade-img {
        position: absolute;
        top: 0;
        right: 0;
        width: 1080px;
        height: 1920px;
        object-fit: cover;
        filter: contrast(1.25) saturate(1.3) brightness(0.95);
      }
      #shot-4-tracking-box {
        position: absolute;
        width: 220px;
        height: 380px;
        top: 860px;
        left: 430px;
        border: 1.5px solid #38bdf8;
        border-radius: 6px;
        z-index: 25;
      }
      #shot-4-hud-reticle {
        position: absolute;
        top: -36px;
        left: 0;
        background: rgba(2, 132, 199, 0.9);
        color: #fff;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        padding: 4px 10px;
        border-radius: 3px;
        letter-spacing: 0.1em;
        font-weight: 700;
        white-space: nowrap;
      }
      #shot-4-tag {
        position: absolute;
        bottom: -46px;
        left: 0;
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.4;
      }

      /* ---------------------------------------------------- */
      /* SHOT 5: THE PAYOFF (00:13 - 00:17)                   */
      /* ---------------------------------------------------- */
      #shot-5 {
        display: none;
      }
      #shot-5-layer-a {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #shot-5-title-1 {
        position: absolute;
        top: 660px;
        left: 60px;
        right: 60px;
        font-family: 'Syne', sans-serif;
        font-size: 56px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #ffffff;
        text-shadow: 0 10px 40px rgba(0,0,0,0.95);
        background: rgba(3, 7, 18, 0.75);
        padding: 16px 20px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(10px);
        text-align: center;
        z-index: 35;
        line-height: 1.1;
      }
      #shot-5-title-2 {
        position: absolute;
        top: 840px;
        left: 60px;
        right: 60px;
        font-family: 'Syne', sans-serif;
        font-size: 56px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #38bdf8;
        text-shadow: 0 10px 40px rgba(0,0,0,0.95);
        background: rgba(3, 7, 18, 0.75);
        padding: 16px 20px;
        border-radius: 12px;
        border: 1px solid rgba(56, 189, 248, 0.35);
        backdrop-filter: blur(10px);
        text-align: center;
        z-index: 35;
        line-height: 1.1;
      }

      /* ---------------------------------------------------- */
      /* SHOT 6: BRAND AND FINAL FRAME (00:17 - 00:20)        */
      /* ---------------------------------------------------- */
      #shot-6 {
        display: none;
      }
      #shot-6-card {
        position: absolute;
        width: 900px;
        height: 1460px;
        top: 230px;
        left: 90px;
        background: radial-gradient(circle at 50% 30%, #0d1527 0%, #030712 100%);
        border: 1px solid #1e293b;
        border-radius: 24px;
        box-shadow: 0 40px 100px rgba(0,0,0,0.95);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 40px;
        text-align: center;
        z-index: 40;
      }
      .brand-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #2563eb;
        color: #fff;
        font-family: 'Syne', sans-serif;
        font-size: 20px;
        font-weight: 800;
        padding: 10px 24px;
        border-radius: 10px;
        letter-spacing: 0.14em;
        margin-bottom: 24px;
        box-shadow: 0 10px 25px rgba(37, 99, 235, 0.4);
      }
      .brand-app-name {
        font-family: 'Syne', sans-serif;
        font-size: 46px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #f8fafc;
        margin-bottom: 32px;
        line-height: 1.2;
      }
      .brand-tagline {
        font-family: 'Syne', sans-serif;
        font-size: 60px;
        font-weight: 800;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        background: linear-gradient(135deg, #ffffff 0%, #38bdf8 60%, #60a5fa 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 48px;
        line-height: 1.15;
      }
      .brand-subline {
        font-family: 'JetBrains Mono', monospace;
        font-size: 14px;
        letter-spacing: 0.2em;
        color: #64748b;
        text-transform: uppercase;
        line-height: 1.8;
      }
      .brand-rule {
        width: 80px;
        height: 2px;
        background: #1e293b;
        margin: 32px auto;
      }
    </style>
  </head>
  <body>
    <div id="stage"
         data-composition-id="ad"
         data-width="1080"
         data-height="1920"
         data-start="0"
         data-duration="20"
         data-fps="30">
      <!-- Ambient Grid Background -->
      <div class="bg-grid"></div>

      <!-- Safe Area Frame Guides -->
      <div class="hud-frame-guide">
        <div class="hud-frame-corner hud-tl"></div>
        <div class="hud-frame-corner hud-tr"></div>
        <div class="hud-frame-corner hud-bl"></div>
        <div class="hud-frame-corner hud-br"></div>
      </div>

      <!-- Top Technical Readouts -->
      <div class="hud-top-telemetry">
        <span id="hud-timecode">TC: 00:00:00:00</span>
        <span id="hud-mode">MODE: CINEMATIC RECON</span>
        <span id="hud-fps">30.00 FPS [DETERMINISTIC]</span>
      </div>

      <!-- Bottom Technical Readouts -->
      <div class="hud-bottom-telemetry">
        <span>TICK: <span id="hud-ticks">0</span></span>
        <span>CAM: [PITCH 0.0° YAW 0.0°]</span>
        <span>ENGINE: EME V0.1</span>
      </div>

      <!-- -------------------------------------------------- -->
      <!-- SHOT 1: THE HOOK (00:00 - 00:02)                   -->
      <!-- -------------------------------------------------- -->
      <div id="shot-1" class="shot-container">
        <div id="shot-1-card">
          <img id="shot-1-img" src="${shot1EyeBase64}" alt="Cinematic Eye Hook" />
          <div id="shot-1-scanline"></div>
          <div id="shot-1-tracker">
            <div id="shot-1-tracker-badge">LOCK: ACQUIRED</div>
          </div>
        </div>
        <div id="shot-1-title">
          <span id="shot-1-sub">PROVENANCE // 35MM DECISIVE FRAME</span>
          A TIMELINE IS FLAT.
        </div>
      </div>

      <!-- -------------------------------------------------- -->
      <!-- SHOT 2: RAW FOOTAGE TO EDIT MATCH-CUT (00:02 - 00:05) -->
      <!-- -------------------------------------------------- -->
      <div id="shot-2" class="shot-container">
        <div id="shot-2-daw-card">
          <div class="daw-card-header">
            <div style="display:flex; align-items:center; gap:12px;">
              <span class="eme-logo-pill">EME V0.1</span>
              <span class="daw-project-name">PERSPECTIVE_HOOK.eme</span>
            </div>
            <span class="daw-timecode-badge" id="daw-tc">00:00:02:18</span>
          </div>

          <!-- Video Monitor -->
          <div class="daw-monitor">
            <img class="daw-monitor-img" src="${shot1EyeBase64}" alt="Monitor Preview" />
            <div class="daw-monitor-overlay"></div>
            <div class="daw-monitor-status">● REC.709 LIVE PREVIEW</div>
          </div>

          <!-- Multi-Track Timeline -->
          <div class="daw-timeline-section">
            <div id="daw-playhead"></div>
            
            <div class="daw-timeline-track">
              <div class="daw-track-header">V2: LUT</div>
              <div class="daw-clip-block clip-video-cut" style="left:120px; width:440px;">KODAK 5207 FILM EMULATION</div>
            </div>

            <div class="daw-timeline-track">
              <div class="daw-track-header">V1: MAIN</div>
              <div class="daw-clip-block clip-video-main" id="daw-clip-v1" style="left:120px; width:280px;">MACRO_EYE_01.mov</div>
              <div class="daw-clip-block clip-video-cut" id="daw-clip-v2" style="left:400px; width:340px;">MATCH_CUT_02.mov</div>
            </div>

            <div class="daw-timeline-track">
              <div class="daw-track-header">A1: VO</div>
              <div class="daw-clip-block clip-audio-vo" style="left:120px; width:480px;">BLAKE_VOICEOVER_LINE2.wav</div>
            </div>

            <div class="daw-timeline-track">
              <div class="daw-track-header">A2: SYNTH</div>
              <div class="daw-clip-block clip-audio-bgm" style="left:120px; width:680px;">PROCEDURAL_GROOVE_120BPM.wav</div>
            </div>
          </div>
        </div>

        <div id="shot-2-title">
          UNTIL YOU GIVE IT<br />A POINT OF VIEW.
        </div>
      </div>

      <!-- -------------------------------------------------- -->
      <!-- SHOT 3: 3D TIMELINE VIRTUAL CAMERA (00:05 - 00:09) -->
      <!-- -------------------------------------------------- -->
      <div id="shot-3" class="shot-container">
        <div id="shot-3-world">
          <!-- 3D Tracks floating in perspective -->
          <div class="timeline-track-3d" style="top: 560px; left: 0;">
            <div class="clip-card-3d" style="left: 100px; width: 420px; background: #0284c7; border-color: #38bdf8;">
              <span style="font-size:11px; opacity:0.8;">V3: GRAPHICS</span>
              <strong>SPEED RAMP CURVE [240% -> 100%]</strong>
            </div>
            <div class="clip-card-3d" style="left: 560px; width: 680px; background: #0369a1;">
              <span style="font-size:11px; opacity:0.8;">V3: OVERLAY</span>
              <strong>OPTICAL FLOW INTERPOLATION</strong>
            </div>
          </div>

          <div class="timeline-track-3d" style="top: 720px; left: 0;">
            <div class="clip-card-3d" style="left: 100px; width: 580px; background: #d97706; border-color: #f59e0b;">
              <span style="font-size:11px; opacity:0.8;">V2: FOOTAGE</span>
              <strong>ANAMORPHIC_TRACK_STABILIZED.mov</strong>
            </div>
            <div class="clip-card-3d" style="left: 720px; width: 840px; background: #b45309;">
              <span style="font-size:11px; opacity:0.8;">V2: CUT_02</span>
              <strong>BEZIER_TANGENT_APPLIED</strong>
            </div>
          </div>

          <div class="timeline-track-3d" style="top: 880px; left: 0;">
            <div class="clip-card-3d" style="left: 100px; width: 880px; background: #7c3aed; border-color: #a855f7;">
              <span style="font-size:11px; opacity:0.8;">A1: VOICE STEM</span>
              <strong>INWORLD_BLAKE_SYNTH_48KHZ.wav</strong>
            </div>
          </div>

          <div class="timeline-track-3d" style="top: 1040px; left: 0;">
            <div class="clip-card-3d" style="left: 100px; width: 1400px; background: #059669; border-color: #10b981;">
              <span style="font-size:11px; opacity:0.8;">A2: BASS & ARPS</span>
              <strong>SUB_BASS_808_PULSE_STEREO_DELAY</strong>
            </div>
          </div>

          <!-- Floating Badges in 3D (Pin 2 style) -->
          <div class="badge-floating-card" id="b-card-1" style="top: 480px; left: 440px; transform: translateZ(120px);">
            ✦ SPEED RAMP // 2.4x → 1.0x
          </div>
          <div class="badge-floating-card" id="b-card-2" style="top: 800px; left: 520px; transform: translateZ(180px);">
            ◆ BEZIER KEYFRAME [0.42, 0.0, 0.58, 1.0]
          </div>
          <div class="badge-floating-card" id="b-card-3" style="top: 1180px; left: 320px; transform: translateZ(90px);">
            ◉ DETERMINISTIC TIMEBASE // 120,000 TICKS/S
          </div>
        </div>
      </div>

      <!-- -------------------------------------------------- -->
      <!-- SHOT 4: PRECISION IN MOTION (00:09 - 00:13)        -->
      <!-- -------------------------------------------------- -->
      <div id="shot-4" class="shot-container">
        <div id="shot-4-canvas">
          <img id="shot-4-img" src="${shot4RunnerBase64}" alt="Runner Subject" />
          
          <!-- Split Grade View -->
          <div id="shot-4-grade-split">
            <img id="shot-4-grade-img" src="${shot4RunnerBase64}" alt="Graded Runner" />
          </div>

          <!-- Tracking Reticle -->
          <div id="shot-4-tracking-box">
            <div id="shot-4-hud-reticle">TRACKING LOCK // 99.8%</div>
            <div id="shot-4-tag">
              PIN 01: [X: 520.4, Y: 1180.8]<br />
              OPTICAL FLOW // STABILIZED
            </div>
          </div>
        </div>
      </div>

      <!-- -------------------------------------------------- -->
      <!-- SHOT 5: THE PAYOFF (00:13 - 00:17)                 -->
      <!-- -------------------------------------------------- -->
      <div id="shot-5" class="shot-container">
        <div id="shot-5-layer-a">
          <img id="shot-5-img" src="${shot4RunnerBase64}" style="width:100%; height:100%; object-fit:cover; filter: contrast(1.3) brightness(0.9);" />
          <div id="shot-5-title-1">SHAPE EVERY FRAME.</div>
          <div id="shot-5-title-2">CONTROL EVERY CUT.</div>
        </div>
      </div>

      <!-- -------------------------------------------------- -->
      <!-- SHOT 6: BRAND AND FINAL FRAME (00:17 - 00:20)      -->
      <!-- -------------------------------------------------- -->
      <div id="shot-6" class="shot-container">
        <div id="shot-6-card">
          <div class="brand-badge">
            <span style="font-size:24px;">✦</span> EME V0.1
          </div>
          <h2 class="brand-app-name">EDITING MECHANICS<br />ENGINE</h2>
          <h1 class="brand-tagline">MAKE THE EDIT<br />MOVE.</h1>
          <div class="brand-rule"></div>
          <p class="brand-subline">
            DETERMINISTIC TIMELINE ARCHITECTURE<br />
            120,000 TICKS/SEC // PROCEDURAL DSP<br />
            BUILT FOR AGENTIC VIDEO CRAFT
          </p>
        </div>
      </div>

      <!-- Vignette & Grain Filter Layers -->
      <div class="cinematic-vignette"></div>
      <div class="film-grain"></div>
    </div>

    <script>
      const TOTAL_FRAMES = 600;
      const DURATION_SEC = 20.0;
      const TICKS_PER_SEC = 120000;

      // Elements
      const stage = document.getElementById('stage');
      const hudTc = document.getElementById('hud-timecode');
      const hudTicks = document.getElementById('hud-ticks');

      // Shot 1 elements
      const s1 = document.getElementById('shot-1');
      const s1Card = document.getElementById('shot-1-card');
      const s1Img = document.getElementById('shot-1-img');
      const s1Scan = document.getElementById('shot-1-scanline');
      const s1Tracker = document.getElementById('shot-1-tracker');
      const s1Title = document.getElementById('shot-1-title');

      // Shot 2 elements
      const s2 = document.getElementById('shot-2');
      const s2DawCard = document.getElementById('shot-2-daw-card');
      const s2Playhead = document.getElementById('daw-playhead');
      const s2ClipV2 = document.getElementById('daw-clip-v2');
      const s2Title = document.getElementById('shot-2-title');

      // Shot 3 elements
      const s3 = document.getElementById('shot-3');
      const s3World = document.getElementById('shot-3-world');

      // Shot 4 elements
      const s4 = document.getElementById('shot-4');
      const s4Split = document.getElementById('shot-4-grade-split');
      const s4Tracker = document.getElementById('shot-4-tracking-box');
      const s4Img = document.getElementById('shot-4-img');

      // Shot 5 elements
      const s5 = document.getElementById('shot-5');
      const s5Title1 = document.getElementById('shot-5-title-1');
      const s5Title2 = document.getElementById('shot-5-title-2');

      // Shot 6 elements
      const s6 = document.getElementById('shot-6');
      const s6Card = document.getElementById('shot-6-card');

      /**
       * Deterministic Frame Renderer
       * Computes bit-exact state of every DOM element at frameIndex (0 to 599).
       */
      window.renderFrame = function(frameIndex, totalFrames = 600, duration = 20.0) {
        const t = (frameIndex / 30.0);
        const ticks = Math.round(t * TICKS_PER_SEC);

        // Update telemetry
        const mins = Math.floor(t / 60);
        const secs = Math.floor(t % 60);
        const frames = Math.floor((t % 1) * 30);
        hudTc.textContent = \`TC: \${String(mins).padStart(2,'0')}:\${String(secs).padStart(2,'0')}:\${String(frames).padStart(2,'0')}:00\`;
        hudTicks.textContent = ticks.toLocaleString();

        // Hide all shots initially
        s1.style.display = 'none';
        s2.style.display = 'none';
        s3.style.display = 'none';
        s4.style.display = 'none';
        s5.style.display = 'none';
        s6.style.display = 'none';

        // ----------------------------------------------------
        // SHOT 1: 0.0s -> 2.0s (Frames 0 -> 60)
        // ----------------------------------------------------
        if (t < 2.0) {
          s1.style.display = 'block';

          if (t < 1.15) {
            // Push-in
            const p = t / 1.15;
            const scale = 1.0 + p * 0.05;
            s1Img.style.transform = \`scale(\${scale})\`;
            s1Card.style.transform = 'perspective(1200px) rotateY(0deg) rotateX(0deg)';
            s1Scan.style.opacity = '0';
            s1Tracker.style.opacity = '0';
            s1Title.style.opacity = '0';
          } else {
            // Freeze & 3D tilt
            const freezeP = Math.min(1.0, (t - 1.15) / 0.85);
            const rotY = -8.0 * freezeP;
            const rotX = 4.0 * freezeP;
            const sc = 1.05 - 0.04 * freezeP;
            s1Card.style.transform = \`perspective(1200px) rotateY(\${rotY}deg) rotateX(\${rotX}deg) scale(\${sc})\`;
            
            // Scanline sweeps across
            const scanP = Math.min(1.0, (t - 1.15) / 0.4);
            s1Scan.style.opacity = String(1.0 - scanP * 0.5);
            s1Scan.style.top = (640 + scanP * 120) + 'px';

            // Tracker box lands
            s1Tracker.style.opacity = String(Math.min(1.0, (t - 1.25) / 0.2));
            
            // Title fade in
            s1Title.style.opacity = String(Math.min(1.0, (t - 1.35) / 0.35));
          }
        }
        // ----------------------------------------------------
        // SHOT 2: 2.0s -> 5.0s (Frames 60 -> 150)
        // ----------------------------------------------------
        else if (t < 5.0) {
          s2.style.display = 'block';
          const p = (t - 2.0) / 3.0;

          // Float workstation card
          const rotY = 4.0 - p * 6.0;
          const rotX = -2.0 + p * 3.0;
          s2DawCard.style.transform = \`perspective(1400px) rotateY(\${rotY}deg) rotateX(\${rotX}deg)\`;

          // Playhead scrubs
          const playheadX = 200 + p * 420;
          s2Playhead.style.left = playheadX + 'px';

          // Clip snapping at t = 3.0s (transient)
          if (t < 3.0) {
            const snapP = Math.max(0, (t - 2.0) / 1.0);
            s2ClipV2.style.left = (460 - snapP * 60) + 'px';
            s2ClipV2.style.opacity = '0.7';
          } else {
            s2ClipV2.style.left = '400px';
            s2ClipV2.style.opacity = '1.0';
          }

          // Title fade in
          s2Title.style.opacity = String(Math.min(1.0, (t - 2.3) / 0.5));
        }
        // ----------------------------------------------------
        // SHOT 3: 5.0s -> 9.0s (Frames 150 -> 270)
        // ----------------------------------------------------
        else if (t < 9.0) {
          s3.style.display = 'block';
          const p = (t - 5.0) / 4.0;

          // Dynamic virtual camera flight smoothly centered across tracks
          const camX = 40 - p * 420;
          const camY = -p * 30;
          const camZ = 100 + Math.sin(p * Math.PI) * 120;
          const pitch = 14 + Math.sin(p * Math.PI) * 3;
          const yaw = -16 + p * 8;
          const roll = -2 + p * 2;

          s3World.style.transform = \`perspective(1200px) translate3d(\${camX}px, \${camY}px, \${camZ}px) rotateX(\${pitch}deg) rotateY(\${yaw}deg) rotateZ(\${roll}deg)\`;
        }
        // ----------------------------------------------------
        // SHOT 4: 9.0s -> 13.0s (Frames 270 -> 390)
        // ----------------------------------------------------
        else if (t < 13.0) {
          s4.style.display = 'block';
          const p = (t - 9.0) / 4.0;

          // Camera zooms slightly & follows subject
          const zoom = 1.05 + p * 0.08;
          const panY = -p * 40;
          s4Img.style.transform = \`scale(\${zoom}) translateY(\${panY}px)\`;

          // Tracking box jitter / subpixel lock
          const trackX = 430 + Math.sin(p * 20) * 2;
          const trackY = 860 + panY * 0.8;
          s4Tracker.style.left = trackX + 'px';
          s4Tracker.style.top = trackY + 'px';

          // Split before-and-after wipe from 11.0s to 12.8s
          if (t >= 11.0 && t <= 12.8) {
            const wipeP = (t - 11.0) / 1.8;
            s4Split.style.display = 'block';
            s4Split.style.width = (wipeP * 100) + '%';
          } else if (t > 12.8) {
            s4Split.style.display = 'block';
            s4Split.style.width = '100%';
          } else {
            s4Split.style.display = 'none';
          }
        }
        // ----------------------------------------------------
        // SHOT 5: 13.0s -> 17.0s (Frames 390 -> 510)
        // ----------------------------------------------------
        else if (t < 17.0) {
          s5.style.display = 'block';
          
          // Phase 1: 13.0s -> 15.0s
          if (t < 15.0) {
            s5Title1.style.opacity = String(Math.min(1.0, (t - 13.1) / 0.3));
            s5Title2.style.opacity = '0';
          } else {
            // Phase 2: 15.0s -> 17.0s
            s5Title1.style.opacity = '1.0';
            s5Title2.style.opacity = String(Math.min(1.0, (t - 15.1) / 0.3));
          }
        }
        // ----------------------------------------------------
        // SHOT 6: 17.0s -> 20.0s (Frames 510 -> 600)
        // ----------------------------------------------------
        else {
          s6.style.display = 'block';
          const p = Math.min(1.0, (t - 17.0) / 1.2);

          // Card pulls back into clean resolved composition
          const sc = 0.94 + p * 0.06;
          const rotY = (1.0 - p) * 8.0;
          const rotX = (1.0 - p) * -4.0;
          s6Card.style.transform = \`perspective(1300px) scale(\${sc}) rotateY(\${rotY}deg) rotateX(\${rotX}deg)\`;
          s6Card.style.opacity = String(Math.min(1.0, p * 1.5));
        }

        return true;
      };

      // Initial render frame 0
      window.renderFrame(0, 600, 20.0);

      // GSAP Master Timeline for HyperFrames
      let masterTl = gsap.timeline({ paused: true });
      masterTl.to({ t: 0 }, {
        t: DURATION_SEC,
        duration: DURATION_SEC,
        ease: "none",
        onUpdate: function() {
          const sec = this.targets()[0].t;
          const fr = Math.round(sec * 30);
          window.renderFrame(fr, TOTAL_FRAMES, DURATION_SEC);
        }
      });

      window.__timelines = {
        ad: masterTl
      };

      window.__hyperframes_seek = function(sec) {
        masterTl.seek(sec);
        const fr = Math.round(sec * 30);
        window.renderFrame(fr, TOTAL_FRAMES, DURATION_SEC);
      };
    </script>
  </body>
</html>`;

const outHtmlPath = path.join(COMP_DIR, 'index.html');
fs.writeFileSync(outHtmlPath, htmlContent, 'utf8');
console.log(`[Ad Builder] Wrote standalone composition to: ${outHtmlPath} (${(htmlContent.length / (1024 * 1024)).toFixed(2)} MB)`);
