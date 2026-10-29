const fs = require('fs');
const { spawnSync } = require('child_process');

function sendPhase4Report() {
  const phase4Report = fs.readFileSync('docs/PHASE_4_REPORT.md', 'utf8');

  const fullPayload = `# Full Detailed Phase 4 Benchmarking & Reference Replication Report

Here is the complete, unabridged report and verification results for Phase 4 — Benchmarking and Reference Replication:

---

## 1. Primary Phase 4 Completion Report (\`docs/PHASE_4_REPORT.md\`)

${phase4Report}

---

## 2. Benchmark Verification Summary
- **Baseline Frame-Rate Audit**:
  - Smoke Test re-rendered at true 60 fps: \`artifacts/phase-3/smoke-test.mp4\` (3.0s, 180 frames, 627,902 bytes).
- **Benchmark A (Kinetic Typography)**:
  - Video: \`artifacts/phase-4/benchmark-a.mp4\` (12.0s, 720 frames, 372,912 bytes, 1080x1920 @ 60fps).
  - Staged fonts (Instrument Serif, Syne, Archivo), alpha transitions, and audio envelope mixing.
  - Inspected Keyframes: \`bench-a-frame-1s.png\`, \`bench-a-frame-5s.png\`, \`bench-a-frame-10s.png\`.
- **Benchmark B (X-Ray Difference Compositing)**:
  - Video: \`artifacts/phase-4/benchmark-b.mp4\` (8.0s, 480 frames, 1,835,575 bytes, 1080x1920 @ 60fps).
  - Duplicated source footage, invert/contrast filtering, and Difference blend mode.
  - Inspected Keyframes: \`bench-b-frame-1s.png\`, \`bench-b-frame-4s.png\`, \`bench-b-frame-7s.png\`.
  - Controlled Comparison: \`artifacts/phase-4/comparison/difference-blend-comparison.png\` (419,556 bytes side-by-side sheet).
- **Operation Catalog**: 13 atomic editing operations verified (\`delete_clip\`, \`ripple_delete\`, \`reorder_tracks\` added).
- **Model Context Protocol (MCP)**: \`src/mcp/server.js\` JSON-RPC 2.0 tool endpoints verified.
- **Automated Tests**: \`npm test\` passed with 19/19 tests passing (0 failures).
- **Schema Validation**: \`node tools/validate-schema.js\` passed with 0 errors.

**Phase 4 Verdict**: **PASS**

Please review the complete Phase 4 deliverables and provide the execution prompt and detailed task specification for Phase 5 — Agent Integration & Automated Production.`;

  console.log(`Full Phase 4 report payload size: ${fullPayload.length} characters`);

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
  sendPhase4Report();
}

module.exports = { sendPhase4Report };
