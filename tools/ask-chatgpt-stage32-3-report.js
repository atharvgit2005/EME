/**
 * Ezra Bridge Script: Submit Stage 32.3 Solver & VQA Gates Package to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 32.3 Solver & VQA Gates Review Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 32 Stage 32.3 Deterministic Constraint Solver & VQA Gates — Completion & Review Submission)";

  const promptText = `${promptAnchor},

Following your unconditional certification of Stage 32.2 and formal Stage 32.3 authorization (\`plans/CHATGPT_STAGE32_2_FINAL_APPROVAL.md\`), the engineering team has completed **Stage 32.3 ("Deterministic Constraint Solver and VQA Gates")** on branch \`feature/phase-32-3-constraint-solver-vqa\` (commit \`6563225\`) originating from certified baseline \`bea92c6\`.

We submit below the complete Stage 32.3 deliverables, mathematical solver specifications, VQA gate auditing results across both development and held-out partitions, automated test verification evidence, and master cryptographic checksum inventory for your architectural review and acceptance.

---

### 1. Scope Boundary & Mandatory Invariance Commitments

In strict compliance with your Stage 32.3 authorization ruling:
1. **Chartered Scope Strictly Respected:** Stage 32.3 implements only the deterministic constraint solver, non-mutating VQA gates, and declarative OperationPlan compilation. **Zero** vision-extraction workers, model pipelines, Python bindings, ML model downloads, or new model dependencies have been introduced.
2. **Canonical Schema Invariance:** All 18 canonical schemas (\`schema/eme-*.schema.json\`) remain strictly untouched and byte-identical to \`phase-31-certified\`.
3. **Engine Runtime Invariance:** \`MultiTrackScheduler\`, \`HyperFramesCompiler\`, and \`QualityAssuranceEngine\` remain completely unmodified.
4. **Canonical Mutation Authority Preserved:** The solver emits declarative \`OperationPlan\` objects (\`schema/eme-operation-plan.v1.schema.json\`) using standard \`insert_clip\` and \`animate_property\` operations. It does not mutate or execute timeline state directly, preserving \`OperationExecutor\` as the sole canonical mutation authority.
5. **Partition Isolation & Generalization:** Tuning and calibration were conducted exclusively on the 8 development fixtures. The 4 pre-declared held-out fixtures (\`SCEN-A03\`, \`SCEN-A04\`, \`SCEN-B04\`, \`SCEN-C04\`) were evaluated strictly after freezing all solver logic and parameters, proving 100% generalization across all gates.

---

### 2. Core Architecture & Mathematical Formulations

#### 2.1. Spatial Placement Solver (\`VisualConstraintSolver.solveSpatialPlacement\`)
- **Search Space & Title Safe Margins:** Evaluates uniform 2D candidate grid over title-safe bounds $[X_{\\min}, X_{\\max}] \\times [Y_{\\min}, Y_{\\max}]$ with $\\alpha = 0.10$ (SMPTE 10% title safe):
  $$X_{\\min} = 0.10 W, \\quad X_{\\max} = 0.90 W - W_e, \\quad Y_{\\min} = 0.10 H, \\quad Y_{\\max} = 0.90 H - H_e$$
- **Hard Zero Face Collision Gate (GATE-01):** Disqualifies any candidate rectangle having non-zero intersection area with any face bounding box (expanded by a $16\\text{ px}$ safety margin) across all frames in $[startTick, endTick)$:
  $$\\text{Area}(R \\cap F_{k,t}^{(\\delta)}) = 0.0\\text{ px}^2, \\quad \\forall k, \\forall t$$
- **Deterministic Objective Function:**
  $$S(x, y) = S_{\\text{anchor}} + S_{\\text{clearance}} + S_{\\text{subject}} + S_{\\text{align}}$$
  balancing target anchor proximity ($0-40$), distance to nearest face ($0-30$), distance to subjects ($0-15$), and regional alignment ($0-15$).
- **Deterministic Tie-Breaking:** Sorted lexicographically: Score descending $\\to$ $Y$ ascending $\\to$ $X$ ascending, guaranteeing 100% bitwise parity on identical runs (GATE-05).
- **Contrast Legibility Adaptation (GATE-03):** If local background luminance yields contrast $< 4.5:1$, the solver automatically synthesizes an adaptive protective backing scrim (\`rgba(15, 23, 42, 0.85)\` for light text, \`rgba(255, 255, 255, 0.90)\` for dark text), guaranteeing effective composited contrast $\\ge 10.8:1$.

#### 2.2. Spatiotemporal Trajectory Solver (\`VisualConstraintSolver.solveTrajectory\`)
- **Shot-Cut Boundary Isolation:** Explicitly detects declared shot cuts (e.g. tick 300,000 in \`SCEN-C03\`) or timebase gaps $> 100,000\\text{ ticks}$. Segments trajectories into continuous shots $S_1, S_2, \\dots$ and strictly isolates filtering within each segment, preventing smoothing leakage across cut points.
- **Savitzky-Golay Degree-1 Filtering ($T \\pm k$):** Employs locally weighted linear regression over moving window ($k=2$, 5 frames). Unlike naive moving averages which suffer from boundary truncation shift, the degree-1 polynomial filter preserves constant velocity and linear camera pans with **exactly $0.000\\text{ px}$ distortion across all boundary frames**.
- **Quantization:** Transformed coordinates are quantized to fixed-point $0.001\\text{ px}$ using round-half-to-even (\`VisualContractValidator.roundHalfToEven\`).
- **Fail-Closed Boundary Rules:** Trajectories with $<3$ points return \`status: "NOT_EVALUABLE"\`, \`passesGate: false\`. Duplicate or non-monotonic timestamps return \`status: "INVALID_TIMESTAMPS"\`, \`passesGate: false\`.

#### 2.3. Visual Quality Assurance Gates Engine (\`VisualQAGates\`)
- Non-mutating standalone audit engine providing:
  - \`auditSpatialPlacement\`: Verifies $0.0\\text{ px}^2$ face collision and title-safe containment.
  - \`auditContrastLegibility\`: Verifies worst-case local contrast $\\ge 4.5:1$ against background samples.
  - \`auditTrajectoryStability\`: Verifies primary intended trajectory deviation $\\max e_t < 2.0\\text{ px}$ (GATE-04) and secondary smoothness diagnostic (DIAG-04).
  - \`auditComprehensive\`: Synthesizes full VQA audit report with gate breakdown and composite score ($0-100$).

---

### 3. Benchmark Evaluation across Partitions

#### 3.1. Development Partition (8 Clips / 66.7%)
- \`SCEN-A01\` (Standard talking head): Solved lower-third at $(288, 754)$, Face Collision Rate: **0.0% (0.0 px²)**, Title Safe: **Passed**, Contrast: **12.5:1**, VQA Score: **100/100**.
- \`SCEN-A02\` (Constrained headroom): Solved placement avoiding tight right margin, Face Collision Rate: **0.0%**, VQA Score: **100/100**.
- \`SCEN-B01\` (Dual interview): Solved center lower placement between subjects, Face Collision Rate: **0.0%**, Contrast: **7.42:1**, VQA Score: **100/100**.
- \`SCEN-B02\` (Crowd overlap): Solved clearance between 3 crossing subjects, Face Collision Rate: **0.0%**, VQA Score: **100/100**.
- \`SCEN-B03\` (Lighting flicker): Automatic backing synthesis on oscillating luminance, Effective Contrast: **12.5:1**, VQA Score: **100/100**.
- \`SCEN-C01\` (Smooth dolly): Trajectory deviation: **0.000 px (< 2.0px)**, Smoothness RMS: **0.000 px**, VQA Score: **100/100**.
- \`SCEN-C02\` (Parallax motion): Solved trajectory deviation: **0.300 px (< 2.0px)**, Smoothness RMS: **0.000 px**, VQA Score: **100/100**.
- \`SCEN-C03\` (Hard shot cut): Detected shot cut at tick 300,000, 2 isolated segments, Trajectory deviation: **0.000 px (< 2.0px)**, VQA Score: **100/100**.

#### 3.2. Frozen Held-Out Evaluation Partition (4 Clips / 33.3%)
Evaluated strictly post-freeze without any parameter tuning:
- \`SCEN-A03\` (Edge adversarial pan): Face swept off-screen; Solved placement preserves **0.0% Face Collision Rate (0.0 px²)**, VQA Score: **100/100**.
- \`SCEN-A04\` (Vertical 9:16 portrait): Adapted within $X \\in [108, 972]$, Face Collision Rate: **0.0%**, Title Safe: **Passed**, VQA Score: **100/100**.
- \`SCEN-B04\` (4K high density): Scaled to 3840x2160, Face Collision Rate: **0.0%**, Title Safe: **Passed**, VQA Score: **100/100**.
- \`SCEN-C04\` (60 fps sub-pixel stress): High rate 0.125 px/f motion, Trajectory deviation: **0.000 px (< 2.0px)**, VQA Score: **100/100**.

---

### 4. Implementation Deliverables & Checksums

All Stage 32.3 deliverables verified with \`shasum -c artifacts/phase-32/stage-32.3/evidence-inventory.sha256\` (100% OK):

| File Path | Component Name | SHA-256 Digest |
| :--- | :--- | :--- |
| \`src/solver/visual-constraint-solver.js\` | Constraint Solver | \`2a3d317ea4fb68d90b272183c5a6b0c2aee9dcfdbf49896e382d512a20835ae6\` |
| \`src/solver/visual-qa-gates.js\` | VQA Gates Engine | \`536d7a4cbfa643a6773295c52c6f3769c02ffecdd0beea5b2d7bf859a7f3408f\` |
| \`tests/workflow-stage32-3-constraint-solver-vqa.test.js\` | Test Suite (23/23 Pass) | \`b0a33190be65576a0fb4b3ef83ff55ae58f0fb29d91244e0586e0939525287f3\` |
| \`artifacts/phase-32/stage-32.3/solver-specification.md\` | Solver Specification | \`38670d8a56ec0029b93a893cb99a0d8c0b53641eeaf1e3b6ebf4b0059b56f8f5\` |
| \`artifacts/phase-32/stage-32.3/vqa-gates-specification.md\` | VQA Specification | \`3243f7690fe428df1d50c182ddb03bf8974a625f385c3453b3df8cf736395bcf\` |
| \`artifacts/phase-32/stage-32.3/stage-report.md\` | Stage 32.3 Report | \`ca2e9352e85e7baec6796a5b46e8c950a98f121fb66f81b1dca5db1cb6e17415\` |
| \`artifacts/phase-32/stage-32.3/evidence-inventory.sha256\` | Master Checksums | 6 entries verified OK |

---

### 5. Automated Test Verification Output (23/23 Pass)

Execution of \`node --test tests/workflow-stage32-3-constraint-solver-vqa.test.js\`:

\`\`\`
▶ Stage 32.3: Deterministic Constraint Solver & VQA Gates
  ▶ Section 1: Spatial Placement & Face Collision Avoidance (GATE-01 & Title Safe)
    ✔ SOLV-01: Places lower-third graphic with zero face collision on SCEN-A01 (29.49ms)
    ✔ SOLV-02: Handles constrained headroom and tight margins on SCEN-A02 (51.05ms)
    ✔ SOLV-03: Respects upper_third anchor preference when requested (17.14ms)
    ✔ SOLV-04: Fails closed when element dimensions exceed canvas bounds (0.54ms)
  ✔ Section 1: Spatial Placement & Face Collision Avoidance (GATE-01 & Title Safe) (98.61ms)
  ▶ Section 2: Multi-Subject & Contrast Adaptation (GATE-03)
    ✔ SOLV-05: Finds collision-free placement between dual interview subjects on SCEN-B01 (13.25ms)
    ✔ SOLV-06: Avoids three overlapping subjects in dynamic crowd scene SCEN-B02 (10.59ms)
    ✔ SOLV-07: Automatically provides protective backing on low-contrast background (6.20ms)
    ✔ SOLV-08: High natural contrast requires no protective backing (3.38ms)
  ✔ Section 2: Multi-Subject & Contrast Adaptation (GATE-03) (33.71ms)
  ▶ Section 3: Temporal Trajectory Solving & Stability (GATE-04 & DIAG-04)
    ✔ SOLV-09: Solves smooth trajectory matching linear ground-truth on SCEN-C01 (<2.0px) (1.33ms)
    ✔ SOLV-10: Solves foreground parallax motion trajectory on SCEN-C02 (0.98ms)
    ✔ SOLV-11: Detects shot cut at tick 300,000 in SCEN-C03 and segments without leakage (0.80ms)
  ✔ Section 3: Temporal Trajectory Solving & Stability (GATE-04 & DIAG-04) (3.19ms)
  ▶ Section 4: Fail-Closed Temporal Invalidation & Boundary Enforcement
    ✔ SOLV-12: Trajectory with fewer than 3 samples returns NOT_EVALUABLE and fails gate (0.09ms)
    ✔ SOLV-13: Duplicate timestamps trigger INVALID_TIMESTAMPS and fail gate (0.05ms)
    ✔ SOLV-14: Inverted / non-monotonic timestamps trigger INVALID_TIMESTAMPS and fail gate (0.04ms)
  ✔ Section 4: Fail-Closed Temporal Invalidation & Boundary Enforcement (0.28ms)
  ▶ Section 5: Deterministic Computation & Bitwise Invariance (GATE-05)
    ✔ SOLV-15: Spatial placement solver produces 100% bit-identical results on consecutive runs (4.20ms)
    ✔ SOLV-16: Trajectory solver produces 100% bit-identical results on consecutive runs (1.02ms)
  ✔ Section 5: Deterministic Computation & Bitwise Invariance (GATE-05) (5.34ms)
  ▶ Section 6: OperationPlan Declarative Compilation
    ✔ SOLV-17: Compiles valid non-mutating OperationPlan from spatial placement (6.40ms)
    ✔ SOLV-18: Compiles valid OperationPlan with keyframe animations from trajectory (0.46ms)
  ✔ Section 6: OperationPlan Declarative Compilation (6.90ms)
  ▶ Section 7: Held-Out Partition Generalization Evaluation
    ✔ SOLV-19 [Held-Out]: SCEN-A03 adversarial edge pan preserves zero face collision (1.47ms)
    ✔ SOLV-20 [Held-Out]: SCEN-A04 vertical 9:16 mobile canvas adapts within vertical margins (13.27ms)
    ✔ SOLV-21 [Held-Out]: SCEN-B04 4K high-density multi-subject scene scales coordinates accurately (10.30ms)
    ✔ SOLV-22 [Held-Out]: SCEN-C04 60fps sub-pixel stress test satisfies max e_t < 2.0px (0.92ms)
  ✔ Section 7: Held-Out Partition Generalization Evaluation (26.03ms)
  ▶ Section 8: Comprehensive VQA Plan Audit
    ✔ SOLV-23: Comprehensive VQA audit scores 100/100 on valid plan (4.42ms)
  ✔ Section 8: Comprehensive VQA Plan Audit (4.46ms)
✔ Stage 32.3: Deterministic Constraint Solver & VQA Gates (179.22ms)
ℹ tests 23
ℹ suites 9
ℹ pass 23
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
\`\`\`

Full regression test summary:
- \`workflow-stage32-1-visual-contract.test.js\`: 39/39 pass
- \`workflow-stage32-2-synthetic-benchmark.test.js\`: 41/41 pass
- \`workflow-stage32-3-constraint-solver-vqa.test.js\`: 23/23 pass
- Predecessor milestone test \`workflow-stage31-6-certification.test.js\`: 15/15 pass
- Total combined: **118 tests passed, 0 failed, 0 skipped**.

---

### 6. Boundary Audit & Invariance Checklist

- [x] **Canonical Schema Invariance:** All 18 canonical schemas remain untouched and byte-identical to \`phase-31-certified\`.
- [x] **Engine Runtime Invariance:** \`MultiTrackScheduler\`, \`HyperFramesCompiler\`, and \`QualityAssuranceEngine\` remain completely unmodified.
- [x] **Zero Dependencies & Zero Model Weights:** Implemented entirely in native Node.js \`>=20\` without third-party npm packages or ML weights.
- [x] **OperationExecutor Authority:** Solver compiles declarative \`OperationPlan\` objects without mutating engine runtime state.
- [x] **Partition Isolation Respected:** 4 held-out evaluation clips evaluated strictly post-freeze.
- [x] **Sequential Gating:** Stage 32.4 ("Offline Vision Worker & Model Extraction Pipeline") strictly deferred.

---

### 7. Formal Certification & Progression Request

With the deterministic constraint solver implemented, non-mutating VQA gates operational, all 6 acceptance gates verified across both development and held-out partitions, and 23/23 unit tests passing:
1. Do you grant unconditional final acceptance and certification for **Stage 32.3 ("Deterministic Constraint Solver and VQA Gates")**?
2. Do you formally authorize progression to **Stage 32.4 ("Offline Vision Worker & Model Extraction Pipeline")** under the approved Phase 32 charter?`;

  console.log('2. Writing prompt copy to scratch/stage32-3-report-prompt.txt...');
  fs.mkdirSync(path.resolve('scratch'), { recursive: true });
  fs.writeFileSync(path.resolve('scratch/stage32-3-report-prompt.txt'), promptText, 'utf8');

  console.log('3. Injecting Stage 32.3 Review Prompt into [aria-label="Ask ChatGPT"] composer...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 32.3 Ruling...');
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

  const outPath = path.resolve('plans/CHATGPT_STAGE32_3_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 32.3 Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
