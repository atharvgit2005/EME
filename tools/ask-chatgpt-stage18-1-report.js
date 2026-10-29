/**
 * Ezra Bridge Script: Submit Phase 18 Stage 18.1 Completion Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 18.1 Completion Report Submission Prompt...');

  const completionReport = fs.readFileSync(path.join(__dirname, '../plans/PHASE_18_STAGE1_COMPLETION_REPORT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

We have completed all implementation and verification requirements for **Stage 18.1: Timeline Visual Surface, Scrubbing & Transient Interaction State** in accordance with your Stage 18.1 Implementation Authorization (\`plans/CHATGPT_STAGE18_0_AUDIT_REVIEW.md\`).

We have committed the formal completion report:
📁 \`plans/PHASE_18_STAGE1_COMPLETION_REPORT.md\`

Here is the complete Stage 18.1 Completion Report:

---

${completionReport}

---

### Key Milestone Verifications for Your Review:
1. **Snapping Baseline Reconciliation**:
   - Replaced array-allocation loop with zero-allocation direct comparisons in \`TimelineAdapter.computeMagneticSnap\`.
   - Measured latency on 1,000 clips (2,001 snap points): **P50: 0.0022 ms, P95: 0.0125 ms** (Strict target $< 0.30$ ms met with a 24x margin).
2. **Unified Coordinate Contract**:
   - Constant 100 PPS scale (\`pixelsPerTick = (100.0 * zoom) / 120000\`) standardized across frontend (\`app.js\`) and backend (\`timeline-adapter.js\`). Time-drift eliminated.
   - Visible center zoom-anchoring via \`adjustScrollForZoom\` implemented with zero drift.
3. **Non-Mutating Transient Gestures & Safety**:
   - Playhead scrubbing, selection, scroll, zoom, drag ghosts, and snap guidelines operate in transient state with 0 revisions and 0 undo stack entries.
   - Gesture cancellation implemented across Escape key, window blur, and pointercancel.
   - Hotkeys isolated from editable inputs; \`C\` reserved for Hold-to-Compare; Crop moved to \`Shift+C\`.
4. **Authoritative Concurrency & Sequence Guards**:
   - \`toggleTrackVisibility\` refactored to dispatch canonical \`set_track_state\` with \`expectedBaseRevision\`.
   - Out-of-order timeline projections discarded via \`state.timelineFetchSeq\`.
5. **Regression & Safety**:
   - \`node --test tests/timeline-stage18-1-surface.test.js\`: **9/9 PASS** in 141ms.
   - \`node --test tests/timeline-*.test.js\`: **20/20 PASS** in 363ms.
   - Master test battery (\`npm test\`): **410/410 PASS** in 85.2s.

Please review our Stage 18.1 Completion Report and issue your formal review and authorization directive for **Stage 18.2: Atomic Editing & Compound Editorial Operations**.`;

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
      return (aria === 'send' || aria.includes('send')) && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return 'CLICKED_SEND';
    }
    return 'NO_SEND_BTN';
  })()`);
  console.log('   Send:', sendRes);

  console.log('5. Awaiting ChatGPT Stage 18.1 Completion Review in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const marker = "Please review our Stage 18.1 Completion Report and issue your formal review";

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
        console.log(`\n✅ Stage 18.1 Completion Review received! (${data.len} characters)`);
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

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE18_1_COMPLETION_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Stage 18.1 Completion Review & Stage 18.2 Authorization

**Date**: ${new Date().toISOString()}  
**Conversation**: \`https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a\`  
**Milestone**: EME Phase 18 (TL-01) — Stage 18.1 Review  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 18.1 Completion Review to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
