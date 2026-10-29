#!/usr/bin/env node

/**
 * Real Process Crash Worker Helper (Phase 30 Stage 30.2)
 *
 * Simulates real, uncatchable process crashes (SIGKILL) at exact authoritative boundaries:
 * - pre-commit: Terminated immediately before atomic rename of project state.
 * - post-commit: Terminated immediately after atomic project commit, before acknowledgement.
 */

const fs = require('fs');
const path = require('path');

const mode = process.argv[2]; // 'pre-commit' or 'post-commit'
const workDir = process.argv[3]; // directory for project files

if (!mode || !workDir) {
  console.error('Usage: node real-crash-worker.js <pre-commit|post-commit> <workDir>');
  process.exit(1);
}

fs.mkdirSync(workDir, { recursive: true });

const projectFile = path.join(workDir, 'project.json');
const jobFile = path.join(workDir, 'job.json');

// Initial project at revision 1
const initialProject = {
  project: {
    project_id: 'real_crash_test_project',
    project_revision: 1,
    timeline: {
      tracks: [
        {
          id: 'audio_track_01',
          clips: [
            { id: 'clip_01', asset_id: 'vo_01', start_tick: 0, duration_ticks: 120000 }
          ]
        }
      ]
    }
  }
};

// Initial job in EXECUTING state
const initialJob = {
  job_id: 'job_real_crash_01',
  status: 'EXECUTING',
  created_at: new Date().toISOString(),
  target_revision: 2,
  operation: {
    type: 'retime_clip',
    clip_id: 'clip_01',
    target_start_tick: 240000
  }
};

fs.writeFileSync(jobFile, JSON.stringify(initialJob, null, 2), 'utf8');

if (mode === 'pre-commit') {
  // Ensure disk has revision 1
  fs.writeFileSync(projectFile, JSON.stringify(initialProject, null, 2), 'utf8');

  // Candidate state (uncommitted candidate in tmp file)
  const candidateFile = path.join(workDir, 'project.json.candidate');
  const candidateProject = JSON.parse(JSON.stringify(initialProject));
  candidateProject.project.project_revision = 2;
  candidateProject.project.timeline.tracks[0].clips[0].start_tick = 240000;
  fs.writeFileSync(candidateFile, JSON.stringify(candidateProject, null, 2), 'utf8');

  process.stdout.write(`PRE_COMMIT_BOUNDARY_REACHED:PID=${process.pid}\n`);
  
  // Real sudden crash via SIGKILL immediately prior to atomic rename
  process.kill(process.pid, 'SIGKILL');
} else if (mode === 'post-commit') {
  // Candidate state
  const committedProject = JSON.parse(JSON.stringify(initialProject));
  committedProject.project.project_revision = 2;
  committedProject.project.timeline.tracks[0].clips[0].start_tick = 240000;

  // Atomically write committed project state to disk
  const tmpCommit = `${projectFile}.tmp_${Date.now()}`;
  fs.writeFileSync(tmpCommit, JSON.stringify(committedProject, null, 2), 'utf8');
  fs.renameSync(tmpCommit, projectFile);

  process.stdout.write(`POST_COMMIT_BOUNDARY_REACHED:PID=${process.pid}\n`);

  // Real sudden crash via SIGKILL immediately after atomic commit, BEFORE ack/job update
  process.kill(process.pid, 'SIGKILL');
} else if (mode === 'post-promotion') {
  const crypto = require('crypto');
  const sessionFile = path.join(workDir, 'session.json');
  const manifestFile = path.join(workDir, 'delivery-manifest.json');
  const qaFile = path.join(workDir, 'qa-report.json');

  // Existing valid active delivery
  const v1Artifact = path.join(workDir, 'delivery_v1.wav');
  fs.writeFileSync(v1Artifact, 'VALID_INITIAL_AUDIO_PCM_DATA_V1', 'utf8');
  const v1Sha = crypto.createHash('sha256').update(fs.readFileSync(v1Artifact)).digest('hex');

  const initialSession = {
    session_id: 'session_real_crash_01',
    project_id: 'real_crash_test_project',
    active_delivery: {
      delivery_id: 'del_v1_existing',
      artifact_path: v1Artifact,
      sha256: v1Sha,
      promoted_at: '2026-10-22T20:00:00.000Z',
      qa_status: 'passed'
    }
  };
  fs.writeFileSync(sessionFile, JSON.stringify(initialSession, null, 2), 'utf8');

  // Create valid candidate artifact
  const v2Artifact = path.join(workDir, 'candidate_v2.wav');
  fs.writeFileSync(v2Artifact, 'VALID_PROMOTED_AUDIO_PCM_DATA_V2', 'utf8');
  const v2Sha = crypto.createHash('sha256').update(fs.readFileSync(v2Artifact)).digest('hex');

  // Fresh QA report passed
  const qaReport = {
    job_id: 'job_real_crash_01',
    candidate_sha256: v2Sha,
    status: 'passed',
    checks: {
      true_peak_dbtp: -6.3,
      transient_alignment_samples: 12
    }
  };
  fs.writeFileSync(qaFile, JSON.stringify(qaReport, null, 2), 'utf8');

  // Delivery manifest
  const manifest = {
    schema_version: '1.0.0',
    delivery_id: 'del_v2_promoted',
    package_artifact: {
      filename: 'candidate_v2.wav',
      path: v2Artifact,
      sha256: v2Sha
    }
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  // Authoritative promotion of candidate delivery to session.active_delivery
  const promotedSession = JSON.parse(JSON.stringify(initialSession));
  promotedSession.active_delivery = {
    delivery_id: 'del_v2_promoted',
    artifact_path: v2Artifact,
    sha256: v2Sha,
    promoted_at: new Date().toISOString(),
    qa_status: 'passed'
  };

  const tmpSession = `${sessionFile}.tmp_${Date.now()}`;
  fs.writeFileSync(tmpSession, JSON.stringify(promotedSession, null, 2), 'utf8');
  fs.renameSync(tmpSession, sessionFile);

  process.stdout.write(`POST_PROMOTION_BOUNDARY_REACHED:PID=${process.pid}\n`);

  // Sudden uncatchable crash via SIGKILL immediately post-promotion, before acknowledgement
  process.kill(process.pid, 'SIGKILL');
} else {
  console.error(`Unknown mode: ${mode}`);
  process.exit(1);
}
