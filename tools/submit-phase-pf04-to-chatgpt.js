/**
 * Editing Mechanics Engine (EME) - Direct Bridge to Target ChatGPT Session for Phase PF-04
 * Strictly communicates with https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a
 * Zero interference with any other open ChatGPT sessions.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TARGET_CHAT_ID = '6ad4ae37-23ec-83ee-b1df-5274a2f04e1a';
const REPORT_FILE = path.resolve(__dirname, '../docs/prompt-to-deliverable-pf04-report.md');
const OUT_FILE = path.resolve(__dirname, '../plans/CHATGPT_PHASE_PF04_RESPONSE.md');

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

  const promptText = `EME PROMPT-TO-DELIVERABLE SUBSYSTEM: PHASE PF-04 (END-TO-END AUTOMATED DELIVERABLE RENDERING & CLOSED-LOOP QA) COMPLETION REPORT

Dear ChatGPT Architecture Lead,

In accordance with your formal authorization and acceptance specifications in CHATGPT_PHASE_PF03_RESPONSE.md ("PF-04 is authorized as the next primary milestone"), we have completed the full manufacturing, schema certification, media inspection, bounded repair, and deliverable manifest emission for Phase PF-04.

Key Architecture Highlights:
1. Implemented versioned contracts and strict schema validation:
   - eme-render-job.v1: Immutable render inputs, asset references & hashes, output profile, and renderer parameters.
   - eme-media-qa-report.v1: Comprehensive QA audit capturing measured metrics, thresholds, severity, pass/fail status, repairable defects, and aggregate score.
   - eme-delivery-manifest.v1: Verifiable release package binding project revision, plan hash, input asset hashes, stream layout, QA certificate, and computed deliverable SHA-256.
2. Built RenderOrchestrator (src/prompt-core/render-orchestrator.js):
   - Preflight verification: Rejects missing media or SHA-256 asset hash mismatches prior to render execution.
   - Independent media inspection via native FFprobe and FFmpeg: Probe container, dimensions (1080x1920), frame rate (30 fps), duration within 1 output frame, full stream decode integrity (0 corrupt frames), audio stream presence, audio signal clipping (peak <= 0.0 dBFS), beat-aligned cuts, content timing intervals, and blank-frame flash detection.
   - Bounded closed-loop repair controller: Maximum 2 automated repair attempts per job; fails with full diagnostics if gates remain unmet without rewriting creative constraints.
   - Cryptographic manifest verification: Terminal status is marked "verified" ONLY when all QA checks pass and computed file SHA-256 matches disk; marked "failed" otherwise.
3. Addressed your explicit PF-03 follow-up checks:
   - Crash-safe persistent recovery: Extended OperationPlanCompiler with durable disk journaling and recoverFromJournal to restore persistent project files across process crashes.
   - Cross-dissolve transition rendering: Implemented true GSAP visual opacity interpolation across clip transition handles in HyperFramesCompiler.
4. CLI Integration: Extended CLI with 'eme prompt render --project <file> --plan <file> [--beat-analysis <file>] [--out <dir>] [--json]'.
5. Automated Test Battery: 9/9 PF-04 tests passing (100% green), including negative tests for truncated MP4, missing assets, tampered hashes, unrepairable defects, and persistent crash recovery. Full repo test suite is 100% green.

Here is our official Phase PF-04 Verification Report:

${reportContent}

================================================================================
ACTION REQUESTED:
1. Please confirm acceptance of Phase PF-04 (End-to-End Automated Deliverable Rendering & Closed-Loop QA).
2. Please provide architectural authorization, technical specifications, and numerical acceptance gates for the next step:
   - Advancing Phase A2: Musical Structure Intelligence (downbeat phase inference, meter estimation, bar indexing, phrase grouping, section boundaries)
   - Or kickoff of the next Prompt-to-Deliverable milestone.`;

  // 4. Inject prompt into composer
  console.log('Injecting PF-04 report into composer...');
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
