EME × Earshot — Architecture Lead Decision

Decision: Stage 31.2 acceptance is withheld pending one targeted corpus-provenance correction. Full Stage 31.3 shadow evaluation is not yet authorized.

Your report shows substantial completion: six inventoried corpus entries, 26 defect cases, six clean-control runs, two ambiguous cases, two unsupported cases, 36 reviewed ground-truth records, and 13/13 reported Stage 31.2 tests passing. The cumulative arithmetic also reconciles: 338 predecessor tests + 9 Stage 31.1 tests + 13 Stage 31.2 tests = 360 reported passing tests.

One material discrepancy remains: CORPUS-04 is identified as an eme-delivery-manifest.v1 file, not an eme-project.v1 editing project. The report assigns it track, clip, frame-rate, and aspect-ratio attributes, but does not identify the actual editing-project file from which those attributes originate. Because the frozen protocol requires six distinct source projects, this needs explicit evidence before the corpus can be accepted.

Writing
EME × Earshot
Architecture Lead Ruling — Stage 31.2 Corpus Acceptance

Phase: 31 — Real-Project Validation & Diverse Defect Benchmark
Stage Reviewed: 31.2 — Representative Project Corpus and Defect Taxonomy
Reported Branch: feature/phase-31-real-project-validation
Reported Commit: d108356
Protocol: v1.5.0
Decision: TARGETED CORPUS-PROVENANCE CORRECTION REQUIRED
Requested Next Stage: 31.3 — Non-Destructive Shadow Evaluation

1. Findings acknowledged

The following results are acknowledged on the submitted evidence:

Six corpus entries have been inventoried.

CORPUS-01 and CORPUS-05 are reported to have five tracks each, satisfying the strict greater-than-four-track quota.

Three projects are assigned to each of the two frozen duration tiers.

The 26 defect cases preserve the approved 11-class quota, with one target defect instance per case.

Six clean-control runs, two ambiguous cases, and two unsupported cases are enumerated.

Thirty-six case records and 36 independent ground-truth decisions are reported.

The source-immutability, input-checksum, exclusion-register, and reconciled-corpus-manifest deliverables are reported complete.

The Stage 31.2 test suite reports 13/13 PASS.

The combined test count of 360 is arithmetically consistent.

These results are acknowledged as reported. The repository, source files, fixture manifests, and checksums have not been independently inspected or executed by this ruling.

2. Blocking finding — CORPUS-04 source-project identity

The submitted qualification table specifies:

Project ID: CORPUS-04

Format: eme-delivery-manifest.v1

Source: fixtures/qa-audio-defects-manifest.json

Claimed attributes: 10-second duration, 30-fps timeline, two tracks, four clips, 9:16 aspect ratio.

An eme-delivery-manifest.v1 file is identified as a delivery manifest, not a canonical eme-project.v1 editing project. A manifest may describe an artifact or refer to project metadata, but it does not by itself establish the existence of the editing-project input needed for project-level diagnosis and repair evaluation.

This is a corpus qualification and provenance gap. It does not establish that the audio fixture is invalid for Earshot QA; it establishes that its status as one of the six required editing projects has not been substantiated.

Required corrective action

Provide the actual editing-project fixture underlying CORPUS-04, including:

Canonical project file path and format.

Stable project ID and its association with CORPUS-04.

Project duration, frame rate, canvas dimensions, track inventory, and clip inventory verified from the project file itself.

Project-file size and SHA-256 checksum.

Relevant source-media and sidecar references and checksums.

A documented relationship between the editing project, fixtures/qa-audio-defects-manifest.json, and the separate clean baseline used by RUN-CLEAN-04.

Evidence that the original project and media remain unchanged.

If the corresponding editing project already exists, link it explicitly and correct the Stage 31.2 corpus manifest through a preserved, versioned correction record.

If no such project exists, prepare or source an eligible editing project using the frozen corpus-expansion procedure. Do not count the delivery manifest as a distinct editing project merely to retain the required total of six.

Keep the defective audio fixture and clean-control fixture isolated. The defective test input must not contaminate RUN-CLEAN-04.

3. Corpus-manifest and test re-verification

After closing the finding:

Reconcile CORPUS-04's project identity against the actual editing-project file.

Verify the declared track and clip counts from that file.

Update the Stage 31.2 corpus and checksum inventories as required.

Preserve the existing manifest and previous test results.

Generate a new versioned corpus manifest or correction addendum without changing the frozen scoring thresholds.

Rerun the affected corpus-verification tests.

Rerun the required regression suite and report actual passing, failing, skipped, and inconclusive counts.

Confirm that all 36 benchmark cases still point to valid, isolated inputs and that the total case quota remains unchanged.

Any change to the source-project inventory must be traceable; do not silently replace a frozen input or reuse an outdated checksum.

4. Stage 31.2 acceptance criteria

Stage 31.2 may be accepted when:

Six distinct eligible editing projects are evidenced.

Every claimed project attribute is supported by the corresponding project file.

CORPUS-04's editing project and audio-delivery evidence are explicitly linked.

All 26 defect cases point to valid source-project copies.

All six clean-control inputs remain independently qualified and isolated.

The two ambiguous and two unsupported cases preserve their frozen expected behavior.

All 36 ground-truth records and fixture checksums reconcile.

The required tests pass and the evidence bundle matches the actual corpus.

5. Stage 31.3 authorization boundary

Full Stage 31.3 shadow evaluation remains unauthorized until Stage 31.2 receives acceptance.

Non-scored work may continue, including corpus source verification, checksum collection, isolated runner preparation, and shadow-evaluation harness preparation.

No scored benchmark outcomes may be collected under an unaccepted corpus. The 36-case scoring protocol and its frozen thresholds remain unchanged while this finding is resolved.

Final disposition: Stage 31.2 deliverables and reported test results acknowledged. One source-project identity gap remains. Stage 31.2 acceptance and Stage 31.3 execution authorization are pending its correction.

Immediate next step

Supply the actual CORPUS-04 editing-project file and its checksum, then show how it relates to the defective audio manifest and the separate clean baseline. If that project already exists, this should be a narrow provenance correction rather than a redesign of the 36-case benchmark.

Once the six-project inventory is substantiated and the affected corpus tests pass, Stage 31.2 can be reconsidered for acceptance and Stage 31.3 authorized.

See another version