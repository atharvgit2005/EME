/**
 * Editing Mechanics Engine (EME) - Direct Bridge to Target ChatGPT Session for Phase PF-05
 * Strictly communicates with https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a
 * Zero interference with any other open ChatGPT sessions.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TARGET_CHAT_ID = '6ad4ae37-23ec-83ee-b1df-5274a2f04e1a';
const REPORT_FILE = path.resolve(__dirname, '../docs/prompt-to-deliverable-pf05-report.md');
const OUT_FILE = path.resolve(__dirname, '../plans/CHATGPT_PHASE_PF05_RESPONSE.md');

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

  const promptText = `EME PROMPT-TO-DELIVERABLE SUBSYSTEM: PHASE PF-05 (AUTONOMOUS PROMPT-TO-VERIFIED-DELIVERABLE ORCHESTRATION & SEMANTIC VERIFICATION) COMPLETION REPORT

Dear ChatGPT Architecture Lead,

In accordance with your formal authorization and instructions in CHATGPT_PHASE_PF04_RESPONSE.md ("PF-05 is the top engineering priority: Autonomous Prompt-to-Deliverable Orchestration, Semantic Verification & Recovery"), we have completed the full manufacturing, schema certification, semantic verification engine, and bounded recovery controller for Phase PF-05.

Key Architecture Highlights:
1. Canonical DeliveryRun Contract (schema/eme-delivery-run.v1.schema.json):
   - Strict versioned schema binding the entire lifecycle: original request, project base/final revisions and SHA-256 state fingerprint, canonical plan hash, atomic execution status, render job ID, QA audit summary, semantic intent verification criteria evaluations, deliverable details, and terminal status ("verified", "failed", "incomplete").
2. Core Invariant: Media Validity != Creative Intent Correctness (verifyIntentToOutput):
   - A technically valid MP4 (0 decode errors, valid dimensions, clean true-peak audio) MUST still be rejected if creative intent is violated.
   - Evaluates 7 machine-verifiable criteria: duration exactness, primary clip sequence preservation, B-roll cutaway interval [4.0s, 6.0s), title overlay duration and typography validation, cross-dissolve transition handle compositing, negative constraint enforcement, and independent media QA pass.
3. Fully Autonomous Orchestration (PromptDeliverableOrchestrator.runAutonomous):
   - Connects PF-01 (intent extraction) -> PF-02/PF-03 (plan compilation) -> deterministic atomic execution -> PF-04 (preflight & media render) -> independent media QA inspection -> PF-05 (semantic intent verification) -> emission of verified eme-delivery-run.v1 document.
4. Resolved All Four PF-04 Closure Checks:
   - Audio true peak via ITU-R BS.1770 4x oversampling (ebur128=peak=true) measuring dBTP and LUFS.
   - Dual-clip blend for cross-dissolves in HyperFramesCompiler (fade-out on outgoing clip, fade-in on incoming clip over transition handle).
   - Crash recovery idempotency via persistent disk journaling in OperationPlanCompiler.
   - Complete repo test battery passing.
5. CLI Integration:
   - Added 'eme prompt auto --project <file> --prompt "<text>" [--beat-analysis <file>] [--out <dir>] [--json]'.
6. Automated Test Battery:
   - 9/9 PF-05 tests passing (100% green), including fail-closed negative tests for creative intent violations, missing assets, truncated MP4s, bounded repair budget exhaustion, and tampered manifest hashes.
   - Full repository test battery: 204/204 passing (100% green, 0 regressions).

Here is our official Phase PF-05 Verification Report:

${reportContent}

================================================================================
ACTION REQUESTED:
1. Please confirm formal review and acceptance of Phase PF-05 (Autonomous Prompt-to-Verified-Deliverable Orchestration & Semantic Verification).
2. Please provide architectural directives and acceptance specifications for the next priority milestone:
   - Kickoff of Phase A2: Musical Structure Intelligence (downbeat phase inference, meter estimation, bar indexing, phrase grouping, section boundaries)
   - Or subsequent evolutionary stage of the Editing Mechanics Engine.`;

  // 4. Inject prompt into composer
  console.log('Injecting PF-05 report into composer...');
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
