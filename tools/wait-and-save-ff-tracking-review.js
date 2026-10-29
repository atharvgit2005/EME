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
    
    // Find latest response after ff-tracking prompt
    const marker = "Technical Reconnaissance & Feasibility Review: mrsarac/ff-tracking Integration into EME";
    const promptIdx = fullBody.lastIndexOf(marker);
    let responseText = '';

    if (promptIdx !== -1) {
      const sliceAfter = fullBody.slice(promptIdx);
      const cIdx = sliceAfter.indexOf('ChatGPT said:');
      if (cIdx !== -1) {
        responseText = sliceAfter.slice(cIdx + 'ChatGPT said:'.length).trim();
      } else {
        const lines = sliceAfter.split('\\n');
        const rLines = [];
        let inResponse = false;
        for (const line of lines) {
          if (line.includes('ChatGPT said:') || line.includes('ff-tracking') || line.includes('Architecture') || line.includes('SkSL') || line.includes('HUD') || line.includes('Virtual Camera') || line.includes('Feasibility')) {
            if (!line.includes('Technical Reconnaissance & Feasibility Review')) {
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
      const gIdx = fullBody.lastIndexOf('ff-tracking');
      if (gIdx !== -1) {
        responseText = fullBody.slice(gIdx - 50).trim();
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
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  console.log('Monitoring ChatGPT tab in Brave for ff-tracking Review response...\n');
  const outFile = path.resolve('docs/ff-tracking-chatgpt-review.md');

  let stableCount = 0;
  let lastLen = 0;
  let maxWaitSec = 600; // up to 10 minutes
  const start = Date.now();

  while ((Date.now() - start) / 1000 < maxWaitSec) {
    const p = probeTab();
    if (p.error) {
      console.log('Probe error:', p.error);
    } else {
      process.stdout.write(`\rGenerating: ${p.isGenerating ? 'YES' : 'NO '} | Response chars: ${p.textLength} | Stable count: ${stableCount} `);

      if (!p.isGenerating && p.textLength > 300) {
        if (p.textLength === lastLen) {
          stableCount++;
          if (stableCount >= 6) { // stable for ~15 seconds
            console.log('\n\n✅ Generation complete and stable! Saving ff-tracking review artifact...');
            fs.writeFileSync(outFile, p.fullText, 'utf8');
            console.log(`Saved ${p.fullText.length} characters to: ${outFile}`);
            console.log('\nSnippet:');
            console.log(p.snippet);
            console.log('...\n' + p.endSnippet);
            return;
          }
        } else {
          stableCount = 0;
          lastLen = p.textLength;
        }
      } else {
        stableCount = 0;
        lastLen = p.textLength;
      }
    }
    await sleep(2500);
  }

  console.log('\nTimed out waiting for completion.');
}

main().catch(console.error);
