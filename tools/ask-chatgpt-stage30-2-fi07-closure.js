/**
 * Ezra Bridge Script: Submit FI-07 Targeted Resolution to ChatGPT Architecture Lead
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
  console.log('1. Preparing FI-07 Targeted Resolution Prompt...');

  const addendumContent = fs.readFileSync(path.join(__dirname, '../artifacts/phase-30/stage-30.2/stage-report-addendum.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 30.2 FI-07 Targeted Resolution & Final Acceptance Request)";

  const promptText = `${promptAnchor},

In direct response to your ruling in \`plans/CHATGPT_STAGE30_2_FINAL_APPROVAL.md\` (where EC-30.2-A was accepted and EC-30.2-B was partially accepted pending targeted closure of **FI-07: Crash after promotion**), we have implemented the dedicated real-process test **\`RPC-04\`** and reconciled the fault-traceability matrix on branch \`feature/phase-30-production-reliability\` at commit \`cc24eed\`.

### Summary of FI-07 Dedicated Real-Process Verification (\`RPC-04\`)
1. **Real Process Termination**: Spawned a dedicated OS child process executing \`real-crash-worker.js post-promotion\`.
2. **Pre-Crash Context**: Started with valid active delivery \`del_v1_existing\`, generated candidate \`candidate_v2.wav\`, verified fresh QA (\`true_peak: -6.3 dBTP\`, \`sync: 12 samples\`), generated manifest.
3. **Authoritative Promotion & Sudden Death**: Atomically committed candidate delivery to \`session.json\` (\`active_delivery = del_v2_promoted\`), printed \`POST_PROMOTION_BOUNDARY_REACHED\`, and was immediately terminated by OS signal **\`SIGKILL\`** (\`workerRes.signal === 'SIGKILL'\`) before acknowledgement.
4. **Separate Recovery Process**: Launched an independent Node.js process to reconstruct the outcome from durable records on disk.
5. **Observed Results**:
   - \`recovered_delivery_id: 'del_v2_promoted'\`
   - \`is_durable_promoted: true\`
   - \`artifact_valid: true\` (candidate file verified on disk, size > 0, SHA-256 matches manifest)
   - \`manifest_matches: true\`
   - \`qa_passed: true\`
   - \`false_rollback: false\` (zero false rollback to old delivery)
   - \`duplicate_promotion: false\` (zero duplicate promotion)
6. **Matrix Updated**: \`fault-traceability-matrix.json\` updated to map \`FI-07\` strictly and solely to \`RPC-04\` with verdict **PASS**.

Below is the complete **Updated Stage 30.2 Evidence Closure Addendum**:

${addendumContent}

---

### Action Requested from Architecture Lead
1. Formally review and grant unconditional **Stage 30.2 Acceptance**.
2. Grant formal authorization to proceed to **Stage 30.3: Concurrency, Fencing, and Idempotency**.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting FI-07 Resolution into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Stage 30.2 Decision...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 30.2 FINAL ACCEPTANCE DECISION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE30_2_FINAL_ACCEPTANCE.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
