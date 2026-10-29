#!/usr/bin/env node

/**
 * ChatGPT / Web-AI Bridge Client for Editing Mechanics Engine
 * Integrates local agent workflows with the Web AI Bridge running on port 8765.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:8765';

async function request(method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BRIDGE_URL);
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkStatus() {
  try {
    const { status, body } = await request('GET', '/status');
    if (status === 200) {
      console.log('✅ Web AI Bridge is online:');
      console.log(JSON.stringify(body, null, 2));
      return body;
    }
    console.error(`❌ Unexpected status response (${status}):`, body);
  } catch (err) {
    console.error(`❌ Could not connect to Web AI Bridge on ${BRIDGE_URL}: ${err.message}`);
    console.error('   Make sure the bridge server is running: cd /Users/atharvpaharia100/Desktop/Projects/web-ai-bridge && npm start');
  }
}

async function sendPrompt(promptText, options = {}) {
  const provider = options.provider || 'chatgpt';
  const waitForResponse = options.wait !== false;

  console.log(`📤 Sending prompt to [${provider}]: "${promptText.slice(0, 80)}${promptText.length > 80 ? '...' : ''}"`);

  const { status, body } = await request('POST', '/api/tasks/create', {
    type: 'prompt',
    prompt: promptText,
    provider,
  });

  if (status !== 201 || !body.taskId) {
    console.error('❌ Failed to create task:', body);
    process.exit(1);
  }

  const taskId = body.taskId;
  console.log(`⏳ Task created with ID: ${taskId}`);

  if (!waitForResponse) {
    return { taskId, status: 'queued' };
  }

  console.log('⏳ Awaiting response from browser extension...');
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || 180000;

  while (Date.now() - startTime < timeoutMs) {
    await sleep(2500);
    try {
      const res = await request('GET', `/api/tasks/result?id=${encodeURIComponent(taskId)}`);
      if (res.status === 200 && res.body.status === 'completed') {
        const result = res.body.result;
        console.log('\n=================== RESPONSE ===================\n');
        console.log(result.text || '(No text returned)');
        console.log('\n================================================\n');

        if (options.output) {
          const outPath = path.resolve(process.cwd(), options.output);
          fs.writeFileSync(outPath, result.text || '', 'utf8');
          console.log(`💾 Response saved to: ${outPath}`);
        }
        return result;
      } else if (res.status === 200 && res.body.status === 'failed') {
        console.error('❌ Task failed:', res.body.result?.error || 'Unknown error');
        process.exit(1);
      }
    } catch (e) {
      // Continue polling
    }
  }

  console.error('⏱️ Timed out waiting for bridge response after 3 minutes.');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  if (['help', '--help', '-h'].includes(command)) {
    console.log(`
ChatGPT Web-AI Bridge Integration CLI

Usage:
  node tools/chatgpt-bridge.js status
  node tools/chatgpt-bridge.js prompt "<prompt text>" [--provider chatgpt|claude] [--output <file>] [--no-wait]
  node tools/chatgpt-bridge.js clear
    `);
    process.exit(0);
  }

  if (command === 'status') {
    await checkStatus();
  } else if (command === 'prompt') {
    const promptText = args[1];
    if (!promptText) {
      console.error('Error: missing prompt string.');
      process.exit(1);
    }
    const options = {
      provider: 'chatgpt',
      wait: !args.includes('--no-wait'),
    };
    for (let i = 2; i < args.length; i++) {
      if (args[i] === '--provider' && args[i + 1]) {
        options.provider = args[i + 1];
        i++;
      } else if (args[i] === '--output' && args[i + 1]) {
        options.output = args[i + 1];
        i++;
      }
    }
    await sendPrompt(promptText, options);
  } else if (command === 'clear') {
    const res = await request('POST', '/api/tasks/clear');
    console.log('Cleared bridge queue:', res.body);
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { request, checkStatus, sendPrompt };
