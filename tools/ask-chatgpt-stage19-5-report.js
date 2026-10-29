/**
 * Ezra Bridge Script: Submit Phase 19 (RT-01) Stage 19.5 Completion Report & Request Final Milestone Release Certification
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
  console.log('1. Preparing Stage 19.5 Completion Report Submission Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_19_STAGE5_COMPLETION_REPORT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

We have completed **Stage 19.5: Clean Packaging, Distribution Artifacts & Production Release Gate** in strict accordance with your Stage 19.4 Completion Review and Stage 19.5 Directives.

### Mandatory Entry Gates & Verification Status:
1. **Gate A: Stage 19.3 Recovery Evidence Closure Addendum**:
   - Formally documented and closed all 5 sub-concerns:
     - 1. Deterministic lock acquisition order (\`[session_id].lock\` before \`job.lock\`) and cross-request exclusivity.
     - 2. In-lock revalidation guaranteeing committed revisions cannot be overwritten by stale in-flight requests.
     - 3. Prevention of non-atomic partial reporting (manifest and session persistence happen atomically under active delivery guarantee).
     - 4. Cancellation safely verified at all 5 lifecycle boundaries (\`validating\`, \`brief_ready\`, \`planning\`, \`rendering\`, \`evaluating_qa\`).
     - 5. 12-state recovery matrix explicitly resolved with zero ghost renders and zero corrupt state transitions.

2. **Gate B: Test Inventory & Measurement Reconciliations**:
   - Reconciled and documented the 4 distinct measurement dimensions:
     - **61 Test Files**: Discovered by \`npm test\` glob pattern \`tests/*.test.js tests/**/*.test.js\` (60 pre-existing + 1 new Stage 19.5 test file).
     - **12 Runner Suites**: The specific \`describe()\` blocks discovered by Node's test runner across 4 specific test files (\`laya-validation-checkpoints.test.js\` [1], \`timeline-stage18-2-operations.test.js\` [5], \`timeline-stage18-3-concurrency.test.js\` [1], \`timeline-stage18-4-delivery.test.js\` [5]).
     - **523 Individual Tests**: Actual unit and integration assertions executed (\`test()\` and \`it()\` execution blocks).
     - **14 Functional Subsystems**: Domain areas grouping the test suites across engine, planning, render, delivery, audio, timeline, UI, etc.

3. **Gate C: Immutable Release Candidate Identity**:
   - **Candidate Commit SHA**: \`6fd44eebcee27b3767c464752faedb094e16edad\`
   - **Parent Commit SHA**: \`7220db8bedb68423ada4c60ae39e9ed319c9c13f\`
   - **Tree State**: Clean working tree on main branch.

4. **Gate D: Full Repository Regression Battery**:
   - **523 / 523 PASS with 0 failures (Exit Code: 0)** via \`npm test -- --test-concurrency=1\`.

5. **Stage 19.5 Packaging Qualification Results (\`tests/workflow-stage19-5-packaging.test.js\`)**:
   - **10 / 10 PASS (Exit Code: 0)** executed strictly within an isolated extraction sandbox (\`artifacts/test_stage19_5_sandbox/package/\`) from the generated tarball:
     - **RT01-S5.A**: Packaged CLI executes correctly (\`eme --help\`, \`eme doctor\`, \`eme capabilities\`) and enforces contracts.
     - **RT01-S5.B**: Packaged HTTP server exposes expected routes (\`/api/timeline\`, \`/api/project/operation\`, \`/api/jobs\`) and rejects invalid requests.
     - **RT01-S5.C**: Packaged engine validates, mutates, and saves project preserving schema and 120,000 tps timebase.
     - **RT01-S5.D**: Preview rendering in packaged runtime isolates scratch media and leaves active_delivery untouched.
     - **RT01-S5.E**: Real final delivery from packaged candidate passes canonical closed loop with verified active_delivery and manifest.
     - **RT01-S5.F**: Sub-threshold QA and tampered manifest fail closed in packaged candidate.
     - **RT01-S5.G**: Packaged engine safely recovers interrupted rendering jobs across process restart.
     - **RT01-S5.H**: Packaged service returns cached deliverable on duplicate request and rejects conflicts.
     - **RT01-S5.I**: Prior active delivery strictly preserved across adversarial failures in packaged runtime.
     - **RT01-S5.J**: Packaged session manager persists sessions to disk and reloads accurately.

6. **Release Artifact & Provenance Record**:
   - **Tarball File**: \`dist/editing-mechanics-engine-0.1.0-rc1.tgz\`
   - **SHA-256 Checksum**: Standalone \`.sha256\` digest file and release manifest recorded in \`dist/\`.
   - **Zero Runtime Dependencies**: \`dependencies: {}\` in \`package.json\`; uses 100% native Node.js core modules.
   - **Strict Artifact Hygiene**: Development tests, scratch directories, temporary media, and git trees strictly excluded from package.

Here is the complete Stage 19.5 Completion Report (\`plans/PHASE_19_STAGE5_COMPLETION_REPORT.md\`):

---

${reportContent}

---

Please review our Stage 19.5 Completion Report and issue your final milestone sign-off for **Phase 19 (RT-01)**, confirming complete closure of the RT-01 milestone and authorizing transition to the next phase in our roadmap.`;

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

  await sleep(500);

  console.log('3. Injecting completion submission into div.ProseMirror[aria-label="Ask ChatGPT"]...');
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

  console.log('5. Awaiting ChatGPT Stage 19.5 Review & Final Milestone Certification...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Please review our Stage 19.5 Completion Report";

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
          responseText = afterPrompt.slice(${promptAnchor.length}).trim();
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
        console.log(`\n✅ Stage 19.5 Review & Final Milestone Certification received! (${data.len} characters)`);
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
    const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE19_5_COMPLETION_REVIEW.md');
    fs.writeFileSync(outPath, finalMarkdown, 'utf8');
    console.log(`\n✅ Saved Architecture Lead review to: ${outPath}`);
  } else {
    console.error('\n❌ Timed out waiting for ChatGPT review response.');
  }
}

main().catch(console.error);
