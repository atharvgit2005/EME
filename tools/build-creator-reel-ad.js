const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.resolve(__dirname, '../artifacts/creator-reel-20s');
const HTML_FILE = path.join(OUTPUT_DIR, 'index.html');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>EME Creator Reel — Six Hours vs. Six Minutes</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=JetBrains+Mono:wght@400;600;700;800&family=Inter:wght@400;600;800;900&display=swap');

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        -webkit-font-smoothing: antialiased;
      }

      body {
        width: 1080px;
        height: 1920px;
        background: #f5f5f0;
        overflow: hidden;
        font-family: 'Inter', -apple-system, sans-serif;
        color: #090d16;
        position: relative;
      }

      #stage {
        position: relative;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: #f5f5f0;
        transition: background 0.4s ease;
      }

      /* Graph Paper Grid */
      .bg-grid {
        position: absolute;
        inset: 0;
        background-image: 
          linear-gradient(to right, rgba(6, 182, 212, 0.08) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(6, 182, 212, 0.08) 1px, transparent 1px);
        background-size: 40px 40px;
        pointer-events: none;
        z-index: 1;
      }

      /* Film / Paper Texture Overlay */
      .film-texture {
        position: absolute;
        inset: 0;
        opacity: 0.06;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        pointer-events: none;
        z-index: 80;
      }

      /* Video Container with Dynamic Camera Scale */
      #video-viewport {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 5;
        transform-origin: 50% 40%;
      }

      #video-frame-img {
        width: 1080px;
        height: 1920px;
        object-fit: cover;
        display: block;
      }

      /* Dual Rim Light post-fx overlays (Crimson Left, Cyan Right) */
      .rim-light-left {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 250px;
        background: linear-gradient(to right, rgba(220, 38, 38, 0.35), transparent);
        mix-blend-mode: screen;
        pointer-events: none;
        z-index: 8;
      }

      .rim-light-right {
        position: absolute;
        top: 0;
        bottom: 0;
        right: 0;
        width: 250px;
        background: linear-gradient(to left, rgba(6, 182, 212, 0.35), transparent);
        mix-blend-mode: screen;
        pointer-events: none;
        z-index: 8;
      }

      /* Face Tracking Reticle HUD */
      #face-tracker {
        position: absolute;
        width: 440px;
        height: 520px;
        top: 360px;
        left: 320px;
        border: 2px solid #06b6d4;
        box-shadow: 0 0 20px rgba(6, 182, 212, 0.4), inset 0 0 15px rgba(6, 182, 212, 0.15);
        border-radius: 12px;
        pointer-events: none;
        z-index: 15;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      #face-tracker::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        width: 24px;
        height: 24px;
        transform: translate(-50%, -50%);
        border: 1px solid #06b6d4;
        border-radius: 50%;
      }

      #face-tracker .hud-tag {
        position: absolute;
        top: -30px;
        left: 0;
        background: #06b6d4;
        color: #090d16;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        font-weight: 800;
        padding: 3px 10px;
        border-radius: 4px;
        letter-spacing: 0.08em;
      }

      #face-tracker .hud-coords {
        position: absolute;
        bottom: -28px;
        right: 0;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        color: #06b6d4;
        background: rgba(9, 13, 22, 0.85);
        padding: 3px 8px;
        border-radius: 4px;
      }

      /* Editorial HUD Header & Footer */
      .editorial-header {
        position: absolute;
        top: 60px;
        left: 60px;
        right: 60px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-family: 'JetBrains Mono', monospace;
        font-size: 14px;
        font-weight: 700;
        color: #090d16;
        letter-spacing: 0.12em;
        z-index: 50;
      }

      .telemetry-pill {
        background: rgba(9, 13, 22, 0.9);
        color: #06b6d4;
        padding: 6px 14px;
        border-radius: 9999px;
        border: 1px solid rgba(6, 182, 212, 0.3);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .rec-dot {
        width: 10px;
        height: 10px;
        background: #dc2626;
        border-radius: 50%;
        box-shadow: 0 0 10px #dc2626;
      }

      /* Shot 1 Typography: "SIX HOURS." */
      #shot1-group {
        position: absolute;
        top: 380px;
        left: 80px;
        z-index: 40;
        display: none;
      }

      .hero-slam-text {
        font-family: 'Anton', 'Bebas Neue', sans-serif;
        font-size: 260px;
        line-height: 0.82;
        letter-spacing: -0.02em;
        text-transform: uppercase;
        color: #dc2626;
        position: relative;
        text-shadow: 0 10px 30px rgba(220, 38, 38, 0.25);
      }

      .hero-slam-text .ghost-cyan {
        position: absolute;
        top: 6px;
        left: -6px;
        color: #06b6d4;
        opacity: 0.45;
        z-index: -1;
      }

      /* Shot 2: "FOR 15 SECONDS." & Telemetry Clash */
      #shot2-group {
        position: absolute;
        top: 380px;
        left: 80px;
        right: 80px;
        z-index: 40;
        display: none;
      }

      .plate-text {
        display: inline-block;
        background: #090d16;
        color: #f5f5f0;
        font-family: 'Bebas Neue', 'Anton', sans-serif;
        font-size: 140px;
        line-height: 1.0;
        padding: 8px 24px;
        margin-bottom: 12px;
        border-radius: 8px;
        letter-spacing: 0.05em;
      }

      .plate-text.crimson-hit {
        background: #dc2626;
        color: #ffffff;
        font-size: 170px;
        box-shadow: 0 0 40px rgba(220, 38, 38, 0.4);
      }

      .time-clash-bar {
        margin-top: 30px;
        display: flex;
        gap: 20px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 18px;
        font-weight: 800;
      }

      .time-card-bad {
        background: rgba(220, 38, 38, 0.15);
        border: 1px solid #dc2626;
        color: #dc2626;
        padding: 12px 20px;
        border-radius: 8px;
      }

      .time-card-good {
        background: rgba(6, 182, 212, 0.15);
        border: 1px solid #06b6d4;
        color: #06b6d4;
        padding: 12px 20px;
        border-radius: 8px;
      }

      /* Shot 3: "THAT'S NOT EDITING." */
      #shot3-group {
        position: absolute;
        top: 360px;
        left: 80px;
        right: 80px;
        z-index: 40;
        display: none;
      }

      .insult-title {
        font-family: 'Anton', sans-serif;
        font-size: 190px;
        line-height: 0.85;
        color: #090d16;
        text-transform: uppercase;
      }

      .insult-title .not-highlight {
        color: #dc2626;
        font-size: 260px;
        display: inline-block;
        text-shadow: 0 0 30px rgba(220, 38, 38, 0.4);
      }

      .slash-strike {
        position: relative;
        display: inline-block;
      }

      .slash-strike::after {
        content: '';
        position: absolute;
        left: -10px;
        right: -10px;
        top: 52%;
        height: 14px;
        background: #dc2626;
        transform: rotate(-6deg);
        box-shadow: 0 0 20px #dc2626;
      }

      .sub-insult-plate {
        margin-top: 25px;
        background: #090d16;
        color: #f5f5f0;
        font-family: 'JetBrains Mono', monospace;
        font-size: 22px;
        font-weight: 800;
        padding: 10px 20px;
        border-radius: 6px;
        display: inline-block;
        letter-spacing: 0.1em;
      }

      /* Shot 4: Iris Wipe & EME Timeline UI Card */
      #shot4-group {
        position: absolute;
        inset: 0;
        z-index: 35;
        display: none;
      }

      .iris-wipe-bg {
        position: absolute;
        inset: 0;
        background: #090d16;
        clip-path: circle(0% at 50% 45%);
        transition: clip-path 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 10;
      }

      #eme-timeline-card {
        position: absolute;
        bottom: 180px;
        left: 70px;
        right: 70px;
        height: 380px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(20px);
        border: 2px solid #06b6d4;
        border-radius: 20px;
        padding: 24px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 40px rgba(6, 182, 212, 0.3);
        z-index: 25;
        transform: translateY(60px);
        opacity: 0;
      }

      .timeline-track-row {
        height: 52px;
        background: rgba(255, 255, 255, 0.04);
        margin-bottom: 12px;
        border-radius: 8px;
        position: relative;
        overflow: hidden;
      }

      .track-clip {
        position: absolute;
        top: 4px;
        bottom: 4px;
        border-radius: 6px;
        padding: 8px 14px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
        font-weight: 700;
        color: #ffffff;
        display: flex;
        align-items: center;
      }

      .playhead-line {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 45%;
        width: 3px;
        background: #ef4444;
        box-shadow: 0 0 14px #ef4444;
        z-index: 30;
      }

      /* Shot 5: 4-Beat Kinetic Typography (DROP. CUT. CAPTION. SOUND.) */
      #shot5-group {
        position: absolute;
        top: 360px;
        left: 80px;
        right: 80px;
        z-index: 45;
        display: none;
      }

      .beat-word-stack {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .beat-word {
        font-family: 'Anton', 'Bebas Neue', sans-serif;
        font-size: 150px;
        line-height: 0.88;
        color: rgba(245, 245, 240, 0.3);
        text-transform: uppercase;
        letter-spacing: -0.01em;
        transition: all 0.15s ease;
      }

      .beat-word.active-crimson {
        color: #dc2626;
        text-shadow: 0 0 35px rgba(220, 38, 38, 0.5);
        transform: scale(1.05);
      }

      /* Animated Glowing Audio Waveform for "SOUND" */
      .neon-waveform {
        margin-top: 20px;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 60px;
      }

      .wave-bar {
        width: 8px;
        background: #06b6d4;
        border-radius: 4px;
        box-shadow: 0 0 10px #06b6d4;
        animation: pulseWave 0.4s infinite alternate ease-in-out;
      }

      @keyframes pulseWave {
        0% { height: 12px; }
        100% { height: 55px; }
      }

      /* Shot 6: Glitch Math Payoff */
      #shot6-group {
        position: absolute;
        top: 420px;
        left: 80px;
        right: 80px;
        z-index: 45;
        display: none;
      }

      .payoff-hero-title {
        font-family: 'Anton', sans-serif;
        font-size: 130px;
        line-height: 0.95;
        color: #f5f5f0;
        text-transform: uppercase;
      }

      .payoff-hero-title .tool-name {
        color: #dc2626;
        text-shadow: 0 0 30px rgba(220, 38, 38, 0.5);
      }

      .math-swap-box {
        margin-top: 40px;
        background: rgba(9, 13, 22, 0.95);
        border: 2px solid #06b6d4;
        padding: 30px;
        border-radius: 16px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 64px;
        font-weight: 800;
        color: #06b6d4;
        text-align: center;
        box-shadow: 0 0 40px rgba(6, 182, 212, 0.35);
      }

      /* Shot 7: Before / After Split Screen */
      #shot7-group {
        position: absolute;
        inset: 0;
        z-index: 35;
        display: none;
      }

      .split-screen-line {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 50%;
        width: 4px;
        background: #06b6d4;
        box-shadow: 0 0 20px #06b6d4;
        z-index: 40;
      }

      .split-badge {
        position: absolute;
        top: 180px;
        padding: 8px 24px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 18px;
        font-weight: 800;
        border-radius: 8px;
        z-index: 42;
      }

      .badge-left {
        left: 100px;
        background: #dc2626;
        color: #ffffff;
      }

      .badge-right {
        right: 100px;
        background: #06b6d4;
        color: #090d16;
      }

      /* Shot 8: Final Brand Resolve & Loop */
      #shot8-group {
        position: absolute;
        inset: 0;
        z-index: 60;
        display: none;
        background: #090d16;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 60px;
      }

      .brand-pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        background: #2563eb;
        color: #ffffff;
        font-family: 'JetBrains Mono', monospace;
        font-size: 20px;
        font-weight: 800;
        padding: 10px 24px;
        border-radius: 9999px;
        margin-bottom: 30px;
        box-shadow: 0 0 30px rgba(37, 99, 235, 0.6);
      }

      .cta-headline-stop {
        font-family: 'Anton', sans-serif;
        font-size: 150px;
        line-height: 0.9;
        color: #f5f5f0;
        text-transform: uppercase;
      }

      .cta-headline-ship {
        font-family: 'Anton', sans-serif;
        font-size: 200px;
        line-height: 0.85;
        color: #dc2626;
        text-transform: uppercase;
        margin-bottom: 40px;
        text-shadow: 0 0 40px rgba(220, 38, 38, 0.45);
      }

      .cta-bio-link {
        font-family: 'JetBrains Mono', monospace;
        font-size: 24px;
        font-weight: 800;
        color: #06b6d4;
        background: rgba(6, 182, 212, 0.12);
        border: 2px solid #06b6d4;
        padding: 16px 36px;
        border-radius: 9999px;
        letter-spacing: 0.1em;
      }

      /* Flash Overlay for Loop & Transitions */
      #flash-overlay {
        position: absolute;
        inset: 0;
        background: #ffffff;
        opacity: 0;
        pointer-events: none;
        z-index: 100;
      }
    </style>
  </head>
  <body>
    <div id="stage" data-composition-id="ad" data-width="1080" data-height="1920" data-start="0" data-duration="20" data-fps="30">
      <div class="bg-grid"></div>
      <div class="film-texture"></div>

      <!-- Video Viewport with Dynamic Transform -->
      <div id="video-viewport">
        <img id="video-frame-img" src="./frames/frame_0001.jpg" alt="Creator Frame" />
        <div class="rim-light-left"></div>
        <div class="rim-light-right"></div>
      </div>

      <!-- Face Tracking Reticle HUD -->
      <div id="face-tracker">
        <div class="hud-tag">REC ● 00:00:00 [TRACKING ACQUIRED]</div>
        <div class="hud-coords">PIN: [X: 540.0, Y: 820.0]</div>
      </div>

      <!-- Editorial HUD Header -->
      <div class="editorial-header">
        <div class="telemetry-pill">
          <span class="rec-dot"></span>
          <span>LIVE WORKSTATION RECON</span>
        </div>
        <div style="font-family:'JetBrains Mono'; color:#06b6d4; font-weight:800;">EME V0.1 // 120k TICKS</div>
      </div>

      <!-- Shot 1 Group: SIX HOURS -->
      <div id="shot1-group">
        <div class="hero-slam-text">
          <div id="s1-word-six" style="opacity:0; transform:scale(1.2);">SIX<span class="ghost-cyan">SIX</span></div>
          <div id="s1-word-hours" style="opacity:0; transform:scale(1.2);">HOURS.<span class="ghost-cyan">HOURS.</span></div>
        </div>
      </div>

      <!-- Shot 2 Group: FOR 15 SECONDS -->
      <div id="shot2-group">
        <div id="s2-plates">
          <div class="plate-text">FOR</div><br>
          <div class="plate-text crimson-hit">15 SECONDS.</div>
        </div>
        <div class="time-clash-bar">
          <div class="time-card-bad">
            <div style="font-size:12px; opacity:0.8;">EDIT TIME</div>
            <div id="s2-edit-time" style="font-size:24px;">06:00:00</div>
          </div>
          <div class="time-card-good">
            <div style="font-size:12px; opacity:0.8;">RUNTIME</div>
            <div style="font-size:24px;">00:15:00</div>
          </div>
        </div>
      </div>

      <!-- Shot 3 Group: THAT'S NOT EDITING -->
      <div id="shot3-group">
        <div class="insult-title">
          <div>THAT'S</div>
          <div class="not-highlight" id="s3-not">NOT</div><br>
          <div class="slash-strike">EDITING.</div>
        </div>
        <div class="sub-insult-plate">THAT'S HOSTAGE NEGOTIATION.</div>
      </div>

      <!-- Shot 4 Group: HERE'S THE FIX & Timeline Card -->
      <div id="shot4-group">
        <div class="iris-wipe-bg" id="iris-bg"></div>
        <div style="position:absolute; top:360px; left:80px; z-index:30;">
          <div style="font-family:'Anton'; font-size:160px; color:#f5f5f0; text-transform:uppercase; line-height:0.9;">
            HERE'S THE<br><span style="color:#06b6d4; text-shadow:0 0 35px #06b6d4;">FIX.</span>
          </div>
        </div>

        <div id="eme-timeline-card">
          <div style="display:flex; justify-content:space-between; margin-bottom:16px; font-family:'JetBrains Mono'; font-size:13px; color:#06b6d4;">
            <span>TIMELINE: DETERMINISTIC RECON</span>
            <span>SPEED: 120,000 TICKS/SEC</span>
          </div>
          <div class="timeline-track-row">
            <div class="track-clip" style="left:40px; width:380px; background:#2563eb;">V1: RAW_TALKING_HEAD.MOV</div>
            <div class="track-clip" style="left:430px; width:300px; background:#0284c7;">V2: B-ROLL_KINETIC.MOV</div>
          </div>
          <div class="timeline-track-row">
            <div class="track-clip" style="left:40px; width:450px; background:#7c3aed;">A1: INWORLD_VOICEOVER_BLAKE.WAV</div>
          </div>
          <div class="timeline-track-row">
            <div class="track-clip" style="left:40px; width:680px; background:#059669;">A2: SJC_SFX_SOUNDTRACK_120BPM.WAV</div>
          </div>
          <div class="playhead-line" id="timeline-playhead"></div>
        </div>
      </div>

      <!-- Shot 5 Group: DROP. CUT. CAPTION. SOUND. -->
      <div id="shot5-group">
        <div class="beat-word-stack">
          <div class="beat-word" id="b-drop">1. DROP.</div>
          <div class="beat-word" id="b-cut">2. CUT.</div>
          <div class="beat-word" id="b-caption">3. CAPTION.</div>
          <div class="beat-word" id="b-sound">4. SOUND.</div>
        </div>
        <div class="neon-waveform" id="s5-waveform" style="opacity:0;">
          <div class="wave-bar" style="animation-delay:0.1s;"></div>
          <div class="wave-bar" style="animation-delay:0.3s;"></div>
          <div class="wave-bar" style="animation-delay:0.05s;"></div>
          <div class="wave-bar" style="animation-delay:0.25s;"></div>
          <div class="wave-bar" style="animation-delay:0.15s;"></div>
          <div class="wave-bar" style="animation-delay:0.35s;"></div>
          <div class="wave-bar" style="animation-delay:0.2s;"></div>
          <div class="wave-bar" style="animation-delay:0.08s;"></div>
        </div>
      </div>

      <!-- Shot 6 Group: EME DOES IT IN THE BEAT -->
      <div id="shot6-group">
        <div class="payoff-hero-title">
          <span class="tool-name">EME</span> DOES IT<br>IN THE BEAT.
        </div>
        <div class="math-swap-box">
          <div style="font-size:18px; color:#94a3b8; margin-bottom:8px;">EDIT TURNAROUND TIME</div>
          <span id="s6-time-display">06:00:00</span>
        </div>
      </div>

      <!-- Shot 7 Group: SAME REEL. SIX MINUTES. -->
      <div id="shot7-group">
        <div class="split-screen-line" id="s7-split-line"></div>
        <div class="split-badge badge-left">TRADITIONAL: 6 HOURS</div>
        <div class="split-badge badge-right">EME ENGINE: 6 MINUTES</div>
        <div style="position:absolute; top:360px; left:80px; z-index:45;">
          <div style="font-family:'Anton'; font-size:150px; color:#f5f5f0; text-transform:uppercase; line-height:0.9;">
            SAME REEL.<br><span style="color:#dc2626; text-shadow:0 0 35px #dc2626;">SIX MINUTES.</span>
          </div>
        </div>
      </div>

      <!-- Shot 8 Group: CTA & Loop -->
      <div id="shot8-group">
        <div class="brand-pill">✦ EDITING MECHANICS ENGINE</div>
        <div class="cta-headline-stop">STOP EDITING.</div>
        <div class="cta-headline-ship">START SHIPPING.</div>
        <div class="cta-bio-link">LINK IN BIO →</div>
        <div style="margin-top:40px; font-family:'JetBrains Mono'; font-size:14px; color:#64748b;">
          DETERMINISTIC TIMELINE // 120,000 TICKS/SEC
        </div>
      </div>

      <!-- Flash Overlay -->
      <div id="flash-overlay"></div>
    </div>

    <script>
      const TOTAL_FRAMES = 600;
      const DURATION_SEC = 20.0;
      const FPS = 30;

      // DOM Cache
      const stage = document.getElementById('stage');
      const imgEl = document.getElementById('video-frame-img');
      const viewport = document.getElementById('video-viewport');
      const tracker = document.getElementById('face-tracker');
      const flash = document.getElementById('flash-overlay');

      const s1 = document.getElementById('shot1-group');
      const s1Six = document.getElementById('s1-word-six');
      const s1Hours = document.getElementById('s1-word-hours');

      const s2 = document.getElementById('shot2-group');
      const s2EditTime = document.getElementById('s2-edit-time');

      const s3 = document.getElementById('shot3-group');
      const s3Not = document.getElementById('s3-not');

      const s4 = document.getElementById('shot4-group');
      const irisBg = document.getElementById('iris-bg');
      const emeCard = document.getElementById('eme-timeline-card');
      const playhead = document.getElementById('timeline-playhead');

      const s5 = document.getElementById('shot5-group');
      const bDrop = document.getElementById('b-drop');
      const bCut = document.getElementById('b-cut');
      const bCaption = document.getElementById('b-caption');
      const bSound = document.getElementById('b-sound');
      const s5Wave = document.getElementById('s5-waveform');

      const s6 = document.getElementById('shot6-group');
      const s6Time = document.getElementById('s6-time-display');

      const s7 = document.getElementById('shot7-group');
      const s7Line = document.getElementById('s7-split-line');

      const s8 = document.getElementById('shot8-group');

      // Pre-calculate frame pad helper
      function getFrameSrc(fr) {
        const clamped = Math.max(1, Math.min(600, fr));
        return './frames/frame_' + String(clamped).padStart(4, '0') + '.jpg';
      }

      window.renderFrame = function(frameIndex, totalFrames, duration) {
        const t = (frameIndex / totalFrames) * duration;
        const currentFrameNum = Math.min(600, Math.max(1, frameIndex + 1));

        // Update video frame
        imgEl.src = getFrameSrc(currentFrameNum);

        // Reset visibility
        s1.style.display = 'none';
        s2.style.display = 'none';
        s3.style.display = 'none';
        s4.style.display = 'none';
        s5.style.display = 'none';
        s6.style.display = 'none';
        s7.style.display = 'none';
        s8.style.display = 'none';

        // ----------------------------------------------------
        // SHOT 1: 0.0s -> 1.6s ("SIX HOURS.")
        // ----------------------------------------------------
        if (t < 1.6) {
          s1.style.display = 'block';
          stage.style.background = '#f5f5f0';

          // Flash at frame 0
          if (t < 0.25) {
            flash.style.opacity = String(1.0 - (t / 0.25));
          } else {
            flash.style.opacity = '0';
          }

          // Camera scale 1.0x -> 1.25x punch at 0.35s
          if (t < 0.35) {
            viewport.style.transform = 'scale(1.0)';
          } else {
            const p = Math.min(1.0, (t - 0.35) / 0.12);
            const sc = 1.0 + p * 0.25;
            viewport.style.transform = \`scale(\${sc})\`;
          }

          // Word "SIX" slams in at 0.30s
          if (t >= 0.30) {
            const p = Math.min(1.0, (t - 0.30) / 0.12);
            s1Six.style.opacity = '1';
            s1Six.style.transform = \`scale(\${1.2 - p * 0.2})\`;
          } else {
            s1Six.style.opacity = '0';
          }

          // Word "HOURS." slams in at 0.60s
          if (t >= 0.60) {
            const p = Math.min(1.0, (t - 0.60) / 0.12);
            s1Hours.style.opacity = '1';
            s1Hours.style.transform = \`scale(\${1.2 - p * 0.2})\`;
          } else {
            s1Hours.style.opacity = '0';
          }

          // Face tracker
          tracker.style.display = 'block';
          tracker.style.transform = 'scale(1.0)';
        }

        // ----------------------------------------------------
        // SHOT 2: 1.6s -> 3.6s ("FOR 15 SECONDS.")
        // ----------------------------------------------------
        else if (t < 3.6) {
          s2.style.display = 'block';
          const p = (t - 1.6) / 2.0;

          // Camera creeps from 1.25x to 1.28x
          const sc = 1.25 + p * 0.03;
          viewport.style.transform = \`scale(\${sc})\`;

          // Ticking edit time counter
          const ticks = Math.floor(t * 12) % 60;
          s2EditTime.innerText = \`06:\${String(ticks).padStart(2, '0')}:28\`;

          tracker.style.display = 'block';
          tracker.style.transform = 'scale(1.02)';
        }

        // ----------------------------------------------------
        // SHOT 3: 3.6s -> 6.0s ("THAT'S NOT EDITING.")
        // ----------------------------------------------------
        else if (t < 6.0) {
          s3.style.display = 'block';

          // Macro punch-in 1.4x
          let shakeX = 0;
          let shakeY = 0;
          if (t >= 4.0 && t <= 4.3) {
            // Screen shake on "NOT"
            shakeX = (Math.random() - 0.5) * 16;
            shakeY = (Math.random() - 0.5) * 16;
          }
          viewport.style.transform = \`scale(1.42) translate(\${shakeX}px, \${shakeY}px)\`;

          tracker.style.display = 'block';
          tracker.style.width = '320px';
          tracker.style.height = '380px';
          tracker.style.top = '440px';
          tracker.style.left = '380px';
        }

        // ----------------------------------------------------
        // SHOT 4: 6.0s -> 8.8s ("HERE'S THE FIX." + Timeline Card)
        // ----------------------------------------------------
        else if (t < 8.8) {
          s4.style.display = 'block';
          const p = (t - 6.0) / 2.8;

          // Pull back to 1.0x
          const sc = 1.42 - Math.min(1.0, p * 1.5) * 0.42;
          viewport.style.transform = \`scale(\${sc})\`;

          // Iris wipe opens to 120%
          const irisP = Math.min(1.0, (t - 6.0) / 0.8);
          irisBg.style.clipPath = \`circle(\${irisP * 120}% at 50% 45%)\`;

          // Timeline card slides up
          if (t >= 6.4) {
            const cardP = Math.min(1.0, (t - 6.4) / 0.6);
            emeCard.style.opacity = String(cardP);
            emeCard.style.transform = \`translateY(\${(1.0 - cardP) * 50}px)\`;
          }

          // Playhead sweeps
          if (t >= 6.8) {
            const sweepP = (t - 6.8) / 2.0;
            playhead.style.left = (35 + sweepP * 50) + '%';
          }

          tracker.style.display = 'none';
        }

        // ----------------------------------------------------
        // SHOT 5: 8.8s -> 12.6s (DROP. CUT. CAPTION. SOUND.)
        // ----------------------------------------------------
        else if (t < 12.6) {
          s5.style.display = 'block';
          stage.style.background = '#090d16';

          // Reset beat words
          bDrop.className = 'beat-word';
          bCut.className = 'beat-word';
          bCaption.className = 'beat-word';
          bSound.className = 'beat-word';

          // Beat 1: DROP (8.8 - 9.6s)
          if (t < 9.6) {
            bDrop.className = 'beat-word active-crimson';
            viewport.style.transform = 'scale(1.22)';
          }
          // Beat 2: CUT (9.6 - 10.4s)
          else if (t < 10.4) {
            bDrop.style.color = '#f5f5f0';
            bCut.className = 'beat-word active-crimson';
            viewport.style.transform = 'scale(1.38)';
          }
          // Beat 3: CAPTION (10.4 - 11.4s)
          else if (t < 11.4) {
            bDrop.style.color = '#f5f5f0';
            bCut.style.color = '#f5f5f0';
            bCaption.className = 'beat-word active-crimson';
            viewport.style.transform = 'scale(1.22)';
          }
          // Beat 4: SOUND (11.4 - 12.6s)
          else {
            bDrop.style.color = '#f5f5f0';
            bCut.style.color = '#f5f5f0';
            bCaption.style.color = '#f5f5f0';
            bSound.className = 'beat-word active-crimson';
            s5Wave.style.opacity = '1';
            viewport.style.transform = 'scale(1.4)';
          }

          tracker.style.display = 'none';
        }

        // ----------------------------------------------------
        // SHOT 6: 12.6s -> 14.5s ("EME DOES IT IN THE BEAT.")
        // ----------------------------------------------------
        else if (t < 14.5) {
          s6.style.display = 'block';
          stage.style.background = '#090d16';

          // Pull out smoothly
          const p = (t - 12.6) / 1.9;
          const sc = 1.35 - p * 0.35;
          viewport.style.transform = \`scale(\${sc})\`;

          // Glitch time swap
          if (t < 13.5) {
            s6Time.innerText = '06:00:00';
            s6Time.style.color = '#dc2626';
          } else {
            s6Time.innerText = '00:06:12';
            s6Time.style.color = '#06b6d4';
          }
        }

        // ----------------------------------------------------
        // SHOT 7: 14.5s -> 16.8s ("SAME REEL. SIX MINUTES.")
        // ----------------------------------------------------
        else if (t < 16.8) {
          s7.style.display = 'block';
          stage.style.background = '#090d16';

          // Triple punch: 1.25 -> 1.4 -> 1.25
          if (t < 15.3) {
            viewport.style.transform = 'scale(1.25)';
          } else if (t < 15.8) {
            viewport.style.transform = 'scale(1.4)';
          } else {
            viewport.style.transform = 'scale(1.25)';
          }

          // Split line sweep
          const p = (t - 14.5) / 2.3;
          s7Line.style.left = (40 + p * 20) + '%';
        }

        // ----------------------------------------------------
        // SHOT 8: 16.8s -> 20.0s (CTA & Loop Match)
        // ----------------------------------------------------
        else {
          s8.style.display = 'flex';
          viewport.style.transform = 'scale(1.0)';

          // Flash-to-cream loop match at 19.4s
          if (t >= 19.4) {
            const p = (t - 19.4) / 0.6;
            flash.style.opacity = String(p);
          } else {
            flash.style.opacity = '0';
          }
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
</html>
`;

fs.writeFileSync(HTML_FILE, html, 'utf8');
console.log(`HyperFrames composition created: ${HTML_FILE}`);
