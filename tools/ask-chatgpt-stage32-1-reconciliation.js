/**
 * Ezra Bridge Script: Submit Stage 32.1 Reconciliation & Final Acceptance Package to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 32.1 Reconciliation & Final Acceptance Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 32 Stage 32.1 Reconciliation & Final Acceptance Package)";

  const promptText = `${promptAnchor},

We are submitting the formal **Stage 32.1 Reconciliation & Final Acceptance Package** in direct response to your Stage 32.1 Acceptance Ruling (\`plans/CHATGPT_STAGE32_1_APPROVAL.md\`).

All items identified in your ruling—**Finding A (Confidence Scale)**, **Finding B (Coordinate Precision & Rounding)**, **Finding C (JSON Schema Dialect Compatibility)**, and the **Stage 32.2 Scope Boundary**—have been rigorously reconciled, implemented, documented, and verified on branch \`feature/phase-32-1-visual-intelligence-contract\` against the \`phase-31-certified\` baseline (\`82dcb0f243d65afcec37681aa8c302b20263611f\`).

Below is the point-by-point closure report, deliverables inventory, and test evidence.

---

### 1. Point-by-Point Closures

#### Finding A: Confidence Scale Reconciliation ([0, 1000] Integer Scale) — CLOSED
- **Scale Definition:** Normalized integer scale \`[0, 1000]\` where:
  - \`1000\` = confidence $1.0$ ($100\\%$)
  - \`500\` = confidence $0.5$ ($50\\%$)
  - \`0\` = confidence $0.0$ ($0\\%$)
- **Strict Integer Serialization:** Serialized strictly as integers (\`type: "integer"\`, \`minimum: 0\`, \`maximum: 1000\`). Floating-point values (e.g. \`0.98\`, \`500.5\`) are strictly prohibited and fail validation.
- **Contract & Validator Updates:**
  - \`schema/eme-visual-intelligence.v1.schema.json\` defines \`type: "integer", minimum: 0, maximum: 1000\` for all observation and trajectory confidence fields.
  - \`src/renderers/visual-contract-validator.js\` enforces \`Number.isInteger(conf) && conf >= 0 && conf <= 1000\`.
  - All fixtures updated to integer thousandths (\`980\`, \`950\`, \`970\`, \`920\`, invalid fixture set to \`1005\`).
- **Boundary Verification:**
  - \`CTR-12\`: Rejects values outside \`[0, 1000]\` (test fixture value: \`1005\`).
  - \`CTR-12b\`: Rigorous boundary tests confirming:
    - Valid: \`0\`, \`1000\` pass cleanly.
    - Invalid: \`-1\`, \`1001\`, and non-integer \`500.5\` are rejected with fail-closed errors.

#### Finding B: Coordinate Precision & Rounding (0.001 px, Round-Half-To-Even) — CLOSED
- **Precision Specification:** Fixed-point precision in thousandths of a source pixel ($0.001$ px, 3 decimal places) for canonical transformed coordinates.
- **Rational Arithmetic:** Proxy-to-source and source-to-proxy scale ratios are preserved in exact rational arithmetic before single final quantization.
- **Single Final Round-Half-To-Even:** Banker's rounding applied only once at the boundary:
  $$N = |v| \\cdot 10^3, \\quad \\text{if } N - \\lfloor N \\rfloor = 0.5 \\implies \\text{round to nearest even integer}$$
- **Quantization Tolerance:** Declared maximum one-way quantization tolerance $E_{\\max} = \\pm 0.0005$ px.
- **Tie-Breaking Vectors & Tests:**
  - \`artifacts/phase-32/stage-32.1/coordinate-transform-test-vectors.json\` upgraded to Version 1.1.0 with \`roundingPrecision: 3\` and \`roundingRule: "round_half_to_even"\`, expanded to 9 vectors (7 standard + 2 tie-breaking).
  - \`CTR-18b\`: Explicitly proves banker's rounding distinguishes from round-half-up:
    - \`0.0025 -> 0.002\` (even) [half-up would yield \`0.003\`]
    - \`0.0035 -> 0.004\` (even)
    - \`0.0045 -> 0.004\` (even) [half-up would yield \`0.005\`]
    - \`0.0055 -> 0.006\` (even)
    - \`0.0125 -> 0.012\` (even) [half-up would yield \`0.013\`]
    - \`0.0175 -> 0.018\` (even)
  - \`CTR-18\` & \`CTR-19\`: All 9 vectors match expected source coordinates to 3 decimal places and round-trip cleanly within quantization tolerance.

#### Finding C: JSON Schema Dialect Compatibility — CLOSED
- **Dialect Classification:** Auxiliary sidecar uses JSON Schema \`Draft 2020-12\` (\`"$schema": "https://json-schema.org/draft/2020-12/schema"\`).
- **Zero-Dependency Native Validation:** Implemented entirely in native Node.js \`>=20\` via \`VisualContractValidator\` (\`src/renderers/visual-contract-validator.js\`). No third-party npm packages (\`ajv\`, etc.) are introduced.
- **Ecosystem Coexistence:** In full harmony with EME's schema hierarchy, where legacy canonical schemas use Draft-07 and recent auxiliary schemas (Stage 25 Earshot request/response, PF-04 QA report) use modern draft dialects.
- **Zero Model Weights:** Absolutely zero machine learning models, binary weights, or Python packages added to the core EME npm package.

#### Stage 32.2 Scope Boundary Affirmation — ALIGNED
- **Accepted Scope:** Stage 32.2 is strictly chartered as **"Synthetic Benchmark and Ground Truth"**.
- **Scope Commitment:** EME will not introduce mock worker pipelines, execution infrastructure, or runtime mutations in Stage 32.2. Deliverables are restricted strictly to:
  1. Deterministic synthetic test fixture generators.
  2. Ground-truth annotated auxiliary sidecars.
  3. Spatial and temporal metric validation suites.

---

### 2. Deliverables Inventory & SHA-256 Checksums

All 15 deliverables have been recomputed and verified via \`shasum -c artifacts/phase-32/stage-32.1/evidence-inventory.sha256\` (100% OK):

| File Path | Description | SHA-256 Digest |
| :--- | :--- | :--- |
| \`schema/eme-visual-intelligence.v1.schema.json\` | Auxiliary sidecar Draft 2020-12 schema ([0, 1000] integer confidence) | \`539b69e6cbb2222637dd4dd94801e7673cd40e9d2d823311f4357511d8079ee2\` |
| \`src/renderers/visual-contract-validator.js\` | Zero-dependency contract validator (0.001 px round-half-even, [0, 1000] scale) | \`57c3df8b638b5fe3d4ccbf3f567ad6e54007d641c36cbb6596ef8a49aea78a18\` |
| \`tests/workflow-stage32-1-visual-contract.test.js\` | 39-test suite including boundary tests and half-even tie-breaking verification | \`1e895a3edca5145db84dcc2d53c67b10f469a5fd99c5a8f50da357d267ddc72e\` |
| \`artifacts/phase-32/stage-32.1/visual-intelligence-contract.md\` | Contract specification updated with [0, 1000] scale & 0.001 px precision | \`c7d3e0ce3d2a92156c7975645da689fe3db8a0253b644ff261ec6585d0261eb3\` |
| \`artifacts/phase-32/stage-32.1/coordinate-transform-spec.md\` | Coordinate transform spec (0.001 px fixed point, rational arithmetic, round-half-even) | \`e293b58cf3a1c06869fc01fd517ffc42b66ac0d6d3a495189b4c94c458eea504\` |
| \`artifacts/phase-32/stage-32.1/coordinate-transform-test-vectors.json\` | 9 deterministic numerical test vectors with explicit half-even tie cases | \`ed33b5a04aeba402ec0c496e9a8bce95ab6a1d58529844c8f626a5baad364179\` |
| \`artifacts/phase-32/stage-32.1/stage-report.md\` | Formal Stage 32.1 Reconciliation & Completion Report | \`e3361ecd3be4f9a7d49ca5cb87236ae4728e9d7749d419100cd93b7c3981f26b\` |
| \`artifacts/phase-32/stage-32.1/examples/valid-sidecar-interview.json\` | Valid 1080p interview talking-head fixture ([0, 1000] scale) | \`09cc7232b8a5b6ba594c1a6ee48f99f6e2a41fceca5022823188446bebd1ae76\` |
| \`artifacts/phase-32/stage-32.1/examples/valid-sidecar-landscape.json\` | Valid 4K landscape fixture with salient regions ([0, 1000] scale) | \`f3a4266cdc34900cf6e228487f98aaa1d0a7eaa4b0852d853b63365753ab6bb3\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-stale-hash.json\` | Invalid fixture: malformed/stale source media SHA-256 hash | \`04cb6719e3a9f7361148c33b1d0e32452334fd2ab674692ebbc85ab523915441\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-unsupported-version.json\` | Invalid fixture: unsupported schemaVersion string | \`94f1dcfa857821065c6676ccfa3628a57dbdb4a6001161a188305f704b2124bd\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-timebase-deviation.json\` | Invalid fixture: timebase deviation (timebase !== 120000) | \`fb695113f5684bafc473d996cd425a196f5b21057f2ecc14f946489523a11da0\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-out-of-bounds-geometry.json\` | Invalid fixture: negative observation bounding box coordinate | \`f1eafd8eebb90fe9d5a9e21beb9b6a0fe381336dcddf94ff353561781b361929\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-non-monotonic-ticks.json\` | Invalid fixture: frame ticks inverted / non-monotonic | \`d448c7e82dc44c7e6b9a4fce579e0fc47ed8073dbcf1e7c2616518b27b5f3dc5\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-confidence-range.json\` | Invalid fixture: confidence score exceeds 1000 (value: 1005) | \`257f1dca3923aa741f1f7ffeeda3348f472d6aeed6d0b634f3828c621b5c0dc1\` |
| \`artifacts/phase-32/stage-32.1/evidence-inventory.sha256\` | Master flat SHA-256 digest manifest | Verified via \`shasum -c\` (100% OK) |

---

### 3. Test Suite Output (39 Passed, 0 Failed, 0 Skipped)

Executing \`node --test tests/workflow-stage32-1-visual-contract.test.js\`:

\`\`\`
▶ Stage 32.1: Visual Intelligence Contract & Coordinate Transform Suite
  ▶ Section 1: Schema File Integrity & Meta-Validation
    ✔ CTR-01: Schema file exists, parses as valid JSON, and adheres to Draft 2020-12
    ✔ CTR-02: Canonical schemas remain unmodified from Phase 31 certification baseline
  ✔ Section 1: Schema File Integrity & Meta-Validation (31.59ms)
  ▶ Section 2: Valid Sidecar Examples Verification
    ✔ CTR-03: valid-sidecar-interview.json passes strict validation
    ✔ CTR-04: valid-sidecar-landscape.json passes strict validation with 4K dimensions and multiple frames
  ✔ Section 2: Valid Sidecar Examples Verification (1.33ms)
  ▶ Section 3: Invalidation & Fail-Closed Boundary Enforcement
    ✔ CTR-05: Rejects stale/malformed source SHA-256 hash (invalid-stale-hash.json)
    ✔ CTR-06: Rejects fingerprint mismatch against active project asset SHA-256
    ✔ CTR-07: Rejects unsupported schemaVersion (invalid-unsupported-version.json)
    ✔ CTR-08: Rejects timebase deviation from 120,000 (invalid-timebase-deviation.json)
    ✔ CTR-09: Rejects out-of-bounds geometry with negative coordinates (invalid-out-of-bounds-geometry.json)
    ✔ CTR-10: Rejects observation exceeding source canvas boundary (width/height overflow)
    ✔ CTR-11: Rejects non-monotonic ticks (invalid-non-monotonic-ticks.json)
    ✔ CTR-12: Rejects confidence score out of [0, 1000] range (invalid-confidence-range.json)
    ✔ CTR-12b: Confidence boundary tests (0 and 1000 valid; -1, 1001, and non-integer 500.5 rejected)
    ✔ CTR-13: Rejects presentation timestamp incoherent with integer tick
  ✔ Section 3: Invalidation & Fail-Closed Boundary Enforcement (7.99ms)
  ▶ Section 4: Observation vs. Decision Boundary & Property Containment
    ✔ CTR-14: Rejects unauthorized root properties (property containment / injection defense)
    ✔ CTR-15: Rejects solver decisions injected into raw observations (safe_placement_rect)
    ✔ CTR-16: Rejects solver placement scores injected into raw observations (placement_score)
  ✔ Section 4: Observation vs. Decision Boundary & Property Containment (0.50ms)
  ▶ Section 5: Coordinate Transform Test Vector Verification
    ✔ CTR-17: Exactly 9 test vectors loaded from coordinate-transform-test-vectors.json (7 standard + 2 tie-breaking)
    ✔ CTR-18b: Round-half-to-even tie-breaking explicitly distinguishes banker's rounding from half-up
    ✔ CTR-18 [vec-1080p-360p-centered-face]: Forward transform matches expectedSource
    ✔ CTR-19 [vec-1080p-360p-centered-face]: Inverse transform matches roundTrip
    ✔ CTR-18 [vec-vertical-9-16-interview]: Forward transform matches expectedSource
    ✔ CTR-19 [vec-vertical-9-16-interview]: Inverse transform matches roundTrip
    ✔ CTR-18 [vec-4k-540p-quarter-res]: Forward transform matches expectedSource
    ✔ CTR-19 [vec-4k-540p-quarter-res]: Inverse transform matches roundTrip
    ✔ CTR-18 [vec-letterbox-pillarbox-padding]: Forward transform matches expectedSource
    ✔ CTR-19 [vec-letterbox-pillarbox-padding]: Inverse transform matches roundTrip
    ✔ CTR-18 [vec-canvas-boundary-origin]: Forward transform matches expectedSource
    ✔ CTR-19 [vec-canvas-boundary-origin]: Inverse transform matches roundTrip
    ✔ CTR-18 [vec-canvas-boundary-extreme-corner]: Forward transform matches expectedSource
    ✔ CTR-19 [vec-canvas-boundary-extreme-corner]: Inverse transform matches roundTrip
    ✔ CTR-18 [vec-fixed-point-fractional-rounding]: Forward transform matches expectedSource
    ✔ CTR-19 [vec-fixed-point-fractional-rounding]: Inverse transform matches roundTrip
    ✔ CTR-18 [vec-half-even-tie-breaking-even]: Forward transform matches expectedSource
    ✔ CTR-19 [vec-half-even-tie-breaking-even]: Inverse transform matches roundTrip
    ✔ CTR-18 [vec-half-even-tie-breaking-odd]: Forward transform matches expectedSource
    ✔ CTR-19 [vec-half-even-tie-breaking-odd]: Inverse transform matches roundTrip
  ✔ Section 5: Coordinate Transform Test Vector Verification (1.73ms)
  ▶ Section 6: Trajectory Point Validation
    ✔ CTR-20: Valid trajectories pass validation
    ✔ CTR-21: Rejects trajectory with non-decreasing tick inversion
  ✔ Section 6: Trajectory Point Validation (0.33ms)
✔ Stage 32.1: Visual Intelligence Contract & Coordinate Transform Suite (44.00ms)
ℹ tests 39
ℹ suites 7
ℹ pass 39
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
\`\`\`

Predecessor regression suites also pass 100%:
- \`workflow-stage25-1-earshot-contract.test.js\`: 7/7 passed
- \`workflow-stage26-1-kit-contract.test.js\`: 8/8 passed
- \`workflow-stage31-6-certification.test.js\`: 31/31 passed

---

### 4. Boundary & Invariance Audit

- [x] **Canonical Schema Invariance:** All 18 canonical schemas remain untouched and byte-identical to \`phase-31-certified\`.
- [x] **Zero Dependencies & Zero Model Weights:** Implemented entirely in native Node.js \`>=20\` without third-party npm packages or ML weights.
- [x] **Fail-Closed Verification:** All invalid sidecar states trigger immediate fail-closed rejection.
- [x] **Stage 32.2 Charter:** Preserved strictly as "Synthetic Benchmark and Ground Truth".

---

### 5. Final Certification & Progression Request

With all three findings closed and verified against normative contract standards:
1. Do you grant unconditional final acceptance and certification for **Stage 32.1 ("Visual Intelligence Contract Specification")**?
2. Do you formally authorize progression to **Stage 32.2 ("Synthetic Benchmark and Ground Truth")** under the approved Phase 32 charter?`;

  console.log('2. Writing prompt copy to scratch/stage32-1-reconciliation-prompt.txt...');
  fs.mkdirSync(path.resolve('scratch'), { recursive: true });
  fs.writeFileSync(path.resolve('scratch/stage32-1-reconciliation-prompt.txt'), promptText, 'utf8');

  console.log('3. Injecting Stage 32.1 Reconciliation Prompt into [aria-label="Ask ChatGPT"] composer...');
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

  if (!parsedInj.success || parsedInj.length < 100) {
    console.error('Failed to inject prompt into ChatGPT composer:', injectRes);
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 32.1 Final Ruling...');
  let completed = false;
  let finalMarkdown = '';

  // Give ChatGPT an initial 6 seconds to start generating
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

  const outPath = path.resolve('plans/CHATGPT_STAGE32_1_FINAL_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 32.1 Final Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
