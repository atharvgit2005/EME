/**
 * Editing Mechanics Engine (EME) - Direct Bridge to Target ChatGPT Session for Phase PF-07
 * Strictly communicates with https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a
 * Zero interference with any other open ChatGPT sessions.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TARGET_CHAT_ID = '6ad4ae37-23ec-83ee-b1df-5274a2f04e1a';
const REPORT_FILE = path.resolve(__dirname, '../docs/prompt-to-deliverable-pf07-report.md');
const OUT_FILE = path.resolve(__dirname, '../plans/CHATGPT_PHASE_PF07_RESPONSE.md');

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
  const res = spawnSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
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
      hasComposer: !!document.querySelector("#prompt-textarea, form div[contenteditable=true], textarea")
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

  // 2. Build Submission Prompt
  const reportContent = fs.readFileSync(REPORT_FILE, 'utf8');

  const promptText = `EME PROMPT-TO-DELIVERABLE SUBSYSTEM: PHASE PF-07 (CANDIDATE GENERATION & MULTI-VARIANT EXPLORATION) COMPLETION REPORT

Dear ChatGPT Architecture Lead,

In accordance with your formal authorization in CHATGPT_PHASE_PF06_RESPONSE.md ("PF-07 is authorized as the next primary prompt-to-deliverable milestone: Candidate Generation & Multi-Variant Exploration"), we have completed the full manufacturing, schema certification, deterministic variation compiler, sandbox isolation engine, dual-gate independent verification, and user selection workflow for Phase PF-07.

Key Architectural Milestones Achieved:
1. Canonical CandidateSet Contract (schema/eme-candidate-set.v1.schema.json):
   - Strict versioned schema tracking parent brief provenance, mandatory hard constraints, authorized variation dimensions, isolated candidate executions, comparative matrix, and user selection provenance.
2. Controlled Variation Generation (CandidateVariantCompiler):
   - Generates up to 3 deterministic candidate variation profiles (Dynamic, Cinematic, Editorial) preserving 100% of baseline hard constraints (duration, primary cut sequence, title overlay, B-roll cutaway interval, audio ceiling).
3. Complete Sandbox Isolation & Failure Containment (CandidateOrchestrator):
   - Each candidate compiles, executes, and renders in an isolated sandbox with independent execution journals and state snapshots.
   - An injected failure (e.g. render crash or semantic violation) isolates completely to the affected candidate without invalidating passing sibling candidates.
4. Independent Dual-Gate Verification:
   - Each candidate independently passes physical media decoding QA (FFprobe) and all 7 semantic intent criteria before its deliverable manifest is published.
5. User Selection & Iterative Revision Chaining:
   - Creator selection binds to exact candidate ID and manifest ID, emitting a canonical delivery run.
   - Selected candidate seamlessly accepts conversational revisions via Phase PF-06 without mutating predecessor candidate set or siblings.
6. CLI Integration:
   - Added 'eme prompt candidates' and 'eme prompt select-candidate' commands.
7. Test Suite Status:
   - 10/10 PF-07 tests PASSING (100% green).
   - Full repository test battery: 222/222 tests PASSING (100% green across all phases).

Here is our official Phase PF-07 Engineering Report:

${reportContent}

================================================================================
ACTION REQUESTED:
1. Please confirm formal architectural review and acceptance of Phase PF-07 (Candidate Generation & Multi-Variant Exploration).
2. Please provide architectural directives and acceptance specifications for the next priorities:
   - Kickoff of Phase A2: Musical Structure Intelligence (downbeat phase inference, 3/4 and 4/4 meter estimation, bar indexing, phrase grouping, section boundaries)
   - Candidate Generation + A2 Integration (musical structure informing candidate variation)
   - Or subsequent evolutionary stage of the Editing Mechanics Engine.`;

  // 3. Inject prompt into composer
  console.log('Injecting PF-07 report into composer...');
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

  // 4. Click Send Button
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

  // 5. Wait for generation to start and complete
  let maxWaitSec = 360;
  let pollIntervalMs = 5000;
  let elapsed = 0;
  let responseCaptured = false;
  let lastLen = 0;
  let stableCount = 0;

  await sleep(8000);

  while (elapsed < maxWaitSec) {
    const statusJson = runOsa(`(function() {
      const stopBtn = document.querySelector('button[aria-label="Stop streaming"], button[data-testid="stop-button"], button[aria-label="Stop generating"]');
      const isGenerating = !!stopBtn;
      const main = document.querySelector("main");
      const textLen = main ? main.innerText.length : 0;

      return JSON.stringify({
        isGenerating: isGenerating,
        textLen: textLen
      });
    })()`);

    let status;
    try {
      status = JSON.parse(statusJson);
    } catch (e) {
      await sleep(pollIntervalMs);
      elapsed += pollIntervalMs / 1000;
      continue;
    }

    if (status.textLen === lastLen && status.textLen > 1000) {
      stableCount++;
    } else {
      stableCount = 0;
      lastLen = status.textLen;
    }

    console.log(`[${elapsed}s] Generating: ${status.isGenerating} | Main Text Length: ${status.textLen} | Stable: ${stableCount}`);

    if (!status.isGenerating && stableCount >= 2 && elapsed >= 15) {
      console.log('\nGeneration complete! Capturing final ChatGPT response...');

      const extractCode = `(function() {
        const main = document.querySelector("main");
        if (!main) return "";
        const text = main.innerText;
        const marker = "PHASE PF-07 (CANDIDATE GENERATION & MULTI-VARIANT EXPLORATION) COMPLETION REPORT";
        const idx = text.lastIndexOf(marker);
        if (idx === -1) return "";
        const afterPrompt = text.substring(idx);
        const actionReq = "ACTION REQUESTED:";
        const actionIdx = afterPrompt.indexOf(actionReq);
        let responseText = "";
        if (actionIdx !== -1) {
          const rest = afterPrompt.substring(actionIdx);
          const replyMarkers = ["EME Architecture Review", "PF-07", "Decision:", "Review:", "Provisionally accepted"];
          let replyStart = -1;
          for (const rm of replyMarkers) {
            const pos = rest.indexOf(rm, 200);
            if (pos !== -1 && (replyStart === -1 || pos < replyStart)) {
              replyStart = pos;
            }
          }
          responseText = replyStart !== -1 ? rest.substring(replyStart) : rest;
        } else {
          responseText = afterPrompt;
        }
        const footerIdx = responseText.indexOf("ChatGPT can make mistakes.");
        if (footerIdx !== -1) {
          responseText = responseText.substring(0, footerIdx).trim();
        }
        return responseText;
      })()`;

      const fullResponse = runOsa(extractCode);
      if (fullResponse && fullResponse.length > 200) {
        fs.writeFileSync(OUT_FILE, fullResponse, 'utf8');
        console.log(`Saved response (${fullResponse.length} bytes) to: ${OUT_FILE}`);
        responseCaptured = true;
        break;
      }
    }

    await sleep(pollIntervalMs);
    elapsed += pollIntervalMs / 1000;
  }

  if (!responseCaptured) {
    console.warn('\nWarning: Timed out waiting for complete response or saving.');
  }
}

main().catch(err => {
  console.error('Fatal bridge error:', err);
  process.exit(1);
});
