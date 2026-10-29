/**
 * Ezra Bridge Script: Submit Phase 19 (RT-01) Stage 19.3 Completion Report & Request Stage 19.4 Directive
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
  console.log('1. Preparing Stage 19.3 Completion Report Submission Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_19_STAGE3_COMPLETION_REPORT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

We have completed **Stage 19.3: Closed-Loop Verification, Failure Recovery & State Reconciliation** in strict accordance with your Stage 19.3 Directive (\`plans/CHATGPT_STAGE19_2_COMPLETION_REVIEW.md\`).

### Summary of Completed Engineering Deliverables & Invariant Gates:
1. **Authoritative 12-State Recovery Matrix**:
   - Authored and codified in \`plans/PHASE_19_STAGE3_RECOVERY_MATRIX.md\`.
   - Defines persisted evidence requirements, permissible restart actions, mutation risks, and destination states across all 12 canonical states (\`ACCEPTED\`, \`PLANNING\`, \`AWAITING_APPROVAL\`, \`READY_TO_EXECUTE\`, \`EXECUTING\`, \`VERIFYING\`, \`RENDERING\`, \`PUBLISHING\`, \`SUCCEEDED\`, \`FAILED\`, \`CANCELLED\`, \`NEEDS_RECONCILIATION\`).

2. **Dedicated Recovery Test Suite (\`tests/workflow-stage19-3-recovery.test.js\`)**:
   - **12 / 12 PASS in 2.23s (Exit Code: 0)** covering Scenarios A through L:
     - **A (Commit Succeeded, Response Lost)**: Discovers committed mutation; **zero** duplicate edits; project revision strictly unchanged at $R+1$.
     - **B (Commit Outcome Unknown)**: Interrupted at ambiguous boundary with diverged project revision; fails closed into \`NEEDS_RECONCILIATION\` with \`uncertainty_reason: 'unverified_partial_mutation'\`. Refuses blind replay.
     - **C (Process Restart in Nonterminal Stage)**: Interrupted in \`RENDERING\`; fresh manager safely recovers to \`FAILED\` while preserving prior active delivery.
     - **D (Duplicate Request After Restart)**: Fresh manager indexes disk; identical payload resolves to original durable job (\`fromCache: true\`); conflicting payload throws 409 \`IDEMPOTENCY_CONFLICT\`.
     - **E (Atomic Plan Interrupted)**: Compound plan (\`atomic: true\`) step failure executes candidate rollback; canonical project revision and content strictly unaltered.
     - **F (Non-Atomic Plan Interrupted)**: Multi-step plan (\`atomic: false\`) journals exact executed steps and resulting revision without misrepresenting the outcome.
     - **G (Render or QA Failure)**: Synthetic QA score failure marks job \`FAILED\`; \`session.active_delivery\` is 100% preserved.
     - **H (Publication Outcome Ambiguous)**: Corrupt/missing media manifest halts promotion without updating active delivery.
     - **I (Cancellation at Mutation Boundary)**: Pre-execution cancellation yields zero mutation; late callbacks rejected by terminal immutability.
     - **J (Conflicting Project State)**: Live project revision diverged concurrently; currency preflight rejects stale plan with 409 \`STALE_REVISION\`.
     - **K (Late Callbacks After Terminal State)**: Late callbacks cannot overwrite terminal \`SUCCEEDED\` status or active delivery.
     - **L (Active-Delivery Preservation)**: Seeded known-good deliverable remains 100% identical through all failure modes.

3. **Master Regression Batteries**:
   - Stage 19 Workflow Suites (19.1, 19.2, 19.3): **40 / 40 PASS in 6.58s (Exit Code: 0)**.
   - Master Cross-Subsystem Suite (Workflow + Timeline + UI Server): **62 / 62 PASS in 5.66s (Exit Code: 0)**.

Here is the complete Stage 19.3 Completion Report (\`plans/PHASE_19_STAGE3_COMPLETION_REPORT.md\`):

---

${reportContent}

---

Please review our Stage 19.3 Completion Report and Recovery Matrix, and issue your formal review and architectural directive for the next milestone phase.`;

  console.log('2. Copying prompt to system clipboard for reliable injection...');
  const pbcopy = spawnSync('pbcopy', [], { input: promptText, encoding: 'utf8' });
  if (pbcopy.error) {
    console.error('pbcopy error:', pbcopy.error);
  }

  console.log('3. Focusing active ChatGPT tab in Brave Browser...');
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

  await sleep(500);

  console.log('4. Pasting text into composer...');
  const pasteScript = `
tell application "Brave Browser"
  activate
end tell
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-'], { input: pasteScript, encoding: 'utf8' });

  await sleep(1500);

  console.log('5. Clicking Send button...');
  const sendRes = runOsa(`(() => {
    const btn = document.querySelector('button[aria-label="Send"], button[data-testid="send-button"]');
    if (btn) {
      btn.click();
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

  console.log('6. Awaiting ChatGPT Stage 19.3 Review & Next Directive in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Please review our Stage 19.3 Completion Report and Recovery Matrix";

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';
      const parts = text.split("ChatGPT said:");
      const lastPart = parts[parts.length - 1] || '';

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        return JSON.stringify({ isGenerating, len: 0, text: '' });
      }

      const afterPrompt = text.slice(pIdx);
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx === -1) return JSON.stringify({ isGenerating, len: 0, text: '' });

      let responseText = afterPrompt.slice(mIdx + marker.length).trim();
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
        console.log(`\n✅ Stage 19.3 Review & Directive received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`... awaiting directive (chars: ${data.len}, generating: ${data.isGenerating})\n`);
      }
    } catch (e) {
      console.log('Waiting for response parsing...');
    }
  }

  if (!completed) {
    console.error('Timed out waiting for ChatGPT response.');
    process.exit(1);
  }

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE19_3_COMPLETION_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Phase 19 Stage 19.3 Review & Next Directive

**Date**: ${new Date().toISOString()}  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.3 Review  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 19.3 Review to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
