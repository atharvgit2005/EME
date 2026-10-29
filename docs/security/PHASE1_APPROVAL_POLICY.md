# Phase 1 execution approval policy

This policy covers supported agent commit interfaces. It does not change rendering,
audio, visual effects, or any canonical schema. Antigravity remains the reasoning
environment; EME prepares and executes finite JSON operations locally.

## Execution protocol

1. Call `eme_request_user_approval` with a project and exactly one of
   `creativePlan`, `operationPlan`, or `operation`. Include every compilation option.
   For a durable project commit, include `projectPath`; its parent must already exist.
   For creation use `project: {}` and a standalone `create_project` operation.
2. EME verifies the snapshot and local asset bytes, compiles once, simulates the
   operations, freezes generated identifiers/timestamps, and persists a sealed record.
   The result is a pending ticket, the normalized OperationPlan, and a review command.
   It contains no authorization token. Caller consent flags/hashes have no authority.
3. Run `node bin/eme-confirm.js approve <request_id>` in a trusted terminal. It shows
   the project, destination, options, every operation/parameter and asset checksum.
   Type `CONFIRM`. The record and current assets/project are checked again before
   authorization. Extra arguments and non-interactive input are rejected.
4. Submit its token to `eme_execute_approved_plan`, `eme_execute_operation`,
   `eme_create_project`, or `CreativeDirector.execute({ approvalToken, ... })`.
   File-bound records can also use `eme execute-approved --approval-token <token>`.
   A supplied executable representation/options must match the sealed record.
   Omitting them uses the exact stored operations; execution never recompiles.

`eme-confirm.js reject <request_id>` durably revokes pending or authorized tickets.
Rejected tickets cannot be confirmed again. Confirmation and execution both enforce
the ten-minute expiry. Legacy `grantUserApproval`/`confirmPendingRequest` issuance
and standalone `verifyAndConsumeApproval` do not authorize execution.

## Record and digest

New records are stored in `.eme/approvals/v2/`. Existing approval evidence remains
untouched; legacy tokens are not accepted as new execution authorizations.

The ticket format is `eme-approval-ticket.v2`. Its immutable execution payload has
format `eme-approved-execution.v1` and includes:

- Project identity, base revision and SHA-256 of the complete canonical snapshot.
- Complete Creative Plan and digest, or explicit null for a direct operation request.
- Original executable input and digest.
- Complete normalized canonical OperationPlan, its digest, and operations digest.
- All compilation options and their digest. Non-JSON/non-finite values are refused.
- Local asset identities, sources, resolved paths and independently computed SHA-256.
  Declared asset hashes must agree. Unreadable/non-local assets fail closed.
- The approved commit destination/mode, atomic transaction policy, and expected
  resulting snapshot digest and revision.

Digests use sorted object keys, preserved array order, and UTF-8 JSON. The execution
digest covers the whole payload. A per-store 0600 authority key HMAC-seals the entire
ticket, including mutable authorization/outcome state. Only a token digest is stored.
The bearer token itself is returned by interactive confirmation, never pending-request
creation. No caller-supplied hash is treated as an approval binding.

## Transaction and recovery

Execution uses the existing `SessionLockCoordinator`, session-before-job acquisition,
reverse release and active fencing checks. The project resource is its engine-hashed
identity. Ticket state is reloaded from disk under these locks; there is no in-memory
authorization cache. File projects are reloaded and compared with the supplied and
approved snapshots. Memory-mode commits maintain a durable project head.

The token becomes CONSUMED durably before candidate operations run. All protected
operations run through `OperationExecutor` on a clone, preserving existing validation,
integer ticks, half-open intervals and revision increments. Asset content, the result
digest, ownership and the project file are rechecked before commit. Project/ticket
writes use exclusive temporary files, file fsync, rename and directory fsync.

The protected route is atomic. Candidate steps are not individually committed:

- Rejected input performs no candidate execution or project commit.
- Candidate failure returns ROLLED_BACK, committed=false, committedSteps=0, even if
  earlier speculative steps succeeded. A fresh approval is required to retry work.
- Failure after project rename returns FAILED_AFTER_COMMIT and the actual committed
  revision. It never restores the old project to pretend rollback occurred.
- A consumed-token retry never executes operations. A durable committed outcome is
  reported as historical COMMITTED/FAILED_AFTER_COMMIT. An interrupted RUNNING record
  whose disk/head bytes match the expected result establishes a prior commit; other
  interrupted outcomes require reconciliation. No success is fabricated.

This execution journal is separate from existing canonical job-state schemas. Existing
job, delivery promotion, locking and non-atomic library semantics are not rewritten.
An identical HTTP operation-id retry may return its cached result only with the same
authorization and payload; it does not consume the token or execute again.

## HTTP and legacy compatibility

`POST /api/approval/request` prepares atomic edits and engine-selected project Undo/Redo
snapshots (`historyAction: "undo"` or `"redo"`). Existing project operation/history
and color-apply routes require the corresponding token in `approval_token` or the
`X-EME-Approval-Token` header. History restoration itself now uses OperationExecutor.

The following legacy routes cannot bind their full commit recipe to a reviewed record
and are therefore withheld before mutation, even when given an arbitrary token:

- HTTP session init/select/revise/undo/redo/recover, job submission/boolean approval/
  execution, CapCut import, and unbound project save.
- CLI unapproved `init`, `prompt plan --execute`, autonomous/revision/candidate commit
  workflows, and mutating `prompt session` actions.

Use the exact-operation MCP protocol and file-bound `execute-approved` instead.
Project Undo/Redo remains available through the approved HTTP path. Legacy session
Undo/Redo entry points are withheld; their underlying session/history code is preserved.
Read-only inspection, planning, dry runs, advisory perception, cancellation, and renderer
implementations remain unchanged. This is an explicit compatibility restriction, not
a claim that the legacy workflows have acquired authorization support.

## Security boundary and limitations

Interactive TTY confirmation prevents accidental pipes/headless execution; it cannot
prove physical human presence. A same-user shell-capable process can allocate a PTY,
read the local key or bearer token, modify files, load engine primitives, or run an old
server. HMAC/storage permissions are not protection against an unrestricted same-user
attacker. No OS modal, hardware authentication, or external trust service is claimed.

OperationExecutor remains a pure engine transition primitive used for compilation and
unit tests; it is not a remotely exposed authorization service. Supported agent commits
must use ExecutionAuthority. Legacy servers must be stopped/restarted when adopting
this change; the implementation in an isolated worktree does not reconfigure a live IDE.

Power-loss behavior depends on the filesystem honoring fsync/rename; crash tests cover
actual process termination, not physical power failure. Cooperating writers are locked;
an unrestricted process writing outside these interfaces remains outside the boundary.

## Verification

Run `node scripts/verify-approval-phase1.cjs`. The runner allocates fresh temporary
stores, logs and legacy cleanup roots. PTY tests drive the production CLI and clearly
simulate terminal input; they do not attest genuine human interaction. No production
environment variable, boolean or command flag enables test confirmation.
