# EME source import

Imported on 2026-10-29 from the existing Editing Mechanics Engine project.

The engine implementation comes from the clean `codex/eme-remediation` snapshot
`b3fcd71` (the complete revision is recorded in `source-manifest.json`). Additional
untracked source scripts, experiments, benchmark definitions, examples, plans, and
documentation come from the original checkout. When paths overlap, the audited
remediation snapshot takes precedence. All production modules under `src/`, the
three executable entry points, and the canonical schemas retain their source bytes.

The original repository and its worktree remain independent of this import. Their
history is consolidated here into eight commits; historical reports refer to their
original commit identities, paths, and test evidence. Those IDs need not resolve in
this repository, and old local paths are not portable setup instructions.

## Included

- Canonical engine, timebase, operation executor, and project persistence.
- Creative planning, approval, rendering, audio, QA, and delivery implementation.
- MCP, CLI, and HTTP/editor interfaces.
- Tests, schemas, portable fixture definitions, and verification runners.
- Supplemental source experiments and historical development tools and documents.

## Local inputs and generated output

The source import excludes generated `artifacts/` and `evidence/` records, runtime
credentials and approval stores, scratch/output directories, installed virtual
environments, downloaded third-party repositories, model weights, and private media
and font libraries. Existing reports may reference excluded files. Original copies
remain in the source project; these exclusions are not deletions from that project.
Asset directories contain setup notes instead of private absolute-path mounts.

Supplemental experiments are retained as development source. They can require
separate dependencies and media that are not supplied with the native engine.
Do not interpret their historical reports as current product acceptance.

## Verification

Run `npm run test:remediation` to verify contract and fixture hashes, portable asset
directories, approval/execution protections, native rendering, audio, and stdio MCP.
The runner allocates its output under new temporary directories. Read the root
README before running the broader historical `npm test` suite, which has external
asset and cleanup assumptions.

The source manifest records SHA-256 hashes of the imported files before these
repository-specific documentation and ignore-file changes. It also lists excluded
tracked generated records. It is an import inventory, not a signed runtime manifest.

Live agent inference, a polished hackathon editing flow, wider platform/performance
testing, and partner integrations remain separate implementation milestones.
