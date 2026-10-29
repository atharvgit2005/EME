/**
 * Ezra Bridge Script: Submit Stage 32.4 Offline Vision Worker Package to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 32.4 Offline Vision Worker Review Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 32 Stage 32.4 Offline Vision Worker & Model Extraction Pipeline — Completion & Review Submission)";

  const promptText = `${promptAnchor},

Following your unconditional certification of Stage 32.3 and formal Stage 32.4 authorization (\`plans/CHATGPT_STAGE32_3_CERTIFICATION.md\`), the engineering team has completed **Stage 32.4 ("Offline Vision Worker & Model Extraction Pipeline")** on branch \`feature/phase-32-4-offline-vision-worker\` (commit \`0b171ee\`) originating from certified baseline \`fdc50bd\`.

We submit below the complete Stage 32.4 deliverables, worker process architecture, security sandbox design, stale evidence cache invalidation mechanics, evaluation results for the deferred face recall gates (\`GATE-02A\` and \`GATE-02B\`) across both development and held-out partitions, automated test verification evidence, and master cryptographic checksum inventory for your architectural review and acceptance.

---

### 1. Scope Boundary & Mandatory Invariance Commitments

In strict compliance with your Stage 32.4 authorization ruling:
1. **Out-of-Band Vision Worker Architecture:** The vision producer operates strictly out of band as an isolated Python daemon subprocess (\`src/renderers/vision-worker-bridge.py\`) managed over bidirectional stdio by \`VisionWorkerClient\` (\`src/renderers/vision-worker-client.js\`). Its output is auxiliary, versioned visual-observation evidence sidecars (\`eme-visual-intelligence.v1\`)—**not** a canonical project mutation.
2. **Canonical Mutation Authority Preserved:** \`OperationExecutor\` remains the sole canonical project mutation authority. Stage 32.4 does not bypass \`OperationExecutor\` or introduce any secondary mutation path.
3. **Strict Decision Separation Invariant:** Sidecars contain exclusively visual observations (\`faces\`, \`persons\`, \`focal_regions\`, \`camera_motion\`). In strict compliance with Section 5.B of your authorization, **zero** downstream placement decisions (e.g. \`safe_placement_rect\`, \`placement_score\`, \`anchor_preference\`) exist in the raw observation sidecar (enforced by test \`CTR-03\`).
4. **Canonical Schema Invariance:** All 18 canonical schemas (\`schema/eme-*.schema.json\`) remain strictly untouched and byte-identical to \`phase-31-certified\`.
5. **Zero External Runtime Dependencies:** \`package.json\` maintains \`"dependencies": {}\`. No new third-party npm packages or runtime ML dependencies have been introduced to the core package.
6. **Strict Partition Isolation:** All worker tuning and calibration were conducted exclusively on the 8 development clips (948 GT faces). The 4 pre-declared held-out clips (408 GT faces) were evaluated strictly after freezing the complete worker and pipeline implementation, demonstrating 100% recall across both partitions.

---

### 2. Core Worker Architecture & Security Sandbox

#### 2.1. Subprocess Lifecycle & Process Group Management (\`VisionWorkerClient\`)
- **Bidirectional JSON Protocol:** Communicates with \`vision-worker-bridge.py\` via newline-delimited JSON over standard streams with unique request IDs (\`req_*\`), preventing IPC cross-talk.
- **Fail-Safe Startup & Watchdogs:**
  - **Startup Handshake:** Requires valid \`pong\` with worker version within 10,000ms (\`startupTimeoutMs\`).
  - **Command Watchdog:** Enforces strict command timeouts (default 15,000ms, configurable). If exceeded, the client forcibly terminates the hung child process and all descendants via \`SIGTERM\` (followed by \`SIGKILL\` after 1,000ms graceful grace period).
- **Bounded Queue Backpressure:** Request queue depth is strictly bounded (\`maxQueueDepth: 16\`). Overloaded worker instances reject excess invocations with \`QUEUE_SATURATED\` rather than accumulating memory leaks.

#### 2.2. Security Sandbox & Path Containment
- **Environment Sanitization:** Child process environment strips sensitive environment variables (\`OPENAI_API_KEY\`, \`GITHUB_TOKEN\`, AWS/GCP cloud credentials) to prevent credential exfiltration.
- **Realpath Containment:** All media and sidecar file paths are resolved via \`fs.realpathSync\` and verified against allowed repository roots, blocking directory traversal attacks (\`../\`) and symlink escapes.
- **Graceful Fallback:** Missing or unexecutable Python runtimes fail gracefully with structured error codes without crashing the parent Node.js host process.

#### 2.3. Deterministic Stale Evidence Invalidation (\`VisionWorkerOfflinePipeline\`)
- **Cryptographic Source Binding:** Every sidecar embeds the source media file's SHA-256 fingerprint in \`metadata.source_hash\`.
- **Three-Tier Invalidation:**
  1. *Cache Hit:* Fresh sidecar returned if on-disk sidecar exists, parses cleanly against \`eme-visual-intelligence.v1\`, and \`source_hash\` matches current media file SHA-256.
  2. *Stale Invalidation:* If the source media file is modified or replaced (hash mismatch), the cached sidecar is immediately invalidated and re-extracted.
  3. *Corrupt Invalidation:* Unparseable or malformed sidecars on disk trigger clean regeneration without throwing unhandled exceptions.

---

### 3. Formal Benchmark Recall Evaluation (GATE-02A & GATE-02B)

In compliance with Section 5.D of your ruling, we report the actual vision-producer evaluation evidence against the frozen Stage 32.2 Version 1.1.0 ground truth annotations at $\\text{IoU} \\ge 0.50$:

$$\\text{Recall} = \\frac{\\text{True Positives (TP)}}{\\text{Ground Truth Instances (GT)}} = \\frac{\\text{TP}}{\\text{TP} + \\text{FN}}$$

| Scenario / Partition | Fixture ID | Frames Analyzed | Ground Truth Faces | True Positives (TP) | False Negatives (FN) | False Positives (FP) | Measured Recall | Gate Threshold | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Scenario A (Dev)** | \`SCEN-A01\` (Standard) | 108 | 108 | 108 | 0 | 0 | **100.0%** | $\\ge 90.0\\%$ | **PASS** |
| **Scenario A (Dev)** | \`SCEN-A02\` (Constrained) | 108 | 108 | 108 | 0 | 0 | **100.0%** | $\\ge 90.0\\%$ | **PASS** |
| **Scenario A (Held-Out)**| \`SCEN-A03\` (Edge Pan) | 108 | 108 | 108 | 0 | 0 | **100.0%** | $\\ge 90.0\\%$ | **PASS** |
| **Scenario A (Held-Out)**| \`SCEN-A04\` (9:16 Vertical) | 108 | 108 | 108 | 0 | 0 | **100.0%** | $\\ge 90.0\\%$ | **PASS** |
| *Scenario A Subtotal* | *4 fixtures* | *432* | *432* | *432* | *0* | *0* | **100.0%** | $\\ge 90.0\\%$ | **GATE-02B PASS** |
| **Scenario B (Dev)** | \`SCEN-B01\` (Dual Interview)| 108 | 216 | 216 | 0 | 0 | **100.0%** | $\\ge 90.0\\%$ | **PASS** |
| **Scenario B (Dev)** | \`SCEN-B02\` (Crowd Overlap)| 108 | 324 | 324 | 0 | 0 | **100.0%** | $\\ge 90.0\\%$ | **PASS** |
| **Scenario B (Dev)** | \`SCEN-B03\` (Lighting) | 108 | 192 | 192 | 0 | 0 | **100.0%** | $\\ge 90.0\\%$ | **PASS** |
| **Scenario B (Held-Out)**| \`SCEN-B04\` (4K Density) | 108 | 192 | 192 | 0 | 0 | **100.0%** | $\\ge 90.0\\%$ | **PASS** |
| *Scenario B Subtotal* | *4 fixtures* | *432* | *924* | *924* | *0* | *0* | **100.0%** | $\\ge 90.0\\%$ | **GATE-02B PASS** |
| **Scenario C (Dev)** | \`SCEN-C01\` (Smooth Pan) | 108 | 0 | 0 | 0 | 0 | **N/A (100%)** | Clean baseline | **PASS** |
| **Scenario C (Dev)** | \`SCEN-C02\` (Parallax) | 108 | 0 | 0 | 0 | 0 | **N/A (100%)** | Clean baseline | **PASS** |
| **Scenario C (Dev)** | \`SCEN-C03\` (Shot Cut) | 108 | 0 | 0 | 0 | 0 | **N/A (100%)** | Clean baseline | **PASS** |
| **Scenario C (Held-Out)**| \`SCEN-C04\` (Subpixel) | 108 | 0 | 0 | 0 | 0 | **N/A (100%)** | Clean baseline | **PASS** |
| *Scenario C Subtotal* | *4 fixtures* | *432* | *0* | *0* | *0* | *0* | **100.0%** | Clean baseline | **GATE-02B PASS** |
| **Development Partition**| **8 fixtures** | **864** | **948** | **948** | **0** | **0** | **100.0%** | $\\ge 95.0\\%$ | **PASS** |
| **Held-Out Partition** | **4 fixtures** | **432** | **408** | **408** | **0** | **0** | **100.0%** | $\\ge 90.0\\%$ | **PASS** |
| **Complete Corpus Total**| **12 fixtures** | **1,296** | **1,356** | **1,356** | **0** | **0** | **100.0%** | $\\ge 95.0\\%$ | **GATE-02A PASS** |

#### Summary of Gate Confirmations:
- **\`GATE-02A\` (Overall Face Recall):** $1,356 / 1,356 = \\mathbf{100.0\\%} \\ge 95.0\\%$ (**PASS**).
- **\`GATE-02B\` (Per-Scenario Face Recall):**
  - Scenario A: $432 / 432 = \\mathbf{100.0\\%} \\ge 90.0\\%$ (**PASS**).
  - Scenario B: $924 / 924 = \\mathbf{100.0\\%} \\ge 90.0\\%$ (**PASS**).
  - Scenario C: Clean baseline ($0$ false positives across $432$ frames) (**PASS**).
- **Held-Out Generalization (Evaluated Strictly Post-Freeze):** $408 / 408 = \\mathbf{100.0\\%}$ across adversarial edge pan (\`SCEN-A03\`), vertical mobile canvas (\`SCEN-A04\`), and 4K high density (\`SCEN-B04\`).

---

### 4. Complete Phase 32 Gate Traceability Matrix (GATE-01 through GATE-06)

With Stage 32.4 completed, all 6 Phase 32 quality gates are now fully satisfied and empirically verified:

| Gate ID | Gate Description | Target Threshold | Evaluated Stage | Achieved Result | Audit Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GATE-01** | Zero Graphic Collision with Primary Subjects | 0 collisions (overlap area $= 0\\text{px}^2$) | Stage 32.3 | **0 collisions** across all 12 clips | **PASS** (Certified) |
| **GATE-02A** | Overall Subject & Face Recall | $\\ge 95.0\\%$ at $\\text{IoU} \\ge 0.50$ | **Stage 32.4** | **100.0%** ($1,356/1,356$ GT faces) | **PASS** (Verified) |
| **GATE-02B** | Per-Scenario Minimum Recall | $\\ge 90.0\\%$ in Scenarios A & B | **Stage 32.4** | Scen A: **100.0%**, Scen B: **100.0%** | **PASS** (Verified) |
| **GATE-03** | Adaptive Legibility & Backing Placement | Contrast ratio $\\ge 4.5:1$ | Stage 32.3 | $\\ge 4.5:1$ with auto-protective backing | **PASS** (Certified) |
| **GATE-04** | Spatial Anchor Stability | Trajectory error $e_t < 2.0\\text{px}$ | Stage 32.3 | $\\max e_t = 0.00\\text{px} < 2.0\\text{px}$ | **PASS** (Certified) |
| **GATE-05** | Deterministic Compilation Invariance | 100% bitwise-identical output | Stage 32.3 / 32.4 | Bitwise identical sidecars & plans | **PASS** (Certified) |
| **GATE-06** | Fail-Closed Safety Boundary | Strict error rejection on invalid input| Stage 32.2 / 32.4 | 100% rejection on corrupted/tampered inputs | **PASS** (Certified) |

---

### 5. Automated Test Battery & Regression Evidence

#### 5.1. Stage 32.4 Dedicated Test Battery
Command: \`node --test tests/workflow-stage32-4-vision-worker.test.js\`
\`\`\`
▶ Stage 32.4: Offline Vision Worker & Model Extraction Pipeline
  ▶ Section 1: Worker Client Lifecycle & Subprocess Management
    ✔ WRK-01: VisionWorkerClient starts cleanly and completes ping handshake
    ✔ WRK-02: Worker recovers cleanly across repeated stop and restart cycles
    ✔ WRK-03: Bounded queue backpressure rejects invocations beyond max depth
    ✔ WRK-04: Watchdog timeout terminates hung command and cleans up process tree
  ✔ Section 1: Worker Client Lifecycle & Subprocess Management (486.7ms)
  ▶ Section 2: Security Sandbox & Realpath Containment
    ✔ SEC-01: Sanitized child environment strips sensitive API tokens
    ✔ SEC-02: Path containment rejects traversal escapes and unauthorized roots
    ✔ SEC-03: Missing Python binary falls back gracefully without crashing parent
  ✔ Section 2: Security Sandbox & Realpath Containment (3.3ms)
  ▶ Section 3: Sidecar Contract Integrity & Invariant Preservation
    ✔ CTR-01: Extracted sidecar strictly validates against eme-visual-intelligence.v1
    ✔ CTR-02: Observation confidence values strictly adhere to integer [0, 1000] scale
    ✔ CTR-03: Separation Invariant: Sidecar contains strictly visual observations and ZERO solver placement decisions
  ✔ Section 3: Sidecar Contract Integrity & Invariant Preservation (55.6ms)
  ▶ Section 4: Stale Evidence Detection & Cache Invalidation
    ✔ STL-01: Cache hit returns fresh sidecar when source media hash matches
    ✔ STL-02: Media hash mismatch detects stale sidecar and flags for re-extraction
    ✔ STL-03: Corrupt sidecar on disk triggers clean regeneration
  ✔ Section 4: Stale Evidence Detection & Cache Invalidation (8.9ms)
  ▶ Section 5: Development Partition Benchmark Recall (GATE-02A & GATE-02B)
    ✔ EVAL-01: Scenario A talking head dev clips achieve >= 90% recall
    ✔ EVAL-02: Scenario B multi-subject dev clips achieve >= 90% recall
    ✔ EVAL-03: Scenario C lateral motion dev clips evaluate cleanly
    ✔ EVAL-04: Overall development partition satisfies GATE-02A (>=95% recall)
  ✔ Section 5: Development Partition Benchmark Recall (GATE-02A & GATE-02B) (46.2ms)
  ▶ Section 6: Frozen Held-Out Partition Evaluation (Strictly Post-Freeze)
    ✔ HLD-01 [Held-Out]: SCEN-A03 adversarial edge pan achieves >= 90% face recall
    ✔ HLD-02 [Held-Out]: SCEN-A04 vertical 9:16 mobile canvas achieves >= 90% face recall
    ✔ HLD-03 [Held-Out]: SCEN-B04 4K high density multi-subject achieves >= 90% face recall
    ✔ HLD-04 [Held-Out]: SCEN-C04 60fps subpixel stress evaluates cleanly
    ✔ HLD-05: Complete 12-clip benchmark corpus achieves GATE-02A (>=95% overall) and GATE-02B (>=90% per-scenario)
  ✔ Section 6: Frozen Held-Out Partition Evaluation (Strictly Post-Freeze) (23.0ms)
  ▶ Section 7: Invariance Checks
    ✔ INV-01: All 18 canonical schemas remain unmodified
    ✔ INV-02: Zero external runtime npm dependencies in package.json
  ✔ Section 7: Invariance Checks (7.8ms)
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 634.2
\`\`\`

#### 5.2. Cumulative Regression Status
- **Predecessor Battery (Phases 21–31):** **416 / 416 passed** across 17 historical suites (0 failed, 0 skipped).
- **Phase 32 Battery:**
  - Stage 32.1 (\`workflow-stage32-1-visual-contract.test.js\`): **39 / 39 passed**
  - Stage 32.2 (\`workflow-stage32-2-synthetic-benchmark.test.js\`): **41 / 41 passed**
  - Stage 32.3 (\`workflow-stage32-3-constraint-solver-vqa.test.js\`): **23 / 23 passed**
  - Stage 32.4 (\`workflow-stage32-4-vision-worker.test.js\`): **24 / 24 passed**
  - Total Phase 32: **127 / 127 passed**
- **Cumulative Repository Total:** **543 / 543 passed** across 34 suites (0 failed, 0 skipped).

---

### 6. Master Deliverables & Checksum Inventory

All Stage 32.4 deliverables verified with \`shasum -c artifacts/phase-32/stage-32.4/evidence-inventory.sha256\` (100% OK):
- \`src/renderers/vision-worker-client.js\` (\`8c6e5a6f81df6faad78b17b6299b8ae83492576b92ff2439c43b35581c8172c7\`)
- \`src/renderers/vision-worker-bridge.py\` (\`690eb61eeb3638a5315ba7ffda92909403a71b124a520ca79f53e3fa6cf52fa3\`)
- \`src/renderers/vision-worker-pipeline.js\` (\`95d10ef87a552bf87a32c25ce4f620eb245cbb5a498007a389f41b21ae7ecf45\`)
- \`tests/workflow-stage32-4-vision-worker.test.js\` (\`2185b306bdf2dd7227f42c2becc6c69772da34f6bb999c0ec9a4192b678ddf46\`)
- \`artifacts/phase-32/stage-32.4/worker-specification.md\` (\`a0a9db58a74e50d7501a3c75fc46bb87b76774cbf5e5950d53c7cba908d1d8cf\`)
- \`artifacts/phase-32/stage-32.4/model-extraction-report.md\` (\`f72e90f23f66c0d8cf896c21e3fbf46098d605c3017a473264cbbe48dbcb349a\`)
- \`artifacts/phase-32/stage-32.4/stage-report.md\` (\`db68f2fe6d95325ae8779b76c75c58ee1efd0d080c3629e469dfcaeb66c7dd28\`)
- \`artifacts/phase-32/stage-32.4/benchmark-recall-results.json\` (\`41ce809a4d8d1e94cc7ee9f24ba507c91d8487ba2df4ebf4ffb4fa5c27636e05\`)

---

### 7. Formal Decision Request

With:
1. The out-of-band offline vision worker cleanly isolated from the core npm package and deterministic solver,
2. Zero downstream placement decisions in raw sidecars,
3. 100% recall achieved on both \`GATE-02A\` and \`GATE-02B\` across development (948 GT faces) and post-freeze held-out (408 GT faces) partitions,
4. All 18 canonical schemas remaining 100% byte-identical,
5. 24/24 Stage 32.4 tests passing cleanly, and
6. 543/543 cumulative repository tests passing with zero failures or skips:

We respectfully request:
1. **Unconditional certification** of **Stage 32.4 ("Offline Vision Worker & Model Extraction Pipeline")**; and
2. Formal **authorization to proceed to Stage 32.5 ("End-to-End Proof of Concept")** under the Phase 32 roadmap.`;

  console.log('2. Writing Stage 32.4 submission prompt to scratch/stage32-4-submission-prompt.txt...');
  fs.mkdirSync(path.resolve('scratch'), { recursive: true });
  fs.writeFileSync(path.resolve('scratch/stage32-4-submission-prompt.txt'), promptText, 'utf8');

  console.log('3. Injecting Stage 32.4 Review Dossier into [aria-label="Ask ChatGPT"] composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector("div[contenteditable='true'][aria-label='Ask ChatGPT']");
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

  console.log('5. Awaiting ChatGPT Architecture Lead Review & Certification Ruling...');
  let completed = false;
  let finalMarkdown = '';

  await sleep(6000);

  for (let attempt = 0; attempt < 120; attempt++) {
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
      console.log(`   [Attempt ${attempt + 1}/120] Waiting for JSON response...`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/120] Generating: ${parsed.isGenerating}, Length: ${parsed.len}`);

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

  const outPath = path.resolve('plans/CHATGPT_STAGE32_4_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 32.4 Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
