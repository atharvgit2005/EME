EME Phase 20 — Final Architecture Review

Decision: Final certification is withheld pending one remaining semantic-compatibility gate. The reported lifecycle state set is reconciled, and the artifact-integrity terminology is corrected. However, the newly documented legacy-status normalization introduces two mappings that may violate the certified Phase 19 execution and delivery invariants.

The issue is not the number of states. It is whether a legacy status can cause a job to be treated as having passed a gate that it has not actually passed.

Gate 20-D — Legacy status normalization must preserve execution semantics

The submitted StatusNormalizationMap contains two mappings that require correction or explicit evidence-based disambiguation:

Legacy status

	

Reported normalization

	

Architecture concern




COMMITTED

	

SUCCEEDED

	

A committed project mutation is not necessarily a successfully rendered, QA-verified, published delivery.




VALIDATING

	

READY_TO_EXECUTE

	

The canonical ready state requires an approved action, a verified plan hash, caller authorization, and a valid expected base revision. Validation alone does not prove those conditions.

These concerns follow directly from the previously certified invariants: operation commit is not workflow success, and a job must not bypass the approval or execution guards through recovery or legacy normalization.

The mappings may be safe if the corresponding historical statuses have stronger, documented meanings and the migration verifies the necessary persisted evidence. The report does not yet establish that. A test confirming that an alias maps to a particular string is not sufficient to prove semantic correctness.

Writing
EME Phase 20 — Architecture Closure Directive, Revision 2
Legacy Status Normalization and Certified Lifecycle Semantics

To: EME Engineering Team
From: ChatGPT Architecture Lead
Date: October 21, 2026
Milestone: Phase 20 — Production Observability, Operational Resilience & Deployment Safety
Decision: Final certification withheld pending Gate 20-D

1. Accepted findings

Based on the submitted Revision 2 report:

The claimed canonical 12-state lifecycle matches the Phase 19-certified state set.

The prior report's alternate lifecycle description has been identified as a documentation error.

SHA-256 is now correctly described as hash-based integrity verification rather than asymmetric digital signing.

The test inventory reconciles to 34 Phase 20 tests and 582 reported master-regression tests.

The recovery matrix remains identified as version 2.2.0.

These findings are accepted as reported. The repository and test results have not been independently inspected or rerun.

2. Gate 20-D — Preserve semantics during legacy normalization

Audit StatusNormalizationMap and the code paths that normalize persisted legacy job records.

A. COMMITTED must not imply workflow success without evidence

The certified architecture distinguishes an operation or project commit from end-to-end workflow success.

Do not normalize a legacy COMMITTED record directly to SUCCEEDED if COMMITTED only establishes that project mutations were committed.

A normalized job may be considered SUCCEEDED only when the required durable evidence establishes successful completion of the workflow, including the verified render, passing media QA, integrity-checked delivery manifest, and authoritative active-delivery promotion.

If the available record cannot establish whether those steps completed, preserve the uncertainty and apply the established recovery semantics. Do not infer success merely from the legacy status string.

If historical COMMITTED records have a documented meaning that guarantees end-to-end delivery, provide that mapping contract and verify the necessary evidence in the migration path.

B. VALIDATING must not imply readiness without authorization evidence

The canonical state READY_TO_EXECUTE requires the approved action, verified plan hash, applicable caller authorization, and expected base-revision guard.

A legacy record marked VALIDATING must not become ready merely because its status string was normalized. The migration must establish that the required execution gates have actually been satisfied.

Otherwise, map the record to the appropriate safe state according to its persisted evidence and recovery semantics, without skipping approval or revision validation.

3. Required regression tests

Extend tests/workflow-stage20-6-canonical-lifecycle-invariant.test.js or add a dedicated migration test suite covering:

A COMMITTED record with no verified delivery evidence cannot be promoted automatically to SUCCEEDED.

A COMMITTED record with complete, valid terminal-delivery evidence can be normalized according to a documented historical contract.

A VALIDATING record missing approval or authorization evidence cannot become READY_TO_EXECUTE.

A ready-state migration validates the plan hash and expected base revision before execution.

Ambiguous legacy records fail safely through the established recovery model.

The exact canonical 12-state set, permitted transitions, terminal immutability, and NEEDS_RECONCILIATION semantics remain unchanged.

Tests must exercise actual persisted-record normalization and recovery behavior, not solely assert individual string-to-string map entries.

4. Final verification and release provenance

After reconciliation, submit:

The updated normalization map and migration implementation with exact source ranges.

The historical meaning of COMMITTED and VALIDATING under the legacy contract.

The new test results and the complete canonical-lifecycle invariant test results.

The 34-test Phase 20 regression and full master regression results.

Fresh commit SHA, clean working-tree evidence, package size, SHA-256 digest, and packaged-file count for the same tested candidate.

Use required GSD actions to achieve the goals and wherever needed.

5. Certification and next-phase authority

Phase 20 remains uncertified pending Gate 20-D. Previously accepted requirements are not being reopened; this directive addresses the compatibility between legacy status normalization and the established workflow authorization and delivery invariants.

Planning for Phase 21 — Production Readiness, Security Hardening & Controlled Rollout may proceed in parallel. Final Phase 20 certification and full milestone transition will be reconsidered after the normalization behavior is shown to preserve the certified lifecycle's semantics.

The next submission should focus only on the two legacy mappings and their evidence-based migration behavior. The goal is to preserve compatibility without silently upgrading a partial commit to success or allowing a job to bypass approval.