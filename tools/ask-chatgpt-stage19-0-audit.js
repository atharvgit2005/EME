/**
 * Ezra Bridge Script: Submit Phase 19 (RT-01) Stage 19.0 Integration Audit & Request Stage 19.1 Directive
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
  console.log('1. Preparing Stage 19.0 Integration Audit Submission Prompt...');

  const auditReport = fs.readFileSync(path.join(__dirname, '../plans/PHASE_19_STAGE0_INTEGRATION_AUDIT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

In accordance with your **Phase 19 (RT-01) Kickoff Directive** (\`plans/CHATGPT_PHASE19_KICKOFF_DIRECTIVE.md\`), we have completed **Stage 19.0: Repository Audit, Workflow Baseline & Integration Contract**.

### Key Findings & Reconciliation Summary:
1. **Full Release Commit Identity Recorded**:
   - Annotated release tag \`phase-18-tl-01-certified\` targets exact commit SHA: \`741dde73e818e14994aa907d60bcbea752636558\`.
   - \`schema/eme-project.v1.schema.json\` has 0 diff against the Phase 17 baseline.
2. **Master Test Duration Discrepancy Reconciled**:
   - Focused timeline suites (\`node --test tests/timeline-*.test.js\`): **70 / 70 PASS in 869 ms** (pure in-process algorithmic projection).
   - Full master regression suite (\`npm test\`): **460 / 460 PASS in 87–97s** (dominated by \`tests/vtsm-held-out-integration.test.js\` which takes ~42s running real PyTorch model tracking in external Python workers, plus live FFmpeg video rendering and color parity evaluations).
3. **11 Core Subsystems Audited**:
   - Ingestion (\`context-normalizer.js\`, \`brief-validator.js\`, \`reference-resolver.js\`, \`constraint-normalizer.js\`, \`readiness-evaluator.js\`).
   - Planning (\`operation-plan-compiler.js\`, \`multi-track-scheduler.js\`).
   - State Authority (\`OperationExecutor\` with 22 canonical operations).
   - Session & Job Lifecycle (\`RevisionSessionManager\`, \`OrchestrationJobManager\`).
   - Revision guards, write mutex (\`this.isMutating\`), in-memory LRU idempotency cache (200 entries), and durable job index.
   - Timeline & VCS integration (\`TimelineAdapter\`, \`app.js\`).
   - Rendering (\`HyperFramesCompiler\`, \`HyperFramesRenderer\`, \`FfmpegColorCompiler\`).
   - Verification (\`QualityAssuranceEngine\` 10-point audit, \`FrameInspector\`).
   - Delivery Manifests & Publication (\`RenderOrchestrator\`, SHA-256 verification, fail-safe active delivery preservation).
   - Failure handling, recovery, transaction journals (\`recoverFromJournal\`, checkpoints).
   - Boundaries: Laya Decision Fabric strictly advisory (\`CANARY_ADVISORY_MODE=true\`); VTSM spatial tracking in sidecars.
4. **Unified 12-State Lifecycle Proposed**:
   - Synthesizes Phase 14B (\`eme-job.v1\`) and Phase PF-11 (\`job-orchestrator.js\`) into the 12 logical states requested by the Architecture Lead (\`ACCEPTED\`, \`PLANNING\`, \`AWAITING_APPROVAL\`, \`READY_TO_EXECUTE\`, \`EXECUTING\`, \`VERIFYING\`, \`RENDERING\`, \`PUBLISHING\`, \`SUCCEEDED\`, \`FAILED\`, \`CANCELLED\`, \`NEEDS_RECONCILIATION\`).
5. **Seams Identified for Stage 19.1–19.4**:
   - Coupling low-level \`/api/render\` with closed-loop delivery publication.
   - Preserving compound plan atomicity contracts.
   - Synchronizing manual VCS edits with revision session DAG.

Here is the complete Stage 19.0 Integration Audit document (\`plans/PHASE_19_STAGE0_INTEGRATION_AUDIT.md\`):

---

${auditReport}

---

Please review our Stage 19.0 Integration Audit and issue your formal review and architectural directive for **Stage 19.1: End-to-End Workflow Contract & Orchestration**.`;

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

  console.log('3. Injecting submission into composer...');
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
      return (aria === 'send' || aria.includes('send')) && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return 'CLICKED_SEND';
    }
    return 'NO_SEND_BTN';
  })()`);
  console.log('   Send:', sendRes);

  console.log('5. Awaiting ChatGPT Stage 19.0 Review & Stage 19.1 Directive in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Please review our Stage 19.0 Integration Audit and issue your formal review";

  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[data-testid="stop-button"], button[aria-label*="Stop"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';
      
      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        const marker = "ChatGPT said:";
        const mIdx = text.lastIndexOf(marker);
        if (mIdx !== -1) {
          let resp = text.slice(mIdx + marker.length).trim();
          const footerIdx = resp.lastIndexOf("ChatGPT can make mistakes.");
          if (footerIdx !== -1) resp = resp.slice(0, footerIdx).trim();
          return JSON.stringify({ isGenerating, len: resp.length, snippet: resp.slice(0, 150), text: resp });
        }
        return JSON.stringify({ isGenerating, len: 0, text: '' });
      }

      const afterPrompt = text.slice(pIdx);
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx === -1) return JSON.stringify({ isGenerating, len: 0, text: '' });

      let responseText = afterPrompt.slice(mIdx + marker.length).trim();
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
        console.log(`\n✅ Stage 19.0 Review & Stage 19.1 Directive received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`... awaiting directive (chars: ${data.len}, generating: ${data.isGenerating})\n`);
      }
    } catch (e) {
      console.log('Waiting for response parsing...');
    }
  }

  if (!completed) {
    console.error('Timed out waiting for ChatGPT response.');
    process.exit(1);
  }

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE19_0_AUDIT_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Phase 19 Stage 19.0 Review & Stage 19.1 Directive

**Date**: ${new Date().toISOString()}  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.0 Review  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 19.0 Review to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
