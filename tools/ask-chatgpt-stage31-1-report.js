/**
 * Ezra Bridge Script: Submit Stage 31.1 Protocol Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 31.1 Protocol Report Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../artifacts/phase-31/stage-31.1/stage-report.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 31.1 Corpus Definition, Ground Truth, and Benchmark Protocol Report)";

  const promptText = `${promptAnchor},

In accordance with your formal authorization in \`plans/CHATGPT_PHASE30_CERTIFICATION.md\` and the approved \`plans/CHATGPT_PHASE31_DIRECTIVE.md\`, we have completed and verified **Stage 31.1: Corpus Definition, Ground Truth, and Benchmark Protocol** on branch \`feature/phase-31-real-project-validation\` at commit \`200f645\`.

### Entry Gate Verification
- Predecessor Release: \`phase-30-certified\` (commit \`4075748615cf14716d35d7922276ad2a3fd442a3\`, merged into \`main\`).
- Predecessor Regression Battery: **338 / 338 PASS (100%)**.
- Entry gate artifact: \`artifacts/phase-31/baseline/phase-30-entry-gate.json\` verified.

### Stage 31.1 Deliverables & Architecture Invariants
1. **Corpus Inventory (\`corpus-inventory.json\`)**: 6 diverse real-world projects spanning social motion graphics (\`benchmark-a\`, 12s, 60fps, 9:16), cinematic commercial reel (\`cinematic_ad\`, 20s, 24fps, 16:9), multi-track VFX compositing (\`benchmark-b\`, 8s, 60fps, 9:16), creator social reel audio defects (\`qa-audio-defects\`, 10s, 30fps), narrative dramatic dialogue (\`manoj-bajpayee-150-edit\`, 15s, 24fps), and pristine reference control (\`creator_reel\`, 20s, 60fps).
2. **Defect Taxonomy (\`defect-taxonomy.json\`)**: Maps all 10 mandatory families (Timeline Structure, Synchronization, Audio Level, Audio Continuity, Transitions, Sidecar Metadata, Structural Consistency, False-Positive Controls, Ambiguous Cases, Unsupported Cases).
3. **Independent Ground-Truth Protocol (\`ground-truth-protocol.json\`)**: Independent reference verification; zero circular reliance on EME predictions; explicit timestamp intervals and microsecond tolerances.
4. **Frozen Benchmark Scoring Spec (\`benchmark-scoring-spec.json\`)**: Fixed quantitative thresholds (Precision >= 0.90, Recall >= 0.85, IoU >= 0.80, True Peak <= -1.0 dBTP, zero collateral diff).
5. **Support and Limitation Matrix (\`support-limitation-matrix.json\`)**: Explicit supported vs unsupported capabilities.
6. **Frozen Manifest (\`frozen-benchmark-manifest.json\`)**: Sealed with cryptographic SHA-256 digests.
7. **Test Suite (\`tests/workflow-stage31-1-protocol.test.js\`)**: **8 / 8 PASS (100%)**.
8. **Cumulative Regression**: **346 / 346 PASS (100%)** (338 predecessor + 8 Stage 31.1).

Below is the complete **Stage 31.1 Completion Report**:

${reportContent}

---

### Action Requested from Architecture Lead
1. Formally review and grant unconditional **Stage 31.1 Acceptance**.
2. Freeze the benchmark protocol and grant formal authorization to proceed to **Stage 31.2: Representative Project Corpus and Defect Taxonomy**.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 31.1 Report into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 31.1 Decision...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 31.1 DECISION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE31_1_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nDecision saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
