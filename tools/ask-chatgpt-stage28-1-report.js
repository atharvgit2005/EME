/**
 * Ezra Bridge Script: Submit Stage 28.1 Completion Report to ChatGPT Architecture Lead
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
  const res = spawnSync("osascript", ["-"], { input: script, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return (res.stdout || "").trim();
}

async function main() {
  console.log('1. Preparing Stage 28.1 Completion Report Prompt...');

  const promptAnchor = "Dear ChatGPT Architecture Lead (EME x Earshot Stage 28.1 Completion Report & Stage 28.2 Authorization Request)";

  const promptText = `${promptAnchor},

In accordance with your Phase 28 Kickoff approval and binding conditions (ARC-28-01 through ARC-28-07) in \`plans/CHATGPT_PHASE28_PLAN_APPROVAL.md\`, and following the mandatory engineering directive:
\`“Use required GSD actions to achieve the goals and wherever needed.”\`

The engineering team has completed the full implementation and verification of **Stage 28.1: Proposal Conflict Detector & Dependency Graph**.

---

### 1. Stage 28.1 Deliverables & Git Commit Provenance
- **Commit**: \`58abba7\` (\`feat(audio): implement RepairConflictDetector and audio-repair-policy schema (Stage 28.1)\`)
- **Modules Implemented**:
  1. \`src/audio/schemas/audio-repair-policy.v1.json\`: Formal Draft 2020-12 internal policy schema specifying interval semantics (\`HALF_OPEN_TICKS\`), conflict types (\`TIMELINE_INTERVAL_OVERLAP\`, \`CLIP_OVERLAP\`, \`SAME_CLIP_PROPERTY_CONFLICT\`, \`MUTUALLY_EXCLUSIVE\`, \`CYCLIC_DEPENDENCY\`, \`STALE_REVISION\`, \`TRACK_LOCKED\`), priority ordering, and convergence bounds (\`max_passes = 3\`, \`max_cumulative_shift_ticks = 240,000\`, \`max_cumulative_attenuation_db = 12.0\`).
  2. \`src/audio/repair/repair-conflict-detector.js\`: Pure non-mutating planning component implementing \`RepairConflictDetector\` class:
     - Half-open interval collision math: $[startTick, startTick + durationTicks)$ where abutment ($start_A + dur_A === start_B$) is non-overlapping.
     - Detects same-track interval collisions (\`CLIP_OVERLAP\`), same-clip property interference (\`SAME_CLIP_PROPERTY_CONFLICT\`), contradictory strategies (\`MUTUALLY_EXCLUSIVE\`), stale revisions (\`STALE_REVISION\`), and locked tracks (\`TRACK_LOCKED\`).
     - Builds deterministic dependency DAG with total ordering:
       * Precedence: \`SYNC_RETIME\` $\\prec$ \`PEAK_ATTENUATION\`
       * Timeline sort: Earlier start tick ASC
       * Tie-breaker 1: Lexicographic clip ID ASC
       * Tie-breaker 2: Lexicographic proposal ID ASC
     - DFS cycle detection flags circular dependencies as \`CYCLIC_DEPENDENCY\` and triggers \`reconciliation_required: true\`.
     - Partitions proposals into \`independent_safe\`, \`resolvable_sequential\`, and \`unresolvable_conflicts\`.
  3. \`tests/workflow-stage28-1-conflict-detector.test.js\`: Complete verification test suite covering all 7 planned discrete test cases.

---

### 2. Discrete Subtest Execution Ledger (Stage 28.1)
Command: \`node --test tests/workflow-stage28-1-conflict-detector.test.js\`

| Test ID | Architectural Invariant | Verification Result | Duration |
|:---|:---|:---:|:---:|
| **CFT-01** | Schema validation: validates compliant Draft 2020-12 policy schema & rejects invalid configurations | **PASS** | 2.61 ms |
| **CFT-02** | Same-track interval collision: half-open math ($[a_1, a_2)$ and $[b_1, b_2)$), proves abutment is non-colliding while overlap flags \`CLIP_OVERLAP\` | **PASS** | 1.38 ms |
| **CFT-03** | Same-clip property interference: flags competing gain adjustments on same clip as \`SAME_CLIP_PROPERTY_CONFLICT\` | **PASS** | 0.15 ms |
| **CFT-04** | Safe proposal partitioning: dispatches disjoint proposals across tracks/intervals into \`independent_safe\` with \`CLEAN\` status | **PASS** | 2.60 ms |
| **CFT-05** | Deterministic total ordering: \`SYNC_RETIME\` $\\prec$ \`PEAK_ATTENUATION\`, timeline start tick, clip ID tie-breaker; 50 random shuffles produce 100% identical ordering | **PASS** | 1.70 ms |
| **CFT-06** | Cyclic dependency & mutual exclusion: detects directed cycle between clip swaps, flags \`CYCLIC_DEPENDENCY\`, rejects with \`NEEDS_RECONCILIATION\` | **PASS** | 0.14 ms |
| **CFT-07** | Stale revision & track lock: flags outdated revision as \`STALE_REVISION\` and locked track as \`TRACK_LOCKED\` | **PASS** | 0.12 ms |
| **Suite Harness** | Parent test suite runner harness | **PASS** | 9.96 ms |

**Result**: **7 / 7 discrete subtests PASS (8 / 8 reported by Node.js test runner)** in 82.1 ms.

---

### 3. Cumulative Regression Battery (Phases 21 through 28.1)
Command: \`node --test tests/workflow-stage2{1,2,3,4,5,6,7}*.test.js tests/workflow-stage28-1-conflict-detector.test.js\`

- **Certified Phase 27 Baseline**: **212 / 212 PASS**
- **Additive Stage 28.1 Results**: **+8 reported tests** (7 discrete subtests + 1 suite runner)
- **Cumulative Active Battery**: **220 / 220 PASS (100% Zero Regressions)**
- Execution Time: 15.17s | Failures: 0 | Cancelled: 0 | Skipped: 0

---

### 4. Production Invariants & Constraints Compliance
1. **ARC-28-01 (Conflict Detection Boundary)**: Half-open interval semantics ($[start, start+duration)$) enforced. Abutment start==end is non-overlapping. Component is strictly non-mutating.
2. **ARC-28-02 (Deterministic Total Ordering)**: Strict precedence hierarchy verified: \`SYNC_RETIME\` $\\prec$ \`PEAK_ATTENUATION\`, start tick ASC, clip ID ASC, proposal ID ASC. Cycle detection via DFS flags cycles without arbitrary dropping.
3. **ARC-28-07 (Schema & Dependency Freeze)**: All 18 canonical schemas in \`schema/*.v1.schema.json\` remain 100% frozen. \`"dependencies": {}\` preserved in \`package.json\` (0 runtime npm dependencies). Internal policy schema located at \`src/audio/schemas/audio-repair-policy.v1.json\`.

---

### 5. Action Requested from Architecture Lead
1. Review and accept the Stage 28.1 empirical verification and test results.
2. Grant formal authorization to proceed to **Stage 28.2: Multi-Pass Repair Orchestrator & Bounded Pass Engine** (\`src/audio/repair/multi-pass-orchestrator.js\` and tests \`MPS-01\` through \`MPS-06\`).`;

  console.log('2. Verifying Brave Tab connection...');
  const testConn = runOsa(`(() => window.location.href)()`);
  if (testConn === 'NO_TAB') {
    console.error('ERROR: Could not locate ChatGPT tab with URL fragment:', CHAT_URL_FRAGMENT);
    process.exit(1);
  }
  console.log('   Connected to Brave tab:', testConn);

  console.log('3. Injecting Stage 28.1 Report prompt into ChatGPT input box...');
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

  console.log('5. Awaiting ChatGPT Architecture Lead Stage 28.1 Review Decision...');
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

  console.log('\n=================================================================');
  console.log('✅ CHATGPT ARCHITECTURE LEAD STAGE 28.1 REVIEW DECISION RECEIVED:');
  console.log('=================================================================\n');
  console.log(finalMarkdown);

  const outPath = path.join(__dirname, '../plans/CHATGPT_STAGE28_1_APPROVAL.md');
  fs.writeFileSync(outPath, finalMarkdown, 'utf8');
  console.log(`\nSaved decision to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
