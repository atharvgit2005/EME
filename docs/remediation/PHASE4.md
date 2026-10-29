# Contracts and durable replay — 2026-10-27

All 26 schema files remain byte-exact against the versioned baseline. The internal
validator now enforces the vocabulary actually present: type (finite numbers and safe
integers), required own properties, local refs, const, enum, properties, additional
properties (false or subschema), items, min/maxItems, minLength, pattern, minimum,
maximum, exclusiveMinimum and strict date-time format. Metadata keywords do not
alter validation. This is the repository's bounded vocabulary, not a claim of full
JSON Schema 2020-12 implementation. Schemas were not rewritten to fit producers.

Creative Plan validation verifies the actual canonical snapshot digest. Context retains
a non-serialized canonical copy for adapter validation; CreativeDirector independently
validates against the real project before accepting/persisting either IDE or mock
output. The mock producer now omits an undefined optional field. EditBrief compilation
computes the snapshot digest and blocks a declared mismatch. Creative compiler output
is checked against the actual OperationPlan schema before success is returned.

PlanStore validates identity/schema/fingerprint, rejects traversal and conflicting reuse
of IDs, and uses fsynced exclusive temporary files with atomic hard-link publication
without replacement. Same-content retry is idempotent. Partial orphan temporary files
are never read as plans. Reads validate identity and fingerprint after restart. Accepted
execution records from Phase 1/2 retain exact operations and committed snapshots for
replay without invoking a model. Undo/Redo uses OperationExecutor's history restoration
with current revision+1; editing after undo invalidates redo.

Verification on Node 20.20.1:

`node --test tests/contracts-replay.test.js`, exit 0:

```text
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1658.189583
```

Includes every implemented validation keyword, an existence/hash check over independently
copied baseline files before altering/moving temporary copies, invalid compiler inputs,
snapshot mismatch, immutable IDs, restart, write failure, corrupt partial JSON, actual
SIGKILL before/after publication and approved HTTP Undo/Redo invalidation/revisions.
A fresh copy containing only enumerated tracked inputs plus the new test also passed
baseline validation and these eight tests (exit 0, 776.305666 ms). This was a source
copy check; final Git archive clean-checkout validation remains Phase 7 work.

`node scripts/verify-approval-phase1.cjs`, exit 0: 75+39 tests, zero failed/skipped.
`node scripts/verify-native-delivery.cjs`, exit 0: 18/18, zero failed/skipped,
9053.844167 ms. Baseline and diff checks exit 0. Initial stricter validation exposed
a nonconforming color test ID (74/75 focused passed) and the mock's undefined optional
property (3/6 new passed). Producers/fixture ID were corrected; rules were not relaxed.
Raw bounded-run logs remain in fresh temporary evidence roots.

Changed files: engine validator; Creative Plan validator/compiler/store; context builder;
adapter and director acceptance; EditBrief compiler; conforming color fixture ID;
contracts/replay tests; this report. Legacy milestone tests that assume boolean approval
are not acceptance evidence and have not been wholesale rewritten or run.
