/**
 * Ezra Bridge Script: Submit Phase 18 Kickoff Inquiry to ChatGPT Architecture Lead
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
  console.log('1. Preparing Phase 18 Kickoff Inquiry prompt...');

  const promptText = `Dear ChatGPT Architecture Lead,

We have completed and certified **EME Phase 17 Stage 2** (release commit \`08ef281\`, tag \`phase-17-stage2-certified\`, master battery 401/401 green, all 5 CIE76 & DN MAE parity metrics verified).

In accordance with your exit directive, we are now ready to begin **Phase 18: Non-Destructive Interactive Timeline Engine & Visual Control Surface Integration (TL-01)**.

---

### Existing Codebase Capabilities & Reconnaissance Summary
1. **Canonical Timebase & Timing Model**:
   - Strictly 120,000 integer ticks per second (\`MediaTime\`, \`TICKS_PER_SECOND\`).
   - Half-open intervals \`[startTick, startTick + durationTicks)\`.
   - Distinct source vs timeline ranges (\`source.trimInTick\`, \`source.trimOutTick\` vs \`clip.startTick\`, \`clip.durationTicks\`).
2. **Deterministic Operations in \`OperationExecutor\`**:
   - Basic: \`insert_clip\`, \`trim_clip\`, \`move_clip\`, \`split_clip\`, \`delete_clip\`, \`reorder_tracks\`.
   - Compound Editorial: \`ripple_delete\`, \`ripple_trim\`, \`slip_clip\`, \`slide_clip\`.
   - Track State: \`set_track_state\` (muting, locking, visibility).
   - Reversibility: Every operation generates an exact transactional inverse for undo/redo with monotonic revision tracking.
3. **Display State & Interop Adapter (\`TimelineAdapter\`)**:
   - Dynamic projection of canonical project state to timeline display objects (\`leftPx\`, \`widthPx\`, timecode formatting).
   - Sub-millisecond magnetic snapping against clip boundaries and playhead (tested $< 0.3$ ms P95).
   - Bidirectional CapCut draft microsecond-to-tick rational conversion adapter.
4. **Visual Control Surface UI & Canvas**:
   - UI backend running on port 4321 / 4422 with timeline view endpoints.
   - 1,000-clip stress performance verified (P95 latency $< 16.67$ ms target; measured $0.26$ ms view projection, $0.19$ ms magnetic snap).

---

### Invariants Maintained
- **Project Schema Purity**: \`schema/eme-project.v1.schema.json\` remains strictly unmodified.
- **VTSM Isolation**: Spatial tracking masks remain decoupled in sidecar storage.
- **Decision Fabric Canary**: Laya remains purely advisory under \`CANARY_ADVISORY_MODE\`.
- **Concurrency & Failure Isolation**: Revision locking and active-delivery preservation on render failure enforced.

---

### Request for Architecture Directives & Phase 18 Staging
Please issue your formal **Phase 18 Architecture Kickoff Directive**:
1. Specific stage breakdown and sequencing (e.g. 18.0 Audit & Baseline, 18.1 Timeline Visual Surface & Scrubbing, 18.2 Atomic & Compound Operations, 18.3 Concurrency & Lock Enforcement, 18.4 Delivery & Interop Acceptance).
2. Key constraints, verification gates, and acceptance targets for Phase 18.
3. Guidance on user-facing timeline controls vs transient view state.`;

  console.log('2. Focusing active ChatGPT tab in Brave Browser...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "${CHAT_URL_FRAGMENT}" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return "ACTIVATED"
      end if
    end repeat
  end repeat
  return "NO_TAB"
end tell`;
  const fRes = spawnSync('osascript', ['-'], { input: focusScript, encoding: 'utf8' });
  console.log('   Focus:', (fRes.stdout || '').trim());

  console.log('3. Injecting inquiry into div.ProseMirror[aria-label="Ask ChatGPT"]...');
  const injectRes = runOsa(`(() => {
    const el = document.querySelector('div.ProseMirror[aria-label="Ask ChatGPT"]');
    if (!el) return JSON.stringify({ error: 'NO_COMPOSER' });
    el.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(el);
    document.execCommand('delete', false, null);
    
    const prompt = ${JSON.stringify(promptText)};
    document.execCommand('insertText', false, prompt);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return JSON.stringify({ success: true, length: el.innerText.length });
  })()`);
  console.log('   Injection:', injectRes);

  await sleep(1000);

  console.log('4. Clicking Send button...');
  const sendRes = runOsa(`(() => {
    const el = document.querySelector('div.ProseMirror[aria-label="Ask ChatGPT"]');
    if (!el) return 'NO_COMPOSER';
    let p = el;
    while (p && !p.querySelector('button')) p = p.parentElement;
    if (!p) return 'NO_CONTAINER';
    const btns = Array.from(p.querySelectorAll('button'));
    const sendBtn = btns.find(b => {
      const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
      return (aria === 'send' || aria.includes('send')) && !b.disabled;
    });
    if (sendBtn) {
      sendBtn.click();
      return 'CLICKED_SEND';
    }
    return 'NO_SEND_BTN';
  })()`);
  console.log('   Send:', sendRes);

  console.log('5. Awaiting ChatGPT Phase 18 Kickoff Directive in thread-scroll-container...');
  let completed = false;
  let finalMarkdown = '';

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[data-testid="stop-button"], button[aria-label*="Stop"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';
      const marker = "Request for Architecture Directives & Phase 18 Staging";
      const idx = text.lastIndexOf(marker);
      if (idx === -1) return JSON.stringify({ isGenerating, len: 0, text: '' });

      const afterMarker = text.slice(idx + marker.length + 100).trim();
      return JSON.stringify({
        isGenerating,
        len: afterMarker.length,
        snippet: afterMarker.slice(0, 150),
        text: afterMarker
      });
    })()`);

    try {
      const data = JSON.parse(checkRes);
      if (!data.isGenerating && data.len > 250) {
        console.log(`\n✅ Phase 18 Kickoff Directive received! (${data.len} characters)`);
        finalMarkdown = data.text;
        completed = true;
        break;
      } else {
        process.stdout.write(`... awaiting directive (chars: ${data.len}, generating: ${data.isGenerating})\n`);
      }
    } catch (e) {
      console.log('Waiting for response parsing...');
    }
  }

  if (!completed) {
    console.error('Timed out waiting for ChatGPT response.');
    process.exit(1);
  }

  const outputPath = path.join(__dirname, '../plans/CHATGPT_PHASE18_KICKOFF_DIRECTIVE.md');
  const fileContent = `# ChatGPT Architecture Lead: Phase 18 Architecture Kickoff Directive

**Date**: ${new Date().toISOString()}  
**Conversation**: \`https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a\`  
**Milestone**: EME Phase 18: Non-Destructive Interactive Timeline Engine & Visual Control Surface Integration (TL-01)  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Phase 18 Kickoff Directive to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
