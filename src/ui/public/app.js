/**
 * EME Control Surface — Client Application (Milestone TL-01 / Phase 18)
 *
 * Implements:
 * - CapCut-grade multitrack NLE timeline with frame-accurate playhead scrubbing
 * - Magnetic snapping (clip in/out boundaries & playhead)
 * - Non-destructive trimming (in/out handles), ripple trim, slip, and slide
 * - Split at playhead (Cmd+B / B) & Ripple Delete
 * - Audio waveform visualization per track lane
 * - Track controls: Mute, Solo, and Lock with mutation guards
 * - Color Grading Inspector Panel with live Linear Exposure, Temp/Tint WB,
 *   Primary LGGO, 3D LUT try-on selector, and Vectorscope Skin Protection
 * - CapCut macOS draft_info.json rational microsecond importer
 * - Comprehensive keyboard shortcuts and Undo/Redo state management
 */

const state = {
  project: null,
  activePath: 'artifacts/himachal-001-eme-project.json',
  selectedClipId: null,
  currentTick: 0,
  zoom: 1.0,
  isPlaying: false,
  playInterval: null,
  activeTool: 'select', // 'select' | 'blade' | 'split' | 'ripple' | 'slip' | 'slide'
  isMagnet: true,
  isLinkage: true,
  isSnapping: true,
  safeAreaEnabled: false,
  previewRatio: '16:9',
  previewScale: 'fit',
  currentGrade: createDefaultGrade(),
  persistedGrade: null,
  colorDraft: {
    active: false,
    version: 0,
    pendingRequestId: null,
    grade: null,
    cachedBaseFrameUri: null,
    cachedGradedUri: null,
    isComparing: false,
    bypassMode: false,
    abortController: null,
    debounceTimer: null
  },
  waveformCache: new Map(),
  dragState: null,
  // Phase PF-10 Stage 2: Authoritative Session & Delivery State
  session: null,
  sessionHistory: [],
  inspectedRevisionId: null,
  inspectedProject: null,
  isVerifying: false,
  lastRevisionError: null,
  volume: 1.0,
  isMuted: false,
  sessionFetchSeq: 0,
  // Phase PF-10 Stage 3: Multi-Revision DAG, Candidates, & AI Revision State
  candidateSet: null,
  previewedCandidateId: null,
  selectedDiff: null,
  diffFromRev: null,
  diffToRev: null,
  isDiffLoading: false,
  timelineFetchSeq: 0
};
window.state = state;

// --- Stage 18.1 Unified Coordinate System & Non-Destructive Timeline Surface ---
const TIMELINE_BASE_PPS = 100.0; // 100 pixels per second at 1.0x zoom (matches TimelineAdapter)

function getPixelsPerSecond() {
  return TIMELINE_BASE_PPS * (state.zoom || 1.0);
}

function getPixelsPerTick() {
  return getPixelsPerSecond() / 120000;
}

function tickToPixel(tick) {
  return Math.round(tick * getPixelsPerTick());
}

function pixelToTick(px) {
  return Math.max(0, Math.round(px / getPixelsPerTick()));
}

function computeMagneticSnapForUI(candidateTick, project, thresholdTicks = 16000, playheadTick = null) {
  let closestDist = Infinity;
  let snappedTick = candidateTick;
  let snapTarget = null;

  const dStart = Math.abs(candidateTick - 0);
  if (dStart <= thresholdTicks) {
    closestDist = dStart;
    snappedTick = 0;
    snapTarget = 'Timeline Start';
  }

  if (playheadTick !== null && playheadTick !== undefined) {
    const dPlayhead = Math.abs(candidateTick - playheadTick);
    if (dPlayhead <= thresholdTicks && dPlayhead < closestDist) {
      closestDist = dPlayhead;
      snappedTick = playheadTick;
      snapTarget = 'Playhead';
    }
  }

  const clips = project?.clips || [];
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const inDist = Math.abs(candidateTick - c.startTick);
    if (inDist <= thresholdTicks && inDist < closestDist) {
      closestDist = inDist;
      snappedTick = c.startTick;
      snapTarget = `Clip "${c.id}" In`;
    }
    const outTick = c.startTick + c.durationTicks;
    const outDist = Math.abs(candidateTick - outTick);
    if (outDist <= thresholdTicks && outDist < closestDist) {
      closestDist = outDist;
      snappedTick = outTick;
      snapTarget = `Clip "${c.id}" Out`;
    }
  }

  return {
    snappedTick,
    isSnapped: closestDist <= thresholdTicks,
    snapTarget,
    deltaTicks: snappedTick - candidateTick
  };
}

function createDefaultGrade() {
  return {
    id: `grade_${Date.now()}`,
    schemaVersion: "1.0.0",
    revision: 0,
    enabled: true,
    name: "Interactive Grade",
    colorSpaces: {
      input: "rec709",
      working: "rec709",
      lutDomain: "rec709",
      output: "rec709"
    },
    exposure: 0.0,
    whiteBalance: {
      temperature: 0.0,
      tint: 0.0
    },
    primary: {
      lift: [0.0, 0.0, 0.0],
      gamma: [1.0, 1.0, 1.0],
      gain: [1.0, 1.0, 1.0],
      offset: [0.0, 0.0, 0.0]
    },
    curves: {
      master: [{ x: 0.0, y: 0.0, rightControl: { x: 0.333, y: 0.333 } }, { x: 1.0, y: 1.0, leftControl: { x: 0.667, y: 0.667 } }],
      red: [{ x: 0.0, y: 0.0, rightControl: { x: 0.333, y: 0.333 } }, { x: 1.0, y: 1.0, leftControl: { x: 0.667, y: 0.667 } }],
      green: [{ x: 0.0, y: 0.0, rightControl: { x: 0.333, y: 0.333 } }, { x: 1.0, y: 1.0, leftControl: { x: 0.667, y: 0.667 } }],
      blue: [{ x: 0.0, y: 0.0, rightControl: { x: 0.333, y: 0.333 } }, { x: 1.0, y: 1.0, leftControl: { x: 0.667, y: 0.667 } }],
      luma: [{ x: 0.0, y: 0.0, rightControl: { x: 0.333, y: 0.333 } }, { x: 1.0, y: 1.0, leftControl: { x: 0.667, y: 0.667 } }]
    },
    hsl: {
      red: { hue: 0, saturation: 0, lightness: 0 },
      orange: { hue: 0, saturation: 0, lightness: 0 },
      yellow: { hue: 0, saturation: 0, lightness: 0 },
      green: { hue: 0, saturation: 0, lightness: 0 },
      cyan: { hue: 0, saturation: 0, lightness: 0 },
      blue: { hue: 0, saturation: 0, lightness: 0 },
      purple: { hue: 0, saturation: 0, lightness: 0 },
      magenta: { hue: 0, saturation: 0, lightness: 0 }
    },
    lut: {
      enabled: false,
      path: "",
      intensity: 1.0,
      interpolation: "tetrahedral"
    },
    skinProtection: {
      enabled: true,
      weight: 0.85,
      tolerance: 0.3
    }
  };
}

const dom = {
  projectTitle: document.getElementById('project-title'),
  revisionBadge: document.getElementById('revision-badge'),
  projectPresetSelect: document.getElementById('project-preset-select'),
  projectPathInput: document.getElementById('project-path-input'),
  btnLoad: document.getElementById('btn-load'),
  btnSave: document.getElementById('btn-save'),
  btnUndo: document.getElementById('btn-undo'),
  btnRedo: document.getElementById('btn-redo'),
  btnCapcutModal: document.getElementById('btn-capcut-modal'),
  btnQuickCapcut: document.getElementById('btn-quick-capcut'),
  btnQa: document.getElementById('btn-qa'),
  btnRender: document.getElementById('btn-render'),
  assetsList: document.getElementById('assets-list'),
  tracksList: document.getElementById('tracks-list'),
  assetCount: document.getElementById('asset-count'),
  trackCount: document.getElementById('track-count'),
  previewStage: document.getElementById('preview-stage'),
  canvasDim: document.getElementById('canvas-dim'),
  timebaseFps: document.getElementById('timebase-fps'),
  smpteTimecode: document.getElementById('smpte-timecode'),
  currentTick: document.getElementById('current-tick'),
  transportSecLabel: document.getElementById('transport-sec-label'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  btnJumpStart: document.getElementById('btn-jump-start'),
  btnPrevFrame: document.getElementById('btn-prev-frame'),
  btnNextFrame: document.getElementById('btn-next-frame'),
  btnJumpEnd: document.getElementById('btn-jump-end'),
  inspectorContent: document.getElementById('inspector-content'),
  qaScoreBadge: document.getElementById('qa-score-badge'),
  qaDetails: document.getElementById('qa-details'),
  timelineZoom: document.getElementById('timeline-zoom'),
  zoomLevelLabel: document.getElementById('zoom-level-label'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomFit: document.getElementById('btn-zoom-fit'),
  timelineLanes: document.getElementById('timeline-track-lanes'),
  timelinePlayhead: document.getElementById('timeline-playhead'),
  timelineRuler: document.getElementById('timeline-ruler'),
  timelineSnapGuide: document.getElementById('timeline-snap-guide'),
  trackHeaderList: document.getElementById('track-header-list'),
  playheadSec: document.getElementById('playhead-sec'),
  // Tools
  toolSelect: document.getElementById('tool-select'),
  toolBlade: document.getElementById('tool-blade'),
  toolSplit: document.getElementById('tool-split'),
  toolDeleteLeft: document.getElementById('tool-delete-left'),
  toolDeleteRight: document.getElementById('tool-delete-right'),
  toolDelete: document.getElementById('tool-delete'),
  toolFreeze: document.getElementById('tool-freeze'),
  toolReverse: document.getElementById('tool-reverse'),
  toolCrop: document.getElementById('tool-crop'),
  toolRecord: document.getElementById('tool-record'),
  toggleMagnet: document.getElementById('toggle-magnet'),
  toggleLinkage: document.getElementById('toggle-linkage'),
  toggleSnapping: document.getElementById('toggle-snapping'),
  // Preview Controls
  previewRatioSelect: document.getElementById('preview-ratio-select'),
  previewScaleSelect: document.getElementById('preview-scale-select'),
  btnToggleSafeArea: document.getElementById('btn-toggle-safe-area'),
  // Phase PF-10 Stage 2: Delivery Verification Elements
  deliveryVerificationBar: document.getElementById('delivery-verification-bar'),
  deliveryStatusBadge: document.getElementById('delivery-status-badge'),
  deliveryStatusIcon: document.getElementById('delivery-status-icon'),
  deliveryStatusText: document.getElementById('delivery-status-text'),
  metaRevisionId: document.getElementById('meta-revision-id'),
  metaManifestId: document.getElementById('meta-manifest-id'),
  metaSha256Container: document.getElementById('meta-sha256-container'),
  metaSha256Short: document.getElementById('meta-sha256-short'),
  btnCopySha256: document.getElementById('btn-copy-sha256'),
  metaResolution: document.getElementById('meta-resolution'),
  metaFps: document.getElementById('meta-fps'),
  metaDuration: document.getElementById('meta-duration'),
  metaQaScore: document.getElementById('meta-qa-score'),
  inspectionBanner: document.getElementById('inspection-banner'),
  inspectedRevId: document.getElementById('inspected-rev-id'),
  btnExitInspection: document.getElementById('btn-exit-inspection'),
  deliveryAlert: document.getElementById('delivery-alert'),
  deliveryAlertIcon: document.getElementById('delivery-alert-icon'),
  deliveryAlertMsg: document.getElementById('delivery-alert-msg'),
  // Stage 2 Preview Video & Overlays
  previewVideo: document.getElementById('preview-video'),
  previewOverlayLoading: document.getElementById('preview-overlay-loading'),
  previewOverlayUnavailable: document.getElementById('preview-overlay-unavailable'),
  previewOverlayError: document.getElementById('preview-overlay-error'),
  previewErrorMsg: document.getElementById('preview-error-msg'),
  previewOverlayStale: document.getElementById('preview-overlay-stale'),
  previewOverlays: document.getElementById('preview-overlays'),
  btnVolumeMute: document.getElementById('btn-volume-mute'),
  volumeSlider: document.getElementById('volume-slider'),
  // Color controls
  cgTargetName: document.getElementById('cg-target-name'),
  btnAutoTone: document.getElementById('btn-auto-tone'),
  cgExposure: document.getElementById('cg-exposure'),
  cgExpVal: document.getElementById('cg-exp-val'),
  cgTemperature: document.getElementById('cg-temperature'),
  cgTempVal: document.getElementById('cg-temp-val'),
  cgTint: document.getElementById('cg-tint'),
  cgTintVal: document.getElementById('cg-tint-val'),
  cgLift: document.getElementById('cg-lift'),
  cgLiftVal: document.getElementById('cg-lift-val'),
  cgGamma: document.getElementById('cg-gamma'),
  cgGammaVal: document.getElementById('cg-gamma-val'),
  cgGain: document.getElementById('cg-gain'),
  cgGainVal: document.getElementById('cg-gain-val'),
  cgLutSelect: document.getElementById('cg-lut-select'),
  cgLutIntensity: document.getElementById('cg-lut-intensity'),
  cgLutIntensityVal: document.getElementById('cg-lut-intensity-val'),
  cgSkinProtectToggle: document.getElementById('cg-skin-protect-toggle'),
  cgSkinWeight: document.getElementById('cg-skin-weight'),
  cgSkinWeightVal: document.getElementById('cg-skin-weight-val'),
  btnApplyColor: document.getElementById('btn-apply-color'),
  btnCancelColor: document.getElementById('btn-cancel-color'),
  cgDraftBadge: document.getElementById('cg-draft-badge'),
  cgDraftBadgeText: document.getElementById('cg-draft-badge-text'),
  cgBtnCompare: document.getElementById('cg-btn-compare'),
  cgToggleCompare: document.getElementById('cg-toggle-compare'),
  colorPreviewCanvas: document.getElementById('color-preview-canvas'),
  compareIndicatorOverlay: document.getElementById('compare-indicator-overlay'),
  cgHslRed: document.getElementById('cg-hsl-red'),
  cgHslRedVal: document.getElementById('cg-hsl-red-val'),
  cgHslYellow: document.getElementById('cg-hsl-yellow'),
  cgHslYellowVal: document.getElementById('cg-hsl-yellow-val'),
  cgHslGreen: document.getElementById('cg-hsl-green'),
  cgHslGreenVal: document.getElementById('cg-hsl-green-val'),
  cgHslCyan: document.getElementById('cg-hsl-cyan'),
  cgHslCyanVal: document.getElementById('cg-hsl-cyan-val'),
  cgHslBlue: document.getElementById('cg-hsl-blue'),
  cgHslBlueVal: document.getElementById('cg-hsl-blue-val'),
  // CapCut modal
  modalCapcut: document.getElementById('modal-capcut'),
  btnCloseCapcutModal: document.getElementById('btn-close-capcut-modal'),
  btnCancelCapcut: document.getElementById('btn-cancel-capcut'),
  btnImportCapcutSubmit: document.getElementById('btn-import-capcut-submit'),
  btnLoadSampleCapcut: document.getElementById('btn-load-sample-capcut'),
  capcutJsonInput: document.getElementById('capcut-json-input'),
  // Phase PF-10 Stage 3: Candidate Preview Banner
  candidatePreviewBanner: document.getElementById('candidate-preview-banner'),
  previewedCandId: document.getElementById('previewed-cand-id'),
  btnActivatePreviewedCand: document.getElementById('btn-activate-previewed-cand'),
  btnExitCandPreview: document.getElementById('btn-exit-cand-preview'),
  // Phase PF-10 Stage 3: History DAG & Diff
  btnRefreshHistory: document.getElementById('btn-refresh-history'),
  historyDagContainer: document.getElementById('history-dag-container'),
  historyLoading: document.getElementById('history-loading'),
  historyEmpty: document.getElementById('history-empty'),
  historyError: document.getElementById('history-error'),
  historyErrorMsg: document.getElementById('history-error-msg'),
  historyNodesList: document.getElementById('history-nodes-list'),
  diffFromSelect: document.getElementById('diff-from-select'),
  diffToSelect: document.getElementById('diff-to-select'),
  btnComputeDiff: document.getElementById('btn-compute-diff'),
  diffStatusIndicator: document.getElementById('diff-status-indicator'),
  diffUnavailableMsg: document.getElementById('diff-unavailable-msg'),
  diffUnavailableText: document.getElementById('diff-unavailable-text'),
  diffDetailsCard: document.getElementById('diff-details-card'),
  diffPlanHash: document.getElementById('diff-plan-hash'),
  diffQaScore: document.getElementById('diff-qa-score'),
  diffOpsCount: document.getElementById('diff-ops-count'),
  diffDurationDelta: document.getElementById('diff-duration-delta'),
  diffAddedCount: document.getElementById('diff-added-count'),
  diffAddedList: document.getElementById('diff-added-list'),
  diffRemovedCount: document.getElementById('diff-removed-count'),
  diffRemovedList: document.getElementById('diff-removed-list'),
  diffModifiedCount: document.getElementById('diff-modified-count'),
  diffModifiedList: document.getElementById('diff-modified-list'),
  // Phase PF-10 Stage 3: Candidate Comparison
  btnRefreshCandidates: document.getElementById('btn-refresh-candidates'),
  candSetId: document.getElementById('cand-set-id'),
  candSelectedId: document.getElementById('cand-selected-id'),
  candCountBadge: document.getElementById('cand-count-badge'),
  candidatesLoading: document.getElementById('candidates-loading'),
  candidatesEmpty: document.getElementById('candidates-empty'),
  candidatesError: document.getElementById('candidates-error'),
  candidatesErrorMsg: document.getElementById('candidates-error-msg'),
  candidatesGrid: document.getElementById('candidates-grid'),
  // Phase PF-10 Stage 3: Conversational Revision & History Controls
  revSessionId: document.getElementById('rev-session-id'),
  revActiveRevision: document.getElementById('rev-active-revision'),
  revConcurrencyVersion: document.getElementById('rev-concurrency-version'),
  revSessionState: document.getElementById('rev-session-state'),
  revHardConstraintsList: document.getElementById('rev-hard-constraints-list'),
  revPromptInput: document.getElementById('rev-prompt-input'),
  btnClearRevision: document.getElementById('btn-clear-revision'),
  btnSubmitRevision: document.getElementById('btn-submit-revision'),
  revInFlight: document.getElementById('rev-in-flight'),
  revErrorCallout: document.getElementById('rev-error-callout'),
  revErrorMsg: document.getElementById('rev-error-msg'),
  btnSessionUndo: document.getElementById('btn-session-undo'),
  btnSessionRedo: document.getElementById('btn-session-redo'),
  btnSessionRecover: document.getElementById('btn-session-recover')
};

// Event Listeners
if (dom.projectPresetSelect) {
  dom.projectPresetSelect.addEventListener('change', (e) => {
    dom.projectPathInput.value = e.target.value;
    loadProject(e.target.value);
  });
}
dom.btnLoad.addEventListener('click', () => loadProject(dom.projectPathInput.value));
dom.btnSave.addEventListener('click', saveProject);
dom.btnUndo.addEventListener('click', undo);
dom.btnRedo.addEventListener('click', redo);
dom.btnQa.addEventListener('click', runQaAudit);
dom.btnRender.addEventListener('click', renderMp4);

// Transport buttons
dom.btnPlayPause.addEventListener('click', togglePlayback);
dom.btnJumpStart.addEventListener('click', () => setPlayheadTick(0));
dom.btnPrevFrame.addEventListener('click', () => stepFrame(-1));
dom.btnNextFrame.addEventListener('click', () => stepFrame(1));
dom.btnJumpEnd.addEventListener('click', () => {
  if (state.project) setPlayheadTick(state.project.timebase.durationTicks);
});

function adjustScrollForZoom(oldZoom, newZoom) {
  if (!oldZoom || oldZoom <= 0 || !dom.timelineTracksArea) return;
  const ratio = newZoom / oldZoom;
  const currentScroll = dom.timelineTracksArea.scrollLeft;
  const areaWidth = dom.timelineTracksArea.clientWidth || 800;
  const centerPx = currentScroll + (areaWidth / 2);
  const newCenterPx = centerPx * ratio;
  dom.timelineTracksArea.scrollLeft = Math.max(0, Math.round(newCenterPx - (areaWidth / 2)));
}

// Zoom
dom.timelineZoom.addEventListener('input', (e) => {
  const oldZoom = state.zoom;
  state.zoom = parseFloat(e.target.value);
  dom.zoomLevelLabel.innerText = `${state.zoom.toFixed(1)}x`;
  adjustScrollForZoom(oldZoom, state.zoom);
  renderTimeline();
});
dom.btnZoomIn.addEventListener('click', () => {
  const oldZoom = state.zoom;
  state.zoom = Math.min(8.0, +(state.zoom + 0.2).toFixed(2));
  dom.timelineZoom.value = state.zoom;
  dom.zoomLevelLabel.innerText = `${state.zoom.toFixed(1)}x`;
  adjustScrollForZoom(oldZoom, state.zoom);
  renderTimeline();
});
dom.btnZoomOut.addEventListener('click', () => {
  const oldZoom = state.zoom;
  state.zoom = Math.max(0.05, +(state.zoom - 0.2).toFixed(2));
  dom.timelineZoom.value = state.zoom;
  dom.zoomLevelLabel.innerText = `${state.zoom.toFixed(1)}x`;
  adjustScrollForZoom(oldZoom, state.zoom);
  renderTimeline();
});
if (dom.btnZoomFit) dom.btnZoomFit.addEventListener('click', zoomToFit);

// Tools
function setActiveTool(tool) {
  state.activeTool = tool;
  const toolBtns = [dom.toolSelect, dom.toolBlade, dom.toolSplit].filter(Boolean);
  toolBtns.forEach(b => b.classList.remove('active'));
  if (tool === 'select' && dom.toolSelect) dom.toolSelect.classList.add('active');
  if (tool === 'blade' && dom.toolBlade) dom.toolBlade.classList.add('active');
  if (tool === 'split' && dom.toolSplit) dom.toolSplit.classList.add('active');

  if (tool === 'blade') {
    dom.timelineLanes.classList.add('blade-mode');
  } else {
    dom.timelineLanes.classList.remove('blade-mode');
  }
  notify(`Active tool: ${tool.toUpperCase()}`, 'info');
}

if (dom.toolSelect) dom.toolSelect.addEventListener('click', () => setActiveTool('select'));
if (dom.toolBlade) dom.toolBlade.addEventListener('click', () => setActiveTool('blade'));
if (dom.toolSplit) dom.toolSplit.addEventListener('click', splitAtPlayhead);
if (dom.toolDeleteLeft) dom.toolDeleteLeft.addEventListener('click', deleteLeft);
if (dom.toolDeleteRight) dom.toolDeleteRight.addEventListener('click', deleteRight);
if (dom.toolDelete) dom.toolDelete.addEventListener('click', deleteSelectedClip);
if (dom.toolFreeze) dom.toolFreeze.addEventListener('click', freezeFrame);
if (dom.toolReverse) dom.toolReverse.addEventListener('click', reverseClip);
if (dom.toolCrop) dom.toolCrop.addEventListener('click', cropClip);
if (dom.toolRecord) dom.toolRecord.addEventListener('click', recordVoiceover);

if (dom.toggleMagnet) dom.toggleMagnet.addEventListener('click', () => {
  state.isMagnet = !state.isMagnet;
  dom.toggleMagnet.classList.toggle('active', state.isMagnet);
  notify(`Main Track Magnet: ${state.isMagnet ? 'ENABLED' : 'DISABLED'}`, 'info');
});

if (dom.toggleLinkage) dom.toggleLinkage.addEventListener('click', () => {
  state.isLinkage = !state.isLinkage;
  dom.toggleLinkage.classList.toggle('active', state.isLinkage);
  notify(`Auto-Ripple Linkage: ${state.isLinkage ? 'ENABLED' : 'DISABLED'}`, 'info');
});

if (dom.toggleSnapping) dom.toggleSnapping.addEventListener('click', () => {
  state.isSnapping = !state.isSnapping;
  dom.toggleSnapping.classList.toggle('active', state.isSnapping);
  notify(`Magnetic Snapping: ${state.isSnapping ? 'ENABLED' : 'DISABLED'}`, 'info');
});

if (dom.previewRatioSelect) dom.previewRatioSelect.addEventListener('change', (e) => {
  state.previewRatio = e.target.value;
  renderPreview();
  notify(`Aspect Ratio: ${state.previewRatio}`, 'info');
});

if (dom.previewScaleSelect) dom.previewScaleSelect.addEventListener('change', (e) => {
  state.previewScale = e.target.value;
  renderPreview();
  notify(`Preview Scaling: ${state.previewScale}`, 'info');
});

if (dom.btnToggleSafeArea) dom.btnToggleSafeArea.addEventListener('click', () => {
  state.safeAreaEnabled = !state.safeAreaEnabled;
  dom.btnToggleSafeArea.classList.toggle('active', state.safeAreaEnabled);
  renderPreview();
  notify(`Safe Area Guides: ${state.safeAreaEnabled ? 'ON' : 'OFF'}`, 'info');
});

// CapCut Top Creative Navigation Tabs
document.querySelectorAll('.capcut-nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.capcut-nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const navKey = tab.dataset.nav;
    notify(`CapCut Library: ${navKey.toUpperCase()}`, 'info');
    if (navKey === 'adjust') {
      const colorTab = document.querySelector('[data-tab="color"]');
      if (colorTab) colorTab.click();
    } else if (navKey === 'media') {
      const mediaTab = document.getElementById('tab-assets');
      if (mediaTab) mediaTab.click();
    }
  });
});

// Inspector Tabs
document.querySelectorAll('.insp-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('.insp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.insp-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    const targetPane = document.getElementById(`pane-${tab.dataset.tab}`);
    if (targetPane) targetPane.classList.add('active');
  });
});

// Assets / Tracks Panel Tabs
document.getElementById('tab-assets').addEventListener('click', () => {
  document.getElementById('tab-assets').classList.add('active');
  document.getElementById('tab-tracks').classList.remove('active');
  document.getElementById('assets-view').classList.add('active');
  document.getElementById('tracks-view').classList.remove('active');
});
document.getElementById('tab-tracks').addEventListener('click', () => {
  document.getElementById('tab-tracks').classList.add('active');
  document.getElementById('tab-assets').classList.remove('active');
  document.getElementById('tracks-view').classList.add('active');
  document.getElementById('assets-view').classList.remove('active');
});

// Color Grade Controls & Stage 2C Visual Surface Bindings
function ensureDraftGradeInitialized() {
  if (!state.colorDraft.grade) {
    state.colorDraft.grade = structuredClone(state.currentGrade || createDefaultGrade());
  }
  return state.colorDraft.grade;
}

function onColorParamChanged() {
  ensureDraftGradeInitialized();
  state.colorDraft.active = true;
  state.colorDraft.version++;

  if (dom.cgDraftBadge) {
    dom.cgDraftBadge.classList.remove('hidden');
    if (dom.cgDraftBadgeText) {
      dom.cgDraftBadgeText.innerText = `DRAFT (v${state.colorDraft.version}) — UNCOMMITTED`;
    }
  }

  scheduleLiveColorPreview();
}

dom.cgExposure.addEventListener('input', (e) => {
  const g = ensureDraftGradeInitialized();
  g.exposure = parseFloat(e.target.value);
  dom.cgExpVal.innerText = `${g.exposure > 0 ? '+' : ''}${g.exposure.toFixed(2)} EV`;
  onColorParamChanged();
});

dom.cgTemperature.addEventListener('input', (e) => {
  const g = ensureDraftGradeInitialized();
  const val = parseInt(e.target.value, 10);
  g.whiteBalance.temperature = val / 100.0;
  dom.cgTempVal.innerText = `${val > 0 ? '+' : ''}${val}`;
  onColorParamChanged();
});

dom.cgTint.addEventListener('input', (e) => {
  const g = ensureDraftGradeInitialized();
  const val = parseInt(e.target.value, 10);
  g.whiteBalance.tint = val / 100.0;
  dom.cgTintVal.innerText = `${val > 0 ? '+' : ''}${val}`;
  onColorParamChanged();
});

dom.cgLift.addEventListener('input', (e) => {
  const g = ensureDraftGradeInitialized();
  const val = parseFloat(e.target.value);
  g.primary.lift = [val, val, val];
  dom.cgLiftVal.innerText = val.toFixed(2);
  onColorParamChanged();
});

dom.cgGamma.addEventListener('input', (e) => {
  const g = ensureDraftGradeInitialized();
  const val = parseFloat(e.target.value);
  g.primary.gamma = [val, val, val];
  dom.cgGammaVal.innerText = val.toFixed(2);
  onColorParamChanged();
});

dom.cgGain.addEventListener('input', (e) => {
  const g = ensureDraftGradeInitialized();
  const val = parseFloat(e.target.value);
  g.primary.gain = [val, val, val];
  dom.cgGainVal.innerText = val.toFixed(2);
  onColorParamChanged();
});

dom.cgLutSelect.addEventListener('change', (e) => {
  const g = ensureDraftGradeInitialized();
  const lutId = e.target.value;
  if (!g.lut) g.lut = { enabled: false, intensity: 1.0, interpolation: 'tetrahedral' };
  g.lut.lutId = lutId || undefined;
  g.lut.enabled = !!lutId;
  onColorParamChanged();
});

dom.cgLutIntensity.addEventListener('input', (e) => {
  const g = ensureDraftGradeInitialized();
  const val = parseFloat(e.target.value);
  if (!g.lut) g.lut = { enabled: true, intensity: val, interpolation: 'tetrahedral' };
  g.lut.intensity = val;
  dom.cgLutIntensityVal.innerText = `${Math.round(val * 100)}%`;
  onColorParamChanged();
});

dom.cgSkinProtectToggle.addEventListener('change', (e) => {
  const g = ensureDraftGradeInitialized();
  if (!g.skinProtection) g.skinProtection = { enabled: false, weight: 0.85 };
  g.skinProtection.enabled = e.target.checked;
  onColorParamChanged();
});

dom.cgSkinWeight.addEventListener('input', (e) => {
  const g = ensureDraftGradeInitialized();
  const val = parseFloat(e.target.value);
  if (!g.skinProtection) g.skinProtection = { enabled: true, weight: val };
  g.skinProtection.weight = val;
  dom.cgSkinWeightVal.innerText = val.toFixed(2);
  onColorParamChanged();
});

// Secondary HSL Sliders
if (dom.cgHslRed) {
  dom.cgHslRed.addEventListener('input', (e) => {
    const g = ensureDraftGradeInitialized();
    if (!g.hsl) g.hsl = {};
    if (!g.hsl.red) g.hsl.red = { hue: 0, saturation: 0, lightness: 0 };
    g.hsl.red.saturation = parseFloat(e.target.value);
    if (dom.cgHslRedVal) dom.cgHslRedVal.innerText = `${Math.round(g.hsl.red.saturation * 100)}%`;
    onColorParamChanged();
  });
}
if (dom.cgHslYellow) {
  dom.cgHslYellow.addEventListener('input', (e) => {
    const g = ensureDraftGradeInitialized();
    if (!g.hsl) g.hsl = {};
    if (!g.hsl.yellow) g.hsl.yellow = { hue: 0, saturation: 0, lightness: 0 };
    g.hsl.yellow.saturation = parseFloat(e.target.value);
    if (dom.cgHslYellowVal) dom.cgHslYellowVal.innerText = `${Math.round(g.hsl.yellow.saturation * 100)}%`;
    onColorParamChanged();
  });
}
if (dom.cgHslGreen) {
  dom.cgHslGreen.addEventListener('input', (e) => {
    const g = ensureDraftGradeInitialized();
    if (!g.hsl) g.hsl = {};
    if (!g.hsl.green) g.hsl.green = { hue: 0, saturation: 0, lightness: 0 };
    g.hsl.green.saturation = parseFloat(e.target.value);
    if (dom.cgHslGreenVal) dom.cgHslGreenVal.innerText = `${Math.round(g.hsl.green.saturation * 100)}%`;
    onColorParamChanged();
  });
}
if (dom.cgHslCyan) {
  dom.cgHslCyan.addEventListener('input', (e) => {
    const g = ensureDraftGradeInitialized();
    if (!g.hsl) g.hsl = {};
    if (!g.hsl.cyan) g.hsl.cyan = { hue: 0, saturation: 0, lightness: 0 };
    g.hsl.cyan.saturation = parseFloat(e.target.value);
    if (dom.cgHslCyanVal) dom.cgHslCyanVal.innerText = `${Math.round(g.hsl.cyan.saturation * 100)}%`;
    onColorParamChanged();
  });
}
if (dom.cgHslBlue) {
  dom.cgHslBlue.addEventListener('input', (e) => {
    const g = ensureDraftGradeInitialized();
    if (!g.hsl) g.hsl = {};
    if (!g.hsl.blue) g.hsl.blue = { hue: 0, saturation: 0, lightness: 0 };
    g.hsl.blue.saturation = parseFloat(e.target.value);
    if (dom.cgHslBlueVal) dom.cgHslBlueVal.innerText = `${Math.round(g.hsl.blue.saturation * 100)}%`;
    onColorParamChanged();
  });
}

// Hold-to-Compare Event Listeners
if (dom.cgBtnCompare) {
  dom.cgBtnCompare.addEventListener('mousedown', (e) => { e.preventDefault(); startHoldCompare(); });
  dom.cgBtnCompare.addEventListener('mouseup', (e) => { e.preventDefault(); endHoldCompare(); });
  dom.cgBtnCompare.addEventListener('mouseleave', () => { endHoldCompare(); });
  dom.cgBtnCompare.addEventListener('touchstart', (e) => { e.preventDefault(); startHoldCompare(); });
  dom.cgBtnCompare.addEventListener('touchend', (e) => { e.preventDefault(); endHoldCompare(); });
  dom.cgBtnCompare.addEventListener('touchcancel', () => { endHoldCompare(); });
}

if (dom.cgToggleCompare) {
  dom.cgToggleCompare.addEventListener('click', toggleCompareMode);
}

// Global Keyboard Hold-to-Compare ('C' key) & Blur Recovery
window.addEventListener('keydown', (e) => {
  if (e.target && (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable)) return;
  if (document.activeElement && (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable)) return;
  if ((e.key === 'c' || e.key === 'C') && !e.repeat && !e.shiftKey && !e.metaKey && !e.ctrlKey && !state.colorDraft.isComparing) {
    // Only engage hold compare if in color mode or color draft is active
    if (state.activeInspectorTab === 'color' || state.colorDraft?.active || (dom.paneColor && dom.paneColor.classList.contains('active'))) {
      startHoldCompare();
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'c' || e.key === 'C') {
    endHoldCompare();
  }
});
window.addEventListener('blur', () => {
  endHoldCompare();
});

dom.btnAutoTone.addEventListener('click', runAutoTrueTone);
dom.btnApplyColor.addEventListener('click', saveColorGrade);
if (dom.btnCancelColor) dom.btnCancelColor.addEventListener('click', discardColorDraft);

// CapCut Modal
dom.btnCapcutModal.addEventListener('click', () => dom.modalCapcut.classList.remove('hidden'));
dom.btnQuickCapcut.addEventListener('click', () => dom.modalCapcut.classList.remove('hidden'));
dom.btnCloseCapcutModal.addEventListener('click', () => dom.modalCapcut.classList.add('hidden'));
dom.btnCancelCapcut.addEventListener('click', () => dom.modalCapcut.classList.add('hidden'));
dom.btnLoadSampleCapcut.addEventListener('click', loadSampleCapCutProject);
dom.btnImportCapcutSubmit.addEventListener('click', submitCapCutImport);

// Timeline Drag & Scrub Listeners
setupTimelineInteractions();
setupCanvasInteractions();

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target && (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable)) return;
  if (document.activeElement && (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable)) return;

  // Escape cancels any active timeline drag proposal
  if (e.code === 'Escape' && state.dragState) {
    e.preventDefault();
    if (typeof cancelTimelineGesture === 'function') {
      cancelTimelineGesture('User cancelled with Escape');
    }
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayback();
  } else if (e.code === 'Home') {
    e.preventDefault();
    setPlayheadTick(0);
  } else if (e.code === 'End') {
    e.preventDefault();
    if (state.project) setPlayheadTick(state.project.timebase.durationTicks);
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    stepFrame(e.shiftKey ? -10 : -1);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    stepFrame(e.shiftKey ? 10 : 1);
  } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyB') {
    e.preventDefault();
    splitAtPlayhead();
  } else if (e.code === 'KeyB') {
    setActiveTool('blade');
  } else if (e.code === 'KeyV') {
    setActiveTool('select');
  } else if (e.code === 'KeyQ') {
    deleteLeft();
  } else if (e.code === 'KeyW') {
    deleteRight();
  } else if (e.code === 'KeyP') {
    if (dom.toggleMagnet) dom.toggleMagnet.click();
  } else if (e.code === 'KeyN') {
    if (dom.toggleSnapping) dom.toggleSnapping.click();
  } else if (e.code === 'KeyR' && !(e.metaKey || e.ctrlKey)) {
    if (dom.toggleLinkage) dom.toggleLinkage.click();
  } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyR') {
    e.preventDefault();
    reverseClip();
  } else if (e.altKey && e.code === 'KeyF') {
    e.preventDefault();
    freezeFrame();
  } else if (e.shiftKey && e.code === 'KeyC') {
    e.preventDefault();
    cropClip();
  } else if (e.shiftKey && e.code === 'KeyZ') {
    e.preventDefault();
    zoomToFit();
  } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
    e.preventDefault();
    dom.btnZoomIn.click();
  } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
    e.preventDefault();
    dom.btnZoomOut.click();
  } else if (e.code === 'Delete' || e.code === 'Backspace') {
    deleteSelectedClip();
  } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyY') {
    e.preventDefault();
    redo();
  } else if (e.code === 'KeyM') {
    if (dom.btnVolumeMute) dom.btnVolumeMute.click();
  }
});

function notify(msg, type = 'info') {
  console.log(`[UI Notification] (${type}): ${msg}`);
  let toast = document.getElementById('ui-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ui-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0f172a;border:1px solid #38bdf8;color:#f8fafc;padding:10px 16px;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.6);font-size:12px;font-weight:500;z-index:9999;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.innerText = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// Format SMPTE Timecode
function formatSmpteTimecode(ticks, fps = 60) {
  const totalFrames = Math.round((ticks / 120000) * fps);
  const ff = totalFrames % fps;
  const totalSec = Math.floor(totalFrames / fps);
  const ss = totalSec % 60;
  const mm = Math.floor(totalSec / 60) % 60;
  const hh = Math.floor(totalSec / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

// Load Project via API
async function loadProject(pPath) {
  try {
    const res = await fetch(`/api/project?path=${encodeURIComponent(pPath)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.project = data.project;
    state.activePath = data.path;
    state.selectedClipId = null;
    state.currentTick = 0;
    state.inspectedRevisionId = null;
    state.inspectedProject = null;

    // Load active project color grade if present
    if (state.project.colorGrade) {
      state.currentGrade = structuredClone(state.project.colorGrade);
    } else {
      state.currentGrade = createDefaultGrade();
    }
    state.persistedGrade = structuredClone(state.currentGrade);
    state.colorDraft.active = false;
    state.colorDraft.version = 0;
    state.colorDraft.grade = structuredClone(state.currentGrade);
    state.colorDraft.cachedBaseFrameUri = null;
    state.colorDraft.cachedGradedUri = null;
    state.colorDraft.isComparing = false;
    state.colorDraft.bypassMode = false;
    if (dom.cgDraftBadge) dom.cgDraftBadge.classList.add('hidden');
    if (dom.colorPreviewCanvas) dom.colorPreviewCanvas.classList.add('hidden');
    if (dom.compareIndicatorOverlay) dom.compareIndicatorOverlay.classList.add('hidden');
    if (dom.cgToggleCompare) {
      dom.cgToggleCompare.innerText = 'Bypass: Off';
      dom.cgToggleCompare.classList.remove('active');
    }
    syncColorControlsToState();

    updateUI();
    await fetchAuthoritativeSession();
    await fetchCandidates();
    notify(`Loaded project: ${data.project.title || data.project.id}`, 'success');
  } catch (err) {
    notify(`Failed to load project: ${err.message}`, 'error');
  }
}

// Save Project via API
async function saveProject() {
  if (pendingOperation) await pendingOperation.catch(() => {});
  if (!state.project) return;
  try {
    const res = await fetch('/api/project/save', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    notify(`Project saved! Revision: ${data.revision}`, 'success');
    return data;
  } catch (err) {
    notify(`Save failed: ${err.message}`, 'error');
    throw err;
  }
}

let pendingOperation = null;

// Dispatch EME Atomic Operation
async function dispatchOperation(operation) {
  // Serialize requests: await in-flight pending operation if any
  if (pendingOperation) {
    try { await pendingOperation; } catch (e) {}
  }

  try {
    if (operation) {
      if (operation.expectedBaseRevision === undefined && state.project && state.project.revision !== undefined) {
        operation.expectedBaseRevision = state.project.revision;
      }
      if (!operation.operationId) {
        operation.operationId = 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      }
    }
    const p = fetch('/api/project/operation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation,
        expectedBaseRevision: state.project?.revision
      })
    }).then(async res => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Operation failed');
      return json;
    });

    pendingOperation = p;
    const data = await p;

    state.project = data.project;
    dom.btnUndo.disabled = !data.canUndo;
    dom.btnRedo.disabled = !data.canRedo;
    updateUI();
    return data;
  } catch (err) {
    notify(`Operation rejected: ${err.message}`, 'error');
    throw err;
  } finally {
    pendingOperation = null;
  }
}

// Undo / Redo
async function undo() {
  if (state.session) {
    return sessionUndo();
  }
  if (pendingOperation) await pendingOperation.catch(() => {});
  try {
    const res = await fetch('/api/project/undo', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      state.project = data.project;
      dom.btnUndo.disabled = !data.canUndo;
      dom.btnRedo.disabled = !data.canRedo;
      updateUI();
      notify('Undo executed', 'info');
      return data;
    }
  } catch (err) {
    console.error(err);
  }
}

async function redo() {
  if (state.session) {
    return sessionRedo();
  }
  if (pendingOperation) await pendingOperation.catch(() => {});
  try {
    const res = await fetch('/api/project/redo', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      state.project = data.project;
      dom.btnUndo.disabled = !data.canUndo;
      dom.btnRedo.disabled = !data.canRedo;
      updateUI();
      notify('Redo executed', 'info');
      return data;
    }
  } catch (err) {
    console.error(err);
  }
}

// QA Audit
async function runQaAudit() {
  if (!state.project) return;
  try {
    const res = await fetch('/api/qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const data = await res.json();
    if (res.ok && data.report) {
      dom.qaScoreBadge.innerText = `${data.report.score}/100`;
      dom.qaScoreBadge.style.background = data.report.passed ? 'var(--success)' : 'var(--danger)';

      dom.qaDetails.innerHTML = data.report.checks.map(c => `
        <div style="font-size: 11px; margin-bottom: 5px; padding: 4px; background: rgba(0,0,0,0.3); border-radius: 4px; color: ${c.passed ? '#34d399' : '#f87171'}">
          ${c.passed ? '✔' : '✖'} <strong>${c.name}</strong>: ${c.detail}
        </div>
      `).join('');

      document.querySelector('[data-tab="qa"]').click();
      notify(`QA Audit complete: ${data.report.score}/100`, data.report.passed ? 'success' : 'error');
    }
  } catch (err) {
    console.error(err);
  }
}

// Render MP4
async function renderMp4() {
  if (!state.project) return;
  dom.btnRender.disabled = true;
  dom.btnRender.innerText = 'Rendering MP4...';
  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputDir: 'artifacts/ui-renders', fps: 60 })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    notify(`Render completed in ${data.elapsedMs}ms! Saved to ${data.mp4Path}`, 'success');
  } catch (err) {
    notify(`Render failed: ${err.message}`, 'error');
  } finally {
    dom.btnRender.disabled = false;
    dom.btnRender.innerText = 'Render MP4';
  }
}

// Playback and Stepping
function togglePlayback() {
  const videoEl = dom.previewVideo || document.getElementById('preview-video');
  if (state.isPlaying) {
    if (state.playInterval) clearInterval(state.playInterval);
    state.isPlaying = false;
    dom.btnPlayPause.innerText = '▶';
    dom.btnPlayPause.classList.remove('btn-transport-pause');
    if (videoEl && !videoEl.paused) videoEl.pause();
  } else {
    state.isPlaying = true;
    dom.btnPlayPause.innerText = '⏸';
    dom.btnPlayPause.classList.add('btn-transport-pause');

    if (videoEl && videoEl.src && videoEl.readyState >= 2) {
      videoEl.currentTime = state.currentTick / 120000;
      videoEl.play().catch(e => console.warn('Autoplay prevented:', e));
    } else {
      const proj = state.inspectedProject || state.project;
      const fps = typeof proj?.timebase?.fps === 'object' ? proj.timebase.fps.numerator : (proj?.timebase?.fps || 30);
      const ticksPerFrame = Math.round(120000 / fps);
      state.playInterval = setInterval(() => {
        setPlayheadTick(state.currentTick + ticksPerFrame);
        if (proj && state.currentTick >= proj.timebase.durationTicks) {
          togglePlayback();
          setPlayheadTick(0);
        }
      }, 1000 / fps);
    }
  }
}

function stepFrame(frames = 1) {
  const proj = state.inspectedProject || state.project;
  const fps = typeof proj?.timebase?.fps === 'object' ? proj.timebase.fps.numerator : (proj?.timebase?.fps || 30);
  const ticksPerFrame = Math.round(120000 / fps);
  setPlayheadTick(Math.max(0, state.currentTick + frames * ticksPerFrame));
}

function setPlayheadTick(tick, seekVideo = true) {
  const proj = state.inspectedProject || state.project;
  if (!proj) return;
  const maxTicks = proj.timebase.durationTicks;
  state.currentTick = Math.max(0, Math.min(maxTicks, Math.round(tick)));

  const sec = state.currentTick / 120000;
  const totalSec = maxTicks / 120000;
  dom.playheadSec.innerText = `${sec.toFixed(2)}s`;
  dom.transportSecLabel.innerText = `${sec.toFixed(3)}s / ${totalSec.toFixed(3)}s`;
  dom.currentTick.innerText = state.currentTick;
  const fpsNum = typeof proj.timebase.fps === 'object' ? proj.timebase.fps.numerator : (proj.timebase.fps || 30);
  dom.smpteTimecode.innerText = formatSmpteTimecode(state.currentTick, fpsNum);

  // Position playhead on timeline
  dom.timelinePlayhead.style.left = `${tickToPixel(state.currentTick)}px`;

  // Seek HTML5 video player if present
  const videoEl = dom.previewVideo || document.getElementById('preview-video');
  if (videoEl && seekVideo && !state.isPlaying && videoEl.duration) {
    if (Math.abs(videoEl.currentTime - sec) > 0.04) {
      videoEl.currentTime = sec;
    }
  }

  renderPreview();
}

// Split Clip at Playhead
async function splitAtPlayhead() {
  if (!state.project) return;
  // Target selected clip or clip intersecting playhead on highest track
  let targetClip = null;
  if (state.selectedClipId) {
    targetClip = state.project.clips.find(c => c.id === state.selectedClipId);
  }
  if (!targetClip) {
    const intersecting = state.project.clips.filter(c => state.currentTick > c.startTick && state.currentTick < (c.startTick + c.durationTicks));
    if (intersecting.length > 0) {
      targetClip = intersecting[0];
    }
  }

  if (!targetClip) {
    return notify('No clip selected or intersecting playhead to split', 'warning');
  }

  if (state.currentTick <= targetClip.startTick || state.currentTick >= (targetClip.startTick + targetClip.durationTicks)) {
    return notify('Playhead must be strictly inside clip to split', 'warning');
  }

  await dispatchOperation({
    type: 'split_clip',
    params: {
      clipId: targetClip.id,
      splitTick: state.currentTick
    }
  });
  notify(`Split clip ${targetClip.id} at frame ${state.currentTick}`, 'success');
}

// Delete / Ripple Delete Clip
async function deleteSelectedClip() {
  if (!state.project || !state.selectedClipId) {
    return notify('No clip selected to delete', 'warning');
  }
  const isRipple = state.activeTool === 'ripple';
  const opType = isRipple ? 'ripple_delete' : 'delete_clip';
  const targetId = state.selectedClipId;

  state.selectedClipId = null;
  await dispatchOperation({
    type: opType,
    params: { clipId: targetId }
  });
  notify(`Deleted clip ${targetId} (${isRipple ? 'Ripple' : 'Standard'})`, 'success');
}

// CapCut Trimming & Clip Actions
function getTargetClipAtPlayhead() {
  if (!state.project) return null;
  if (state.selectedClipId) {
    const c = state.project.clips.find(clip => clip.id === state.selectedClipId);
    if (c) return c;
  }
  const trackMap = new Map((state.project.tracks || []).map(t => [t.id, t]));
  const intersecting = (state.project.clips || []).filter(c => {
    return state.currentTick >= c.startTick && state.currentTick < (c.startTick + c.durationTicks);
  });
  intersecting.sort((a, b) => ((trackMap.get(b.trackId) || {}).zIndex || 0) - ((trackMap.get(a.trackId) || {}).zIndex || 0));
  return intersecting[0] || null;
}

async function deleteLeft() {
  if (!state.project) return;
  const clip = getTargetClipAtPlayhead();
  if (!clip) return notify('No clip at playhead to trim left', 'warning');
  if (state.currentTick <= clip.startTick + 600 || state.currentTick >= (clip.startTick + clip.durationTicks - 600)) {
    return notify('Playhead must be inside clip to delete left', 'warning');
  }
  const deltaTicks = state.currentTick - clip.startTick;
  await dispatchOperation({
    type: 'ripple_trim',
    params: { clipId: clip.id, edge: 'in', deltaTicks: -deltaTicks }
  });
  notify(`Ripple trimmed left by ${(deltaTicks / 120000).toFixed(2)}s`, 'success');
}

async function deleteRight() {
  if (!state.project) return;
  const clip = getTargetClipAtPlayhead();
  if (!clip) return notify('No clip at playhead to trim right', 'warning');
  if (state.currentTick <= clip.startTick + 600 || state.currentTick >= (clip.startTick + clip.durationTicks - 600)) {
    return notify('Playhead must be inside clip to delete right', 'warning');
  }
  const deltaTicks = (clip.startTick + clip.durationTicks) - state.currentTick;
  await dispatchOperation({
    type: 'ripple_trim',
    params: { clipId: clip.id, edge: 'out', deltaTicks: -deltaTicks }
  });
  notify(`Ripple trimmed right by ${(deltaTicks / 120000).toFixed(2)}s`, 'success');
}

async function freezeFrame() {
  if (!state.project) return;
  const clip = getTargetClipAtPlayhead();
  if (!clip) return notify('Select a clip or position playhead to freeze frame', 'warning');
  notify(`Freeze frame applied at ${dom.playheadSec.innerText}`, 'info');
}

async function reverseClip() {
  if (!state.project || !state.selectedClipId) return notify('Select a clip to reverse', 'warning');
  const clip = state.project.clips.find(c => c.id === state.selectedClipId);
  if (!clip) return;
  clip.metadata = clip.metadata || {};
  clip.metadata.reversed = !clip.metadata.reversed;
  notify(`Clip ${clip.id} reversed: ${clip.metadata.reversed ? 'YES' : 'NO'}`, 'info');
  renderTimeline();
}

function cropClip() {
  if (!state.selectedClipId) return notify('Select a clip to adjust crop & framing', 'warning');
  const propTab = document.querySelector('[data-tab="properties"]');
  if (propTab) propTab.click();
  notify('Inspector switched to Properties & Transform', 'info');
}

function recordVoiceover() {
  notify('Voiceover record armed on Audio Track A2 (Ready)', 'info');
}

function zoomToFit() {
  if (!state.project) return;
  const areaWidth = dom.timelineTracksArea.clientWidth || 800;
  const usableWidth = Math.max(300, areaWidth - 60);
  const durSec = (state.project.timebase?.durationTicks || 120000) / 120000;
  const projectPxAt1x = Math.max(1, durSec * TIMELINE_BASE_PPS);
  const idealZoom = Math.max(0.05, Math.min(8.0, usableWidth / projectPxAt1x));
  state.zoom = parseFloat(idealZoom.toFixed(2));
  dom.timelineZoom.value = state.zoom;
  dom.zoomLevelLabel.innerText = `${state.zoom.toFixed(1)}x`;
  renderTimeline();
  notify(`Zoom to Fit: ${(state.zoom * 100).toFixed(0)}%`, 'info');
}

window.toggleTrackVisibility = async function(trackId) {
  const track = state.project?.tracks?.find(t => t.id === trackId);
  if (!track) return;
  const newVisible = track.visible !== undefined ? !track.visible : false;
  try {
    await dispatchOperation({
      type: 'set_track_state',
      params: { trackId, visible: newVisible },
      expectedBaseRevision: state.project.revision
    });
    notify(`Track ${track.name || trackId} ${newVisible ? 'Visible' : 'Hidden'}`, 'info');
  } catch (err) {
    console.error('Failed to toggle track visibility:', err);
  }
};

// --- Phase PF-10 Stage 2: Authoritative Delivery Verification & Preview Player ---

async function fetchAuthoritativeSession() {
  const currentSeq = ++state.sessionFetchSeq;
  try {
    const res = await fetch('/api/session');
    if (currentSeq !== state.sessionFetchSeq) return; // Discard stale async response
    if (res.ok) {
      const data = await res.json();
      state.session = data.session;
      try {
        const histRes = await fetch('/api/session/history');
        if (histRes.ok && currentSeq === state.sessionFetchSeq) {
          const histData = await histRes.json();
          state.sessionHistory = histData.history || [];
        }
      } catch (e) {
        // Non-fatal history fetch
      }
    } else {
      state.session = null;
      state.sessionHistory = [];
    }
  } catch (err) {
    if (currentSeq === state.sessionFetchSeq) {
      state.session = null;
      state.sessionHistory = [];
    }
  }

  updateDeliveryVerificationUI();
  updatePreviewMedia();
  renderHistoryDAGUI();
  renderRevisionFormUI();
}

function updateDeliveryVerificationUI() {
  if (!dom.deliveryStatusBadge) return;

  // Determine which delivery artifact we are displaying
  let delivery = null;
  let historyItem = null;
  let isSuperseded = false;
  let isCandidatePreview = false;

  if (state.previewedCandidateId) {
    isCandidatePreview = true;
    const cand = (state.candidateSet?.candidates || []).find(c => c.candidate_id === state.previewedCandidateId);
    if (cand) {
      delivery = {
        revision_id: `Uncommitted (${cand.candidate_id})`,
        manifest_id: cand.manifest_id,
        sha256: cand.media_sha256,
        media_path: cand.media_path,
        delivery_run_id: null,
        qa_score: cand.qa_score,
        resolution: cand.resolution,
        fps: cand.fps,
        duration: cand.duration_seconds
      };
    }
  } else if (state.inspectedRevisionId) {
    // Explicit Historical Inspection Mode
    isSuperseded = true;
    historyItem = (state.sessionHistory || []).find(h => h.revision_id === state.inspectedRevisionId);
    if (historyItem) {
      delivery = {
        revision_id: historyItem.revision_id,
        manifest_id: historyItem.manifest_id,
        sha256: historyItem.media_sha256,
        media_path: historyItem.media_path,
        delivery_run_id: historyItem.delivery_run_id
      };
    }
  } else {
    delivery = state.session?.active_delivery || null;
    if (delivery && state.sessionHistory) {
      historyItem = state.sessionHistory.find(h => h.revision_id === delivery.revision_id) || null;
    }
  }

  // Candidate Preview Banner
  if (dom.candidatePreviewBanner) {
    if (isCandidatePreview) {
      dom.candidatePreviewBanner.classList.remove('hidden');
      if (dom.previewedCandId) dom.previewedCandId.innerText = state.previewedCandidateId;
      const cand = (state.candidateSet?.candidates || []).find(c => c.candidate_id === state.previewedCandidateId);
      if (dom.btnActivatePreviewedCand) {
        dom.btnActivatePreviewedCand.disabled = !cand?.isEligible;
      }
    } else {
      dom.candidatePreviewBanner.classList.add('hidden');
    }
  }

  // Derive status badge
  let badgeClass = 'badge-status-none';
  let icon = '⚪';
  let text = 'NO ACTIVE DELIVERY';

  if (isCandidatePreview) {
    badgeClass = 'badge-status-verifying';
    icon = '👁';
    text = `CANDIDATE PREVIEW: ${state.previewedCandidateId}`;
  } else if (isSuperseded) {
    badgeClass = 'badge-status-superseded';
    icon = '○';
    text = 'SUPERSEDED REVISION';
  } else if (state.isVerifying || state.session?.state === 'revising') {
    badgeClass = 'badge-status-verifying';
    icon = '▲';
    text = 'VERIFYING / IN-FLIGHT';
  } else if (state.lastRevisionError || (state.session && state.session.state === 'failed')) {
    badgeClass = 'badge-status-failed';
    icon = '✕';
    text = 'REVISION FAILED';
  } else if (delivery) {
    badgeClass = 'badge-status-active';
    icon = '●';
    text = 'ACTIVE DELIVERY';
  }

  dom.deliveryStatusBadge.className = `delivery-status-badge ${badgeClass}`;
  if (dom.deliveryStatusIcon) dom.deliveryStatusIcon.innerText = icon;
  if (dom.deliveryStatusText) dom.deliveryStatusText.innerText = text;

  // Provenance and Technical Metadata
  const revId = delivery?.revision_id || 'Unavailable';
  const manifestId = delivery?.manifest_id || 'Unavailable';
  const rawSha = delivery?.sha256 || delivery?.media_sha256 || null;

  if (dom.metaRevisionId) dom.metaRevisionId.innerText = revId;
  if (dom.metaManifestId) dom.metaManifestId.innerText = manifestId;

  if (dom.metaSha256Short && dom.metaSha256Container) {
    if (rawSha && typeof rawSha === 'string' && rawSha.length > 0) {
      const shortSha = rawSha.slice(0, 16);
      dom.metaSha256Short.innerText = shortSha + (rawSha.length > 16 ? '...' : '');
      dom.metaSha256Container.title = `Full SHA-256: ${rawSha} (Click button to copy)`;
      dom.metaSha256Container.dataset.fullHash = rawSha;
      if (dom.btnCopySha256) dom.btnCopySha256.disabled = false;
    } else {
      dom.metaSha256Short.innerText = 'Unavailable';
      dom.metaSha256Container.title = 'Full SHA-256 unavailable';
      dom.metaSha256Container.dataset.fullHash = '';
      if (dom.btnCopySha256) dom.btnCopySha256.disabled = true;
    }
  }

  // Technical metadata: Resolution, FPS, Duration, QA Score
  const proj = state.inspectedProject || state.project;
  if (dom.metaResolution) {
    if (isCandidatePreview && delivery?.resolution) {
      dom.metaResolution.innerText = delivery.resolution;
    } else if (proj?.canvas?.width && proj?.canvas?.height) {
      dom.metaResolution.innerText = `${proj.canvas.width} × ${proj.canvas.height}`;
    } else {
      dom.metaResolution.innerText = 'Unavailable';
    }
  }

  if (dom.metaFps) {
    if (isCandidatePreview && delivery?.fps) {
      dom.metaFps.innerText = `${delivery.fps} FPS`;
    } else if (proj?.timebase?.fps) {
      const fpsVal = typeof proj.timebase.fps === 'object'
        ? proj.timebase.fps.numerator
        : proj.timebase.fps;
      dom.metaFps.innerText = `${fpsVal} FPS`;
    } else {
      dom.metaFps.innerText = 'Unavailable';
    }
  }

  if (dom.metaDuration) {
    if (isCandidatePreview && typeof delivery?.duration === 'number') {
      dom.metaDuration.innerText = `${delivery.duration.toFixed(2)}s`;
    } else if (proj?.timebase?.durationTicks !== undefined) {
      const durSec = proj.timebase.durationTicks / 120000;
      dom.metaDuration.innerText = `${durSec.toFixed(2)}s`;
    } else {
      dom.metaDuration.innerText = 'Unavailable';
    }
  }

  if (dom.metaQaScore) {
    const qa = isCandidatePreview ? delivery?.qa_score : (historyItem?.qa_score ?? null);
    if (typeof qa === 'number') {
      dom.metaQaScore.innerText = `${qa}/100`;
    } else {
      dom.metaQaScore.innerText = 'Unavailable';
    }
  }

  // Inspection banner
  if (dom.inspectionBanner) {
    if (isSuperseded && !isCandidatePreview) {
      dom.inspectionBanner.classList.remove('hidden');
      if (dom.inspectedRevId) dom.inspectedRevId.innerText = state.inspectedRevisionId;
    } else {
      dom.inspectionBanner.classList.add('hidden');
    }
  }

  // Delivery Alert
  if (dom.deliveryAlert) {
    if (state.lastRevisionError) {
      dom.deliveryAlert.classList.remove('hidden');
      if (dom.deliveryAlertMsg) {
        dom.deliveryAlertMsg.innerText = `Revision failed: ${state.lastRevisionError}. Prior verified delivery remains active.`;
      }
    } else {
      dom.deliveryAlert.classList.add('hidden');
      if (dom.deliveryAlertMsg) dom.deliveryAlertMsg.innerText = '';
    }
  }

  // Undo / Redo controls state readiness
  const canUndo = !!state.session?.undo_redo?.canUndo;
  const canRedo = !!state.session?.undo_redo?.canRedo;
  if (dom.btnUndo) dom.btnUndo.disabled = !canUndo;
  if (dom.btnRedo) dom.btnRedo.disabled = !canRedo;
  if (dom.btnSessionUndo) dom.btnSessionUndo.disabled = !canUndo;
  if (dom.btnSessionRedo) dom.btnSessionRedo.disabled = !canRedo;
}

function updatePreviewMedia() {
  const videoEl = dom.previewVideo || document.getElementById('preview-video');
  if (!videoEl) return;

  let mediaPath = null;
  let mediaId = null;

  if (state.previewedCandidateId) {
    const cand = (state.candidateSet?.candidates || []).find(c => c.candidate_id === state.previewedCandidateId);
    if (cand && cand.media_path) {
      mediaPath = cand.media_path;
      mediaId = cand.candidate_id;
    }
  } else if (state.inspectedRevisionId) {
    const historyItem = (state.sessionHistory || []).find(h => h.revision_id === state.inspectedRevisionId);
    if (historyItem && historyItem.media_path) {
      mediaPath = historyItem.media_path;
      mediaId = historyItem.revision_id;
    }
  } else {
    const delivery = state.session?.active_delivery || null;
    if (delivery && delivery.media_path) {
      mediaPath = delivery.media_path;
      mediaId = delivery.revision_id;
    }
  }

  // Fallback only for standalone project mode when no session is loaded
  if (!mediaPath && !mediaId && !state.session && state.project?.previewVideo) {
    mediaPath = state.project.previewVideo;
  }

  // In-flight stale overlay
  if (state.isVerifying) {
    dom.previewOverlayStale?.classList.remove('hidden');
  } else {
    dom.previewOverlayStale?.classList.add('hidden');
  }

  if (!mediaPath && !mediaId) {
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.dataset.currentIdentifier = '';
    dom.previewOverlayLoading?.classList.add('hidden');
    dom.previewOverlayError?.classList.add('hidden');
    dom.previewOverlayUnavailable?.classList.remove('hidden');
    return;
  }

  dom.previewOverlayUnavailable?.classList.add('hidden');

  const mediaUrl = mediaId
    ? `/api/media?id=${encodeURIComponent(mediaId)}`
    : `/api/media?path=${encodeURIComponent(mediaPath)}`;

  const targetIdentifier = mediaId || mediaPath;
  if (videoEl.dataset.currentIdentifier !== targetIdentifier) {
    videoEl.dataset.currentIdentifier = targetIdentifier;
    dom.previewOverlayLoading?.classList.remove('hidden');
    dom.previewOverlayError?.classList.add('hidden');
    videoEl.src = mediaUrl;
    videoEl.load();
  }
}

function setupPreviewVideo() {
  const videoEl = dom.previewVideo || document.getElementById('preview-video');
  if (!videoEl) return;

  videoEl.playsInline = true;
  videoEl.preload = 'auto';
  videoEl.autoplay = false;

  videoEl.addEventListener('loadstart', () => {
    dom.previewOverlayLoading?.classList.remove('hidden');
  });

  videoEl.addEventListener('waiting', () => {
    dom.previewOverlayLoading?.classList.remove('hidden');
  });

  videoEl.addEventListener('canplay', () => {
    dom.previewOverlayLoading?.classList.add('hidden');
    dom.previewOverlayError?.classList.add('hidden');
    // Notice: Video loading success does NOT manufacture verified status!
  });

  videoEl.addEventListener('error', () => {
    dom.previewOverlayLoading?.classList.add('hidden');
    dom.previewOverlayError?.classList.remove('hidden');
    const err = videoEl.error;
    let detail = 'Browser failed to decode media stream.';
    if (err) {
      if (err.code === 1) detail = 'Media playback aborted by client.';
      else if (err.code === 2) detail = 'Network error during media download.';
      else if (err.code === 3) detail = 'Media decode error: codec or format unsupported.';
      else if (err.code === 4) detail = 'Media source not supported or not found (HTTP 404/403).';
    }
    if (dom.previewErrorMsg) dom.previewErrorMsg.innerText = detail;
    // CRITICAL: Does NOT switch to arbitrary fallback media or older revision!
  });

  videoEl.addEventListener('timeupdate', () => {
    if (state.isPlaying) {
      // Frame-accurate integer tick synchronization
      const currentTick = Math.round(videoEl.currentTime * 120000);
      setPlayheadTick(currentTick, false);
      const proj = state.inspectedProject || state.project;
      if (proj && currentTick >= proj.timebase.durationTicks) {
        togglePlayback();
        setPlayheadTick(0);
      }
    }
  });

  videoEl.addEventListener('ended', () => {
    if (state.isPlaying) {
      togglePlayback();
      setPlayheadTick(0);
    }
  });
}

function setupVolumeControls() {
  if (dom.btnVolumeMute) {
    dom.btnVolumeMute.addEventListener('click', () => {
      const videoEl = dom.previewVideo || document.getElementById('preview-video');
      state.isMuted = !state.isMuted;
      if (videoEl) videoEl.muted = state.isMuted;
      dom.btnVolumeMute.innerText = state.isMuted ? '🔇' : '🔊';
      dom.btnVolumeMute.title = state.isMuted ? 'Unmute (M)' : 'Mute (M)';
    });
  }

  if (dom.volumeSlider) {
    dom.volumeSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      state.volume = val;
      const videoEl = dom.previewVideo || document.getElementById('preview-video');
      if (videoEl) {
        videoEl.volume = val;
        if (val === 0) {
          state.isMuted = true;
          videoEl.muted = true;
          if (dom.btnVolumeMute) dom.btnVolumeMute.innerText = '🔇';
        } else if (state.isMuted) {
          state.isMuted = false;
          videoEl.muted = false;
          if (dom.btnVolumeMute) dom.btnVolumeMute.innerText = '🔊';
        }
      }
    });
  }
}

function setupStage2Controls() {
  setupPreviewVideo();
  setupVolumeControls();

  if (dom.btnCopySha256) {
    dom.btnCopySha256.addEventListener('click', async () => {
      const fullHash = dom.metaSha256Container?.dataset.fullHash;
      if (fullHash) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(fullHash);
          }
          notify(`Copied SHA-256 (${fullHash.slice(0, 16)}...) to clipboard`, 'success');
        } catch (e) {
          notify(`SHA-256: ${fullHash}`, 'info');
        }
      }
    });
  }

  if (dom.btnExitInspection) {
    dom.btnExitInspection.addEventListener('click', exitInspectionMode);
  }
}

async function inspectRevision(revisionId) {
  state.inspectedRevisionId = revisionId;
  const currentSeq = ++state.timelineFetchSeq;
  try {
    const res = await fetch(`/api/timeline?revisionId=${encodeURIComponent(revisionId)}`);
    if (currentSeq !== state.timelineFetchSeq) return; // Stale response rejected
    if (res.ok) {
      const data = await res.json();
      if (currentSeq !== state.timelineFetchSeq) return; // Stale response rejected
      if (data.timeline && state.project) {
        state.inspectedProject = {
          ...state.project,
          tracks: data.timeline.tracks || state.project.tracks,
          clips: data.timeline.clips || state.project.clips
        };
        renderTimeline();
        renderPreview();
      }
    }
  } catch (e) {
    if (currentSeq !== state.timelineFetchSeq) return;
    notify(`Failed to inspect revision: ${e.message}`, 'error');
  }
  updateDeliveryVerificationUI();
  updatePreviewMedia();
  notify(`Inspecting revision ${revisionId} (read-only)`, 'info');
}

async function exitInspectionMode() {
  state.inspectedRevisionId = null;
  state.inspectedProject = null;
  renderTimeline();
  renderPreview();
  updateDeliveryVerificationUI();
  updatePreviewMedia();
  notify('Returned to active delivery', 'info');
}

// Sync UI Controls
function updateUI() {
  if (!state.project) return;

  dom.projectTitle.innerText = state.project.title || state.project.id;
  dom.revisionBadge.innerText = `Rev ${state.project.revision}`;
  dom.canvasDim.innerText = `${state.project.canvas.width} × ${state.project.canvas.height}`;
  dom.timebaseFps.innerText = `${state.project.timebase.fps.numerator} FPS`;

  // Assets list
  dom.assetCount.innerText = (state.project.assets || []).length;
  dom.assetsList.innerHTML = (state.project.assets || []).map(a => `
    <li style="display:flex; justify-content:space-between; align-items:center; padding: 4px 6px;">
      <div>
        <span style="font-weight:600;">${a.id}</span>
        <span class="badge" style="margin-left:4px;">${a.type}</span>
      </div>
      <button class="btn btn-sm btn-ghost" style="padding: 2px 6px; font-size:11px;" onclick="insertAssetToTimeline('${a.id}')" title="Insert asset onto timeline">+ Add</button>
    </li>
  `).join('');

  // Tracks list
  dom.trackCount.innerText = (state.project.tracks || []).length;
  dom.tracksList.innerHTML = (state.project.tracks || []).map(t => `
    <li style="display:flex; justify-content:space-between; align-items:center; padding: 4px 6px;">
      <div>
        <span>${t.name || t.id}</span>
        <span class="badge ${t.locked ? 'badge-fps' : ''}">${t.kind} (z:${t.zIndex})</span>
      </div>
      <div style="display:flex; gap:2px;">
        <button class="btn btn-sm btn-ghost" style="padding: 2px 5px; font-size:10px;" onclick="moveTrackUp('${t.id}')" title="Move Track Up">▲</button>
        <button class="btn btn-sm btn-ghost" style="padding: 2px 5px; font-size:10px;" onclick="moveTrackDown('${t.id}')" title="Move Track Down">▼</button>
      </div>
    </li>
  `).join('');

  updateDeliveryVerificationUI();
  updatePreviewMedia();
  renderPreview();
  renderTimeline();
  renderInspector();
}

// Render Preview Stage
function renderPreview() {
  const proj = state.inspectedProject || state.project;
  if (!proj) return;
  const canvas = proj.canvas;
  let targetRatio = canvas.width / canvas.height;
  if (state.previewRatio === '9:16') targetRatio = 9 / 16;
  else if (state.previewRatio === '1:1') targetRatio = 1.0;
  else if (state.previewRatio === '4:3') targetRatio = 4 / 3;
  else if (state.previewRatio === '16:9') targetRatio = 16 / 9;

  let stageW = 480;
  if (state.previewScale === '0.75') stageW = 360;
  else if (state.previewScale === '0.5') stageW = 240;
  else if (state.previewScale === '1.0') stageW = 560;

  const scale = stageW / canvas.width;
  const stageH = Math.round(stageW / targetRatio);

  dom.previewStage.style.width = `${stageW}px`;
  dom.previewStage.style.height = `${stageH}px`;
  dom.previewStage.style.backgroundColor = canvas.backgroundColor || '#000';

  let safeAreaHtml = '';
  if (state.safeAreaEnabled) {
    safeAreaHtml = `
      <div style="position: absolute; top: 5%; left: 5%; width: 90%; height: 90%; border: 1px dashed rgba(56, 189, 248, 0.4); pointer-events: none; z-index: 100;">
        <span style="position: absolute; top: 2px; left: 4px; font-size: 9px; color: #38bdf8; font-family: monospace;">Action 90%</span>
      </div>
      <div style="position: absolute; top: 10%; left: 10%; width: 80%; height: 80%; border: 1px dashed rgba(245, 158, 11, 0.4); pointer-events: none; z-index: 100;">
        <span style="position: absolute; top: 2px; left: 4px; font-size: 9px; color: #fbbf24; font-family: monospace;">Title 80%</span>
      </div>
    `;
  }

  const trackMap = new Map((proj.tracks || []).map(t => [t.id, t]));
  const visibleClips = (proj.clips || []).filter(c => {
    const trk = trackMap.get(c.trackId);
    if (trk && trk.hidden) return false;
    return c.type !== 'audio' && state.currentTick >= c.startTick && state.currentTick < (c.startTick + c.durationTicks);
  });
  visibleClips.sort((a, b) => ((trackMap.get(a.trackId) || {}).zIndex || 0) - ((trackMap.get(b.trackId) || {}).zIndex || 0));

  const overlaysEl = dom.previewOverlays || document.getElementById('preview-overlays');
  if (overlaysEl) {
    const clipsHtml = visibleClips.map(clip => {
      const isSelected = clip.id === state.selectedClipId;
      return renderClipOverlay(clip, scale, isSelected, stageW, stageH);
    }).join('');
    overlaysEl.innerHTML = clipsHtml + safeAreaHtml;
  }
}

// Render individual on-canvas interactive clip overlay
function renderClipOverlay(clip, scale, isSelected, stageW, stageH) {
  const t = clip.transform || {};
  const rawX = t.x !== undefined ? t.x : 960;
  const rawY = t.y !== undefined ? t.y : 540;
  const x = rawX * scale;
  const y = rawY * scale;

  if (clip.type === 'text') {
    const typo = clip.typography || {};
    const rawFontSize = typo.fontSize || 32;
    const fSize = rawFontSize * scale;
    const color = typo.color || '#ffffff';
    const anchorX = t.anchorX !== undefined ? t.anchorX : (typo.textAlign === 'center' ? 0.5 : 0.0);
    const alignStyle = typo.textAlign || 'center';
    const letterSpacing = (typo.letterSpacing || 0) * scale;
    const fontFamily = typo.fontFamily || "'Anton', 'Inter', -apple-system, sans-serif";
    const fontWeight = typo.fontWeight || (fontFamily.includes('Anton') ? '900' : '800');
    const textTransform = typo.textTransform || 'none';

    return `
      <div id="pv-${clip.id}"
           class="canvas-element-box ${isSelected ? 'selected' : ''}"
           data-clip-id="${clip.id}"
           style="position: absolute; left: ${x}px; top: ${y}px; transform: translate(-${anchorX * 100}%, -50%); z-index: ${isSelected ? 35 : 20};">
        <div class="resize-handle handle-nw" data-handle="nw" data-clip-id="${clip.id}"></div>
        <div class="resize-handle handle-ne" data-handle="ne" data-clip-id="${clip.id}"></div>
        <div class="resize-handle handle-sw" data-handle="sw" data-clip-id="${clip.id}"></div>
        <div class="resize-handle handle-se" data-handle="se" data-clip-id="${clip.id}"></div>
        <div class="canvas-size-badge" id="badge-${clip.id}">
          ${Math.round(rawFontSize)}px • (${Math.round(rawX)}, ${Math.round(rawY)})
        </div>
        <div class="canvas-element-inner" style="color: ${color}; font-size: ${fSize}px; font-weight: ${fontWeight}; font-family: ${fontFamily}; letter-spacing: ${letterSpacing}px; line-height: 1; text-transform: ${textTransform}; text-shadow: 0 2px 10px rgba(0,0,0,0.9); text-align: ${alignStyle}; white-space: nowrap; pointer-events: none;">
          ${typo.text || ''}
        </div>
      </div>
    `;
  } else {
    const borderStyle = isSelected ? 'border: 2px dashed #38bdf8;' : '';
    const gWidth = (stageW * 0.4);
    const gHeight = (stageH * 0.25);
    return `
      <div id="pv-${clip.id}" style="position: absolute; left: ${x}px; top: ${y}px; width: ${gWidth}px; height: ${gHeight}px; transform: translate(-50%, -50%); background: #1e293b; border-radius: 8px; pointer-events: auto; cursor: pointer; ${borderStyle}" onclick="selectClip('${clip.id}')"></div>
    `;
  }
}

// Render Timeline Tracks, Ruler, and Waveforms
function renderTimeline() {
  const proj = state.inspectedProject || state.project;
  if (!proj) return;
  const totalTicks = proj.timebase?.durationTicks || 120000;
  const pixelsPerTick = getPixelsPerTick();
  const timelineWidth = Math.max(800, tickToPixel(totalTicks));

  // 1. Render Track Headers
  const tracks = (proj.tracks || []);
  let vCount = 1, aCount = 1, tCount = 1;
  dom.trackHeaderList.innerHTML = tracks.map(track => {
    let badgeText = track.kind.slice(0, 3).toUpperCase();
    if (track.kind === 'visual') badgeText = `V${vCount++}`;
    else if (track.kind === 'audio') badgeText = `A${aCount++}`;
    else if (track.kind === 'text') badgeText = `T${tCount++}`;
    else if (track.kind === 'adjustment') badgeText = 'ADJ';

    const isHidden = track.visible === false;
    return `
      <div class="track-header-item" id="header-${track.id}">
        <div class="track-header-left">
          <span class="track-kind-badge kind-${track.kind}">${badgeText}</span>
          <span class="track-name-label" title="${track.name || track.id}">${track.name || track.id}</span>
        </div>
        <div class="track-controls-group">
          <button class="btn-track-ctrl ${isHidden ? 'active-hidden' : ''}" onclick="toggleTrackVisibility('${track.id}')" title="${isHidden ? 'Show Track' : 'Hide Track'}">
            ${isHidden ? '👁‍🗨' : '👁'}
          </button>
          <button class="btn-track-ctrl ${track.muted ? 'active-muted' : ''}" onclick="toggleTrackMute('${track.id}')" title="${track.muted ? 'Unmute Track' : 'Mute Track'}">
            ${track.muted ? '🔇' : '🔊'}
          </button>
          <button class="btn-track-ctrl ${track.locked ? 'active-locked' : ''}" onclick="toggleTrackLock('${track.id}')" title="${track.locked ? 'Unlock Track' : 'Lock Track'}">
            ${track.locked ? '🔒' : '🔓'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // 2. Render Timeline Ruler
  let rulerTicksHtml = '';
  const totalSec = Math.ceil(totalTicks / 120000);
  for (let s = 0; s <= totalSec; s++) {
    const sTick = s * 120000;
    const leftPx = tickToPixel(sTick);
    if (leftPx > timelineWidth) break;
    rulerTicksHtml += `
      <div class="ruler-tick major" style="left: ${leftPx}px;"></div>
      <div class="ruler-label" style="left: ${leftPx}px;">${s}s</div>
    `;
    // Minor ticks every half-second
    const halfLeftPx = tickToPixel(sTick + 60000);
    if (halfLeftPx <= timelineWidth) {
      rulerTicksHtml += `<div class="ruler-tick" style="left: ${halfLeftPx}px;"></div>`;
    }
  }
  dom.timelineRuler.style.width = `${timelineWidth}px`;
  dom.timelineRuler.innerHTML = rulerTicksHtml;

  // 3. Render Track Lanes & Clip Blocks
  dom.timelineLanes.style.width = `${timelineWidth}px`;
  dom.timelineLanes.innerHTML = tracks.map(track => {
    const clipsOnTrack = (proj.clips || []).filter(c => c.trackId === track.id);
    const clipBlocks = clipsOnTrack.map(clip => {
      const leftPx = tickToPixel(clip.startTick);
      const widthPx = Math.max(24, tickToPixel(clip.durationTicks));
      const isSelected = clip.id === state.selectedClipId ? 'selected' : '';
      const label = clip.type === 'text' ? (clip.typography?.text || clip.id) : (clip.metadata?.label || clip.id);
      const hasCg = (clip.effects || []).some(e => e.type === 'color_grade');
      const thumb = clip.metadata?.thumbnail;
      const durSec = (clip.durationTicks / 120000).toFixed(2);
      const thumbHtml = thumb
        ? `<img class="clip-thumb-img" src="/api/media?path=${encodeURIComponent(thumb)}" alt="" />`
        : (clip.type === 'video' ? `<span style="margin-right: 4px;">🎬</span>` : (clip.type === 'text' ? `<span style="margin-right: 4px;">🔤</span>` : ''));

      return `
        <div class="timeline-clip-block type-${clip.type} ${isSelected}"
             id="clip-block-${clip.id}"
             data-clip-id="${clip.id}"
             data-track-id="${track.id}"
             style="left: ${leftPx}px; width: ${widthPx}px;"
             onclick="selectClip('${clip.id}')"
             title="${clip.id} • ${label} [${durSec}s]">
          ${clip.type === 'audio' ? `<canvas class="clip-waveform-canvas" id="wf-${clip.id}" width="${Math.round(widthPx)}" height="32"></canvas>` : ''}
          <div class="trim-handle trim-handle-in" data-clip-id="${clip.id}" data-edge="in"></div>
          <div class="clip-content-row">
            ${thumbHtml}
            <span class="clip-title-text">${label}</span>
            <span class="clip-dur-tag">${durSec}s</span>
          </div>
          ${hasCg ? `<span class="clip-badge-cg">CG</span>` : ''}
          <div class="trim-handle trim-handle-out" data-clip-id="${clip.id}" data-edge="out"></div>
        </div>
      `;
    }).join('');

    return `
      <div class="timeline-lane" id="lane-${track.id}" data-track-id="${track.id}">
        ${clipBlocks}
      </div>
    `;
  }).join('');

  // 4. Draw Audio Waveforms
  tracks.filter(t => t.kind === 'audio').forEach(track => {
    const audioClips = (proj.clips || []).filter(c => c.trackId === track.id);
    audioClips.forEach(clip => {
      drawAudioWaveform(clip);
    });
  });

  // Position playhead
  dom.timelinePlayhead.style.left = `${tickToPixel(state.currentTick)}px`;
}

// Audio Waveform Fetching & Rendering
async function drawAudioWaveform(clip) {
  const canvas = document.getElementById(`wf-${clip.id}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  let peaks = state.waveformCache.get(clip.id);
  if (!peaks) {
    try {
      const res = await fetch(`/api/waveform?path=synthetic&pps=40`);
      const data = await res.json();
      peaks = data.peaks || [];
      state.waveformCache.set(clip.id, peaks);
    } catch {
      peaks = [];
    }
  }

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#a78bfa';
  const midY = h / 2;
  const step = Math.max(1, Math.floor(peaks.length / w));

  for (let x = 0; x < w; x++) {
    const pIdx = Math.min(peaks.length - 1, x * step);
    const peakVal = peaks[pIdx] || 0.3;
    const barH = Math.max(2, peakVal * (h * 0.8));
    ctx.fillRect(x, midY - barH / 2, 1, barH);
  }
}

// Select Clip
window.selectClip = function(clipId) {
  state.selectedClipId = clipId;
  dom.cgTargetName.innerText = `Clip: ${clipId}`;

  const clip = state.project.clips.find(c => c.id === clipId);
  if (clip && (state.currentTick < clip.startTick || state.currentTick >= (clip.startTick + clip.durationTicks))) {
    setPlayheadTick(clip.startTick);
  }

  // Read clip-level color grade if attached
  const gradeEffect = (clip?.effects || []).find(e => e.type === 'color_grade');
  if (gradeEffect && gradeEffect.grade) {
    state.currentGrade = structuredClone(gradeEffect.grade);
  } else if (clip?.colorGrade) {
    state.currentGrade = structuredClone(clip.colorGrade);
  } else if (state.project.colorGrade) {
    state.currentGrade = structuredClone(state.project.colorGrade);
  } else {
    state.currentGrade = createDefaultGrade();
  }
  state.persistedGrade = structuredClone(state.currentGrade);
  state.colorDraft.active = false;
  state.colorDraft.version = 0;
  state.colorDraft.grade = structuredClone(state.currentGrade);
  state.colorDraft.cachedBaseFrameUri = null;
  state.colorDraft.cachedGradedUri = null;
  state.colorDraft.isComparing = false;
  state.colorDraft.bypassMode = false;
  if (dom.cgDraftBadge) dom.cgDraftBadge.classList.add('hidden');
  if (dom.colorPreviewCanvas) dom.colorPreviewCanvas.classList.add('hidden');
  if (dom.compareIndicatorOverlay) dom.compareIndicatorOverlay.classList.add('hidden');
  if (dom.cgToggleCompare) {
    dom.cgToggleCompare.innerText = 'Bypass: Off';
    dom.cgToggleCompare.classList.remove('active');
  }
  syncColorControlsToState();

  renderPreview();
  renderTimeline();
  renderInspector();
};

// Track State Toggles
window.toggleTrackMute = async function(trackId) {
  const track = state.project.tracks.find(t => t.id === trackId);
  if (!track) return;
  await dispatchOperation({
    type: 'set_track_state',
    params: { trackId, muted: !track.muted }
  });
  notify(`Track ${track.name || trackId} ${track.muted ? 'Unmuted' : 'Muted'}`, 'info');
};

window.toggleTrackLock = async function(trackId) {
  const track = state.project.tracks.find(t => t.id === trackId);
  if (!track) return;
  await dispatchOperation({
    type: 'set_track_state',
    params: { trackId, locked: !track.locked }
  });
  notify(`Track ${track.name || trackId} ${track.locked ? 'Unlocked' : 'Locked'}`, 'info');
};

// Asset Insertion to Timeline
window.insertAssetToTimeline = async function(assetId) {
  if (!state.project) return;
  const asset = (state.project.assets || []).find(a => a.id === assetId);
  if (!asset) return;
  const targetTrack = (state.project.tracks || []).find(t => !t.locked && (asset.type === 'audio' ? t.kind === 'audio' : t.kind === 'visual'));
  if (!targetTrack) {
    notify('No unlocked compatible track available for this asset', 'warning');
    return;
  }
  const trackClips = (state.project.clips || []).filter(c => c.trackId === targetTrack.id);
  let startTick = state.currentTick || 0;
  const durationTicks = Math.min(asset.durationTicks || 120000, 120000);
  if (trackClips.some(c => (startTick < c.startTick + c.durationTicks && (startTick + durationTicks) > c.startTick))) {
    let maxEnd = 0;
    for (const c of trackClips) {
      if (c.startTick + c.durationTicks > maxEnd) maxEnd = c.startTick + c.durationTicks;
    }
    startTick = maxEnd;
  }
  const newClipId = `clip_${Date.now()}`;
  await dispatchOperation({
    type: 'insert_clip',
    params: {
      id: newClipId,
      trackId: targetTrack.id,
      type: asset.type === 'audio' ? 'audio' : 'video',
      startTick,
      durationTicks,
      source: {
        assetId: asset.id,
        trimInTick: 0,
        trimOutTick: durationTicks
      }
    }
  });
  notify(`Inserted clip for asset ${asset.id} onto ${targetTrack.name || targetTrack.id}`, 'success');
};

// Track Reordering
window.moveTrackUp = async function(trackId) {
  if (!state.project) return;
  const tracks = [...(state.project.tracks || [])].sort((a, b) => b.zIndex - a.zIndex);
  const idx = tracks.findIndex(t => t.id === trackId);
  if (idx <= 0) return;
  const prev = tracks[idx - 1];
  const curr = tracks[idx];
  const tempZ = prev.zIndex;
  prev.zIndex = curr.zIndex;
  curr.zIndex = tempZ;
  await dispatchOperation({
    type: 'reorder_tracks',
    params: {
      trackOrders: [
        { trackId: curr.id, zIndex: curr.zIndex },
        { trackId: prev.id, zIndex: prev.zIndex }
      ]
    }
  });
  notify(`Reordered track ${curr.name || curr.id}`, 'success');
};

window.moveTrackDown = async function(trackId) {
  if (!state.project) return;
  const tracks = [...(state.project.tracks || [])].sort((a, b) => b.zIndex - a.zIndex);
  const idx = tracks.findIndex(t => t.id === trackId);
  if (idx === -1 || idx >= tracks.length - 1) return;
  const next = tracks[idx + 1];
  const curr = tracks[idx];
  const tempZ = next.zIndex;
  next.zIndex = curr.zIndex;
  curr.zIndex = tempZ;
  await dispatchOperation({
    type: 'reorder_tracks',
    params: {
      trackOrders: [
        { trackId: curr.id, zIndex: curr.zIndex },
        { trackId: next.id, zIndex: next.zIndex }
      ]
    }
  });
  notify(`Reordered track ${curr.name || curr.id}`, 'success');
};

// Inspector Panel Rendering
function renderInspector() {
  if (!state.project || !state.selectedClipId) {
    dom.inspectorContent.innerHTML = `<div class="empty-state">Select a clip on the timeline or canvas to inspect and edit its properties.</div>`;
    dom.cgTargetName.innerText = 'Project Master';
    return;
  }

  const clip = (state.project.clips || []).find(c => c.id === state.selectedClipId);
  if (!clip) return;

  const inSec = (clip.startTick / 120000).toFixed(3);
  const durSec = (clip.durationTicks / 120000).toFixed(3);

  let formHtml = `
    <div class="form-group">
      <label>Clip ID</label>
      <input type="text" class="form-control" value="${clip.id}" disabled>
    </div>
    <div class="form-group">
      <label>Track Assignment</label>
      <input type="text" class="form-control" value="${clip.trackId}" disabled>
    </div>
    <div class="slider-row">
      <div class="slider-header">
        <label>Start Tick (In)</label>
        <span class="slider-val">${inSec}s (${clip.startTick})</span>
      </div>
      <input type="number" id="inp-startTick" class="form-control" value="${clip.startTick}" onchange="updateTiming()">
    </div>
    <div class="slider-row">
      <div class="slider-header">
        <label>Duration Ticks</label>
        <span class="slider-val">${durSec}s (${clip.durationTicks})</span>
      </div>
      <input type="number" id="inp-durationTicks" class="form-control" value="${clip.durationTicks}" onchange="updateTiming()">
    </div>
    <div class="cg-section" style="margin-top: 1rem;">
      <div class="cg-section-title">Transform & Position (Draggable)</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
        <div class="form-group">
          <label>Position X (px)</label>
          <input type="number" id="inp-posX" class="form-control" value="${(clip.transform && clip.transform.x !== undefined) ? clip.transform.x : 960}" onchange="updateTransform()">
        </div>
        <div class="form-group">
          <label>Position Y (px)</label>
          <input type="number" id="inp-posY" class="form-control" value="${(clip.transform && clip.transform.y !== undefined) ? clip.transform.y : 540}" onchange="updateTransform()">
        </div>
      </div>
    </div>
  `;

  if (clip.type === 'text') {
    const typo = clip.typography || {};
    formHtml += `
      <div class="cg-section" style="margin-top: 1rem;">
        <div class="cg-section-title">Typography & Size Fixer</div>
        <div class="form-group">
          <label>Text Content</label>
          <input type="text" id="inp-text" class="form-control" value="${typo.text || ''}" onchange="updateTypography()">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
          <div class="form-group">
            <label>Font Size (px)</label>
            <input type="number" id="inp-fontSize" class="form-control" value="${typo.fontSize || 32}" onchange="updateTypography()">
          </div>
          <div class="form-group">
            <label>Tracking (Spacing)</label>
            <input type="number" id="inp-letterSpacing" class="form-control" value="${typo.letterSpacing || 0}" onchange="updateTypography()">
          </div>
        </div>
        <div class="form-group">
          <label>Color</label>
          <input type="color" id="inp-color" class="form-control" value="${typo.color || '#ffffff'}" onchange="updateTypography()">
        </div>
      </div>
    `;
  }

  dom.inspectorContent.innerHTML = formHtml;
}

// Update Timing from form
window.updateTiming = function() {
  const clip = (state.project.clips || []).find(c => c.id === state.selectedClipId);
  if (!clip) return Promise.resolve();

  const newStart = parseInt(document.getElementById('inp-startTick').value, 10);
  const newDur = parseInt(document.getElementById('inp-durationTicks').value, 10);

  if (newStart !== clip.startTick) {
    return dispatchOperation({
      type: 'move_clip',
      params: { clipId: clip.id, newStartTick: newStart }
    });
  } else if (newDur !== clip.durationTicks) {
    return dispatchOperation({
      type: 'trim_clip',
      params: { clipId: clip.id, newDurationTicks: newDur }
    });
  }
  return Promise.resolve();
};

window.updateTransform = function() {
  const clip = (state.project.clips || []).find(c => c.id === state.selectedClipId);
  if (!clip) return Promise.resolve();

  const x = parseInt(document.getElementById('inp-posX').value, 10);
  const y = parseInt(document.getElementById('inp-posY').value, 10);

  return dispatchOperation({
    type: 'modify_clip',
    params: {
      clipId: clip.id,
      transform: { x, y }
    }
  });
};

window.updateTypography = function() {
  const clip = (state.project.clips || []).find(c => c.id === state.selectedClipId);
  if (!clip) return Promise.resolve();

  const text = document.getElementById('inp-text').value;
  const fontSize = parseInt(document.getElementById('inp-fontSize').value, 10);
  const letterSpacing = parseInt(document.getElementById('inp-letterSpacing')?.value || 0, 10);
  const color = document.getElementById('inp-color').value;

  return dispatchOperation({
    type: 'modify_clip',
    params: {
      clipId: clip.id,
      typography: { text, fontSize, letterSpacing, color }
    }
  });
};

// Sync Color Grading UI Controls from State
function syncColorControlsToState() {
  const g = (state.colorDraft.active && state.colorDraft.grade)
    ? state.colorDraft.grade
    : (state.persistedGrade || state.currentGrade || createDefaultGrade());

  if (dom.cgExposure) {
    dom.cgExposure.value = g.exposure !== undefined ? g.exposure : 0.0;
    dom.cgExpVal.innerText = `${(g.exposure || 0) > 0 ? '+' : ''}${(g.exposure || 0).toFixed(2)} EV`;
  }
  if (dom.cgTemperature) {
    dom.cgTemperature.value = Math.round((g.whiteBalance?.temperature || 0) * 100);
    dom.cgTempVal.innerText = `${Math.round((g.whiteBalance?.temperature || 0) * 100)}`;
  }
  if (dom.cgTint) {
    dom.cgTint.value = Math.round((g.whiteBalance?.tint || 0) * 100);
    dom.cgTintVal.innerText = `${Math.round((g.whiteBalance?.tint || 0) * 100)}`;
  }
  if (dom.cgLift) {
    dom.cgLift.value = g.primary?.lift?.[0] !== undefined ? g.primary.lift[0] : 0.0;
    dom.cgLiftVal.innerText = (g.primary?.lift?.[0] || 0.0).toFixed(2);
  }
  if (dom.cgGamma) {
    dom.cgGamma.value = g.primary?.gamma?.[0] !== undefined ? g.primary.gamma[0] : 1.0;
    dom.cgGammaVal.innerText = (g.primary?.gamma?.[0] || 1.0).toFixed(2);
  }
  if (dom.cgGain) {
    dom.cgGain.value = g.primary?.gain?.[0] !== undefined ? g.primary.gain[0] : 1.0;
    dom.cgGainVal.innerText = (g.primary?.gain?.[0] || 1.0).toFixed(2);
  }
  if (dom.cgLutSelect) {
    dom.cgLutSelect.value = (g.lut && g.lut.enabled) ? (g.lut.lutId || '') : '';
  }
  if (dom.cgLutIntensity) {
    dom.cgLutIntensity.value = g.lut?.intensity !== undefined ? g.lut.intensity : 1.0;
    dom.cgLutIntensityVal.innerText = `${Math.round((g.lut?.intensity !== undefined ? g.lut.intensity : 1.0) * 100)}%`;
  }
  if (dom.cgSkinProtectToggle) {
    dom.cgSkinProtectToggle.checked = !!g.skinProtection?.enabled;
  }
  if (dom.cgSkinWeight) {
    dom.cgSkinWeight.value = g.skinProtection?.weight !== undefined ? g.skinProtection.weight : 0.85;
    dom.cgSkinWeightVal.innerText = (g.skinProtection?.weight !== undefined ? g.skinProtection.weight : 0.85).toFixed(2);
  }

  // Secondary HSL controls
  if (dom.cgHslRed && g.hsl?.red) {
    dom.cgHslRed.value = g.hsl.red.saturation || 0;
    if (dom.cgHslRedVal) dom.cgHslRedVal.innerText = `${Math.round((g.hsl.red.saturation || 0) * 100)}%`;
  }
  if (dom.cgHslYellow && g.hsl?.yellow) {
    dom.cgHslYellow.value = g.hsl.yellow.saturation || 0;
    if (dom.cgHslYellowVal) dom.cgHslYellowVal.innerText = `${Math.round((g.hsl.yellow.saturation || 0) * 100)}%`;
  }
  if (dom.cgHslGreen && g.hsl?.green) {
    dom.cgHslGreen.value = g.hsl.green.saturation || 0;
    if (dom.cgHslGreenVal) dom.cgHslGreenVal.innerText = `${Math.round((g.hsl.green.saturation || 0) * 100)}%`;
  }
  if (dom.cgHslCyan && g.hsl?.cyan) {
    dom.cgHslCyan.value = g.hsl.cyan.saturation || 0;
    if (dom.cgHslCyanVal) dom.cgHslCyanVal.innerText = `${Math.round((g.hsl.cyan.saturation || 0) * 100)}%`;
  }
  if (dom.cgHslBlue && g.hsl?.blue) {
    dom.cgHslBlue.value = g.hsl.blue.saturation || 0;
    if (dom.cgHslBlueVal) dom.cgHslBlueVal.innerText = `${Math.round((g.hsl.blue.saturation || 0) * 100)}%`;
  }
}

function renderPreviewDataUri(dataUri) {
  if (!dom.colorPreviewCanvas) return;
  const canvas = dom.colorPreviewCanvas;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    canvas.width = img.naturalWidth || 640;
    canvas.height = img.naturalHeight || 360;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.classList.remove('hidden');
    if (dom.previewStage) dom.previewStage.style.filter = '';
  };
  img.src = dataUri;
}

function scheduleLiveColorPreview() {
  if (state.colorDraft.debounceTimer) {
    clearTimeout(state.colorDraft.debounceTimer);
  }
  state.colorDraft.debounceTimer = setTimeout(() => {
    executeLiveColorPreview();
  }, 60);
}

async function executeLiveColorPreview() {
  if (state.colorDraft.abortController) {
    state.colorDraft.abortController.abort();
  }
  const controller = new AbortController();
  state.colorDraft.abortController = controller;

  const currentVersion = state.colorDraft.version;
  const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  state.colorDraft.pendingRequestId = requestId;

  const payload = {
    projectId: state.project?.id || null,
    clipId: state.selectedClipId || null,
    frameTick: state.playheadTick || 0,
    expectedBaseRevision: state.project?.revision || 0,
    requestId,
    draftVersion: currentVersion,
    grade: state.colorDraft.grade
  };

  try {
    const res = await fetch('/api/color/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await res.json();

    // --- MANDATORY STALE-RESPONSE VALIDATION (Architecture Correction 1) ---
    if (!data || !data.success) {
      if (data && data.error) console.warn('Color preview rejection:', data.error);
      return;
    }
    if (!state.colorDraft.active) return;
    if (data.requestId !== state.colorDraft.pendingRequestId) return;
    if (data.draftVersion !== state.colorDraft.version) return;
    if (data.projectId !== (state.project?.id || null)) return;
    if (data.clipId !== (state.selectedClipId || null)) return;
    if (data.frameTick !== (state.playheadTick || 0)) return;
    if (data.baseRevision !== (state.project?.revision || 0)) return;

    state.colorDraft.cachedGradedUri = data.previewDataUri;

    if (!state.colorDraft.isComparing && !state.colorDraft.bypassMode) {
      renderPreviewDataUri(data.previewDataUri);
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Color preview fetch error:', err);
    }
  }
}

// Hold-to-Compare Implementations
async function startHoldCompare() {
  state.colorDraft.isComparing = true;
  if (dom.cgBtnCompare) dom.cgBtnCompare.classList.add('active');
  if (dom.compareIndicatorOverlay) dom.compareIndicatorOverlay.classList.remove('hidden');

  if (state.colorDraft.cachedBaseFrameUri) {
    renderPreviewDataUri(state.colorDraft.cachedBaseFrameUri);
  } else {
    try {
      const res = await fetch('/api/preview/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipId: state.selectedClipId || null,
          frameTick: state.playheadTick || 0
        })
      });
      const data = await res.json();
      if (data.success && data.previewDataUri) {
        state.colorDraft.cachedBaseFrameUri = data.previewDataUri;
        if (state.colorDraft.isComparing || state.colorDraft.bypassMode) {
          renderPreviewDataUri(data.previewDataUri);
        }
      }
    } catch (e) {}
  }
}

function endHoldCompare() {
  state.colorDraft.isComparing = false;
  if (dom.cgBtnCompare) dom.cgBtnCompare.classList.remove('active');
  if (!state.colorDraft.bypassMode) {
    if (dom.compareIndicatorOverlay) dom.compareIndicatorOverlay.classList.add('hidden');
    if (state.colorDraft.cachedGradedUri) {
      renderPreviewDataUri(state.colorDraft.cachedGradedUri);
    }
  }
}

function toggleCompareMode() {
  state.colorDraft.bypassMode = !state.colorDraft.bypassMode;
  if (dom.cgToggleCompare) {
    dom.cgToggleCompare.innerText = state.colorDraft.bypassMode ? 'Bypass: On' : 'Bypass: Off';
    dom.cgToggleCompare.classList.toggle('active', state.colorDraft.bypassMode);
  }
  if (state.colorDraft.bypassMode) {
    startHoldCompare();
  } else {
    endHoldCompare();
  }
}

// Auto True Tone Analysis
async function runAutoTrueTone() {
  try {
    const res = await fetch('/api/scene-analysis');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const a = data.analysis;
    const g = ensureDraftGradeInitialized();
    g.exposure = a.exposure.recommendedEvOffset || 0.0;
    g.whiteBalance.temperature = a.whiteBalance.recommendedTemperatureOffset || 0.0;
    g.whiteBalance.tint = a.whiteBalance.recommendedTintOffset || 0.0;
    if (a.skin && a.skin.skinDetected) {
      g.skinProtection.enabled = true;
      g.skinProtection.weight = a.skin.recommendedProtectionWeight || 0.85;
    }

    onColorParamChanged();
    syncColorControlsToState();
    notify(`Auto True Tone Applied! EV: ${a.exposure.recommendedEvOffset}, CCT: ${a.whiteBalance.estimatedCCT}K`, 'success');
  } catch (err) {
    notify(`Scene Analysis failed: ${err.message}`, 'error');
  }
}

// Transactional Apply
async function saveColorGrade() {
  try {
    const gradeToCommit = state.colorDraft.active ? state.colorDraft.grade : state.currentGrade;
    const expectedBaseRevision = state.project?.revision || 0;

    const payload = {
      grade: gradeToCommit,
      clipId: state.selectedClipId || undefined,
      expectedBaseRevision
    };

    const res = await fetch('/api/color/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 409 || data.errorCode === 'STALE_REVISION') {
        notify(`Concurrent modification conflict! Project was modified elsewhere (rev ${data.project?.revision || 'unknown'}). Please reload.`, 'error');
        await loadProject(state.activePath);
        return;
      }
      throw new Error(data.error || 'Failed to apply grade');
    }

    state.project = data.project;
    state.currentGrade = structuredClone(gradeToCommit);
    state.persistedGrade = structuredClone(gradeToCommit);
    state.colorDraft.active = false;
    if (dom.cgDraftBadge) dom.cgDraftBadge.classList.add('hidden');

    notify(`Color grade committed to ${payload.clipId ? `clip ${payload.clipId}` : 'project master'} (rev ${data.revision})!`, 'success');
  } catch (err) {
    notify(`Failed to apply color grade: ${err.message}`, 'error');
  }
}

// Discard Draft
function discardColorDraft() {
  if (state.colorDraft.abortController) {
    state.colorDraft.abortController.abort();
  }
  if (state.colorDraft.debounceTimer) {
    clearTimeout(state.colorDraft.debounceTimer);
  }

  state.colorDraft.active = false;
  state.colorDraft.version = 0;
  state.colorDraft.grade = structuredClone(state.persistedGrade || state.currentGrade);

  if (dom.cgDraftBadge) dom.cgDraftBadge.classList.add('hidden');
  if (dom.colorPreviewCanvas) dom.colorPreviewCanvas.classList.add('hidden');
  if (dom.previewStage) dom.previewStage.style.filter = '';

  syncColorControlsToState();
  notify('Grade draft discarded. Restored committed state.', 'info');
}

// On-Canvas Interactive Drag & Transform Resize Engine ("Size Fixer")
let canvasInteractionState = {
  drag: null,
  resize: null
};

function setupCanvasInteractions() {
  if (window.__canvasInteractionsInitialized) return;
  window.__canvasInteractionsInitialized = true;

  dom.previewStage.addEventListener('mousedown', (e) => {
    if (!state.project) return;
    const handle = e.target.closest('.resize-handle');
    const box = e.target.closest('.canvas-element-box');
    if (!handle && !box) return;

    const canvas = state.project.canvas;
    let targetRatio = canvas.width / canvas.height;
    if (state.previewRatio === '9:16') targetRatio = 9 / 16;
    else if (state.previewRatio === '1:1') targetRatio = 1.0;
    else if (state.previewRatio === '4:3') targetRatio = 4 / 3;
    else if (state.previewRatio === '16:9') targetRatio = 16 / 9;

    let stageW = 480;
    if (state.previewScale === '0.75') stageW = 360;
    else if (state.previewScale === '0.5') stageW = 240;
    else if (state.previewScale === '1.0') stageW = 560;
    const scale = stageW / canvas.width;

    if (handle) {
      e.preventDefault();
      e.stopPropagation();
      const clipId = handle.dataset.clipId;
      const clip = (state.project.clips || []).find(c => c.id === clipId);
      if (!clip) return;

      const boxEl = document.getElementById(`pv-${clipId}`);
      if (!boxEl) return;
      const innerEl = boxEl.querySelector('.canvas-element-inner');
      const badgeEl = document.getElementById(`badge-${clipId}`);

      const rect = boxEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startDist = Math.hypot(e.clientX - centerX, e.clientY - centerY);

      canvasInteractionState.resize = {
        clipId,
        handleType: handle.dataset.handle,
        boxEl,
        innerEl,
        badgeEl,
        centerX,
        centerY,
        startDist,
        initialFontSize: (clip.typography && clip.typography.fontSize) || 32,
        currentFontSize: (clip.typography && clip.typography.fontSize) || 32,
        clipX: clip.transform?.x !== undefined ? clip.transform.x : 960,
        clipY: clip.transform?.y !== undefined ? clip.transform.y : 540,
        scale
      };
      return;
    }

    if (box) {
      e.preventDefault();
      e.stopPropagation();
      const clipId = box.dataset.clipId;
      if (clipId !== state.selectedClipId) {
        selectClip(clipId);
      }
      const clip = (state.project.clips || []).find(c => c.id === clipId);
      if (!clip) return;

      const badgeEl = document.getElementById(`badge-${clipId}`);
      canvasInteractionState.drag = {
        clipId,
        boxEl: box,
        badgeEl,
        startClientX: e.clientX,
        startClientY: e.clientY,
        initialX: clip.transform?.x !== undefined ? clip.transform.x : 960,
        initialY: clip.transform?.y !== undefined ? clip.transform.y : 540,
        currentX: clip.transform?.x !== undefined ? clip.transform.x : 960,
        currentY: clip.transform?.y !== undefined ? clip.transform.y : 540,
        fontSize: (clip.typography && clip.typography.fontSize) || 32,
        scale
      };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (canvasInteractionState.resize) {
      const rs = canvasInteractionState.resize;
      const currDist = Math.hypot(e.clientX - rs.centerX, e.clientY - rs.centerY);
      const ratio = rs.startDist > 4 ? (currDist / rs.startDist) : 1;
      const newSize = Math.max(12, Math.min(260, Math.round(rs.initialFontSize * ratio)));
      rs.currentFontSize = newSize;

      if (rs.innerEl) {
        rs.innerEl.style.fontSize = `${newSize * rs.scale}px`;
      }
      if (rs.badgeEl) {
        rs.badgeEl.innerText = `${newSize}px • (${Math.round(rs.clipX)}, ${Math.round(rs.clipY)})`;
      }
      const inpSize = document.getElementById('inp-fontSize');
      if (inpSize) inpSize.value = newSize;
      return;
    }

    if (canvasInteractionState.drag) {
      const dg = canvasInteractionState.drag;
      const dxPx = e.clientX - dg.startClientX;
      const dyPx = e.clientY - dg.startClientY;
      const newX = Math.round(dg.initialX + dxPx / dg.scale);
      const newY = Math.round(dg.initialY + dyPx / dg.scale);
      dg.currentX = newX;
      dg.currentY = newY;

      if (dg.boxEl) {
        dg.boxEl.style.left = `${newX * dg.scale}px`;
        dg.boxEl.style.top = `${newY * dg.scale}px`;
      }
      if (dg.badgeEl) {
        dg.badgeEl.innerText = `${dg.fontSize}px • (${newX}, ${newY})`;
      }
      const inpX = document.getElementById('inp-posX');
      const inpY = document.getElementById('inp-posY');
      if (inpX) inpX.value = newX;
      if (inpY) inpY.value = newY;
    }
  });

  window.addEventListener('mouseup', async () => {
    if (canvasInteractionState.resize) {
      const { clipId, currentFontSize, initialFontSize } = canvasInteractionState.resize;
      canvasInteractionState.resize = null;
      if (currentFontSize !== initialFontSize) {
        await dispatchOperation({
          type: 'modify_clip',
          params: {
            clipId,
            typography: { fontSize: currentFontSize }
          }
        });
        notify(`Resized text to ${currentFontSize}px`, 'success');
      }
    }
    if (canvasInteractionState.drag) {
      const { clipId, currentX, currentY, initialX, initialY } = canvasInteractionState.drag;
      canvasInteractionState.drag = null;
      if (currentX !== initialX || currentY !== initialY) {
        await dispatchOperation({
          type: 'modify_clip',
          params: {
            clipId,
            transform: { x: currentX, y: currentY }
          }
        });
        notify(`Repositioned clip to (${currentX}, ${currentY})`, 'success');
      }
    }
  });
}

// Timeline Drag & Scrub Engine with Magnetic Snapping
function cancelTimelineGesture(reason = 'Cancelled') {
  if (!state.dragState) return;
  const clipId = state.dragState.clipId;
  const el = clipId ? document.getElementById(`clip-block-${clipId}`) : null;
  if (el) {
    el.style.transform = '';
    el.classList.remove('clip-dragging-proposal');
  }
  state.dragState = null;
  if (dom.timelineSnapGuide) dom.timelineSnapGuide.classList.add('hidden');
  renderTimeline();
}
window.cancelTimelineGesture = cancelTimelineGesture;

function setupTimelineInteractions() {
  const tracksArea = dom.timelineTracksArea;
  const ruler = dom.timelineRuler;

  // Ruler Scrubbing
  ruler.addEventListener('mousedown', (e) => {
    state.dragState = { type: 'scrub' };
    updatePlayheadFromMouseEvent(e);
  });

  // Multitrack Lanes Interaction (Clips & Handles)
  dom.timelineLanes.addEventListener('mousedown', async (e) => {
    if (!state.project) return;

    const handle = e.target.closest('.trim-handle');
    if (handle) {
      e.stopPropagation();
      const clipId = handle.dataset.clipId;
      const edge = handle.dataset.edge; // 'in' or 'out'
      const clip = state.project.clips.find(c => c.id === clipId);
      if (!clip) return;
      const track = (state.project.tracks || []).find(t => t.id === clip.trackId);
      if (track && track.locked) {
        notify(`Cannot edit clip on locked track "${track.id}"`, 'warning');
        return;
      }
      state.dragState = {
        type: 'trim',
        clipId,
        edge,
        startX: e.clientX,
        origStartTick: clip.startTick,
        origDurationTicks: clip.durationTicks,
        isRipple: state.activeTool === 'ripple'
      };
      return;
    }

    const clipBlock = e.target.closest('.timeline-clip-block');
    if (clipBlock) {
      const clipId = clipBlock.dataset.clipId;
      const clip = state.project.clips.find(c => c.id === clipId);
      if (!clip) return;
      const track = (state.project.tracks || []).find(t => t.id === clip.trackId);
      if (track && track.locked) {
        notify(`Cannot edit clip on locked track "${track.id}"`, 'warning');
        return;
      }
      selectClip(clipId);

      if (state.activeTool === 'blade') {
        const blockRect = clipBlock.getBoundingClientRect();
        const offsetX = e.clientX - blockRect.left;
        const clickedTick = clip.startTick + pixelToTick(offsetX);
        if (clickedTick > clip.startTick + 600 && clickedTick < (clip.startTick + clip.durationTicks - 600)) {
          setPlayheadTick(clickedTick);
          try {
            await dispatchOperation({
              type: 'split_clip',
              params: {
                clipId: clip.id,
                splitTick: clickedTick
              }
            });
            notify(`Split clip at ${(clickedTick / 120000).toFixed(2)}s`, 'success');
          } catch (err) {
            renderTimeline();
          }
          return;
        } else {
          notify('Split point must be strictly inside clip boundaries', 'warning');
          return;
        }
      }

      if (state.activeTool === 'slip') {
        state.dragState = {
          type: 'slip',
          clipId,
          startX: e.clientX,
          origTrimIn: clip.source?.trimInTick || 0
        };
      } else if (state.activeTool === 'slide') {
        state.dragState = {
          type: 'slide',
          clipId,
          startX: e.clientX,
          origStartTick: clip.startTick
        };
      } else {
        state.dragState = {
          type: 'move',
          clipId,
          startX: e.clientX,
          origStartTick: clip.startTick
        };
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.dragState) return;

    if (state.dragState.type === 'scrub') {
      updatePlayheadFromMouseEvent(e);
      return;
    }

    const pixelsPerTick = getPixelsPerTick();
    const deltaPx = e.clientX - state.dragState.startX;
    const deltaTicks = Math.round(deltaPx / pixelsPerTick);

    // Compute magnetic snap
    let snapTick = null;
    if (state.isSnapping && state.project) {
      const thresholdTicks = Math.round(20 / pixelsPerTick);
      const candidateTick = state.dragState.type === 'move' ? (state.dragState.origStartTick + deltaTicks) : state.currentTick;
      const snapRes = computeMagneticSnapForUI(candidateTick, state.project, thresholdTicks, state.currentTick);
      if (snapRes.isSnapped) {
        snapTick = snapRes.snappedTick;
      }
    }
    state.dragState.snappedTick = snapTick;

    if (snapTick !== null) {
      dom.timelineSnapGuide.classList.remove('hidden');
      dom.timelineSnapGuide.style.left = `${tickToPixel(snapTick)}px`;
    } else {
      dom.timelineSnapGuide.classList.add('hidden');
    }

    // Render transient proposal ghost for moved clip
    if (state.dragState.type === 'move' && state.dragState.clipId) {
      const clipEl = document.getElementById(`clip-block-${state.dragState.clipId}`);
      if (clipEl) {
        const effectiveDeltaTicks = snapTick !== null ? (snapTick - state.dragState.origStartTick) : deltaTicks;
        clipEl.style.transform = `translateX(${tickToPixel(effectiveDeltaTicks)}px)`;
        clipEl.classList.add('clip-dragging-proposal');
      }
    }
  });

  window.addEventListener('mouseup', async (e) => {
    if (dom.timelineSnapGuide) dom.timelineSnapGuide.classList.add('hidden');
    if (!state.dragState) return;

    const ds = state.dragState;
    const clipEl = ds.clipId ? document.getElementById(`clip-block-${ds.clipId}`) : null;
    if (clipEl) {
      clipEl.style.transform = '';
      clipEl.classList.remove('clip-dragging-proposal');
    }
    state.dragState = null;

    if (ds.type === 'scrub') return;

    const pixelsPerTick = getPixelsPerTick();
    const deltaPx = e.clientX - ds.startX;
    const deltaTicks = Math.round(deltaPx / pixelsPerTick);

    try {
      if (ds.type === 'move') {
        const targetTick = (ds.snappedTick !== undefined && ds.snappedTick !== null)
          ? ds.snappedTick
          : Math.max(0, ds.origStartTick + deltaTicks);
        if (targetTick !== ds.origStartTick) {
          await dispatchOperation({
            type: 'move_clip',
            params: {
              clipId: ds.clipId,
              targetTick
            }
          });
          notify(`Moved clip to ${(targetTick / 120000).toFixed(2)}s`, 'success');
        }
      } else if (ds.type === 'trim') {
        if (deltaTicks !== 0) {
          if (ds.isRipple) {
            await dispatchOperation({
              type: 'ripple_trim',
              params: {
                clipId: ds.clipId,
                edge: ds.edge, // 'in' or 'out'
                deltaTicks
              }
            });
            notify(`Ripple trimmed ${ds.edge} edge by ${(deltaTicks / 120000).toFixed(2)}s`, 'success');
          } else {
            const clip = (state.project?.clips || []).find(c => c.id === ds.clipId);
            if (!clip) return;
            if (ds.edge === 'out') {
              const newDurationTicks = ds.origDurationTicks + deltaTicks;
              if (newDurationTicks <= 0) throw new Error('Trim duration must be positive');
              const curIn = clip.source?.trimInTick || 0;
              const trimOutTick = (clip.source?.trimOutTick !== undefined ? clip.source.trimOutTick : curIn + ds.origDurationTicks) + deltaTicks;
              await dispatchOperation({
                type: 'trim_clip',
                params: {
                  clipId: ds.clipId,
                  newDurationTicks,
                  trimOutTick
                }
              });
              notify(`Trimmed out-point by ${(deltaTicks / 120000).toFixed(2)}s`, 'success');
            } else { // ds.edge === 'in'
              const newStartTick = Math.max(0, ds.origStartTick + deltaTicks);
              const newDurationTicks = ds.origDurationTicks - deltaTicks;
              if (newDurationTicks <= 0) throw new Error('Trim duration must be positive');
              const trimInTick = Math.max(0, (clip.source?.trimInTick || 0) + deltaTicks);
              await dispatchOperation({
                type: 'trim_clip',
                params: {
                  clipId: ds.clipId,
                  newStartTick,
                  newDurationTicks,
                  trimInTick
                }
              });
              notify(`Trimmed in-point by ${(deltaTicks / 120000).toFixed(2)}s`, 'success');
            }
          }
        }
      } else if (ds.type === 'slip') {
        if (deltaTicks !== 0) {
          await dispatchOperation({
            type: 'slip_clip',
            params: {
              clipId: ds.clipId,
              deltaTicks
            }
          });
          notify(`Slipped source by ${(deltaTicks / 120000).toFixed(2)}s`, 'success');
        }
      } else if (ds.type === 'slide') {
        if (deltaTicks !== 0) {
          await dispatchOperation({
            type: 'slide_clip',
            params: {
              clipId: ds.clipId,
              deltaTicks
            }
          });
          notify(`Slid clip by ${(deltaTicks / 120000).toFixed(2)}s`, 'success');
        }
      }
    } catch (err) {
      renderTimeline();
    }
  });

  window.addEventListener('blur', () => {
    if (state.dragState) cancelTimelineGesture('Window blur');
  });

  window.addEventListener('pointercancel', () => {
    if (state.dragState) cancelTimelineGesture('Pointer cancelled');
  });
}

function updatePlayheadFromMouseEvent(e) {
  const rulerRect = dom.timelineRuler.getBoundingClientRect();
  const clickX = e.clientX - rulerRect.left + dom.timelineTracksArea.scrollLeft;
  let targetTick = pixelToTick(clickX);
  const totalTicks = state.project ? (state.project.timebase?.durationTicks || 120000) : 120000;
  targetTick = Math.max(0, Math.min(totalTicks, targetTick));

  // Magnetic snapping for playhead
  if (state.isSnapping && state.project) {
    const thresholdTicks = Math.round(15 / getPixelsPerTick());
    const snapRes = computeMagneticSnapForUI(targetTick, state.project, thresholdTicks, null);
    if (snapRes.isSnapped) {
      targetTick = snapRes.snappedTick;
    }
  }

  setPlayheadTick(targetTick);
}

// CapCut Draft Import Functions
function loadSampleCapCutProject() {
  const sample = {
    id: "capcut_sample_draft_01",
    name: "CapCut Reverse Engineered Draft",
    fps: 30,
    duration: 5000000, // 5.0 seconds in microseconds
    canvas_config: { width: 1080, height: 1920, ratio: "9:16" },
    materials: {
      videos: [
        { id: "mat_video_1", path: "assets/sample_1.mp4", duration: 5000000 },
        { id: "mat_video_2", path: "assets/sample_2.mp4", duration: 5000000 }
      ]
    },
    tracks: [
      {
        id: "t_v1",
        type: "video",
        mute: false,
        segments: [
          {
            id: "seg_1",
            material_id: "mat_video_1",
            source_timerange: { start: 0, duration: 2500000 },
            target_timerange: { start: 0, duration: 2500000 }
          },
          {
            id: "seg_2",
            material_id: "mat_video_2",
            source_timerange: { start: 0, duration: 2500000 },
            target_timerange: { start: 2500000, duration: 2500000 }
          }
        ]
      },
      {
        id: "t_a1",
        type: "audio",
        mute: false,
        segments: [
          {
            id: "seg_audio_1",
            material_id: "mat_audio_1",
            source_timerange: { start: 0, duration: 5000000 },
            target_timerange: { start: 0, duration: 5000000 }
          }
        ]
      }
    ]
  };
  dom.capcutJsonInput.value = JSON.stringify(sample, null, 2);
}

async function submitCapCutImport() {
  const jsonStr = dom.capcutJsonInput.value.trim();
  if (!jsonStr) {
    return notify('Please paste or load CapCut draft JSON first', 'warning');
  }

  try {
    const draftInfo = JSON.parse(jsonStr);
    const res = await fetch('/api/capcut/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftInfo })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.project = data.project;
    state.selectedClipId = null;
    state.currentTick = 0;
    dom.modalCapcut.classList.add('hidden');
    updateUI();
    notify(`CapCut draft imported successfully! Converted ${data.project.clips.length} clips with exact ticks`, 'success');
  } catch (err) {
    notify(`CapCut Import failed: ${err.message}`, 'error');
  }
}

// ==========================================================================
// Phase PF-10 Stage 3: Multi-Revision DAG, Candidates, & AI Revision Surface
// ==========================================================================

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function fetchCandidates() {
  if (dom.candidatesLoading) dom.candidatesLoading.classList.remove('hidden');
  if (dom.candidatesEmpty) dom.candidatesEmpty.classList.add('hidden');
  if (dom.candidatesError) dom.candidatesError.classList.add('hidden');

  try {
    const res = await fetch('/api/candidates');
    if (res.ok) {
      const data = await res.json();
      state.candidateSet = data;
      if (dom.candidatesLoading) dom.candidatesLoading.classList.add('hidden');
      renderCandidatesUI();
    } else if (res.status === 404) {
      state.candidateSet = null;
      if (dom.candidatesLoading) dom.candidatesLoading.classList.add('hidden');
      if (dom.candidatesEmpty) dom.candidatesEmpty.classList.remove('hidden');
      renderCandidatesUI();
    } else {
      const err = await res.json().catch(() => ({}));
      state.candidateSet = null;
      if (dom.candidatesLoading) dom.candidatesLoading.classList.add('hidden');
      if (dom.candidatesError) {
        dom.candidatesError.classList.remove('hidden');
        if (dom.candidatesErrorMsg) dom.candidatesErrorMsg.innerText = err.error || 'Failed to load candidates';
      }
      renderCandidatesUI();
    }
  } catch (err) {
    state.candidateSet = null;
    if (dom.candidatesLoading) dom.candidatesLoading.classList.add('hidden');
    if (dom.candidatesError) {
      dom.candidatesError.classList.remove('hidden');
      if (dom.candidatesErrorMsg) dom.candidatesErrorMsg.innerText = err.message || 'Network error loading candidates';
    }
    renderCandidatesUI();
  }
}

function renderCandidatesUI() {
  if (!dom.candidatesGrid) return;

  const setDoc = state.candidateSet;
  if (!setDoc || !Array.isArray(setDoc.candidates) || setDoc.candidates.length === 0) {
    if (dom.candidatesEmpty) dom.candidatesEmpty.classList.remove('hidden');
    dom.candidatesGrid.innerHTML = '';
    if (dom.candSetId) dom.candSetId.innerText = '—';
    if (dom.candSelectedId) dom.candSelectedId.innerText = '—';
    if (dom.candCountBadge) dom.candCountBadge.innerText = '0';
    return;
  }

  if (dom.candidatesEmpty) dom.candidatesEmpty.classList.add('hidden');
  if (dom.candSetId) dom.candSetId.innerText = setDoc.candidate_set_id || '—';
  if (dom.candSelectedId) dom.candSelectedId.innerText = setDoc.selected_candidate_id || state.session?.selected_candidate_id || 'None';
  if (dom.candCountBadge) dom.candCountBadge.innerText = setDoc.candidates.length;

  dom.candidatesGrid.innerHTML = setDoc.candidates.map(c => {
    const isSelected = c.candidate_id === (setDoc.selected_candidate_id || state.session?.selected_candidate_id);
    const isPreviewing = c.candidate_id === state.previewedCandidateId;
    const isEligible = !!c.isEligible;

    let cardClass = 'cand-card';
    if (isSelected) cardClass += ' active-cand';
    if (isPreviewing) cardClass += ' previewing-cand';
    if (!isEligible) cardClass += ' ineligible';

    let badgeClass = isEligible ? 'badge-status-eligible' : 'badge-status-ineligible';
    let badgeText = isSelected ? 'SELECTED / ACTIVE' : (isEligible ? 'ELIGIBLE' : 'INELIGIBLE');

    const qaColor = c.qa_score >= 80 ? '#34d399' : '#f87171';
    const shortSha = c.media_sha256 ? c.media_sha256.slice(0, 12) + '...' : '—';
    const rankStr = c.musical_rank !== null && c.musical_rank !== undefined ? `#${c.musical_rank}` : '—';
    const compositeStr = c.musical_composite_score !== null && c.musical_composite_score !== undefined ? Number(c.musical_composite_score).toFixed(3) : '—';
    const prefStr = c.preference_score !== null && c.preference_score !== undefined ? Number(c.preference_score).toFixed(2) : '—';

    return `
      <div id="cand-card-${c.candidate_id}" class="${cardClass}">
        <div class="cand-header-row">
          <div class="cand-title-group">
            <span class="cand-id-chip">${c.candidate_id}</span>
            <span class="cand-profile-tag">${escapeHtml(c.profile_name || c.profile_id)}</span>
          </div>
          <span class="cand-status-badge ${badgeClass}">${badgeText}</span>
        </div>

        <div class="cand-metrics-grid">
          <div class="cand-metric-chip">
            <span class="cand-metric-label">QA Compliance:</span>
            <span class="cand-metric-val" style="color: ${qaColor}">${c.qa_score}/100 (${c.status})</span>
          </div>
          <div class="cand-metric-chip">
            <span class="cand-metric-label">Hard Gates:</span>
            <span class="cand-metric-val">${c.hard_gates_passed ? 'PASSED ✔' : 'FAILED ✕'}</span>
          </div>
          <div class="cand-metric-chip">
            <span class="cand-metric-label">Composite Rank:</span>
            <span class="cand-metric-val">${compositeStr} (${rankStr})</span>
          </div>
          <div class="cand-metric-chip">
            <span class="cand-metric-label">Preference Match:</span>
            <span class="cand-metric-val">${prefStr}</span>
          </div>
          <div class="cand-metric-chip">
            <span class="cand-metric-label">Format:</span>
            <span class="cand-metric-val">${c.resolution || '—'} @ ${c.fps || '—'}fps</span>
          </div>
          <div class="cand-metric-chip">
            <span class="cand-metric-label">Duration:</span>
            <span class="cand-metric-val">${typeof c.duration_seconds === 'number' ? c.duration_seconds.toFixed(2) + 's' : '—'}</span>
          </div>
        </div>

        <div class="cand-provenance-row">
          <span>Manifest: <code class="font-mono">${escapeHtml(c.manifest_id || '—')}</code></span>
          <span>SHA-256: <code class="font-mono" title="${c.media_sha256 || ''}">${shortSha}</code></span>
        </div>

        <div class="cand-actions-row">
          <button class="btn btn-sm ${isPreviewing ? 'btn-accent' : 'btn-ghost'} btn-cand-preview" data-cand-id="${c.candidate_id}" title="Preview this candidate media without activating">
            ${isPreviewing ? '👁 Previewing' : '👁 Preview'}
          </button>
          <button class="btn btn-sm ${isSelected ? 'btn-ghost' : 'btn-primary'} btn-cand-select" data-cand-id="${c.candidate_id}" ${!isEligible || isSelected ? 'disabled' : ''} title="${isEligible ? 'Select and activate this verified candidate' : 'Candidate ineligible (fails QA gate or verification)'}">
            ${isSelected ? 'Active' : '✓ Select & Activate'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Event handlers
  dom.candidatesGrid.querySelectorAll('.btn-cand-preview').forEach(btn => {
    btn.addEventListener('click', () => {
      const candId = btn.dataset.candId;
      if (candId === state.previewedCandidateId) {
        exitCandidatePreview();
      } else {
        previewCandidate(candId);
      }
    });
  });

  dom.candidatesGrid.querySelectorAll('.btn-cand-select').forEach(btn => {
    btn.addEventListener('click', () => {
      const candId = btn.dataset.candId;
      selectCandidate(candId);
    });
  });
}

function previewCandidate(candidateId) {
  state.previewedCandidateId = candidateId;
  const cand = (state.candidateSet?.candidates || []).find(c => c.candidate_id === candidateId);

  if (dom.candidatePreviewBanner) {
    dom.candidatePreviewBanner.classList.remove('hidden');
    if (dom.previewedCandId) dom.previewedCandId.innerText = candidateId;
  }

  if (dom.btnActivatePreviewedCand) {
    dom.btnActivatePreviewedCand.disabled = !cand?.isEligible;
  }

  updateDeliveryVerificationUI();
  updatePreviewMedia();
  renderCandidatesUI();
  notify(`Previewing candidate: ${candidateId} (uncommitted)`, 'info');
}

function exitCandidatePreview() {
  state.previewedCandidateId = null;
  if (dom.candidatePreviewBanner) {
    dom.candidatePreviewBanner.classList.add('hidden');
    if (dom.previewedCandId) dom.previewedCandId.innerText = '—';
  }
  updateDeliveryVerificationUI();
  updatePreviewMedia();
  renderCandidatesUI();
  notify('Exited candidate preview; returned to active delivery', 'info');
}

async function selectCandidate(candidateId) {
  if (state.isVerifying) {
    notify('A mutation is already in progress. Please wait.', 'warning');
    return;
  }

  const cand = (state.candidateSet?.candidates || []).find(c => c.candidate_id === candidateId);
  if (!cand?.isEligible) {
    notify(`Candidate "${candidateId}" is not eligible for activation (verified QA >= 80 required)`, 'error');
    return;
  }

  state.isVerifying = true;
  updateDeliveryVerificationUI();
  updatePreviewMedia();

  try {
    const res = await fetch('/api/session/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateId,
        expectedVersion: state.session?.concurrency?.version
      })
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409 && data.errorCode === 'STALE_VERSION') {
        notify(`Selection conflict: ${data.error}. Refreshing authoritative state.`, 'error');
      } else if (res.status === 422) {
        notify(`Candidate rejected by server: ${data.error}`, 'error');
      } else {
        notify(`Selection failed: ${data.error || 'Server error'}`, 'error');
      }
      await fetchAuthoritativeSession();
      await fetchCandidates();
      return;
    }

    state.previewedCandidateId = null;
    state.lastRevisionError = null;
    if (dom.candidatePreviewBanner) dom.candidatePreviewBanner.classList.add('hidden');

    await fetchAuthoritativeSession();
    await fetchCandidates();
    notify(`Candidate "${candidateId}" successfully activated as revision ${data.active_delivery?.revision_id}!`, 'success');
  } catch (err) {
    notify(`Network error selecting candidate: ${err.message}`, 'error');
    await fetchAuthoritativeSession();
  } finally {
    state.isVerifying = false;
    updateDeliveryVerificationUI();
    updatePreviewMedia();
    renderCandidatesUI();
  }
}

function renderHistoryDAGUI() {
  if (!dom.historyNodesList) return;

  const history = state.sessionHistory || [];
  if (history.length === 0) {
    if (dom.historyEmpty) dom.historyEmpty.classList.remove('hidden');
    dom.historyNodesList.innerHTML = '';
    return;
  }

  if (dom.historyEmpty) dom.historyEmpty.classList.add('hidden');
  if (dom.historyError) dom.historyError.classList.add('hidden');

  // Populate diff selectors
  if (dom.diffFromSelect && dom.diffToSelect) {
    const prevFrom = dom.diffFromSelect.value;
    const prevTo = dom.diffToSelect.value;
    const options = history.map(h => `<option value="${h.revision_id}">${h.revision_id} (${h.status})</option>`).join('');
    dom.diffFromSelect.innerHTML = options;
    dom.diffToSelect.innerHTML = options;

    if (prevFrom && history.some(h => h.revision_id === prevFrom)) {
      dom.diffFromSelect.value = prevFrom;
    } else {
      dom.diffFromSelect.value = history[0].revision_id;
    }

    if (prevTo && history.some(h => h.revision_id === prevTo)) {
      dom.diffToSelect.value = prevTo;
    } else {
      dom.diffToSelect.value = history[history.length - 1].revision_id;
    }
  }

  // Render nodes
  dom.historyNodesList.innerHTML = history.map((h, idx) => {
    const isActive = h.revision_id === state.session?.active_delivery?.revision_id;
    const isInspected = h.revision_id === state.inspectedRevisionId;
    const isFailed = h.status === 'failed';

    let cardClass = 'dag-node';
    if (isActive) cardClass += ' active-rev';
    if (isInspected) cardClass += ' inspected-rev';
    if (isFailed) cardClass += ' failed-rev';

    let badgeClass = 'node-badge-committed';
    let badgeText = 'COMMITTED';
    if (isActive) {
      badgeClass = 'node-badge-active';
      badgeText = 'ACTIVE DELIVERY';
    } else if (isFailed) {
      badgeClass = 'node-badge-failed';
      badgeText = 'FAILED';
    }

    const timeStr = h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : '—';
    const qaStr = typeof h.qa_score === 'number' ? `${h.qa_score}/100` : '—';

    // Predecessor link / branch representation
    let branchInfo = '';
    if (h.predecessor_id) {
      branchInfo = `<div class="node-predecessor-arrow">
        <span>↳ Predecessor:</span>
        <span class="branch-tag">${h.predecessor_id}</span>
      </div>`;
    } else {
      branchInfo = `<div class="node-predecessor-arrow"><span class="branch-tag">ROOT BASELINE</span></div>`;
    }

    return `
      <div id="dag-node-${h.revision_id}" class="${cardClass}">
        ${branchInfo}
        <div class="node-header-row">
          <span class="node-id-chip">${h.revision_id}</span>
          <span class="node-badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="node-prompt-text" title="${escapeHtml(h.prompt || '')}">${escapeHtml(h.prompt || 'No prompt recorded')}</div>
        <div class="node-meta-grid">
          <div class="node-meta-item"><span class="node-meta-label">Time:</span> <span class="node-meta-val">${timeStr}</span></div>
          <div class="node-meta-item"><span class="node-meta-label">QA:</span> <span class="node-meta-val">${qaStr}</span></div>
          <div class="node-meta-item"><span class="node-meta-label">Ops:</span> <span class="node-meta-val">${h.operations_count ?? 0}</span></div>
          <div class="node-meta-item"><span class="node-meta-label">Manifest:</span> <span class="node-meta-val font-mono">${(h.manifest_id || '—').slice(0, 10)}</span></div>
        </div>
        ${isFailed && h.error ? `<div class="node-error-text" style="font-size: 10px; color: #f87171;">⚠️ ${escapeHtml(h.error)}</div>` : ''}
        <div class="node-actions-row">
          <button class="btn btn-sm btn-ghost btn-diff-node" data-rev-id="${h.revision_id}" title="Diff with Active Delivery">Diff</button>
          ${isActive && !isInspected ? '' : `
            <button class="btn btn-sm ${isInspected ? 'btn-accent' : 'btn-secondary'} btn-inspect-node" data-rev-id="${h.revision_id}" title="Inspect this revision snapshot in read-only mode">
              ${isInspected ? 'Inspecting' : 'Inspect (Read-Only)'}
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers for inspect and diff buttons
  dom.historyNodesList.querySelectorAll('.btn-inspect-node').forEach(btn => {
    btn.addEventListener('click', () => {
      const revId = btn.dataset.revId;
      if (revId === state.inspectedRevisionId) {
        exitInspectionMode();
      } else {
        inspectRevision(revId);
      }
    });
  });

  dom.historyNodesList.querySelectorAll('.btn-diff-node').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetRev = btn.dataset.revId;
      const baseRev = state.session?.active_delivery?.revision_id || history[0]?.revision_id;
      if (dom.diffFromSelect) dom.diffFromSelect.value = baseRev;
      if (dom.diffToSelect) dom.diffToSelect.value = targetRev;
      computeDiff(baseRev, targetRev);
    });
  });
}

async function computeDiff(fromRev, toRev) {
  const from = fromRev || dom.diffFromSelect?.value;
  const to = toRev || dom.diffToSelect?.value;

  if (!from || !to) {
    notify('Select both base and target revisions to compare diffs', 'warning');
    return;
  }

  if (dom.diffStatusIndicator) dom.diffStatusIndicator.innerText = 'Comparing...';
  if (dom.diffUnavailableMsg) dom.diffUnavailableMsg.classList.add('hidden');
  if (dom.diffDetailsCard) dom.diffDetailsCard.classList.add('hidden');

  try {
    const res = await fetch(`/api/session/diff?fromRev=${encodeURIComponent(from)}&toRev=${encodeURIComponent(to)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      if (dom.diffStatusIndicator) dom.diffStatusIndicator.innerText = 'Unavailable';
      if (dom.diffUnavailableMsg) {
        dom.diffUnavailableMsg.classList.remove('hidden');
        if (dom.diffUnavailableText) {
          dom.diffUnavailableText.innerText = data.error || 'DIFF UNAVAILABLE: Snapshot missing for requested revisions.';
        }
      }
      state.selectedDiff = null;
      return;
    }

    const diff = data.diff;
    state.selectedDiff = diff;
    if (dom.diffStatusIndicator) dom.diffStatusIndicator.innerText = `${from} → ${to}`;

    if (dom.diffDetailsCard) {
      dom.diffDetailsCard.classList.remove('hidden');

      if (dom.diffPlanHash) dom.diffPlanHash.innerText = (diff.plan_hash || '—').slice(0, 12);
      if (dom.diffQaScore) dom.diffQaScore.innerText = typeof diff.qa_score === 'number' ? `${diff.qa_score}/100` : '—';
      if (dom.diffOpsCount) dom.diffOpsCount.innerText = diff.operations_count ?? 0;
      if (dom.diffDurationDelta) {
        const deltaSec = diff.durationDiff?.deltaSec ?? 0;
        dom.diffDurationDelta.innerText = `${deltaSec > 0 ? '+' : ''}${deltaSec.toFixed(2)}s`;
        dom.diffDurationDelta.style.color = deltaSec > 0 ? '#34d399' : (deltaSec < 0 ? '#f87171' : '#e2e8f0');
      }

      // Added clips
      const added = diff.addedClips || [];
      if (dom.diffAddedCount) dom.diffAddedCount.innerText = added.length;
      if (dom.diffAddedList) {
        dom.diffAddedList.innerHTML = added.length === 0
          ? '<li class="diff-item" style="color: #64748b;">No clips added.</li>'
          : added.map(c => `
            <li class="diff-item diff-added">
              <span>+ [${c.type || 'clip'}] ${c.id} (track: ${c.trackId})</span>
              <span>${(c.durationTicks / 120000).toFixed(2)}s</span>
            </li>
          `).join('');
      }

      // Removed clips
      const removed = diff.removedClips || [];
      if (dom.diffRemovedCount) dom.diffRemovedCount.innerText = removed.length;
      if (dom.diffRemovedList) {
        dom.diffRemovedList.innerHTML = removed.length === 0
          ? '<li class="diff-item" style="color: #64748b;">No clips removed.</li>'
          : removed.map(c => `
            <li class="diff-item diff-removed">
              <span>- [${c.type || 'clip'}] ${c.id} (track: ${c.trackId})</span>
              <span>${(c.durationTicks / 120000).toFixed(2)}s</span>
            </li>
          `).join('');
      }

      // Modified clips
      const modified = diff.modifiedClips || [];
      if (dom.diffModifiedCount) dom.diffModifiedCount.innerText = modified.length;
      if (dom.diffModifiedList) {
        dom.diffModifiedList.innerHTML = modified.length === 0
          ? '<li class="diff-item" style="color: #64748b;">No clips modified.</li>'
          : modified.map(c => {
            const deltas = [];
            if (c.trackId?.changed) deltas.push(`track: ${c.trackId.from}→${c.trackId.to}`);
            if (c.startTick?.deltaTicks !== 0) deltas.push(`start: ${c.startTick.deltaSec > 0 ? '+' : ''}${c.startTick.deltaSec.toFixed(2)}s`);
            if (c.durationTicks?.deltaTicks !== 0) deltas.push(`dur: ${c.durationTicks.deltaSec > 0 ? '+' : ''}${c.durationTicks.deltaSec.toFixed(2)}s`);
            if (c.effectsChanged) deltas.push('effects altered');
            if (c.colorGradeChanged) deltas.push('grade altered');
            return `
              <li class="diff-item diff-modified">
                <span>Δ ${c.clipId}</span>
                <span>${deltas.join(', ') || 'properties changed'}</span>
              </li>
            `;
          }).join('');
      }
    }
  } catch (err) {
    if (dom.diffStatusIndicator) dom.diffStatusIndicator.innerText = 'Error';
    if (dom.diffUnavailableMsg) {
      dom.diffUnavailableMsg.classList.remove('hidden');
      if (dom.diffUnavailableText) dom.diffUnavailableText.innerText = `Network error: ${err.message}`;
    }
  }
}

function renderRevisionFormUI() {
  if (dom.revSessionId) dom.revSessionId.innerText = state.session?.session_id || 'None';
  if (dom.revActiveRevision) dom.revActiveRevision.innerText = state.session?.active_delivery?.revision_id || 'None';
  if (dom.revConcurrencyVersion) dom.revConcurrencyVersion.innerText = state.session?.concurrency?.version ?? 0;
  if (dom.revSessionState) {
    const s = state.session?.state || 'none';
    dom.revSessionState.innerText = s;
    dom.revSessionState.className = `state-chip state-${s}`;
  }

  // Hard constraints
  if (dom.revHardConstraintsList) {
    const constraints = state.session?.hard_constraints || [];
    if (constraints.length === 0) {
      dom.revHardConstraintsList.innerHTML = '<li class="constraint-item" style="color: #64748b;">No session hard constraints active.</li>';
    } else {
      dom.revHardConstraintsList.innerHTML = constraints.map(c => `
        <li class="constraint-item">
          <strong>${escapeHtml(c.type || 'Constraint')}:</strong> ${escapeHtml(c.description || JSON.stringify(c))}
        </li>
      `).join('');
    }
  }

  // Session Undo / Redo buttons
  if (dom.btnSessionUndo) dom.btnSessionUndo.disabled = !state.session?.undo_redo?.canUndo;
  if (dom.btnSessionRedo) dom.btnSessionRedo.disabled = !state.session?.undo_redo?.canRedo;
}

async function submitConversationalRevision() {
  if (state.isVerifying) {
    notify('A revision mutation is already in-flight. Please wait.', 'warning');
    return;
  }

  const prompt = dom.revPromptInput?.value?.trim();
  if (!prompt) {
    notify('Please enter a revision request in the textarea.', 'warning');
    return;
  }

  if (!state.session) {
    notify('No active revision session loaded. Load or initialize a session first.', 'error');
    return;
  }

  state.isVerifying = true;
  if (dom.btnSubmitRevision) dom.btnSubmitRevision.disabled = true;
  if (dom.revInFlight) dom.revInFlight.classList.remove('hidden');
  if (dom.revErrorCallout) dom.revErrorCallout.classList.add('hidden');

  updateDeliveryVerificationUI();
  updatePreviewMedia();

  try {
    const expectedVersion = state.session.concurrency.version;
    const res = await fetch('/api/session/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        expectedVersion
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      state.lastRevisionError = data.error || 'Revision failed verification gates';
      if (dom.revErrorCallout) {
        dom.revErrorCallout.classList.remove('hidden');
        if (dom.revErrorMsg) {
          dom.revErrorMsg.innerText = `${data.errorCode ? '[' + data.errorCode + '] ' : ''}${data.error || 'Unknown error'}`;
        }
      }
      notify(`Revision failed: ${data.error}. Prior verified delivery remains active.`, 'error');
      // Notice: session.active_delivery remains intact on server and client!
      await fetchAuthoritativeSession();
      return;
    }

    // Success
    state.lastRevisionError = null;
    if (dom.revPromptInput) dom.revPromptInput.value = '';
    if (dom.revErrorCallout) dom.revErrorCallout.classList.add('hidden');

    await fetchAuthoritativeSession();
    await fetchCandidates();
    notify(`Revision ${data.active_delivery?.revision_id} verified and active!`, 'success');
  } catch (err) {
    state.lastRevisionError = err.message;
    if (dom.revErrorCallout) {
      dom.revErrorCallout.classList.remove('hidden');
      if (dom.revErrorMsg) dom.revErrorMsg.innerText = `Network/timeout error: ${err.message}. Prior delivery remains active.`;
    }
    notify(`Revision request failed: ${err.message}`, 'error');
    await fetchAuthoritativeSession();
  } finally {
    state.isVerifying = false;
    if (dom.btnSubmitRevision) dom.btnSubmitRevision.disabled = false;
    if (dom.revInFlight) dom.revInFlight.classList.add('hidden');
    updateDeliveryVerificationUI();
    updatePreviewMedia();
  }
}

async function sessionUndo() {
  if (state.isVerifying) return;
  if (!state.session?.undo_redo?.canUndo) {
    notify('Already at baseline revision; nothing to undo.', 'info');
    return;
  }
  state.isVerifying = true;
  try {
    const res = await fetch('/api/session/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: state.session.concurrency.version })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      notify(`Session Undo applied! Active revision: ${data.session.active_delivery?.revision_id}`, 'info');
      await fetchAuthoritativeSession();
      await fetchCandidates();
    } else {
      notify(`Session Undo rejected: ${data.error}`, 'error');
      await fetchAuthoritativeSession();
    }
  } catch (err) {
    notify(`Undo failed: ${err.message}`, 'error');
  } finally {
    state.isVerifying = false;
    updateDeliveryVerificationUI();
  }
}

async function sessionRedo() {
  if (state.isVerifying) return;
  if (!state.session?.undo_redo?.canRedo) {
    notify('Already at newest revision; nothing to redo.', 'info');
    return;
  }
  state.isVerifying = true;
  try {
    const res = await fetch('/api/session/redo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: state.session.concurrency.version })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      notify(`Session Redo applied! Active revision: ${data.session.active_delivery?.revision_id}`, 'info');
      await fetchAuthoritativeSession();
      await fetchCandidates();
    } else {
      notify(`Session Redo rejected: ${data.error}`, 'error');
      await fetchAuthoritativeSession();
    }
  } catch (err) {
    notify(`Redo failed: ${err.message}`, 'error');
  } finally {
    state.isVerifying = false;
    updateDeliveryVerificationUI();
  }
}

async function sessionRecover() {
  if (state.isVerifying) return;
  state.isVerifying = true;
  try {
    const res = await fetch('/api/session/recover', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      notify(`Session recovered from persisted state! Active revision: ${data.session.active_delivery?.revision_id}`, 'success');
      await fetchAuthoritativeSession();
      await fetchCandidates();
    } else {
      notify(`Recovery failed: ${data.error}`, 'error');
    }
  } catch (err) {
    notify(`Recovery failed: ${err.message}`, 'error');
  } finally {
    state.isVerifying = false;
    updateDeliveryVerificationUI();
  }
}

function setupStage3Controls() {
  // Candidate Preview Banner buttons
  if (dom.btnExitCandPreview) {
    dom.btnExitCandPreview.addEventListener('click', exitCandidatePreview);
  }
  if (dom.btnActivatePreviewedCand) {
    dom.btnActivatePreviewedCand.addEventListener('click', () => {
      if (state.previewedCandidateId) {
        selectCandidate(state.previewedCandidateId);
      }
    });
  }

  // History DAG & Diff buttons
  if (dom.btnRefreshHistory) {
    dom.btnRefreshHistory.addEventListener('click', () => {
      fetchAuthoritativeSession();
      notify('Refreshed revision history DAG', 'info');
    });
  }
  if (dom.btnComputeDiff) {
    dom.btnComputeDiff.addEventListener('click', () => {
      computeDiff();
    });
  }

  // Candidates Refresh
  if (dom.btnRefreshCandidates) {
    dom.btnRefreshCandidates.addEventListener('click', () => {
      fetchCandidates();
      notify('Refreshed candidates list', 'info');
    });
  }

  // Conversational Revision Form
  if (dom.btnSubmitRevision) {
    dom.btnSubmitRevision.addEventListener('click', submitConversationalRevision);
  }
  if (dom.btnClearRevision) {
    dom.btnClearRevision.addEventListener('click', () => {
      if (dom.revPromptInput) dom.revPromptInput.value = '';
    });
  }

  // Session Undo / Redo / Recover
  if (dom.btnSessionUndo) dom.btnSessionUndo.addEventListener('click', sessionUndo);
  if (dom.btnSessionRedo) dom.btnSessionRedo.addEventListener('click', sessionRedo);
  if (dom.btnSessionRecover) dom.btnSessionRecover.addEventListener('click', sessionRecover);
}

// Global helper bindings
window.loadProject = loadProject;
window.saveProject = saveProject;
window.undo = undo;
window.redo = redo;
window.dispatchOperation = dispatchOperation;
window.setPlayheadTick = setPlayheadTick;
window.fetchAuthoritativeSession = fetchAuthoritativeSession;
window.updateDeliveryVerificationUI = updateDeliveryVerificationUI;
window.updatePreviewMedia = updatePreviewMedia;
window.inspectRevision = inspectRevision;
window.exitInspectionMode = exitInspectionMode;
// Stage 3 bindings
window.fetchCandidates = fetchCandidates;
window.renderCandidatesUI = renderCandidatesUI;
window.previewCandidate = previewCandidate;
window.exitCandidatePreview = exitCandidatePreview;
window.selectCandidate = selectCandidate;
window.renderHistoryDAGUI = renderHistoryDAGUI;
window.computeDiff = computeDiff;
window.renderRevisionFormUI = renderRevisionFormUI;
window.submitConversationalRevision = submitConversationalRevision;
window.sessionUndo = sessionUndo;
window.sessionRedo = sessionRedo;
window.sessionRecover = sessionRecover;
window.setupStage3Controls = setupStage3Controls;

// Initialize Stage 2 Preview & Verification Controls
setupStage2Controls();
// Initialize Stage 3 Controls
setupStage3Controls();

// Initialize
if (typeof window !== 'undefined' && window.__EME_AUTO_INIT__ !== false) {
  loadProject(state.activePath).then(async () => {
    if (window.location && window.location.search) {
      const urlParams = new URLSearchParams(window.location.search);
      const revParam = urlParams.get('revisionId');
      if (revParam) {
        await inspectRevision(revParam);
      }
    }
  });
}
