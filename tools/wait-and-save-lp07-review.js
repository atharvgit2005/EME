const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runOsa(jsCode) {
  const jsLiteral = JSON.stringify(jsCode);
  const osaScript = `
tell application "Brave Browser"
    repeat with w in windows
        repeat with t in tabs of w
            if (URL of t) contains "6ace7915-8720-83e8-9d86-ca8f22ba9a80" then
                return execute t javascript ${jsLiteral}
            end if
        end repeat
    end repeat
    return "NO_TAB"
end tell`;

  const res = spawnSync('osascript', ['-'], { input: osaScript, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  return (res.stdout || '').trim();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function probeTab() {
  const probeJs = `(() => {
    const stopBtn = document.querySelector('button[aria-label*="Stop" i], button[data-testid*="stop" i]');
    const isGenerating = !!stopBtn;

    const fullBody = document.body.innerText;
    
    // Find the latest response after the LP-07 prompt
    const marker = "Live Pilot LP-07 (Media QA Capability Closure & Audio Integrity) has completed";
    const promptIdx = fullBody.lastIndexOf(marker);
    let responseText = '';

    if (promptIdx !== -1) {
      const sliceAfter = fullBody.slice(promptIdx);
      const cIdx = sliceAfter.indexOf('ChatGPT said:');
      if (cIdx !== -1) {
        responseText = sliceAfter.slice(cIdx + 'ChatGPT said:'.length).trim();
      } else {
        // Look for alternate header or take the rest
        const lines = sliceAfter.split('\\n');
        const rLines = [];
        let inResponse = false;
        for (const line of lines) {
          if (line.includes('ChatGPT said:') || line.includes('### Formal Sign-Off') || line.includes('Formal Review') || line.includes('Gate 1') || line.includes('LP-07')) {
            // Check if this is not part of the initial prompt
            if (!line.includes('has completed execution and verification with 100% PASS')) {
              inResponse = true;
            }
          }
          if (inResponse) {
            rLines.push(line);
          }
        }
        if (rLines.length > 0) {
          responseText = rLines.join('\\n').trim();
        }
      }
    }

    if (!responseText) {
      // Fallback: search for last occurrence of Gate 1 or Formal Review
      const gIdx = fullBody.lastIndexOf('Gate 1');
      if (gIdx !== -1) {
        responseText = fullBody.slice(gIdx - 200).trim();
      }
    }

    // Clean footers
    const footers = [
      'ChatGPT can make mistakes',
      'Scroll to bottom',
      'Bridge Active (chatgpt)',
      'Turn Off',
      'Latest response'
    ];
    for (const f of footers) {
      const fIdx = responseText.lastIndexOf(f);
      if (fIdx !== -1 && fIdx > responseText.length - 800) {
        responseText = responseText.slice(0, fIdx).trim();
      }
    }

    return JSON.stringify({
      isGenerating,
      textLength: responseText.length,
      snippet: responseText.slice(0, 150),
      endSnippet: responseText.slice(-200),
      fullText: responseText
    });
  })()`;

  try {
    const raw = runOsa(probeJs);
    return JSON.parse(raw);
  } catch (e) {
    return { isGenerating: false, textLength: 0, snippet: '', endSnippet: '', fullText: '', error: e.message };
  }
}

async function main() {
  console.log('⏳ Monitoring ChatGPT response stream for LP-07 Review & LP-08 Parameters...');
  const startTime = Date.now();
  const timeoutMs = 600000; // 10 minutes
  let lastLen = 0;
  let stableCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(4000);
    const probe = probeTab();

    process.stdout.write(`\r   Generating: ${probe.isGenerating} | Length: ${probe.textLength} chars | End: ${probe.endSnippet.slice(-60).replace(/\n/g, ' ')}`);

    if (!probe.isGenerating && probe.textLength > 500) {
      if (probe.textLength === lastLen) {
        stableCount++;
        if (stableCount >= 2) {
          console.log('\n\n✅ Generation complete and stable!');
          const outDir = path.resolve('artifacts/live-pilot/LP-07');
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          const outPath = path.join(outDir, 'chatgpt-lp07-review.md');
          fs.writeFileSync(outPath, probe.fullText, 'utf8');
          console.log(`💾 Saved full ChatGPT LP-07 review & LP-08 parameters to: ${outPath} (${probe.textLength} chars)`);
          return;
        }
      } else {
        stableCount = 0;
      }
    } else {
      stableCount = 0;
    }
    lastLen = probe.textLength;
  }

  throw new Error('Timed out waiting for ChatGPT response');
}

main().catch(err => {
  console.error('\nError:', err);
  process.exit(1);
});
