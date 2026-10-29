1. Binding corrections before implementation

The six-stage plan is approved with the following mandatory engineering constraints. These are implementation instructions, not a request to restart reconnaissance.

Correction 1 — Implement a real Python worker bridge

The plan proposes invoking python3 -m earshot.api. Earshot's published earshot/api.py is a lazy-loading Python API facade; the plan has not established that it implements the proposed stdin JSON-lines worker protocol.

Implement a dedicated, narrowly scoped EME worker bridge that imports earshot.api, dispatches only explicitly supported actions, validates each request, and emits one bounded JSON response per request. Alternatively, use Earshot's actual MCP server with a compatible MCP client. Do not assume that a JSON-RPC server exists merely because the API functions do.

Keep measure and sfx_check model-free where their documented behavior permits. Full perception remains a separate, optional mode.

Correction 2 — Replace the destructive rollback procedure

The proposed git reset --hard phase-23-certified followed by git clean -fd is not approved. It can discard local changes, untracked test fixtures, diagnostic artifacts, and audit evidence.

Develop on a dedicated Phase 25 branch or isolated Git worktree created from the certified baseline. Roll back by reverting the integration commits or returning to the certified baseline in the isolated worktree, while preserving logs and evidence. Never run broad destructive cleanup as the default integration rollback.

Correction 3 — Tighten filesystem authorization

Allowing arbitrary files under repoRoot or /tmp/ is too broad. Restrict production inputs to media paths explicitly supplied by EME's render orchestrator inside the authorized render workspace. Use canonical real-path containment checks and reject symlink escapes.

EME must choose the diagnostic output location. Earshot cannot choose arbitrary output paths, and returned paths must never be trusted without validation. Tests may use a dedicated, controlled fixture directory.

Correction 4 — Finalize strict contract semantics

Confirm the $schema and $id fields contain actual URI strings, not Markdown-formatted links. Apply strict property validation to nested contract objects as well as the root.

Normalize non-finite measurements such as negative infinity to null, with an explicit reason. NOT_APPLICABLE must describe a request-level condition; an unavailable individual metric should not make an otherwise successful request appear wholly inapplicable.

Confirm that the existing canonical QA report schema supports the proposed check IDs and statuses. Do not modify frozen canonical schemas to accommodate the adapter.

Correction 5 — Resolve measurement and threshold conflicts

The plan gives both a -16 to -9 LUFS acceptance band and a -14 LUFS ±2 LU profile, which are not equivalent. Define named, configurable delivery profiles with one authoritative target and tolerance. Keep integrated loudness and true-peak results separately interpretable.

Reconcile the conflicting fixture descriptions (+0.8 versus +1.8 dBTP after clipping). The generator must measure and record the actual decoded output rather than assume a target value. It must also distinguish source PCM from the final AAC-encoded stream.

At 30 fps, one frame is approximately 33.333 ms, not 40 ms. Define whether the sync acceptance threshold is a fixed 40 ms policy or a frame-derived tolerance, and calculate it using the supplied rational frame rate.

Correction 6 — Separate initialization and request budgets

Document an independent worker-startup/readiness timeout, model-initialization policy, per-request timeout, and termination grace period. A 15-second request budget cannot guarantee that a cold model load taking 20–40 seconds will complete.

Explicitly test cold and warm startup, watchdog expiry, process-tree termination, and subsequent worker recovery. A timed-out or unavailable Earshot service must never silently produce a passing Earshot check.

2. Approved implementation sequence

These stage gates determine the order of implementation. No separate Architecture Lead approval is required between stages if the acceptance conditions are met.

Stage

	

Authorization and exit gate




25.1 — Contracts

	

Implement strict request/response contracts, status semantics, validation and internal schema tests.




25.2 — Worker

	

Implement the explicit Python bridge, resource bounds, path containment, timeout handling, and cleanup. Prove failure isolation before integration.




25.3 — DSP QA

	

Integrate objective measurements alongside FFmpeg; validate the synthetic measurements against ground truth.




25.4 — Sync analysis

	

Add optional picture-to-sound alignment analysis; validate measured offsets, tolerances and false-positive behavior.




25.5 — QA reporting

	

Map results through existing compatible QA structures; generate controlled diagnostic artifacts without changing canonical project state.




25.6 — Certification

	

Run all seven planned tests, expanded security and lifecycle cases, frozen-schema checks, and the existing regression suites.

The seven proposed tests are a minimum, not a maximum. The final battery must include malformed or oversized responses, path and symlink escapes, incomplete measurements, repeated timeout/restart behavior, and proof that neither session.active_delivery nor canonical project state changes during inspection.

3. Formal authorization
Writing
EME × Earshot — Phase 25 Implementation Authorization

Milestone: Phase 25 — Read-Only Audio QA & Perception Adapter
Architecture decision: APPROVED WITH BINDING IMPLEMENTATION CONSTRAINTS
Authorization: GO AHEAD
Scope: Stages 25.1 through 25.6

The Architecture Lead authorizes source implementation of the Phase 25 integration plan, subject to the binding corrections in the accompanying architecture review.

Implementation may commence with Stage 25.1 and proceed sequentially through the six approved stages. The corrections are mandatory implementation constraints and do not require another full reconnaissance or plan-review cycle.

The following boundaries remain absolute:

Earshot is an optional, out-of-process, read-only analysis service.

OperationExecutor remains the sole canonical project mutation authority.

Native FFmpeg QA must continue operating when Earshot is missing, unavailable, malformed, or timed out.

Canonical schema/*.v1.schema.json files remain unchanged.

EME's package.json must retain zero external runtime npm dependencies.

All timeline times and offsets must use EME's canonical integer tick utilities at 120,000 ticks per second.

Earshot findings, scorecards, and proposed future corrections cannot independently authorize mutation, delivery promotion, or certification.

The destructive Git reset/clean rollback sequence in the submitted plan is rejected and must not be executed as the integration's default rollback procedure.

Stage acceptance

Each stage must produce its implementation artifacts, tests, results, and concise evidence record before the next stage is considered complete. A failed acceptance gate blocks progression to dependent stages until the defect is corrected.

The initial production scope excludes sound synthesis, sound-kit generation, automatic clip retiming, automatic gain repair, and any change to canonical mutation authority.

Phase 25 completion criteria

Phase 25 can be presented for final certification once:

The Python bridge and request/response contracts are validated.

All seven minimum acceptance scenarios and the required expanded safety cases pass.

Missing-tool and timeout fallback are demonstrated.

Ground-truth loudness, true-peak, and synchronization measurements match the calibrated fixture within their explicitly defined tolerances.

Canonical schemas remain unchanged and EME's npm dependency invariant is preserved.

Project state and verified active delivery remain unchanged by Earshot inspection.

The existing regression suite passes against the identified candidate commit.

Required execution instruction: Use required GSD actions to achieve the goals and wherever needed.

Final decision: Stop reconnaissance. Go ahead with Phase 25 implementation under these binding constraints.

You are authorized to begin Stage 25.1 now. Implement the contract and worker boundary first, use an isolated feature branch or worktree, and preserve the certified Phase 23 baseline and all existing evidence. Do not start automatic repair behavior as part of this milestone.