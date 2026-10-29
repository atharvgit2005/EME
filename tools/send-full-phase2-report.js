const fs = require('fs');
const { spawnSync } = require('child_process');

function sendPhase2Report() {
  const phase2Report = fs.readFileSync('docs/PHASE_2_REPORT.md', 'utf8');
  const opContract = fs.readFileSync('docs/spec/operation-contract.md', 'utf8');
  const adapterInterface = fs.readFileSync('docs/spec/renderer-adapter-interface.md', 'utf8');
  const adr001 = fs.readFileSync('docs/adr/ADR-001-time-representation.md', 'utf8');
  const adr002 = fs.readFileSync('docs/adr/ADR-002-renderer-adapter-isolation.md', 'utf8');

  const fullPayload = `# Full Detailed Phase 2 Contract Definition Report & Deliverables

Here is the complete, unabridged documentation for Phase 2 — Define the Editing Mechanics Engine Contract:

---

## 1. Primary Phase 2 Report (\`docs/PHASE_2_REPORT.md\`)

${phase2Report}

---

## 2. Operation Contract Specification (\`docs/spec/operation-contract.md\`)

${opContract}

---

## 3. Renderer Adapter Interface (\`docs/spec/renderer-adapter-interface.md\`)

${adapterInterface}

---

## 4. Architecture Decision Records

### ADR-001: Time Representation
${adr001}

### ADR-002: Renderer Adapter Isolation
${adr002}

---

## 5. Automated Schema Validation Summary
- Canonical Schema: \`schema/eme-project.v1.schema.json\` (JSON Schema Draft 2020-12)
- Benchmark A Example: \`examples/benchmark-a-motion-graphics.json\` (PASS - 0 errors)
- Benchmark B Example: \`examples/benchmark-b-xray-compositing.json\` (PASS - 0 errors)
- Tool: \`tools/validate-schema.js\` executed cleanly with 0 errors.

Please review the complete Phase 2 deliverables and generate the execution prompt and detailed task specification for Phase 3 — Build the Smallest Working Engine.`;

  console.log(`Full Phase 2 report size: ${fullPayload.length} characters`);

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
    activate
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

sendPhase2Report();
