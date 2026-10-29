const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function probeTab() {
  const tmpJs = '/tmp/probe_chatgpt_gen.js';
  const js = `(() => {
    const stopBtn = document.querySelector('button[aria-label*="Stop" i], button[data-testid*="stop" i]');
    const isGenerating = !!stopBtn;

    const text = document.body.innerText;
    const marker = "Please review this LP-06 engineering report and provide your formal review and next steps.";
    const idx = text.lastIndexOf(marker);
    let afterPrompt = '';
    let responseText = '';

    if (idx !== -1) {
      afterPrompt = text.slice(idx);
      const cIdx = afterPrompt.indexOf('ChatGPT said:');
      if (cIdx !== -1) {
        responseText = afterPrompt.slice(cIdx + 'ChatGPT said:'.length).trim();
      }
    } else {
      // Fallback: search for LP-06 review markers
      const lpIdx = text.lastIndexOf('LP-06');
      if (lpIdx !== -1) {
        afterPrompt = text.slice(lpIdx);
        const cIdx = afterPrompt.indexOf('ChatGPT said:');
        if (cIdx !== -1) {
          responseText = afterPrompt.slice(cIdx + 'ChatGPT said:'.length).trim();
        }
      }
    }

    // Clean footer clutter
    const footers = [
      'Scroll to bottom',
      'Add files and more',
      'ChatGPT can make mistakes'
    ];
    for (const f of footers) {
      const fIdx = responseText.lastIndexOf(f);
      if (fIdx !== -1 && fIdx > responseText.length - 600) {
        responseText = responseText.slice(0, fIdx).trim();
      }
    }

    return JSON.stringify({
      isGenerating,
      responseLen: responseText.length,
      snippet: responseText.slice(0, 300),
      fullText: responseText
    });
  })()`;
  fs.writeFileSync(tmpJs, js, 'utf8');

  const osa = `
tell application "Brave Browser"
  tell tab 6 of window 1
    set c to read "${tmpJs}"
    return execute javascript c
  end tell
end tell`;

  const res = spawnSync('osascript', ['-e', osa], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  try {
    return JSON.parse(res.stdout || '{}');
  } catch (e) {
    return { isGenerating: false, responseLen: 0, snippet: '', fullText: '', error: res.stdout };
  }
}

async function main() {
  console.log('⏳ Monitoring ChatGPT LP-06 response stream...');
  const startTime = Date.now();
  const timeoutMs = 300000; // 5 min
  let lastLen = 0;
  let stableCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(3000);
    const probe = probeTab();

    process.stdout.write(`\r   Generating: ${probe.isGenerating} | Length: ${probe.responseLen} chars | Snippet: ${probe.snippet.slice(0, 60).replace(/\n/g, ' ')}...`);

    if (!probe.isGenerating && probe.responseLen > 100) {
      if (probe.responseLen === lastLen) {
        stableCount++;
        if (stableCount >= 2) {
          console.log('\n\n✅ Generation complete and stable!');
          const outPath = path.resolve('artifacts/live-pilot/LP-06/chatgpt-lp06-review.md');
          fs.writeFileSync(outPath, probe.fullText, 'utf8');
          console.log(`💾 Saved full ChatGPT review to: ${outPath} (${probe.responseLen} chars)`);
          return;
        }
      } else {
        stableCount = 0;
      }
    } else {
      stableCount = 0;
    }
    lastLen = probe.responseLen;
  }

  throw new Error('Timed out waiting for ChatGPT response');
}

main().catch(err => {
  console.error('\nError monitoring response:', err);
  process.exit(1);
});
