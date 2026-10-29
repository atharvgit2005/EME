const fs = require('fs');
const { spawnSync, execSync } = require('child_process');

function sendFullReport() {
  const reconReport = fs.readFileSync('docs/research/phase-1-software-reconnaissance.md', 'utf8');
  const matrixCsv = fs.readFileSync('docs/research/phase-1-capability-matrix.csv', 'utf8');
  const licenseLedger = fs.readFileSync('docs/research/phase-1-source-and-license-ledger.md', 'utf8');
  const openQuestions = fs.readFileSync('docs/research/phase-1-open-questions.md', 'utf8');

  const fullPayload = `# Full Detailed Phase 1 Research Report & Artifacts

Here is the complete, unabridged documentation for Phase 1 — Software Reconnaissance Using REA from our local workspace:

---

## 1. Primary Software Reconnaissance Report (\`docs/research/phase-1-software-reconnaissance.md\`)

${reconReport}

---

## 2. Candidate Capability Matrix (\`docs/research/phase-1-capability-matrix.csv\`)

\`\`\`csv
${matrixCsv}
\`\`\`

---

## 3. Source & License Ledger (\`docs/research/phase-1-source-and-license-ledger.md\`)

${licenseLedger}

---

## 4. Open Questions & Postponed Decisions (\`docs/research/phase-1-open-questions.md\`)

${openQuestions}

---

## 5. REA Investigation Evidence (\`docs/research/evidence/phase-1/rea-providers.json\`)
- REA CLI Version: 6.5.0 (/Users/atharvpaharia100/.local/bin/rea)
- Providers: LLDB, Ghidra, Cutter, GNU objdump, Hopper bridge
- Catalog counts: 153 CLI commands, 207 MCP tools
- Evidence provenance captured and stored.

Please review the full detailed documentation above and confirm or refine the Phase 2 prompt.`;

  console.log(`Full report size: ${fullPayload.length} characters`);

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

  // Also trigger Enter key via System Events to guarantee form submission
  setTimeout(() => {
    const enterScript = `
tell application "Brave Browser" to activate
tell application "System Events" to key code 36`;
    spawnSync('osascript', ['-'], { input: enterScript, encoding: 'utf8' });
  }, 400);
}

sendFullReport();
