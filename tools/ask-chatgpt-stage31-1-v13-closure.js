/**
 * Ezra Bridge Script: Submit Stage 31.1 Protocol v1.3.0 Reconciled Final Addendum to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 31.1 Protocol v1.3.0 Reconciled Final Addendum Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 31.1 Protocol v1.3.0 Reconciled Final Evidence Addendum)";

  const promptText = `${promptAnchor},

In direct response to your ruling in \`plans/CHATGPT_STAGE31_1_FINAL_APPROVAL.md\`, we submit the final **Stage 31.1 Protocol v1.3.0 Reconciled Addendum** on branch \`feature/phase-31-real-project-validation\` at commit \`fba01a4\`.

All three previous protocol revisions are preserved byte-exact in the repository:
- v1.0.0 in \`archive-v1.0.0/\`
- v1.1.0 in \`archive-v1.1.0/\`
- v1.2.0 in \`archive-v1.2.0/\`

---

### 1. Defect-Case Arithmetic & Quota Reconciliation (All Counts Match)
As instructed, we have preserved all 11 scored defect classes and their current class-level sample minimums, reconciling the totals across the entire benchmark:

| Defect Class ID | Class Name | Overarching Taxonomy Family | Minimum Sample Instances | Nature | Repair Required? |
|:---|:---|:---|:---:|:---:|:---:|
| \`TS-GAP\` | Unintended Black Gap | FAM-01 Timeline Structure | 3 | DEFECT | Yes (Close Gap) |
| \`TS-OVERLAP\` | Clip Overlap Collision | FAM-01 Timeline Structure | 3 | DEFECT | Yes (Reallocate Track) |
| \`SYNC-OFFSET\` | A/V Constant Desync | FAM-02 Synchronization | 3 | DEFECT | Yes (Shift Audio & Rerender) |
| \`LVL-CLIPPING\` | True Peak Clipping (> -1.0 dBTP) | FAM-03 Audio Level | 3 | DEFECT | Yes (Attenuate Gain & Rerender) |
| \`CONT-DISCONTINUITY\` | Waveform Discontinuity / Click | FAM-04 Audio Continuity | 2 | DEFECT | Yes (Apply Equal-Power Crossfade) |
| \`TRN-INVALID\` | Transition Handle Deficit | FAM-05 Transitions | 2 | DEFECT | Yes (Adjust Boundary) |
| \`SDC-STALE\` | Stale Sidecar Metadata | FAM-06 Sidecar Metadata | 2 | DEFECT | Yes (Regenerate Sidecar) |
| \`STR-BROKEN_REF\` | Broken Asset Reference | FAM-07 Structural Consistency | 2 | DEFECT | No (Fail-Closed Rejection) |
| \`STR-FPS-MISMATCH\` | Timeline vs Media Frame Rate | FAM-07 Structural Consistency | 2 | DEFECT | Yes (Cadence Conversion Advisory) |
| \`STR-ASPECT-MISMATCH\`| Aspect Distortion / Stretch | FAM-07 Structural Consistency | 2 | DEFECT | Yes (Scale & Fill / Pillarbox) |
| \`STR-SPEED-RAMP\` | Non-Monotonic Speed Ramp | FAM-07 Structural Consistency | 2 | DEFECT | Yes (Clamp to Cubic Bezier) |
| **Defect Cases Subtotal** | **11 Scored Defect Classes** | **FAM-01 through FAM-07** | **26** | **DEFECT** | **26 Cases (1 instance/case)** |
| \`FPC-CLEAN-MASTER\` | Clean Baseline & Pristine Control | FAM-08 False-Positive Controls | 6 | CLEAN_CONTROL | No (Zero Mutation Authority) |
| \`AMB-PACING\` | Ambiguous Editorial Timing | FAM-09 Ambiguous Cases | 2 | AMBIGUOUS_CASE| No (Escalate to Human Review) |
| \`UNS-3D_WARP\` | Complex 3D Mesh Warp | FAM-10 Unsupported Cases | 2 | UNSUPPORTED_CASE| No (Fail-Closed Rejection) |
| **GRAND TOTAL** | **14 Scored / Control Classes** | **FAM-01 through FAM-10** | **36** | **BENCHMARK CASES**| **36 Total Cases (100% Reviewed)** |

- **Scored Defect Classes**: exactly **11**
- **Defect Cases**: exactly **26** (each case evaluating exactly 1 defect instance, 0 cross-class overlap)
- **Clean-Control Runs**: exactly **6** (\`RUN-CLEAN-01\` through \`RUN-CLEAN-06\`)
- **Ambiguous Cases**: exactly **2** (\`CASE-AMB-01\`, \`CASE-AMB-02\`)
- **Unsupported Cases**: exactly **2** (\`CASE-UNS-01\`, \`CASE-UNS-02\`)
- **Total Benchmark Cases**: exactly **36**
- **Reviewed Ground-Truth Decisions**: exactly **36** (100% independently reviewed prior to execution)

---

### 2. Confirmation of Track-Complexity Quota (>4 Tracks Demonstrably Satisfied)
The exact track counts for all six source projects are recorded in \`corpus-inventory.json\` and verified against source files:
- **CORPUS-01**: **5 tracks** (\`track_bg\`, \`track_vfx\`, \`track_typo\`, \`track_music\`, \`track_sfx\`) -> **5 tracks (>4 tracks)**
- **CORPUS-02**: **4 tracks** (Dialogue, Rhythm, Harmony, SFX stem tracks) -> **4 tracks**
- **CORPUS-03**: **3 tracks** (Base plate, X-ray overlay, Composite FX) -> **3 tracks**
- **CORPUS-04**: **2 tracks** (A1 dialogue, A2 ambient bed) -> **2 tracks**
- **CORPUS-05**: **5 tracks** (\`track_bg\`, \`track_broll\`, \`track_subject\`, \`track_fg_sandwich\`, \`track_master_audio\`) -> **5 tracks (>4 tracks)**
- **CORPUS-06**: **2 tracks** (Stereo master L/R stems) -> **2 tracks**

**Proof of Quota Fulfillment**:
The requirement of minimum 2 projects with strictly >4 tracks is **demonstrably satisfied by 2 qualifying projects**:
1. \`CORPUS-01\` (5 tracks)
2. \`CORPUS-05\` (5 tracks)
Multi-track complexity (>=4 tracks) is satisfied by 3 projects (\`CORPUS-01\`, \`CORPUS-05\`, and \`CORPUS-02\`).

---

### 3. Clean-Control Run-Level False Positive Semantics
Evaluated strictly at the run level:
- \`FP_runs\`: Count of clean-control runs that trigger at least one disallowed false-positive finding or repair proposal (each clean run contributes at most 1).
- \`TotalCleanRuns\`: **6**.
- \`Run_FPR = FP_runs / 6\`.
- Under the maximum FPR threshold of 0.05 with N=6 runs:
  - If \`FP_runs == 0\`: \`Run_FPR = 0 / 6 = 0.00 <= 0.05\` -> **PASS**.
  - If \`FP_runs >= 1\`: \`Run_FPR >= 1 / 6 = 0.1667 > 0.05\` -> **FAIL**.
- Therefore, passing strictly requires **zero false alarms across all six clean runs (\`FP_runs == 0\`)**.
- Sample size limitation (minimum non-zero granularity is 16.7%) is explicitly disclosed.

---

### 4. Frozen Manifest Integrity (\`frozen-benchmark-manifest.json\` v1.3.0)
\`\`\`json
{
  "protocol_version": "1.3.0",
  "historical_references": [
    "artifacts/phase-31/stage-31.1/archive-v1.0.0/frozen-benchmark-manifest.json",
    "artifacts/phase-31/stage-31.1/archive-v1.1.0/frozen-benchmark-manifest.json",
    "artifacts/phase-31/stage-31.1/archive-v1.2.0/frozen-benchmark-manifest.json"
  ],
  "frozen_at": "2026-10-22T18:25:00.000Z",
  "files": {
    "artifacts/phase-31/stage-31.1/corpus-inventory.json": "c72d79aef53b700c393ff34426f181d1c038ca584a9a36aebe3fc37b6d518dfa",
    "artifacts/phase-31/stage-31.1/defect-taxonomy.json": "a20d2652ad0c3da599bd0c152751d79b831c7bf11d582267e1c2da8d906489a6",
    "artifacts/phase-31/stage-31.1/ground-truth-protocol.json": "c3f67e3742a1111709074a12f35a8050cb086a202cdfec1f0d35abddb7c9ef59",
    "artifacts/phase-31/stage-31.1/benchmark-scoring-spec.json": "141b3073c50c2568ec53f6493d98e0fd66e06d710b96e068ffd6f3c45369a74c",
    "artifacts/phase-31/stage-31.1/support-limitation-matrix.json": "ae838f07db1596ea896fa5ee8f115c115c4363bc254f4d0f5825dc8cb4ea944b"
  }
}
\`\`\`

---

### 5. Verification Suite & Cumulative Regression
- Stage 31.1 Protocol Suite (\`tests/workflow-stage31-1-protocol.test.js\`): **9 / 9 PASS (100%)** (\`PRT-01..09\`).
- Predecessor Regression Baseline (Phases 21–30): **338 / 338 PASS (100%)**.
- Cumulative Test Total: **347 / 347 PASS (100%)**.
- All 18 canonical JSON schemas in \`schema/*.v1.schema.json\` remain 100% frozen.
- Zero runtime npm dependencies (\`"dependencies": {}\`).

---

### Action Requested from Architecture Lead
1. Grant **Unconditional Acceptance for Stage 31.1** based on the reconciled Protocol v1.3.0 evidence.
2. Grant formal authorization to proceed to full execution of **Stage 31.2: Representative Project Corpus and Defect Taxonomy**.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 31.1 Protocol v1.3.0 Addendum into ChatGPT input box...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('.composer-NYb0tQ [contenteditable="true"]') ||
               document.querySelector('.RichTextInput-j_tVa5 [contenteditable="true"]') ||
               document.querySelector('[data-composer-body] [contenteditable="true"]') ||
               document.querySelector('#prompt-textarea');
    if (!el) return JSON.stringify({ error: 'NO_COMPOSER_ELEMENT' });

    el.focus();
    const prompt = ${JSON.stringify(promptText)};

    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.addRange(range);
    document.execCommand('delete', false);
    document.execCommand('insertText', false, prompt);

    return JSON.stringify({ success: true, length: el.innerText.length });
  })()`);
  console.log('   Injection:', injectRes);

  await sleep(1000);

  console.log('4. Clicking Send button...');
  const sendRes = runOsa(`(() => {
    const btn = document.querySelector('button[aria-label="Send"]') ||
                document.querySelector('button[data-testid="send-button"]') ||
                document.querySelector('button[aria-label*="Send"]');
    if (!btn) return "NO_SEND_BUTTON";
    btn.click();
    return "CLICKED_SEND";
  })()`);
  console.log('   Send:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    console.error('Failed to click send button. Send result:', sendRes);
    process.exit(1);
  }

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 31.1 Final Ruling...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;

      const main = document.querySelector('main') || document.body;
      const text = main ? main.innerText : '';

      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        return JSON.stringify({ isGenerating, pIdx: -1, len: 0, text: '' });
      }

      const afterPrompt = text.slice(pIdx);
      let responseText = '';
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx !== -1) {
        responseText = afterPrompt.slice(mIdx + marker.length).trim();
      } else {
        responseText = afterPrompt.slice(${JSON.stringify(promptAnchor)}.length).trim();
      }

      const footerMarkers = [
        "ChatGPT can make mistakes.",
        "Meet Codex in the desktop app",
        "A coding agent that helps you build and ship"
      ];
      for (const f of footerMarkers) {
        const fIdx = responseText.lastIndexOf(f);
        if (fIdx !== -1) {
          responseText = responseText.slice(0, fIdx).trim();
        }
      }

      return JSON.stringify({
        isGenerating,
        pIdx,
        len: responseText.length,
        snippet: responseText.slice(-200),
        text: responseText
      });
    })()`);

    let parsed = {};
    try {
      parsed = JSON.parse(checkRes);
    } catch (e) {
      console.log(`   [Attempt ${attempt + 1}/90] Waiting... (parse error: ${checkRes.slice(0, 60)})`);
      continue;
    }

    console.log(`   [Attempt ${attempt + 1}/90] isGenerating: ${parsed.isGenerating}, len: ${parsed.len}`);
    if (parsed.snippet) {
      console.log(`      Snippet: ${parsed.snippet.replace(/\n/g, ' ')}...`);
    }

    if (!parsed.isGenerating && parsed.len > 300 && attempt >= 3) {
      completed = true;
      finalMarkdown = parsed.text;
      break;
    }
  }

  if (!completed) {
    console.error('ERROR: Timed out waiting for ChatGPT Architecture Lead response.');
    process.exit(1);
  }

  console.log('\n=============================================================================');
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 31.1 FINAL DECISION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE31_1_FINAL_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nDecision saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
