/**
 * Ezra Bridge Script: Submit Phase 20 Completion Report to ChatGPT Architecture Lead
 * and retrieve official milestone certification and next phase directive.
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
  console.log('1. Preparing Phase 20 Completion Report Submission Prompt...');

  const reportPath = path.join(__dirname, '../plans/PHASE_20_COMPLETION_REPORT.md');
  const reportContent = fs.readFileSync(reportPath, 'utf8');

  const promptAnchor = "Phase 20 Completion Report Revision 8 & Final Milestone Certification Request";

  const promptText = `Dear ChatGPT Architecture Lead,

We have completed the implementation, audit, and regression testing for **Gate 20-D: Manifest-Certified QA Report ID Binding, Fail-Safe Handling, and Reconciled Release Provenance** in strict compliance with your Architecture Closure Directive (Revision 7).

### Comprehensive Resolution of Directive Revision 7:

1. **Gate 20-D.A (Manifest as Sole Authority for Report-ID Binding)**:
   - In \`normalizePersistedJob(job)\`, removed \`job.artifacts?.qa_report_id\` as an independent source of QA identity.
   - A report ID establishes QA binding **exclusively** when certified directly by the manifest itself (\`manifestObj.qa_certification?.report_id || manifestObj.qa_report_id\`).
   - If a QA report relies solely on its report ID and that ID is absent from the manifest, normalization strictly returns \`NEEDS_RECONCILIATION\`.
   - Alternative binding paths (explicitly typed matching \`delivery_run_id\`, \`media_path\`, or SHA-256 digest on the QA report) remain fully supported and verified.

2. **Dedicated Lifecycle Invariant Tests (\`LIFECYCLE-29\` & \`LIFECYCLE-30\`)**:
   - Expanded \`tests/workflow-stage20-6-canonical-lifecycle-invariant.test.js\` to 30 tests (**30 / 30 PASS** in 150.9ms), specifically adding:
     - \`LIFECYCLE-29\`: A matching \`qa_report_id\` found only in \`job.artifacts\` cannot authorize \`SUCCEEDED\` when absent from the manifest (strictly yields \`NEEDS_RECONCILIATION\`).
     - \`LIFECYCLE-30\`: A QA report ID matching the manifest's certified report ID safely authorizes normalization to \`SUCCEEDED\` when all other delivery and score criteria are met.

3. **Reconciled Release Provenance**:
   - Candidate commit, package size, and SHA-256 digest are strictly synchronized across all artifacts and reports:
     - **Authoritative Candidate Commit**: \`cf048418a04e2b1c095b8ca388974dc0ff4348d5\`
     - **Distribution Package**: \`dist/editing-mechanics-engine-0.1.0-rc1.tgz\` (371,608 Bytes, 161 clean files, 0 dev/test files)
     - **Package SHA-256**: \`dece27083ac2823a62480f6554b982e6b5e6df99c7097bcd0a321647a51edd39\`
     - **Standalone Checksum**: \`dist/editing-mechanics-engine-0.1.0-rc1.tgz.sha256\` (byte-for-byte exact match)
     - **Clean Working Tree**: Pure Node.js core runtime with zero external runtime npm dependencies (\`dependencies: {}\`).

4. **Complete Test Battery Verification**:
   - **Phase 20 Test Battery**: **59 / 59 PASS** across 6 dedicated test suites.
   - **Master Regression Battery**: **607 / 607 PASS (Exit Code: 0, 0 Failures)** across all 12 test suites.

---

### Complete Phase 20 Completion Report (Revision 8) (\`plans/PHASE_20_COMPLETION_REPORT.md\`):

\${reportContent}

---

### Request to Architecture Lead:
With report-ID-only binding accepted exclusively through manifest certification, 30 canonical lifecycle tests, 59 Phase 20 tests, and 607 passing master regression tests, we respectfully request final architecture milestone certification for **Phase 20** and authorization to commence **Phase 21: Production Readiness, Security Hardening & Controlled Rollout**.`;

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

  console.log('3. Injecting Phase 20 completion report submission into composer...');
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
  console.log('   Send Button:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    console.log('   Fallback: pressing Enter key...');
    const enterScript = `
tell application "System Events"
  key code 36
end tell`;
    spawnSync('osascript', ['-'], { input: enterScript, encoding: 'utf8' });
  }

  console.log('5. Awaiting ChatGPT Phase 20 Milestone Certification & Next Directive...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '', hasUserPrompt: false });
      const text = scroll.innerText || '';

      const userMarker = "Phase 20 Completion Report Revision 8";
      const userIdx = text.lastIndexOf(userMarker);
      if (userIdx === -1) {
        return JSON.stringify({ isGenerating, len: 0, text: '', hasUserPrompt: false });
      }

      const marker = "ChatGPT said:";
      const mIdx = text.indexOf(marker, userIdx);
      if (mIdx === -1) {
        return JSON.stringify({ isGenerating, len: 0, text: '', hasUserPrompt: true, hasResponse: false });
      }

      let responseText = text.slice(mIdx + marker.length).trim();
      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        hasUserPrompt: true,
        hasResponse: true,
        len: responseText.length,
        snippet: responseText.slice(0, 150),
        text: responseText
      });
    })()`);

    try {
      const data = JSON.parse(checkRes);
      if (data.hasUserPrompt && data.hasResponse && !data.isGenerating && data.len > 200) {
        console.log(`\n✅ Phase 20 Certification received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`   [Attempt ${attempt + 1}/120] PromptFound=${data.hasUserPrompt}, ResFound=${data.hasResponse}, Generating=${data.isGenerating}, len=${data.len || 0}...\r`);
      }
    } catch (e) {
      process.stdout.write(`   [Attempt ${attempt + 1}/120] waiting...\r`);
    }
  }

  if (completed && finalMarkdown) {
    const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE20_FINAL_CERTIFICATION.md');
    fs.writeFileSync(outPath, finalMarkdown, 'utf8');
    console.log(`\n✅ Saved Architecture Lead certification to: ${outPath}`);
  } else {
    console.error('\n❌ Timed out waiting for ChatGPT certification response.');
  }
}

main().catch(console.error);
