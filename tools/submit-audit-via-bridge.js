const fs = require('fs');
const path = require('path');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('1. Reading VTSM-01 Independent Technical Audit Report...');
  const reportPath = path.resolve('experiments/visual-temporal-state/docs/VTSM_01_INDEPENDENT_AUDIT.md');
  const auditReport = fs.readFileSync(reportPath, 'utf8');

  const fullPrompt = `Dear ChatGPT Architecture Lead,

In accordance with your directives, Antigravity has conducted a comprehensive, independent technical audit and exit-gate verification for VTSM-01 (Visual Temporal State Model Foundation and Benchmark).

Below is the complete, evidence-based audit report:

${auditReport}

================================================================================
AUDIT SUMMARY & QUESTIONS FOR REVIEW:
================================================================================
1. Production Isolation: Confirmed 100% clean working tree on production src/, bin/, schema/, package.json.
2. Controlled Fixtures: All 7 controlled fixtures independently verified; decoded frame pixels match ground truth.
3. Classical Vision Baseline: 7/7 fixtures pass all strict numerical targets; 100% bit-exact reproducibility between back-to-back benchmark runs.
4. Learned Candidate Benchmark: Ultralytics YOLO11n + ByteTrack was genuinely executed (SHA-256: 0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1). It achieved 100% recall on natural video (62.5 ms/fr), but 0% recall on synthetic procedural shapes due to COCO category bias, and carries an AGPL-3.0 viral copyleft license. As you noted, the classical baseline is accepted on its criteria, while the learned candidate is formally marked BLOCKED for production packaging.

Please review this independent audit evidence and provide your formal technical disposition and any directives before we conclude.`;

  console.log('2. Submitting prompt task to web-ai-bridge on http://localhost:8765/api/tasks/create...');
  const createRes = await fetch('http://localhost:8765/api/tasks/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'prompt',
      prompt: fullPrompt,
      provider: 'chatgpt'
    })
  });

  const createData = await createRes.json();
  if (!createData.success || !createData.taskId) {
    throw new Error(`Failed to create task: ${JSON.stringify(createData)}`);
  }

  const taskId = createData.taskId;
  console.log(`Task created successfully! Task ID: ${taskId}`);

  console.log('3. Polling web-ai-bridge for task completion...');
  const t0 = Date.now();
  const maxWait = 360000; // 6 mins

  while (Date.now() - t0 < maxWait) {
    await sleep(4000);
    const res = await fetch(`http://localhost:8765/api/tasks/result?id=${taskId}`);
    const data = await res.json();

    const elapsed = Math.round((Date.now() - t0) / 1000);
    process.stdout.write(`   [${elapsed}s] Task status: ${data.status}...\r`);

    if (data.status === 'completed') {
      console.log(`\n\nTask ${taskId} completed in ${elapsed}s!`);
      const replyText = data.result?.text || '';
      
      fs.mkdirSync(path.resolve('plans'), { recursive: true });
      const outPath = path.resolve('plans/CHATGPT_VTSM01_AUDIT_RESPONSE.md');
      fs.writeFileSync(outPath, replyText, 'utf8');

      console.log(`Saved response to: ${outPath} (${replyText.length} chars)`);
      console.log('================================================================');
      console.log(replyText.slice(0, 1500));
      console.log('================================================================');
      return;
    }

    if (data.status === 'failed' || data.status === 'cancelled') {
      throw new Error(`Task ${taskId} ended with status: ${data.status} (${data.result?.error || 'unknown error'})`);
    }
  }

  throw new Error(`Task ${taskId} timed out after 6 minutes.`);
}

main().catch(console.error);
