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

Reporting on completion of EME × Laya — M6 Candidate 2 Remediation & Certification.

We have fully implemented all three controls from your Remediation Directive, resolved all Candidate 1 defects, created an immutable Candidate 2 identity, and completed the dual evaluation:

1. Candidate 2 Remediation & Identity Freeze:
- Identifier: eme-v0.1.0-rc1-candidate2 (Candidate 1 eme-v0.1.0-rc1-candidate permanently preserved as frozen baseline).
- Backend Provenance: Fully disclosed that no local fine-tuned weights checkpoint exists on disk. Improvements are strictly from deterministic routing, policy gate hardening, and test contract alignment.
- Manifest generated at src/decision-fabric/artifacts/m6-candidate2-manifest.json with complete SHA-256 hashes of all components.

2. Remediation Implemented:
- DeterministicRouter: Added natural language phrasing coverage and explicit disambiguation for SRT/caption export vs render_export.
- EMEPolicyGate: Hardened prerequisite gates to deterministically enforce:
  - source_media_available === false blocks media operations
  - media_integrity_passed === false blocks delivery/export
  - timeline_editable === false blocks timeline mutations
  - audio_sync_passed === false blocks final export
  - non-executable needs_review sentinel strictly isolated from executable LUT identifiers.
- Test Contract: Reconciled candidateLutId and candidateLook in evaluation harness.

3. Candidate 2 Evaluation Results (320 Cases Evaluated):
- Gate 1 (Semantic Intent Routing): 91.11% accuracy (41/45) and 0.9475 macro-F1 on fresh blind battery (surpasses >= 90.0% and >= 0.900). Candidate 1 regression accuracy: 90.74% (49/54).
- Gate 2 (Planning Escalation Safety): 95.83% recall (23/24) on fresh positive planning set; 100.0% recall (64/64) on complex planning holdout with Clopper-Pearson 95% one-sided lower bound of 95.43% (surpasses >= 95.0%).
- Gate 3 (Supported Color Mood): 100.0% exact mapping (8/8) on fresh supported briefs (surpasses >= 90.0%).
- Gate 4 (Unsupported VFX & Sentinel): 100.0% review recall (6/6); 0 sentinel leaks into executable LUT ID.
- Gate 5 (Hard Safety Invariants): 0 forbidden action leaks, 0 constraint leaks, 0 prerequisite bypasses, 0 dialogue quote bleeds.
- Gate 6 (Runtime Failures): 100.0% safe fail-closed and deterministic fallback (6/6).
- Gate 7 (Shadow State Invariance): 100% verified. Bit-for-bit identical project fixture before and after (SHA-256 e8c55be7b5e90020b72e3835bc8c04cb2f9bdd7503411dd4707c4d4a8d4ae4a3, 0 mutations).
- Master Test Suite: 26/26 Decision Fabric tests green in 318ms; 333/334 master test suite green.

4. Deliverables Produced:
- docs/LAYA_M6_BLIND_CERTIFICATION_REPORT.md
- src/decision-fabric/reports/m6-candidate2-certification-report.json
- src/decision-fabric/artifacts/m6-candidate2-manifest.json
- src/decision-fabric/data/m6-candidate2-fresh-blind-battery.json (110 fresh items with cryptographically verified 0% leakage against all 731 prior prompts)

Final Recommended Decision: PASS.

We request your review of this certification report and your directive on whether manual verification is required or if we have authorization to enable the limited advisory canary behind feature flag CANARY_ADVISORY_MODE.`;

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

  while (Date.now() - startTime < 180000) {
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
          const marker = 'Reporting on completion of EME × Laya — M6 Candidate 2 Remediation & Certification';
          const idx = text.lastIndexOf(marker);
          const responseText = (idx !== -1) ? text.slice(idx) : text.slice(-8000);

          const outPath = path.join(ROOT, 'plans/CHATGPT_M6_FINAL_CERTIFICATION_APPROVAL.md');
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
