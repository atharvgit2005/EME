const fs = require('fs');
const { spawnSync } = require('child_process');

function sendPhase7Report() {
  const phase7Report = fs.readFileSync('docs/PHASE_7_REPORT.md', 'utf8');

  const summary = [
    "## Technical Summary of Phase 7 Deliverables:",
    "1. Multi-Scenario Benchmark Suite (Phase 7A):",
    "   - Scenario 1: YouTube Tech Explainer (16:9 Landscape, 1920x1080 @ 60fps, 3.0s, 180 frames). Rendered in 17.8s (artifacts/phase-7/scenario-1-16x9.mp4).",
    "   - Scenario 2: Social Media Reel (9:16 Vertical, 1080x1920 @ 60fps, 3.0s, 180 frames). Rendered in 12.2s (artifacts/phase-7/scenario-2-9x16.mp4).",
    "   - Scenario 3: E-Commerce Product Spotlight (1:1 Square, 1080x1080 @ 60fps, 3.0s, 180 frames). Rendered in 10.4s (artifacts/phase-7/scenario-3-1x1.mp4).",
    "   - Frame extractions verified for all 3 viewports.",
    "",
    "2. Automated Quality Assurance Engine (Phase 7C):",
    "   - Built src/renderers/qa-engine.js implementing algorithmic safe-margin and text clipping detection (with anchor-point awareness), container dimension matching, track integrity, and audio presence checks.",
    "   - All 3 benchmark scenarios scored 100/100 (PASSED).",
    "",
    "3. Multi-Turn Iterative Revision Workflow (Phase 7D):",
    "   - Executed 3 sequential turns on Scenario 1:",
    "     - Turn 1: Headline typography & color change (Revision 2).",
    "     - Turn 2: Accent callout badge insertion (Revision 3, 6 clips).",
    "     - Turn 3: Audio envelope reshaping (Revision 4).",
    "   - Rendered final revised video in 12.1s (artifacts/phase-7/iterative-revisions/scenario-1-final-revised.mp4) with QA score 100/100.",
    "",
    "4. Automated Regression Test Suite:",
    "   - tests/phase7-benchmarks.test.js added to test suite.",
    "   - npm test: 32/32 tests passing with 0 failures.",
    "",
    "Please evaluate the deliverables, provide your formal assessment on Phase 7, and specify our requirements for Phase 8."
  ].join('\n');

  const fullPayload = `# Full Detailed Phase 7 Engineering & Verification Report: Real-World Editing Reliability & Workflow Generalization\n\nHere is the complete, unabridged report and verification results for Phase 7 — Real-World Editing Reliability & Workflow Generalization:\n\n---\n\n${phase7Report}\n\n---\n\n${summary}`;

  console.log(`Full Phase 7 report payload size: ${fullPayload.length} characters`);

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
  sendPhase7Report();
}

module.exports = { sendPhase7Report };
