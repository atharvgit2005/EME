/**
 * Ezra Bridge Script: Submit Stage 32.1 Contract & Acceptance Specification to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 32.1 Visual Intelligence Contract Submission...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 32 Stage 32.1 Visual Intelligence Contract & Acceptance Specification — Completion & Review Submission)";

  const promptText = `${promptAnchor},

Following your architectural guidance and the user's explicit authorization to proceed with Phase 32 ("lets go"), the engineering team has completed **Stage 32.1 ("Visual Intelligence Contract Specification")** on branch \`feature/phase-32-1-visual-intelligence-contract\` originating from certified baseline \`82dcb0f243d65afcec37681aa8c302b20263611f\` (\`phase-31-certified\`).

We submit below the complete Stage 32.1 deliverable package, specification documents, test results, and checksum ledger for your formal architectural review and certification.

---

### 1. Architectural Alignment: Observation vs. Decision Separation

In direct adherence to your foundational principle:
> *"the vision worker observes; the composition solver decides; OperationExecutor mutates; rendered-output QA judges the result"*

Stage 32.1 strictly establishes:
1. **Auxiliary Sidecar Status:** The sidecar contract (\`schema/eme-visual-intelligence.v1.schema.json\`) is strictly classified as an **auxiliary observation sidecar**. It possesses **zero** mutation authority over project descriptors, timeline structures, or delivery manifests.
2. **Canonical Schema Invariance:** EME's 18 canonical schemas (\`schema/eme-*.schema.json\`) remain 100% frozen, unmodified, and byte-identical to the Phase 31 certification baseline (\`git diff HEAD schema/\` is completely empty).
3. **Pure Raw Observations:** The sidecar records only objective or probabilistic visual observations (faces, persons, focal points, salient regions, background regions, optical flow vectors, sparse point trajectories). Derived safe placement rectangles (\`safe_placement_rect\`) and placement scores (\`placement_score\`) are strictly barred from the schema and rejected upon ingestion.
4. **Timeline Arithmetic:** Timestamps adhere strictly to EME's canonical \`120,000 integer ticks / second\` standard with strict temporal monotonicity (\`tick[i+1] > tick[i]\`). Accumulated floating-point time calculations are prohibited.
5. **Coordinate Space Semantics:** Continuous display-oriented pixel-edge coordinates with top-left origin $(0, 0)$, transformed to full source canvas coordinates using deterministic 2-decimal fixed-point half-up rounding.
6. **Zero Model Weights:** No machine learning weights, binary artifacts, or Python runtime dependencies are introduced into the core EME npm package.

---

### 2. Stage 32.1 Deliverables & Evidence Inventory

All deliverables have been created, validated, and indexed with standard SHA-256 checksums:

| File Path | Description | SHA-256 Digest |
| :--- | :--- | :--- |
| \`schema/eme-visual-intelligence.v1.schema.json\` | Auxiliary observation sidecar Draft 2020-12 JSON schema | \`7b846967d4e2ab224b780ec91c45f3026f9278e83d837ea8d8757325ac3d0f50\` |
| \`src/renderers/visual-contract-validator.js\` | Zero-dependency contract validator & coordinate transformer | \`cf63d85051122c0000868f643903c3bed3f78d13cad3927326cfba081f319825\` |
| \`tests/workflow-stage32-1-visual-contract.test.js\` | Comprehensive 33-test suite across 7 sections | \`c6ef153e0e26de43f81bc75d4aeada7b1ecfabedf05d544ddf5346e4fd202a0a\` |
| \`artifacts/phase-32/stage-32.1/visual-intelligence-contract.md\` | Architectural contract specification document | \`e8449de3830d7f64ae28020cb613be2c738af7032edff670b70217d8c775f297\` |
| \`artifacts/phase-32/stage-32.1/coordinate-transform-spec.md\` | Mathematical coordinate transformation specification | \`8cfda7c95f33858efafc436025d6e67607fa85db4d69608df5cef1032ef9d8d3\` |
| \`artifacts/phase-32/stage-32.1/coordinate-transform-test-vectors.json\` | 7 deterministic numerical test vectors | \`f2072bdbd4c28aeecd94d939f60079e4bc9c2c0367f8fb3e0baf2860ada73268\` |
| \`artifacts/phase-32/stage-32.1/stage-report.md\` | Formal Stage 32.1 Completion Report | \`f4f8906dfb35d7ee03db456f59759d4672b10ae1c34a2efc7baa68616434eda5\` |
| \`artifacts/phase-32/stage-32.1/examples/valid-sidecar-interview.json\` | Valid 1080p interview talking-head fixture | \`6d97da23e7756f9743bb6f584df8b86275db69013e0ddbfaa1731ea4b63458b9\` |
| \`artifacts/phase-32/stage-32.1/examples/valid-sidecar-landscape.json\` | Valid 4K landscape fixture with salient regions | \`da319ffa9be9576d46d52741f6e63a2106e33da22da947b784d7707f7d31204e\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-stale-hash.json\` | Invalidation fixture: malformed/stale source media SHA-256 | \`eb11654aa91712cd4d87acccc64fe5bd17d622b2e442baaea00e2d03148fb1ca\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-unsupported-version.json\` | Invalidation fixture: unsupported schemaVersion | \`f8305ad625a7d5dfe41b0a283780254c20bada00a60dae2a17d9697296e6cd5a\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-timebase-deviation.json\` | Invalidation fixture: timebase deviation (timebase !== 120000) | \`b7173895402c8ff893bdb5d032ace88034de21f52c0086547cdd53ff24efd800\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-out-of-bounds-geometry.json\` | Invalidation fixture: negative bounding box coordinate | \`b88e1b784d97619b2d117aa1d619cd5b818db0ed6f496697a63307a66dca6832\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-non-monotonic-ticks.json\` | Invalidation fixture: non-monotonic frame ticks | \`e79c290a1afd47b6631303daf84c203e21df13a60d8c1387acfa30a74e14de74\` |
| \`artifacts/phase-32/stage-32.1/examples/invalid-confidence-range.json\` | Invalidation fixture: confidence score exceeds [0, 100] | \`55080471c2b0bea702e503442891e010f8a533bc30beff7b95641857e065ddf0\` |
| \`artifacts/phase-32/stage-32.1/evidence-inventory.sha256\` | Master flat SHA-256 digest manifest | Verified via \`shasum -c\` (100% OK) |

---

### 3. Test Execution Verification Output

Running \`node --test tests/workflow-stage32-1-visual-contract.test.js\` yields **33 passed, 0 failed, 0 skipped** across all test sections:

\`\`\`
▶ Stage 32.1: Visual Intelligence Contract & Coordinate Transform Suite
  ▶ Section 1: Schema File Integrity & Meta-Validation
    ✔ CTR-01: Schema file exists, parses as valid JSON, and adheres to Draft 2020-12
    ✔ CTR-02: Canonical schemas remain unmodified from Phase 31 certification baseline
  ✔ Section 1: Schema File Integrity & Meta-Validation (44.39ms)
  ▶ Section 2: Valid Sidecar Examples Verification
    ✔ CTR-03: valid-sidecar-interview.json passes strict validation
    ✔ CTR-04: valid-sidecar-landscape.json passes strict validation with 4K dimensions and multiple frames
  ✔ Section 2: Valid Sidecar Examples Verification (1.26ms)
  ▶ Section 3: Invalidation & Fail-Closed Boundary Enforcement
    ✔ CTR-05: Rejects stale/malformed source SHA-256 hash (invalid-stale-hash.json)
    ✔ CTR-06: Rejects fingerprint mismatch against active project asset SHA-256
    ✔ CTR-07: Rejects unsupported schemaVersion (invalid-unsupported-version.json)
    ✔ CTR-08: Rejects timebase deviation from 120,000 (invalid-timebase-deviation.json)
    ✔ CTR-09: Rejects out-of-bounds geometry with negative coordinates (invalid-out-of-bounds-geometry.json)
    ✔ CTR-10: Rejects observation exceeding source canvas boundary (width/height overflow)
    ✔ CTR-11: Rejects non-monotonic ticks (invalid-non-monotonic-ticks.json)
    ✔ CTR-12: Rejects confidence score out of [0, 100] range (invalid-confidence-range.json)
    ✔ CTR-13: Rejects presentation timestamp incoherent with integer tick
  ✔ Section 3: Invalidation & Fail-Closed Boundary Enforcement (8.12ms)
  ▶ Section 4: Observation vs. Decision Boundary & Property Containment
    ✔ CTR-14: Rejects unauthorized root properties (property containment / injection defense)
    ✔ CTR-15: Rejects solver decisions injected into raw observations (safe_placement_rect)
    ✔ CTR-16: Rejects solver placement scores injected into raw observations (placement_score)
  ✔ Section 4: Observation vs. Decision Boundary & Property Containment (1.06ms)
  ▶ Section 5: Coordinate Transform Test Vector Verification
    ✔ CTR-17: Exactly 7 test vectors loaded from coordinate-transform-test-vectors.json
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
  ✔ Section 5: Coordinate Transform Test Vector Verification (1.51ms)
  ▶ Section 6: Trajectory Point Validation
    ✔ CTR-20: Valid trajectories pass validation
    ✔ CTR-21: Rejects trajectory with non-decreasing tick inversion
  ✔ Section 6: Trajectory Point Validation (0.53ms)
✔ Stage 32.1: Visual Intelligence Contract & Coordinate Transform Suite (57.34ms)
ℹ tests 33
ℹ suites 7
ℹ pass 33
ℹ fail 0
\`\`\`

Predecessor regression suites continue to pass 100% (\`workflow-stage25-1-earshot-contract.test.js\`, \`workflow-stage26-1-kit-contract.test.js\`, \`workflow-stage31-6-certification.test.js\`).

---

### 4. Review & Approval Request

With Stage 32.1 contract specification complete and verified:
1. Does the \`eme-visual-intelligence.v1.schema.json\` auxiliary sidecar structure, coordinate space semantics, and observation-vs-decision boundary meet your architectural standards?
2. Are you satisfied with the fail-closed invalidation rules and coordinate transform precision guarantees?
3. Do you grant formal certification for **Stage 32.1** and authorize progression to **Stage 32.2 ("Mock / Synthetic Visual Intelligence Worker & Pipeline")**?`;

  console.log('2. Writing prompt copy to scratch/stage32-1-report-prompt.txt...');
  fs.mkdirSync(path.resolve('scratch'), { recursive: true });
  fs.writeFileSync(path.resolve('scratch/stage32-1-report-prompt.txt'), promptText, 'utf8');

  console.log('3. Injecting Stage 32.1 Submission Prompt into [aria-label="Ask ChatGPT"] composer...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 32.1 Ruling...');
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

  const outPath = path.resolve('plans/CHATGPT_STAGE32_1_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 32.1 Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
