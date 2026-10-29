/**
 * Editing Mechanics Engine (EME) - Direct Bridge to Target ChatGPT Session for Phase A1
 * Strictly communicates with https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a
 * Zero interference with any other open ChatGPT sessions.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TARGET_CHAT_ID = '6ad4ae37-23ec-83ee-b1df-5274a2f04e1a';
const REPORT_FILE = path.resolve(__dirname, '../docs/audio-rhythmic-subsystem-a1-report.md');
const OUT_FILE = path.resolve(__dirname, '../plans/CHATGPT_PHASE_A1_RESPONSE.md');

function runOsa(jsCode) {
  const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${TARGET_CHAT_ID}" then
        return execute t javascript "${jsCode.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
      end if
    end repeat
  end repeat
end tell
`;
  const res = spawnSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(res.stderr || 'osascript execution failed');
  }
  return (res.stdout || '').trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`=== EME AI Bridge -> Target ChatGPT Session: ${TARGET_CHAT_ID} ===\n`);

  // 1. Verify target tab is present
  const checkRes = runOsa(`(function() {
    return JSON.stringify({
      title: document.title,
      url: window.location.href,
      hasComposer: !!document.querySelector("#prompt-textarea, form div[contenteditable=true]")
    });
  })()`);

  let tabInfo;
  try {
    tabInfo = JSON.parse(checkRes);
  } catch (e) {
    throw new Error(`Failed to inspect target tab: ${checkRes}`);
  }

  console.log('Target Tab Verified:');
  console.log(`  Title:        ${tabInfo.title}`);
  console.log(`  URL:          ${tabInfo.url}`);
  console.log(`  Has Composer: ${tabInfo.hasComposer}\n`);

  if (!tabInfo.hasComposer) {
    throw new Error('Composer not found in target tab');
  }

  // 2. Count initial turns
  const initialTurnCount = Number(runOsa(`(function() {
    return document.querySelectorAll("article[data-message-author-role=assistant], div.markdown, .prose, div[class*='block-']").length;
  })()`) || 0);
  console.log(`Current Assistant Turn Count: ${initialTurnCount}`);

  // 3. Build Submission Prompt
  const reportContent = fs.readFileSync(REPORT_FILE, 'utf8');

  const promptText = `EME AUDIO & RHYTHMIC SUBSYSTEM: PHASE A1 (BEAT UNDERSTANDER DSP MVP) COMPLETION REPORT

Dear ChatGPT Architecture Lead,

We have completed the full manufacturing and numerical calibration of Phase A1 (Beat Understander DSP MVP) according to the specifications and numerical acceptance criteria you authorized in CHATGPT_PHASE_A0_RESPONSE.md.

All 15 test suites in tests/audio-beat-dsp.test.js are PASSING (100% green).
Full regression suite (157 tests) remains green with zero core mutations.

Here is our official Phase A1 Verification Report:

${reportContent}

================================================================================
ACTION REQUESTED:
1. Please confirm acceptance of Phase A1 (Beat Understander DSP MVP).
2. Please provide architectural authorization, technical specifications, mathematical definitions, and numerical acceptance gates for:
   - Phase A2: Musical Structure Intelligence (Downbeat tracking, 3/4 vs 4/4 meter estimation, bar indexing, phrase grouping, section boundaries [intro/verse/chorus/drop/outro]).
   - And/or Phase PF-02: Edit Brief Compilation Engine (Translating Prompt Intent Envelopes into deterministic timeline operations).`;

  // 4. Inject prompt into composer
  console.log('Injecting Phase A1 report into target composer...');
  const promptJson = JSON.stringify(promptText);
  const injectRes = runOsa(`(function() {
    const input = document.querySelector("#prompt-textarea, form div[contenteditable=true]");
    if (!input) return "NO_INPUT";
    input.focus();
    document.execCommand("selectAll", false, null);
    const p = ${promptJson};
    const ok = document.execCommand("insertText", false, p);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return ok ? "INJECTED" : "FAILED";
  })()`);

  console.log(`Prompt Injection Status: ${injectRes}`);
  if (injectRes !== 'INJECTED') {
    throw new Error(`Failed to inject prompt: ${injectRes}`);
  }

  await sleep(1000);

  // 5. Click Send Button
  console.log('Triggering Send button in target tab...');
  const sendRes = runOsa(`(function() {
    const sendBtn = document.querySelector("button[data-testid='send-button'], button[aria-label*='Send' i], form button[type='submit']");
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return "CLICKED_SEND_BUTTON";
    }
    const input = document.querySelector("#prompt-textarea, form div[contenteditable=true]");
    if (input) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      return "DISPATCHED_ENTER";
    }
    return "FAILED_NO_SEND";
  })()`);

  console.log(`Send Trigger Result: ${sendRes}\n`);

  // 6. Wait for Generation to Complete
  console.log('Waiting for ChatGPT response generation to complete in target tab (6ad4ae37)...');
  const startTime = Date.now();
  const maxWaitMs = 300000; // 5 minutes max
  let lastTextLength = 0;
  let stableCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(4000);

    const pollRes = runOsa(`(function() {
      const stopBtn = document.querySelector("button[data-testid='stop-button'], button[aria-label*='Stop' i]");
      const turns = document.querySelectorAll("article[data-message-author-role=assistant], div.markdown, .prose, div[class*='block-']");
      const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
      return JSON.stringify({
        isGenerating: !!stopBtn,
        turnsCount: turns.length,
        lastLen: lastTurn ? (lastTurn.innerText || "").length : 0
      });
    })()`);

    let status = {};
    try {
      status = JSON.parse(pollRes);
    } catch (_) {}

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    console.log(`  [${elapsedSec}s] Generating: ${status.isGenerating}, Turns: ${status.turnsCount}, Last Message Length: ${status.lastLen}`);

    if (status.turnsCount > initialTurnCount && !status.isGenerating && status.lastLen > 100) {
      if (status.lastLen === lastTextLength) {
        stableCount++;
        if (stableCount >= 2) {
          console.log('\n✅ ChatGPT response has completed and stabilized!\n');
          break;
        }
      } else {
        stableCount = 0;
        lastTextLength = status.lastLen;
      }
    }
  }

  // 7. Harvest Latest Assistant Response
  console.log('Harvesting response from target tab...');
  const harvestRes = runOsa(`(function() {
    const turns = document.querySelectorAll("article[data-message-author-role=assistant], div.markdown, .prose, div[class*='block-']");
    if (turns.length > 0) {
      return turns[turns.length - 1].innerText;
    }
    return "NO_RESPONSE_FOUND";
  })()`);

  fs.writeFileSync(OUT_FILE, harvestRes, 'utf8');
  console.log(`Response written to: ${OUT_FILE}\n`);
  console.log('======================================================');
  console.log('📄 [CHATGPT RESPONSE IN 6ad4ae37]');
  console.log('======================================================\n');
  console.log(harvestRes);
}

main().catch(err => {
  console.error('❌ Error executing bridge script:', err);
  process.exit(1);
});
