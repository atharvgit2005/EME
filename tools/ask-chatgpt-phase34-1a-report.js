/**
 * Ezra Bridge Script: Submit Phase 34.1A Native Creative Director Foundation Engineering Report to ChatGPT Architecture Lead
 * Milestone: EME Phase 34.1A — Native Creative Director Foundation (First End-to-End Vertical Slice)
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
  console.log('1. Preparing Phase 34.1A Engineering Report Submission Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 34.1A Native Creative Director Foundation — Engineering Report & Submission)";

  const promptText = `${promptAnchor},

In accordance with your directive for **Phase 34.1A: Native Creative Director Foundation (First End-to-End Vertical Slice)** and the **Additional Requirement — Human Subject Centering & 9:16 Reframing**, the engineering team submits the completed implementation and automated verification evidence package.

Current branch: \`feature/phase-34-1a-creative-director\`  
Implementation commit: \`6d2f739\`  
Predecessor base: \`9d591cc\` (\`feature/phase-33-5-e2e-execution\`)  

---

### 1. Phase 34.1A Deliverables Summary

1. **Creative Plan Contract (\`schema/eme-creative-plan.v1.schema.json\`)**:
   - Represents schema version (\`1.0.0\`), unique plan ID (\`creative-plan-*\`), source request ID, and project snapshot with base revision.
   - Captures creative intent (goal, audience, style, pacing, desired outcome), explicit deliverable constraints (width, height, aspect ratio, rational frame rate, integer target duration ticks).
   - Ordered narrative beats with half-open integer intervals \`[start_tick, end_tick)\`, source media references, and editorial decisions.
   - Time-coded visual events, typography, motion graphics, and title-safe collision-avoidance spatial constraints.
   - Audio direction (dialogue ducking depth in dB, soundtrack selection, attack/release ticks).
   - Explicit unsupported feature declarations and permitted fallback policies.
   - Full model, input brief hash, context snapshot hash, and plan hash provenance.
   - **Enforces EME's canonical 120,000 ticks/sec timebase and integer arithmetic exclusively**.

2. **Grounded Creative Context Builder (\`src/creative/creative-context-builder.js\`)**:
   - Compiles genuine context from user brief, canonical project state, media assets catalog, speech transcripts, VTSM tracking sidecars, and beat grids.
   - **Honesty Invariant**: Explicitly distinguishes between \`AVAILABLE\`, \`MISSING\`, and \`UNCERTAIN\` evidence. Zero fabrication of transcripts, tracking, or music assets.
   - Reflects actual verified EME engine operations and renderer capabilities, surfacing known unsupported features (\`curved_svg_typography\`, \`optical_fisheye_distortion_shader\`, \`perspective_3d_transform\`).

3. **Subject-Aware Reframing Engine (\`src/creative/reframing-engine.js\`)**:
   - Implements **Human Subject Centering & 9:16 Reframing**:
     - Analyzes upper-body composition across face, head, torso, and both shoulder landmarks.
     - Anchors framing to preserve both shoulders fully whenever source permits (balanced side margins; zero one-sided shoulder clipping).
     - Maintains natural headroom (12%-18%) without rotating footage for natural posture or head tilt.
     - Applies temporal smoothing (EMA with micro-movement deadzones) across frame trajectories to eliminate horizontal jitter.
     - Employs fail-closed fallback to verified geometric center when tracking is missing or confidence is low, without inventing coordinates.

4. **Runtime LLM Adapter (\`src/creative/adapter/runtime-llm-adapter.js\`)**:
   - Replaceable model architecture with base \`BaseLlmAdapter\`.
   - Authorized \`ProviderLlmAdapter\` using Node 20 native fetch (OpenAI / Gemini / Anthropic compatible).
   - Strict credential gate: fails closed immediately with \`ERR_LLM_AUTH_MISSING\` if API keys are absent (never silently degrades to mock).
   - Typed error taxonomy (\`ERR_LLM_AUTH_FAILED\`, \`ERR_LLM_RATE_LIMIT\`, \`ERR_LLM_TIMEOUT\`, \`ERR_LLM_MALFORMED_OUTPUT\`, \`ERR_LLM_INVALID_PLAN_SCHEMA\`, \`ERR_LLM_ABORTED\`).
   - Bounded exponential backoff retries and \`AbortController\` cancellation support.
   - Deterministic \`MockLlmAdapter\` for rock-solid, hermetic CI verification.
   - Safe provenance: zero secrets leaked into logs or serialized plans.

5. **Native Creative Plan Compiler (\`src/creative/creative-plan-compiler.js\`)**:
   - Translates creative decisions into canonical declarative operations (\`add_track\`, \`insert_clip\`, \`trim_clip\`, \`animate_property\`, \`delete_clip\`).
   - Reuses \`schema/eme-operation-plan.v1.schema.json\` and dry-runs via \`OperationExecutor\` on a cloned candidate state.
   - Surfaces unsupported features as structured declarations and rejects unhandled demands.
   - **Zero mutation during compilation or dry run**.

6. **Durable Plan Store (\`src/creative/plan-store.js\`)**:
   - Persists accepted plans under \`artifacts/creative-plans/\`.
   - Content-addressed SHA-256 fingerprint verification on retrieval (rejects corrupted/tampered plans with \`ERR_PLAN_INTEGRITY_MISMATCH\`).
   - Replay consumes previously accepted plan without re-invoking the LLM.

7. **Native Creative Director Coordinator (\`src/creative/creative-director.js\`)**:
   - Single authoritative entry point orchestrating context -> LLM inference -> validation -> persistence -> native compilation -> dry-run -> execution.
   - Sole mutation authority preserved strictly in \`OperationExecutor\`.

---

### 2. Automated Test Suite Results (\`tests/creative-director-phase34-1a.test.js\`)

Execution command:
\`node --test tests/creative-director-phase34-1a.test.js tests/workflow-stage33-4-composition-solver.test.js tests/workflow-stage33-5-e2e-execution.test.js\`

Results:
- **Total Tests Executed**: **82 / 82 PASSED (100%)**
- **Failures**: **0**
- **Cancellations**: **0**
- **Duration**: **139.7ms**

#### Functional Breakdown:
- **Suite 1 (Creative Plan Schema & Semantic Invariants)**: 8/8 passed. Strict integer timebase, half-open intervals, beat sequence monotonicity, asset reference integrity, stale revision guard.
- **Suite 2 (Grounded Creative Context Builder)**: 5/5 passed. Media catalog verification, transcript absence honesty, genuine transcript ingestion, VTSM absence honesty, engine capabilities.
- **Suite 3 (Human Subject Centering & 9:16 Reframing)**: 5/5 passed. Centered subject with both shoulders visible, off-center subject with preserved right shoulder, asymmetric posture without camera tilt, missing tracking geometric fallback, trajectory EMA smoothing.
- **Suite 4 (Runtime LLM Adapter & Failure Modes)**: 8/8 passed. Mock determinism, provider fail-closed missing auth, timeout error handling, rate limit handling, auth error handling, malformed output handling, schema violation rejection, AbortController cancellation.
- **Suite 5 (Native Compilation Boundary & Dry Run)**: 3/3 passed. Compilation to canonical OperationPlan, unsupported feature refusal, zero mutation during dry-run.
- **Suite 6 (Persistence, Replay & Integrity)**: 3/3 passed. Durable persistence & retrieval, tamper detection with hash verification, replay without LLM re-invocation.
- **Suite 7 (Authoritative Execution via OperationExecutor)**: 2/2 passed. Canonical execution through OperationExecutor, rollback on failure with zero project mutation.
- **Suite 8 (Real-Model Smoke Test Gate)**: 1/1 passed. Truthful evaluation of runtime credentials.
- **Predecessor Invariants (Stage 33.4 & 33.5)**: 47/47 passed.

---

### 3. Truthful Real-Model Smoke Test Gate Disposition

In accordance with Workstream 7 requirements:
- Credential check in current environment: \`OPENAI_API_KEY\` / \`EME_LLM_API_KEY\` is **absent**.
- **Reported Smoke Test Disposition**: **BLOCKED** (credential-dependent requirement honestly reported as BLOCKED, not falsely claimed as passed).
- The complete HTTP networking path, request serialization, error taxonomy, cancellation, and validation pipelines are implemented and verified via unit and simulated network tests.

---

### 4. Action Requested

The engineering team respectfully requests:
1. Architectural review and formal ruling on **Phase 34.1A: Native Creative Director Foundation**.
2. Direction on the next implementation milestone.`;

  console.log('2. Locating active ChatGPT tab in Brave Browser...');
  const tabCheck = runOsa(`(() => {
    return window.location.href;
  })()`);
  console.log('   Current tab URL:', tabCheck);

  if (tabCheck === 'NO_TAB') {
    console.error('Error: Could not find Brave Browser tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }

  console.log('3. Injecting Phase 34.1A submission text into ChatGPT ProseMirror editor...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('div.ProseMirror:not(.content-xaiQhS)');
    if (!el) return 'NO_PROSEMIRROR';
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, ${JSON.stringify(promptText)});
    return ok ? 'INJECTED_OK' : 'INJECT_FAILED';
  })()`);
  console.log('   Injection status:', injectRes);

  console.log('4. Waiting 2 seconds and clicking Send button...');
  await sleep(2000);

  let clickedSend = false;
  for (let b = 0; b < 10; b++) {
    const sendRes = runOsa(`(() => {
      const btn = document.querySelector('button[aria-label="Send"], button[aria-label="Send prompt"], button[aria-label="Send message"], button[data-testid="send-button"]');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Ruling...');
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
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);

      let responseText = "";
      if (mIdx !== -1) {
        responseText = afterPrompt.slice(mIdx + marker.length).trim();
      }

      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        pIdx,
        len: responseText.length,
        snippet: responseText.slice(0, 200),
        text: responseText
      });
    })()`);

    try {
      const data = JSON.parse(checkRes);
      if (!data.isGenerating && data.len > 200) {
        console.log(`\n✅ ChatGPT Architecture Lead Ruling received! (${data.len} chars)`);
        const outPath = path.join(__dirname, '../plans/CHATGPT_PHASE34_1A_ACCEPTANCE.md');
        fs.writeFileSync(outPath, data.text, 'utf8');
        console.log(`✅ Saved ruling to: ${outPath}`);
        return;
      } else {
        process.stdout.write(`   [Poll ${attempt + 1}/180] Generating=${data.isGenerating}, Length=${data.len} chars...\r`);
      }
    } catch (e) {
      process.stdout.write(`   [Poll ${attempt + 1}/180] Waiting...\r`);
    }
  }

  console.error('\n❌ Timed out waiting for ChatGPT response.');
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
