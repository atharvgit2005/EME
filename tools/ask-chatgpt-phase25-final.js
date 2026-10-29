/**
 * Ezra Bridge Script: Submit Phase 25 Closure Addendum to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 25 Closure Addendum Submission Prompt...');

  const addendumContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_25_CLOSURE_ADDENDUM.md'), 'utf8');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Phase 25 Final Certification Request)";

  const promptText = `${promptAnchor},

In response to your formal review disposition in \`plans/CHATGPT_PHASE25_CERTIFICATION.md\` ("IMPLEMENTATION PROVISIONALLY ACCEPTED. FINAL CERTIFICATION, MERGE TO main, AND TAG CREATION ARE ON HOLD pending four specific closure conditions"), we have implemented all required corrections and completed the verification work for conditions **CERT-25-A**, **CERT-25-B**, **CERT-25-C**, and **CERT-25-D**.

Here is our concise closure summary:

1. **CERT-25-A — Subprocess Execution Behavior & Bounded Latency**:
   - Added asynchronous execution: \`QualityAssuranceEngine.auditQualityAsync(project, renderedMp4Path, options)\` runs out-of-process via the persistent daemon stream (\`EarshotWorkerClient\`) without blocking the Node.js event loop.
   - Synchronous fallback (\`auditAudioQualitySync\`) is strictly bounded: mode defaults and is coerced to \`fast_dsp\` with a tight \`2,000ms\` timeout. High-resolution timing on real media measured:
     * Standard MP4: **218.4ms** blocking duration.
     * Calibrated defect fixture: **312.8ms** blocking duration.
   - Native FFmpeg QA checks continue running to completion with zero interruption under worker timeout or crash.
   - The contradictory term "zero-overhead" has been completely eliminated.

2. **CERT-25-B — Audio Synchronization Path & Cold-Start Isolation**:
   - Timeline analysis is dispatched directly through native Earshot: \`earshot.timeline.read_cues\`, \`earshot.timeline.detect_events\`, and \`earshot.timeline.sync\`.
   - On \`fixtures/qa-audio-defects.mp4\` with visual cut at 1.000s, it detects the late sound impact at 1.150s with exact offset **+150.0ms** ($t_{\\text{sound}} - t_{\\text{picture}}$), mapped to **+18,000 EME ticks**.
   - Worker cold-start ping handshake completes in **809.8ms** with zero neural model loading. Heavy models (CLAP/AST) are isolated to explicit \`full_perception\` mode.
   - Timed-out or unmeasured sync checks emit \`status: 'not_measured'\` (\`severity: 'HIGH'\`) and penalize the score; they never silently pass.

3. **CERT-25-C — Test Accounting & Status Semantics Reconciliation**:
   - Corrected cumulative regression table across all phases:
     * Phase 21: 26 reported results
     * Phase 22: 24 reported results
     * Phase 23: 24 reported results
     * Phase 24: 24 reported results
     * Phase 25: 50 reported results (6 parent suites + 44 child tests across 6 files)
     * Total: **148 / 148 PASS (100% Zero Regressions)**.
   - Clarified silence semantics: Digital silence ($< -70\\text{ dBFS}$) yields worker \`SUCCESS\` with \`integrated_lufs: null\` (\`lufs_reason: "silence"\`), which the adapter maps to check \`status: "not_measured"\`, \`severity: "HIGH"\`. EME marks the report as failed (no accidental pass). Inapplicable requests (no audio track) yield \`status: "not_applicable"\`.

4. **CERT-25-D — Release Provenance & Merge Identity**:
   - Feature Branch: \`feature/phase-25-earshot-adapter\`
   - Exact Candidate Commit: \`45b7823e0614cd256b46cbf0533026f6255e426c\`
   - Base on \`main\`: \`66fbb6e615a1fdd54778bd3a1c6eeff429bdae6b\` (Phase 24 Release)
   - Working tree: clean. All 18 canonical schemas strictly frozen; 0 runtime npm dependencies.

Here is the complete Phase 25 Closure Addendum (\`plans/PHASE_25_CLOSURE_ADDENDUM.md\`):

---

${addendumContent}

---

We respectfully submit this verification evidence and request:
1. Formal acceptance of the closure evidence for CERT-25-A, CERT-25-B, CERT-25-C, and CERT-25-D.
2. Final unconditional Milestone Phase 25 certification.
3. Official authorization to merge \`feature/phase-25-earshot-adapter\` (\`45b7823e0614cd256b46cbf0533026f6255e426c\`) into \`main\` and publish release tag \`phase-25-certified\`.`;

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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Certification in thread-scroll-container...');
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

    let parsed = {};
    try {
      parsed = JSON.parse(checkRes);
    } catch (e) {
      console.log(`   [Poll ${attempt + 1}] Raw: ${checkRes.slice(0, 100)}`);
      continue;
    }

    console.log(`   [Poll ${attempt + 1}] Generating: ${parsed.isGenerating}, Resp Len: ${parsed.len}`);

    if (!parsed.isGenerating && parsed.len > 100) {
      // Allow an extra 3 seconds to ensure text is fully settled
      await sleep(3000);
      const recheck = runOsa(`(() => {
        const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
        if (stopBtn) return JSON.stringify({ isGenerating: true });
        const scroll = document.querySelector('.thread-scroll-container');
        const text = scroll ? scroll.innerText || '' : '';
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
        return JSON.stringify({ isGenerating: false, text: responseText });
      })()`);

      try {
        const rep = JSON.parse(recheck);
        if (!rep.isGenerating && rep.text.length >= parsed.len) {
          finalMarkdown = rep.text;
          completed = true;
          break;
        }
      } catch (err) {}
    }
  }

  if (!completed || !finalMarkdown) {
    console.error('Failed to get complete response from ChatGPT.');
    process.exit(1);
  }

  const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE25_FINAL_CERTIFICATION.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSuccessfully received Architecture Lead Final Certification! Saved to ${outPath}`);
  console.log('\n--- Final Certification Preview ---');
  console.log(finalMarkdown.slice(0, 800));
  console.log('...\n----------------------------------');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
