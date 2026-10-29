#!/usr/bin/env node

/**
 * Direct ChatGPT Active Tab Automation for Brave Browser
 * Enables bidirectional prompt exchange with the user's active ChatGPT tab.
 */

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runOsa(jsCode) {
  // Use JSON.stringify to safely format the JavaScript string inside AppleScript
  const jsStringLiteral = JSON.stringify(jsCode);
  const osaScript = `
tell application "Brave Browser"
    repeat with w in windows
        repeat with t in tabs of w
            if (URL of t) contains "chatgpt.com" then
                return execute t javascript ${jsStringLiteral}
            end if
        end repeat
    end repeat
    return "NO_CHATGPT_TAB"
end tell`;

  try {
    const res = spawnSync('osascript', ['-'], {
      input: osaScript,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    if (res.error) return `ERROR: ${res.error.message}`;
    return (res.stdout || '').trim();
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTurnCount() {
  const code = `(() => {
    return document.querySelectorAll('div[class*=\"[data-virtualized-turn-content]\"]').length;
  })()`;
  const res = runOsa(code);
  return parseInt(res, 10) || 0;
}

function isGenerating() {
  const code = `(() => {
    const stopBtn = document.querySelector('button[aria-label*="Stop" i]') ||
                    document.querySelector('button[data-testid*="stop" i]') ||
                    document.querySelector('button[aria-label*="Pause" i]') ||
                    document.querySelector('button.bg-composer-primary[aria-label*="Stop" i]');
    if (stopBtn) return true;
    const composerBtn = document.querySelector('button.bg-composer-primary');
    if (composerBtn) {
      const aria = (composerBtn.getAttribute('aria-label') || '').toLowerCase();
      if (aria.includes('stop') || aria.includes('cancel')) return true;
    }
    // Check for thinking or streaming cursor
    const streamingCursor = document.querySelector('.result-streaming') || document.querySelector('.streaming-caret');
    if (streamingCursor) return true;
    return false;
  })()`;
  return runOsa(code) === 'true';
}

function getLatestAssistantText() {
  const code = `(() => {
    const turns = Array.from(document.querySelectorAll('div[class*=\"[data-virtualized-turn-content]\"]'));
    if (turns.length === 0) return \"\";
    const last = turns[turns.length - 1];
    return last.innerText || \"\";
  })()`;
  return runOsa(code);
}

async function sendPrompt(promptText, options = {}) {
  console.log('🔍 Checking active ChatGPT tab in Brave Browser...');
  const initialTurns = getTurnCount();
  console.log(`   Initial turn count: ${initialTurns}`);

  // 1. Prepare and stage prompt in clipboard for clean formatting
  const tmpPath = '/tmp/chatgpt_prompt_stage.txt';
  fs.writeFileSync(tmpPath, promptText, 'utf8');
  execSync(`cat "${tmpPath}" | pbcopy`);

  console.log('📝 Injecting prompt into ChatGPT input...');
  // Focus the input, select all, and paste
  const injectCode = `(() => {
    const el = document.querySelector('div.ProseMirror[aria-label=\"Ask ChatGPT\"]') ||
               document.querySelector('div[contenteditable=true].ProseMirror:not(.content-xaiQhS)');
    if (!el) return \"NO_INPUT\";
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    return \"READY\";
  })()`;

  const prepRes = runOsa(injectCode);
  if (prepRes !== 'READY') {
    throw new Error(`Failed to focus ChatGPT composer: ${prepRes}`);
  }

  // System Events paste to trigger ProseMirror React synthetic state
  execSync(`osascript -e '
tell application "Brave Browser" to activate
delay 0.2
tell application "System Events"
    keystroke "v" using command down
end tell'`);

  await sleep(600);

  // Click the Send button
  console.log('🚀 Submitting prompt...');
  const clickSendCode = `(() => {
    const el = document.querySelector('div.ProseMirror[aria-label=\"Ask ChatGPT\"]') ||
               document.querySelector('div[contenteditable=true].ProseMirror:not(.content-xaiQhS)');
    if (!el) return \"NO_INPUT\";
    let parent = el.parentElement;
    let sendBtn = null;
    while (parent && parent.tagName !== \"BODY\") {
      const btns = Array.from(parent.querySelectorAll('button'));
      sendBtn = btns.find(b => {
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const text = (b.innerText || '').toLowerCase();
        return aria.includes('send') || text.includes('send') || b.className.includes('bg-composer-primary');
      });
      if (sendBtn && !sendBtn.disabled) break;
      parent = parent.parentElement;
    }

    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return \"CLICKED\";
    }

    // Fallback: press Enter via keyboard event
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return \"ENTER_DISPATCHED\";
  })()`;

  const sendRes = runOsa(clickSendCode);
  console.log(`   Submit result: ${sendRes}`);

  // 2. Wait for generation to start and complete
  console.log('⏳ Waiting for ChatGPT response stream...');
  await sleep(3000);

  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || 300000;
  let lastText = '';
  let stableCount = 0;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(2000);
    const generating = isGenerating();
    const currentText = getLatestAssistantText();

    if (currentText.length > 50 && currentText === lastText && !generating) {
      stableCount++;
      if (stableCount >= 2) {
        console.log('✅ Response complete and settled!');
        break;
      }
    } else {
      stableCount = 0;
      if (currentText.length !== lastText.length) {
        process.stdout.write(`\r   Streaming response... (${currentText.length} chars)`);
      }
    }
    lastText = currentText;
  }

  process.stdout.write('\n');
  const finalText = getLatestAssistantText();

  // Save to plans if requested
  if (options.output) {
    fs.writeFileSync(options.output, finalText, 'utf8');
    console.log(`💾 Saved response to ${options.output}`);
  }

  return finalText;
}

// Assessment Classifier
function classifyResponse(text) {
  const lower = text.toLowerCase();

  // Check for manual verification / user assessment triggers
  const manualSignals = [
    'manual verification',
    'your assessment',
    'please check',
    'provide the file',
    'please confirm',
    'choose one of',
    'human review',
    'do you want to',
    'which candidate would you prefer',
    'let me know which',
  ];

  const hasManualSignal = manualSignals.some((sig) => lower.includes(sig));

  // Check for error signals
  const errorSignals = [
    'an error occurred',
    'cannot proceed',
    'failed to generate',
    'something went wrong',
  ];
  const hasErrorSignal = errorSignals.some((sig) => lower.includes(sig));

  if (hasErrorSignal) {
    return { type: 'ERROR', reason: 'ChatGPT reported an error in generation' };
  }

  // Look for Phase 1 prompt headers / instructions
  const isPhase1Prompt = lower.includes('phase 1') && (lower.includes('task') || lower.includes('objective') || lower.includes('reconnaissance'));

  if (hasManualSignal && !isPhase1Prompt) {
    return { type: 'MANUAL_ASSESSMENT', reason: 'ChatGPT requested manual user assessment or decision' };
  }

  return { type: 'PROCEED', isPhase1Prompt };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  if (command === 'status') {
    const turns = getTurnCount();
    console.log(`ChatGPT Tab: Active in Brave (${turns} turns detected)`);
    const latest = getLatestAssistantText();
    console.log(`Latest Turn Preview: ${latest.slice(0, 150)}...`);
  } else if (command === 'send') {
    const text = args.slice(1).join(' ');
    if (!text) {
      console.error('Missing text');
      process.exit(1);
    }
    const response = await sendPrompt(text, { output: 'plans/LATEST_CHATGPT_RESPONSE.md' });
    console.log('\n=== RESPONSE ===\n');
    console.log(response);
    const classification = classifyResponse(response);
    console.log('\nClassification:', classification);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}

module.exports = { sendPrompt, classifyResponse, getLatestAssistantText };
