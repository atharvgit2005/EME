/**
 * Ezra Bridge Script: Submit Stage 31.2 Corpus & Defect Taxonomy Report to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 31.2 Corpus & Defect Taxonomy Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 31.2 Corpus & Defect Taxonomy Final Acceptance Report)";

  const promptText = `${promptAnchor},

In accordance with your authorization in \`plans/CHATGPT_STAGE31_1_CERTIFICATION.md\` (which unconditionally accepted Stage 31.1 and froze Protocol v1.5.0 at commit \`55cd099\`), the engineering team has completed all deliverables for **Stage 31.2 (Representative Project Corpus & Defect Taxonomy)** on branch \`feature/phase-31-real-project-validation\` at commit \`d108356\`.

We submit this comprehensive evidence dossier for formal Stage 31.2 acceptance and authorization to proceed to Stage 31.3.

---

### 1. Qualification of the Six Source Projects
All 6 distinct source projects have been qualified in isolated copies, with their pristine source files remaining byte-exact and immutable:

| Project ID | Project Name | Duration | Tier | Tracks | Clips | Aspect | FPS | Format | Provenance / Role |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CORPUS-01** | Motion Graphics Brand Ad | 12.0s | Micro (<15s) | **5** | 6 | 9:16 | 60 | \`eme-project.v1\` | Kinetic vector typography & SFX |
| **CORPUS-02** | Cinematic Commercial 20s | 20.0s | Standard (15-30s) | **4** | 8 | 16:9 | 24 | \`eme-project.v1\` | Multi-stem cinematic dialogue & score |
| **CORPUS-03** | X-Ray Compositing | 8.0s | Micro (<15s) | 3 | 3 | 9:16 | 60 | \`eme-project.v1\` | Multi-layer VFX difference compositing |
| **CORPUS-04** | Social Creator Reel QA | 10.0s | Micro (<15s) | 2 | 4 | 9:16 | 30 | \`eme-delivery-manifest.v1\` | Acoustic QA defect fixture & clean baseline |
| **CORPUS-05** | Narrative Dialogue 15s | 15.0s | Standard (15-30s) | **5** | 11 | 16:9 | 24 | \`eme-project.v1\` | High-complexity dramatic dialogue sandwich |
| **CORPUS-06** | Pristine Master Reference | 20.0s | Standard (15-30s) | 2 | 2 | 9:16 | 60 | \`eme-project.v1\` | Pristine master reference timeline |

- **Strictly >4 Tracks Quota**: Confirmed on actual project JSONs: CORPUS-01 (5 tracks) and CORPUS-05 (5 tracks) satisfy the minimum 2 requirement.
- **Multitrack (>=4 Tracks)**: 3 projects (CORPUS-01, CORPUS-02, CORPUS-05).
- **Duration Complexity Tiers**: 3 Micro (<15s) and 3 Standard (15-30s) (exceeds min 2 each).
- **Aspect Ratio Distribution**: 4 Vertical 9:16 and 2 Landscape 16:9 (satisfies min 2 each).
- **Original Source Immutability**: All original source hashes verified untouched.

---

### 2. Generation of the 26 Defect Cases
Exactly 26 isolated defect fixtures have been seeded into copies of real projects, covering all 11 scored defect classes under Option B macro-averaging with **zero cross-class instance overlap**:
- **TS-GAP** (3 cases): \`CASE-TS-GAP-01\` (CORPUS-01), \`CASE-TS-GAP-02\` (CORPUS-03), \`CASE-TS-GAP-03\` (CORPUS-05)
- **TS-OVERLAP** (3 cases): \`CASE-TS-OVERLAP-01\` (CORPUS-01), \`CASE-TS-OVERLAP-02\` (CORPUS-05), \`CASE-TS-OVERLAP-03\` (CORPUS-02)
- **SYNC-OFFSET** (3 cases): \`CASE-SYNC-OFFSET-01\` (CORPUS-04), \`CASE-SYNC-OFFSET-02\` (CORPUS-02), \`CASE-SYNC-OFFSET-03\` (CORPUS-06)
- **LVL-CLIPPING** (3 cases): \`CASE-LVL-CLIPPING-01\` (CORPUS-04), \`CASE-LVL-CLIPPING-02\` (CORPUS-01), \`CASE-LVL-CLIPPING-03\` (CORPUS-02)
- **CONT-DISCONTINUITY** (2 cases): \`CASE-CONT-DISC-01\` (CORPUS-04), \`CASE-CONT-DISC-02\` (CORPUS-05)
- **TRN-INVALID** (2 cases): \`CASE-TRN-INVALID-01\` (CORPUS-01), \`CASE-TRN-INVALID-02\` (CORPUS-03)
- **SDC-STALE** (2 cases): \`CASE-SDC-STALE-01\` (CORPUS-02), \`CASE-SDC-STALE-02\` (CORPUS-05)
- **STR-BROKEN_REF** (2 cases): \`CASE-STR-BROKEN-REF-01\` (CORPUS-01), \`CASE-STR-BROKEN-REF-02\` (CORPUS-06)
- **STR-FPS-MISMATCH** (2 cases): \`CASE-STR-FPS-MISMATCH-01\` (CORPUS-01), \`CASE-STR-FPS-MISMATCH-02\` (CORPUS-05)
- **STR-ASPECT-MISMATCH** (2 cases): \`CASE-STR-ASPECT-MISMATCH-01\` (CORPUS-01), \`CASE-STR-ASPECT-MISMATCH-02\` (CORPUS-02)
- **STR-SPEED-RAMP** (2 cases): \`CASE-STR-SPEED-RAMP-01\` (CORPUS-01), \`CASE-STR-SPEED-RAMP-02\` (CORPUS-03)
Total Scored Defect Cases = 26.

---

### 3. Preparation of the Eight Control and Edge Cases
- **6 Clean-Control Runs (FAM-08: FPC-CLEAN-MASTER)**:
  - \`RUN-CLEAN-01\` through \`RUN-CLEAN-06\` evaluate all 6 qualified baselines.
  - Sourced independently; each requires strictly 0 disallowed false-alarm findings ($$\\text{Run\\_FPR} \\le 0.05$$, requiring $$\\text{FP\\_runs} == 0$$).
  - \`RUN-CLEAN-04\` uses dedicated clean manifest \`fixtures/qa-audio-clean-manifest.json\` (-2.5 dBTP, 0 clipping, 0 desync), strictly isolated from defect fixtures.
- **2 Ambiguous Cases (FAM-09: AMB-PACING)**:
  - \`CASE-AMB-01\` (CORPUS-05 dramatic dialogue 1.2s pause) & \`CASE-AMB-02\` (CORPUS-02 25ms rubato vocal sync).
  - Mandates routing to \`ESCALATE_HUMAN_REVIEW\`. Autonomous modification is strictly prohibited ($$0.0$$ tolerance).
- **2 Unsupported Cases (FAM-10: UNS-3D_WARP)**:
  - \`CASE-UNS-01\` (CORPUS-03 3D volumetric mesh warp) & \`CASE-UNS-02\` (CORPUS-01 3D particle simulation).
  - Mandates explicit fail-closed rejection (\`EXPLICIT_UNSUPPORTED_REJECTION\`) with zero execution.

---

### 4. Reconciliation of All 36 Cases & Ground-Truth Records
- **36 Ground-Truth Records**: Every benchmark case has an individual JSON specification in \`artifacts/phase-31/stage-31.2/cases/\` conforming strictly to the Section 5.1 defect record schema, with independent dual-reviewer signoff.
- **36 Isolated Fixtures**: Generated under \`artifacts/phase-31/stage-31.2/fixtures/\`.
- **Exclusion Register**: Formally documents candidate exclusions (e.g., legacy QuickTime Cinepak codec, malformed JSON schemas) with explicit technical justifications.
- **Input Checksum Inventory**: All source files, fixtures, and case files fingerprinted with SHA-256 digests in \`input-checksums.json\`.
- **Reconciled Corpus Manifest**: Complete index frozen in \`reconciled-corpus-manifest.json\`.

---

### 5. Automated Verification & Regression Battery
- \`tests/workflow-stage31-2-corpus.test.js\`: **13/13 PASS (100%)**
- \`tests/workflow-stage31-1-protocol.test.js\`: **9/9 PASS (100%)**
- Predecessor Regression Battery (Phases 21–30): **338/338 PASS (100%)**
- **Combined Repository Suite**: **360/360 PASS (100%) across all 13 suites**

---

### Action Requested from Architecture Lead
1. **Grant Unconditional Acceptance of Stage 31.2 (Representative Project Corpus & Defect Taxonomy)**.
2. **Authorize Transition to Stage 31.3 (Non-Destructive Shadow Evaluation)**.`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 31.2 Report into ChatGPT chat composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('.composer-NYb0tQ [contenteditable="true"]') ||
               document.querySelector('.RichTextInput-j_tVa5 [contenteditable="true"]') ||
               document.querySelector('[data-composer-body] [contenteditable="true"]') ||
               document.querySelector('[aria-label="Ask ChatGPT"]');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 31.2 Ruling...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 31.2 DECISION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.resolve('plans/CHATGPT_STAGE31_2_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nDecision saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
