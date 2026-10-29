const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function checkGenerationStatus() {
  const jsCode = `(() => {
    const stopBtn = document.querySelector('button[data-testid="stop-button"], button[aria-label*="Stop"]');
    const isGenerating = !!stopBtn;
    const main = document.querySelector('main');
    const text = main ? main.innerText : '';
    const lastUserIdx = text.lastIndexOf('Please specify your exact guidance, priorities, and next steps for Stage 2 kickoff');
    const snippet = lastUserIdx !== -1 ? text.slice(lastUserIdx) : text.slice(-2000);
    return JSON.stringify({ isGenerating, lastUserIdx: lastUserIdx !== -1, textLength: snippet.length, snippet: snippet.slice(-500) });
  })()`;

  const osa = `
tell application "Brave Browser"
    repeat with w in windows
        repeat with t in tabs of w
            if (URL of t) contains "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a" then
                return execute t javascript ${JSON.stringify(jsCode)}
            end if
        end repeat
    end repeat
    return "NO_TAB"
end tell`;

  const res = spawnSync('osascript', ['-e', osa], { encoding: 'utf8' });
  const raw = (res.stdout || '').trim();
  if (raw === 'NO_TAB') return { error: 'NO_TAB' };
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { raw };
  }
}

async function extractFullResponse() {
  const jsCode = `(() => {
    const main = document.querySelector('main');
    if (!main) return 'NO_MAIN';
    const text = main.innerText;
    const lastUserIdx = text.lastIndexOf('Please specify your exact guidance, priorities, and next steps for Stage 2 kickoff');
    if (lastUserIdx !== -1) {
      return text.slice(lastUserIdx);
    }
    return text.slice(-12000);
  })()`;

  const osa = `
tell application "Brave Browser"
    repeat with w in windows
        repeat with t in tabs of w
            if (URL of t) contains "6ad4ae37-23ec-83ee-b1df-5274a2f04e1a" then
                return execute t javascript ${JSON.stringify(jsCode)}
            end if
        end repeat
    end repeat
    return "NO_TAB"
end tell`;

  const res = spawnSync('osascript', ['-e', osa], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return (res.stdout || '').trim();
}

async function main() {
  console.log('Polling ChatGPT generation status for Stage 2 next steps response...');
  let wasGenerating = false;
  let attempts = 0;

  while (attempts < 60) {
    attempts++;
    const status = await checkGenerationStatus();
    console.log(`[Attempt ${attempts}] Generating: ${status.isGenerating}, Text Length: ${status.textLength}`);

    if (status.isGenerating) {
      wasGenerating = true;
    } else if (wasGenerating || attempts > 5) {
      const fullText = await extractFullResponse();
      const promptMarker = 'Any particular risk areas or constraints you want us to keep front of mind as we begin.';
      const promptIdx = fullText.lastIndexOf(promptMarker);
      if (promptIdx !== -1 && fullText.length > promptIdx + 300) {
        console.log('✅ Generation complete! Response received.');
        const responseOnly = fullText.slice(promptIdx);
        const savePath = path.join(ROOT, 'plans/CHATGPT_STAGE2_NEXT_STEPS.md');
        fs.writeFileSync(savePath, fullText, 'utf8');
        console.log(`Saved response to ${savePath}`);
        console.log('\n--- RESPONSE SNIPPET ---');
        console.log(responseOnly.slice(0, 1500));
        return;
      }
    }
    await sleep(3000);
  }
  console.log('Timeout waiting for response.');
}

main().catch(console.error);
