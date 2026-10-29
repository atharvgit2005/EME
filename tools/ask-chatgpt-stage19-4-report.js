/**
 * Ezra Bridge Script: Submit Phase 19 (RT-01) Stage 19.4 Completion Report & Request Final Phase 19 Sign-Off / Next Milestone Directive
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
  console.log('1. Preparing Stage 19.4 Completion Report Submission Prompt...');

  const reportContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_19_STAGE4_COMPLETION_REPORT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

We have completed **Stage 19.4: Delivery Path Unification, Preview Isolation & Multi-Surface Parity** in strict accordance with your Stage 19.4 Directive.

### Summary of Completed Engineering Deliverables & Architectural Invariants:
1. **Single Canonical Delivery Authority**:
   - Consolidated all delivery surfaces onto \`RenderOrchestrator.runClosedLoop\`:
     - REST API (\`POST /api/render\` with \`mode: 'deliver'\`, \`POST /api/deliver\`)
     - Supported CLI delivery (\`eme render <project.json> --deliver\`)
     - Orchestrated Prompt Engine (\`EndToEndOrchestrator.runWorkflow\`)
   - Every delivery execution follows the immutable pipeline:
     $$\\text{Immutable Snapshot} \\to \\text{Preflight Asset Check} \\to \\text{HyperFrames Render} \\to \\text{Independent Media QA} \\to \\text{Delivery Manifest Synthesis} \\to \\text{SHA-256 Digest Verification} \\to \\text{Atomic Active Delivery Promotion}$$

2. **Absolute Preview Isolation**:
   - Preview renders (\`POST /api/render\` with \`mode: 'preview'\` or default) execute strictly into scratch directory (\`artifacts/ui-renders/\`).
   - Emits **zero** delivery manifests, bypasses delivery promotion, and strictly returns \`active_delivery: null\`.
   - \`session.active_delivery\` remains 100% untouched across all preview calls.

3. **Multi-Surface Parity**:
   - Direct REST delivery, CLI delivery, and orchestrated prompt delivery produce identical manifest schemas (\`eme-delivery-manifest.v1.schema.json\`), matching \`active_delivery\` structure (\`delivery_run_id\`, \`revision_id\`, \`media_path\`, \`sha256\`, \`media_sha256\`, \`manifest_id\`, \`published_at\`), and satisfy the $\\ge 85.0$ QA score threshold.

4. **Dedicated Stage 19.4 Test Suite (\`tests/workflow-stage19-4-delivery.test.js\`)**:
   - **12 / 12 PASS in 84.47s (Exit Code: 0)** covering:
     - **RT01-S4.A**: Direct REST Final Delivery routes through canonical closed-loop authority.
     - **RT01-S4.B**: Direct delivery and prompt delivery achieve full schema & artifact parity.
     - **RT01-S4.C**: Supported CLI delivery command (\`eme render --deliver\`) invokes closed-loop pipeline.
     - **RT01-S4.D**: Preview rendering isolation preserves active_delivery and emits zero delivery manifests.
     - **RT01-S4.E**: Render failure prunes scratch media and leaves active_delivery untouched.
     - **RT01-S4.F**: Media QA threshold failure aborts deliverable publication and preserves active_delivery.
     - **RT01-S4.G**: Manifest SHA-256 integrity mismatch fails closed without promoting delivery.
     - **RT01-S4.H**: Duplicate delivery request with identical idempotency key returns cached deliverable.
     - **RT01-S4.I**: Lost response recovery restores committed deliverable without re-execution.
     - **RT01-S4.J**: Process restart during delivery recovers safely and preserves last-known-good active delivery.
     - **RT01-S4.K**: Concurrent live timeline mutation during delivery binds to immutable snapshot (409 Conflict).
     - **RT01-S4.L**: Active-delivery preservation across adversarial battery of failed delivery attempts.

5. **Master Repository Regression Battery**:
   - **513 / 513 PASS in 170.98s (Exit Code: 0)** across all 12 test suites, 60 test files, and 13 functional subsystems.

Here is the complete Stage 19.4 Completion Report (\`plans/PHASE_19_STAGE4_COMPLETION_REPORT.md\`):

---

${reportContent}

---

Please review our Stage 19.4 Completion Report, issue your formal sign-off for the completion of Phase 19 (RT-01), and provide the architectural directive for the next milestone phase in our continuous execution roadmap.`;

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

  await sleep(500);

  console.log('3. Injecting completion submission into div.ProseMirror[aria-label="Ask ChatGPT"]...');
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

  console.log('6. Awaiting ChatGPT Stage 19.4 Review & Next Directive in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Please review our Stage 19.4 Completion Report";

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';

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
        console.log(`\n✅ Stage 19.4 Review & Directive received! (${data.len} characters)`);
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
    const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE19_4_COMPLETION_REVIEW.md');
    fs.writeFileSync(outPath, finalMarkdown, 'utf8');
    console.log(`\n✅ Saved Architecture Lead review to: ${outPath}`);
  } else {
    console.error('\n❌ Timed out waiting for ChatGPT review response.');
  }
}

main().catch(console.error);
