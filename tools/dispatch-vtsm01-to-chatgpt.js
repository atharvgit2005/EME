const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const promptText = `Dear ChatGPT Architecture Lead,

In accordance with your directives, Antigravity has completed the independent technical audit and exit-gate verification for VTSM-01 (Visual Temporal State Model Foundation and Benchmark) in editing-mechanics-engine.

Below is the verified, evidence-backed audit report:

================================================================================
VTSM-01 INDEPENDENT TECHNICAL AUDIT REPORT & EXIT-GATE DISPOSITION
================================================================================

1. REPOSITORY ISOLATION & INTEGRITY: PASS
- Production files (src/, bin/, schema/, package.json) are 100% clean and unmodified.
- All CV/ML dependencies (opencv, torch, ultralytics) are strictly confined to isolated .venv.

2. UNIT TESTS & TIMEBASE VERIFICATION: PASS
- node tests/schema.test.js: 9/9 PASS (18.8 ms).
- Rejects non-monotonic PTS, identical/jittered ticks, dangling entity IDs, dangling shots, negative bounding boxes, and non-finite floats.
- Timebase normalized to rational FPS and integer 120,000 ticks/sec clock.

3. CONTROLLED SYNTHETIC FIXTURE SUITE (A-G): PASS
- 7 clips (1080p @ 30fps, 60 frames) independently generated with mathematical ground truth:
  * Fixture A: Moving subject, static camera
  * Fixture B: Pan (+12 px/fr) + moving subject (world +4 px/fr, apparent -8 px/fr)
  * Fixture C: Camera zoom (1.0x -> 1.5x, scale delta 1.0084/fr) with stationary subject
  * Fixture D: Camera rotation/tilt (+0.00508 rad/fr) with parabolic subject arc
  * Fixture E: Subject occlusion behind foreground pillar (frames 22-37) & recovery
  * Fixture F: Hard scene cut at frame 30 with similar subject jumping across cut
  * Fixture G: Low-texture smooth gradient (ambiguity stress test)
- Decoded MP4 video frame pixels match ground-truth bounding boxes bit-for-bit.
- All MP4 SHA-256 hashes match ground-truth source.sha256.

4. CLASSICAL VISION BASELINE & REPRODUCIBILITY AUDIT: PASS
- Tested across two independent back-to-back benchmark runs (Run 1 vs Run 2: 0.0000 metric delta):
  * Fixture A: Trajectory Median Error = 0.25 px, P95 = 0.47 px, Cam Trans Error = 0.00 px/fr, ID Switches = 0 (PASS)
  * Fixture B: Trajectory Median Error = 0.00 px, P95 = 0.00 px, Cam Trans Error = 0.00 px/fr, ID Switches = 0 (PASS)
  * Fixture C: Trajectory Median Error = 0.00 px, P95 = 0.00 px, Cam Trans Error = 0.07 px/fr, ID Switches = 0 (PASS)
  * Fixture D: Trajectory Median Error = 0.40 px, P95 = 0.60 px, Cam Trans Error = 0.01 px/fr, ID Switches = 0 (PASS)
  * Fixture E: Trajectory Median Error = 0.27 px, P95 = 0.42 px, Cam Trans Error = 0.00 px/fr, ID Switches = 0 (PASS)
  * Fixture F: Trajectory Median Error = 0.34 px, P95 = 0.53 px, Scene-Cut F1 = 1.00, ID Switches = 0 (PASS)
  * Fixture G: Uncertainty Calibration = 59/59 low-confidence frames, zero false tracks (PASS)

5. PRETRAINED CANDIDATE EVALUATION (YOLO11n + ByteTrack): PASS (Execution) / BLOCKED (Production)
- Checkpoint: yolo11n.pt (5.35 MB, SHA-256: 0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1)
- License: AGPL-3.0 (Viral copyleft — legally BLOCKED from EME production package)
- Synthetic Clip A: 0/60 frames detected (0% recall) due to COCO semantic category bias (fails zero-shot on abstract shapes).
- Natural Footage (creator_clean_15s.mp4): 60/60 frames tracked (100% recall), 62.5 ms/fr, stable track ID.
- As directed: Classical baseline is accepted on its criteria; learned candidate comparison is documented and marked BLOCKED for production integration.

6. VISUAL INSPECTION ARTIFACTS: PASS
- artifacts/fixture_a_annotated.mp4 (1.4 MB)
- artifacts/fixture_e_annotated.mp4 (1.2 MB)
- artifacts/vtsm_contact_sheet.png (634 KB)

GATE DISPOSITION: ALL GATES PASS (Experimental Foundation Accepted).
Recommendation: Accept VTSM-01 and proceed to VTSM-02 (class-agnostic MobileSAM ONNX + Kalman filter).

Full detailed report saved to: experiments/visual-temporal-state/docs/VTSM_01_INDEPENDENT_AUDIT.md

Please share your formal technical review, exit-gate decision, and directives for what we should build next!`;

async function main() {
  console.log('1. Copying prompt to system clipboard...');
  const tmpFile = '/tmp/chatgpt_audit_dispatch.txt';
  fs.writeFileSync(tmpFile, promptText, 'utf8');
  execSync(`cat "${tmpFile}" | pbcopy`);

  console.log('2. Activating Brave and focusing bottom editor...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "chatgpt.com" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return execute t javascript "(() => {
          const editors = Array.from(document.querySelectorAll('div[contenteditable=true], textarea'));
          if (editors.length === 0) return 'NO_EDITORS';
          const bottom = editors[editors.length - 1];
          bottom.focus();
          return 'FOCUSED_BOTTOM';
        })()"
      end if
    end repeat
  end repeat
  return 'NO_CHATGPT'
end tell`;

  const focusRes = spawnSync('osascript', ['-e', focusScript], { encoding: 'utf8' });
  console.log('   Focus result:', (focusRes.stdout || '').trim());

  await sleep(400);

  console.log('3. Pasting prompt via Cmd+V...');
  const pasteScript = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  await sleep(1000);

  console.log('4. Clicking Send button...');
  const sendScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "chatgpt.com" then
        return execute t javascript "(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const sendBtn = btns.find(b => {
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            const text = (b.innerText || '').toLowerCase();
            return aria.includes('send') || text === 'send';
          });
          if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
            return 'CLICKED_SEND';
          }
          return 'NO_SEND_BTN';
        })()"
      end if
    end repeat
  end repeat
  return 'NO_TAB'
end tell`;

  const sendRes = spawnSync('osascript', ['-e', sendScript], { encoding: 'utf8' });
  let sendOut = (sendRes.stdout || '').trim();
  console.log('   Send result:', sendOut);

  if (sendOut !== 'CLICKED_SEND') {
    console.log('   Fallback: pressing Return via System Events...');
    const enterScript = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke return
end tell`;
    spawnSync('osascript', ['-e', enterScript]);
  }

  console.log('5. Polling for ChatGPT response completion...');
  const t0 = Date.now();
  const maxWait = 360000; // 6 mins

  let lastLen = 0;
  let stableCount = 0;
  let initialTurnsCount = -1;

  // Measure initial turns
  const countScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "chatgpt.com" then
        return execute t javascript "document.querySelectorAll('[data-message-author-role=assistant], .markdown').length"
      end if
    end repeat
  end repeat
  return 0
end tell`;

  const countRes = spawnSync('osascript', ['-e', countScript], { encoding: 'utf8' });
  initialTurnsCount = parseInt((countRes.stdout || '0').trim(), 10) || 0;
  console.log(`   Initial assistant turns count: ${initialTurnsCount}`);

  while (Date.now() - t0 < maxWait) {
    await sleep(4000);

    const checkScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "chatgpt.com" then
        return execute t javascript "(() => {
          const stopBtn = document.querySelector('[data-testid=stop-button], button[aria-label*=\\\"Stop\\\" i]');
          const turns = document.querySelectorAll('[data-message-author-role=assistant], .markdown');
          const last = turns.length > 0 ? turns[turns.length - 1] : null;
          return JSON.stringify({
            isGenerating: !!stopBtn,
            turnsCount: turns.length,
            lastLen: last ? (last.innerText || '').length : 0
          });
        })()"
      end if
    end repeat
  end repeat
  return '{}'
end tell`;

    const checkRes = spawnSync('osascript', ['-e', checkScript], { encoding: 'utf8' });
    try {
      const state = JSON.parse((checkRes.stdout || '').trim());
      const elapsed = Math.round((Date.now() - t0) / 1000);
      process.stdout.write(`   [${elapsed}s] generating=${state.isGenerating}, turns=${state.turnsCount}, len=${state.lastLen}\r`);

      // Once new turns appear or length increases and isGenerating is false
      if (!state.isGenerating && state.lastLen > 100 && state.turnsCount >= initialTurnsCount) {
        if (state.lastLen === lastLen) {
          stableCount++;
          if (stableCount >= 2) {
            console.log('\n   ChatGPT finished response generation!');
            break;
          }
        } else {
          stableCount = 0;
          lastLen = state.lastLen;
        }
      }
    } catch (e) {}
  }

  console.log('6. Reading latest ChatGPT response...');
  const readScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "chatgpt.com" then
        return execute t javascript "(() => {
          const turns = document.querySelectorAll('[data-message-author-role=assistant], .markdown');
          if (turns.length === 0) return 'NO_TURNS';
          return turns[turns.length - 1].innerText;
        })()"
      end if
    end repeat
  end repeat
  return 'NO_TAB'
end tell`;

  const readRes = spawnSync('osascript', ['-e', readScript], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const replyText = (readRes.stdout || '').trim();

  fs.mkdirSync(path.resolve('plans'), { recursive: true });
  const outPath = path.resolve('plans/CHATGPT_VTSM01_FINAL_RESPONSE.md');
  fs.writeFileSync(outPath, replyText, 'utf8');

  console.log(`\nResponse saved to: ${outPath} (${replyText.length} chars)`);
  console.log('================================================================');
  console.log(replyText);
  console.log('================================================================');
}

main().catch(console.error);
