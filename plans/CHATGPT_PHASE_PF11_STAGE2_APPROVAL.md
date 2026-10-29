Writing
EME Phase PF-11 Stage 3 — Production Packaging, Release Automation & Final Release Closure

Directive date: October 19, 2026
Authorization: Stage 3 authorized following conditional acceptance of Stage 2
Governing directive: plans/CHATGPT_PHASE_PF11_DIRECTIVE.md
Required completion report: plans/PF11_STAGE3_COMPLETION_REPORT.md

1. Objective

Prepare a production-ready EME release using the existing architecture. Demonstrate that a clean installation starts correctly, completes the real prompt-to-verified-delivery workflow, preserves existing project data, and can be upgraded or rolled back safely.

Do not equate successful source-tree tests with production readiness. The actual packaged application is the release acceptance target.

Use required GSD actions to achieve the goals and wherever needed.

2. Mandatory repository audit

Before making changes, inspect:

Existing build, test, start, and packaging scripts.

Dependency manifests and lockfiles.

Application entry points and required runtime dependencies.

FFmpeg, FFprobe, HyperFrames, and any other required rendering components.

Configuration, storage paths, persisted sessions, job records, project files, and generated media.

Existing release metadata, versioning, installer or archive conventions, and update mechanisms.

The actual Stage 1 and Stage 2 test implementations and outstanding evidence gaps.

Produce a short audit summary identifying the intended deployment target, the current release procedure, packaging gaps, and any blocker that must be fixed before proceeding.

Reuse existing repository conventions. Do not introduce a new hosting provider, paid service, update server, dependency, or distribution platform without a demonstrated need.

3. Gate A — Close inherited production blockers

Before declaring a release candidate, resolve or explicitly demonstrate closure of these outstanding checks.

A1. Media authorization and file identity

Prove that an opened file descriptor corresponds to the exact artifact authorized by the server-side media registry, including during adversarial symlink replacement or path changes.

Verify that the public media endpoint accepts only its documented, authorized identifiers and cannot turn a revision ID or arbitrary path into access to unrelated files.

Run the relevant adversarial tests and document any residual limitations.

A2. Actual title-move verification

Render the existing PF-09 title-move fixture through the configured production rendering pipeline.

Verify the actual title's text, style, placement, and visibility at the expected timestamps. Compare frames from both revisions and provide measurable evidence that the intended title change occurred.

A drawbox proxy may supplement this test but must not substitute for verification of the actual title renderer unless the application intentionally implements its title using that exact visual element.

A3. Real process-crash recovery

If earlier recovery evidence used only a simulated interruption, perform a subprocess termination and restart test using persisted artifacts.

Exercise critical boundaries around job persistence, execution commit, manifest creation, revision/history updates, and active-delivery publication.

Verify that recovery yields a coherent committed delivery or a safe previous state, without duplicate commits, dangling active pointers, or corrupt history.

A4. Idempotency under concurrency

Use simultaneous requests with the same idempotency key. Verify that only one logical job can execute and commit.

Also test a reused key with a different request payload. The implementation must not silently associate different requests with the same cached outcome.

A5. Session compatibility

Retain fixtures for historical session documents with omitted, null, and string project_path values, and add realistic persisted-session fixtures where available.

Do not silently introduce an incompatible change to schema/eme-project.v1.schema.json or schema/eme-revision-session.v1.schema.json. If a new format is necessary, justify and version it, provide a safe migration, and test supported older documents.

These checks are prerequisites for final release approval, even if their implementation overlaps with earlier stages.

4. Gate B — Reproducible production build and packaging

Create a clean-build process using the repository's existing dependency lockfile and supported runtime.

The process must:

Install dependencies using the documented, lockfile-respecting procedure.

Run required static checks, tests, and the production build.

validate required runtime and rendering dependencies.

Package all necessary runtime files, schemas, templates, configuration examples, licenses, and startup assets.

Exclude credentials, secrets, development-only dependencies, temporary output, and unrelated local user data.

Fail clearly when essential runtime prerequisites or configuration are missing.

Produce a versioned, installable archive or installer appropriate to the actual deployment target.

Provide documented startup and shutdown instructions, runtime requirements, default storage locations, and configuration steps.

Do not claim bit-for-bit reproducible builds unless repeated clean builds demonstrate that property. Report the actual result and any nondeterministic inputs.

5. Gate C — Release manifest and integrity

Generate a release manifest containing:

Application version and source commit.

Build timestamp and supported runtime versions.

Dependency-lockfile identity.

Relevant schema versions.

Release artifact filename and byte size.

SHA-256 of the final packaged artifact.

Required runtime dependencies.

Build, test, and package-validation results.

Generate a separate checksum file and validate the artifact by recomputing its SHA-256 after packaging.

Verify the archive contents independently. Ensure that the packaged release contains the necessary source-generated runtime assets and does not accidentally rely on files present only in the development environment.

Release integrity metadata must not claim that a test passed unless its actual result is recorded.

6. Gate D — Clean-install acceptance test

Install the release into a clean or isolated environment without access to the development checkout's runtime files.

Execute the following workflow using the packaged application:

Start EME and validate runtime prerequisites.

Confirm the backend health check and session initialization.

Load the established deterministic acceptance fixture.

Submit the approved natural-language editing request.

Verify the actual compiled plan and atomic operation sequence.

Complete execution and render using the configured renderer.

Run actual media QA and semantic verification.

Generate the delivery manifest and verify the hash against the final media bytes.

Confirm that the correct revision becomes active only after all required gates pass.

Open the delivery in the visual control surface and verify that its metadata and media identity match the authoritative manifest.

Perform a revision or candidate-selection workflow where the acceptance fixture and existing contracts support it.

Restart the application and verify coherent persisted job, session, history, and active-delivery state.

Use the approved fixture and prompt defined in PF-11 Stage 1. Record the exact inputs and expected outputs. Do not substitute mocked rendering for the packaged real-render acceptance test.

If a clean-install environment cannot run a required external rendering dependency, report the blocker explicitly rather than treating a partial smoke test as full acceptance.

7. Gate E — Upgrade, data preservation, and rollback

Test the documented upgrade path from the previous compatible release, when one exists.

Demonstrate:

Existing projects, persisted sessions, and user data survive the upgrade.

The application does not overwrite existing user content during installation.

Interrupted or failed installation does not leave a partially active release.

The previous known-good application can be restored.

Data migrations, if required, are safe, versioned, and documented.

The restored application starts correctly and recovers its prior coherent session state.

Checksums are verified before the release is activated.

Prefer versioned application directories and a controlled active-release pointer where compatible with the existing deployment architecture. Keep release rollback distinct from user-level timeline undo/redo.

If no previous released version exists, document that limitation and validate installation failure recovery and clean reinstall instead of inventing an upgrade result.

8. Gate F — Release automation

Provide one documented release workflow that executes, in order:

Environment and dependency validation.

Static checks and required tests.

Production build.

Package creation.

Artifact manifest and SHA-256 generation.

Independent checksum and package-content verification.

Clean-install smoke test.

Packaged real-render acceptance workflow.

Upgrade/rollback checks when applicable.

Generation of a release summary with explicit PASS, FAIL, or BLOCKED results.

The workflow must exit unsuccessfully if any mandatory release gate fails. It must not skip failed tests, weaken assertions, or mark skipped integration steps as passed.

Use existing local scripts or CI infrastructure if appropriate. Do not publish to an external registry or distribution platform without an already authorized target and documented release process.

9. Required verification evidence

Retain automated test coverage for the applicable PF-07 through PF-11 suites and add focused tests for any release-specific defects.

The completion report must distinguish:

Unit tests and mocks.

HTTP integration tests.

Actual subprocess termination and restart tests.

Real FFmpeg/HyperFrames render tests.

Rendered-frame or media-content verification.

Clean-package installation tests.

Upgrade and rollback tests.

Any manual actions or unverified environment-specific assumptions.

Record exact commands, individual suite counts, pass/fail totals, runtime versions, artifact paths, and checksums.

Do not use a green aggregate suite as a substitute for reporting a failed release-critical test.

10. Architectural invariants

Throughout Stage 3:

Keep the engine as the sole authority for planning, execution, rendering, QA, semantic verification, revision history, and active-delivery publication.

Preserve integer timebase TICKS_PER_SECOND = 120,000 and half-open timeline intervals [start, end).

Continue using the established execution and transaction mechanisms.

Never activate a failed or unverified render.

Never let historical previews or candidate previews replace the active verified delivery.

Preserve the exact candidate/revision → manifest → authorized media → SHA-256 relationship.

Keep secrets, user data, and generated project artifacts out of distributable packages unless explicitly required.

Do not add unrelated editing features or redesign the product during release closure.

11. Completion report and release decision

Create plans/PF11_STAGE3_COMPLETION_REPORT.md.

Include:

Repository audit findings and deployment target.

Source files modified and their responsibilities.

Inherited security, compatibility, crash-recovery, and visual-verification gate results.

Build procedure and runtime requirements.

Package contents and clean-install instructions.

Exact test commands and suite results.

End-to-end packaged acceptance fixture results.

Media QA and semantic verification evidence.

Artifact manifest, filename, byte size, and SHA-256.

Upgrade, data-preservation, and rollback results.

Release automation instructions and failure behavior.

Outstanding issues, severity, limitations, and release impact.

A final decision of PASS, CONDITIONAL PASS, or FAIL.

Do not declare production certification merely because all tests pass. The report must demonstrate that the actual packaged application can perform the required workflow and that its release artifact is integrity-checked.

12. Final acceptance criteria

PF-11 can receive final production certification only after:

All inherited production-critical gates are closed.

The packaged application completes the real prompt-to-verified-delivery workflow.

Failed execution, rendering, or verification preserves the previous verified delivery.

Idempotency, concurrency, and crash recovery behavior are demonstrated.

Session compatibility and media-access boundaries are validated.

The intended title revision is verified in the actual rendered output.

All mandatory regression and release tests pass.

A clean installation runs without relying on the development workspace.

Packaging integrity is validated.

Upgrade and rollback are verified where applicable.

The completion report contains reproducible evidence and the final release checksum.

Execution order: repository audit → inherited gate closure → clean build → package and integrity manifest → clean-install acceptance → upgrade/rollback verification → final regression → completion report → release decision.

External publication is a separate action and is not authorized by this directive alone.