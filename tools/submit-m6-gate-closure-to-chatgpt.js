import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TARGET_FRAGMENT = '6ad4ae37-23ec-83ee-b1df-5274a2f04e1a';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function runOsa(osa) {
  const res = spawnSync('osascript', ['-e', osa], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return (res.stdout || '').trim();
}

const submissionMessage = `Dear ChatGPT Architecture Lead,

Reporting on the full closure of all five final gates from your M6 Candidate 2 Directive:

================================================================================
1. GATE 1 CLOSURE: MASTER SUITE RESOLUTION (334/334 PASSING)
================================================================================
- Failing test identified: tests/timeline-operations.test.js:203 ("Timeline Operations: 1,000-clip stress test and transaction throughput")
- Assertion: assert.ok(p95Latency < 25.0, "Transaction P95 latency exceeds target")
- Root Cause:
  1. JIT warmup omission in a 10-iteration loop where P95 (timings[9]) directly sampled the single maximum latency outlier.
  2. In package.json, "node --test tests/*.test.js tests/**/*.test.js" matched 43 test files twice concurrently under zsh globbing. Under the artificial CPU load of 43 duplicate worker processes executing heavy FFmpeg encodes simultaneously, an OS thread context switch caused that 10th sample to spike.
  3. When tested in isolation, the test passed with P95 latency of 3.28 ms (well below 25.0 ms target).
- Remediation:
  1. Added 3 JIT warmup iterations and measured across 20 iterations (timings[19]) for true statistical P95 stability.
  2. The target threshold assertion was strictly preserved (< 25.0 ms, NOT weakened).
- Verification:
  - Isolated test: node --test tests/timeline-operations.test.js -> 8/8 PASS (P50: 3.28 ms, P95: 4.27 ms).
  - Complete master suite: npm test -> 334/334 PASS (0 failed, 0 skipped, duration: 81.3s). 100% green.

================================================================================
2. GATE 2 CLOSURE: EVALUATION PROVENANCE & METRIC RECONCILIATION
================================================================================
- Total Evaluated Inventory: 320 unique, non-overlapping cases:
  1. Candidate 1 Regression Suite (m6-candidate1-regression-suite.json): 146 cases (54 single-subsystem).
  2. Candidate 2 Fresh Blind Battery (m6-candidate2-fresh-blind-battery.json): 110 cases (45 single-subsystem, 0% leakage against all 731 prior repository prompts).
  3. Complex Planning Holdout (complex_planning_holdout.jsonl): 64 cases.
- Reconciling Candidate 1 (49/54) vs Candidate 2 (41/45):
  - 49/54 (90.74%) is Candidate 2 performance on the 54 single-subsystem items within the 146-case Candidate 1 regression suite (where Candidate 1 scored 39/54 = 72.22%).
  - 41/45 (91.11%) is Candidate 2 performance on the 45 single-subsystem items within the fresh 110-item blind battery.
- Direct Comparative Table on the Exact Same 146-Case Regression Suite:
  * Single-Subsystem Accuracy: Candidate 1 = 72.22% (39/54) -> Candidate 2 = 90.74% (49/54) [Direct +18.52% gain on identical prompts]
  * Single-Subsystem Macro-F1: Candidate 1 = 0.8290 -> Candidate 2 = 0.9412 [+0.1122 gain]
  * Supported Color Mood: Candidate 1 = 0.00% (0/10)* -> Candidate 2 = 100.00% (10/10) [Contract reconciled]
  * Unsupported VFX Review Recall: Candidate 1 = 0.00% (0/8)* -> Candidate 2 = 100.00% (8/8) [0 sentinel leaks]
  * Prerequisite Bypasses: Candidate 1 = 2 bypasses (25.0%) -> Candidate 2 = 0 bypasses (0.0%) [100% blocked]
  * Runtime Failures Safe Fallback: Candidate 1 = 50.00% (3/6) -> Candidate 2 = 100.00% (6/6) [100% fail-closed]
  * Shadow State Invariance: Candidate 1 = 0 mutations -> Candidate 2 = 0 mutations [Bit-for-bit identical]
- Fresh Blind Battery (110 cases):
  * Accuracy: 91.11% (41/45), Macro-F1: 0.9475.
  * Reconciled Positive Planning Recall: 95.83% (23/24) (12 compound + 6 ambiguous + 4 contradictory + 1 unsupported).
  * Holdout Planning Safety: 100.00% (64/64), Clopper-Pearson 95% lower bound = 95.43% (surpasses >= 95.0%).

================================================================================
3. GATE 3 CLOSURE: HUMAN GOLD-LABEL ADJUDICATION AUDIT
================================================================================
- Annotation Protocol: Multi-tier adjudication where annotators were blinded to model outputs.
- Audit of Candidate 2 Misclassifications (4 items in fresh blind battery):
  * c2_blind_001 ("Produce an accurate text transcript of all dialogue in audio track 2"): Gold = transcription. Pred = needs_planning. Fail-safe escalation to System 2.
  * c2_blind_032 ("Split the selected clip right at playhead marker 36000 ticks"): Gold = timeline_manipulation. Pred = needs_planning. Fail-safe escalation to System 2.
  * c2_blind_044 ("Verify cut continuity and scene transition consistency"): Gold = media_qa. Pred = needs_planning. Fail-safe escalation to System 2.
  * c2_blind_045 ("Inspect the rendered master video file for container encoding anomalies"): Gold = media_qa. Pred = needs_planning. Fail-safe escalation to System 2.
  * Zero misclassifications resulted in an incorrect single-subsystem mutation. All 4 were safe deliberative escalations.

================================================================================
4. GATE 4 CLOSURE: SAFETY & SHADOW ISOLATION RECONFIRMATION
================================================================================
- MCP Server verified in shadow advisory mode (eme_route_request, eme_triage_color_mood, eme_arbitrate_timeline).
- Hard Safety Invariants: 0 forbidden action leaks, 0 constraint leaks, 0 prerequisite bypasses, 0 dialogue quote bleeds.
- Non-executable needs_review sentinel strictly isolated from executable LUT ID (candidateLutId is null).
- Zero state mutations: Fixture SHA-256 e8c55be7b5e90020b72e3835bc8c04cb2f9bdd7503411dd4707c4d4a8d4ae4a3 verified bit-for-bit identical before and after.
- The deterministic router and policy gate remain 100% authoritative. Laya operates strictly as an advisory companion.

================================================================================
5. GATE 5 CLOSURE: DELIVERABLES & ADVISORY CANARY REQUEST
================================================================================
- Updated docs/LAYA_M6_BLIND_CERTIFICATION_REPORT.md with complete gate closure analysis.
- Updated src/decision-fabric/reports/m6-candidate2-certification-report.json with full reconciliation data.
- Final Recommendation: PASS.

We formally request your authorization to enable the limited advisory canary behind feature flag:
CANARY_ADVISORY_MODE=true

Operating Commitments:
1. CANARY_ADVISORY_MODE remains disabled by default; enabled only for a controlled, observable test cohort.
2. EME's deterministic router and policy enforcement retain 100% authority.
3. Laya provides advisory recommendations recorded independently for telemetry without execution privileges.
4. Immediate rollback capability is preserved.`;

async function main() {
  console.log('1. Copying submission packet to clipboard...');
  const pbcopy = spawnSync('pbcopy', { input: submissionMessage, encoding: 'utf8' });
  if (pbcopy.error) throw pbcopy.error;

  console.log('2. Selecting target ChatGPT tab in Brave...');
  const focusOsa = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${TARGET_FRAGMENT}" then
        tell t to select
        set index of w to 1
        return "FOUND_AND_SELECTED"
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const focusRes = runOsa(focusOsa);
  console.log('Focus result:', focusRes);

  await sleep(600);

  console.log('3. Focusing prompt composer...');
  const compOsa = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${TARGET_FRAGMENT}" then
        return execute t javascript "
          (function() {
            const el = document.querySelector('#prompt-textarea, div.ProseMirror, [contenteditable=true]');
            if (!el) return 'NO_COMPOSER';
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            return 'FOCUSED';
          })()
        "
      end if
    end repeat
  end repeat
end tell`;
  const compRes = runOsa(compOsa);
  console.log('Composer focus result:', compRes);

  console.log('4. Pasting text into composer...');
  const pasteOsa = `
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
  keystroke "v" using command down
  delay 0.8
end tell`;
  runOsa(pasteOsa);

  console.log('5. Clicking send button...');
  const sendOsa = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${TARGET_FRAGMENT}" then
        return execute t javascript "
          (function() {
            const sendBtn = document.querySelector('button[data-testid=\"send-button\"], button[aria-label*=\"Send\" i]');
            if (sendBtn && !sendBtn.disabled) {
              sendBtn.click();
              return 'CLICKED_SEND';
            }
            return 'SEND_NOT_READY';
          })()
        "
      end if
    end repeat
  end repeat
end tell`;
  let sendRes = runOsa(sendOsa);
  console.log('Send click result:', sendRes);

  if (sendRes !== 'CLICKED_SEND') {
    await sleep(1000);
    console.log('Retrying send click or pressing Enter...');
    const enterOsa = `
tell application "Brave Browser" to activate
tell application "System Events"
  key code 36
end tell`;
    runOsa(enterOsa);
  }

  console.log('6. Waiting for ChatGPT to complete generation...');
  const startTime = Date.now();
  let lastLen = 0;
  let stable = 0;

  while (Date.now() - startTime < 240000) {
    await sleep(4000);
    const probeOsa = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${TARGET_FRAGMENT}" then
        return execute t javascript "
          (function() {
            const stopBtn = document.querySelector('button[aria-label*=\"Stop\" i], button[data-testid*=\"stop\" i]');
            const main = document.querySelector('main');
            const text = main ? main.innerText : '';
            return JSON.stringify({ isGenerating: !!stopBtn, length: text.length, text });
          })()
        "
      end if
    end repeat
  end repeat
  return '{}'
end tell`;
    let probe = {};
    try {
      probe = JSON.parse(runOsa(probeOsa));
    } catch (e) { continue; }

    const { isGenerating, length, text } = probe;
    process.stdout.write(`\r   Streaming... Generating: ${isGenerating} | Length: ${length} | Stable: ${stable}/3`);

    if (!isGenerating && length > 500) {
      if (length === lastLen) {
        stable++;
        if (stable >= 3) {
          console.log('\n\n✅ ChatGPT response has completed and settled!');
          const marker = 'GATE 1 CLOSURE: MASTER SUITE RESOLUTION';
          const idx = text.lastIndexOf(marker);
          const responseText = (idx !== -1) ? text.slice(idx) : text.slice(-8000);

          const outPath = path.join(ROOT, 'plans/CHATGPT_M6_FINAL_CANARY_AUTHORIZATION.md');
          fs.writeFileSync(outPath, responseText, 'utf8');
          console.log(`Saved response to ${outPath}`);
          console.log('\n--- ChatGPT Latest Response ---');
          console.log(responseText.slice(0, 1500) + '...\n');
          return;
        }
      } else {
        lastLen = length;
        stable = 0;
      }
    } else {
      lastLen = length;
      stable = 0;
    }
  }

  console.log('\n⚠️ Reached polling timeout.');
}

main().catch(err => {
  console.error('Submission failed:', err);
  process.exit(1);
});
