/** Protected commit boundary shared by supported agent interfaces. Always atomic. */
const fs = require('node:fs');
const path = require('node:path');
const { ApprovalAuthority, durableWrite } = require('./approval-authority.js');
const { digest, verifyAssets, canonicalTargetPath, fail } = require('./execution-record.js');
const { OperationExecutor } = require('../engine/operations.js');
const { ProjectManager } = require('../engine/project.js');

function denied(error, project, extra = {}) {
  const code = error.code || error.errorCode || 'ERR_EXECUTION_FAILED';
  return { success: false, project, executedSteps: 0, committedSteps: 0, committed: false,
    error: { code, message: error.message }, errorCode: code, ...extra };
}

class ExecutionAuthority {
  static execute(params = {}) {
    const { approvalToken, storageDir = ApprovalAuthority.DEFAULT_STORAGE_DIR } = params;
    let locks, ticket, candidate, committed = false, attemptStarted = false, executedSteps = 0;
    let project = params.project;
    try {
      const requestId = ApprovalAuthority._requestId(approvalToken);
      const initial = ApprovalAuthority.getTicket(requestId, storageDir);
      if (!initial) fail('ERR_INVALID_APPROVAL_TOKEN', 'Unknown approval');
      const coordinator = ApprovalAuthority._coordinator(storageDir);
      // Same lock implementation and ordering as existing workflows: session -> job.
      locks = coordinator.acquireHierarchicalLocks(`approval-project-${digest(initial.project_id)}`, requestId);
      ticket = ApprovalAuthority.getTicket(requestId, storageDir);
      if (ticket.status === 'REJECTED') fail('ERR_APPROVAL_REJECTED', 'Approval was rejected');
      if (ticket.token_sha256 !== digest(approvalToken)) fail('ERR_INVALID_APPROVAL_TOKEN', 'Token was not issued for this request');
      if (ticket.status === 'CONSUMED') {
        // A failed retry is not a rollback of an earlier commit. Never re-execute.
        const r = ticket.execution_record;
        const replayError = Object.assign(new Error('Approval is single-use; this retry did not execute'), { code: 'ERR_APPROVAL_ALREADY_CONSUMED' });
        let disk;
        try {
          if (r.target.mode === 'file' && fs.existsSync(r.target.project_path)) disk = ProjectManager.loadProject(r.target.project_path);
          if (r.target.mode === 'memory') {
            const head = path.join(storageDir, `head-${digest(r.project_id)}.json`);
            if (fs.existsSync(head)) disk = JSON.parse(fs.readFileSync(head)).project;
          }
        } catch (_) { /* An unreadable artifact cannot prove rollback. */ }
        const matchingResult = disk && digest(disk) === r.result_snapshot_sha256;
        if (['COMMITTED', 'FAILED_AFTER_COMMIT'].includes(ticket.execution?.status)) {
          return denied(replayError, matchingResult ? disk : undefined, { status: ticket.execution.status, committed: true,
            committedSteps: ticket.execution.committed_steps, committed_revision: ticket.execution.committed_revision, previous_execution: true });
        }
        if (ticket.execution?.status === 'RUNNING') {
          return matchingResult
            ? denied(replayError, disk, { status: 'FAILED_AFTER_COMMIT', committed: true,
              committedSteps: r.operation_plan.operations.length, committed_revision: disk.revision, previous_execution: true })
            : denied(replayError, disk, { status: 'NEEDS_RECONCILIATION', previous_execution: true });
        }
        return denied(replayError, project, { status: 'ROLLED_BACK', previous_execution: true });
      }
      if (ticket.status !== 'AUTHORIZED') fail('ERR_UNTRUSTED_APPROVAL', 'Human confirmation is required');
      if (!Number.isFinite(Date.parse(ticket.expires_at)) || Date.now() >= Date.parse(ticket.expires_at)) fail('ERR_APPROVAL_EXPIRED', 'Approval expired');
      const r = ticket.execution_record;
      if (params.projectPath !== undefined && params.projectPath !== null && canonicalTargetPath(params.projectPath) !== r.target.project_path) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Commit destination changed');
      if (r.target.mode === 'file') {
        if (canonicalTargetPath(r.target.project_path) !== r.target.project_path) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Commit directory changed');
        if (fs.existsSync(r.target.project_path)) {
          if (fs.realpathSync(r.target.project_path) !== r.target.project_path) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Commit target became a symlink');
          const disk = ProjectManager.loadProject(r.target.project_path);
          if (project && digest(project) !== digest(disk)) fail('ERR_PROJECT_SNAPSHOT_MISMATCH', 'Supplied snapshot differs from authoritative file');
          project = disk;
        } else {
          project = project || {};
          if (Object.keys(project).length) fail('ERR_PROJECT_SNAPSHOT_MISMATCH', 'Authoritative project is missing');
        }
      }
      if (!project || (project.id && project.id !== r.project_id)) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Project identity changed');
      if ((project.revision ?? 0) !== r.base_revision) fail('ERR_STALE_REVISION', 'Project revision changed');
      if (digest(project) !== r.project_snapshot_sha256) fail('ERR_PROJECT_SNAPSHOT_MISMATCH', 'Project snapshot changed');
      const supplied = [
        ['creativePlan', 'creative_plan'], ['operationPlan', 'operation_plan'], ['operation', 'operation']
      ].filter(([key]) => params[key] !== undefined && params[key] !== null);
      if (supplied.length > 1) fail('ERR_INVALID_EXECUTION_INPUT', 'Supply one executable representation');
      for (const [key, kind] of supplied) {
        // operation_plan may be the exact normalized plan returned by preparation.
        const expected = kind === 'operation_plan' ? r.operation_plan_sha256 : r.input_sha256;
        if ((kind !== r.kind && kind !== 'operation_plan') || digest(params[key]) !== expected) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Executable content changed after review');
      }
      if (params.options !== undefined && digest(params.options) !== r.compilation_options_sha256) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Compilation options changed');
      verifyAssets(r.assets);
      const headPath = path.join(storageDir, `head-${digest(r.project_id)}.json`);
      if (r.target.mode === 'memory' && fs.existsSync(headPath)) {
        const head = JSON.parse(fs.readFileSync(headPath, 'utf8'));
        if (head.project_snapshot_sha256 !== r.project_snapshot_sha256) fail('ERR_STALE_REVISION', 'A protected execution already advanced this project');
      }
      if (!locks.verifyActive()) fail('ERR_STALE_FENCING_TOKEN', 'Execution lock ownership changed');
      // Consume durably before the first candidate step. Failed attempts require fresh review.
      attemptStarted = true;
      ticket.status = 'CONSUMED'; ticket.consumed_at = new Date().toISOString();
      ticket.execution = { status: 'RUNNING', fencing_token: locks.fencingToken, committed_steps: 0 };
      ApprovalAuthority._write(ticket, storageDir);
      candidate = structuredClone(project);
      for (const op of r.operation_plan.operations) {
        const result = OperationExecutor.execute(candidate, {
          type: op.type, params: structuredClone(op.params), expectedBaseRevision: op.preconditions?.expectedBaseRevision ?? candidate.revision
        });
        if (!result.success) fail(result.errorCode || 'ERR_EXECUTION_FAILED', result.error);
        candidate = result.project; executedSteps++;
      }
      ProjectManager.validate(candidate);
      if (digest(candidate) !== r.result_snapshot_sha256) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Execution result differs from approved dry run');
      verifyAssets(r.assets);
      if (!locks.verifyActive()) fail('ERR_STALE_FENCING_TOKEN', 'Commit rejected: stale lock owner');
      if (r.target.mode === 'file') {
        if (canonicalTargetPath(r.target.project_path) !== r.target.project_path) fail('ERR_APPROVAL_INTEGRITY_MISMATCH', 'Commit directory changed before commit');
        const current = fs.existsSync(r.target.project_path) ? JSON.parse(fs.readFileSync(r.target.project_path, 'utf8')) : {};
        if (digest(current) !== r.project_snapshot_sha256) fail('ERR_PROJECT_SNAPSHOT_MISMATCH', 'Project changed before commit');
        durableWrite(r.target.project_path, candidate, () => { committed = true; });
      } else {
        durableWrite(headPath, { project: candidate, project_snapshot_sha256: digest(candidate), revision: candidate.revision,
          execution_digest: ticket.execution_digest }, () => { committed = true; });
      }
      ticket.execution = { status: 'COMMITTED', fencing_token: locks.fencingToken,
        committed_steps: executedSteps, committed_revision: candidate.revision, result_snapshot_sha256: digest(candidate),
        project_snapshot: structuredClone(candidate) };
      ApprovalAuthority._write(ticket, storageDir);
      return { success: true, status: 'COMMITTED', project: candidate, committed: true,
        executedSteps, committedSteps: executedSteps, committed_revision: candidate.revision, revision: candidate.revision,
        operationPlan: structuredClone(r.operation_plan), execution_digest: ticket.execution_digest, execution_id: ticket.request_id };
    } catch (error) {
      if (attemptStarted && ticket?.status === 'CONSUMED') {
        ticket.execution = { ...ticket.execution, status: committed ? 'FAILED_AFTER_COMMIT' : 'ROLLED_BACK',
          committed_steps: committed ? executedSteps : 0, committed_revision: committed ? candidate?.revision : project?.revision,
          error: error.code || error.message };
        // Disk state still has RUNNING if journaling fails. Replay diagnoses that conservatively.
        try { ApprovalAuthority._write(ticket, storageDir); } catch (_) {}
      }
      return denied(error, committed ? candidate : project, {
        status: committed ? 'FAILED_AFTER_COMMIT' : (attemptStarted ? 'ROLLED_BACK' : 'REJECTED'), committed,
        executedSteps, committedSteps: committed ? executedSteps : 0,
        committed_revision: committed ? candidate?.revision : project?.revision
      });
    } finally { if (locks) locks.release(); }
  }
}

module.exports = { ExecutionAuthority };
