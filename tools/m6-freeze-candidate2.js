import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function sha256File(filePath) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    return { path: filePath, exists: false, sha256: null, sizeBytes: 0 };
  }
  const content = fs.readFileSync(fullPath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return {
    path: filePath,
    exists: true,
    sha256: hash,
    sizeBytes: content.length
  };
}

function runCommand(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

export function generateCandidate2Manifest() {
  const gitCommit = runCommand('git rev-parse HEAD');
  const buildId = 'eme-v0.1.0-rc1-candidate2';

  const filesToHash = [
    'src/decision-fabric/adapter/laya-decision-adapter.js',
    'src/decision-fabric/adapter/eme-policy-gate.js',
    'src/decision-fabric/baseline/deterministic-router.js',
    'src/decision-fabric/policy/routing-policy.json',
    'src/decision-fabric/schemas/eme-router/questions.json',
    'src/decision-fabric/schemas/eme-color-mood/questions.json',
    'src/decision-fabric/schemas/eme-timeline-arbiter/questions.json',
    'src/decision-fabric/data/m6-candidate1-regression-suite.json',
    'src/decision-fabric/data/m6-candidate2-fresh-blind-battery.json',
    'src/decision-fabric/data/complex_planning_holdout.jsonl',
    'src/decision-fabric/artifacts/m6-frozen-candidate-manifest.json',
    'src/decision-fabric/reports/m6-candidate1-diagnostic-report.json'
  ];

  const fileHashes = {};
  for (const f of filesToHash) {
    fileHashes[f] = sha256File(f);
  }

  const routingPolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/decision-fabric/policy/routing-policy.json'), 'utf8'));

  const manifest = {
    manifest_version: '2.0.0',
    milestone: 'M6 Independent Blind Certification — Candidate 2',
    created_at: new Date().toISOString(),
    evaluation_candidate: {
      candidate_id: 'candidate2',
      git_commit: gitCommit,
      build_identifier: buildId,
      package_version: '0.1.0-rc1',
      previous_candidate_id: 'candidate1',
      previous_candidate_manifest: 'src/decision-fabric/artifacts/m6-frozen-candidate-manifest.json'
    },
    backend_provenance_and_model_claims: {
      claimed_fine_tuning: false,
      has_local_binary_checkpoint: false,
      checkpoint_sha256: null,
      checkpoint_path: null,
      architecture: 'convaiinnovations/laya (ModernBERT-large, 421M params)',
      actual_runtime_backend: 'In-process LayaDecisionAdapter with hardened DeterministicRouter heuristics and EMEPolicyGate',
      disclosure: 'Per ChatGPT Control 3: The fixes in Candidate 2 are strictly deterministic routing and policy enforcement improvements. No changed neural model checkpoint exists; no fine-tuning or learned-weights improvement is claimed.'
    },
    remediation_delta_from_candidate1: {
      deterministic_router: [
        'Added missing natural language keyword patterns across canonical single routes',
        'Implemented explicit route precedence for SRT/caption export vs generic render_export',
        'Preserved System 2 escalation on genuine multi-stage briefs'
      ],
      eme_policy_gate: [
        'Hardened prerequisite gates to enforce source_media_available: false, media_integrity_passed: false, and timeline_editable: false',
        'Preserved non-executable needs_review sentinel isolation',
        'Added explicit typed rejection reasons for invariant violations'
      ],
      test_contracts: [
        'Reconciled candidateLutId and candidateLook in evaluation harness',
        'Aligned reject action contract verification'
      ]
    },
    cryptographic_hashes: fileHashes,
    feature_flags: {
      CANARY_ADVISORY_MODE: false,
      AUTHORITATIVE_ROUTER: 'deterministic',
      SHADOW_MODE_ENABLED: true,
      ALLOW_DIRECT_MUTATIONS: false
    }
  };

  const outPath = path.join(ROOT, 'src/decision-fabric/artifacts/m6-candidate2-manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✅ Candidate 2 Manifest written to ${outPath}`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateCandidate2Manifest();
}
