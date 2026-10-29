/**
 * Monitor ChatGPT until Stage 19.2 generation finishes and save response
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
  console.log('Monitoring ChatGPT generation for Stage 19.2 Review...');

  for (let i = 0; i < 90; i++) {
    await sleep(4000);

    const res = runOsa(`(() => {
      const stopBtn = document.querySelector('button[aria-label*="Stop"], button[data-testid="stop-button"]');
      const isGenerating = !!stopBtn;
      const scroll = document.querySelector('.thread-scroll-container');
      if (!scroll) return JSON.stringify({ isGenerating, partsCount: 0, text: '' });
      const text = scroll.innerText;
      const parts = text.split("ChatGPT said:");
      const lastPart = parts[parts.length - 1] || '';
      return JSON.stringify({
        isGenerating,
        partsCount: parts.length,
        lastPartLen: lastPart.length,
        lastPartSnippet: lastPart.slice(0, 150),
        lastPart
      });
    })()`);

    try {
      const data = JSON.parse(res);
      console.log(`[Attempt ${i + 1}] isGenerating=${data.isGenerating}, partsCount=${data.partsCount}, lastPartLen=${data.lastPartLen}`);

      if (data.partsCount >= 6 && !data.isGenerating && data.lastPartLen > 250) {
        console.log('\n✅ ChatGPT Stage 19.2 response generation complete!');
        let text = data.lastPart.trim();
        const footerIdx = text.lastIndexOf("ChatGPT can make mistakes.");
        if (footerIdx !== -1) {
          text = text.slice(0, footerIdx).trim();
        }

        const outputPath = path.join(__dirname, '../plans/CHATGPT_STAGE19_2_COMPLETION_REVIEW.md');
        const fileContent = `# ChatGPT Architecture Lead: Phase 19 Stage 19.2 Review & Stage 19.3 Directive

**Date**: ${new Date().toISOString()}  
**Conversation**: https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a  
**Milestone**: EME Phase 19 (RT-01) — Stage 19.2 Review  

---

${text}
`;
        fs.writeFileSync(outputPath, fileContent, 'utf8');
        console.log(`Saved formal Stage 19.2 Review to ${outputPath}`);
        process.exit(0);
      }
    } catch (e) {
      console.log('Error parsing poll response:', e.message);
    }
  }

  console.error('Timed out waiting for Stage 19.2 generation.');
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
