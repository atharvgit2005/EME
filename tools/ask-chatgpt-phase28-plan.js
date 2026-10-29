/**
 * Ezra Bridge Script: Submit Phase 28 Implementation Plan to ChatGPT Architecture Lead
 *
 * Interacts with ChatGPT Architecture Lead via the active Ezra bridge in Brave Browser
 * (thread: 6ad4ae37-23ec-83ee-b1df-5274a2f04e1a).
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
  console.log('1. Preparing Phase 28 Implementation Plan Submission Prompt...');

  const planContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_28_IMPLEMENTATION_PLAN.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 28 Implementation Plan Review & Authorization Request)";

  const promptText = `${promptAnchor},

Following your unconditional certification of **Milestone Phase 27** and formal merge/tag authorization in \`plans/CHATGPT_PHASE27_FINAL_RELEASE_CERTIFICATION.md\`:

---

### Phase 27 Formal Release Verification Ledger
1. **Annotated Release Tag \`phase-27-certified\` Created**:
   - Command: \`git tag -a phase-27-certified -m "Phase 27 certified release: Closed-Loop Audio Defect Repair & Automated Retiming" e53317ae7958a87dd17ae7aaaeecfdebd1a38a62\`
   - Peeled Target Verified: \`git rev-parse phase-27-certified^{}\` $\\to$ **\`e53317ae7958a87dd17ae7aaaeecfdebd1a38a62\`**
2. **Merge onto \`main\` Executed**:
   - Merge Commit: **\`38cd2ee801b9677a1d7f2b8027af25d2be74ef4a\`**
   - Verified Ancestry:
     * \`git merge-base --is-ancestor b8098ce35138c3e4a63a81bf7522a0fb00410f74 main\` $\\to$ **Exit code 0**
     * \`git merge-base --is-ancestor e53317ae7958a87dd17ae7aaaeecfdebd1a38a62 main\` $\\to$ **Exit code 0**
3. **Post-Merge Cumulative Regression Battery on \`main\`**:
   - Total Tests: **212 / 212 PASS (100% Zero Regressions)** across Phases 21–27 in 18.14s.

---

### Phase 28 Kickoff & Implementation Plan

In strict accordance with your Phase 28 kickoff recommendations:
**Execution Directive**: \`“Use required GSD actions to achieve the goals and wherever needed.”\`

We have initialized branch **\`feature/phase-28-repair-policy-orchestration\`** and authored the comprehensive implementation plan for **Milestone Phase 28: Repair Policy, Conflict Resolution & Multi-Pass Orchestration**:

- **Stage 28.1**: Proposal Conflict Detector & Dependency Graph (\`RepairConflictDetector\`, schema \`audio-repair-policy.v1.json\`)
- **Stage 28.2**: Multi-Pass Repair Orchestrator & Bounded Pass Engine (\`MultiPassRepairOrchestrator\`, \`maxPasses = 3\`, fresh QA re-evaluation per pass)
- **Stage 28.3**: Anti-Oscillation & Convergence Guard (\`RepairConvergenceGuard\`, sign-reversal detection, cumulative shift caps)
- **Stage 28.4**: Conflicting Defect Certification Scenario (Controlled fixture with dual conflicting repairs: Clip A sync offset vs adjacent Clip B interval collision, testing policy resolution and safe halt to \`NEEDS_RECONCILIATION\`)
- **Stage 28.5**: Closed-Loop Multi-Pass End-to-End Verification & Cumulative Regression (Multi-pass sequence + 242+ tests)

Here is the complete implementation plan document:

---

### Phase 28 Implementation Plan Document
${planContent}

---

### Action Requested from Architecture Lead
1. Review the proposed implementation architecture, conflict classification, and anti-oscillation controls.
2. Confirm the 30 planned discrete subtests (35 Node reported results) and target cumulative matrix (242 discrete / 247 Node reported).
3. Authorize the kickoff of Phase 28 and grant approval to proceed with **Stage 28.1**.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Phase 28 Plan prompt into ChatGPT input box...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('.composer-NYb0tQ [contenteditable="true"]') ||
               document.querySelector('.RichTextInput-j_tVa5 [contenteditable="true"]') ||
               document.querySelector('[data-composer-body] [contenteditable="true"]') ||
               document.querySelector('#prompt-textarea');
    if (!el) return JSON.stringify({ error: 'NO_COMPOSER_ELEMENT' });

    el.focus();
    const prompt = ${JSON.stringify(promptText)};

    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
    document.execCommand('delete', false);
    document.execCommand('insertText', false, prompt);

    return JSON.stringify({ success: true, length: el.innerText.length });
  })()`);
  console.log('   Injection:', injectRes);

  await sleep(1000);

  console.log('4. Clicking Send button...');
  const sendRes = runOsa(`(() => {
    const btn = document.querySelector('button[aria-label="Send"]') ||
                document.querySelector('button[data-testid="send-button"]') ||
                document.querySelector('button[aria-label*="Send"]');
    if (!btn) return "NO_SEND_BUTTON";
    btn.click();
    return "CLICKED_SEND";
  })()`);
  console.log('   Send:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    console.error('Failed to click send button. Send result:', sendRes);
    process.exit(1);
  }

  console.log('5. Awaiting ChatGPT Architecture Lead Phase 28 Plan Review Decision...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;

      const main = document.querySelector('main') || document.body;
      const text = main ? main.innerText : '';

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        return JSON.stringify({ isGenerating, pIdx: -1, len: 0, text: '' });
      }

      const afterPrompt = text.slice(pIdx);
      let responseText = '';
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx !== -1) {
        responseText = afterPrompt.slice(mIdx + marker.length).trim();
      } else {
        responseText = afterPrompt.slice(${JSON.stringify(promptAnchor)}.length).trim();
      }

      const footerMarkers = [
        "ChatGPT can make mistakes.",
        "Meet Codex in the desktop app",
        "A coding agent that helps you build and ship"
      ];
      for (const f of footerMarkers) {
        const fIdx = responseText.lastIndexOf(f);
        if (fIdx !== -1) {
          responseText = responseText.slice(0, fIdx).trim();
        }
      }

      return JSON.stringify({
        isGenerating,
        pIdx,
        len: responseText.length,
        snippet: responseText.slice(-200),
        text: responseText
      });
    })()`);

    let parsed = {};
    try {
      parsed = JSON.parse(checkRes);
    } catch (e) {
      console.log(`   [Attempt ${attempt + 1}/90] Waiting... (parse error: ${checkRes.slice(0, 60)})`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/90] isGenerating: ${parsed.isGenerating}, len: ${parsed.len}`);
    if (parsed.snippet) {
      console.log(`      Snippet: ${parsed.snippet.replace(/\n/g, ' ')}...`);
    }

    if (!parsed.isGenerating && parsed.len > 400 && attempt >= 3) {
      completed = true;
      finalMarkdown = parsed.text;
      break;
    }
  }

  if (!completed) {
    console.error('ERROR: Timed out waiting for ChatGPT Architecture Lead response.');
    process.exit(1);
  }

  console.log('\n=================================================================');
  console.log('✅ CHATGPT ARCHITECTURE LEAD PHASE 28 PLAN DECISION RECEIVED:');
  console.log('=================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE28_PLAN_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
