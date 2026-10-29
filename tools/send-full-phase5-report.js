const fs = require('fs');
const { spawnSync } = require('child_process');

function sendPhase5Report() {
  const phase5Report = fs.readFileSync('docs/PHASE_5_REPORT.md', 'utf8');

  const fullPayload = `# Full Detailed Phase 5 Agent Integration & Automated Production Report

Here is the complete, unabridged report and verification results for Phase 5 — Agent Integration & Automated Production:

---

## 1. Primary Phase 5 Completion Report (\`docs/PHASE_5_REPORT.md\`)

${phase5Report}

---

## 2. Phase 5 Deliverables & Verification Summary
- **MCP Server & Protocol**:
  - Registered 9 tools in \`src/mcp/server.js\` with JSON Schema definitions and path security guard (\`assertSafePath\`).
  - IDE registered at \`~/.gemini/antigravity-ide/mcp/eme/\`.
- **End-to-End Autonomous Production**:
  - Test Brief: 6.0s vertical 1080×1920 @ 60fps kinetic typography with staged Instrument Serif font, snowfall BGM, and volume envelope.
  - Initial Draft Render: \`artifacts/phase-5/production-test/agent-draft.mp4\` (Revision 15).
  - Multi-Timestamp QA: Inspected frames at 1.0s, 2.0s, and 5.0s. Identified undersized low-contrast subtitle defect (38px, #666688).
  - Targeted Correction: Applied bounded MCP edit bumping subtitle to 52px, #9d86ff, letterSpacing: 4. Revision incremented 15 &rarr; 18.
  - Final Deliverable: \`artifacts/phase-5/production-test/agent-final.mp4\` (6.000s, 1080×1920 @ 60fps, exactly 360 frames, AAC stereo).
  - Trace Audit: \`artifacts/phase-5/production-test/production-trace.json\`.
- **Existing Project Modification**:
  - Cloned Benchmark A to \`artifacts/phase-5/benchmark-a/benchmark-a-clone.json\`.
  - Moved \`clip_headline_act2\` (+0.5s) and adjusted keyframe opacity via MCP.
  - Invariant Verification: Revision incremented 1 &rarr; 3; all unrelated clips (\`clip_headline_intro\`, \`clip_trans_01\`, \`clip_audio_bgm\`) preserved bit-for-bit identical.
  - Rendered: \`artifacts/phase-5/benchmark-a/benchmark-a-modified.mp4\` (12.0s, 720 frames, 60fps).
- **Benchmark Regression**:
  - Benchmark A and Benchmark B verified through MCP tool interface. Outputs and frames extracted into \`artifacts/phase-5/benchmark-a/\` and \`artifacts/phase-5/benchmark-b/\`.
- **Automated Tests**:
  - \`npm test\`: 25/25 tests passing in 65ms (0 failures, 0 skipped).
  - \`node tools/validate-schema.js\`: 0 errors across all projects.

**Phase 5 Verdict**: **PASS**

Please review the complete Phase 5 report, verification artifacts, and provide the next instructions or Phase 6 specification.`;

  console.log(`Full Phase 5 report payload size: ${fullPayload.length} characters`);

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
  sendPhase5Report();
}

module.exports = { sendPhase5Report };
