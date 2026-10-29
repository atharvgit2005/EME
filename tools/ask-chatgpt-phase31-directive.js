/**
 * Ezra Bridge Script: Request Phase 31 Architecture Directive from ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 31 Architecture Directive Request Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 31 Directive Request)";

  const promptText = `${promptAnchor},

The formal Phase 30 directive has been received, locked, and recorded in the repository at \`plans/CHATGPT_PHASE30_DIRECTIVE.md\` (covering all six stages 30.1–30.6, synthetic fault injection, and real-project benchmarks with strict safety gates).

Per our engineering roadmap progression through Phase 31 (and stopping at Phase 31, without expanding into Phase 32 or 33 at this time), please now produce the formal Architecture Lead specification and execution directive for:

**Phase 31: Real-Project Validation & Diverse Defect Benchmark**

Please provide the complete, formal engineering directive including:
1. **Architectural Scope, Mission & Success Definition**: Define the mission of benchmarking EME on diverse editing projects and defect classes in non-destructive / shadow-evaluation mode.
2. **Stage-by-Stage Breakdown**: Formal numbered stages (e.g. Stages 31.1 through 31.6) with objectives, required work, and acceptance criteria.
3. **Representative Editing Project Corpus & Defect Taxonomy**: Selection criteria for real editing projects (varying timeline lengths, track counts, sync/drift defects, audio levels, transitions, sidecar metadata) and defect classes.
4. **Canonical Architecture Invariant Preservation**: Strict enforcement of the 18 frozen schemas, 120,000 ticks/sec timebase, \`OperationExecutor\` mutation authority, active delivery safety, zero runtime npm dependencies, and canonical job states.
5. **Execution Modes & Validation Methodology**: Baseline capture, non-destructive shadow evaluation, comparison against expected outcomes, and real audio render & Earshot QA verification.
6. **Evidence Bundle Layout & Artifact Specification**: Structure for benchmark records, manifests, checksums, and regression evidence.
7. **Strict Pass/Fail & Certification Policy**: Release gates, blocking conditions, and go/no-go requirements for Phase 31 certification.
8. **Required GSD Actions**: Required GSD workflows and actions wherever needed.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Phase 31 Directive Request into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Phase 31 Directive generation...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 120; attempt++) {
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
      console.log(`   [Attempt ${attempt + 1}/120] Waiting... (parse error: ${checkRes.slice(0, 60)})`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/120] isGenerating: ${parsed.isGenerating}, len: ${parsed.len}`);
    if (parsed.snippet) {
      console.log(`      Snippet: ${parsed.snippet.replace(/\n/g, ' ')}...`);
    }

    if (!parsed.isGenerating && parsed.len > 1000 && attempt >= 4) {
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD PHASE 31 DIRECTIVE RECEIVED:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown.slice(0, 500) + '...\n');

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE31_DIRECTIVE.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved Phase 31 directive to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
