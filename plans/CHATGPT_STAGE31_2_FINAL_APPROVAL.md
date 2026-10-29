EME × Earshot — Architecture Lead Final Decision

Decision: STAGE 31.2 UNCONDITIONALLY ACCEPTED. CHECKSUM DISCREPANCY CLOSED. STAGE 31.3 AUTHORIZED TO PROCEED.

The submitted forensic evidence resolves the audio-asset discrepancy. The actual file's SHA-256 matches the recorded digest in the historical project and clean-manifest references, and the reported byte size matches. The conflicting eb4296eb... value is identified as a transcription error in the earlier report.

CORPUS-04's project identity, defective-audio fixture, and clean-control baseline are now explicitly distinguished. The updated corpus inventory and checksum records complete the requested provenance reconciliation.

Stage 31.2 — Corpus & Defect Taxonomy

Reported closure commit: 937712e409a15ce120420a8e59102c751d5bade6

ACCEPTED

CORPUS-04 project provenance

Closed

Audio checksum discrepancy

Closed

Clean-control isolation

Accepted

Stage 31.2 tests

13/13

Reported passing

Combined regression

360/360

Reported passing

Stage 31.3 — Non-Destructive Shadow Evaluation

Formal execution authorization granted.

AUTHORIZED
Formal Architecture Lead decision
Writing
EME × Earshot
Formal Architecture Lead Decision — Stage 31.2 Final Acceptance

Phase: 31 — Real-Project Validation & Diverse Defect Benchmark
Stage Accepted: 31.2 — Representative Project Corpus and Defect Taxonomy
Frozen Protocol: v1.5.0
Reported Branch: feature/phase-31-real-project-validation
Reported Closure Commit: 937712e409a15ce120420a8e59102c751d5bade6
Next Stage Authorized: 31.3 — Non-Destructive Shadow Evaluation
Decision: UNCONDITIONAL STAGE ACCEPTANCE; EXECUTION AUTHORIZED FOR STAGE 31.3

1. Final provenance finding

The CORPUS-04 audio-source checksum discrepancy is closed on the submitted evidence.

The reported on-disk file identity is:

Path: assets/creator_reel_soundtrack_20s.wav

Size: 3,840,078 bytes

SHA-256: 1b8183af7135d64b1ee7d1d15d007fd1516a42bf41a7a64d3e66c5237d59b628

The same digest and byte size are reported in the CORPUS-06 project asset binding, the frozen clean-manifest reference, the CORPUS-04 project asset binding, and the current input-checksum inventory.

The conflicting digest eb4296eb... is identified as a reporting transcription error rather than a change to the referenced audio asset.

The original CORPUS-04 project-identity finding was previously accepted. The present addendum establishes the requested relationship between the editing project, defective-audio evidence, and clean-control baseline.

2. CORPUS-04 accepted input model

The following separation is accepted:

Editing project: projects/creator-reel-qa-10s.json

This is the canonical timeline fixture for project-level evaluation, with its own stable project ID, frame rate, canvas, clips, tracks, and asset references.

Defective-audio evaluation: fixtures/qa-audio-defects-manifest.json and its associated defective media.

The reported reference defects cover synchronization offset, excessive true peak, and an audio dropout. These cases remain isolated to their respective defect fixtures and expected outcomes.

Clean-control evaluation: fixtures/qa-audio-clean-manifest.json, used by RUN-CLEAN-04.

The reported clean baseline uses the audio asset identified above and records −2.5 dBTP, zero clipping, and zero A/V synchronization offset. The defective fixture is not used for the clean-control run, and no defect injection or repair is performed on that clean fixture.

The original project and source media are reported preserved byte-exact.

3. Stage 31.2 acceptance findings

Stage 31.2 is unconditionally accepted on the submitted evidence.

The accepted benchmark preparation includes:

Six qualified source-project entries with project-level metadata.

The required 26 defect cases across 11 defect classes.

Six independently qualified clean-control runs.

Two ambiguous cases and two unsupported cases.

Thirty-six reviewed ground-truth records.

A reconciled corpus manifest and input checksum inventory.

An exclusion register for unusable fixtures.

Passing corpus-integrity and non-destructive validation tests.

The reported cumulative verification reconciles to:

Stage 31.1 protocol suite: 9/9 PASS.

Stage 31.2 corpus suite: 13/13 PASS.

Phase 30 predecessor regression: 338/338 PASS.

Combined test total: 360/360 PASS.

These results are accepted as submitted. The repository and raw test outputs have not been independently executed or inspected by this decision.

4. Stage 31.3 authorization

Stage 31.3 — Non-Destructive Shadow Evaluation — is formally authorized to proceed.

The objective is to evaluate EME's actual detection, localization, diagnosis, confidence routing, escalation, and repair-proposal behavior against the frozen corpus and independently reviewed ground truth.

Mandatory execution constraints

Use Protocol v1.5.0 and its frozen thresholds. Do not change scoring rules after scored results become visible.

Verify all source and fixture checksums before each run. The local audio asset must fail closed if it is absent or its SHA-256 differs from the accepted input inventory.

Preserve original projects, source media, sidecars, and active-delivery identities.

Execute shadow diagnosis through the actual supported EME pipeline.

Evaluate candidate repairs only in isolated copies and through the approved execution path.

Record actual detections, localization, diagnosis, confidence, routing, abstention, proposed changes, and collateral-change results.

Run real offline renders and Earshot QA for every audio-relevant case requiring them.

Preserve all failures and inconclusive outcomes in the evidence bundle.

Mandatory scoring gates

Each of the eleven scored defect classes must independently satisfy its frozen thresholds and anti-concealment requirements. The defect-class macro average must be computed over all eleven classes, with micro-averaging reported separately.

The six clean controls must produce zero disallowed false alarms to satisfy the frozen run-level false-positive threshold. Ambiguous cases must escalate without autonomous modification; unsupported cases must be rejected explicitly and safely.

No failed class may be concealed by an aggregate metric. A required undefined or inconclusive result must follow the frozen fail-closed scoring rules.

5. Authorization boundary

Stage 31.3 execution is authorized under the existing Phase 31 directive.

This decision does not accept Stage 31.3 in advance, authorize production rollout, or authorize any subsequent roadmap phase.

At completion, submit the actual run manifest, per-case results, per-class metrics, clean-control outcomes, candidate-render and Earshot QA evidence, source checksums, regression results, and failure analysis for Architecture Lead review.

Final disposition: Stage 31.2 unconditionally accepted. Audio checksum discrepancy closed on submitted evidence. Stage 31.3 authorized to execute.

Stage 31.3 — First execution priorities

Start with the 36-case frozen manifest and run the following in order:

Input preflight: verify all 36 case records, source-project checksums, defect-fixture checksums, and ground-truth references before running EME.

Shadow diagnosis: evaluate all defect, clean, ambiguous, and unsupported cases without mutating original projects or promoting candidate deliveries.

Candidate verification: render applicable isolated repair candidates, run fresh Earshot QA, and compare results with the frozen ground truth.

Scoring and evidence: calculate per-class precision, recall, localization, micro- and macro-averages, clean-control false-alarm rate, escalation fidelity, and unsupported rejection rate.

The checksum discrepancy is closed based on the supplied evidence; I have not independently hashed the local asset. The Stage 31.3 runner must therefore verify the recorded digest against the actual input before it evaluates that asset.

Stage 31.3 is authorized. Its purpose is now to establish measured real-project performance—not to change the benchmark rules.