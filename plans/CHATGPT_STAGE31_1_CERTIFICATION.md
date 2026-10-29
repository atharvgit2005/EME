EME × Earshot — Architecture Lead Final Decision

Decision: STAGE 31.1 UNCONDITIONALLY ACCEPTED. PROTOCOL v1.5.0 FROZEN. STAGE 31.2 AUTHORIZED TO PROCEED.

The final macro-averaging ambiguity is resolved. Protocol v1.5.0 explicitly defines an unweighted macro average across the 11 scored defect classes, imposes an independent pass gate for every mandatory class, and keeps clean controls, ambiguous cases, and unsupported cases outside the defect-class macro average.

The previously outstanding protocol findings are now closed on the evidence you submitted.

Stage 31.1 — Protocol and Ground-Truth Definition

Reported commit: 55cd099

ACCEPTED

Protocol tests

9/9

Reported passing

Combined regression

347/347

Reported passing

Stage 31.2 — Representative Project Corpus & Defect Taxonomy

Fixture generation and corpus qualification authorized.

AUTHORIZED
Formal Architecture Lead decision
Writing
EME × Earshot
Formal Architecture Lead Decision — Stage 31.1 Acceptance

Phase: 31 — Real-Project Validation & Diverse Defect Benchmark
Stage Accepted: 31.1 — Corpus Definition, Ground Truth, and Benchmark Protocol
Accepted Protocol: v1.5.0
Reported Branch: feature/phase-31-real-project-validation
Reported Commit: 55cd099
Next Stage Authorized: 31.2 — Representative Project Corpus and Defect Taxonomy
Decision: UNCONDITIONAL STAGE ACCEPTANCE; EXECUTION AUTHORIZED FOR STAGE 31.2

1. Acceptance decision

Stage 31.1 is formally accepted on the submitted evidence.

Protocol v1.5.0 resolves the outstanding quantitative, corpus-provenance, clean-control, undefined-metric, and macro-averaging questions identified during previous reviews.

The five historical protocol revisions, v1.0.0 through v1.4.0, are reported preserved byte-exact.

The submitted protocol verification reports 9/9 passing tests, with a combined regression count of 347/347 across the Phase 30 predecessor baseline and Stage 31.1.

2. Binding scoring protocol

The primary macro average is frozen at the defect-class level across exactly 11 scored defect classes:

TS-GAP, TS-OVERLAP, SYNC-OFFSET, LVL-CLIPPING, CONT-DISCONTINUITY, TRN-INVALID, SDC-STALE, STR-BROKEN_REF, STR-FPS-MISMATCH, STR-ASPECT-MISMATCH, and STR-SPEED-RAMP.

The macro metric is:

Macro_Metric = (1 / 11) × Σ Metric_class

Every mandatory defect class must independently satisfy its applicable acceptance thresholds. A class-level failure or undefined required metric cannot be concealed by passing results from other classes.

Micro-averaging remains separately required and uses global true-positive, false-positive, and false-negative counts.

The following evaluation tracks remain separate from the 11-class defect macro average:

Clean controls: Six runs; run-level false-positive rate must be no greater than 0.05. Under the frozen six-run protocol, this requires zero false-alarmed runs.

Ambiguous cases: Two cases; escalation fidelity must be at least 0.95, and autonomous repair is prohibited.

Unsupported cases: Two cases; unsupported rejection rate must be at least 0.95, and autonomous repair is prohibited.

The protocol's explicit handling of zero-prediction outcomes, missing localization, undefined required metrics, and unscorable fixtures remains binding.

Audio true-peak requirements apply only to audio-relevant cases governed by the applicable delivery specification.

3. Frozen benchmark population

The accepted minimum benchmark design is:

Population	Required count
Distinct source projects	6
Scored defect classes	11
Defect instances and defect cases	26
Clean-control runs	6
Ambiguous cases	2
Unsupported cases	2
Total benchmark cases	36
Independently reviewed ground-truth decisions	36

Every defect case contains exactly one target defect instance under the frozen protocol. The clean, ambiguous, and unsupported cases retain their separate expected-outcome semantics.

The two reported five-track projects satisfy the stated minimum requirement for at least two projects with strictly more than four tracks, subject to confirmation against the actual project files during corpus qualification.

4. Authorization for Stage 31.2

Stage 31.2 — Representative Project Corpus and Defect Taxonomy — is authorized to proceed.

The engineering team may now qualify the six source projects, generate the required defect fixtures, verify permissions and provenance, and prepare the full 36-case benchmark corpus in isolated workspaces.

Stage 31.2 must preserve the frozen scoring rules. If a fixture is unsuitable, record the reason and follow the approved exclusion or corpus-expansion procedure without silently changing quotas or thresholds.

The Stage 31.2 deliverables must include the qualified project inventory, defect-instance records, clean-control fixtures, ambiguous and unsupported fixtures, input checksums, exclusion register, and a reconciled corpus manifest.

5. Non-negotiable architecture constraints

All existing EME invariants remain binding:

The 18 canonical schemas remain frozen.

OperationExecutor remains the sole canonical project mutation authority.

The canonical timebase remains 120,000 ticks per second, using integer arithmetic and half-open intervals.

The 12 canonical job states remain unchanged.

The original projects and source media remain immutable during preparation and evaluation.

Active deliveries cannot be replaced by benchmark candidates.

Confidence scores cannot override hard validation.

Ambiguous and unsupported cases must not trigger speculative autonomous repair.

No unauthorized runtime dependencies or alternate canonical mutation paths may be introduced.

6. Stage boundary

Stage 31.2 is authorized for corpus qualification and defect-taxonomy fixture generation.

This decision does not authorize scored benchmark execution. Scored shadow evaluation remains the responsibility of Stage 31.3 and may begin only after Stage 31.2 has completed and received its own acceptance decision.

Stage 31.2 must not use observed scored outcomes to adjust the frozen benchmark protocol.

Final disposition: Stage 31.1 unconditionally accepted on submitted evidence. Protocol v1.5.0 frozen. Stage 31.2 authorized. Stage 31.3 scored evaluation remains gated on Stage 31.2 acceptance.

Stage 31.2 — Immediate engineering priorities

Start with the corpus itself, not the repair engine.

1. Qualify the six source projects. Verify each project's actual format, track inventory, timing, referenced media, permissions, and checksums. Keep source fixtures immutable.

2. Generate the 26 defect cases. Seed one target defect per case according to the frozen taxonomy. Preserve a pristine baseline and record the exact changes introduced by each injection.

3. Prepare the eight control and edge cases. Validate all six clean-control runs independently, then prepare the two ambiguous cases that must escalate and the two unsupported cases that must be explicitly rejected.

4. Reconcile all 36 cases. Confirm one reviewed ground-truth decision per case, zero unintended cross-class overlap, and exact agreement between the inventory and frozen manifest.

5. Run Stage 31.2 verification. Test fixture integrity, quota compliance, ground-truth completeness, clean-control validity, and non-destructive isolation before requesting stage acceptance.

One important distinction remains: the protocol is now frozen, but its performance thresholds have not yet been demonstrated. Stage 31.2 builds and qualifies the population against which that performance will be measured. Scored shadow evaluation comes afterward, under Stage 31.3.

The Stage 31.2 execution authorization is granted based on the evidence submitted; I have not independently inspected the repository or recalculated its manifest hashes.