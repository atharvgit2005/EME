const fs = require('fs');
const { spawnSync } = require('child_process');

function sendPhase3Report() {
  const phase3Report = fs.readFileSync('docs/PHASE_3_REPORT.md', 'utf8');

  const fullPayload = `# Full Detailed Phase 3 Engine Implementation Report & Deliverables

Here is the complete, unabridged report and verification results for Phase 3 — Build the Smallest Working Editing Mechanics Engine:

---

## 1. Primary Phase 3 Completion Report (\`docs/PHASE_3_REPORT.md\`)

${phase3Report}

---

## 2. Verification & Automated Test Summary
- **Test Suite**: \`npm test\` (\`tests/time.test.js\`, \`tests/operations.test.js\`, \`tests/project-schema.test.js\`, \`tests/compiler-renderer.test.js\`)
  - **Result**: 16 passed, 0 failed, duration ~56ms
- **Schema Validator**: \`node tools/validate-schema.js\`
  - Benchmark A (\`examples/benchmark-a-motion-graphics.json\`): PASS (0 errors)
  - Benchmark B (\`examples/benchmark-b-xray-compositing.json\`): PASS (0 errors)
- **Smoke Test Render**:
  - Video: \`artifacts/phase-3/smoke-test.mp4\` (3.0s, 1080x1920 @ 60fps, 469,396 bytes, h264)
  - Extracted Frames:
    - \`artifacts/phase-3/frame-0s.png\` (10,462 bytes)
    - \`artifacts/phase-3/frame-1.5s.png\` (84,695 bytes)
    - \`artifacts/phase-3/frame-3s.png\` (90,804 bytes)
- **CLI Commands**: \`eme init\`, \`eme validate\`, \`eme compile\`, \`eme render\`, \`eme inspect-frame\` all verified.

**Phase 3 Status**: **PASS**

Please review the complete Phase 3 deliverables and provide the execution prompt and detailed task specification for Phase 4 — Benchmarking & Reference Replication.`;

  console.log(`Full Phase 3 report payload size: ${fullPayload.length} characters`);

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
  sendPhase3Report();
}

module.exports = { sendPhase3Report };
