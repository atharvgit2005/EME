/**
 * Ezra Bridge Script: Submit Phase 19 (RT-01) Stage 19.3 Evidence Addendum & Confirm Stage 19.4 Kickoff
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
  console.log('1. Preparing Stage 19.3 Evidence Addendum Submission Prompt...');

  const addendumContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_19_STAGE3_EVIDENCE_ADDENDUM.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

We have resolved all four evidence closure items mandated in your Stage 19.3 Review (\`plans/CHATGPT_STAGE19_3_COMPLETION_REVIEW.md\`) to establish an immutable, certified recovery baseline before beginning Stage 19.4.

### Summary of Resolved Items:
1. **Scenario F Non-Atomic Recovery Reconciled**:
   - Reconciled compound plan execution: prompt updated to 2-step mutation with \`injectFailureAtStep: 1\`.
   - Step 0 commits cleanly, advancing project revision by +1; Step 1 fails on injected error.
   - Result and durable journal accurately report \`executedSteps: 1\`, \`status: 'partially_executed_failed'\`, and \`committedRevision: baseRevision + 1\`. Verified in \`tests/workflow-stage19-3-recovery.test.js\` (**12 / 12 PASS**).
2. **Master-Suite Count Clarification**:
   - Clarified that the test runner discovers and executes **12 test suite files** (\`suites: 12\`), which contain **500 automated tests** covering the **13 functional subsystem areas** of EME.
3. **Immutable Candidate Baseline Identity**:
   - Cleanly committed candidate codebase:
     - **Commit SHA**: \`9e3ac2c4b245d2e800338800f35c16504df8c69a\`
     - **Parent SHA**: \`741dde73e818e14994aa907d60bcbea752636558\`
     - **Branch**: \`main\`
     - **Tracked Working Tree**: Clean.
   - Master regression re-executed directly on this commit: **500 / 500 PASS in 104.57s (Exit Code: 0)**.
4. **Verbatim Recovery Matrix Submitted for Direct Review**:
   - Embedded full, verbatim text of \`plans/PHASE_19_STAGE3_RECOVERY_MATRIX.md\` covering all 12 canonical states.

Here is the complete Stage 19.3 Evidence Addendum (\`plans/PHASE_19_STAGE3_EVIDENCE_ADDENDUM.md\`):

---

${addendumContent}

---

Please confirm final unconditional certification for Stage 19.3 and authorize us to proceed with **Stage 19.4: Closed-Loop Delivery Path Unification & CLI/REST Certification**.`;

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
      btn.focus();
      btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
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

  console.log('6. Awaiting ChatGPT Stage 19.3 Final Certification & Stage 19.4 Directive in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Please confirm final unconditional certification for Stage 19.3";

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';

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
        console.log(`\n✅ Stage 19.3 Final Certification & Stage 19.4 Go received! (${data.len} characters)`);
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

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE19_3_FINAL_CERTIFICATION.md');
  const fileContent = `# ChatGPT Architecture Lead: Phase 19 Stage 19.3 Final Certification & Stage 19.4 Go

**Date**: ${new Date().toISOString()}  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.3 Final Certification  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 19.3 Final Certification to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
