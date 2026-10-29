EME × Earshot — Final Architecture Lead Ruling

Decision: Findings A and B are ACCEPTED. Finding C remains OPEN for one final Git-provenance verification. Phase 30 release certification remains on hold.

The corrected addendum resolves the canonical job-state typo and restores the original fault-registry mappings. The release manifest is also reported to identify the exact tested and packaged commit, 4075748615cf14716d35d7922276ad2a3fd442a3, with a matching archive checksum and size.

One material distinction remains: the addendum is reported on branch commit 3f6aca8, while the tested and packaged release commit is 4075748615cf14716d35d7922276ad2a3. The report does not include the Git ancestry and intervening-change evidence needed to establish whether the newer branch tip contains only documentation and evidence changes or also changes relevant to the release.

Decision summary

Finding A — Canonical state vocabulary

Accepted

Finding B — Fault-registry reconciliation

Accepted

Finding C — Release provenance

One check open

Phase 30 certification

Pending

Merge and certification tag

Not authorized yet

Phase 31 planning and corpus preparation

May proceed
Writing
EME × Earshot
Phase 30 Final Certification — Corrected Addendum Ruling

Current Reported Branch Commit: 3f6aca8
Tested and Packaged Release Commit: 4075748615cf14716d35d7922276ad2a3fd442a3
Proposed Certification Tag: phase-30-certified
Decision: PARTIAL ACCEPTANCE — FINAL PROVENANCE CHECK REQUIRED

1. Finding A — Canonical job-state audit

Accepted.

The corrected report identifies the approved 12-state vocabulary and states that SUBMITTED was a documentation typo rather than an executable canonical state.

The corrected canonical-state audit is accepted on the submitted evidence. The original 12-state vocabulary remains frozen.

2. Finding B — Fault-registry reconciliation

Accepted.

The revised reconciliation preserves the original fault identities and correctly identifies:

FI-08: Ledger or journal persistence failure.

FI-15: Compensation fails after partial effects.

FI-17: Repeated recovery of the same committed operation.

The corrected table is accepted on the submitted evidence, subject to the previously established requirement that each referenced test actually exercises its registered fault boundary.

3. Finding C — Release provenance

Partially accepted; one verification remains open.

The following release details are accepted as reported:

Tested and packaged source commit: 4075748615cf14716d35d7922276ad2a3fd442a3.

Manifest git_commit matches that full hash.

Archive size: 494,493 bytes.

Archive SHA-256: 22ab7c0fe7e5882457112be0b28f8af4a4647e4991f0839dec38093b54856641.

Reported package inventory: 204 production files.

Standalone checksum verification: reported successful.

The remaining question is whether the branch tip at 3f6aca8 has a verified, safe relationship to the tested release commit. Before merging the complete branch, the Architecture Lead requires evidence that the changes after the tested commit do not contain unqualified production, build, dependency, packaging, or executable-test changes.

Required Git evidence

Run the following from the repository root:

# 1. Resolve both identifiers to their full commit records.
git show -s --format='%H %P %s' 3f6aca8
git show -s --format='%H %P %s' \
  4075748615cf14716d35d7922276ad2a3fd442a3

# 2. Verify the Phase 29 certified release is an ancestor
# of the Phase 30 tested release commit.
git merge-base --is-ancestor \
  c854f6fbf254f7b1f62f7dd9ffc33429298733d2 \
  4075748615cf14716d35d7922276ad2a3
echo "Phase 29 ancestry exit code: $?"

# 3. Verify the tested release commit is an ancestor
# of the current branch tip.
git merge-base --is-ancestor \
  4075748615cf14716d35d7922276ad2a3 \
  3f6aca8
echo "Release-to-branch ancestry exit code: $?"

# 4. Identify every tracked change after the tested release commit.
git diff --name-status \
  4075748615cf14716d35d7922276ad2a3..3f6aca8

# 5. Summarize the change set.
git diff --stat \
  4075748615cf14716d35d7922276ad2a3..3f6aca8
Acceptance rule

If both ancestry checks return exit code 0, and the intervening diff contains only reviewed documentation or release-evidence changes, Finding C can be closed without reopening the previously accepted implementation stages.

If the diff contains changes to production source, executable tests, build configuration, runtime dependencies, or package-generation logic, those changes must be reviewed and the affected tests rerun. If they change the release artifact or executable behavior, rebuild the package and update the manifest and checksums from the resulting tested release source.

Do not rewrite Git history or change a manifest merely to align identifiers.

4. Conditional release authorization

The following decisions remain in effect:

Phase 30 unconditional certification: Pending closure of Finding C.

Merge into main: Not yet authorized.

Creation of phase-30-certified: Not yet authorized.

Once the ancestry and intervening-diff evidence satisfy the acceptance rule, the Architecture Lead can make the final release decision.

The certification tag must point to the exact fully tested and packaged release commit, not merely to a later documentation commit.

5. Phase 31 progression

Phase 31 planning, corpus inventory, permission review, defect-taxonomy preparation, and benchmark-protocol drafting may proceed within the existing Phase 31 directive.

Full scored benchmark execution remains gated on formal Phase 30 certification and the Phase 31.1 protocol acceptance requirements.

Final disposition: Findings A and B accepted; Finding C awaits final Git-provenance verification. Phase 30 release certification and merge/tag authorization remain pending.

What closes the hold

The decisive evidence is the full ancestry output and intervening Git diff. If that proves the release commit is an ancestor of the current branch and later changes are limited to reviewed documentation or evidence, the outstanding provenance issue can be closed without reopening the five previously accepted Phase 30 stages.

The reported 338/338 regression result and corrected fault-registry audit remain on record; the final hold is specifically about release provenance, not a newly identified failing test.