const fs = require('fs');
const path = require('path');
const http = require('http');

const taskId = process.argv[2] || 'task_1792166139023_8ccls';
const outFile = path.resolve('docs/phase1-2-chatgpt-review.md');

console.log(`Polling bridge for completion of ${taskId}...`);

async function poll() {
  const startTime = Date.now();
  const maxWait = 10 * 60 * 1000; // 10 minutes

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(`http://localhost:8765/api/tasks/result?id=${taskId}`, res => {
          let buf = '';
          res.on('data', chunk => buf += chunk);
          res.on('end', () => resolve(JSON.parse(buf)));
        }).on('error', reject);
      });

      if (data.status === 'completed') {
        const text = data.result?.text || '';
        console.log('\n=== CHATGPT RESPONSE RECEIVED ===\n');
        console.log(text.slice(0, 500) + '...');
        fs.writeFileSync(outFile, text, 'utf8');
        console.log(`Saved to ${outFile}`);
        process.exit(0);
      } else if (data.status === 'failed') {
        console.error('Task failed:', data.result?.error);
        process.exit(1);
      }
    } catch (e) {
      // Keep polling
    }
  }
  console.error('Timed out polling bridge.');
  process.exit(1);
}

poll();
