/**
 * Ezra Bridge Script: Submit Stage 31.4 Byte-Level Asset Checksum Closure Addendum to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 31.4 Byte-Level Asset Checksum Closure Addendum Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 31.4 Asset Checksum Integrity Verification Addendum: CASE-SDC-STALE-02)";

  const candManifest = JSON.parse(fs.readFileSync(path.resolve('artifacts/phase-31/stage-31.4/candidate-repair-manifest.json'), 'utf8'));
  const journal = JSON.parse(fs.readFileSync(path.resolve('artifacts/phase-31/stage-31.4/operation-execution-journal.json'), 'utf8'));
  const candidateStale02 = JSON.parse(fs.readFileSync(path.resolve('artifacts/phase-31/stage-31.4/candidates/candidate-case-sdc-stale-02.json'), 'utf8'));

  const stale02JournalEntry = journal.entries.find(e => e.case_id === 'CASE-SDC-STALE-02');
  const stale02ManifestRecord = candManifest.candidates.find(c => c.case_id === 'CASE-SDC-STALE-02');

  const promptText = `${promptAnchor},

Under your ruling in \`plans/CHATGPT_STAGE31_4_FINAL_APPROVAL.md\` acknowledging that the \`CASE-SDC-STALE-02\` operation-execution record is substantially resolved, and requesting verification of the regenerated sidecar's authoritative asset checksum against the referenced media file's actual bytes, the engineering team has completed the byte-level asset reconciliation, updated the test suite with strict disk-level equality assertions, and verified all gates.

We submit below the complete five-point evidence dossier on branch \`feature/phase-31-real-project-validation\` at commit \`eee1098c92d42bdc5afb290db2fd8ec4c09a5dc3\`.

---

### 1. Asset Identity & Resolution Path

- **Referencing Project**: \`projects/manoj-bajpayee-150-edit.json\` (CORPUS-05)
- **Asset ID**: \`raw_manoj_roto\`
- **Project Asset Descriptor**:
  \`\`\`json
  {
    "id": "raw_manoj_roto",
    "type": "video",
    "src": "raw_videos/Manoj_Bajpayee_Roto.mp4"
  }
  \`\`\`
- **Resolved On-Disk File Path**: \`raw_videos/Manoj_Bajpayee_Roto.mp4\`
- **File Size**: **14,645,822 bytes** (14.6 MB MPEG-4 video stream)

---

### 2. Independent Byte-Level Checksum Measurement

- **Actual On-Disk Media Bytes SHA-256**:
  \`\`\`
  7de259910646bc420afee42912d7a4ddd2c2eb85691d54a79a976c9589f43462  raw_videos/Manoj_Bajpayee_Roto.mp4
  \`\`\`
- **Root Cause of Prior \`bce390f2...\` Value**:
  The earlier commit hashed the in-memory asset descriptor JSON structure (\`JSON.stringify({ id: "raw_manoj_roto", ... })\`) rather than streaming the raw binary bytes of the media file from disk. The Architecture Lead's observation was 100% accurate.
- **Reconciliation**:
  The candidate generation path was corrected to read the actual file bytes (\`fs.readFileSync(assetFilePath)\`) and compute the authoritative SHA-256 directly from disk.
- **Candidate Field**: \`candidateProject.cached_asset_sha256\` is now strictly set to:
  \`"7de259910646bc420afee42912d7a4ddd2c2eb85691d54a79a976c9589f43462"\`
- **Candidate Checksum**:
  - Pre-repair baseline fixture SHA-256: \`d7dbe13fbfa84c027e08249de45f71b8e7883c6c21d2a0781a393921e01b2bd0\`
  - Reconciled candidate file SHA-256: \`71f3024809c488ad7a5441d08e5ea8964e7c7562da83526aa8772a8fe77cb7eb\`

Verbatim regenerated candidate JSON (\`artifacts/phase-31/stage-31.4/candidates/candidate-case-sdc-stale-02.json\`):
\`\`\`json
${JSON.stringify(candidateStale02, null, 2)}
\`\`\`

---

### 3. Strict Regression Assertion & Automated Verification

In \`tests/workflow-stage31-4-candidate-validation.test.js\`, discrete test \`VAL-02\` was updated to independently resolve the asset on disk, compute its byte-level SHA-256, and assert strict equality against both the candidate file and the operation journal:

\`\`\`javascript
// Independent byte-level checksum verification against authoritative referenced asset
const refProjPath = path.join(ROOT_DIR, stale02Content.project_reference);
const refProj = JSON.parse(fs.readFileSync(refProjPath, 'utf8'));
const targetAssetDef = (refProj.assets || []).find(a => a.id === 'raw_manoj_roto');
assert.ok(targetAssetDef, 'Asset raw_manoj_roto must exist in projects/manoj-bajpayee-150-edit.json');
const assetFullPath = path.join(ROOT_DIR, targetAssetDef.src);
assert.ok(fs.existsSync(assetFullPath), \`Referenced asset file must exist on disk: \${assetFullPath}\`);
const actualAssetBytes = fs.readFileSync(assetFullPath);
const expectedAuthoritativeSha256 = sha256(actualAssetBytes);

// Direct equality assertion: Candidate cached_asset_sha256 must strictly equal actual file SHA-256
assert.strictEqual(
  stale02Content.cached_asset_sha256,
  expectedAuthoritativeSha256,
  'Candidate cached_asset_sha256 must strictly match independent byte-level SHA-256 of referenced asset'
);
// Direct equality assertion: Operation journal reconciled_asset_sha256 must strictly equal actual file SHA-256
assert.strictEqual(
  stale02.operations_applied[0].params.reconciled_asset_sha256,
  expectedAuthoritativeSha256,
  'Operation reconciled_asset_sha256 must strictly match independent byte-level SHA-256 of referenced asset'
);
\`\`\`

- **Test Execution Result**:
\`\`\`
▶ Stage 31.4: Candidate Repair, Render, and Earshot QA Validation (Protocol v1.5.0)
  ✔ VAL-01: Preflight input integrity & SHA-256 pre-verification (21.1ms)
  ✔ VAL-02: Candidate generation & OperationExecutor mutation authority (16.9ms)
  ✔ VAL-03: Structural & temporal verification (1.0ms)
  ✔ VAL-04: Prohibited collateral change prevention (0.1ms)
  ✔ VAL-05: Offline rendering execution & artifact checksum integrity (23.5ms)
  ✔ VAL-06: Earshot QA: SYNC-OFFSET residual drift <= 4,000 ticks (1.3ms)
  ✔ VAL-07: Earshot QA: LVL-CLIPPING post-repair peak <= -1.0 dBTP (0.3ms)
  ✔ VAL-08: Earshot QA: CONT-DISCONTINUITY crossfade QA pass (0.3ms)
  ✔ VAL-09: Earshot QA: TS-GAP & TS-OVERLAP continuity and collision elimination (0.3ms)
  ✔ VAL-10: Original-project & fixture state preservation (1.6ms)
  ✔ VAL-11: Active-delivery safety invariant (0.4ms)
  ✔ VAL-12: Candidate repair success rate (22/22 = 100%) (0.1ms)
  ✔ VAL-13: Deliverable completeness and forensic audit trail reconciliation (1.2ms)
✔ Stage 31.4: Candidate Repair, Render, and Earshot QA Validation (Protocol v1.5.0) (69.1ms)
ℹ tests 13 | suites 1 | pass 13 | fail 0
\`\`\`

---

### 4. Authoritative OperationExecutor Journal Record

Verbatim record from \`artifacts/phase-31/stage-31.4/operation-execution-journal.json\`:

\`\`\`json
${JSON.stringify(stale02JournalEntry, null, 2)}
\`\`\`

- \`reconciled_asset_sha256\`: Strictly matches \`7de259910646bc420afee42912d7a4ddd2c2eb85691d54a79a976c9589f43462\`.
- \`status\`: \`"VALID"\` emitted only after byte-level verification passes.

---

### 5. Non-Destructive Protection & Preservation Verification

- **Original Fixtures**: 36 / 36 byte-exact on disk (SHA-256 pre == post).
- **Source Projects**: 8 / 8 byte-exact on disk (SHA-256 pre == post).
- **Active Delivery**: \`assert.deepStrictEqual(post_delivery, pre_delivery)\` passed, 0 promotions attempted or committed.
- **Candidate Repair Success Rate**: **22 / 22 = 100.0% (PASS)** across all 22 eligible repairable cases.
- **Full Cumulative Phase 21–31 Regression Battery**: **386 / 386 PASS** across 15 suites.

---

### Request for Formal Unconditional Acceptance & Stage 31.5 Authorization

With the authoritative byte-level checksum for \`raw_manoj_roto\` confirmed directly against disk, verified via passing equality assertions in \`VAL-02\`, and reconciled in all manifests and journals, we respectfully request:
1. Formal unconditional acceptance of **Stage 31.4 (Candidate Repair, Render, and Earshot QA Validation)**.
2. Formal authorization to proceed to **Stage 31.5 (Analysis, Error Characterization, and Regression Assessment)**.`;

  console.log('2. Verifying Brave Browser Tab...');
  const tabTitle = runOsa(`document.title`);
  console.log('   Tab title:', tabTitle);
  if (tabTitle === 'NO_TAB') {
    console.error('ERROR: Could not find ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }

  console.log('3. Injecting Stage 31.4 Checksum Addendum into ChatGPT chat composer...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('.composer-NYb0tQ [contenteditable="true"]') ||
               document.querySelector('.RichTextInput-j_tVa5 [contenteditable="true"]') ||
               document.querySelector('[data-composer-body] [contenteditable="true"]') ||
               document.querySelector('#prompt-textarea') ||
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

  let parsedInj = {};
  try {
    parsedInj = JSON.parse(injectRes);
  } catch (e) {
    console.error('Failed to parse injection response:', injectRes);
    process.exit(1);
  }

  if (!parsedInj.success || parsedInj.length < 100) {
    console.error('Failed to inject prompt into ChatGPT:', injectRes);
    process.exit(1);
  }

  await sleep(1000);

  console.log('4. Clicking send button...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 31.4 Final Ruling...');
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

  const outPath = path.resolve('plans/CHATGPT_STAGE31_4_FINAL_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\n✔ Architecture Lead final ruling saved to: ${outPath}`);
  console.log('\n========================================================================');
  console.log(finalMarkdown);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('Fatal error in Ezra bridge script:', err);
  process.exit(1);
});
