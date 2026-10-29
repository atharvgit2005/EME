Architectural ruling: The IDE-only architecture correction is accepted provisionally. The remaining task is to verify that Antigravity itself can operate EME through the local MCP server, with genuine user approval and no external model-provider calls.

This is the right architectural direction for your requirement: Antigravity is the only AI reasoning environment; EME is the deterministic editing engine.

The dossier reports 245 passing tests, eight local MCP tools, no external inference calls in the intended workflow, and preserved canonical execution authority. I have reviewed those claims but have not independently inspected commit 1b9a21e or executed the tests.

1. What is now correct

No separate model API

EME no longer needs to make its own OpenAI, Anthropic, or Gemini inference requests for the IDE-driven workflow.

Local MCP tool interface

The eight tools provide a suitable boundary between Antigravity's creative reasoning and EME's native functionality. The reported stdio tests establish that the MCP server can communicate through JSON-RPC.

Canonical execution remains authoritative

The IDE agent proposes a plan; EME validates it, compiles it, and applies mutations through OperationExecutor. That separation must remain intact.

2. Three issues I would fix before final sign-off

1. IdeAgentAdapter.hasCredentials() always returning true is misleading.

The IDE-driven mode does not require separate provider credentials, but that does not mean the adapter has credentials or that an IDE agent is currently connected.

Separate these concepts:

requiresProviderCredentials: false for IDE-driven mode.

ideOrchestratorAvailable: determined by the actual integration, not hardcoded to true.

creativePlanReceived: true only after a genuine plan has been supplied.

This prevents monitoring or readiness checks from incorrectly reporting that the Creative Director is available when Antigravity has not supplied a plan.

2. MCP server tests do not, by themselves, prove Antigravity integration.

A test that launches bin/eme-mcp.js, lists tools, and invokes a JSON-RPC method proves the server works. It does not prove that Antigravity has been configured to discover those tools or that its actual AI agent can use them.

The missing proof is a real IDE session successfully calling the local tools.

3. approval: true is not sufficient by itself to establish user approval.

EME must not treat a boolean supplied by an AI agent or arbitrary tool caller as proof that the user approved execution.

The execution gate must be backed by a genuine user-confirmation step. Approval should be bound to the specific validated plan and project revision, so that a plan changed after approval cannot reuse the previous approval.

3. The next milestone: Phase 34.8 — IDE Orchestration Acceptance

I would not add another rendering feature now. First, close this small integration milestone.

Give Antigravity the following directive.

Writing
EME Phase 34.8 — Antigravity IDE Orchestration and Approval Acceptance
Authorization

Proceed from the actual current repository HEAD.

The IDE-only AI architecture is provisionally accepted. The objective is to verify the real Antigravity-to-EME workflow and close the remaining integration and approval-boundary issues.

Use required GSD actions where applicable.

Do not introduce another model provider, model API, SDK, API key, or inference service.

1. Correct adapter availability semantics

Review IdeAgentAdapter and all callers of hasCredentials().

Do not report IDE availability merely because no provider API key is required.

Represent provider-credential requirements, IDE orchestrator availability, and receipt of a Creative Plan as separate states. Ensure an unavailable IDE agent cannot produce a false-ready status.

Preserve the no-external-model-API policy.

2. Verify the actual Antigravity connection

Configure and verify the project's supported local stdio MCP integration using the existing bin/eme-mcp.js entry point.

From a real Antigravity IDE session:

Discover the eight registered EME tools.

Invoke eme_get_project_context.

Inspect the returned grounded project and media information.

Generate a genuine Creative Plan using the model already running in Antigravity.

Submit that plan through eme_validate_creative_plan.

Compile it and run eme_dry_run_plan.

Present the validated plan and intended changes for user review.

After actual user confirmation, execute the approved plan and verify the output through the native renderer and QA tools.

Capture sufficient execution evidence to establish that the IDE agent genuinely initiated these calls. A scripted JSON-RPC test or hardcoded plan fixture is not a substitute for the real IDE smoke test.

If the environment does not permit that test, report the integration as pending rather than claiming live IDE acceptance.

3. Enforce genuine user approval

Review eme_execute_approved_plan.

Do not consider a caller-provided approval: true field sufficient evidence of human authorization.

Use the supported Antigravity interaction and tool-confirmation mechanisms, or an appropriately scoped local EME confirmation mechanism, to establish explicit user approval.

Bind approval to the validated plan hash and base project revision. Reject execution if either changes after approval. Recheck revision and execution invariants at the authoritative mutation boundary.

Ensure that unattended tool calls, retries, replay, or model-generated inputs cannot silently turn a proposal into an approved mutation.

4. Verify the no-external-API invariant

Inspect the actual default IDE-driven call path and confirm that Creative Plan generation makes no external model-provider inference requests and does not require provider API credentials.

Do not inspect, extract, persist, or replay private IDE session tokens. Do not use undocumented IDE endpoints or consumer-browser automation.

Keep mocks restricted to deterministic testing.

5. Acceptance suite

Add or update tests covering:

Separate IDE availability and provider-credential state.

Missing IDE connectivity and missing Creative Plan.

Actual MCP tool discovery and structured responses.

Plan validation, compilation, and dry-run behavior.

Human approval bound to the exact plan hash and project revision.

Rejection of changed or stale plans after approval.

Rejection of execution without genuine approval.

No unintended mutations when the IDE, approval step, or renderer fails.

No external provider inference in IDE-driven mode.

Existing OperationExecutor, replay, locking, fencing, job-state, and delivery-integrity invariants.

Run the existing regression suites and report actual commands and results.

Definition of done

The milestone is ready for acceptance when the real Antigravity agent successfully uses the local EME tools to generate and validate a Creative Plan, obtains explicit user approval, executes it through OperationExecutor, and verifies a native rendered result.

Report the actual integration configuration, smoke-test evidence, changed files, test results, and any remaining limitations.

Do not claim live IDE integration or user-approval acceptance based solely on unit tests. Do not add unrelated features. Begin implementation now.

4. Where we stand

The intended architecture is now clear:

Antigravity provides the intelligence. EME provides the editing mechanics, deterministic execution, and verification.

We should not introduce another model, key, or inference API to solve the remaining issue. We need to prove that the IDE can actually orchestrate the EME tools, and that EME will execute only the exact plan the user approved.

Once that real workflow passes, the architecture correction can receive final acceptance without opening another model-integration workstream.