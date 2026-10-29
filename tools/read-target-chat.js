const { spawnSync } = require('child_process');
const fs = require('fs');

const TARGET_CHAT_ID = '6ad4ae37-23ec-83ee-b1df-5274a2f04e1a';

function runTabJs(js) {
  const script = `
tell application "Brave Browser"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t contains "${TARGET_CHAT_ID}" then
        return execute t javascript "${js.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
      end if
    end repeat
  end repeat
end tell
`;
  const res = spawnSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (res.status !== 0) {
    throw new Error(res.stderr || 'osascript failed');
  }
  return (res.stdout || '').trim();
}

function readChat() {
  const js = `(function() {
    const turns = document.querySelectorAll('[data-message-author-role=assistant], div.markdown, [class*="agent-turn"], div[class*="block-"]');
    const messages = [];
    document.querySelectorAll('[data-testid^="conversation-turn-"]').forEach(turn => {
      messages.push(turn.innerText);
    });
    return JSON.stringify({
      turnsCount: turns.length,
      conversationTurns: messages.length,
      lastTurn: messages.length > 0 ? messages[messages.length - 1] : (turns.length > 0 ? turns[turns.length - 1].innerText : '')
    });
  })()`;

  const out = runTabJs(js);
  try {
    return JSON.parse(out);
  } catch (e) {
    return { raw: out };
  }
}

const chat = readChat();
console.log('Target Chat ID:', TARGET_CHAT_ID);
console.log('Conversation Turns Detected:', chat.conversationTurns || 0);
console.log('\n=== LATEST MESSAGE IN 6ad4ae37 ===\n');
console.log(chat.lastTurn || chat.raw || 'No message found');
