/**
 * Ezra Bridge Script: Submit Stage 31.3 Non-Destructive Hash Verification Addendum to ChatGPT Architecture Lead
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
  console.log('1. Preparing Stage 31.3 Non-Destructive Hash Verification Addendum Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 31.3 Non-Destructive Hash Verification Addendum)";

  const promptText = `${promptAnchor},

Thank you for confirming the formal closure of the canonical lifecycle finding for ambiguous pacing cases in your latest ruling (\`plans/CHATGPT_STAGE31_3_APPROVAL.md\`).

In direct response to your narrow and specific evidence requirement, the engineering team has extended the targeted Stage 31.3 regression test suite (\`tests/workflow-stage31-3-shadow-eval.test.js\`, test \`SHW-11\`) to independently compute and verify the cryptographic SHA-256 digests of the original project files and fixtures, rather than relying solely on reported boolean flags, on branch \`feature/phase-31-real-project-validation\` at commit \`7413c114e6f8303e49880503ee9c28b2b78bc2a0\`.

We submit below the complete verification evidence:

---

### 1. Extended Regression Test Code (\`SHW-11\` in \`tests/workflow-stage31-3-shadow-eval.test.js\`)

\`\`\`javascript
  test('SHW-11: Ambiguous cases escalation fidelity (EF >= 0.95, strictly 0 autonomous modifications)', () => {
    const confRep = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'confidence-escalation-report.json'), 'utf8'));
    const amb = confRep.ambiguous_cases;

    assert.strictEqual(amb.status, 'PASSED');
    assert.strictEqual(amb.total_evaluated, 2);
    assert.strictEqual(amb.escalated_to_human_review, 2);
    assert.strictEqual(amb.escalation_fidelity, 1.0);
    assert.strictEqual(amb.autonomous_modifications, 0);

    for (const c of amb.cases) {
      assert.strictEqual(c.routing, 'ESCALATE_HUMAN_REVIEW');
      assert.strictEqual(c.autonomous_permitted, false);
      assert.strictEqual(c.canonical_job_status, 'NEEDS_RECONCILIATION');
    }

    // Load preflight checksum inventory and original-state preservation audit
    const inputChecksums = JSON.parse(fs.readFileSync(path.join(STAGE_31_2_DIR, 'input-checksums.json'), 'utf8'));
    const preservationRep = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'original-state-preservation.json'), 'utf8'));

    // 1. Verify CASE-AMB-01
    const amb01 = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'cases/shadow-case-amb-01.json'), 'utf8'));
    assert.strictEqual(amb01.canonical_job_status, 'NEEDS_RECONCILIATION');
    assert.strictEqual(amb01.outcome_reason, 'ESCALATED_HUMAN_REVIEW');
    assert.strictEqual(amb01.evaluation.repair_proposal_generated, false);
    assert.strictEqual(amb01.evaluation.candidate_operations_count, 0);
    assert.strictEqual(amb01.evaluation.autonomous_repair_permitted, false);
    assert.strictEqual(amb01.evaluation.active_delivery_preserved, true);

    // Independent cryptographic verification of CASE-AMB-01 fixture file
    const amb01FixturePath = path.join(ROOT_DIR, amb01.fixture_file);
    const amb01ActualFixtureHash = fileSha256(amb01FixturePath);
    const amb01ExpectedPreHash = preservationRep.post_evaluation_hashes['CASE-AMB-01'].pre_hash;
    assert.strictEqual(amb01ActualFixtureHash, amb01ExpectedPreHash, 'CASE-AMB-01 fixture file mutated!');
    assert.strictEqual(amb01ActualFixtureHash, '6025322fd2ca697cdddab86cd64a953d66d99aa3f6a94c660c0034e9d300f39c');

    // Independent cryptographic verification of CASE-AMB-01 source project (CORPUS-05: projects/manoj-bajpayee-150-edit.json)
    const corpus05Path = path.join(ROOT_DIR, 'projects/manoj-bajpayee-150-edit.json');
    const corpus05ActualHash = fileSha256(corpus05Path);
    const corpus05ExpectedHash = inputChecksums.pristine_source_projects['projects/manoj-bajpayee-150-edit.json'].sha256;
    assert.strictEqual(corpus05ActualHash, corpus05ExpectedHash, 'CORPUS-05 source project mutated!');
    assert.strictEqual(corpus05ActualHash, '2d65a17db00317beff1f831eb51c1cd06d0d3360b05c4ad17f74fb9e1f6810ff');

    // 2. Verify CASE-AMB-02
    const amb02 = JSON.parse(fs.readFileSync(path.join(STAGE_31_3_DIR, 'cases/shadow-case-amb-02.json'), 'utf8'));
    assert.strictEqual(amb02.canonical_job_status, 'NEEDS_RECONCILIATION');
    assert.strictEqual(amb02.outcome_reason, 'ESCALATED_HUMAN_REVIEW');
    assert.strictEqual(amb02.evaluation.repair_proposal_generated, false);
    assert.strictEqual(amb02.evaluation.candidate_operations_count, 0);
    assert.strictEqual(amb02.evaluation.autonomous_repair_permitted, false);
    assert.strictEqual(amb02.evaluation.active_delivery_preserved, true);

    // Independent cryptographic verification of CASE-AMB-02 fixture file
    const amb02FixturePath = path.join(ROOT_DIR, amb02.fixture_file);
    const amb02ActualFixtureHash = fileSha256(amb02FixturePath);
    const amb02ExpectedPreHash = preservationRep.post_evaluation_hashes['CASE-AMB-02'].pre_hash;
    assert.strictEqual(amb02ActualFixtureHash, amb02ExpectedPreHash, 'CASE-AMB-02 fixture file mutated!');
    assert.strictEqual(amb02ActualFixtureHash, '28410d4a0c2118cab2b2df611df555d19f7fb4d9139f258a6da4a9958ebbc8cf');

    // Independent cryptographic verification of CASE-AMB-02 source project (CORPUS-02: assets/cinematic_ad_events_20s.json)
    const corpus02Path = path.join(ROOT_DIR, 'assets/cinematic_ad_events_20s.json');
    const corpus02ActualHash = fileSha256(corpus02Path);
    const corpus02ExpectedHash = inputChecksums.pristine_source_projects['assets/cinematic_ad_events_20s.json'].sha256;
    assert.strictEqual(corpus02ActualHash, corpus02ExpectedHash, 'CORPUS-02 source project mutated!');
    assert.strictEqual(corpus02ActualHash, '2e763f7c52bac362deff13c97d8b6fc66b75930a7fc96fdb42646eea5846aff3');

    // 3. Independent active delivery safety invariant check
    assert.strictEqual(preservationRep.active_delivery_preserved, true);
    assert.strictEqual(amb01.evaluation.active_delivery_preserved, true);
    assert.strictEqual(amb02.evaluation.active_delivery_preserved, true);
  });
\`\`\`

---

### 2. Independent Cryptographic Measurements Ledger

| Case Identifier | Entity Type | Target Path on Disk | Pre-Evaluation Digest (Immutable Checksum Inventory) | Live Computed Post-Evaluation Digest | Cryptographic Match |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CASE-AMB-01** | Fixture File | \`artifacts/phase-31/stage-31.2/fixtures/fixture-case-amb-01.json\` | \`6025322fd2ca697cdddab86cd64a953d66d99aa3f6a94c660c0034e9d300f39c\` | \`6025322fd2ca697cdddab86cd64a953d66d99aa3f6a94c660c0034e9d300f39c\` | **IDENTICAL (Zero Mutation)** |
| **CASE-AMB-01** | Original Source Project (\`CORPUS-05\`) | \`projects/manoj-bajpayee-150-edit.json\` | \`2d65a17db00317beff1f831eb51c1cd06d0d3360b05c4ad17f74fb9e1f6810ff\` | \`2d65a17db00317beff1f831eb51c1cd06d0d3360b05c4ad17f74fb9e1f6810ff\` | **IDENTICAL (Zero Mutation)** |
| **CASE-AMB-02** | Fixture File | \`artifacts/phase-31/stage-31.2/fixtures/fixture-case-amb-02.json\` | \`28410d4a0c2118cab2b2df611df555d19f7fb4d9139f258a6da4a9958ebbc8cf\` | \`28410d4a0c2118cab2b2df611df555d19f7fb4d9139f258a6da4a9958ebbc8cf\` | **IDENTICAL (Zero Mutation)** |
| **CASE-AMB-02** | Original Source Project (\`CORPUS-02\`) | \`assets/cinematic_ad_events_20s.json\` | \`2e763f7c52bac362deff13c97d8b6fc66b75930a7fc96fdb42646eea5846aff3\` | \`2e763f7c52bac362deff13c97d8b6fc66b75930a7fc96fdb42646eea5846aff3\` | **IDENTICAL (Zero Mutation)** |

---

### 3. Invariants Verification Summary for Ambiguous Pacing Cases

Across both \`CASE-AMB-01\` and \`CASE-AMB-02\`:
1. **Canonical Job Status**: Strictly **\`NEEDS_RECONCILIATION\`** (neither \`AWAITING_APPROVAL\` nor any noncanonical status).
2. **Zero Repair Proposals & Zero Candidate Operations**: \`repair_proposal_generated === false\`, \`candidate_operations_count === 0\`, \`autonomous_repair_permitted === false\`.
3. **Byte-Level Preservation**: Both fixture files and pristine source projects are byte-exact identical to pre-evaluation truth (zero disk mutation).
4. **Active Delivery Safety**: \`session.active_delivery\` preserved 100% untouched and unpromoted.

---

### 4. Targeted Test Suite Execution Results

\`\`\`
▶ Stage 31.3: Non-Destructive Shadow Evaluation (Protocol v1.5.0)
  ✔ SHW-01: Preflight input integrity & SHA-256 pre-verification (clean audio, source projects, fixtures) (13.7ms)
  ✔ SHW-02: Non-destructive shadow execution invariant (zero mutation to original fixtures or source projects) (28.7ms)
  ✔ SHW-03: Active-delivery safety invariant (session.active_delivery preserved 100% untouched) (0.8ms)
  ✔ SHW-04: Defect detection precision & recall across all 11 scored defect classes (14.2ms)
  ✔ SHW-05: Defect localization accuracy within permitted tolerances (2.6ms)
  ✔ SHW-06: Diagnosis, action compliance, and repair proposal validity across all 26 scored defect cases (4.7ms)
  ✔ SHW-07: Prohibited collateral change prevention (zero modification to prohibited tracks) (0.8ms)
  ✔ SHW-08: Option B 11-defect-class macro averaging compliance (Macro P >= 0.90, R >= 0.85, Loc >= 0.80) (1.4ms)
  ✔ SHW-09: Anti-concealment gate (each of the 11 classes independently satisfies its frozen class-level gate) (0.5ms)
  ✔ SHW-10: Clean-control false-positive prevention (Run_FPR <= 0.05, strictly 0 FP runs across all 6 controls) (0.8ms)
  ✔ SHW-11: Ambiguous cases escalation fidelity (EF >= 0.95, strictly 0 autonomous modifications) (2.3ms)
  ✔ SHW-12: Unsupported cases fail-closed rejection (URR >= 0.95, strictly 0 execution bypasses) (1.9ms)
  ✔ SHW-13: Deliverable completeness and forensic audit trail reconciliation (Exactly 9 deliverables) (7.2ms)
✔ Stage 31.3: Non-Destructive Shadow Evaluation (Protocol v1.5.0) (81.8ms)
ℹ tests 13
ℹ suites 1
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
\`\`\`

Cumulative 14-suite regression battery confirmed: **373 / 373 PASS**, 0 failures.

---

### Request for Formal Acceptance & Stage 31.4 Authorization
With this independent cryptographic proof verifying that no files were mutated, \`session.active_delivery\` remained untouched, and both ambiguous cases enter \`NEEDS_RECONCILIATION\` without generating repair proposals, every requirement for Stage 31.3 has been completely fulfilled.

We respectfully request:
1. Formal unconditional acceptance of **Stage 31.3 (Non-Destructive Shadow Evaluation)**.
2. Formal authorization to proceed to **Stage 31.4 (Candidate Repair, Render, and Earshot QA Validation)**.`;

  console.log('2. Verifying Brave Browser Tab...');
  const tabTitle = runOsa(`document.title`);
  console.log('   Tab title:', tabTitle);
  if (tabTitle === 'NO_TAB') {
    console.error('ERROR: Could not find ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }

  console.log('3. Injecting Stage 31.3 Hash Verification Addendum into ChatGPT chat composer...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 31.3 Final Decision...');
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
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 31.3 FINAL DECISION:');
  console.log('=============================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.resolve('plans/CHATGPT_STAGE31_3_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nDecision saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
