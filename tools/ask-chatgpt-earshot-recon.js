/**
 * Ezra Bridge Script: Submit EME x Earshot Integration Reconnaissance Report to ChatGPT Architecture Lead
 *
 * Interacts with ChatGPT Architecture Lead via the active Ezra bridge in Brave Browser
 * (thread: 6ad4ae37-23ec-83ee-b1df-5274a2f04e1a).
 */

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
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        return execute t javascript ${JSON.stringify(jsCode)}
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return (res.stdout || "").trim();
}

async function main() {
  console.log('1. Preparing EME x Earshot Reconnaissance Review Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../plans/EME_EARSHOT_INTEGRATION_RECONNAISSANCE.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Integration Architecture Reconnaissance Review)";

  const promptText = `${promptAnchor},

Following the certification of Milestone Phase 23, we have conducted an **Evidence-Driven Integration Reconnaissance** to determine the safest, highest-value integration of **Earshot** (\`https://github.com/Leonxlnx/earshot\`, release \`v0.3.0\`) into EME's natural-language intent $\\to$ planning $\\to$ deterministic execution $\\to$ rendering $\\to$ closed-loop verification pipeline.

Per mandate, this reconnaissance phase is **STRICTLY READ-ONLY**. Zero source edits, zero npm dependency installations, and zero configuration changes have been made in EME.

### Summary of Reconnaissance Findings:

1. **Established EME's Actual Architecture**:
   - Traced all 6 core subsystems with verified symbol and line citations:
     - Intent compilation (\`src/prompt-core/index.js\`, \`brief-validator.js\`, \`operation-plan-compiler.js\`).
     - Sole mutation authority (\`src/engine/operations.js\`: \`OperationExecutor\`, strictly enforcing integer ticks at 120,000 ticks/sec and half-open intervals).
     - Rendering and composition (\`src/prompt-core/render-orchestrator.js\`, \`src/renderers/hyperframes/\`).
     - Existing QA checks (\`src/renderers/qa-engine.js\`: PCM clipping, true-peak, audio dropout; and \`render-orchestrator.js\`: container, dimensions, duration, decode).
     - Verified gap: EME's current \`CHK_BEAT_CUTS\` only checks static pre-analyzed beat markers; it does not inspect the rendered audio file's actual sound waveform to confirm that transients land on visual cuts.
     - Closed-loop repair (\`src/planning/closed-loop-qa.js\`: currently marks audio defects as \`repairable: false\`).
     - Subprocess worker pattern (\`src/engine/vtsm-worker-client.js\`: isolated Python daemon over stdio JSON-RPC).

2. **Investigated Earshot from its Source (\`v0.3.0\` in \`/tmp/earshot\`):**
   - \`measure\` (\`features.py\`): Pure DSP (no models!). High-precision BS.1770 integrated LUFS, 4x oversampled true peak (dBTP), LRA, noise floor, spectral brightness, attack/decay ms.
   - \`timeline\` (\`timeline.py\`): Heavy model (CLAP/AST). Onset spectral flux (5ms hop, 1ms envelope refinement), exact cut/cue-to-sound offset in ms (\`offset_ms\`), statistical chance baseline.
   - \`sheet\` (\`sheet.py\`): Multi-lane visual diagnostic PNG combining video thumbnails, event tags, spectrogram, loudness curve, beat grid, and color-coded sync markers.
   - \`critique\` (\`critique.py\`): 34-metric launch-grade scorecard with actionable timestamps.
   - \`sfx check\` (\`forge/sfx.py\`): Model-free defect audit detecting "synth whip" rising glides (>4 st climb), double-hit stacking, clicks, and clipping.
   - \`kit\` (\`forge/kit.py\`): Pure DSP role kits rendered into cached WAV takes with \`kit.lock.json\`.
   - \`fit\` / \`forge\`: Analysis-by-synthesis code generation (excluded from initial scope due to high CPU/model overhead).

3. **Smallest Viable Integration Design**:
   - **Form**: Out-of-process, read-only Audio QA & Perception Adapter (\`EarshotQaAdapter\`).
   - **Boundary**: Isolated behind \`QualityAssuranceEngine.auditQuality()\` and \`RenderOrchestrator.inspectRenderedMedia()\`.
   - **Zero Runtime NPM Dependencies**: Core EME \`package.json\` dependencies remain \`{}\`. Earshot runs in an isolated Python \`.venv\` or local MCP daemon.
   - **Zero Mutation Authority**: Earshot cannot alter project state or move clips. Findings are emitted into EME's canonical \`eme-media-qa-report.v1.schema.json\` (\`CHK_EARSHOT_LOUDNESS\`, \`CHK_EARSHOT_SYNC\`, \`CHK_EARSHOT_SCORECARD\`).
   - **Fail-Safe Fallback**: If Python/Earshot is absent or times out (15s watchdog), EME's native FFmpeg QA continues operating with zero interruption.

4. **Objective Certification Test Plan**:
   - 5.0-second synthetic video fixture (\`fixtures/qa-audio-defects.mp4\`) with 3 known defects:
     1. +150ms audio desync on visual cut.
     2. +2.2 dBTP true-peak ceiling overflow with 120 clipped samples.
     3. -85 dBFS digital silence dropout on cut.
   - Verifies detection, scoring, and proposed repair operations (\`move_clip\` by -18,000 ticks) while keeping detection, repair selection, and certification as distinct responsibilities.

Here is the complete EME x Earshot Reconnaissance Report (\`plans/EME_EARSHOT_INTEGRATION_RECONNAISSANCE.md\`):

---

${reportContent}

---

We respectfully submit this architectural reconnaissance report for your review and request:
1. Architecture Lead evaluation and feedback on the proposed read-only QA adapter boundary.
2. Formal authorization ("stop and go ahead") to proceed to implementation planning.`;

  console.log('2. Focusing active ChatGPT tab in Brave Browser...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return "ACTIVATED"
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const fRes = spawnSync('osascript', ['-'], { input: focusScript, encoding: 'utf8' });
  console.log('   Focus:', (fRes.stdout || '').trim());

  await sleep(600);

  console.log('3. Injecting prompt into div.ProseMirror[aria-label="Ask ChatGPT"]...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('div.ProseMirror[aria-label="Ask ChatGPT"]');
    if (!el) return JSON.stringify({ error: 'NO_COMPOSER' });
    el.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(el);
    document.execCommand('delete', false, null);

    const prompt = ${JSON.stringify(promptText)};
    document.execCommand('insertText', false, prompt);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return JSON.stringify({ success: true, length: el.innerText.length });
  })()`);
  console.log('   Injection:', injectRes);

  await sleep(1000);

  console.log('4. Clicking Send button...');
  const sendRes = runOsa(`(() => {
    const el = document.querySelector('div.ProseMirror[aria-label="Ask ChatGPT"]');
    if (!el) return 'NO_COMPOSER';
    let p = el;
    while (p && !p.querySelector('button')) p = p.parentElement;
    if (!p) return 'NO_CONTAINER';
    const btns = Array.from(p.querySelectorAll('button'));
    const sendBtn = btns.find(b => {
      const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
      return (aria === 'send' || aria.includes('send') || aria === 'submit') && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return 'CLICKED_SEND';
    }
    return 'NO_SEND_BTN';
  })()`);
  console.log('   Send:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    console.log('   Retrying send via Enter keystroke...');
    const enterScript = `
tell application "System Events"
  key code 36
end tell`;
    spawnSync('osascript', ['-'], { input: enterScript, encoding: 'utf8' });
  }

  console.log('5. Awaiting ChatGPT Architecture Lead Decision in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      let responseText = '';
      if (pIdx !== -1) {
        const afterPrompt = text.slice(pIdx);
        const marker = "ChatGPT said:";
        const mIdx = afterPrompt.indexOf(marker);
        if (mIdx !== -1) {
          responseText = afterPrompt.slice(mIdx + marker.length).trim();
        } else {
          responseText = afterPrompt.slice(promptAnchor.length).trim();
        }
      }
      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        len: responseText.length,
        snippet: responseText.slice(0, 150),
        text: responseText
      });
    })()`);

    try {
      const data = JSON.parse(checkRes);
      if (!data.isGenerating && data.len > 250) {
        console.log(`\n✅ Architecture Lead Decision received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`   [Attempt ${attempt + 1}/120] Generating=${data.isGenerating}, len=${data.len}...\r`);
      }
    } catch (e) {
      process.stdout.write(`   [Attempt ${attempt + 1}/120] waiting...\r`);
    }
  }

  if (completed && finalMarkdown) {
    const outPath = path.join(__dirname, '../plans/CHATGPT_EARSHOT_RECON_DECISION.md');
    fs.writeFileSync(outPath, finalMarkdown, 'utf8');
    console.log(`\n✅ Saved Architecture Lead decision to: ${outPath}`);
  } else {
    console.error('\n❌ Timed out waiting for ChatGPT response.');
  }
}

main().catch(console.error);
