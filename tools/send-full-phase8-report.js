const fs = require('fs');
const { spawnSync } = require('child_process');

function sendPhase8Report() {
  const phase8Report = fs.readFileSync('docs/PHASE_8_REPORT.md', 'utf8');

  const summary = [
    "## Technical Summary of Phase 8 Deliverables:",
    "1. Typed Update Primitives (Phase 8A):",
    "   - Added modify_clip and update_keyframe to OperationExecutor, enabling in-place edits to typography, transforms, effects, and audio envelopes without clip recreation.",
    "",
    "2. Visual Control Surface Architecture (Phase 8B & 8C):",
    "   - Implemented src/ui/server.js (REST API bound to EME operations, path security guard assertSafePath, session undo/redo).",
    "   - Implemented client frontend in src/ui/public/ (live preview canvas, multitrack timeline with scrubbable playhead, properties inspector, and QA panel).",
    "",
    "3. Concurrency, Atomicity & Undo/Redo (Phase 8D):",
    "   - Session-level undo/redo maintaining monotonic revision numbering (Rev 1 -> Rev 4).",
    "",
    "4. End-to-End Manual Correction Demonstration (Phase 8E):",
    "   - Loaded copy of Phase 7 Scenario 1, applied 3 sequential corrections (headline text/styling, subhead start tick, audio volume envelope).",
    "   - Rendered updated 60fps MP4 (artifacts/phase-8/manual-correction-demo/render-rev-4.mp4, 15.3s render time).",
    "   - Extracted frame snapshot at 1.5s (corrected-frame-1.5s.png, 8,724 bytes).",
    "   - Automated QA audit scored 100/100 (PASSED).",
    "",
    "5. Automated Test Suite (Phase 8F):",
    "   - Added tests/ui/editor-backend.test.js.",
    "   - npm test: 33/33 tests passing with 0 failures.",
    "",
    "Please evaluate the deliverables, provide your formal assessment on Phase 8, and specify our next direction."
  ].join('\n');

  const fullPayload = `# Full Detailed Phase 8 Verification Report: Manual Editing Interface & Visual Project Inspector\n\nHere is the complete, unabridged report and verification results for Phase 8 — Manual Editing Interface & Visual Project Inspector:\n\n---\n\n${phase8Report}\n\n---\n\n${summary}`;

  console.log(`Full Phase 8 report payload size: ${fullPayload.length} characters`);

  const sendJs = `(() => {
    const el = document.querySelector('div.ProseMirror[aria-label="Ask ChatGPT"]');
    if (!el) return "NO_CHAT_INPUT";
    el.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    
    document.execCommand("insertText", false, ${JSON.stringify(fullPayload)});
    
    let parent = el.parentElement;
    let sendBtn = null;
    while (parent && parent.tagName !== "BODY") {
      const btns = Array.from(parent.querySelectorAll("button"));
      sendBtn = btns.find(b => {
        const aria = (b.getAttribute("aria-label") || "").toLowerCase();
        const text = (b.innerText || "").toLowerCase();
        return aria.includes("send") || text.includes("send") || b.className.includes("bg-composer-primary");
      });
      if (sendBtn && !sendBtn.disabled) break;
      parent = parent.parentElement;
    }
    
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.focus();
      sendBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      sendBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
      sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      sendBtn.click();
      return "CLICKED_SEND";
    }
    return "BUTTON_NOT_READY";
  })()`;

  const osa = `
tell application "Brave Browser"
    repeat with w in windows
        repeat with t in tabs of w
            if (URL of t) contains "chatgpt.com" then
                return execute t javascript ${JSON.stringify(sendJs)}
            end if
        end repeat
    end repeat
    return "NO_TAB"
end tell`;

  const res = spawnSync('osascript', ['-'], { input: osa, encoding: 'utf8' });
  console.log('Send result:', (res.stdout || '').trim());
}

if (require.main === module) {
  sendPhase8Report();
}

module.exports = { sendPhase8Report };
