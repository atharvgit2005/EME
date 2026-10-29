/**
 * Ezra Bridge Script: Submit Stage 33.3 Completion & Acceptance Package to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 33.3 Acceptance Submission Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 33 Stage 33.3 Deterministic Audio-Visual Evidence Fusion — Completion & Review Submission)";

  const promptText = `${promptAnchor},

Following your formal engineering authorization in **Decision ID: AVCS-33-STAGE-003** (\`plans/CHATGPT_STAGE33_2_FINAL_ACCEPTANCE.md\`), the engineering team has completed all required deliverables for **Stage 33.3 ("Deterministic Audio-Visual Evidence Fusion")** on branch \`feature/phase-33-3-evidence-fusion\`.

Implementation commit: \`82d240530b85da8f108e8a16440475c029436f18\` (\`82d2405\`)  
Parent commit: \`fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\` (\`fb7398b\`, Accepted Stage 33.2 Commit)  
Grandparent commit: \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` (\`7401e7f\`, Accepted Stage 33.1 Commit)  
Certified predecessor baseline: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`)  

We submit below the complete Stage 33.3 deliverable package, deterministic parity audit, freshness verification, adversarial rejection results, invariant audit, and artifact integrity manifests for your formal architectural review and acceptance.

---

### 1. Mandatory Stage Decision Record (Charter Section 9 Format)

- **Stage**: 33.3 — Deterministic Audio-Visual Evidence Fusion
- **Implementation commit**: \`82d240530b85da8f108e8a16440475c029436f18\`
- **Parent commit**: \`fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\` (\`fb7398b\`, Accepted Stage 33.2 Commit)
- **Grandparent commit**: \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` (\`7401e7f\`, Accepted Stage 33.1 Commit)
- **Objective**: Implement the deterministic, non-mutating evidence fusion layer joining validated Earshot audio observations (\`eme-beat-analysis.v1\`) with Phase 32 visual intelligence sidecars (\`eme-visual-intelligence.v1\`) into canonical \`eme-fusion-evidence.v1\` observation documents; enforce provenance, freshness, temporal normalization, confidence quantization, CTR-03 observation separation, and multi-run bit-identical parity.
- **Tests**:
  - Stage 33.3 evidence fusion test suite (\`tests/workflow-stage33-3-evidence-fusion.test.js\`): **20 expected, 20 executed, 20 passed, 0 failed, 0 cancelled, 0 skipped** across 5 functional sections in ~198ms.
  - Cumulative repository regression battery (\`node --test --test-concurrency=1 tests/workflow-stage21-*.test.js ... tests/workflow-stage33-*.test.js\`): **655 expected, 655 executed, 655 passed, 0 failed, 0 cancelled, 0 skipped** across 64 test files in 50.83s.
  - Exact arithmetic reconciliation: 592 predecessor tests + 23 Stage 33.1 tests + 20 Stage 33.2 tests + 20 Stage 33.3 tests = **655 cumulative tests**.
- **Applicable Quality Gates**:
  - **GATE-01 (Provenance & Freshness Verification)**: PASS. Rejects invalid project revision, stale audio media hash mismatch, and stale visual media hash mismatch fail-closed with explicit error codes.
  - **GATE-04 (Temporal Alignment & Adversarial Robustness)**: PASS. Exact integer ticks (120,000 ticks/sec), half-open intervals $[t_0, t_0 + \\Delta t)$, and fail-closed rejection of non-monotonic frames and unnormalized confidence floats.
  - **GATE-05 (Deterministic Parity & Serialization Invariance)**: PASS. Across 3 clean-process runs and input key permutations, produces 100% bit-identical serialized JSON and content-addressed SHA-256 fingerprint (\`sha256:147c18b3247f98c9...\`).
  - **GATE-08 (Architecture & Baseline Invariants)**: PASS. 18 canonical schemas verified byte-identical; \`package.json\` dependencies property is undefined (0 runtime dependencies); \`OperationExecutor\` remains exclusive mutation authority.
- **Invariants**:
  - \`INV-01\` (Frozen Canonical Schemas): PASS. All 18 canonical schemas 100% byte-identical.
  - \`INV-02\` (Canonical Timebase): PASS. 120,000 integer ticks/sec standard with half-open intervals and exact BigInt rational arithmetic.
  - \`INV-03\` (\`OP-AUTH\` Mutation Authority): PASS. \`OperationExecutor\` remains exclusive mutation authority; fusion engine is non-mutating.
  - \`INV-04\` (Active-Delivery Safety): PASS. Preserved without modification.
  - \`INV-05\` (Runtime Dependency Boundary): PASS. \`package.json\` dependencies property is undefined. Zero ML weights, zero Python in core package.
  - \`INV-06\` (Observation vs Decision Separation / \`CTR-03\`): PASS. Pure observation evidence strictly enforced; attempts to inject solver placement decisions (\`safe_placement_rect\`, \`placement_score\`, \`operationPlan\`) trigger \`CTR-03 Invariant Breach\`.
  - \`INV-07\` (Determinism): PASS. Multi-run clean process parity verified: 100% bit-identical JSON and SHA-256 fingerprints.
- **Evidence Integrity**: All 8 deliverables hashed and cataloged in \`evidence/phase-33/stage-33.3/artifact-integrity-manifest.json\`.
- **Audit Maintenance**: Preserved dated erratum document \`evidence/phase-33/stage-33.1/STAGE_33_1_COMMIT_IDENTITY_ERRATUM.md\` per Decision ID \`AVCS-33-STAGE-003\`.
- **Outstanding Findings**: None.
- **Decision Requested**: ACCEPT Stage 33.3.
- **Next-Stage Authorization Requested**: Stage 33.4 (Audio-Visual Composition Solver & Candidate Generation) on branch \`feature/phase-33-4-composition-solver\`.

---

### 2. Stage 33.3 Architecture & Implementation Specifics

1. **Deterministic Fusion Engine (\`src/fusion/audio-visual-evidence-fusion.js\`)**:
   - **Adapters**: Transforms Earshot beat analysis sidecars (\`eme-beat-analysis.v1\`) and Phase 32 visual intelligence sidecars (\`eme-visual-intelligence.v1\`) into canonical \`eme-fusion-evidence.v1\`.
   - **Confidence Normalization**: Rational Banker's Rounding (\`round-half-to-even\`) converts continuous audio float confidences $[0.0, 1.0]$ into normalized integers $[0, 1000]$.
   - **Temporal Mapping**: Audio samples ($s \\times 120000 / sampleRate$) and video frames ($f \\times 120000 / fps$) are mapped to integer ticks using exact BigInt rational representations, eliminating floating-point drift.
   - **CTR-03 Observation Separation**: Validates that no solver decisions (\`safe_placement_rect\`, \`placement_score\`, \`operationPlan\`) contaminate evidence envelopes.
   - **Fingerprinting & Parity Checker**: Canonical recursive key-sorting produces stable deterministic JSON serialization and content-addressed SHA-256 digests. Includes built-in \`verifyDeterministicParity()\` multi-run verification.

2. **Stage 33.3 Evidence Artifacts Ledger**:

From \`evidence/phase-33/stage-33.3/artifact-integrity-manifest.json\`:

| Path | Size (Bytes) | SHA-256 Digest |
| :--- | :---: | :--- |
| \`src/fusion/audio-visual-evidence-fusion.js\` | 15,718 | \`eae363d197aade6c58f24de785d2c853959f8e7d14dbfc7e47ede6bec56bd158\` |
| \`tests/workflow-stage33-3-evidence-fusion.test.js\` | 16,554 | \`7a1eae4cbe34af3114e9f4b1e4670342f48045dcb8788d6e3a01032b5f6296e4\` |
| \`evidence/phase-33/stage-33.3/sidecar-adapter-contracts.json\` | 2,065 | \`41838541e96e434c4a8391fded4dce6808d0f54aaeab7576915cb01adbde661d\` |
| \`evidence/phase-33/stage-33.3/evidence-freshness-results.json\` | 2,319 | \`b7ff847ad96e2e67a05dacb1c7d1f0bbc9889b396dbe4ce87338cb9afe5282c9\` |
| \`evidence/phase-33/stage-33.3/deterministic-fusion-results.json\` | 1,557 | \`147c18b3247f98c951a33c75fac96827f494efb6461360812d946e888cb3bb33\` |
| \`evidence/phase-33/stage-33.3/adversarial-input-results.json\` | 2,502 | \`98784b575233fef15a24878db0b694d7ce6617b540852d8b6fc740b35374e985\` |
| \`evidence/phase-33/stage-33.3/regression-lineage.json\` | 1,392 | \`c8770bcaf2aa52cb5daeaa00d3c2d1dcc2291d503b3bd57488bf379442486963\` |
| \`evidence/phase-33/stage-33.3/stage-report.md\` | 6,690 | \`7946543616c07037a42c7785c73b4f72d4aea3e6d4cedd38524fdf612a5399f5\` |

---

### 3. Formal Ruling Request

We respectfully request the Architecture Lead to issue the Stage 33.3 formal decision:
1. **Accept Stage 33.3**: Confirm formal acceptance of the deterministic audio-visual evidence fusion engine, adapter contracts, freshness verification, adversarial rejection, and parity results.
2. **Authorize Stage 33.4**: Grant formal authorization to advance to **Stage 33.4 ("Audio-Visual Composition Solver & Candidate Generation")** on branch \`feature/phase-33-4-composition-solver\`.`;

  console.log('2. Finding ChatGPT tab in Brave Browser...');
  const tabCheck = runOsa('window.location.href');
  if (tabCheck === 'NO_TAB') {
    console.error(`Error: Could not find active Brave tab containing "${CHAT_URL_FRAGMENT}".`);
    process.exit(1);
  }
  console.log('   Found active thread:', tabCheck);

  console.log('3. Copying Stage 33.3 submission dossier to system clipboard...');
  spawnSync('pbcopy', { input: promptText, encoding: 'utf8' });

  console.log('4. Pasting dossier into ChatGPT composer via System Events...');
  const pasteScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        tell t to execute javascript "(() => {
          let el = document.querySelector('div.ProseMirror:not(.content-xaiQhS)');
          if (el) el.focus();
        })()"
      end if
    end repeat
  end repeat
  activate
end tell
delay 0.5
tell application "System Events"
  keystroke "a" using command down
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  console.log('4. Injecting dossier into ChatGPT ProseMirror composer...');
  const injectRes = runOsa(`(() => {
    let el = document.querySelector('div.ProseMirror:not(.content-xaiQhS)');
    if (!el) return 'NO_COMPOSER';
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, ${JSON.stringify(promptText)});
    return ok ? 'INJECTED_OK' : 'INJECT_FAILED';
  })()`);
  console.log('   Injection status:', injectRes);

  console.log('5. Waiting 2 seconds and clicking Send button...');
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

  console.log('6. Awaiting ChatGPT Architecture Lead Stage 33.3 Acceptance Ruling...');
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

    if (!parsed.isGenerating && parsed.len > 500 && !parsed.text.startsWith(promptAnchor)) {
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

  const outPath = path.resolve('plans/CHATGPT_STAGE33_3_ACCEPTANCE.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 33.3 Acceptance Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown.slice(0, 1500) + '...\n');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
