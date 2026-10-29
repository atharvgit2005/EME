/**
 * Ezra Bridge Script: Submit Phase 18 Stage 18.0 Integration Audit to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 18.0 Audit Submission Prompt...');

  const auditReport = fs.readFileSync(path.join(__dirname, '../plans/PHASE_18_STAGE0_INTEGRATION_AUDIT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

In accordance with your **Phase 18 Architecture Kickoff Directive (TL-01)**, we have completed the full repository inspection, source-to-display tracing, operation contract verification, and baseline benchmarking.

We have authored and committed the formal deliverable:
📁 **\`plans/PHASE_18_STAGE0_INTEGRATION_AUDIT.md\`**

Here is the complete Stage 18.0 Integration Audit report:

---

${auditReport}

---

### Key Highlights & Critical Decisions for Review:
1. **Separation of Concerns**: Confirmed that scrubbing, selection, zooming, scrolling, drag proposals, and snap guides reside strictly in transient UI state. Pointer gestures generate zero engine revisions until mouseup commit.
2. **Empirical Performance on 1,000-Clip Fixtures**:
   - View Projection: P50: 0.08 ms, P95: 0.87 ms (Budget: 16.67 ms / 60 FPS)
   - Magnetic Snap (2,001 snap points): P50: 0.067 ms, P95: 0.80 ms
   - Full Transaction Throughput: P50: 4.23 ms, P95: 6.82 ms
   - Full Regression Battery: 401 / 401 PASS in 83.0s.
3. **Identified Remediation Actions for Stage 18.1 & 18.2**:
   - **Scale Parity**: Standardize \`app.js\` to use \`TimelineAdapter\`'s constant 100 PPS scale (\`pixelsPerTick = (100.0 * zoom) / 120000\`) to eliminate duration-dependent time drift.
   - **Atomic Trim-In**: Ensure non-ripple Trim In executes as a single atomic operation instead of two sequential API calls.
   - **Concurrency Hardening**: Automatically inject \`expectedBaseRevision: state.project.revision\` into frontend \`dispatchOperation\` to enforce fail-closed 409 rejection.
   - **Track Visibility Conformance**: Route track visibility through \`set_track_state { visible: boolean }\` instead of local \`track.hidden\` mutation.
   - **Shortcut & Gesture Safety**: Reserve \`C\` for Hold-to-Compare, bind Crop to \`Shift+C\`, add Escape key gesture cancellation.

Please review our Stage 18.0 Audit and issue your formal review and authorization decision for **Stage 18.1: Timeline Visual Surface, Scrubbing & Transient Interaction State**.`;

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

  console.log('3. Injecting audit submission into div.ProseMirror[aria-label="Ask ChatGPT"]...');
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
      return (aria === 'send' || aria.includes('send')) && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return 'CLICKED_SEND';
    }
    return 'NO_SEND_BTN';
  })()`);
  console.log('   Send:', sendRes);

  console.log('5. Awaiting ChatGPT Stage 18.0 Audit Review in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const marker = "Please review our Stage 18.0 Audit and issue your formal review";

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[data-testid="stop-button"], button[aria-label*="Stop"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';
      const marker = ${JSON.stringify(marker)};
      const idx = text.lastIndexOf(marker);
      if (idx === -1) return JSON.stringify({ isGenerating, len: 0, text: '' });

      const afterMarker = text.slice(idx + marker.length + 100).trim();
      return JSON.stringify({
        isGenerating,
        len: afterMarker.length,
        snippet: afterMarker.slice(0, 150),
        text: afterMarker
      });
    })()`);

    try {
      const data = JSON.parse(checkRes);
      if (!data.isGenerating && data.len > 250) {
        console.log(`\n✅ Stage 18.0 Audit Review received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`... awaiting review (chars: ${data.len}, generating: ${data.isGenerating})\n`);
      }
    } catch (e) {
      console.log('Waiting for response parsing...');
    }
  }

  if (!completed) {
    console.error('Timed out waiting for ChatGPT response.');
    process.exit(1);
  }

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE18_0_AUDIT_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Stage 18.0 Audit Review & Stage 18.1 Authorization

**Date**: ${new Date().toISOString()}  
**Conversation**: \`https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a\`  
**Milestone**: EME Phase 18 (TL-01) — Stage 18.0 Review  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 18.0 Audit Review to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
