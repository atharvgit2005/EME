# Reproducible baseline — 2026-10-27

Dedicated branch: `codex/eme-remediation`, isolated existing Phase 1 worktree,
based on `a347c3ca3979976aa7646448d770a576aeb7b621`.
The original `feature/phase-34-1a-creative-director` checkout remains untouched.
Its 72,120 untracked files and three tracked modifications were verified against
the prior forensic manifest. No cleanup, reset, relocation or deletion was used.

This baseline commit carries forward the exact inherited modifications to
`src/creative/audio-mixer-engine.js`, `src/mcp/server.js`, and
`tests/phase35-real-world-workflow.test.js`. These are distinct from approval
changes. Their original hashes and the original tracked-diff hash are recorded
in `baseline.json`. The MCP index was staged from the original bytes; the
working copy retains the separate approval candidate for the next commit.

Eighteen required schemas and 22 small source/JSON fixtures were absent from Git.
They are now versioned with their original bytes. All 26 schemas and these fixtures
have independent SHA-256 checksums in `baseline.json`. Their absence in both old
revisions cannot establish compatibility; the manifest now provides a real baseline.
No media, tickets, private data, raw logs or historical rendered evidence was staged.
No applicable AGENTS or GSD instruction was found in this repository or ancestors.

Verification: `node scripts/verify-contract-baseline.cjs` exited 0:
`Verified 26 schema and 22 fixture hashes; missing/altered files fail closed.`
`git diff --cached --check` exited 2 for an inherited trailing blank line in
`eme-beat-analysis.v1.schema.json`; its bytes were deliberately preserved. The source preservation check exited 0:
tracked diff unchanged, all 43 copied source inputs identical, untracked count unchanged.
New test output is allocated under fresh OS temporary directories. Legacy test cleanup
is confined to those directories by the bounded approval runner.
