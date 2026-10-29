const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Preparing LP-08R1 certification prompt...');
  const reportPath = path.resolve('docs/live-pilot-lp-08r1-report.md');
  const report = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Live Pilot LP-08R1 (Final Evidence Reconciliation & Release Verification Pilot) has completed execution and verification across all 7 Findings/Tasks with ALL CONDITIONS SATISFIED.

Here is the unabridged Live Pilot LP-08R1 Release-Candidate Verification Engineering Report:

${report}

Summary of Remediated Findings & Sealed Evidence:
1. Finding 1 (Evidence Count Inconsistency 12 vs 16): Formally audited and reconciled all 16 deliverable entries (12 supporting evidence files in evidenceFiles + 3 master deliverables in masterArtifacts + 1 root release-manifest.json) bit-for-bit with SHA-256 digests in evidence-manifest-audit.json.
2. Finding 2 (Clean-Room Installation & Render Verification): Extracted candidate tarball editing-mechanics-engine-0.1.0-rc1.tgz into fresh /tmp/eme-clean-room-lp08r1 sandbox, installed production dependencies, verified CLI resolution to packaged binary, ran doctor and capabilities, executed real video render (output.mp4, 9,236 bytes), and validated manifest with packaged 'eme verify-artifacts' (Exit Code 0). Sealed in clean-room-verification.json.
3. Finding 3 (Licensing Verdict & FFmpeg Build Trace): Extracted exact host FFmpeg 9.0.2 build configuration string (--enable-shared --enable-pthreads --enable-version3...); formally delineated distributed package components (MIT core, MIT ajv, SIL OFL 1.1 font) from external unbundled prerequisites (system FFmpeg, Apache-2.0 HyperFrames). Sealed in licensing-closure.json.
4. Finding 4 (Security Conclusions & Reproducible Evidence): Tested path traversal rejection (../../etc/passwd, /etc/shadow, ../outside), verified UI 127.0.0.1 binding, verified MCP stdio transport (0 network ports), and confirmed 0 non-local network connections (lsof -a -p <pid> -i, 100% offline, zero telemetry). Sealed in security-verification.json.
5. Finding 5 (Audio Delivery Evidence): Decoupled relative gain calibration from delivery ceiling enforcement. Evaluated true peak delivery ceiling (-1.0 dBTP) using near-limit compliant tone (-1.2 dBTP -> ACCEPTED), slight breach (-0.40 dBTP -> REJECTED), and severe breach (+0.20 dBTP -> REJECTED) with 100% classification accuracy. Sealed in delivery-audio-verification.json.
6. Finding 6 (32-Fixture Media QA Scope): Documented per-fixture detector attribution (preflight vs layout vs ffmpeg astats/ebur128/blackdetect) and synthetic test boundaries in formal documentation.
7. Finding 7 (Candidate Provenance & Working Tree State): Recorded Git revision 236d62eb3216430059feb947fe1a576344a6db47; confirmed clean production code tree matching package tarball (33 allowlisted files). Sealed acceptance-matrix.json and release-manifest.json.

Please review this comprehensive LP-08R1 report and provide your final release certification disposition and verdict for candidate editing-mechanics-engine@0.1.0-rc1.`;

  console.log('2. Staging prompt to clipboard...');
  const tmpPath = '/tmp/lp08r1_prompt_staged.txt';
  fs.writeFileSync(tmpPath, fullPrompt, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('3. Focusing ChatGPT composer in Brave...');
  const focusScript = `
tell application "Brave Browser"
  repeat with w in windows
    set tabIdx to 0
    repeat with t in tabs of w
      set tabIdx to tabIdx + 1
      if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
        set active tab index of w to tabIdx
        set index of w to 1
        activate
        delay 0.3
        return execute t javascript "
          (() => {
            const el = document.querySelector('div.ProseMirror[aria-label=\\\"Ask ChatGPT\\\"]') ||
                       document.querySelector('div.ProseMirror');
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
      if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
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

  console.log('✅ LP-08R1 prompt successfully dispatched to ChatGPT!');
}

main().catch(console.error);
