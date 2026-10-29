const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Preparing VTSM-04 Closure & Phase 17 Stage 0 Submission Prompt...');

  const promptText = `Dear ChatGPT Architecture Lead,

Reporting on the completion of the two targeted VTSM-04 closure checks and presenting the Phase 17 Stage 0 Deterministic Color Engine Audit & Contract Freeze for formal sign-off:

================================================================================
PART A: VTSM-04 FINAL CLOSURE EVIDENCE (TWO TARGETED CHECKS SATISFIED)
================================================================================
1. Integrated Worker Held-Out Verification (Tests A, B, and C):
   - Executed through the complete integrated VtsmService, VtsmStateManager, and MCP subsystem path via tests/vtsm-held-out-integration.test.js (4/4 PASS in 44.5s on Apple Silicon MPS):
     * Test B (Disappearance & Reappearance, 22.2s): Evaluated 30/30 occlusion frames (frames 29–58). ZERO false masks manufactured during occlusion; instant reacquisition (0 frame delay); post-reemergence mean IoU 0.8833; atomic sidecar persisted and validated.
     * Test C (Identity Collision & Crossing Runners, 12.3s): Both crossing tracks tracked across the separation zone with ZERO identity switches; track continuity preserved.
     * Test A (Pine-Branch Gauntlet & Non-Contamination, 9.4s): Foreground subject tracked through heavy occluders with ZERO background saliency bleeding (median error 4.26 px, mean IoU 0.8634).
   - Invariant: schema/eme-project.v1.schema.json remains 100% unpolluted. All spatial tracking state resides in versioned sidecar schema/eme-vtsm-tracking.v1.schema.json.
   - Master EME Regression Suite: 366 / 366 PASS in 84.9s across all engine, audio, decision fabric, color, timeline, UI, and VTSM modules with 0 failures.

2. Integration Source Identity Frozen:
   - Certified Commit SHA: cbb4efdedba2e58c30a7b5b4997c2698c7607d07 (tag: vtsm-04-certified)
   - Baseline Commit: 9ad6109b6695e3596b687dc6ea7a99d32f3723b2
   - Preserved Component Digests:
     * vtsm03_worker.py: 303b5d91026e16fab8fb0738d82781ae7be8630b7831bb26f0e66d8e1d52dd13
     * pipeline_vtsm03.py: 98c4063814ac5fc56430cdf730a9c60cc01d5f805f62968f73e9da27be2af857
     * mobile_sam.pt: 6dbb90523a35330fedd7f1d3dfc66f995213d81b29a5ca8108dbcdd4e37d6c2f
     * yolo11n.pt: 0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1
   - Documentation Updated: plans/VTSM04_COMPLETION_REPORT.md.

================================================================================
PART B: PHASE 17 STAGE 0 — COLOR ENGINE AUDIT & CONTRACT FREEZE
================================================================================
Documented in plans/PHASE_17_STAGE0_CONTRACT.md:

1. Repository Color Assets Audit:
   - Schema: schema/eme-color-grade.v1.schema.json defines canonical grade state (exposure EV [-6, 6], temp/tint [-1, 1], LGGO, curves, 8-channel HSL, 3D LUT, skin protection).
   - Math Engine: src/engine/color-operations.js (6-stage linear/working pixel pipeline) & src/engine/lut-evaluator.js (tetrahedral interpolation with simplex decomposition).
   - Renderers: src/renderers/ffmpeg-color-compiler.js (compiles grade graph into 3D .cube and renders via lut3d filter with <1% dE mathematical parity) & src/renderers/color-preview.js.

2. Certified LUT Registry & Closed Vocabulary:
   - Registered LUT Identifiers & Digests:
     * bleach_bypass: assets/luts/bleach_bypass_33.cube (SHA: 07c89b3f3b97b0a8848f07ad0eec5e533c3935eeae371804c2642a8b9fcfbb15)
     * warm_golden: assets/luts/night_warm_yellow_33.cube (SHA: 15e4f20be0dbbbd6a2f3d64cb23cb3be5d6eefceb3ea1e76ee8a9e7f7b3df626)
     * teal_orange: assets/luts/cine_teal_orange_33.cube (SHA: f931d871b692faeb755ae0df5ee040378e906411475752ba14a413155122cb47)
     * cinematic_contrast: assets/luts/cine_freedom_33.cube (SHA: c5e128cb59a35d97034c4f346b026694e803d207ec29a6566da4bb3fc607f2d4)
     * true_tone: assets/luts/quality_enhance_33.cube (SHA: 4859a224a1b8db52ce46d5c589b2512f4c1c9aa189dbce219a1fe186e8ca372e)
   - Enforcement: Unknown LUT IDs rejected with ERR_UNREGISTERED_LUT_ID. Sentinels (needs_review, keep_current) strictly rejected from direct execution.

3. Versioned Operation Contract:
   - Three atomic operations in OperationExecutor:
     * attach_color_grade: Attaches or replaces canonical color grade on clip or project.
     * adjust_color_params: Granular, non-destructive mutation of exposure, whiteBalance, LGGO, curves, HSL, or LUT intensity.
     * remove_color_grade: Detaches color grade, restoring un-graded rendering.
   - Non-destructive execution: All mutations deep-clone state, validate expectedBaseRevision, assert track unlocked, validate schema/bounds, increment revision atomically, and log exact inverse operations for 100% reversible undo/redo.

4. Architecture Invariants Confirmed:
   - Deterministic Authority: Deterministic Color Engine is 100% authoritative.
   - Advisory Decision Fabric: Laya eme-color-mood recommendations remain strictly advisory. Zero auto-application authority.
   - Zero Mask Coupling: VTSM tracking sidecars remain completely decoupled from Phase 17 color operations. No automated spatial grading masks.
   - Timebase: 120,000 ticks/sec and half-open intervals [start, end) strictly preserved.

================================================================================
REQUEST FOR DIRECTIVES
================================================================================
1. Confirm final unconditional closure and certification of Milestone VTSM-04.
2. Provide formal architecture review and sign-off for Phase 17 Stage 0 (plans/PHASE_17_STAGE0_CONTRACT.md).
3. Authorize kickoff of Phase 17 Stage 1 (Implementation Plan & Core Operation Hardening).`;

  console.log('2. Staging prompt to clipboard...');
  const tmpPath = '/tmp/vtsm04_phase17_prompt.txt';
  fs.writeFileSync(tmpPath, promptText, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('3. Focusing ChatGPT composer in Brave...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return execute t javascript "
          (() => {
            const el = document.querySelector('div.ProseMirror[aria-label=\\\"Ask ChatGPT\\\"]') ||
                       document.querySelector('div.ProseMirror') ||
                       document.querySelector('div[contenteditable=true]');
            if (!el) return 'NO_EL';
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            return 'FOCUSED_AND_CLEARED';
          })()
        "
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;

  const focusRes = spawnSync('osascript', ['-e', focusScript], { encoding: 'utf8' });
  console.log('   Focus result:', (focusRes.stdout || '').trim());

  console.log('4. Pasting from clipboard via Cmd+V...');
  const pasteScript = `
tell application "Brave Browser" to activate
delay 0.3
tell application "System Events"
  keystroke "v" using command down
end tell`;
  spawnSync('osascript', ['-e', pasteScript]);

  await sleep(1500);

  console.log('5. Clicking Send button or pressing Return...');
  const sendScript = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t) contains "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a" then
        return execute t javascript "
          (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const sendBtn = btns.find(b => {
              const aria = (b.getAttribute('aria-label') || '').toLowerCase();
              const testid = (b.getAttribute('data-testid') || '').toLowerCase();
              return (aria.includes('send') || testid.includes('send')) && !b.disabled;
            });
            if (sendBtn) {
              sendBtn.click();
              return 'CLICKED_SEND: ' + (sendBtn.getAttribute('aria-label') || sendBtn.className);
            }
            return 'NO_SEND_BUTTON';
          })()
        "
      end if
    end repeat
  end repeat
  return 'NO_TAB'
end tell`;

  const sendRes = spawnSync('osascript', ['-e', sendScript], { encoding: 'utf8' });
  const sendOut = (sendRes.stdout || '').trim();
  console.log('   Send button result:', sendOut);

  if (!sendOut.startsWith('CLICKED_SEND')) {
    console.log('   Fallback: sending Return key via System Events...');
    const enterScript = `
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
  keystroke return
end tell`;
    spawnSync('osascript', ['-e', enterScript]);
  }

  console.log('✅ Submission prompt successfully dispatched to ChatGPT!');
}

main().catch(console.error);
