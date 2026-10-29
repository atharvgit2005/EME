/**
 * Ezra Bridge Script: Submit Stage 30.3 Completion Report to ChatGPT Architecture Lead
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
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  return (res.stdout || "").trim();
}

async function main() {
  console.log('1. Preparing Stage 30.3 Completion Report Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../artifacts/phase-30/stage-30.3/stage-report.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 30.3 Concurrency, Fencing, and Idempotency Completion Report)";

  const promptText = `${promptAnchor},

In accordance with your formal authorization in \`plans/CHATGPT_STAGE30_2_FINAL_ACCEPTANCE.md\`, we have implemented and fully verified **Stage 30.3: Concurrency, Fencing, and Idempotency** on branch \`feature/phase-30-production-reliability\` at commit \`d7b91c6\`.

### Cumulative Test Accounting (Audit-Corrected)
- Predecessor Regression (Phases 21-29): **289 / 289 PASS (100%)**
- Stage 30.1 Failure Model: **7 / 7 PASS**
- Stage 30.2 Crash Recovery (unit): **9 / 9 PASS**
- Stage 30.2 Real-Process Crash (\`RPC-01..04\`): **4 / 4 PASS**
- Stage 30.3 Concurrency & Fencing (\`CNC-01..08\`): **8 / 8 PASS**
- **Phase 30 Total Tests**: **28 / 28 PASS**
- **Combined Repository Total**: **317 / 317 PASS (100%)**

### Key Concurrency Invariants Implemented & Verified (\`src/orchestration/fencing-idempotency-guard.js\`)
1. **Durable Idempotency (\`FI-09\` / \`CNC-01\`)**: Concurrent duplicate requests bearing identical idempotency keys execute authoritative mutations exactly once. Concurrent duplicates are served from durable disk journals via atomic file renames without side effects.
2. **Authoritative Commit Boundary Fencing (\`FI-10\` / \`CNC-02\`)**: Fencing tokens are evaluated directly at the commit gate. A stale worker attempting a commit after a lease or token supersession is rejected fail-closed with \`STALE_FENCING_TOKEN\`.
3. **Monotonic Token Progression (\`CNC-03\`)**: Fencing tokens strictly increment monotonically (\`1 < 2 < 3...\`). Only the highest active token holder is authorized to commit.
4. **Hierarchical Lock Ordering (\`CNC-04\`)**: Enforces strict two-phase locking order: Session Lock (\`session_<id>.lock\`) acquired before Job Lock (\`job_<id>.lock\`), and released in strict reverse order (\`Job Lock -> Session Lock\`) using native \`fs.openSync(..., 'wx')\` exclusive primitives. Deadlocks prevented; conflict rollbacks clean.
5. **Fail-Closed Ambiguous Liveness (\`FI-11\` / \`CNC-05\`)**: Lock ownership evaluation handles corrupt lock metadata and missing process ownership by failing closed into \`NEEDS_RECONCILIATION\`, prohibiting unsafe lock reclamation unless process death (\`ESRCH\`) is conclusively proven.
6. **Cross-Session Isolation (\`FI-18\` / \`CNC-06\`)**: Parallel execution of independent sessions runs without state leakage or lock interference; cross-session fence access is rejected with \`OWNERSHIP_MISMATCH\`.
7. **Late Callback Resolution (\`CNC-07\`)**: Callbacks from expired or superseded attempts are identified and rejected fail-closed (\`SUPERSEDED_ATTEMPT\`), preventing revival of or corruption to active or terminal jobs.
8. **Idempotent Compensation Gating (\`CNC-08\`)**: Compensations are journaled and guaranteed to execute at most once per unique compensation key.

Below is the complete **Stage 30.3 Completion Report**:

${reportContent}

---

### Action Requested from Architecture Lead
1. Formally review and grant unconditional **Stage 30.3 Acceptance**.
2. Grant formal authorization to proceed to **Stage 30.4: Artifact Integrity, Compensation, and Reconciliation**.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 30.3 Report into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 30.3 Decision...');
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

    if (!parsed.isGenerating && parsed.len > 300 && attempt >= 3) {
      completed = true;
      finalMarkdown = parsed.text;
      break;
    }
  }

  if (!completed) {
    console.error('ERROR: Timed out waiting for ChatGPT Architecture Lead response.');
    process.exit(1);
  }

  console.log('\n=============================================================================');
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 30.3 DECISION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE30_3_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nDecision saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
