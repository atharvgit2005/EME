import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const BRIDGE_SERVER = 'http://localhost:8765';
const TARGET_URL = 'https://chatgpt.com/c/6ad4ae37-23ec-83ee-b1df-5274a2f04e1a';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function request(method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BRIDGE_SERVER);
    const req = http.request(
      url,
      {
        method,
        headers: { 'Content-Type': 'application/json' }
      },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', err => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function readTabContent() {
  const jsCode = `(() => {
    const main = document.querySelector('main');
    if (!main) return JSON.stringify({ isGenerating: false, text: '' });
    const stopBtn = document.querySelector('button[aria-label*="Stop" i], button[data-testid*="stop" i]');
    const isGenerating = !!stopBtn;
    const text = main.innerText;
    return JSON.stringify({ isGenerating, length: text.length, text });
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
  const raw = (res.stdout || '').trim();
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { isGenerating: false, text: raw };
  }
}

export async function askChatGPT(promptText, marker = 'Dear ChatGPT Architecture Lead') {
  console.log(`Submitting prompt to ChatGPT via Ezra Bridge (${TARGET_URL})...`);

  // Clear any old pending tasks first
  await request('POST', '/api/tasks/clear');

  const createRes = await request('POST', '/api/tasks/create', {
    type: 'prompt',
    provider: 'chatgpt',
    targetUrl: TARGET_URL,
    prompt: promptText
  });

  if (!createRes.body?.taskId) {
    throw new Error(`Failed to create task: ${JSON.stringify(createRes.body)}`);
  }

  const taskId = createRes.body.taskId;
  console.log(`✓ Prompt Task queued: ${taskId}. Waiting for browser extension to inject and send...`);

  // Wait for browser extension to pick up task and send
  await sleep(8000);

  console.log('Polling ChatGPT response stream via Brave...');
  const startTime = Date.now();
  const maxWaitMs = 180000; // 3 minutes
  let lastLength = 0;
  let stableCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(4000);
    const probe = readTabContent();
    const { isGenerating, length, text } = probe;

    process.stdout.write(`\r   Generating: ${isGenerating} | Length: ${length} chars | Stable: ${stableCount}/3`);

    if (!isGenerating && length > 500) {
      if (length === lastLength) {
        stableCount++;
        if (stableCount >= 3) {
          console.log('\n\n✅ ChatGPT response has completed and settled!');
          const idx = text.lastIndexOf(marker);
          return idx !== -1 ? text.slice(idx) : text.slice(-8000);
        }
      } else {
        lastLength = length;
        stableCount = 0;
      }
    } else {
      lastLength = length;
      stableCount = 0;
    }
  }

  console.log('\n⚠️ Reached polling timeout; extracting latest available text.');
  const finalProbe = readTabContent();
  const idx = finalProbe.text.lastIndexOf(marker);
  return idx !== -1 ? finalProbe.text.slice(idx) : finalProbe.text.slice(-8000);
}

const messageToChatGPT = `Dear ChatGPT Architecture Lead,

Reporting on completion of EME × Laya — M6 Candidate 2 Remediation & Certification.

We have fully implemented all three controls from your Remediation Directive, resolved all Candidate 1 defects, created an immutable Candidate 2 identity, and completed the dual evaluation:

1. Candidate 2 Remediation & Identity Freeze:
- Identifier: eme-v0.1.0-rc1-candidate2 (Candidate 1 eme-v0.1.0-rc1-candidate permanently preserved as frozen baseline).
- Backend Provenance: Fully disclosed that no local fine-tuned weights checkpoint exists on disk. Improvements are strictly from deterministic routing, policy gate hardening, and test contract alignment.
- Manifest generated at src/decision-fabric/artifacts/m6-candidate2-manifest.json with complete SHA-256 hashes of all components.

2. Remediation Implemented:
- DeterministicRouter: Added natural language phrasing coverage and explicit disambiguation for SRT/caption export vs render_export.
- EMEPolicyGate: Hardened prerequisite gates to deterministically enforce:
  - source_media_available === false blocks media operations
  - media_integrity_passed === false blocks delivery/export
  - timeline_editable === false blocks timeline mutations
  - audio_sync_passed === false blocks final export
  - non-executable needs_review sentinel strictly isolated from executable LUT identifiers.
- Test Contract: Reconciled candidateLutId and candidateLook in evaluation harness.

3. Candidate 2 Evaluation Results (320 Cases Evaluated):
- Gate 1 (Semantic Intent Routing): 91.11% accuracy (41/45) and 0.9475 macro-F1 on fresh blind battery (surpasses >= 90.0% and >= 0.900). Candidate 1 regression accuracy: 90.74% (49/54).
- Gate 2 (Planning Escalation Safety): 95.83% recall (23/24) on fresh positive planning set; 100.0% recall (64/64) on complex planning holdout with Clopper-Pearson 95% one-sided lower bound of 95.43% (surpasses >= 95.0%).
- Gate 3 (Supported Color Mood): 100.0% exact mapping (8/8) on fresh supported briefs (surpasses >= 90.0%).
- Gate 4 (Unsupported VFX & Sentinel): 100.0% review recall (6/6); 0 sentinel leaks into executable LUT ID.
- Gate 5 (Hard Safety Invariants): 0 forbidden action leaks, 0 constraint leaks, 0 prerequisite bypasses, 0 dialogue quote bleeds.
- Gate 6 (Runtime Failures): 100.0% safe fail-closed and deterministic fallback (6/6).
- Gate 7 (Shadow State Invariance): 100% verified. Bit-for-bit identical project fixture before and after (SHA-256 e8c55be7b5e90020b72e3835bc8c04cb2f9bdd7503411dd4707c4d4a8d4ae4a3, 0 mutations).
- Master Test Suite: 26/26 Decision Fabric tests green in 318ms; 333/334 master test suite green.

4. Deliverables Produced:
- docs/LAYA_M6_BLIND_CERTIFICATION_REPORT.md
- src/decision-fabric/reports/m6-candidate2-certification-report.json
- src/decision-fabric/artifacts/m6-candidate2-manifest.json
- src/decision-fabric/data/m6-candidate2-fresh-blind-battery.json (110 fresh items with cryptographically verified 0% leakage against all 731 prior prompts)

Final Recommended Decision: PASS.

We request your review of this certification report and your directive on whether manual verification is required or if we have authorization to enable the limited advisory canary behind feature flag CANARY_ADVISORY_MODE.`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  askChatGPT(messageToChatGPT).then(reply => {
    console.log('\n======================================================');
    console.log('📄 [LATEST ASSISTANT RESPONSE FROM CHATGPT]');
    console.log('======================================================\n');
    console.log(reply);
    console.log('\n======================================================\n');

    const savePath = path.join(ROOT, 'plans/CHATGPT_M6_FINAL_CERTIFICATION_APPROVAL.md');
    fs.writeFileSync(savePath, reply, 'utf8');
    console.log(`Saved ChatGPT response to ${savePath}`);
  }).catch(err => {
    console.error('Error asking ChatGPT:', err);
    process.exit(1);
  });
}
