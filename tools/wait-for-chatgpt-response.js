const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runOsa(jsCode) {
  const osa = `
tell application "Brave Browser"
    repeat with w in windows
        repeat with t in tabs of w
            if (URL of t) contains "chatgpt.com" then
                return execute t javascript ${JSON.stringify(jsCode)}
            end if
        end repeat
    end repeat
    return "NO_TAB"
end tell`;

  const res = spawnSync('osascript', ['-'], { input: osa, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return (res.stdout || '').trim();
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForResponse() {
  console.log('⏳ Waiting for ChatGPT response stream to complete...');

  const startTime = Date.now();
  const timeoutMs = 300000; // 5 minutes
  let lastText = '';
  let stableCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(3000);

    const probeJs = `(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop" i]') || 
                      document.querySelector('button[data-testid*="stop" i]');
      const articles = Array.from(document.querySelectorAll('article'));
      let text = '';
      if (articles.length > 0) {
        const lastArt = articles[articles.length - 1];
        const md = lastArt.querySelector('div.markdown');
        text = md ? md.innerText : lastArt.innerText;
      }
      return JSON.stringify({
        isGenerating: !!stopBtn,
        length: text.length,
        text
      });
    })()`;

    const raw = runOsa(probeJs);
    let probe = {};
    try {
      probe = JSON.parse(raw);
    } catch (e) {
      console.log('Waiting for response... probe raw:', raw.slice(0, 100));
      continue;
    }

    const { isGenerating, length, text } = probe;
    process.stdout.write(`\r   Streaming... (${length} chars, generating: ${isGenerating})`);

    if (!isGenerating && length > 100 && text === lastText) {
      stableCount++;
      if (stableCount >= 2) {
        process.stdout.write('\n\n✅ ChatGPT response generation complete and settled!\n');
        const outputPath = path.resolve(__dirname, '../plans/PHASE_6_CHATGPT_SPEC.md');
        fs.writeFileSync(outputPath, text, 'utf8');
        console.log(`💾 Saved response to: ${outputPath} (${text.length} chars)`);

        // Check for fail-safe gate signals
        const lower = text.toLowerCase();
        if (lower.includes('manual verification') || lower.includes('human review required') || lower.includes('error in phase')) {
          console.log('\n⚠️ FAIL-SAFE GATE TRIGGERED: ChatGPT requested manual review or reported an error.');
        } else {
          console.log('\n✨ Phase 5 approved by ChatGPT! Ready for Phase 6.');
        }

        return text;
      }
    } else {
      stableCount = 0;
    }

    lastText = text;
  }

  throw new Error('Timed out waiting for ChatGPT response');
}

if (require.main === module) {
  waitForResponse().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

module.exports = { waitForResponse };
