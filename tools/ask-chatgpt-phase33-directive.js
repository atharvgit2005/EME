/**
 * Ezra Bridge Script: Solicit Phase 33 Architecture Directive from ChatGPT Architecture Lead
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
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  return (res.stdout || "").trim();
}

async function main() {
  console.log('1. Preparing Phase 33 Architecture Directive Request Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 33 Architecture Directive & Milestone Charter Request)";

  const promptText = `${promptAnchor},

Phase 32 has reached **UNCONDITIONAL FINAL MILESTONE CERTIFICATION**:
- Substantive implementation commit: \`f4b2872322d8616170d10c550dbadfbba66eb56b\` (exact rational arithmetic \`BigInt\` coordinate contract, closing Finding C).
- Sealed candidate release commit: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (all 8 Stage 32.6 audit artifacts checksum-verified, complete evidence chain sealed).
- Release tag \`phase-32-certified\` has been created against \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\`.
- Cumulative regression battery: 592/592 tests passing across 61 test files (50 runner suites).
- 18 canonical schemas strictly 100% byte-identical.
- Zero runtime npm dependencies.
- \`OperationExecutor\` sole canonical mutation authority.
- Predecessor tags \`phase-31-certified\`, \`phase-32-5-certified\`, and \`phase-32-certified\` are fully intact and immutable.

The user has issued the directive to "continue" and proceed to the next milestone.

In strict accordance with your final ruling (*"Phase 33 remains outside the authorized scope and requires a separate decision"*), we now formally solicit your **Phase 33 Architecture Lead Directive, Milestone Charter, and Stage Breakdown**.

Please provide the complete, formal engineering specification and execution directive for **Phase 33**, including:

1. **Milestone Title, Core Mission & Architectural Scope**:
   - Define the primary objective of Phase 33 (e.g. Multi-Modal Audio-Visual Composition Synthesis combining Earshot audio-beat intelligence with Phase 32 visual intelligence, or Large-Scale 250+ Project Corpus Expansion [REM-04], or End-to-End Autonomous Revision Execution).
   - Clarify the architectural boundaries: what is in scope vs. strictly out of scope.

2. **Stage-by-Stage Breakdown**:
   - Formal numbered stages (e.g. Stages 33.1 through 33.6) with explicit objectives, required work, and acceptance criteria for each stage.

3. **Canonical Architecture Invariant Preservation**:
   - Strict enforcement of the 18 frozen schemas (\`schema/eme-*.schema.json\` byte-identical).
   - 120,000 integer ticks/second timebase standard.
   - \`OperationExecutor\` sole mutation authority (\`OP-AUTH\`).
   - Active delivery safety and non-destructive execution.
   - Zero runtime npm dependencies (\`package.json\` \`"dependencies": undefined\`).
   - Zero model weights or Python runtime dependencies in core package.

4. **Entry Gates & Pre-flight Prerequisites**:
   - Specific entry validation requirements prior to initiating Stage 33.1.

5. **Benchmark Corpus, Datasets & Quality Gates**:
   - Target datasets, synthetic or real benchmark scenarios, defect/composition taxonomies, and numbered quality gates (e.g. GATE-01 through GATE-06) with explicit mathematical or operational acceptance thresholds.

6. **Evidence Bundle Layout & Audit Artifact Specification**:
   - Exact directory structure and artifacts required for intermediate stage reviews and final milestone certification.

7. **Strict Pass/Fail & Certification Policy**:
   - Release gates, blocking conditions, and go/no-go requirements for Phase 33 certification.

8. **Release Boundary**:
   - Explicit scope boundary committing that Phase 34 remains strictly unauthorized.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Phase 33 Directive Request into ChatGPT composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector("div[contenteditable='true'][aria-label='Ask ChatGPT']") ||
               document.querySelector("#prompt-textarea") ||
               document.querySelector("[contenteditable='true']");
    if (!el) return JSON.stringify({ error: "NO_COMPOSER" });

    el.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
    document.execCommand("delete", false);
    const ok = document.execCommand("insertText", false, ${JSON.stringify(promptText)});

    const form = el.closest("form") || el.closest("[data-composer-body]") || el.parentElement.parentElement.parentElement;
    const sendBtn = form ? form.querySelector("button[aria-label='Send'], button[data-testid*='send']") : null;

    return JSON.stringify({
      success: ok,
      length: el.innerText.length,
      hasSendBtn: !!sendBtn,
      sendAria: sendBtn ? sendBtn.getAttribute("aria-label") : null
    });
  })()`);
  console.log('   Injection result:', injectRes);

  let parsedInj = {};
  try {
    parsedInj = JSON.parse(injectRes);
  } catch (e) {
    console.error('Failed to parse injection response:', injectRes);
    process.exit(1);
  }

  if (!parsedInj.success || parsedInj.length < 500) {
    console.error('Composer injection did not succeed:', parsedInj);
    process.exit(1);
  }

  console.log('4. Waiting 1 second and clicking Send button...');
  await sleep(1000);

  let clickedSend = false;
  for (let b = 0; b < 10; b++) {
    const sendRes = runOsa(`(() => {
      const btn = document.querySelector('button[aria-label="Send"], button[data-testid="send-button"]');
      if (!btn || btn.disabled) return "NO_SEND_BUTTON";
      btn.click();
      return "CLICKED_SEND";
    })()`);
    console.log(`   [Attempt ${b + 1}/10] Send:`, sendRes);
    if (sendRes === 'CLICKED_SEND') {
      clickedSend = true;
      break;
    }
    await sleep(1000);
  }

  if (!clickedSend) {
    console.error('Failed to click send button after 10 attempts.');
    process.exit(1);
  }

  console.log('5. Awaiting ChatGPT Architecture Lead Phase 33 Directive generation...');
  let completed = false;
  let finalMarkdown = '';

  await sleep(6000);

  for (let attempt = 0; attempt < 180; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid*="stop"]');
      const isGenerating = !!stopBtn;

      const main = document.querySelector('main') || document.body;
      const text = main ? main.innerText : "";

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        return JSON.stringify({ isGenerating, pIdx: -1, len: 0, text: "" });
      }

      const afterPrompt = text.slice(pIdx);
      let responseText = "";
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx !== -1) {
        responseText = afterPrompt.slice(mIdx + marker.length).trim();
      } else {
        responseText = afterPrompt.trim();
      }

      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        pIdx,
        len: responseText.length,
        text: responseText
      });
    })()`);

    let parsed = {};
    try {
      parsed = JSON.parse(checkRes);
    } catch (e) {
      console.log(`   [Attempt ${attempt + 1}/180] Waiting for JSON response...`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/180] Generating: ${parsed.isGenerating}, Length: ${parsed.len}`);

    if (!parsed.isGenerating && parsed.len > 1000 && !parsed.text.startsWith(promptAnchor)) {
      console.log('   ChatGPT Architecture Lead response received!');
      finalMarkdown = parsed.text;
      completed = true;
      break;
    }
  }

  if (!completed) {
    console.error('Timed out waiting for ChatGPT Architecture Lead response.');
    process.exit(1);
  }

  const outPath = path.resolve('plans/CHATGPT_PHASE33_DIRECTIVE.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Phase 33 Directive saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown.slice(0, 1500) + '...\n');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
