/**
 * Editing Mechanics Engine (EME) - Direct Bridge to Target ChatGPT Session for Phase PF-03
 * Strictly communicates with https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a
 * Zero interference with any other open ChatGPT sessions.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TARGET_CHAT_ID = '6ad4ae37-23ec-83ee-b1df-5274a2f04e1a';
const REPORT_FILE = path.resolve(__dirname, '../docs/prompt-to-deliverable-pf03-report.md');
const OUT_FILE = path.resolve(__dirname, '../plans/CHATGPT_PHASE_PF03_RESPONSE.md');

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

  const promptText = `EME PROMPT-TO-DELIVERABLE SUBSYSTEM: PHASE PF-03 (MULTI-TRACK TIMELINE PLACEMENT & COMPLEX CREATIVE PLAN COMPILATION) COMPLETION REPORT

Dear ChatGPT Architecture Lead,

In accordance with your authorization and priority directive in CHATGPT_PHASE_PF02_RESPONSE.md ("PF-03 is authorized as the next core prompt-to-deliverable milestone"), we have completed the full manufacturing, schema certification, failure injection, and benchmark verification of Phase PF-03.

Key Architecture Highlights:
1. Implemented MultiTrackScheduler (src/prompt-core/multi-track-scheduler.js) and extended OperationPlanCompiler (src/prompt-core/operation-plan-compiler.js).
2. Strict integer timebase (120,000 ticks/sec), half-open interval calculus [s, e), single-track zero-collision invariant, and ascending zIndex visual compositing hierarchy.
3. Music synchronization consuming eme-beat-analysis.v1: beat snapping within declared tolerance (<= 20ms error, 0ms observed on scenario beats 8 & 16), with beat index, alignment error, and confidence reporting.
4. B-roll cutaways on secondary visual tracks (track_v_broll, zIndex 2) non-destructively overlaying primary footage.
5. 1-second transitions with incoming/outgoing handle verification; fails closed on insufficient source media without altering project duration.
6. Title text overlays with 10% title safe margin enforcement inside 9:16 vertical canvas.
7. Plan-Level Failure Semantics & Atomic Recovery: Addressed your explicit challenge regarding full-plan atomicity. Implemented complete-plan rollback (atomic: true), partial recovery (atomic: false), and durable execution journaling. Tested failure injection across ALL 10 operation step boundaries (0 through 9) with 100% clean rollback to base revision 1 without state leakage.
8. Passed the First PF-03 Certification Scenario: 12-second 9:16 vertical social edit (1,440,000 ticks), 10 operations, dry-run zero mutation verified, followed by live sequential execution to revision 11 with 6 clips across 4 tracks.
9. Full test suite: 8/8 PF-03 tests passing (100% green), 186/186 regression tests passing repository-wide.
10. Added CLI interface: eme prompt plan --project <file> --brief <file> --beat-analysis <file> [--execute] [--atomic] [--json] [--out <file>].

Here is our official Phase PF-03 Verification Report:

${reportContent}

================================================================================
ACTION REQUESTED:
1. Please confirm acceptance of Phase PF-03 (Multi-Track Timeline Placement & Complex Creative Plan Compilation).
2. Please provide architectural authorization, technical specifications, and numerical acceptance gates for the next step:
   - Phase PF-04: End-to-End Automated Deliverable Rendering & Closed-Loop QA (connecting compiled multi-track plans to FFmpeg/HyperFrames renderer, automated audio/video conformance verification, and deliverable manifest emission)
   - And/or continuing Phase A2: Musical Structure Intelligence (downbeat tracking, meter estimation, bar indexing, phrase grouping, section boundaries).`;

  // 4. Inject prompt into composer
  console.log('Injecting PF-03 report into composer...');
  const injectCode = `(function() {
    const el = document.querySelector("#prompt-textarea, form div[contenteditable=true], textarea");
    if (!el) return JSON.stringify({ success: false, error: "No composer element found" });

    el.focus();
    if (el.tagName === "TEXTAREA") {
      el.value = ${JSON.stringify(promptText)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.innerText = ${JSON.stringify(promptText)};
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    }
    return JSON.stringify({ success: true, textLength: el.innerText ? el.innerText.length : el.value.length });
  })()`;

  const injectRes = JSON.parse(runOsa(injectCode));
  console.log(`Injection Result:`, injectRes);
  if (!injectRes.success) throw new Error(injectRes.error);

  await sleep(1500);

  // 5. Click Send Button
  console.log('Submitting prompt to ChatGPT...');
  const clickSendCode = `(function() {
    const btn = document.querySelector('button[data-testid="send-button"], button[aria-label="Send prompt"], form button[type="submit"]');
    if (btn && !btn.disabled) {
      btn.click();
      return JSON.stringify({ success: true, method: "button_click" });
    }
    const el = document.querySelector("#prompt-textarea, form div[contenteditable=true], textarea");
    if (el) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      return JSON.stringify({ success: true, method: "enter_key" });
    }
    return JSON.stringify({ success: false, error: "No send button or enter target" });
  })()`;

  const sendRes = JSON.parse(runOsa(clickSendCode));
  console.log(`Send Result:`, sendRes);
  if (!sendRes.success) throw new Error(sendRes.error);

  console.log('\nPrompt submitted successfully. Waiting for ChatGPT to begin generating response...');

  // 6. Wait for turn count to increment and response to complete
  let maxWaitSec = 300;
  let pollIntervalMs = 5000;
  let elapsed = 0;
  let responseCaptured = false;

  await sleep(6000);

  while (elapsed < maxWaitSec) {
    const statusJson = runOsa(`(function() {
      const stopBtn = document.querySelector('button[aria-label="Stop streaming"], button[data-testid="stop-button"], button[aria-label="Stop generating"]');
      const isGenerating = !!stopBtn;

      const articles = document.querySelectorAll("article[data-message-author-role=assistant]");
      let lastText = "";
      if (articles.length > 0) {
        lastText = articles[articles.length - 1].innerText || "";
      } else {
        const blocks = document.querySelectorAll(".prose, div.markdown, div[class*='block-']");
        if (blocks.length > 0) {
          lastText = blocks[blocks.length - 1].innerText || "";
        }
      }

      return JSON.stringify({
        isGenerating: isGenerating,
        assistantArticleCount: articles.length,
        lastResponseLength: lastText.length,
        snippet: lastText.substring(0, 150)
      });
    })()`);

    let status;
    try {
      status = JSON.parse(statusJson);
    } catch (e) {
      console.log(`[${elapsed}s] Polling error: ${statusJson}`);
      await sleep(pollIntervalMs);
      elapsed += pollIntervalMs / 1000;
      continue;
    }

    console.log(`[${elapsed}s] Generating: ${status.isGenerating} | Assistant Articles: ${status.assistantArticleCount} | Response Length: ${status.lastResponseLength} chars`);

    if (!status.isGenerating && status.lastResponseLength > 300 && elapsed >= 10) {
      console.log('\nGeneration complete! Capturing final ChatGPT response...');

      const fullResponse = runOsa(`(function() {
        const articles = document.querySelectorAll("article[data-message-author-role=assistant]");
        if (articles.length > 0) {
          return articles[articles.length - 1].innerText || "";
        }
        const blocks = document.querySelectorAll(".prose, div.markdown");
        if (blocks.length > 0) {
          return blocks[blocks.length - 1].innerText || "";
        }
        return "";
      })()`);

      fs.writeFileSync(OUT_FILE, fullResponse, 'utf8');
      console.log(`Saved response (${fullResponse.length} bytes) to: ${OUT_FILE}`);
      responseCaptured = true;
      break;
    }

    await sleep(pollIntervalMs);
    elapsed += pollIntervalMs / 1000;
  }

  if (!responseCaptured) {
    console.warn('\nWarning: Timed out waiting for complete response.');
  }
}

main().catch(err => {
  console.error('Fatal bridge error:', err);
  process.exit(1);
});
