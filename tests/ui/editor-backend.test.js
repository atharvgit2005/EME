/**
 * Phase 8 - Visual Editor Server & API Integration Tests
 */

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { EditorBackend } = require('../../src/ui/server.js');

function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
    }).on('error', reject);
  });
}

test('Phase 8 EditorBackend - Lifecycle, Load Project, Atomic Operation, and Undo/Redo', async () => {
  const backend = new EditorBackend({ port: 4399 });
  await backend.start();

  try {
    // 1. Health check
    const h = await getJson('http://localhost:4399/api/health');
    assert.strictEqual(h.status, 200);
    assert.strictEqual(h.data.status, 'ok');

    // 2. Load Scenario 1 project
    const p = await getJson('http://localhost:4399/api/project?path=artifacts/phase-7/scenario-1-16x9.json');
    assert.strictEqual(p.status, 200);
    assert.strictEqual(p.data.project.id, 'proj_scenario_1_youtube_16x9');
    const initialRev = p.data.project.revision;

    // 3. Dispatch atomic modify_clip operation
    const opRes = await postJson('http://localhost:4399/api/project/operation', {
      operation: {
        type: 'modify_clip',
        params: {
          clipId: 'clip_headline',
          typography: {
            text: 'UI TEST HEADLINE',
            color: '#123456'
          }
        }
      }
    });
    assert.strictEqual(opRes.status, 200);
    assert.strictEqual(opRes.data.success, true);
    assert.strictEqual(opRes.data.revision, initialRev + 1);
    assert.strictEqual(opRes.data.canUndo, true);

    const editedClip = opRes.data.project.clips.find(c => c.id === 'clip_headline');
    assert.strictEqual(editedClip.typography.text, 'UI TEST HEADLINE');
    assert.strictEqual(editedClip.typography.color, '#123456');

    // 4. Test Undo
    const undoRes = await postJson('http://localhost:4399/api/project/undo', {});
    assert.strictEqual(undoRes.status, 200);
    assert.strictEqual(undoRes.data.canRedo, true);
    const revertedClip = undoRes.data.project.clips.find(c => c.id === 'clip_headline');
    assert.notStrictEqual(revertedClip.typography.text, 'UI TEST HEADLINE');

    // 5. Test Redo
    const redoRes = await postJson('http://localhost:4399/api/project/redo', {});
    assert.strictEqual(redoRes.status, 200);
    const reappliedClip = redoRes.data.project.clips.find(c => c.id === 'clip_headline');
    assert.strictEqual(reappliedClip.typography.text, 'UI TEST HEADLINE');

    // 6. Security path traversal assertion
    const secRes = await getJson('http://localhost:4399/api/project?path=../../etc/passwd');
    assert.strictEqual(secRes.status, 403); // Hardened Path Traversal Guard (HTTP 403 Forbidden)
  } finally {
    await backend.stop();
  }
});
