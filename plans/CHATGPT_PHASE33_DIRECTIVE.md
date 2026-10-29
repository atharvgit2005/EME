The Phase 33 charter should build directly on Phase 32’s visual-intelligence work without expanding into unrestricted autonomous editing or an unbounded dataset project. My architectural decision is to prioritize multimodal audio-visual composition synthesis, combining Earshot audio observations with Phase 32 visual observations to produce deterministic, reviewable editing plans.

One pre-flight issue must be resolved first: the Phase 32 release commit you have now reported differs from the commit identified in the preceding certification ruling. I have made that a blocking entry gate rather than silently choosing one identity. It does not prevent issuing the Phase 33 charter, but implementation must not begin until the discrepancy is reconciled.

Writing
EME Phase 33 — Architecture Lead Directive & Milestone Charter

Milestone: Phase 33 — Audio-Visual Composition Synthesis
Short name: AVCS-33
Status: CHARTER APPROVED — IMPLEMENTATION SUBJECT TO ENTRY GATES
Architecture authority: EME Architecture Lead
Predecessor: Phase 32 — Visual Intelligence
Proposed certification tag: phase-33-certified
Certification model: Six sequentially reviewed stages, 33.1–33.6
Next milestone: Phase 34 remains strictly unauthorized.

1. Architecture Lead Decision

Phase 33 is authorized as the next engineering milestone, subject to the mandatory pre-flight prerequisites in Section 4.

1.1 Core mission

Build a deterministic composition-synthesis layer that combines:

Audio intelligence: Existing Earshot observations, including available beat, rhythm, tempo, and other supported audio-structure evidence.

Visual intelligence: Phase 32 observations, including supported visual regions, source-coordinate geometry, confidence, and observation freshness.

Composition intent: User-defined priorities, protected regions, timing requirements, and explicit constraints.

Deterministic planning: A versioned fusion policy and constraint solver that converts valid observations into reviewable candidate editing plans.

Controlled execution: Where explicitly approved, candidate plans pass through the existing canonical mutation and verification architecture.

The deliverable is an integrated, measurable, and auditable audio-visual composition workflow—not a general-purpose autonomous video editor.

1.2 Architectural position

Phase 33 will fuse evidence, not fuse mutation authorities.

Audio and visual intelligence remain sources of observations. The fusion layer interprets their relationship, identifies valid candidate decisions, and produces declarative plans. It does not gain direct write access to canonical project state.

OperationExecutor remains the sole canonical project mutation authority.

The architecture must distinguish the following:

Observation: What an audio or visual subsystem reports.

Decision: What the deterministic composition policy recommends.

Plan: The proposed sequence of canonical operations.

Execution: The operations actually committed through OperationExecutor.

Delivery: The independently verified rendered artifact and its integrity evidence.

These identities and states must not be collapsed into one result or represented by a single success flag.

1.3 Priority over alternative Phase 33 candidates

Phase 33 will not primarily pursue a 250+ project corpus expansion or unrestricted autonomous revision execution.

A bounded, properly annotated benchmark is required to validate AVCS-33, but the large-scale corpus expansion initiative, including any previously identified REM-04 scope, is deferred to a separately chartered milestone.

Autonomous, unreviewed revision execution is also deferred. This milestone may demonstrate end-to-end execution after explicit plan approval, but it will not authorize a system to independently approve and execute arbitrary revisions.

2. Architectural scope and exclusions
2.1 In scope

Phase 33 includes:

Integrating supported Earshot audio-observation outputs with Phase 32 visual-observation outputs.

Versioned auxiliary schemas and explicit adapters for those observations.

Validation of source identity, content checksums, project revision, timebase, coordinate system, and evidence freshness.

Deterministic mapping between audio sample positions, visual frame positions, and the canonical timeline.

Versioned audio-visual composition policies.

Beat-aware candidate cut and timing proposals.

Composition-aware placement of text or graphics where Phase 32 provides sufficient visual evidence.

Deterministic resolution of competing candidate choices under declared hard constraints.

Explicit reporting of unsatisfied constraints, insufficient evidence, and ambiguity.

Non-mutating validation and visual-quality-assessment gates before execution.

Declarative plan compilation and approved execution through OperationExecutor.

End-to-end rendering, verification, active-delivery protection, and failure-injection testing.

Benchmark development, held-out evaluation, and evidence-driven certification.

2.2 Strictly out of scope

Phase 33 does not authorize:

Modification of any of the 18 frozen canonical schemas.

A second or alternative canonical mutation engine.

Direct project writes by Earshot, vision workers, fusion code, VQA, or background services.

Silent rewriting of user intent to make a plan feasible.

Autonomous approval of arbitrary plans or unrestricted unattended revisions.

New general-purpose face recognition, persistent human identity tracking, rotoscoping, neural matting, green-screen replacement, or depth-based occlusion effects.

Neural surface-normal effects, neural pixel generation, or unrestricted generative video editing.

Introducing model weights, Python runtimes, or machine-learning packages into the core EME package.

Adding external runtime npm dependencies to the core package.

Large-scale 250+ project corpus expansion as a primary milestone deliverable.

Destructive migration, reset, cleaning, or history rewriting of protected predecessor releases.

Phase 34 work or authorization.

A necessary input that is missing, stale, contradictory, or unsupported must result in an explicit refusal, conflict report, or reconciliation requirement—not an invented observation or an unsafe fallback.

3. Canonical architecture invariants

All invariants below are release-blocking. A successful benchmark cannot compensate for an architectural violation.

INV-01 — Frozen canonical schemas

The existing 18 canonical schema files under schema/eme-*.schema.json must remain byte-identical to the certified predecessor release.

Required evidence:

Exact canonical inventory of all 18 files.

Baseline and candidate SHA-256 for every file.

Byte-for-byte comparison results.

Confirmation that no canonical schema was added, removed, renamed, or modified.

Additional auxiliary schemas may be introduced only through the approved auxiliary-schema process. They must be separately identified and must not be misclassified as members of the frozen 18-schema set.

INV-02 — Canonical timeline

The canonical timebase remains 120,000 integer ticks per second.

All canonical temporal values are integer ticks. Intervals are half-open:

[startTick, startTick + durationTick)

No floating-point seconds may become authoritative timeline positions. Conversions from samples or frames must use rational arithmetic and a declared final quantization rule.

For an audio sample index (n), sample rate (f_s), and canonical timebase (T=120{,}000):

[
t_{\text{tick}} =
\operatorname{roundEven}\left(\frac{nT}{f_s}\right)
]

For frame index (k) at rational frame rate (f_n/f_d):

[
t_{\text{tick}} =
\operatorname{roundEven}\left(\frac{kTf_d}{f_n}\right)
]

The implementation must use exact rational/integer arithmetic for the calculation and apply round-half-to-even only at the specified final quantization boundary. Each conversion path must document its maximum quantization error.

INV-03 — OP-AUTH

OperationExecutor remains the sole authority for canonical project mutation.

The fusion engine may return a declarative OperationPlan; it may not apply the plan directly. All executed operations must be recorded through the established mutation path and associated with the correct project revision and execution evidence.

A bypass, alternate write path, or hidden direct project mutation is an unconditional failure.

INV-04 — Active-delivery safety

The previous verified active delivery must remain active until its replacement has:

Passed plan and pre-execution validation.

Been executed through the authorized mutation path.

Completed the required render.

Passed fresh post-render QA.

Passed artifact-integrity verification.

Passed manifest and checksum validation.

Been eligible for explicit active-delivery promotion.

A render or QA failure after a committed project mutation must be reported truthfully. The engine must not claim that the project mutation was rolled back if it was already committed.

The prior active delivery must remain available until a replacement is verified.

INV-05 — Runtime dependency boundary

The core package.json must have no dependencies property. There must be no external runtime npm dependencies in the core package. Development dependencies may be used for tooling and tests.

No model weights or Python runtime dependencies may be shipped in or required by the core runtime.

Any out-of-band worker must be isolated, versioned, invoked through an explicit boundary, and unable to mutate canonical project state. Phase 33 should consume existing supported observation producers rather than introduce new model families.

INV-06 — Observation and decision separation

Audio and visual sidecars contain observations and provenance. They must not embed canonical edit commands as if those commands were observations.

Derived composition decisions must identify the versions and digests of the evidence and policy used to produce them. Changing a source media asset, project revision, relevant sidecar, or policy version must invalidate the affected derived result.

INV-07 — Determinism

For identical canonical inputs, evidence sidecars, policy version, and configuration, the deterministic fusion and planning stages must produce identical normalized outputs.

Nondeterministic fields such as wall-clock timestamps or elapsed time must be separated from the deterministic decision payload and must not affect its digest or decision identity.

INV-08 — User intent and conflict reporting

Explicit user constraints take precedence over optimization preferences. Hard constraints cannot be traded away to improve a composition score.

If two hard constraints cannot be satisfied together, the engine must report the conflict and decline to produce an executable plan. It must not silently delete, weaken, or reinterpret either constraint.

INV-09 — Immutable evidence and provenance

Every fusion result must have enough provenance to establish:

Source project and project revision.

Source asset identities and content digests.

Audio and visual sidecar identities, versions, and digests.

Schema and fusion-policy versions.

Timebase and coordinate-system declarations.

Freshness validation outcome.

Selected observations and material exclusions.

Plan identity and, where applicable, execution identity.

Missing or invalid provenance is a blocking condition.

4. Entry gates and pre-flight prerequisites

No Stage 33.1 implementation work may begin until the entry gates below have been evidenced.

EG-00 — Phase 32 release-identity reconciliation

Status: BLOCKING.

The preceding certification ruling identified this release commit as the authorized Phase 32 candidate:

31c60322c4a9388836692bbda31bf348006d6eeb

The current submission identifies the created phase-32-certified tag as pointing to:

31c6032bb88973aab6a4545785d5b63df8fa0ebe

These are different commit identities. This charter does not assume that either identity is a typo, and it does not independently verify the current repository or tag.

Before implementation begins, provide an evidence-backed reconciliation that establishes:

The actual result of git rev-parse phase-32-certified^{}.

The exact commit and tree identities associated with the final Stage 32.6 certification evidence.

Whether the reported identity change represents a documentation error, a distinct candidate, or a later release action.

That the immutable predecessor tags remain unchanged.

The correct Phase 33 base commit.

Do not move, force-update, or recreate an existing certified tag to make the records agree. Preserve the evidence, and use an explicit reconciliation record and an approved non-destructive correction where necessary.

Acceptance: One unambiguous, machine-verifiable predecessor release identity, supported by the sealed certification evidence. Until then, Stage 33.1 remains blocked.

EG-01 — Clean and protected repository baseline

Confirm:

The working tree and index have no unexplained changes.

The intended Phase 33 branch or worktree begins at the reconciled Phase 32 release.

No protected release tag or predecessor source is being rewritten.

Any existing uncommitted or untracked work has been preserved or explicitly accounted for.

No destructive reset or cleanup operation is being used to manufacture a clean baseline.

EG-02 — Certified baseline regression

Rerun the predecessor regression battery from the reconciled baseline and retain machine-readable output.

The supplied Phase 32 dossier reports 592/592 tests passing across 61 test files and 50 runner suites. That is the expected reported baseline, not a substitute for the required pre-flight verification.

Acceptance requires a fully passing run with no unexplained missing, failed, cancelled, or skipped mandatory tests. Any change in registered inventory or test counts must be reconciled before Stage 33.1 begins.

EG-03 — Invariant baseline

Generate a machine-readable baseline manifest covering:

The 18 canonical schema hashes.

Core package.json dependency-property state.

Dependency-lock and package inventory where applicable.

OperationExecutor mutation-authority tests.

Canonical timebase and interval-semantics tests.

Active-delivery transition and integrity behavior.

Certified predecessor tags and commit identities.

EG-04 — Input-contract availability

Inventory the real Earshot and Phase 32 sidecar formats available at the chosen predecessor commit.

Record the current schema/version, source identity fields, timestamps or observation ranges, coordinate declarations, confidence semantics, and freshness indicators.

Do not invent fields or claim that a producer supplies evidence that its actual interface does not provide. If an input contract is missing, Stage 33.1 must specify an approved auxiliary contract and adapter boundary before implementation proceeds.

EG-05 — Benchmark and policy freeze plan

Before implementation of the solver, approve:

The benchmark generation procedure.

Ground-truth annotation format.

Development/held-out partition manifest.

The deterministic composition policy version.

The definition of every applicable quality gate.

The score computation and rounding rules.

The evidence file layout and retention procedure.

Held-out labels must remain unavailable to tuning and policy selection until the final evaluation stage.

Entry decision

All EG-00 through EG-05 checks are mandatory. No waiver may be implied by the fact that Phase 32 was certified.

5. Stage-by-stage engineering plan

The stages are sequential. Each stage requires a written acceptance decision before work proceeds to the next stage. A failed stage returns for bounded remediation; it does not become accepted merely because later work appears successful.

Stage 33.1 — Fusion Contracts, Time Alignment, and Policy Specification

Objective: Freeze the contracts and semantics that allow independent audio and visual observations to be safely combined.

Required work:

Complete the real input-contract inventory for Earshot and Phase 32.

Specify the normalized audio-observation adapter and visual-observation adapter.

Define a versioned, auxiliary audio-visual evidence contract.

Define project revision, asset digest, sidecar digest, and freshness requirements.

Define exact audio-sample and video-frame to timeline-tick conversions.

Define handling for missing, stale, conflicting, low-confidence, and unsupported observations.

Specify how explicit user constraints are represented, evaluated, and reported.

Freeze the first deterministic fusion policy and its tie-breaking order.

Define the relationship between observation evidence, composition decisions, plans, and execution records.

Contract requirements:

Use exact rational/integer time conversion and the specified half-open interval semantics.

Preserve Phase 32 fixed-point coordinate conventions when using visual geometry.

Keep observations separate from decisions and canonical operations.

Make policy and schema versions explicit.

Define stable ordering and tie-breaking so equivalent inputs yield identical choices.

Ensure sidecar freshness is tied to relevant source assets and project revisions.

Acceptance criteria:

Every input contract has a documented adapter and version.

Every time and coordinate conversion has a mathematical definition and edge-case vectors.

Every missing/stale/conflicting-input condition has an explicit disposition.

The canonical schema freeze is unchanged.

Contract validation tests pass, including malformed, stale, missing, and boundary-value cases.

EG-00 through EG-05 have recorded passing evidence.

Required stage decision: Accept or reject the contracts. No solver implementation may be treated as contractually approved before this stage is accepted.

Stage 33.2 — Frozen Audio-Visual Benchmark and Ground Truth

Objective: Build a bounded, reproducible benchmark sufficient to evaluate synchronization, visual composition, conflict handling, and safety.

Required corpus:

Create 24 independently authored audiovisual fixtures organized into four scenarios:

Scenario	Primary evaluation target	Fixtures
A — Rhythmic montage	Beat-anchored cut and transition timing	6
B — Speech-led editing	Conflicts between speech structure and musical rhythm	6
C — Multi-subject composition	Text/graphics placement under visual exclusion constraints	6
D — Motion and temporal instability	Fast movement, scene changes, missing observations, and drift	6
Total	
	24

Each scenario contains four development fixtures and two held-out fixtures. This creates 16 development clips and 8 held-out clips. The held-out source media and all derived fixture variants must remain separate from development content.

The fixtures may be synthetic or appropriately licensed existing media. Each must have a reproducible construction procedure and content digest. Do not use unauthorized private footage or publish data whose licence does not permit the intended use.

Required annotations:

Audio beat or timing reference events for beat-eligible clips.

Rational source timing and frame-rate metadata.

Relevant visual target and exclusion regions where composition claims are scored.

Scene boundaries and temporal discontinuity annotations where relevant.

Hard user constraints and known infeasible/conflicting cases.

Clean controls, ambiguous cases, unsupported cases, and deliberately stale evidence cases.

A manifest linking every scored instance to its source fixture and ground-truth version.

At minimum, freeze 96 labeled decision cases:

Case category	Total	Development	Held-out
Scored defect cases	48	32	16
Clean controls	24	16	8
Ambiguous cases	12	8	4
Unsupported cases	12	8	4
Total	96	64	32

The 48 scored defects must cover at least these eight categories, with six cases per category:

Beat-anchor misalignment.

Incorrect or missed beat selection.

Audio/video temporal drift.

Invalid cut or transition timing at a scene boundary.

Text/graphics collision with annotated visual exclusion regions.

Motion-sensitive placement instability.

Conflicting hard constraints or user intent.

Stale or mismatched sidecar evidence.

Each defect class must appear in both development and held-out evaluation. The corpus manifest must demonstrate the actual distribution rather than relying on these target counts alone.

Acceptance criteria:

All 24 fixtures have source hashes, licensing/provenance records, and reproducible construction instructions.

All 96 cases have complete ground-truth records and a declared scoring rule.

The 16/8 source-level split is frozen; no source asset, derivative, or near-duplicate may cross partitions.

Every scored category is represented in both partitions.

Ground-truth annotations pass schema validation and their recorded integrity checks.

Clean, ambiguous, unsupported, and stale-evidence cases have separate scoring semantics.

Held-out labels are sealed until Stage 33.6.

Failure rule: Missing or inconsistent ground truth blocks subsequent quality claims. The corpus must not be silently amended after scoring starts.

Stage 33.3 — Deterministic Audio-Visual Evidence Fusion

Objective: Implement a deterministic, non-mutating evidence layer that joins the validated audio and visual observations.

Required work:

Implement contract adapters using the actual interfaces approved in Stage 33.1.

Validate sidecar provenance, source identity, revision, digest, and freshness.

Normalize temporal references using the canonical integer timebase.

Join observations without converting low confidence into certainty.

Produce a versioned fused-evidence result referencing its exact source observations.

Define stable serialization and deterministic evidence digests.

Detect disagreement, insufficient coverage, and invalid evidence explicitly.

Prevent stale results from being reused after relevant source or policy changes.

The fused-evidence result is not a canonical project mutation and is not itself an executable plan.

Acceptance criteria:

Identical normalized inputs generate bitwise-identical normalized fusion outputs across clean processes.

Stale or mismatched sidecars are rejected or explicitly marked unusable; they cannot silently influence decisions.

Conflicting evidence remains visible in the output.

Unsupported observations are not fabricated.

The fusion implementation cannot directly mutate project state.

Canonical timebase, schema, dependency, and mutation-authority invariants remain satisfied.

All relevant unit, adversarial-input, and regression tests pass.

Stage 33.4 — Deterministic Composition Solver and Declarative Plan Compiler

Objective: Turn fused evidence into a deterministic, constraint-respecting composition recommendation and an optional declarative operation plan.

Required work:

Generate candidate choices from supported fusion evidence.

Evaluate hard constraints before applying optimization preferences.

Implement beat-aware timing proposals.

Incorporate supported visual exclusion and placement evidence.

Preserve explicit user-selected timing, placement, and protected regions.

Reject or report infeasible requests without weakening hard constraints.

Compile accepted proposals into declarative OperationPlan instances.

Provide non-mutating VQA and a complete plan explanation.

Freeze the first policy as avcs-policy-v1.0.0, or use a separately recorded version if the policy changes before the freeze.

Policy semantics:

The solver must first reject candidates that violate hard constraints. Optimization scores apply only to the remaining feasible candidates.

For the initial policy, define integer component scores scaled from 0 to 1000:

Beat/timing fit.

Visual-clearance quality.

Shot continuity.

Explicit-intent fit.

For eligible candidates, the initial weighted policy is:

[
S=\frac{400B+300V+200C+100I}{1000}
]

where (B,V,C,I) are their respective scaled scores. Use integer arithmetic and the declared rounding rule.

This score is not permission to override a hard constraint. Candidate evaluation, weighting, and tie-breaking must be versioned. Equal-score candidates must resolve using a fixed, documented ordering rather than iteration order or randomness.

If evidence does not support a score component, the policy must follow an explicit missing-evidence rule; it may not silently fabricate a score.

Acceptance criteria:

Every emitted executable plan satisfies all declared hard constraints.

Infeasible constraints produce an explicit conflict outcome.

Every recommendation can be traced to source observations and the exact policy version.

Beat-locked plan anchors match their selected observation after canonical quantization, within the Stage 33.4 timing gate.

Plan generation is deterministic.

VQA is non-mutating.

No operation bypasses OperationExecutor.

The held-out partition remains sealed.

Stage 33.5 — Human-Approved End-to-End Execution and Adversarial Validation

Objective: Demonstrate that audio-visual evidence can safely travel through approved planning, execution, rendering, verification, and delivery promotion.

Required work:

Exercise the pipeline from validated source assets to fused evidence.

Generate composition proposals and declarative plans.

Require explicit plan approval in the test harness before execution.

Execute through OperationExecutor only.

Verify the committed project revision and operation journal.

Render representative outputs.

Run fresh post-render QA and artifact-integrity checks.

Promote the active delivery only after all required checks pass.

Inject failures before commit, after commit, during render, during QA, and during artifact verification.

Test concurrency, duplicate requests, stale sidecars, late callbacks, and recovery behavior against existing EME state-machine semantics.

Required failure cases:

Missing or corrupt audio sidecar.

Missing or stale visual sidecar.

Audio and visual observations referencing different source revisions.

Unsupported frame rate or incorrect timing metadata.

Conflicting user constraints.

A plan that fails precommit validation.

A committed mutation followed by render failure.

A missing or altered rendered artifact.

Late success or failure callbacks after a job reaches a terminal state.

Repeated requests attempting to create duplicate execution.

A candidate result attempting to replace the active delivery before integrity verification.

Acceptance criteria:

No unapproved plan is executed in the benchmark harness.

Every canonical mutation occurs through OperationExecutor.

Every precommit failure leaves the canonical project unchanged.

Every postcommit failure is reported truthfully and leaves the prior active delivery in place.

A successful job cannot promote an unverified artifact.

Duplicate and late requests cannot create contradictory canonical outcomes.

Existing terminal-state, locking, fencing, idempotency, and reconciliation guarantees remain intact.

All safety tests pass with no accepted invariant violations.

Stage 33.5 validates controlled end-to-end execution. It does not authorize unattended autonomous approval or unrestricted automatic revision execution.

Stage 33.6 — Held-Out Evaluation, Final Evidence Audit, and Phase 33 Certification

Objective: Demonstrate that the frozen implementation satisfies every gate and that the release evidence describes the exact immutable candidate being certified.

Required work:

Freeze source implementation, schemas, adapter contracts, and policy version.

Run the complete registered regression battery.

Execute held-out benchmark scoring without tuning against held-out labels.

Reconcile every quality gate against its raw machine-readable evidence.

Audit canonical schemas, runtime dependencies, and mutation authority.

Audit project revision, active-delivery, render, and artifact identities.

Validate stage-to-stage commit lineage and evidence digests.

Produce and checksum the complete final certification bundle.

Freeze a sealed release commit containing the final implementation and evidence.

Obtain a separate Architecture Lead certification decision before creating phase-33-certified.

Acceptance criteria:

Every mandatory gate in Section 6 passes.

All six stage reviews are accepted and traceable to exact commits.

All canonical invariants are preserved.

The complete final evidence bundle is self-consistent and checksum-verified.

The release tag points to the exact sealed release commit.

No unexplained source, evidence, or test changes exist between the audited candidate and release commit.

A failing result in Stage 33.6 means Phase 33 is not certified. A passing subset of gates is not conditional certification.

6. Quality gates

All thresholds below are mandatory release criteria. They are acceptance targets established by this charter; they are not claims that the current implementation has already achieved them.

GATE-01 — Evidence provenance and freshness

Required result: 100% correctness on all applicable tests.

Every consumed sidecar must match the expected source identity and relevant content digest.

Every decision must reference the correct sidecar and policy versions.

Every stale, malformed, or revision-mismatched sidecar must be rejected or explicitly excluded.

No stale-evidence case may silently influence an executable plan.

Failure: Any incorrect acceptance of stale or mismatched evidence blocks the milestone.

GATE-02 — Audio timing evidence quality

Evaluate only the explicitly annotated, beat-eligible held-out instances.

Beat-event F1 must be at least 0.90, using a declared match tolerance of ±50 ms.

Median absolute beat-timing error must be at most 25 ms.

The 95th-percentile absolute beat-timing error must be at most 50 ms.

The held-out evaluation must contain at least 40 ground-truth beat events across at least four held-out fixtures.

For precision and recall, one predicted event may match at most one ground-truth event, and matching must use a deterministic rule. Unmatched events count as false positives or false negatives as appropriate.

The report must include precision, recall, F1, median error, P95 error, denominators, per-fixture results, and aggregate results.

Failure: Missing annotations, insufficient evaluation volume, incorrect denominators, or any threshold miss blocks the gate. The report may not describe synthetic beat evidence as proof of general real-world performance.

GATE-03 — Visual composition safety

For placements designated hard-safe:

Zero positive-area intersections with applicable ground-truth visual exclusion regions on every required scored frame.

Text contrast must achieve a WCAG AA contrast ratio of at least 4.5:1 where the gate applies to the output.

Every scored placement must have traceable ground-truth regions and a reproducible geometry calculation.

Missing visual evidence must never be treated as proof that a region is clear.

A face-collision result must be evaluated against ground-truth annotations, not merely the worker's detected regions.

Failure: Any positive-area collision or applicable contrast failure blocks the gate.

GATE-04 — Canonical temporal alignment

Every approved beat-locked plan anchor must match its selected canonical beat observation within one canonical tick after the declared rational mapping and final quantization.

Frame/sample mapping must match the approved rational reference vectors within one canonical tick.

All canonical interval operations must obey integer-tick and half-open interval semantics.

Boundary, tie, frame-rate, and sample-rate tests must exercise exact arithmetic and round-half-to-even.

A floating-point approximation may not become an authoritative timeline position.

This gate measures mapping and planning relative to selected observations. It does not replace GATE-02's independent measurement of audio beat-observation quality.

Failure: Any unexplained mapping error or invalid timeline mutation blocks the gate.

GATE-05 — Constraint correctness and composition acceptability

100% of emitted executable plans must respect declared hard constraints.

Every tested infeasible hard-constraint combination must produce an explicit conflict disposition, with no executable plan.

On held-out, non-ambiguous composition cases, at least 80% of generated results must be judged acceptable by the blinded review protocol.

A minimum of three independent reviewers must score each human-reviewed case. Acceptance requires at least two of three reviewers to rate the case acceptable.

Review criteria and rating instructions must be frozen before scoring.

Results must be reported separately for each scenario, including disagreements and failure categories.

The 80% threshold is a minimum acceptability bar, not permission to trade away any hard safety constraint.

Failure: Any hard-constraint violation or failure to achieve the defined held-out acceptability threshold blocks the gate.

GATE-06 — Deterministic fusion and planning

100% normalized-output parity across three clean-process runs using identical inputs and configuration.

Evidence fusion, candidate ordering, selected decisions, plan serialization, and validation disposition must be identical.

Nondeterministic metadata must be excluded from the deterministic decision payload through a declared normalization rule.

Ties and missing-evidence conditions must resolve through explicit deterministic rules.

Failure: Any unexplained output or decision difference blocks the gate.

GATE-07 — Mutation, render, and active-delivery safety

100% pass rate for mandatory transaction and failure-injection tests.

No direct canonical mutation outside OperationExecutor.

No active-delivery promotion before complete render, fresh QA, manifest, and checksum verification.

The prior active delivery must remain active through failed replacement attempts.

A postcommit failure must not be represented as a rollback.

Terminal-state immutability and duplicate-execution safeguards must remain effective.

Failure: Any active-delivery safety violation, mutation-authority bypass, or false rollback claim blocks the gate.

GATE-08 — Architecture and release integrity

All of the following are mandatory:

All 18 frozen canonical schema files are byte-identical to the reconciled Phase 32 baseline.

Core package.json contains no dependencies property.

No core runtime dependency on model weights, Python, or external runtime npm packages.

The timebase, interval semantics, and rational conversion rules remain intact.

OperationExecutor remains the sole canonical mutation authority.

The complete registered mandatory test battery passes.

There are no unexplained test omissions, failures, cancellations, or skips.

The final candidate and certification artifacts match their declared checksums.

The release tag resolves to the exact sealed release commit.

Failure: Any invariant violation is an unconditional release blocker, regardless of benchmark quality.

7. Evidence bundle layout

The following structure is required. Paths may be extended for individual raw logs, but required files may not be omitted or replaced with prose-only claims.

evidence/
└── phase-33/
    ├── charter/
    │   ├── phase-33-charter.md
    │   ├── entry-gate-checklist.json
    │   ├── predecessor-identity-reconciliation.json
    │   ├── baseline-invariant-manifest.json
    │   └── phase-33-stage-plan.json
    │
    ├── stage-33.1/
    │   ├── stage-report.md
    │   ├── input-contract-inventory.json
    │   ├── time-alignment-contract.json
    │   ├── fusion-policy-v1.0.0.json
    │   ├── auxiliary-schema-inventory.json
    │   ├── contract-test-results.json
    │   ├── regression-lineage.json
    │   └── artifact-integrity-manifest.json
    │
    ├── stage-33.2/
    │   ├── stage-report.md
    │   ├── corpus-manifest.json
    │   ├── ground-truth-manifest.json
    │   ├── development-heldout-split.json
    │   ├── defect-taxonomy.json
    │   ├── annotation-validation.json
    │   ├── corpus-build-log.txt
    │   ├── corpus-fingerprint-manifest.json
    │   └── artifact-integrity-manifest.json
    │
    ├── stage-33.3/
    │   ├── stage-report.md
    │   ├── sidecar-adapter-contracts.json
    │   ├── evidence-freshness-results.json
    │   ├── deterministic-fusion-results.json
    │   ├── adversarial-input-results.json
    │   ├── regression-lineage.json
    │   └── artifact-integrity-manifest.json
    │
    ├── stage-33.4/
    │   ├── stage-report.md
    │   ├── frozen-policy.json
    │   ├── plan-schema-and-contracts.json
    │   ├── constraint-test-results.json
    │   ├── timing-gate-results.json
    │   ├── composition-gate-results.json
    │   ├── deterministic-parity-results.json
    │   ├── heldout-access-audit.json
    │   └── artifact-integrity-manifest.json
    │
    ├── stage-33.5/
    │   ├── stage-report.md
    │   ├── end-to-end-run-manifest.json
    │   ├── approval-boundary-audit.json
    │   ├── operation-executor-audit.json
    │   ├── render-and-qa-results.json
    │   ├── active-delivery-transition-log.json
    │   ├── failure-injection-results.json
    │   ├── concurrency-and-recovery-results.json
    │   └── artifact-integrity-manifest.json
    │
    ├── stage-33.6/
    │   ├── stage-report.md
    │   ├── final-gate-matrix.json
    │   ├── heldout-scorecard.json
    │   ├── reviewer-scorecard.json
    │   ├── canonical-schema-reconciliation.json
    │   ├── runtime-dependency-audit.json
    │   ├── mutation-authority-audit.json
    │   ├── cumulative-regression-lineage.json
    │   ├── complete-evidence-chain.json
    │   ├── artifact-integrity-manifest.json
    │   └── certification-decision.json
    │
    └── release/
        ├── release-identity.json
        ├── release-tree-manifest.json
        ├── final-test-summary.json
        ├── final-schema-hashes.json
        ├── final-runtime-dependency-audit.json
        ├── evidence-sha256sums.txt
        ├── tag-verification.json
        └── release-notes.md
7.1 Required record fields

Every stage report must include:

Stage identifier and decision.

Implementation commit and parent commit.

Exact commands used for verification.

Expected and actual test counts.

Failures, cancellations, skips, and known limitations.

Applicable gate results and raw-evidence references.

Invariant audit results.

Outstanding findings, if any.

Artifact checksum-manifest identity.

A clear statement of whether the next stage is authorized.

Every machine-readable manifest must be parseable by the declared validation tooling. Every digest must be computed from the actual artifact bytes, not copied from a previous run or inferred from a filename.

The final evidence chain must connect the accepted stages, frozen implementation, test results, corpus fingerprints, quality-gate outputs, release tree, and final tag.

8. Strict pass/fail and certification policy
8.1 Stage acceptance

Each stage is either ACCEPTED or REJECTED.

A stage is accepted only when its stated acceptance criteria are satisfied, its mandatory evidence exists, and the evidence corresponds to the exact reviewed commit.

No stage may self-certify the next stage. The stage report is a submission; the Architecture Lead decision is the acceptance record.

8.2 Mandatory regression policy

Every stage must run the complete applicable registered regression battery—not only the newly added tests.

The final release report must reconcile the registered suites, test files, test cases, and executed results. Changes in test inventory must be explained and evidenced. Suite counts and test counts must not be conflated.

Any unaccounted-for test omission or test-inventory discrepancy blocks acceptance. Mandatory tests may not be skipped to obtain a passing summary.

8.3 Immediate rejection conditions

Any one of the following is sufficient to reject a stage or withhold certification:

A canonical schema differs from its frozen baseline.

A mutation bypasses OperationExecutor.

A candidate delivery becomes active before required verification.

A committed mutation is falsely reported as rolled back.

Stale or mismatched evidence influences an executable plan without an explicit valid disposition.

A hard user constraint is silently weakened or discarded.

Determinism fails without a valid, predeclared exclusion.

The core runtime dependency boundary is violated.

The held-out benchmark is contaminated or its scoring is not reproducible.

The evidence bundle does not match the implementation it claims to certify.

The release tag does not resolve to the audited sealed commit.

8.4 Failure handling

A failed gate returns to the narrowest responsible stage. Preserve raw outputs, failed test cases, source changes, and prior manifests.

Correct the underlying defect and rerun the affected stage and all downstream dependent gates. Rerun the full required regression battery before final certification.

Do not rewrite predecessor tags, remove failed evidence, substitute a new corpus without documenting it, or overwrite the historical record to make the candidate appear to have passed.

If an implementation has committed canonical state and subsequently fails, the system must report that reality accurately. Correctness of the state transition and correctness of the report are both mandatory.

8.5 Certification rule

Phase 33 may be certified only if:

Stages 33.1 through 33.6 have all been accepted.

GATE-01 through GATE-08 all pass.

All canonical invariants remain intact.

The cumulative regression battery passes with the inventory reconciled.

The held-out evaluation and review results meet their declared thresholds.

All final evidence artifacts are integrity-verified.

The release identity and source lineage are unambiguous.

The Architecture Lead issues an explicit final certification decision.

There is no provisional, partial, or conditional Phase 33 release certification under this charter.

8.6 Release-tag policy

The final proposed tag is:

phase-33-certified

It must be an annotated release tag attached to the exact sealed release commit. Use the project's established tag-signing policy and verify the resulting tag object and peeled commit identity.

Before release approval, record:

Sealed implementation/evidence commit.

Commit tree identity.

Annotated tag object identity.

Peeled release commit identity.

Final test and evidence-manifest identities.

Verification command output.

The tag must not be created before certification approval. It must never be force-updated or moved afterward. Corrections require a new, explicitly reviewed corrective release path with preserved historical evidence.

9. Required stage decision records

At every stage boundary, the submission must use the following disposition format:

Stage: 33.x
Implementation commit: Exact commit SHA
Parent: Exact parent commit SHA
Objective: What was implemented
Tests: Expected count, executed count, pass/fail/cancelled/skipped counts
Applicable gates: Numbered gates with evidence references
Invariants: Pass/fail for every applicable invariant
Evidence integrity: Manifest identity and verification result
Outstanding findings: Explicit list or none
Decision requested: Accept or reject
Next-stage authorization requested: Exact next stage

The final Stage 33.6 submission must additionally include the complete release evidence chain and a proposed phase-33-certified tag target.

No claim of having run, observed, or verified a test or commit is valid unless its underlying command output or equivalent machine-readable evidence is provided and reconciled.

10. Phase 33 completion definition

Phase 33 is complete only when EME can take supported audio and visual observation sidecars, validate their provenance and alignment, produce a deterministic composition recommendation, compile an approved recommendation into a declarative plan, and—after explicit approval—execute and verify the resulting change through the existing canonical mutation architecture.

The implementation must be able to refuse an unsupported or contradictory request safely, preserve the prior active delivery when replacement fails, and explain the evidence and policy behind each composition decision.

A successful demonstration on a few clips is insufficient. The release must satisfy the frozen held-out benchmark, all quality gates, the complete regression requirements, and the final evidence audit.

11. Release boundary and authorization

Phase 33: Charter approved, subject to EG-00 through EG-05. Stage 33.1 implementation is blocked until the entry gates pass.

Phase 34: STRICTLY UNAUTHORIZED.

Phase 33 certification, even if achieved unconditionally, grants no authority to begin Phase 34. A new architecture directive and a separate explicit authorization decision are required.

No Stage 34 planning, implementation, release tag, or scope expansion is authorized by this document.

Architecture Lead ruling: Proceed under the AVCS-33 charter only after the entry-gate record establishes an unambiguous certified Phase 32 baseline. Preserve the frozen schemas, mutation authority, exact timeline semantics, dependency boundary, and active-delivery safety as non-negotiable invariants throughout the milestone.

Immediate next action

Resolve EG-00 first. The two Phase 32 commit hashes differ, and I have not independently verified the current tag. Once the release identity is reconciled, the team can submit the entry-gate evidence and begin Stage 33.1 under this charter.