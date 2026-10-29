/**
 * Editing Mechanics Engine (EME) - PF-07 + Phase A2 Integration Audit Tool
 * Collects end-to-end evidence, hashes, scoring, render QA, and verification metrics.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const {
  BriefValidator,
  OperationPlanCompiler,
  CandidateVariantCompiler,
  CandidateOrchestrator,
  MusicalStructureAdapter,
  CandidateMusicalScorer
} = require('../src/prompt-core/index.js');

const scenario1Project = require('../fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json');
const scenario1Beat = require('../fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json');

const AUDIT_OUT_DIR = path.resolve('artifacts/pf07-a2-audit-deliverables');
fs.mkdirSync(AUDIT_OUT_DIR, { recursive: true });

// Setup test media
const cleanMp4Path = path.join(AUDIT_OUT_DIR, 'clean-12s.mp4');
if (!fs.existsSync(cleanMp4Path)) {
  spawnSync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=12',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=12:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    cleanMp4Path
  ], { stdio: 'ignore' });
}

// Build A2 sidecar
const sourceSha256 = '5555555555555555555555555555555555555555555555555555555555555555';
const structureId = `sha256:${crypto.createHash('sha256').update(`audit-${sourceSha256}-4/4-1440000`).digest('hex')}`;
const barDurationTicks = 240000;
const bars = [];
for (let i = 0; i < 6; i++) {
  bars.push({
    barIndex: i,
    startTicks: i * barDurationTicks,
    endTicks: (i + 1) * barDurationTicks,
    downbeatTicks: i * barDurationTicks,
    beatsCount: 4,
    confidence: 0.94
  });
}

const phrases = [
  { phraseIndex: 0, startTicks: 0, endTicks: 480000, barsCount: 2, confidence: 0.91, cadenceStrength: 0.88 },
  { phraseIndex: 1, startTicks: 480000, endTicks: 960000, barsCount: 2, confidence: 0.92, cadenceStrength: 0.89 },
  { phraseIndex: 2, startTicks: 960000, endTicks: 1440000, barsCount: 2, confidence: 0.90, cadenceStrength: 0.85 }
];

const sections = [
  { id: 'sec-intro', sectionIndex: 0, type: 'intro', startTicks: 0, endTicks: 480000, confidence: 0.88, uncertaintyState: 'clear' },
  { id: 'sec-verse', sectionIndex: 1, type: 'verse', startTicks: 480000, endTicks: 1440000, confidence: 0.86, uncertaintyState: 'clear' }
];

const musicalStructure = {
  schemaVersion: 'eme-musical-structure.v1',
  structureId,
  source: {
    sha256: sourceSha256,
    sampleRate: 44100,
    channels: 2,
    durationSamples: 44100 * 12,
    durationTicks: 1440000
  },
  config: {
    algorithmVersion: '1.0.0',
    ticksPerSecond: 120000,
    endpointConvention: 'half-open',
    fftSize: 2048,
    hopLength: 512
  },
  meter: {
    classification: '4/4',
    numerator: 4,
    denominator: 4,
    confidence: 0.96,
    isAmbiguous: false,
    phaseOffsetBeats: 0,
    reasons: ['Regular 4/4 downbeat grid at 120.0 BPM']
  },
  bars,
  phrases,
  sections,
  ambiguity: {
    hasHighAmbiguity: false,
    isSparse: false,
    isRubato: false,
    notes: []
  }
};

const PROMPT = `Generate three different editing styles for this 12-second vertical video. Keep the original clip order, soundtrack, headline wording, title interval, B-roll interval, and total duration unchanged. Vary pacing and transition style only. Verify each candidate and let me choose one.`;

console.log('--- 1. Testing MusicalStructureAdapter ---');
const adapted = MusicalStructureAdapter.adapt({
  musicalStructure,
  project: scenario1Project
});
console.log('Adapter valid:', adapted.isValid);
console.log('Fallback active:', adapted.fallbackActive);
console.log('Accepted downbeats:', adapted.acceptedEvents.downbeats.length);
console.log('Accepted phrases:', adapted.acceptedEvents.phrases.length);
console.log('Accepted sections:', adapted.acceptedEvents.sections.length);

console.log('\n--- 2. Generating Structure-Aware Candidates ---');
const csetDoc = CandidateOrchestrator.generateCandidates({
  rawPrompt: PROMPT,
  project: structuredClone(scenario1Project),
  beatAnalysis: scenario1Beat,
  musicalStructure,
  outputDir: AUDIT_OUT_DIR
});

console.log('CandidateSet status:', csetDoc.status);
console.log('CandidateSet ID:', csetDoc.candidate_set_id);
console.log('Schema valid:', BriefValidator.validateCandidateSet(csetDoc).valid);

console.log('\n--- 3. Candidate Scorecard & Rankings ---');
for (const cand of csetDoc.candidates) {
  console.log(`Candidate: ${cand.candidate_id} (${cand.variation_profile.name})`);
  console.log(`  Status: ${cand.status}`);
  console.log(`  QA Score: ${cand.qa_summary?.score}`);
  console.log(`  Musical Score: ${cand.musical_alignment?.musical_score}`);
  console.log(`  Composite Score: ${cand.musical_alignment?.composite_score}`);
  console.log(`  Rank: #${cand.musical_alignment?.rank}`);
  console.log(`  Deliverable SHA256: ${cand.deliverable?.sha256}`);
  console.log(`  Manifest ID: ${cand.deliverable?.manifest_id}`);
}

console.log('\n--- 4. Selecting Rank #1 Candidate ---');
const selRes = CandidateOrchestrator.selectCandidate({
  candidateSetDoc: csetDoc,
  candidateId: 'auto',
  outputDir: AUDIT_OUT_DIR
});
console.log('Selection success:', selRes.success);
console.log('Selected Candidate ID:', csetDoc.selection.selected_candidate_id);
console.log('Selected Manifest ID:', csetDoc.selection.selected_manifest_id);
console.log('Selection Provenance:', csetDoc.selection.selection_provenance);
console.log('Delivery Run Status:', selRes.deliveryRun?.status);

console.log('\n--- 5. Comparison Matrix ---');
console.table(csetDoc.comparison_matrix);
