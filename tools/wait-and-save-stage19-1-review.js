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
  console.log('Awaiting ChatGPT Stage 19.1 Review and Stage 19.2 Directive...');
  let completed = false;
  let finalMarkdown = '';

  const promptAnchor = "Stage 19.1: End-to-End Orchestration Integration & Lifecycle Hardening";

  for (let attempt = 0; attempt < 90; attempt++) {
    await sleep(4000);

    const checkRes = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label="Stop generating"], button[data-testid="stop-button"], button[aria-label*="Stop"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, len: 0, text: '' });
      const text = scroll.innerText || '';
      
      const pIdx = text.lastIndexOf(${JSON.stringify(promptAnchor)});
      if (pIdx === -1) {
        return JSON.stringify({ isGenerating, len: 0, text: '', missingAnchor: true });
      }

      const afterPrompt = text.slice(pIdx);
      const marker = "ChatGPT said:";
      const mIdx = afterPrompt.indexOf(marker);
      if (mIdx === -1) return JSON.stringify({ isGenerating, len: 0, text: '', waitingForMarker: true });

      let responseText = afterPrompt.slice(mIdx + marker.length).trim();
      const footerIdx = responseText.lastIndexOf("ChatGPT can make mistakes.");
      if (footerIdx !== -1) {
        responseText = responseText.slice(0, footerIdx).trim();
      }

      return JSON.stringify({
        isGenerating,
        len: responseText.length,
        snippet: responseText.slice(0, 150),
        text: responseText
      });
    })()`);

    try {
      const data = JSON.parse(checkRes);
      if (!data.isGenerating && data.len > 250) {
        console.log(`\n✅ Stage 19.1 Review & Stage 19.2 Directive received! (${data.len} characters)`);
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

  const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE19_1_COMPLETION_REVIEW.md');
  const fileContent = `# ChatGPT Architecture Lead: Phase 19 Stage 19.1 Review & Stage 19.2 Directive

**Date**: ${new Date().toISOString()}  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.1 Review  

---

${finalMarkdown}
`;

  fs.writeFileSync(outputPath, fileContent, 'utf8');
  console.log(`Saved formal Stage 19.1 Review to ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
