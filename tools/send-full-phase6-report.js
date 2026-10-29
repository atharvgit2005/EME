const fs = require('fs');
const { spawnSync } = require('child_process');

function sendPhase6Report() {
  const phase6Report = fs.readFileSync('docs/PHASE_6_REPORT.md', 'utf8');

  const fullPayload = `# Full Detailed Phase 6 Production Packaging, CLI Hardening & Release Readiness Report

Here is the complete, unabridged report and verification results for Phase 6 — Production Packaging, CLI Hardening & Release Readiness:

---

## 1. Primary Phase 6 Completion Report (\`docs/PHASE_6_REPORT.md\`)

${phase6Report}

---

## 2. Release Candidate Summary & Verification Evidence
- **Release Candidate Tarball**: \`artifacts/phase-6/release-candidate/editing-mechanics-engine-0.1.0-rc1.tgz\` (27.9 kB, unpacked: 114.7 kB, 19 files).
- **SHA256 Checksum**: \`1f8b7ed83c697dcd47ce58016525fbd2ed02cdec2007117768e60c8e3b3aaff6\`.
- **Executable Binaries**:
  - \`bin/eme.js\` (CLI with \`doctor\`, \`capabilities\`, \`init\`, \`validate\`, \`inspect\`, \`compile\`, \`render\`, \`inspect-frame\`).
  - \`bin/eme-mcp.js\` (Standard stdio JSON-RPC 2.0 MCP server with 9 tools).
- **Version Reconciliation**:
  - HyperFrames pinned to \`0.8.162\`.
  - Node.js runtime delegation via \`EnvironmentResolver\` (supports Node >=20 core, delegates to Node 22 for headless browser rendering).
  - FFmpeg 9.0.2 & ffprobe dynamic discovery (no hardcoded Homebrew paths).
- **Security Hardening**:
  - Realpath resolution in \`assertSafePath\` to eliminate symlink and \`../\` directory traversal escape vectors.
  - Subprocess argument arrays with \`shell: false\`.
- **Clean-Room Simulation**:
  - \`tools/simulate-clean-install.js\` unpacked into isolated \`/tmp\` directory and validated all CLI and MCP commands with 100% pass rate.
- **Licensing Ledger & Asset Protection**:
  - \`LICENSE\` (MIT).
  - \`THIRD_PARTY_NOTICES.md\` (HyperFrames Apache-2.0, GSAP, FFmpeg LGPL/GPL, Ajv MIT).
  - Strict \`files\` allowlist in \`package.json\` ensuring zero unlicensed or unverified audio/video/font assets are packaged.
- **Automated Tests**:
  - \`npm test\`: 30/30 tests passing (0 failures).
  - \`node tools/validate-schema.js\`: 0 errors.

**Phase 6 Verdict**: **PASS (Release Candidate Ready)**

Please review the complete Phase 6 deliverables and provide your final assessment and next direction.`;

  console.log(`Full Phase 6 report payload size: ${fullPayload.length} characters`);

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
  sendPhase6Report();
}

module.exports = { sendPhase6Report };
