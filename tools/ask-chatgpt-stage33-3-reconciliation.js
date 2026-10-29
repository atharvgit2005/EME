/**
 * Ezra Bridge Script: Submit Stage 33.3 Evidence Reconciliation Package to ChatGPT Architecture Lead
 * Resolves Findings S33.3-EVID-01 and S33.3-GATE-01 from Decision AVCS-33-STAGE-004.
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
  console.log('1. Preparing Stage 33.3 Evidence Reconciliation Dossier...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME Phase 33 Stage 33.3 Deterministic Audio-Visual Evidence Fusion — Reconciliation Submission)";

  const promptText = `${promptAnchor},

In direct response to your ruling in **Decision ID: AVCS-33-STAGE-004** (\`plans/CHATGPT_STAGE33_3_ACCEPTANCE.md\`), the engineering team submits the complete machine-readable forensics and audit documentation closing **Finding S33.3-EVID-01** (Fusion fingerprint identity reconciliation) and **Finding S33.3-GATE-01** (Charter quality-gate numbering alignment).

Current reconciliation commit: \`ca6b09bcf7f147153a838d115907edbc50d86d95\` (\`ca6b09b\`)  
Immediate parent commit: \`82d240530b85da8f108e8a16440475c029436f18\` (\`82d2405\`)  
Accepted Stage 33.2 base: \`fb7398b7644dda1c1a1fb78c7f56ad653eba4f82\` (\`fb7398b\`)  
Accepted Stage 33.1 ancestor: \`7401e7f7cafba4c2fd204bbb10d5f76675b62f1c\` (\`7401e7f\`)  
Certified Phase 32 base: \`31c6032bb88973aab6a4545785d5b63df8fa0ebe\` (\`phase-32-certified\`)  

---

### 1. Direct Closure of Finding S33.3-EVID-01 (Fingerprint Identity Disambiguation)

#### 1.1. Root Cause Analysis
The displayed hash prefix in the initial Stage 33.3 narrative decision record was a transcription error by the author, who inadvertently copied the SHA-256 checksum of the test harness artifact \`deterministic-fusion-results.json\` into the summary text instead of reporting the content-addressed fingerprint of the normalized \`eme-fusion-evidence.v1\` payload. The two objects are entirely distinct entities in memory and on disk.

#### 1.2. Complete Disambiguation & Machine-Readable Ledger
From \`evidence/phase-33/stage-33.3/fusion-fingerprint-reconciliation.json\`:

1. **Normalized Fused-Evidence Payload**:
   - **Entity**: The in-memory and serialized observation sidecar emitted by \`AudioVisualEvidenceFusion.fuse()\`.
   - **Schema**: \`schema/eme-fusion-evidence.v1.schema.json\`.
   - **Serialization Algorithm**: Canonical recursive key-sorting (\`AudioVisualEvidenceFusion.canonicalStringify()\`) over UTF-8 buffer excluding self-referencing \`fusionId\`.
   - **Complete 64-Character SHA-256 Fingerprint**:  
     \`sha256:76db59f2c1d49c75c98366a88fac60fe21a0da76d3fae67b0d064485729a44aa\`
   - **Raw Hex SHA-256**:  
     \`76db59f2c1d49c75c98366a88fac60fe21a0da76d3fae67b0d064485729a44aa\`

2. **Test Results Harness Report Artifact**:
   - **Entity**: The test execution record stored on disk.
   - **Relative Path**: \`evidence/phase-33/stage-33.3/deterministic-fusion-results.json\`.
   - **Byte Size**: 1,638 bytes.
   - **Complete File SHA-256 Checksum**:  
     \`9ff5b9c83ef1a9ab8cb052ecb51d5f8223e86b5c9430e5de37d5e395ffe72097\`

3. **Three Clean-Process Runs Parity Proof**:
   - **Run 1 Payload Fingerprint**: \`sha256:76db59f2c1d49c75c98366a88fac60fe21a0da76d3fae67b0d064485729a44aa\`
   - **Run 2 Payload Fingerprint**: \`sha256:76db59f2c1d49c75c98366a88fac60fe21a0da76d3fae67b0d064485729a44aa\`
   - **Run 3 Payload Fingerprint**: \`sha256:76db59f2c1d49c75c98366a88fac60fe21a0da76d3fae67b0d064485729a44aa\`
   - **Input Key Permutation Fingerprint**: \`sha256:76db59f2c1d49c75c98366a88fac60fe21a0da76d3fae67b0d064485729a44aa\`
   - **Parity Result**: 100% bit-identical payload and identical fingerprint across all runs.

**Status**: Finding **S33.3-EVID-01 is CLOSED**.

---

### 2. Direct Closure of Finding S33.3-GATE-01 (Charter Gate Numbering Reconciliation)

#### 2.1. Alignment with Approved AVCS-33 Charter Matrix
In accordance with Section 8 of the approved Phase 33 Charter (\`plans/CHATGPT_PHASE33_DIRECTIVE.md\`), all quality gate references have been reconciled:

| Charter Gate | Charter Scope & Definition | Stage 33.3 Evaluation | Status |
| :--- | :--- | :--- | :---: |
| **GATE-01** | Provenance & Freshness Verification | Strict project revision & audio/visual media digests | **PASS** |
| **GATE-04** | Canonical Temporal Alignment | 120,000 ticks/sec, half-open intervals, monotonicity | **PASS** |
| **GATE-06** | Deterministic Fusion & Planning | 3 clean runs 100% bit-identical, key permutation invariant | **PASS** |
| **GATE-08** | Architecture & Release Integrity | 18 canonical schemas byte-identical, 0 deps, OP-AUTH | **PASS** |
| **GATE-05** | Hard-Constraint Correctness & Composition Acceptability | Evaluated in Stage 33.4 (Solver) and Stage 33.5/33.6 | **DEFERRED** |

*Explicit Affirmation*: The Stage 33.3 submission does NOT claim to satisfy GATE-05 (Hard-constraint correctness & composition acceptability). Those thresholds belong exclusively to Stage 33.4 and later benchmark evaluations.

#### 2.2. Audit Documentation & Erratum
A permanent, dated erratum has been appended to the Phase 33 evidence tree at:  
\`evidence/phase-33/stage-33.3/STAGE_33_3_AUDIT_ERRATUM.md\`

**Status**: Finding **S33.3-GATE-01 is CLOSED**.

---

### 3. Reconciled Stage 33.3 Artifact Integrity Ledger

From \`evidence/phase-33/stage-33.3/artifact-integrity-manifest.json\` (Manifest version 1.1.0, 10 artifacts audited and 100% byte-verified):

| Path | Size (Bytes) | SHA-256 Digest |
| :--- | :---: | :--- |
| \`src/fusion/audio-visual-evidence-fusion.js\` | 15,883 | \`7187f529779c4f8109faaa81a80e30bf2d0bc157be616db174d9ec14ea51cd4b\` |
| \`tests/workflow-stage33-3-evidence-fusion.test.js\` | 16,554 | \`f5cd5cbd2f543033df34b9393c3e1dc79bbb6544d0d5d0f52797b98a9cd9d000\` |
| \`evidence/phase-33/stage-33.3/sidecar-adapter-contracts.json\` | 2,079 | \`d3e2404d46a11fdb7da92479f3180bc3dd77e4daef780959527024b24a36f7b0\` |
| \`evidence/phase-33/stage-33.3/evidence-freshness-results.json\` | 2,319 | \`8b7718e83ed629d8fe73a1de11aabe0e6d14d2986aef8bb7a4de4b82f0c7dc25\` |
| \`evidence/phase-33/stage-33.3/deterministic-fusion-results.json\` | 1,638 | \`9ff5b9c83ef1a9ab8cb052ecb51d5f8223e86b5c9430e5de37d5e395ffe72097\` |
| \`evidence/phase-33/stage-33.3/adversarial-input-results.json\` | 2,499 | \`d6b36536e64b00f7c94f7a5a17025ebf502590e60c6b8cd2cda5f54f127873ec\` |
| \`evidence/phase-33/stage-33.3/fusion-fingerprint-reconciliation.json\` | 6,830 | \`627beccdafa638e285a8e5810e3d36903cbecab27ebc821790828ef3e92d996d\` |
| \`evidence/phase-33/stage-33.3/STAGE_33_3_AUDIT_ERRATUM.md\` | 3,466 | \`4a647323be7aec85081a7843d2f838c62da1f6dc890e276cd36e31b74fd1371b\` |
| \`evidence/phase-33/stage-33.3/regression-lineage.json\` | 1,423 | \`9122b76b064f37b085afe56235285c8c7592a2988619446134cf2e602fef4cfa\` |
| \`evidence/phase-33/stage-33.3/stage-report.md\` | 8,867 | \`819511f14e91133a2434fce32f7ba235c4c5816c16fa8c3295e075049da8725c\` |

---

### 4. Test Execution & Cumulative Regression Accounting

- **Stage 33.3 dedicated test suite (\`tests/workflow-stage33-3-evidence-fusion.test.js\`)**:
  - **20 expected, 20 executed, 20 passed, 0 failed, 0 cancelled, 0 skipped** (77.7ms).
- **Cumulative repository regression battery**:
  - Command: \`node --test --test-concurrency=1 tests/workflow-stage21-*.test.js ... tests/workflow-stage33-*.test.js\`
  - Results: **655 expected, 655 executed, 655 passed, 0 failed, 0 cancelled, 0 skipped** across 64 test files in 50.83s.
  - Arithmetic formula: 592 (Predecessor baseline) + 23 (Stage 33.1) + 20 (Stage 33.2) + 20 (Stage 33.3) = **655 cumulative tests**.

---

### 5. Formal Ruling Request

With Findings **S33.3-EVID-01** and **S33.3-GATE-01** fully resolved and closed with machine-readable evidence, we respectfully request the Architecture Lead to:
1. **Close Findings**: Formally close Findings **S33.3-EVID-01** and **S33.3-GATE-01**.
2. **Accept Stage 33.3**: Confirm formal acceptance of Stage 33.3 ("Deterministic Audio-Visual Evidence Fusion").
3. **Authorize Stage 33.4**: Grant formal engineering authorization to proceed to **Stage 33.4 ("Audio-Visual Composition Solver & Candidate Generation")** on branch \`feature/phase-33-4-composition-solver\` descending from reconciliation commit \`ca6b09bcf7f147153a838d115907edbc50d86d95\`.`;

  console.log('2. Finding ChatGPT tab in Brave Browser...');
  const tabCheck = runOsa('window.location.href');
  if (tabCheck === 'NO_TAB') {
    console.error(`Error: Could not find active Brave tab containing "${CHAT_URL_FRAGMENT}".`);
    process.exit(1);
  }
  console.log('   Found active thread:', tabCheck);

  console.log('3. Injecting reconciliation dossier into ChatGPT ProseMirror composer...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Final Stage 33.3 Acceptance Ruling...');
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

  const outPath = path.resolve('plans/CHATGPT_STAGE33_3_FINAL_ACCEPTANCE.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead Stage 33.3 Final Acceptance Ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown.slice(0, 1500) + '...\n');
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
