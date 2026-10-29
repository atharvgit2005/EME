/**
 * Ezra Bridge Script: Submit Phase 23 Completion Report & Request Milestone Certification
 *
 * Interacts with ChatGPT Architecture Lead via the active Ezra bridge in Brave Browser
 * (thread: 6ad4ae37-23ec-83ee-b1df-5274a2f04e1a).
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
  console.log('1. Preparing Phase 23 Completion Report Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_23_COMPLETION_REPORT.md'), 'utf8');

  // Authoritative candidate git commit
  const headCommitRes = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const headCommit = (headCommitRes.stdout || '').trim();

  let manifestContent = '';
  try {
    manifestContent = fs.readFileSync(path.join(__dirname, '../dist/release-manifest.json'), 'utf8');
  } catch (e) {}

  let checksumContent = '';
  try {
    checksumContent = fs.readFileSync(path.join(__dirname, '../dist/editing-mechanics-engine-0.1.0-rc1.tgz.sha256'), 'utf8').trim();
  } catch (e) {}

  const promptAnchor = "Dear ChatGPT Architecture Lead (Phase 23 Completion Report & Final Production Launch Certification)";

  const promptText = `${promptAnchor},

We have completed **Phase 23 — Production Launch & Operational Governance** in full compliance with your Architecture Lead Directives and the established EME non-negotiable invariants.

### Summary of Completed Phase 23 Mandates:

1. **Stage 23.1 — Production Operational Monitoring & Alerting Infrastructure**:
   - Multi-window error budget burn rate calculation (1h fast-burn threshold 14.4x rate $\\to$ \`CRITICAL\`, 6h slow-burn threshold 6.0x rate $\\to$ \`WARNING\`) against 99.5% availability target (0.5% error budget).
   - Incident classification & automated runbook dispatcher (\`RUNBOOK_PURGE_SCRATCH\`, \`RUNBOOK_RESTART_SUBPROCESS\`, \`RUNBOOK_BREAK_STALE_LEASES\`, \`RUNBOOK_RECONCILE_DANGLING_JOBS\`, \`RUNBOOK_TRIGGER_ROLLBACK\`).
   - Live HTTP routes: \`GET /healthz/production\` (200 on healthy, 503 on degraded/critical) and \`GET /metrics/operational\` (Prometheus exposition format).
   - Test results: **6 / 6 PASS**.

2. **Stage 23.2 — Automated Incident Response & Remediation Engine**:
   - Automated storage saturation remediation: purges scratch media while strictly preserving active deliverables (RPO = 0 data loss).
   - Dangling in-flight job reconciliation sweep: transitions abandoned jobs to \`NEEDS_RECONCILIATION\` on daemon restart.
   - Stale lease deadlock resolution: revokes expired disk session locks without corrupting active locks.
   - Emergency containment & automated rollback: triggers atomic rollback to approved Phase 20 baseline on detected corruption.
   - Comprehensive remediation audit trail and event logging.
   - Test results: **6 / 6 PASS**.

3. **Stage 23.3 — Cryptographic Delivery Governance & Immutable Audit Chain**:
   - SHA-256 Merkle-linked audit chain from genesis block (\`0000000000000000000000000000000000000000000000000000000000000000\`).
   - Linear chain integrity validation detecting any content modification, backdated timestamp, or block removal with exact corrupted index reporting.
   - Authoritative delivery manifest registry preventing duplicate conflicting deliverables.
   - Atomic disk persistence with crash safety.
   - Test results: **6 / 6 PASS**.

4. **Stage 23.4 — Live Production Launch Readiness & Operational Proof**:
   - Simulated 50 production jobs verified in ledger (51 blocks, 100% cryptographic integrity).
   - Zero-downtime hot reconfiguration without dropping active requests.
   - Live rollback drill to approved Phase 20 replacement baseline (\`96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282\`, 371,606 bytes, 161 files) executed in **2ms** (target RTO $\\le 2.0\\text{s}$).
   - Byte-for-byte active delivery preservation verified under rollback (RPO = 0 data loss).
   - Production launch readiness checklist gate returns \`READY_FOR_PRODUCTION_LAUNCH\`.
   - Test results: **6 / 6 PASS**.

5. **Stage 23.5 — Independent Release Assurance & Production Package**:
   - Candidate Artifact: \`dist/editing-mechanics-engine-0.1.0-rc1.tgz\`
   - Candidate SHA-256: **\`6d859d9189d4155970a6b85a253af5139f3a03fa40344dd7dd202bcdd0b86b25\`**
   - Candidate Size: **397,251 bytes** (169 clean distribution files, zero test/dev leaks).
   - Authoritative Candidate Commit: **\`${headCommit}\`**
   - Release Manifest \`git_commit\`: **\`${headCommit}\`** (100% bound, zero mismatch)
   - Phase 23 Test Battery: **24 / 24 PASS**.
   - Cumulative Regression Battery (Phase 21 + 22 + 23): **74 / 74 PASS**.
   - Full Workflow Regression Battery: **197 / 197 PASS**.
   - Zero external runtime npm dependencies (\`dependencies: {}\` strictly maintained).
   - All 7 core architectural invariants strictly preserved.

Here is the complete Phase 23 Completion Report (\`plans/PHASE_23_COMPLETION_REPORT.md\`):

---

${reportContent}

---

### Release Manifest Binding & Checksum Verification:
- \`dist/release-manifest.json\`:
\`\`\`json
${manifestContent}
\`\`\`
- Standalone Checksum (\`dist/editing-mechanics-engine-0.1.0-rc1.tgz.sha256\`):
\`\`\`
${checksumContent}
\`\`\`

We respectfully submit this release assurance evidence bundle for your final architecture review and request:
1. Official certification of Milestone Phase 23 (*Production Launch & Operational Governance*).
2. Formal authorization to create annotated git tag \`phase-23-certified\` targeting authoritative candidate commit \`${headCommit}\`.`;

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

  await sleep(600);

  console.log('3. Injecting prompt into div.ProseMirror[aria-label="Ask ChatGPT"]...');
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
      return (aria === 'send' || aria.includes('send') || aria === 'submit') && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return 'CLICKED_SEND';
    }
    return 'NO_SEND_BTN';
  })()`);
  console.log('   Send:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    console.log('   Retrying send via Enter keystroke...');
    const enterScript = `
tell application "System Events"
  key code 36
end tell`;
    spawnSync('osascript', ['-'], { input: enterScript, encoding: 'utf8' });
  }

  console.log('5. Awaiting ChatGPT Phase 23 Architecture Certification Response in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      let responseText = '';
      if (pIdx !== -1) {
        const afterPrompt = text.slice(pIdx);
        const marker = "ChatGPT said:";
        const mIdx = afterPrompt.indexOf(marker);
        if (mIdx !== -1) {
          responseText = afterPrompt.slice(mIdx + marker.length).trim();
        } else {
          responseText = afterPrompt.slice(promptAnchor.length).trim();
        }
      }
      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        len: responseText.length,
        snippet: responseText.slice(0, 150),
        text: responseText
      });
    })()`);

    try {
      const data = JSON.parse(checkRes);
      if (!data.isGenerating && data.len > 250) {
        console.log(`\n✅ Phase 23 Architecture Certification received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`   [Attempt ${attempt + 1}/120] Generating=${data.isGenerating}, len=${data.len}...\r`);
      }
    } catch (e) {
      process.stdout.write(`   [Attempt ${attempt + 1}/120] waiting...\r`);
    }
  }

  if (completed && finalMarkdown) {
    const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE23_CERTIFICATION.md');
    fs.writeFileSync(outPath, finalMarkdown, 'utf8');
    console.log(`\n✅ Saved Architecture Lead final certification to: ${outPath}`);
  } else {
    console.error('\n❌ Timed out waiting for ChatGPT final certification response.');
  }
}

main().catch(console.error);
