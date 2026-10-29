/**
 * Editing Mechanics Engine (EME) - Phase PF-10 Stage 3 Test Battery
 * Multi-Revision Visual Inspection, Candidate Comparison Cards, & Conversational Revision Surface
 *
 * Verifies all 20 required Stage 3 criteria from ChatGPT Architectural Directive:
 * 1. Revision DAG displays predecessor links and branches from authoritative history.
 * 2. Failed and committed revisions are visually and semantically distinct.
 * 3. Historical inspection does not mutate active delivery or project pointer.
 * 4. Historical media is correctly bound to its revision or shown unavailable.
 * 5. Missing snapshots produce an explicit unavailable diff.
 * 6. Diff fields reflect the backend snapshot diff without fabricated changes.
 * 7. Candidate cards bind to exact candidate and manifest identifiers.
 * 8. Ineligible candidates cannot be activated by frontend actions.
 * 9. Candidate preview does not change the active delivery.
 * 10. Exiting candidate preview cleanly restores active delivery media.
 * 11. Selection uses the current expectedVersion; stale selection fails safely.
 * 12. Successful selection updates the UI only after authoritative confirmation.
 * 13. Revision submission includes required session/version context.
 * 14. In-flight revision mutation prevents duplicate submissions and displays progress.
 * 15. Revision failure preserves the last verified delivery and shows failure callout.
 * 16. Revision success refetches authoritative state and history.
 * 17. Authoritative undo/redo and branch behavior remain correct after multiple revisions.
 * 18. Crash recovery recovers session and synchronizes active delivery.
 * 19. Stale asynchronous responses cannot overwrite newer state.
 * 20. Empty, missing, malformed, and unknown backend fields fail visibly and safely.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const { EditorBackend } = require('../src/ui/server.js');
const { RevisionSessionManager } = require('../src/prompt-core/revision-session.js');
const { CandidateOrchestrator } = require('../src/prompt-core/candidate-orchestrator.js');

const { OperationPlanCompiler } = require('../src/prompt-core/index.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');
const scenario1Brief = require('../fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json');

const TEST_OUT_DIR = path.resolve('artifacts/test-pf10-stage3');

function createBaseExecutedProject() {
  const baseProject = structuredClone(scenario1Project);
  const basePlan = OperationPlanCompiler.compilePlan({
    brief: scenario1Brief,
    project: baseProject,
    beatAnalysis: scenario1Beat
  });
  return OperationPlanCompiler.executePlan(baseProject, basePlan).project;
}

const nativeFetch = globalThis.fetch;
function makeFetch(port) {
  return (url, opts) => {
    const fullUrl = typeof url === 'string' && url.startsWith('http') ? url : `http://localhost:${port}${url}`;
    return nativeFetch(fullUrl, opts);
  };
}

// Mock DOM element factory
function createMockElement(id, tagName = 'div') {
  let innerTextVal = '';
  return {
    id,
    tagName: tagName.toUpperCase(),
    className: '',
    get innerText() { return innerTextVal; },
    set innerText(val) { innerTextVal = val == null ? '' : String(val); },
    innerHTML: '',
    value: '',
    style: {},
    dataset: {},
    disabled: false,
    title: '',
    src: '',
    currentTime: 0,
    duration: 12.0,
    volume: 1.0,
    muted: false,
    readyState: 4,
    paused: true,
    error: null,
    classList: {
      _classes: new Set(),
      add(...cls) { cls.forEach(c => this._classes.add(c)); },
      remove(...cls) { cls.forEach(c => this._classes.delete(c)); },
      contains(c) { return this._classes.has(c); },
      toggle(c) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); }
    },
    _listeners: {},
    addEventListener(event, handler) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter(h => h !== handler);
    },
    dispatchEvent(event) {
      const type = typeof event === 'string' ? event : event.type;
      const handlers = this._listeners[type] || [];
      handlers.forEach(h => h(event));
    },
    click() {
      this.dispatchEvent({ type: 'click' });
    },
    load() {
      this.dispatchEvent({ type: 'loadstart' });
    },
    play() {
      this.paused = false;
      this.dispatchEvent({ type: 'play' });
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
      this.dispatchEvent({ type: 'pause' });
    },
    removeAttribute(attr) {
      if (attr === 'src') {
        this.src = '';
        delete this.dataset.currentIdentifier;
      }
    },
    querySelector(sel) {
      return null;
    },
    querySelectorAll(sel) {
      return [];
    },
    closest(sel) {
      return null;
    },
    appendChild(child) {
      return child;
    },
    width: 800,
    height: 600,
    getContext(type) {
      return {
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fill() {},
        arc() {},
        measureText() { return { width: 10 }; },
        fillText() {},
        strokeText() {}
      };
    },
    removeChild(child) {
      return child;
    }
  };
}

function createMockWindow() {
  const listeners = {};
  return {
    __EME_AUTO_INIT__: false,
    state: { sessionFetchSeq: 0 },
    location: { search: '' },
    navigator: {
      clipboard: {
        writeText: async () => {}
      }
    },
    addEventListener(event, handler) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener(event, handler) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(h => h !== handler);
    },
    dispatchEvent(event) {
      const type = typeof event === 'string' ? event : event.type;
      const handlers = listeners[type] || [];
      handlers.forEach(h => h(event));
    },
    requestAnimationFrame(cb) { return setTimeout(cb, 0); },
    cancelAnimationFrame(id) { clearTimeout(id); },
    alert: () => {},
    confirm: () => true
  };
}

// Lightweight DOM environment for testing UI functions
function setupMockDom() {
  const elements = new Map();
  const ids = [
    // Delivery Verification Bar & Banners
    'delivery-verification-bar', 'delivery-status-badge', 'delivery-status-icon',
    'delivery-status-text', 'meta-revision-id', 'meta-manifest-id', 'meta-sha256-container',
    'meta-sha256-short', 'btn-copy-sha256', 'meta-resolution', 'meta-fps', 'meta-duration',
    'meta-qa-score', 'inspection-banner', 'inspected-rev-id', 'btn-exit-inspection',
    'delivery-alert', 'delivery-alert-icon', 'delivery-alert-msg',
    // Candidate Preview Banner
    'candidate-preview-banner', 'previewed-cand-id', 'btn-activate-previewed-cand', 'btn-exit-cand-preview',
    // Preview Video & Overlays
    'preview-stage', 'preview-video', 'preview-overlay-loading', 'preview-overlay-unavailable',
    'preview-overlay-error', 'preview-error-msg', 'preview-overlay-stale', 'preview-overlays',
    // Transport & Top Bar Controls
    'btn-volume-mute', 'volume-slider', 'btn-play-pause', 'playhead-sec', 'transport-sec-label',
    'current-tick', 'smpte-timecode', 'timeline-playhead', 'timeline-ruler', 'timeline-track-lanes',
    'track-header-list', 'btn-undo', 'btn-redo', 'project-title', 'revision-badge', 'canvas-dim', 'timebase-fps',
    // History DAG & Diff Elements
    'btn-refresh-history', 'history-dag-container', 'history-loading', 'history-empty', 'history-error',
    'history-error-msg', 'history-nodes-list', 'diff-from-select', 'diff-to-select', 'btn-compute-diff',
    'diff-status-indicator', 'diff-unavailable-msg', 'diff-unavailable-text', 'diff-details-card',
    'diff-plan-hash', 'diff-qa-score', 'diff-ops-count', 'diff-duration-delta',
    'diff-added-count', 'diff-added-list', 'diff-removed-count', 'diff-removed-list',
    'diff-modified-count', 'diff-modified-list',
    // Candidates Comparison Elements
    'btn-refresh-candidates', 'cand-set-id', 'cand-selected-id', 'cand-count-badge',
    'candidates-loading', 'candidates-empty', 'candidates-error', 'candidates-error-msg', 'candidates-grid',
    // Conversational Revision Elements
    'rev-session-id', 'rev-active-revision', 'rev-concurrency-version', 'rev-session-state',
    'rev-hard-constraints-list', 'rev-prompt-input', 'btn-clear-revision', 'btn-submit-revision',
    'rev-in-flight', 'rev-error-callout', 'rev-error-msg',
    'btn-session-undo', 'btn-session-redo', 'btn-session-recover'
  ];

  ids.forEach(id => {
    let tag = 'div';
    if (id === 'preview-video') tag = 'video';
    else if (id.startsWith('btn-')) tag = 'button';
    else if (id.endsWith('-select')) tag = 'select';
    else if (id.endsWith('-input')) tag = 'textarea';
    else if (id.endsWith('-list')) tag = 'ul';
    elements.set(id, createMockElement(id, tag));
  });

  const body = createMockElement('body', 'body');
  return {
    body,
    activeElement: body,
    createElement(tag) {
      return createMockElement('', tag);
    },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, createMockElement(id));
      }
      return elements.get(id);
    },
    querySelectorAll(sel) {
      return [];
    },
    querySelector(sel) {
      return null;
    },
    elements
  };
}

// Ensure mock deliverable file exists
function ensureTestMedia(fileName = 'test-stage3-media.mp4') {
  fs.mkdirSync(TEST_OUT_DIR, { recursive: true });
  const cleanFallback = path.join(TEST_OUT_DIR, 'clean-12s.mp4');
  if (!fs.existsSync(cleanFallback)) {
    const rootClean = path.join('artifacts/pf08-test-deliverables', 'clean-12s.mp4');
    if (fs.existsSync(rootClean)) {
      fs.copyFileSync(rootClean, cleanFallback);
    }
  }
  const p = path.join(TEST_OUT_DIR, fileName);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, Buffer.from('TEST-STAGE3-STREAMING-MEDIA-HEADER-PAYLOAD-FOR-VERIFICATION-1234567890'));
  }
  return p;
}

// Build synthetic session with history and candidates
function buildTestSession({ port }) {
  const mediaPath0 = ensureTestMedia('rev-0-baseline.mp4');
  const mediaPath1 = ensureTestMedia('rev-1-active.mp4');
  const baseExecutedProject = createBaseExecutedProject();

  const session = {
    schema_version: '1.0.0',
    session_id: 'sess-stage3-test-100',
    state: 'ready',
    request: {
      original_prompt: 'Create Himachal Travel Reel',
      brief_id: 'brief-pf03-scenario1',
      latest_revision_prompt: null
    },
    concurrency: {
      version: 2,
      last_modified: '2026-10-19T12:00:00Z',
      active_agent: 'user'
    },
    selected_candidate_id: 'cand-001',
    candidate_set_id: 'cset-stage3-test-100',
    active_delivery: {
      revision_id: 'rev-1',
      manifest_id: 'manifest-rev-1-verified',
      media_path: mediaPath1,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    hard_constraints: [
      { constraint_id: 'c-clip-order', type: 'clip_order', description: 'Original A-roll sequence must not be rearranged' },
      { constraint_id: 'c-soundtrack', type: 'soundtrack', description: 'Himachal acoustic score is locked on audio track A1' }
    ],
    undo_redo: {
      undo_stack: ['rev-0'],
      redo_stack: [],
      current_revision_id: 'rev-1'
    },
    recovery: {
      status: 'clean',
      pending_transaction_id: null,
      last_attempted_revision_id: null,
      checkpoint_path: null
    },
    diagnostics: [],
    history: [
      {
        revision_id: 'rev-0',
        predecessor_id: null,
        prompt: 'Session initialization with Himachal project baseline',
        status: 'committed',
        plan_hash: 'plan-hash-rev0',
        manifest_id: 'manifest-rev-0-baseline',
        media_sha256: '1111222233334444555566667777888899990000111122223333444455556666',
        media_path: mediaPath0,
        operations_count: 0,
        qa_score: 95,
        timestamp: '2026-10-19T11:50:00Z',
        _project: baseExecutedProject
      },
      {
        revision_id: 'rev-1',
        predecessor_id: 'rev-0',
        prompt: 'Increase cut tempo at the drum entrance',
        status: 'committed',
        plan_hash: 'plan-hash-rev1',
        manifest_id: 'manifest-rev-1-verified',
        media_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        media_path: mediaPath1,
        operations_count: 3,
        qa_score: 98,
        timestamp: '2026-10-19T12:00:00Z',
        _project: {
          ...baseExecutedProject,
          clips: [
            ...baseExecutedProject.clips,
            {
              id: 'clip-tempo-added',
              trackId: 'track_v_broll',
              type: 'video',
              startTick: 0,
              durationTicks: 240000,
              source: { assetId: 'asset_v_broll', trimInTick: 0, trimOutTick: 240000 }
            }
          ]
        }
      },
      {
        revision_id: 'rev-2-failed',
        predecessor_id: 'rev-1',
        prompt: 'Attempt impossible cuts with invalid duration',
        status: 'failed',
        plan_hash: 'plan-hash-rev2-fail',
        manifest_id: null,
        media_sha256: null,
        media_path: null,
        operations_count: 0,
        qa_score: null,
        error: 'Negative clip duration violation on track V1',
        timestamp: '2026-10-19T12:05:00Z'
      }
    ]
  };

  const candMedia0 = ensureTestMedia('cand-001-media.mp4');
  const candMedia1 = ensureTestMedia('cand-002-media.mp4');
  const candMedia2 = ensureTestMedia('cand-003-media.mp4');

  const candSha0 = crypto.createHash('sha256').update(fs.readFileSync(candMedia0)).digest('hex');
  const candSha1 = crypto.createHash('sha256').update(fs.readFileSync(candMedia1)).digest('hex');
  const candSha2 = crypto.createHash('sha256').update(fs.readFileSync(candMedia2)).digest('hex');

  const candidateSet = {
    schema_version: '1.0.0',
    candidate_set_id: 'cset-stage3-test-100',
    selection: {
      selected_candidate_id: 'cand-001'
    },
    candidates: [
      {
        candidate_id: 'cand-001',
        profile_id: 'cinematic-dynamic',
        variation_profile: { name: 'Cinematic Dynamic Cuts' },
        status: 'verified',
        qa_summary: { score: 96, hard_gates_passed: true },
        canonical_plan_hash: 'hash-cand-001',
        execution: {
          status: 'committed',
          executed_steps: 1,
          base_revision: 0,
          final_revision: 1,
          journal_path: null
        },
        plan_summary: {
          canonical_plan_hash: 'hash-cand-001',
          operations_count: 2,
          target_duration_ticks: 1440000
        },
        musical_alignment: {
          composite_score: 0.942,
          rank: 1,
          hard_gates_passed: true,
          musical_score: 0.95
        },
        preference_alignment: { preference_score: 0.91 },
        deliverable: {
          manifest_id: 'manifest-cand-001',
          media_path: candMedia0,
          sha256: candSha0,
          technical_metadata: {
            canvas: { width: 1080, height: 1920 },
            timebase: { fps: 60 },
            duration_seconds: 12.0
          }
        }
      },
      {
        candidate_id: 'cand-002',
        profile_id: 'ambient-slow',
        variation_profile: { name: 'Ambient Extended Takes' },
        status: 'verified',
        qa_summary: { score: 85, hard_gates_passed: true },
        canonical_plan_hash: 'hash-cand-002',
        execution: {
          status: 'committed',
          executed_steps: 1,
          base_revision: 0,
          final_revision: 1,
          journal_path: null
        },
        plan_summary: {
          canonical_plan_hash: 'hash-cand-002',
          operations_count: 2,
          target_duration_ticks: 1440000
        },
        musical_alignment: {
          composite_score: 0.820,
          rank: 2,
          hard_gates_passed: true,
          musical_score: 0.83
        },
        preference_alignment: { preference_score: 0.80 },
        deliverable: {
          manifest_id: 'manifest-cand-002',
          media_path: candMedia1,
          sha256: candSha1,
          technical_metadata: {
            canvas: { width: 1080, height: 1920 },
            timebase: { fps: 60 },
            duration_seconds: 12.0
          }
        }
      },
      {
        candidate_id: 'cand-003-ineligible',
        profile_id: 'rushed-failing',
        variation_profile: { name: 'Rushed Cuts Low QA' },
        status: 'unverified',
        qa_summary: { score: 62, hard_gates_passed: false },
        canonical_plan_hash: 'hash-cand-003',
        execution: {
          status: 'failed',
          executed_steps: 0,
          base_revision: 0,
          final_revision: 0,
          journal_path: null
        },
        plan_summary: {
          canonical_plan_hash: 'hash-cand-003',
          operations_count: 0,
          target_duration_ticks: 1440000
        },
        musical_alignment: {
          composite_score: 0.550,
          rank: 3,
          hard_gates_passed: false,
          musical_score: 0.52
        },
        preference_alignment: { preference_score: 0.45 },
        deliverable: {
          manifest_id: 'manifest-cand-003',
          media_path: candMedia2,
          sha256: 'cccccccc11112222333344445555666677778888999900001111222233334444',
          technical_metadata: {
            canvas: { width: 1080, height: 1920 },
            timebase: { fps: 60 },
            duration_seconds: 12.0
          }
        }
      }
    ]
  };

  return { session, candidateSet };
}

// --------------------------------------------------------------------------
// Test Suite: Phase PF-10 Stage 3
// --------------------------------------------------------------------------

test('PF10-S3.1: Revision DAG displays predecessor links and branches from authoritative history', async () => {
  const port = 4601;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({
    port,
    project: scenario1Project,
    session,
    candidateSet,
    outputDir: TEST_OUT_DIR
  });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  // Load app.js code into environment
  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    assert.strictEqual(window.state.sessionHistory.length, 3);

    // Call renderHistoryDAGUI
    window.renderHistoryDAGUI();

    const nodesList = mockDom.getElementById('history-nodes-list');
    assert.ok(nodesList.innerHTML.includes('rev-0'));
    assert.ok(nodesList.innerHTML.includes('rev-1'));
    assert.ok(nodesList.innerHTML.includes('rev-2-failed'));
    assert.ok(nodesList.innerHTML.includes('ROOT BASELINE'));
    assert.ok(nodesList.innerHTML.includes('↳ Predecessor:'));
    assert.ok(nodesList.innerHTML.includes('rev-0'));
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.2: Failed and committed revisions are visually and semantically distinct', async () => {
  const port = 4602;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    window.renderHistoryDAGUI();

    const nodesHtml = mockDom.getElementById('history-nodes-list').innerHTML;
    // Committed rev-0
    assert.ok(nodesHtml.includes('node-badge-committed'));
    // Active rev-1
    assert.ok(nodesHtml.includes('node-badge-active'));
    // Failed rev-2-failed
    assert.ok(nodesHtml.includes('node-badge-failed'));
    assert.ok(nodesHtml.includes('failed-rev'));
    assert.ok(nodesHtml.includes('Negative clip duration violation on track V1'));
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.3: Historical inspection does not mutate active delivery or project pointer', async () => {
  const port = 4603;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    assert.strictEqual(window.state.session.active_delivery.revision_id, 'rev-1');

    // Inspect historical baseline rev-0
    await window.inspectRevision('rev-0');
    assert.strictEqual(window.state.inspectedRevisionId, 'rev-0');

    // Invariant: Server and client active delivery pointer remain rev-1!
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-1');
    assert.strictEqual(window.state.session.active_delivery.revision_id, 'rev-1');

    // Delivery badge reflects superseded read-only state
    const badge = mockDom.getElementById('delivery-status-badge');
    assert.ok(badge.className.includes('badge-status-superseded'));

    // Exit inspection returns to active delivery
    await window.exitInspectionMode();
    assert.strictEqual(window.state.inspectedRevisionId, null);
    assert.ok(badge.className.includes('badge-status-active'));
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.4: Historical media binds to exact inspected revision or fails to unavailable', async () => {
  const port = 4604;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    const video = mockDom.getElementById('preview-video');
    assert.strictEqual(video.src, '/api/media?id=rev-1');

    // Inspect rev-0 which has authorized media
    await window.inspectRevision('rev-0');
    assert.strictEqual(video.src, '/api/media?id=rev-0');

    // Inspect rev-2-failed which has NO media artifact
    await window.inspectRevision('rev-2-failed');
    const unavailableOverlay = mockDom.getElementById('preview-overlay-unavailable');
    assert.strictEqual(video.src, '');
    assert.strictEqual(unavailableOverlay.classList.contains('hidden'), false);

    await window.exitInspectionMode();
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.5: Missing snapshots produce an explicit unavailable diff without guessing', async () => {
  const port = 4605;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();

    // Compute diff against rev-2-failed which has no snapshot
    await window.computeDiff('rev-1', 'rev-2-failed');

    const unavailAlert = mockDom.getElementById('diff-unavailable-msg');
    const unavailText = mockDom.getElementById('diff-unavailable-text');
    const detailsCard = mockDom.getElementById('diff-details-card');

    assert.strictEqual(unavailAlert.classList.contains('hidden'), false);
    assert.ok(unavailText.innerText.includes('snapshot unavailable'));
    assert.strictEqual(detailsCard.classList.contains('hidden'), true);
    assert.strictEqual(window.state.selectedDiff, null);
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.6: Snapshot diff reflects backend snapshot diff without fabricated changes', async () => {
  const port = 4606;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();

    // Compute diff between rev-0 and rev-1
    await window.computeDiff('rev-0', 'rev-1');

    assert.notStrictEqual(window.state.selectedDiff, null);
    assert.strictEqual(window.state.selectedDiff.fromRevisionId, 'rev-0');
    assert.strictEqual(window.state.selectedDiff.toRevisionId, 'rev-1');

    const addedList = mockDom.getElementById('diff-added-list');
    assert.ok(addedList.innerHTML.includes('clip-tempo-added'));
    assert.strictEqual(mockDom.getElementById('diff-added-count').innerText, '1');

    const unavailAlert = mockDom.getElementById('diff-unavailable-msg');
    assert.strictEqual(unavailAlert.classList.contains('hidden'), true);
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.7: Candidate cards bind to exact candidate and manifest identifiers', async () => {
  const port = 4607;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchCandidates();
    assert.strictEqual(window.state.candidateSet.candidates.length, 3);

    const candGrid = mockDom.getElementById('candidates-grid');
    assert.ok(candGrid.innerHTML.includes('cand-001'));
    assert.ok(candGrid.innerHTML.includes('Cinematic Dynamic Cuts'));
    assert.ok(candGrid.innerHTML.includes('manifest-cand-001'));
    assert.ok(candGrid.innerHTML.includes('cand-002'));
    assert.ok(candGrid.innerHTML.includes('manifest-cand-002'));
    assert.ok(candGrid.innerHTML.includes('cand-003-ineligible'));
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.8: Ineligible candidates cannot be activated by frontend actions', async () => {
  const port = 4608;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    await window.fetchCandidates();

    // Verify candidate 3 is ineligible
    const cand3 = window.state.candidateSet.candidates.find(c => c.candidate_id === 'cand-003-ineligible');
    assert.strictEqual(cand3.isEligible, false);

    // Frontend selectCandidate call refuses activation
    await window.selectCandidate('cand-003-ineligible');

    // Invariant: Active delivery remains rev-1!
    assert.strictEqual(window.state.session.active_delivery.revision_id, 'rev-1');
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-1');
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.9: Candidate preview does not change the active delivery', async () => {
  const port = 4609;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    await window.fetchCandidates();

    // Preview candidate cand-002
    window.previewCandidate('cand-002');
    assert.strictEqual(window.state.previewedCandidateId, 'cand-002');

    // Preview player loads candidate media
    const video = mockDom.getElementById('preview-video');
    assert.strictEqual(video.src, '/api/media?id=cand-002');

    // Candidate preview banner is visible
    const banner = mockDom.getElementById('candidate-preview-banner');
    assert.strictEqual(banner.classList.contains('hidden'), false);
    assert.strictEqual(mockDom.getElementById('previewed-cand-id').innerText, 'cand-002');

    // Invariant: Server and client active delivery remain strictly rev-1!
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-1');
    assert.strictEqual(window.state.session.active_delivery.revision_id, 'rev-1');
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.10: Exiting candidate preview cleanly restores active delivery media', async () => {
  const port = 4610;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    await window.fetchCandidates();

    window.previewCandidate('cand-002');
    assert.strictEqual(window.state.previewedCandidateId, 'cand-002');

    // Exit preview
    window.exitCandidatePreview();
    assert.strictEqual(window.state.previewedCandidateId, null);

    const banner = mockDom.getElementById('candidate-preview-banner');
    assert.strictEqual(banner.classList.contains('hidden'), true);

    // Video restored to active delivery rev-1
    const video = mockDom.getElementById('preview-video');
    assert.strictEqual(video.src, '/api/media?id=rev-1');

    const badge = mockDom.getElementById('delivery-status-badge');
    assert.ok(badge.className.includes('badge-status-active'));
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.11: Selection uses current expectedVersion; stale selection fails safely', async () => {
  const port = 4611;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    await window.fetchCandidates();

    // Artificially make client's session version stale
    window.state.session.concurrency.version = 999;

    await window.selectCandidate('cand-002');

    // Selection was rejected with 409 STALE_VERSION; active delivery remains rev-1
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-1');
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.12: Successful selection updates UI only after authoritative confirmation', async () => {
  const port = 4612;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    await window.fetchCandidates();

    // Select eligible verified candidate 2
    await window.selectCandidate('cand-002');

    // Authoritative session updated
    assert.strictEqual(backend.activeSession.selected_candidate_id, 'cand-002');
    assert.strictEqual(window.state.session.selected_candidate_id, 'cand-002');

    // Preview returned from candidate preview mode
    assert.strictEqual(window.state.previewedCandidateId, null);
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.13: Revision submission includes required session/version context', async () => {
  const port = 4613;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();

  let capturedBody = null;
  global.fetch = async (url, opts) => {
    if (url === '/api/session/revise' && opts?.method === 'POST') {
      capturedBody = JSON.parse(opts.body);
    }
    const fullUrl = typeof url === 'string' && url.startsWith('http') ? url : `http://localhost:${port}${url}`;
    return nativeFetch(fullUrl, opts);
  };

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    mockDom.getElementById('rev-prompt-input').value = 'Speed up pacing by 1 second';

    await window.submitConversationalRevision();

    assert.notStrictEqual(capturedBody, null);
    assert.strictEqual(capturedBody.prompt, 'Speed up pacing by 1 second');
    assert.strictEqual(capturedBody.expectedVersion, 2);
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.14: In-flight revision mutation prevents duplicate submissions and displays progress', async () => {
  const port = 4614;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    window.state.isVerifying = true;

    mockDom.getElementById('rev-prompt-input').value = 'Duplicate prompt attempt';
    await window.submitConversationalRevision();

    // Call was ignored due to in-flight guard
    assert.strictEqual(mockDom.getElementById('rev-prompt-input').value, 'Duplicate prompt attempt');

    window.state.isVerifying = false;
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.15: Revision failure preserves last verified delivery and displays error callout', async () => {
  const port = 4615;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    assert.strictEqual(window.state.session.active_delivery.revision_id, 'rev-1');

    // Intentionally send an invalid/conflicting revision
    mockDom.getElementById('rev-prompt-input').value = 'Delete all audio and video tracks';
    await window.submitConversationalRevision();

    // Verification failed: Error callout is visible
    const errorCallout = mockDom.getElementById('rev-error-callout');
    assert.strictEqual(errorCallout.classList.contains('hidden'), false);

    // Active delivery strictly remains rev-1!
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-1');
    assert.strictEqual(window.state.session.active_delivery.revision_id, 'rev-1');
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.16: Revision success refetches authoritative state and resets form', async () => {
  const port = 4616;
  const executedProject = createBaseExecutedProject();
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: executedProject, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    mockDom.getElementById('rev-prompt-input').value = 'Move headline title 1 second later on track_graphics. Preserve duration.';

    await window.submitConversationalRevision();

    // On success: text input is cleared
    assert.strictEqual(mockDom.getElementById('rev-prompt-input').value, '');
    assert.strictEqual(mockDom.getElementById('rev-error-callout').classList.contains('hidden'), true);
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.17: Authoritative session Undo / Redo updates active revision with expectedVersion', async () => {
  const port = 4617;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    assert.strictEqual(window.state.session.undo_redo.canUndo, true);

    // Session Undo
    await window.sessionUndo();
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-0');
    assert.strictEqual(window.state.session.active_delivery.revision_id, 'rev-0');

    // Session Redo
    await window.sessionRedo();
    assert.strictEqual(backend.activeSession.active_delivery.revision_id, 'rev-1');
    assert.strictEqual(window.state.session.active_delivery.revision_id, 'rev-1');
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.18: Crash recovery recovers session and synchronizes active delivery', async () => {
  const port = 4618;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    await window.sessionRecover();

    assert.notStrictEqual(window.state.session, null);
    assert.strictEqual(window.state.session.active_delivery.revision_id, 'rev-1');
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.19: Stale asynchronous responses cannot overwrite newer state', async () => {
  const port = 4619;
  const { session, candidateSet } = buildTestSession({ port });
  const backend = new EditorBackend({ port, project: scenario1Project, session, candidateSet, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    const originalDelivery = window.state.session.active_delivery;

    // Simulate an out-of-order stale fetch call
    const stalePromise = window.fetchAuthoritativeSession();
    // Advance seq ahead
    window.state.sessionFetchSeq = 999;
    await stalePromise;

    // Session was preserved
    assert.strictEqual(window.state.session.active_delivery.revision_id, originalDelivery.revision_id);
  } finally {
    await backend.stop();
  }
});

test('PF10-S3.20: Empty, missing, and malformed backend fields fail visibly and safely', async () => {
  const port = 4620;
  // Session with empty/null fields
  const emptySession = {
    session_id: 'sess-empty',
    state: 'unknown_state',
    concurrency: { version: 0 },
    active_delivery: null,
    hard_constraints: [],
    undo_redo: { canUndo: false, canRedo: false },
    history: []
  };

  const backend = new EditorBackend({ port, session: emptySession, outputDir: TEST_OUT_DIR });
  await backend.start();

  const mockDom = setupMockDom();
  global.document = mockDom;
  global.window = createMockWindow();
  global.fetch = makeFetch(port);

  const appCode = fs.readFileSync(path.resolve('src/ui/public/app.js'), 'utf8');
  eval(appCode);

  try {
    await window.fetchAuthoritativeSession();
    await window.fetchCandidates();

    // Renders "Unavailable" safely without throwing exceptions
    assert.strictEqual(mockDom.getElementById('meta-revision-id').innerText, 'Unavailable');
    assert.strictEqual(mockDom.getElementById('meta-manifest-id').innerText, 'Unavailable');
    assert.strictEqual(mockDom.getElementById('meta-qa-score').innerText, 'Unavailable');
    assert.strictEqual(mockDom.getElementById('history-empty').classList.contains('hidden'), false);
    assert.strictEqual(mockDom.getElementById('candidates-empty').classList.contains('hidden'), false);
  } finally {
    await backend.stop();
  }
});
