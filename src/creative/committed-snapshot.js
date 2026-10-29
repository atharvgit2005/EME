const { ApprovalAuthority } = require('./approval-authority.js');
const { digest, freeze, fail } = require('./execution-record.js');
const { ProjectManager } = require('../engine/project.js');

// Read durable signed execution truth, never a caller-supplied project or hash.
function loadCommittedSnapshot(executionId, storageDir = ApprovalAuthority.DEFAULT_STORAGE_DIR) {
  const ticket = ApprovalAuthority.getTicket(executionId, storageDir);
  if (ticket?.status !== 'CONSUMED' || ticket.execution?.status !== 'COMMITTED' || !ticket.execution.project_snapshot) {
    fail('ERR_COMMITTED_SNAPSHOT_REQUIRED', 'A durably acknowledged committed execution snapshot is required');
  }
  const project = structuredClone(ticket.execution.project_snapshot);
  const record = ticket.execution_record;
  ProjectManager.validate(project);
  if (project.id !== record.project_id || project.revision !== record.result_revision || digest(project) !== record.result_snapshot_sha256) {
    fail('ERR_COMMITTED_SNAPSHOT_MISMATCH', 'Committed snapshot does not match the approved execution');
  }
  return freeze({ project, assets: structuredClone(record.assets), target: structuredClone(record.target),
    provenance: { execution_id: executionId, execution_digest: ticket.execution_digest,
      creative_plan_sha256: record.creative_plan_sha256, operations_sha256: record.operations_sha256,
      project_id: project.id, project_revision: project.revision, snapshot_sha256: digest(project) } });
}
module.exports = { loadCommittedSnapshot };
