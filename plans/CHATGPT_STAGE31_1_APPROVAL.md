EME × Earshot — Architecture Lead Review

Decision: Stage 31.1 is provisionally acknowledged, but unconditional acceptance is withheld pending a targeted protocol-evidence closure. Full Stage 31.2 authorization remains pending.

The report establishes meaningful progress: the Phase 30 entry gate is reported as passing, six diverse projects are inventoried, all ten defect families are mapped, and the Stage 31.1 suite reports 8/8 passing. The reported cumulative total of 346/346 is also arithmetically consistent.

However, the Phase 31 directive requires the frozen protocol to specify quantitative minimums for independent defect cases, clean controls, reviewed ground truth, project complexity distribution, and fixture exclusions. Those specific commitments are not visible in the completion report. Because they determine whether the benchmark can produce defensible conclusions, I will not infer that they exist merely from the test suite's passing result.

Decision summary

Phase 30 entry gate

Accepted on evidence

Stage 31.1 implementation and tests

Acknowledged

Frozen scoring protocol completeness

Evidence required

Unconditional Stage 31.1 acceptance

Pending

Stage 31.2 full execution

Pending
Writing
EME × Earshot
Architecture Lead Ruling — Stage 31.1 Protocol Evidence Closure

Phase: 31 — Real-Project Validation & Diverse Defect Benchmark
Stage Reviewed: 31.1 — Corpus Definition, Ground Truth, and Benchmark Protocol
Reported Branch: feature/phase-31-real-project-validation
Reported Commit: 200f645
Requested Next Stage: 31.2 — Representative Project Corpus and Defect Taxonomy
Decision: PROVISIONAL ACKNOWLEDGMENT; TARGETED EVIDENCE CLOSURE REQUIRED

1. Findings accepted

The following accomplishments are acknowledged on the submitted evidence:

Phase 30 predecessor release verification and the reported 338/338 passing regression baseline.

Six inventoried projects spanning different editing genres, durations, frame rates, aspect ratios, audio cases, and a negative control.

A taxonomy mapping the ten required defect families.

An independent ground-truth protocol.

A benchmark scoring specification with reported numerical thresholds.

A support and limitation matrix.

A frozen benchmark manifest with reported SHA-256 integrity verification.

The Stage 31.1 test suite reporting 8/8 passing tests.

The submitted cumulative test arithmetic also reconciles: 338 predecessor tests plus eight Stage 31.1 tests equals 346 reported passing tests.

These results are acknowledged as reported. The repository, corpus files, and test suite have not been independently executed or inspected by this decision.

2. Required closure A — Quantitative corpus minimums

The Phase 31 directive requires the frozen protocol to establish, before scored evaluation:

Minimum distinct source-project count.

Minimum independent cases for each mandatory defect class.

Clean-control count.

Required complexity distribution.

Minimum independently reviewed ground-truth cases.

Criteria for excluding unusable fixtures.

Procedure for expanding the corpus if a mandatory class lacks sufficient coverage.

The completion report identifies six projects and ten defect families, but it does not state the frozen numerical minimums or demonstrate the expected case counts for each family.

Required action

Provide the relevant contents of benchmark-scoring-spec.json, corpus-inventory.json, and ground-truth-protocol.json showing these commitments explicitly.

The protocol must distinguish a project, a defect instance, a benchmark case, and a reviewed ground-truth decision. Multiple seeded variants of one source project must not be presented as independent source-project diversity.

The protocol must also make clear how clean controls, ambiguous cases, unsupported cases, and unscorable cases contribute to each metric's denominator.

3. Required closure B — Per-class scoring and threshold semantics

The reported quantitative criteria are:

Detection precision ≥ 0.90.

Detection recall ≥ 0.85.

Localization IoU ≥ 0.80.

True peak ≤ −1.0 dBTP where the applicable audio-delivery specification requires it.

Zero collateral difference under the defined comparison contract.

The frozen scoring specification must define these precisely.

Required action

For each mandatory defect class, document:

Metric definition and unit.

Numerator and denominator.

Minimum sample size.

Threshold and failure boundary.

Expected reference or baseline, where applicable.

Treatment of ambiguous, unsupported, and unscorable cases.

Whether aggregation uses macro-averaging, micro-averaging, or both.

Any uncertainty or limitation caused by a small sample size.

The true-peak requirement must be applied only to audio-relevant cases for which the governing delivery specification requires that ceiling; it must not be imposed indiscriminately on video-only or otherwise inapplicable cases.

A single aggregate precision or recall threshold does not replace the required per-class reporting. Any change to a threshold after scored results become visible requires a documented protocol version change and preservation of the original results.

4. Required closure C — Corpus provenance and permissions

The project inventory lists license labels such as MIT, CC-BY, CC-BY-SA, and CC-0. Those labels are acknowledged, but the report does not provide the underlying source and permission evidence.

Required action

For every corpus project, provide:

Stable project identifier.

Original source identifier or authorized repository location.

Exact source revision or version.

License identifier and reference.

Required attribution and share-alike obligations, where applicable.

Explicit permission evidence for assets not adequately covered by the listed license.

Project and source-media checksums.

Conversion history and a record of any missing or substituted media.

Privacy and distribution restrictions.

Do not assume that a license label on a project automatically licenses every piece of embedded media. Where rights or provenance are uncertain, exclude that asset from scored use until resolved.

5. Protocol freezing and version control

The benchmark must remain unscored until the required protocol fields and permissions are accepted.

If the current frozen protocol already contains all the required commitments, supply the specific entries and confirm their hashes against the frozen manifest. No protocol revision is necessary if the existing evidence is sufficient.

If a required field is absent:

Create an explicitly versioned protocol revision.

Preserve the existing frozen protocol and its manifest as historical evidence.

Add the missing corpus, scoring, and ground-truth commitments.

Regenerate the manifest and SHA-256 digests for the revised protocol.

Rerun the affected Stage 31.1 verification tests and the required regression checks.

Record why the revision was necessary.

Do not silently replace a frozen protocol or reuse its earlier checksum for changed content.

6. Stage 31.1 acceptance criteria

Unconditional acceptance may be granted when the submitted evidence establishes that:

The corpus minimums and defect-case quotas were frozen before scored evaluation.

All mandatory defect classes have defined minimum case counts and scoring rules.

Clean, ambiguous, unsupported, and unscorable cases have explicit evaluation semantics.

Independent ground-truth review requirements are concrete and auditable.

Project permissions, provenance, and input checksums are traceable.

The scoring specification preserves the stated numerical thresholds and defines their applicability.

The frozen manifest matches the actual protocol contents.

The affected Stage 31.1 tests and required regression tests pass.

No benchmark score has been used to change acceptance criteria retroactively.

7. Stage 31.2 authorization boundary

Full Stage 31.2 execution remains pending Stage 31.1 acceptance.

Non-scored corpus inventory preparation, provenance collection, permission review, and candidate-fixture preparation may continue in isolated workspaces. No scored benchmark evaluation may begin until the protocol is accepted.

Once Stage 31.1 is accepted, Stage 31.2 can proceed with corpus qualification, defect-instance coverage, seeded-defect classification, clean controls, and input-checksum reconciliation.

Final disposition: Stage 31.1 implementation and reported test results acknowledged. Protocol evidence closure required. Full Stage 31.2 execution authorization pending.

What closes this review

The most useful next submission is a focused addendum containing the actual frozen minimum-case table, per-class scoring rules, and per-project provenance references, along with their manifest verification output.

The objective is not to increase the corpus arbitrarily. It is to decide before scoring what constitutes enough evidence for EME's results to be meaningful. Once that is frozen and verified, Stage 31.1 can be accepted and Stage 31.2 formally authorized.