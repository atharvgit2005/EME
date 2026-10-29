/**
 * Ezra Bridge Script: Submit Phase 19 (RT-01) Stage 19.1 Completion Report & Request Stage 19.2 Directive
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
  console.log('1. Preparing Stage 19.1 Completion Report Submission Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_19_STAGE1_COMPLETION_REPORT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

We have completed **Stage 19.1: End-to-End Orchestration Integration & Lifecycle Hardening** in accordance with your Stage 19.1 Directive (\`plans/CHATGPT_STAGE19_0_AUDIT_REVIEW.md\`).

### Summary of Completed Gates & Certifications:
1. **Canonical 12-State Lifecycle & Authority**:
   - \`OrchestrationJobManager\` (\`src/prompt-core/job-orchestrator.js\`) is established as the sole active runtime authority.
   - Enforced 12 canonical states (\`ACCEPTED\`, \`PLANNING\`, \`AWAITING_APPROVAL\`, \`READY_TO_EXECUTE\`, \`EXECUTING\`, \`VERIFYING\`, \`RENDERING\`, \`PUBLISHING\`, \`SUCCEEDED\`, \`FAILED\`, \`CANCELLED\`, \`NEEDS_RECONCILIATION\`).
   - Legacy aliases (\`COMMITTED\`, \`COMPLETED\`) normalize immediately to \`SUCCEEDED\`; \`RECOVERING\` is modeled as metadata under \`NEEDS_RECONCILIATION\`.
   - Terminal states (\`SUCCEEDED\`, \`FAILED\`, \`CANCELLED\`) are strictly immutable and resist late callbacks.
2. **Approval vs. Clarification Contract**:
   - \`awaitingReason: 'approval'\` verifies plan hash and base revision currency before transitioning to \`READY_TO_EXECUTE\`.
   - \`awaitingReason: 'clarification'\` halts contradictory constraints, ambiguous references, or missing assets without project mutation; submitting clarification payload safely transitions the job back to \`PLANNING\`.
3. **Manual Timeline VCS Lineage Synchronization**:
   - Direct Visual Control Surface edits (\`POST /api/project/operation\`, \`undo\`, \`redo\`) append committed \`manual_vcs\` revision nodes to \`session.history\`, advance \`concurrency.version\`, and record snapshots.
   - \`session.active_delivery\` is preserved untouched until a verified render passes.
   - Subsequent automated prompt workflows build on the manual revision snapshot and reject stale base revisions with 409 \`STALE_REVISION\`.
4. **Orderly Cancellation & Transaction Rollback**:
   - Pre-execution cancellation yields terminal \`CANCELLED\` status with zero disk or project mutation.
   - Compound plan execution guarantees atomic candidate rollback (\`atomic: true\` $\to$ \`status: rolled_back\`, leaving canonical project untouched) and partial progress reporting (\`atomic: false\` $\to$ \`status: partially_executed_failed\`).
5. **HTTP Surface Completeness**:
   - Added \`POST /api/jobs/:jobId/approve\` and \`POST /api/jobs/:jobId/cancel\` alongside \`POST /api/jobs\` and \`GET /api/jobs/:jobId\`.
6. **Full Test Verification Matrix**:
   - New dedicated suite \`tests/workflow-stage19-1-orchestration.test.js\`: **18 / 18 PASS in 1.3s**.
   - Full master regression battery across 5 test suites: **50 / 50 PASS in 3.8s** with 0 regressions.

Here is the complete Stage 19.1 Completion Report (\`plans/PHASE_19_STAGE1_COMPLETION_REPORT.md\`):

---

${reportContent}

---

Please review our Stage 19.1 Completion Report and issue your formal review and architectural directive for **Stage 19.2: End-to-End Golden Workflows, Multi-turn Revision DAGs, and Cross-System Integration**.`;

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

  console.log('6. Awaiting ChatGPT Stage 19.1 Review & Stage 19.2 Directive in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Please review our Stage 19.1 Completion Report and issue your formal review";

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[data-testid="stop-button"], button[aria-label*="Stop"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';
      
      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        const marker = "ChatGPT said:";
        const mIdx = text.lastIndexOf(marker);
        if (mIdx !== -1) {
          let resp = text.slice(mIdx + marker.length).trim();
          const footerIdx = resp.lastIndexOf("ChatGPT can make mistakes.");
          if (footerIdx !== -1) resp = resp.slice(0, footerIdx).trim();
          return JSON.stringify({ isGenerating, len: resp.length, snippet: resp.slice(0, 150), text: resp });
        }
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
        console.log(`\n✅ Stage 19.1 Review & Stage 19.2 Directive received! (${data.len} characters)`);
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

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE19_1_COMPLETION_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Phase 19 Stage 19.1 Review & Stage 19.2 Directive

**Date**: ${new Date().toISOString()}  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.1 Review  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 19.1 Review to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
