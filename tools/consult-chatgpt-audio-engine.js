const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const CHAT_URL_FRAGMENT = "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a";

function runOsa(jsCode) {
  const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript ${JSON.stringify(jsCode)}
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8" });
  return (res.stdout || "").trim();
}

async function main() {
  const audioPrompt = `Dear ChatGPT Architecture Lead,

Atharv and the Antigravity engineering team are here responding from the IDE workspace via Ezra.

To clarify the scope and isolate workstreams:
1. **Workstream Isolation**: The Prompt-to-Deliverable engine (PF-01 through PF-05) and core editing contracts are actively running in the other dedicated chat/branch. We are keeping that core contract and timeline execution foundation completely unhindered and intact.
2. **Dedicated Focus in this Chat**: Atharv has specifically tasked us with designing and engineering the next major expansion of EME's audio intelligence & sound design subsystem. Specifically, we need to build:
   - **A Stronger SFX Engine**: Moving beyond basic synthetic tones into a robust, professional sound design engine (combining parametric procedural audio synthesis for risers, whooshes, impacts, clicks, glitches, and foley textures with high-grade asset pack integration, automated spatial stereo panning, loudness normalization, and dialogue ducking/sidechaining).
   - **The Beat Understander (Rhythm & Transient Intelligence)**: A music and rhythm analysis subsystem that ingests soundtrack/audio files and deterministically extracts:
     - High-precision BPM and tempo confidence
     - Downbeats, bars, and beat grids
     - Transient onsets and spectral flux curves
     - Multi-band frequency separation (sub-bass/808, kick transients, snare/clap, high-frequency hats/percussion)
     - Energy dynamics, drops, builds, and breakdown boundaries
   - **The Beat Actor (Rhythm-to-Timeline Operational Actor)**: A deterministic EME editing actor that consumes the Beat Understander's analysis and translates musical/rhythmic cues into timeline actions, including:
     - Beat-synced jump cuts and camera zooms/punches
     - Accent flashes, exposure pops, chromatic pulses, and glitch kicks on downbeats
     - Kinetic typography word/phrase entrance timing
     - Speed ramping anchors (e.g., slow-mo buildup -> snap to full speed on the drop)
     - SFX cue auto-placement aligned with visual and acoustic transients
     - Editorial pacing policies (avoiding chaotic over-cutting by respecting phrase cadence and energy curves)

Please provide your comprehensive architectural specification, formal contracts, and implementation directives for this Audio & Rhythmic Subsystem:
1. **System Architecture & Module Boundaries**: How the SFX Engine, Beat Understander, and Beat Actor fit into EME without corrupting existing TL-01 editing operations or project schemas.
2. **The Beat Understander Specification**: Mathematical/algorithmic formulation (FFT/STFT, onset detection, spectral flux, peak picking, tempo estimation), deterministic caching, data structures, and output schemas.
3. **The Beat Actor Specification**: Policy rules, rhythm-to-visual mapping contracts, sync tolerances, energy-aware cut throttling, and compilation to EME timeline operations (\`src/engine/operations.js\`).
4. **The SFX Engine Specification**: Parametric synthesis architecture, audio asset cataloging/retrieval, envelope generators, layer compositing, and headless FFmpeg audio mixing pipelines.
5. **Phase-by-Phase Roadmap & Acceptance Gates**: Clear engineering tasks, golden test fixtures, and non-regression verification criteria.

Looking forward to your architectural guidance so we can begin implementation.`;

  console.log('1. Checking tab availability in Brave Browser...');
  const tabCheck = runOsa(`window.location.href`);
  if (tabCheck === 'NO_TAB') {
    console.error('ERROR: Could not find ChatGPT tab matching ' + CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Tab found:', tabCheck);

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  fs.writeFileSync(path.resolve('plans/prompt_audio_sfx_beat_engine.txt'), audioPrompt, 'utf8');

  console.log('2. Injecting prompt into ChatGPT chat composer...');
  const injectRes = runOsa(`(() => {
    const els = document.querySelectorAll(".ProseMirror, #prompt-textarea");
    const chatInput = els[els.length - 1];
    if (!chatInput) return "NO_CHAT_INPUT";
    chatInput.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    document.execCommand("insertText", false, ${JSON.stringify(audioPrompt)});
    chatInput.dispatchEvent(new Event("input", { bubbles: true }));
    chatInput.dispatchEvent(new Event("change", { bubbles: true }));
    return "INJECTED";
  })()`);
  console.log('   Prompt injection status:', injectRes);

  await sleep(1500);

  console.log('3. Clicking send button...');
  const clickRes = runOsa(`(() => {
    const sendBtn = document.querySelector("[data-testid=send-button], button[aria-label*=\\"Send\\" i]");
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.focus();
      sendBtn.click();
      return "CLICKED_SEND";
    }
    return sendBtn ? ("BTN_FOUND_DISABLED_" + sendBtn.disabled) : "NO_BTN";
  })()`);
  console.log('   Send button click:', clickRes);

  if (clickRes !== 'CLICKED_SEND') {
    console.log('   Retrying send via Enter keypress or form submit...');
    const retryRes = runOsa(`(() => {
      const sendBtn = document.querySelector("[data-testid=send-button], button[aria-label*=\\"Send\\" i]");
      if (sendBtn) {
        sendBtn.removeAttribute("disabled");
        sendBtn.disabled = false;
        sendBtn.click();
        return "CLICKED_AFTER_ENABLE";
      }
      const form = document.querySelector("form");
      if (form) {
        form.requestSubmit();
        return "FORM_SUBMITTED";
      }
      return "RETRY_FAILED";
    })()`);
    console.log('   Retry result:', retryRes);
  }

  console.log('4. Monitoring ChatGPT response generation...');
  const startTime = Date.now();
  let lastLen = 0;
  let stableCount = 0;

  await sleep(4000);

  while (Date.now() - startTime < 360000) { // 6 minutes max
    await sleep(4000);
    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector("[data-testid=stop-button], button[aria-label*=\\"Stop\\" i]");
      const roots = document.querySelectorAll("[class*=\\"MarkdownRoot\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]");
      const lastTurn = roots.length > 0 ? roots[roots.length - 1] : null;
      return JSON.stringify({
        isGenerating: !!stopBtn,
        turnsCount: roots.length,
        lastLen: lastTurn ? (lastTurn.innerText || "").length : 0
      });
    })()`);

    try {
      const state = JSON.parse(checkRes);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`   [${elapsed}s] generating=${state.isGenerating}, turns=${state.turnsCount}, len=${state.lastLen}`);

      if (!state.isGenerating && state.lastLen > 300) {
        if (state.lastLen === lastLen) {
          stableCount++;
          if (stableCount >= 2) {
            console.log('   ChatGPT response generation complete and stable!');
            break;
          }
        } else {
          stableCount = 0;
          lastLen = state.lastLen;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  const responseText = runOsa(`(() => {
    const roots = document.querySelectorAll("[class*=\\"MarkdownRoot\\"], .DilResponseRoot-HfQrEh, [data-message-author-role=assistant]");
    if (roots.length === 0) return "NO_TURNS";
    return roots[roots.length - 1].innerText;
  })()`);

  const outPath = path.resolve('plans/CHATGPT_AUDIO_SFX_BEAT_SPEC.md');
  fs.writeFileSync(outPath, responseText, 'utf8');
  console.log(`\nResponse saved to: ${outPath} (${responseText.length} chars)`);
  console.log('================================================================');
  console.log(responseText.slice(0, 1500) + '...\n[TRUNCATED IN LOG]');
  console.log('================================================================');
}

main().catch(console.error);
