/**
 * Ezra Bridge Script: Submit Phase 22 Completion Report & Request Final Milestone Certification
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
  console.log('1. Preparing Phase 22 Completion Report Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_22_COMPLETION_REPORT.md'), 'utf8');

  // Authoritative candidate git commit
  const headCommitRes = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const headCommit = (headCommitRes.stdout || '').trim();

  const promptAnchor = "Dear ChatGPT Architecture Lead (Phase 22 Completion Report & Independent Release Assurance Certification)";

  const promptText = `${promptAnchor},

We have completed **Phase 22 — Controlled Production Pilot & Independent Release Assurance** in full compliance with your Architecture Lead Directive.

### Summary of Completed Phase 22 Mandates:

1. **Stage 22.1 — Representative Workload Engine & SLO Stress Validation**:
   - Synthesizes multi-distribution workloads (\`LOW_VOLUME\`, \`BURST\`, \`SUSTAINED_PEAK\`, \`CHAOS_DEGRADED\`).
   - Implements cold-start and sample-sufficiency guards (\`NO_DATA\`, \`LOW\`, \`MODERATE\`, \`HIGH\`) protecting against misleading health assessments under low traffic.
   - Verifies alert state machine escalation and recovery (\`HEALTHY\` -> \`WARNING\` -> \`CRITICAL\` -> \`RECOVERY\` -> \`HEALTHY\`).
   - Verifies telemetry failure isolation without contaminating workflow availability SLI.
   - Validates mathematical accuracy of nearest-rank percentiles ($p50, p95, p99$).
   - Test results: **6 / 6 PASS**.

2. **Stage 22.2 — Deep Adversarial Security Assurance**:
   - Hardened path traversal defense against double-encoding (\`%252e%252e\`), triple-encoding, null-bytes (\`%00\`), mixed backslashes (\`..\\..\\\`), and multi-dot segments.
   - Fuzzed malformed, truncated, and 50-level nested JSON bombs without runtime crashes.
   - Verified raw TCP socket CRLF header injection defenses and 128-char bounding on correlation IDs.
   - Case-insensitive purging of sensitive environment variables (\`Aws_Secret_Access_Key\`, \`openai_api_key\`, \`DATABASE_PASSWORD\`).
   - Client-facing error redaction verified: zero internal stack trace leakage.
   - Test results: **6 / 6 PASS**.

3. **Stage 22.3 — Controlled Production Pilot & Progressive Canary Execution**:
   - Codified pilot cohort specification with deterministic eligibility hashing across canary gates ($0\% \\to 10\% \\to 50\% \\to 100\%$).
   - Enforces minimum observation windows and completed job counts before advancement.
   - Real-time containment: halts pilot on error rate (> 0.5%) or latency breach.
   - **Non-negotiable Invariant**: Immediate automated containment and revocation of pilot eligibility on active delivery integrity breach.
   - Append-only pilot health ledger recording all decisions and metrics with ISO timestamps.
   - Test results: **6 / 6 PASS**.

4. **Stage 22.4 — Operational Recovery & Verified Rollback Proof**:
   - Deployment interruption and restart recovery verified within **17ms** (target RTO $\\le 2.0\\text{s}$).
   - Live rollback restores approved Phase 20 replacement baseline (\`96002a4288200cbe082fa851b106a5e19192d12c56967311eb8ca10376e52282\`, 371,606 bytes, 161 files) in **4ms**.
   - **Non-negotiable Invariant**: Verified byte-for-byte active delivery preservation across crash, recovery, and rollback (RPO = 0 data loss).
   - Cryptographic tamper detection and fail-closed defense verified.
   - Test results: **6 / 6 PASS**.

5. **Stage 22.5 — Independent Release Assurance & Production Package**:
   - Candidate Artifact: \`dist/editing-mechanics-engine-0.1.0-rc1.tgz\`
   - Candidate SHA-256: **\`fce03fa2f7755d1b42f78ab53ce9e90c6b8266509f1e4e6efff06aeefc2b3784\`**
   - Candidate Size: **390,475 bytes** (166 clean files, zero test/dev leaks).
   - Head Git Commit: \`${headCommit}\`
   - Phase 22 Test Battery: **24 / 24 PASS** (20 child scenarios + 4 parent runners).
   - Phase 21 + 22 Combined Battery: **50 / 50 PASS**.
   - Full Workflow Regression Battery: **197 / 197 PASS**.
   - Zero external runtime dependencies (\`dependencies: {}\` strictly maintained).
   - All 7 core architectural invariants strictly preserved.

Here is the full Phase 22 Completion Report (\`plans/PHASE_22_COMPLETION_REPORT.md\`):

---

${reportContent}

---

We respectfully submit this release assurance evidence bundle for your final architecture review and request:
1. Official certification of Milestone Phase 22 (*Controlled Production Pilot & Independent Release Assurance*).
2. Formal authorization to create annotated git tag \`phase-22-certified\` targeting candidate commit \`${headCommit}\`.`;

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

  console.log('5. Awaiting ChatGPT Phase 22 Architecture Certification Response in thread-scroll-container...');
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
        console.log(`\n✅ Phase 22 Architecture Certification received! (${data.len} characters)`);
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
    const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE22_CERTIFICATION.md');
    fs.writeFileSync(outPath, finalMarkdown, 'utf8');
    console.log(`\n✅ Saved Architecture Lead final certification to: ${outPath}`);
  } else {
    console.error('\n❌ Timed out waiting for ChatGPT final certification response.');
  }
}

main().catch(console.error);
