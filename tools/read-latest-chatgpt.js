import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const jsCode = `(() => {
  const main = document.querySelector('main');
  if (!main) return 'NO_MAIN';
  const text = main.innerText;
  const lastUserIdx = text.lastIndexOf('Dear ChatGPT Architecture Lead');
  if (lastUserIdx !== -1) {
    return text.slice(lastUserIdx);
  }
  return text.slice(-8000);
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

const res = spawnSync('osascript', ['-'], { input: osa, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const output = (res.stdout || '').trim();

console.log(`Extracted output length: ${output.length}`);
const savePath = path.join(ROOT, 'plans/CHATGPT_M6_PHASE_A_C_REVIEW.md');
fs.writeFileSync(savePath, output, 'utf8');
console.log(`Saved latest response to ${savePath}`);
