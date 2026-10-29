/**
 * Ezra Bridge Script: Submit Stage 32.2 Reconciliation & Final Acceptance Package to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 32.2 Reconciliation & Final Acceptance Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 32 Stage 32.2 Reconciliation & Final Acceptance Package)";

  const promptText = `${promptAnchor},

We are submitting the formal **Stage 32.2 Reconciliation & Final Acceptance Package** in direct response to your Stage 32.2 Acceptance Ruling (\`plans/CHATGPT_STAGE32_2_APPROVAL.md\`).

All findings identified in your ruling—**Finding A (Intended Trajectory Placement Deviation vs. Smoothness)**, **Finding B (Fail-Closed Minimum Temporal Samples & Negative Test Proof)**, **Preserved Versioning (Version 1.1.0 Amendment)**, and the **Stage 32.3 Scope Boundary Affirmation**—have been rigorously implemented, tested, documented, and committed on branch \`feature/phase-32-2-synthetic-benchmark\` (commit \`bea92c6\`) against baseline \`c584336\`.

Below is the complete point-by-point closure report, mathematical formulations, test evidence, and updated checksum manifest.

---

### 1. Point-by-Point Closures

#### Finding A: Intended Trajectory Deviation Primary Gate (GATE-04) & Smoothness Diagnostic (DIAG-04) — CLOSED
- **Primary Acceptance Gate (GATE-04):**
  - Rather than treating second-difference RMS as the sole metric, GATE-04 is formally defined as the **peak Euclidean positional deviation relative to the frozen intended ground-truth trajectory**:
    $$e_t = \\| P_t - P_t^* \\|_2 \\times S_{\\text{ref}} = \\sqrt{(X_t - X_t^*)^2 + (Y_t - Y_t^*)^2} \\times S_{\\text{ref}}$$
    where:
    - $P_t = (X_t, Y_t)$ is the observed graphic anchor position in the rendered output (canonical top-left anchor).
    - $P_t^* = (X_t^*, Y_t^*)$ is the frozen intended anchor position from ground truth.
    - $S_{\\text{ref}} = \\frac{\\sqrt{1920^2 + 1080^2}}{\\sqrt{W_{\\text{source}}^2 + H_{\\text{source}}^2}}$ is the canonical diagonal resolution normalization factor.
  - **Primary Acceptance Criterion:**
    $$\\max_{t \\in T_{\\text{valid}}} e_t < 2.0\\text{ px}$$
  - $T_{\\text{valid}}$ strictly excludes only the frames and transition intervals explicitly designated in the frozen annotation protocol, such as declared shot cuts (e.g., tick 300,000 in clip \`SCEN-C03-LATERAL-MOTION-SHOT-CUT\`). Frames without an intended placement are rejected or explicitly excluded per protocol; no difficult frames are silently omitted.
- **Secondary Diagnostic (DIAG-04):**
  - Second-difference RMS discrete acceleration error is retained strictly as a secondary smoothness diagnostic:
    $$\\text{RMS}_{\\text{smoothness}} = \\sqrt{\\frac{1}{M} \\sum_{t \\in T_{\\text{valid}}} \\left[(\\Delta^2 X_t)^2 + (\\Delta^2 Y_t)^2\\right]} \\times S_{\\text{ref}} < 2.0\\text{ px}$$
  - The specification explicitly documents that smoothness is **not** a substitute for placement accuracy.
- **Negative Test Proof (\`BM-21c\`):**
  - Added unit test \`BM-21c\` which evaluates an intentionally displaced trajectory (parallel offset by $+15.0\\text{ px}$ from intended trajectory while maintaining perfect linear constant velocity).
  - Test result: Passes the smoothness diagnostic with $\\text{RMS}_{\\text{smoothness}} = 0.000\\text{ px}$, but **strictly fails** the primary GATE-04 intended-trajectory deviation gate ($e_{\\max} = 15.000\\text{ px} \\ge 2.0\\text{ px}$), proving the metric discriminator is active and uncompromising.

#### Finding B: Fail-Closed Minimum Temporal Sample Requirement — CLOSED
- **Minimum Sample Rule:**
  - Valid evaluation requires at least 3 valid, monotonically increasing temporal samples ($t_1 < t_2 < t_3$).
  - Evaluators must **never** return zero jitter or a passing gate on insufficient data.
- **Fail-Closed Behavior:**
  - Trajectories with $<3$ samples return \`status: "NOT_EVALUABLE"\`, \`passesGate: false\`, and \\(e_{\\max} = \\text{Infinity}\\).
  - Trajectories with duplicate timestamps or inverted non-monotonic timestamps return \`status: "INVALID_TIMESTAMPS"\`, \`passesGate: false\`, and \\(e_{\\max} = \\text{Infinity}\\).
- **Comprehensive Boundary Unit Tests Added:**
  - \`BM-27a\`: Trajectory with $<3$ points returns \`status: "NOT_EVALUABLE"\` and fails GATE-04.
  - \`BM-27b\`: Insufficient intended trajectory comparison returns \`status: "NOT_EVALUABLE"\` and fails GATE-04.
  - \`BM-28\`: Duplicate frame timestamps trigger \`INVALID_TIMESTAMPS\` and fail GATE-04.
  - \`BM-29\`: Non-monotonic / inverted timestamps trigger \`INVALID_TIMESTAMPS\` and fail GATE-04.

#### Non-Destructive Versioning (Version 1.1.0 Amendment) — CLOSED
- The original Version 1.0.0 scoring specification is preserved in the revision history table.
- Upgraded specification to **Version 1.1.0** across both \`artifacts/phase-32/stage-32.2/scoring-specification.md\` and \`scoring-specification.json\`.
- Historical predecessor entries formally record:
  \`"historicalPredecessors": [{ "version": "1.0.0", "frozenAt": "2026-10-23T23:00:00.000Z", "status": "SUPERSEDED_BY_FINDINGS_A_AND_B" }]\`.
- All updates are frozen prior to any solver or model touching the held-out partition.

#### Stage 32.3 Scope Boundary Affirmation — ALIGNED
- The team formally confirms and adopts the approved Phase 32 roadmap sequence:
  - **Stage 32.3:** Strictly **"Deterministic Constraint Solver and VQA Gates"** (evaluating deterministic anchor solvers and spatial/temporal QA against known-good synthetic sidecars).
  - **Stage 32.4:** Dedicated to **"Offline Vision Worker & Model Extraction Pipeline"**.
- Absolutely zero visual extraction worker pipelines, Python bindings, or ML model downloads will be introduced in Stage 32.3.
- The pre-declared 8 dev / 4 held-out partition remains untouched by solver tuning.

---

### 2. Implementation Deliverables & Checksums

All updated Stage 32.2 artifacts have been verified with \`shasum -c artifacts/phase-32/stage-32.2/evidence-inventory.sha256\` (100% OK):

| File Path | Version / Status | SHA-256 Digest |
| :--- | :--- | :--- |
| \`src/benchmarks/visual-benchmark-evaluator.js\` | v1.1.0 Evaluator | \`9b29cb27d8e8749aef630256247c70c0c0e1ae58e9821a8b98e169422df5ef76\` |
| \`tests/workflow-stage32-2-synthetic-benchmark.test.js\` | 41/41 Pass Suite | \`f99d63c462319ef46dc8fe0da245d625d97f3532c589b3f3a0937a858ea285f5\` |
| \`artifacts/phase-32/stage-32.2/scoring-specification.md\` | v1.1.0 Spec | \`99d3dcfe71b9cf27c62bb9e5d4cb077c5c0d5c0b8d5a15383561a7a4094fc1df\` |
| \`artifacts/phase-32/stage-32.2/scoring-specification.json\` | v1.1.0 JSON | \`b7d9b9365e6484196e8e50b4ba7bf6170624a919426f633391ea2803b9b47000\` |
| \`artifacts/phase-32/stage-32.2/stage-report.md\` | Report Addendum | \`4c40b85292a8fc8486111f185efc4e3658ebc7eb22f98e6c46927daafaaae019\` |
| \`artifacts/phase-32/stage-32.2/evidence-inventory.sha256\` | Master Ledger | 46 entries verified OK |

---

### 3. Automated Test Verification Results (41/41 Pass)

Execution of \`node --test tests/workflow-stage32-2-synthetic-benchmark.test.js\`:

\`\`\`
▶ Stage 32.2: Synthetic Benchmark & Ground Truth Metric Suite
  ▶ Section 1: Corpus Manifest, Inventory & Split Verification
    ✔ BM-01: Fixture inventory manifest exists and parses with 12 clips (0.94ms)
    ✔ BM-02: Held-out inventory strictly reflects 4 withheld evaluation clips (0.30ms)
    ✔ BM-03: All 12 MP4 fixture files exist and match registered SHA-256 fingerprints (7.14ms)
    ✔ BM-04: Ground-truth annotation files and sidecar files exist for all 12 clips (0.37ms)
  ✔ Section 1: Corpus Manifest, Inventory & Split Verification (9.85ms)
  ▶ Section 2: Ground-Truth Integrity & Contract Validation (GATE-06)
    ✔ BM-05: All 12 sidecar files strictly validate against eme-visual-intelligence.v1 schema (17.24ms)
    ✔ BM-06: Timebase and integer confidence rules strictly verified across all sidecars (3.77ms)
  ✔ Section 2: Ground-Truth Integrity & Contract Validation (GATE-06) (21.18ms)
  ▶ Section 3: Face Collision Rate Calculation (GATE-01)
    ✔ BM-07: Detects collision when graphic overlaps face rectangle (0.40ms)
    ✔ BM-08: Confirms zero collision when graphic is in negative space (0.11ms)
    ✔ BM-09: Pixel-edge touching boundary has zero positive overlap area (0.06ms)
    ✔ BM-10: Multi-subject collision handles multiple overlapping faces correctly (0.09ms)
  ✔ Section 3: Face Collision Rate Calculation (GATE-01) (0.91ms)
  ▶ Section 4: Observation Coverage & Recall (GATE-02A & GATE-02B)
    ✔ BM-11: IoU calculation strictly computes bounding box intersection over union (0.12ms)
    ✔ BM-12: Complete 100% face recall when all ground-truth faces matched (1.16ms)
    ✔ BM-13: Accurately counts False Negatives when face detection is omitted (0.11ms)
  ✔ Section 4: Observation Coverage & Recall (GATE-02A & GATE-02B) (1.53ms)
  ▶ Section 5: Text Relative Contrast Ratio (GATE-03)
    ✔ BM-14: Pure white text on pure black background yields maximum 21.0 contrast (0.12ms)
    ✔ BM-15: White text on light grey background (<4.5:1) fails WCAG AA threshold (0.06ms)
    ✔ BM-16: Evaluates multi-sample regional background taking worst-case local contrast (0.10ms)
    ✔ BM-17: Black text on bright yellow/white background satisfies >= 4.5:1 (0.04ms)
  ✔ Section 5: Text Relative Contrast Ratio (GATE-03) (0.45ms)
  ▶ Section 6: Temporal Placement Jitter (GATE-04)
    ✔ BM-18: Constant-velocity linear trajectory yields exactly 0.000 px jitter (0.14ms)
    ✔ BM-19: Unintended high-frequency oscillation triggers jitter gate violation (> 2.0 px) (0.15ms)
    ✔ BM-20: Shot cut boundary correctly excluded from second-difference calculation (0.07ms)
    ✔ BM-21: Resolution normalization scales 4K jitter to canonical 1080p reference (0.04ms)
    ✔ BM-21b: Primary GATE-04 intended-trajectory deviation correctly evaluates max e_t < 2.0 px (0.13ms)
    ✔ BM-21c: Negative test: wrong-but-smooth trajectory passes smoothness diagnostic but FAILS intended-trajectory deviation gate (0.05ms)
  ✔ Section 6: Temporal Placement Jitter (GATE-04) (0.73ms)
  ▶ Section 7: Deterministic Computation & Invariance (GATE-05)
    ✔ BM-22: VisualBenchmarkEvaluator outputs are 100% bit-identical across runs (0.06ms)
    ✔ BM-23: Contrast evaluation produces bitwise-identical results across runs (0.05ms)
  ✔ Section 7: Deterministic Computation & Invariance (GATE-05) (0.22ms)
  ▶ Section 8: Invalid Inputs & Boundary Enforcement
    ✔ BM-24: Rejects null/malformed graphic rectangle in collision calculation (0.16ms)
    ✔ BM-25: Rejects non-array faceRects in collision calculation (0.04ms)
    ✔ BM-26: Rejects empty background samples in contrast evaluation (0.04ms)
    ✔ BM-27a: Insufficient temporal samples (< 3 points) returns NOT_EVALUABLE and FAILS gate (0.05ms)
    ✔ BM-27b: Insufficient intended trajectory comparison returns NOT_EVALUABLE and FAILS gate (0.04ms)
    ✔ BM-28: Duplicate timestamps trigger INVALID_TIMESTAMPS and fail evaluation (0.04ms)
    ✔ BM-29: Non-monotonic frame timestamps trigger INVALID_TIMESTAMPS and fail evaluation (0.04ms)
  ✔ Section 8: Invalid Inputs & Boundary Enforcement (0.56ms)
✔ Stage 32.2: Synthetic Benchmark & Ground Truth Metric Suite (36.31ms)
ℹ tests 41
ℹ suites 0
ℹ pass 41
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
\`\`\`

Regression test suite summary:
- \`workflow-stage32-1-visual-contract.test.js\`: 39/39 pass
- \`workflow-stage32-2-synthetic-benchmark.test.js\`: 41/41 pass
- Predecessor milestone \`workflow-stage31-6-certification.test.js\`: 31/31 pass
- Total combined: **111 tests passed, 0 failed, 0 skipped**.

---

### 4. Boundary & Invariance Audit

- [x] **Canonical Schema Invariance:** All 18 canonical schemas (\`schema/eme-*.schema.json\`) remain strictly untouched and byte-identical to \`phase-31-certified\`.
- [x] **Zero Dependencies & Zero Model Weights:** Implemented entirely in native Node.js \`>=20\` and deterministic ffmpeg lavfi generator without third-party npm packages or ML weights.
- [x] **Fail-Closed Verification:** Trajectories with insufficient samples or non-monotonic timestamps fail closed with \`NOT_EVALUABLE\` / \`INVALID_TIMESTAMPS\`.
- [x] **Pre-Declared Partition:** 8 dev / 4 held-out partition remains untuned and locked.
- [x] **Roadmap Sequence:** Stage 32.3 chartered strictly as "Deterministic Constraint Solver and VQA Gates".

---

### 5. Final Certification & Progression Request

With Findings A and B closed, negative proof verified, Version 1.1.0 frozen, and all 41 unit tests passing:
1. Do you grant unconditional final acceptance and certification for **Stage 32.2 ("Synthetic Benchmark and Ground Truth")**?
2. Do you formally authorize progression to **Stage 32.3 ("Deterministic Constraint Solver and VQA Gates")** under the approved Phase 32 charter?`;

  console.log('2. Writing prompt copy to scratch/stage32-2-reconciliation-prompt.txt...');
  fs.mkdirSync(path.resolve('scratch'), { recursive: true });
  fs.writeFileSync(path.resolve('scratch/stage32-2-reconciliation-prompt.txt'), promptText, 'utf8');

  console.log('3. Injecting Stage 32.2 Reconciliation Prompt into [aria-label="Ask ChatGPT"] composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector("div[contenteditable=\x27true\x27][aria-label=\x27Ask ChatGPT\x27]");
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
    const sendBtn = form ? form.querySelector("button[aria-label=\x27Send\x27], button[data-testid*=\x27send\x27]") : null;

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
      const btn = document.querySelector(\x27button[aria-label="Send"], button[data-testid="send-button"]\x27);
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 32.2 Ruling...');
  let completed = false;
  let finalMarkdown = '';

  // Initial wait for generation start
  await sleep(6000);

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector(\x27button[aria-label*="Stop"], button[data-testid*="stop"]\x27);
      const isGenerating = !!stopBtn;

      const main = document.querySelector(\x27main\x27) || document.body;
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
      console.log(`   [Attempt ${attempt + 1}/90] Waiting for JSON response...`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/90] Generating: ${parsed.isGenerating}, Length: ${parsed.len}`);

    if (!parsed.isGenerating && parsed.len > 150) {
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

  const outPath = path.resolve('plans/CHATGPT_STAGE32_2_FINAL_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 32.2 Final Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
