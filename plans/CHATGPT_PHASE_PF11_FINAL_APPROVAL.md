Writing

PF-11 Stage 3 is accepted as an implementation milestone, subject to final production-release evidence closure.

Do not redesign the architecture or reopen completed stages unnecessarily.

Complete the following release-closure checks:

Run the actual title-rendering acceptance test against the packaged clean-install workflow. Verify title text, styling, placement, and visibility at expected timestamps. Save representative frames and automated assertion results. Do not substitute drawbox output for the actual title renderer.

Recompute the final release archive's SHA-256 and verify it against the standalone checksum and release manifest.

Reconcile the PF-07/PF-09 test-count changes in the final engineering report and confirm that coverage was not weakened.

Rerun the affected release-specific tests and the applicable regression suite.

Update plans/PF11_COMPLETION_REPORT.md and plans/PF11_STAGE3_COMPLETION_REPORT.md with exact commands, outputs, evidence paths, and unresolved limitations.

Use required GSD actions to achieve the goals and wherever needed.

If all checks pass, submit a final production-release decision with the release filename, version, verified SHA-256, test results, and explicit confirmation that the actual packaged acceptance workflow passed. If a gate fails, preserve the release candidate, report the blocker, and do not claim production certification.