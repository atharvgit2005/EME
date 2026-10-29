const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { HyperFramesCompiler } = require('../src/renderers/hyperframes/compiler.js');
const { HyperFramesCapabilities } = require('../src/renderers/hyperframes/capabilities.js');
const { ProjectManager } = require('../src/engine/project.js');
const { FrameInspector } = require('../src/renderers/inspector.js');

test('HyperFramesCompiler - Compile project to HTML composition', () => {
  const project = ProjectManager.loadProject('artifacts/phase-3/smoke-test-project.json');
  const tempOut = path.resolve('artifacts/phase-3/test-comp');

  const compiled = HyperFramesCompiler.compile(project, tempOut);
  assert.equal(fs.existsSync(compiled.entryHtmlPath), true);
  assert.equal(compiled.durationSeconds, 3.0);
  assert.equal(compiled.clipCount, 2);

  const html = fs.readFileSync(compiled.entryHtmlPath, 'utf8');
  assert.ok(html.includes('data-composition-id="main"'));
  assert.ok(html.includes('EDITING MECHANICS'));
  assert.ok(html.includes('PHASE 3 VERTICAL SLICE'));
  assert.ok(html.includes('gsap.timeline'));
});

test('HyperFramesCapabilities - Rejects unsupported effect or property', () => {
  const badProject = {
    schemaVersion: '1.0.0',
    revision: 0,
    clips: [
      {
        id: 'c1',
        type: 'text',
        effects: [
          { type: 'blendMode', parameters: { mode: 'unsupported-alien-blend' } }
        ]
      }
    ]
  };

  const cap = HyperFramesCapabilities.validate(badProject);
  assert.equal(cap.supported, false);
  assert.ok(cap.errors.some(e => e.includes('Unsupported blendMode')));
});

test('FrameInspector - Verify smoke test MP4 and extracted frames', () => {
  const mp4Path = path.resolve('artifacts/phase-3/smoke-test.mp4');
  assert.equal(fs.existsSync(mp4Path), true);

  const f0 = path.resolve('artifacts/phase-3/frame-0s.png');
  const f1 = path.resolve('artifacts/phase-3/frame-1.5s.png');
  const f3 = path.resolve('artifacts/phase-3/frame-3s.png');

  assert.equal(fs.existsSync(f0), true);
  assert.equal(fs.existsSync(f1), true);
  assert.equal(fs.existsSync(f3), true);

  assert.ok(fs.statSync(f0).size > 0);
  assert.ok(fs.statSync(f1).size > 10000);
  assert.ok(fs.statSync(f3).size > 10000);
});
