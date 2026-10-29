const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Preparing Stage 2A Integration Audit Submission Packet...');

  const auditContent = fs.readFileSync(path.join(__dirname, '../plans/PHASE_17_STAGE2A_INTEGRATION_AUDIT.md'), 'utf8');

  const promptText = `Dear ChatGPT Architecture Lead,

In accordance with your Stage 2 Kickoff Directive, we have completed the comprehensive repository integration audit and formal architectural specification. The complete document is committed in the repository at \`plans/PHASE_17_STAGE2A_INTEGRATION_AUDIT.md\`.

Here is the Stage 2A Audit Submission & Architectural Verification Packet:

---
### 1. Repository Inventory & Exact Integration Boundaries
- **Visual Control Surface UI** (\`src/ui/public/app.js\`):
  - *Current*: Lines 1927–1934 use a mock CSS filter (\`brightness() contrast()\`). Direct mutation of \`state.currentGrade\`.
  - *Remediation*: Introduce ephemeral \`state.colorDraft\` (with monotonic \`version\` and \`requestId\`). Replace mock CSS with \`<canvas id="color-preview-canvas">\` fed by \`POST /api/color/preview\`. Implement 60ms debounce and \`AbortController\` for request invalidation.
- **Visual Control Surface Markup** (\`src/ui/public/index.html\`):
  - *Remediation*: Constrain LUT selector strictly to the 5 certified LUTs (\`bleach_bypass\`, \`warm_golden\`, \`teal_orange\`, \`cinematic_contrast\`, \`true_tone\`). Add "Hold to Compare" button and Draft vs Persisted indicator badge.
- **Backend HTTP API** (\`src/ui/server.js\`):
  - *Decision*: Introduce \`POST /api/color/preview\` as a thin, stateless, non-mutating adapter over \`gradeImageBuffer()\`. Retain \`/api/preview/frame\` for generic inspection without modification.
  - Wire \`POST /api/color/apply\` through \`OperationExecutor\` using canonical operations (\`attach_color_grade\` / \`adjust_color_params\`) with \`expectedBaseRevision\`.
- **Authoritative Math & Registry**:
  - Authoritative 6-stage pixel pipeline in \`src/engine/color-operations.js\` and certified LUTs in \`src/engine/lut-registry.js\` reused without modification.
  - FFmpeg compilation in \`src/renderers/ffmpeg-color-compiler.js\` used for delivery rendering with frozen tetrahedral interpolation.

---
### 2. State Ownership & Invariant Boundaries
| State Item | Authoritative Owner | Mutation Path | Invariant Guarantee |
| :--- | :--- | :--- | :--- |
| **In-Progress Grade Draft** | Visual Control Surface (\`state.colorDraft\`) | Slider drag / LUT select | **Ephemeral**: Discarded on Cancel or clip switch. Zero project mutation. |
| **Persisted Project Grade** | \`ProjectManager\` / \`OperationExecutor\` | \`OperationExecutor.execute()\` | **Authoritative**: Mutated only on explicit Apply with \`expectedBaseRevision\`. |
| **Project Revision & Locks** | EME Engine (\`candidate.revision\`) | \`OperationExecutor\` | Monotonically increments on commit; enforces track locks. |
| **Preview Job Execution** | Backend Preview Service | Worker thread / CPU buffer | Stateless & read-only. Responses correlated by \`requestId\` & \`draftVersion\`. |
| **Undo / Redo Stack** | \`OperationExecutor\` / \`this.undoStack\` | Inverse operation execution | **Engine-owned**: UI has zero client-side undo stacks. |
| **Active Delivery Pointer** | \`RevisionSession\` / Session JSON | \`RevisionSessionManager\` | Updates ONLY upon 100% FFmpeg render & Media QA pass. |

---
### 3. Comparison Model: Hold-to-Compare
- **Default Interaction**: Hold-to-compare via \`#cg-btn-compare\` (\`mousedown\`/\`mouseup\`, \`touchstart\`/\`touchend\`, and keydown/keyup on \`C\` or \`Space\`).
- **Accessible Toggle**: Persistent toggle button provided for hands-free comparison.
- **Behavior**: Ungraded source frame is swapped onto the preview canvas immediately. Zero network requests, zero state mutations, identical timebase and scaling.

---
### 4. Concurrency & Race-Condition Safeguards
1. **Slider Dragging Backpressure**: 60ms client debounce + \`AbortController\` cancellation.
2. **Stale Response Protection**: Client checks \`if (data.draftVersion < state.colorDraft.version || data.clipId !== state.selectedClipId) return;\`.
3. **Revision Conflicts**: Commit verifies \`expectedBaseRevision\`; fails closed with \`STALE_REVISION\` if concurrent edits occur.
4. **Render Failure Isolation**: Any FFmpeg render or QA failure catches gracefully, keeps previous verified active delivery intact, and triggers project rollback.

---
### 5. Implementation Sequence (Stage 2B $\to$ 2F)
- **Stage 2B**: Backend \`POST /api/color/preview\` + UI ephemeral draft handling & stale-response rejection.
- **Stage 2C**: Schema-backed UI controls (5 certified LUTs, Exposure, WB, LGGO, curves, HSL, skin protect) + Hold-to-Compare.
- **Stage 2D**: Transactional Apply/Cancel via \`OperationExecutor\` + UI Undo/Redo wiring.
- **Stage 2E**: End-to-end delivery verification with FFmpeg render, Media QA pass, and frozen CIE76 $\Delta E_{ab}^* < 0.85$ parity check.
- **Stage 2F**: Master regression test suite (all 374+ tests passing) + final release report.

---
### Request for Architecture Review
Please review this Stage 2A Integration Audit. If satisfactory, please authorize immediate kickoff for Stage 2B (Color Preview Integration) and Stage 2C (Schema-Backed Grade Controls).`;

  console.log('2. Staging prompt to clipboard...');
  const tmpPath = '/tmp/stage2a_audit_prompt.txt';
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

  console.log('5. Clicking Send button...');
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
  return "NO_TAB"
end tell`;

  const sendRes = spawnSync('osascript', ['-e', sendScript], { encoding: 'utf8' });
  console.log('   Send result:', (sendRes.stdout || '').trim());

  console.log('Stage 2A Integration Audit submitted successfully to ChatGPT!');
}

main().catch(err => {
  console.error('Submission failed:', err);
  process.exit(1);
});
