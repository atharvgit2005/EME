# Actual changes by phase

Paths are repository-relative. Each commit is isolated on `codex/eme-remediation`; no merge/push.

## Phase 0 — abde2f2

| Actual file | Reason |
| --- | --- |
| `.gitignore` | Exclude local credentials, forensic logs and generated outputs. |
| `docs/remediation/PHASE0.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `docs/remediation/baseline.json` | Checksums for actual inherited source/schema/fixture prerequisites. |
| `fixtures/audio/generator.js` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/briefs/brief-pf02-conflict.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/briefs/brief-pf02-missing-clip.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/briefs/brief-pf02-scenario1.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/briefs/brief-pf02-stale-rev.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/expected/brief-g01-expected.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/expected/brief-g02-expected.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/expected/brief-g03-expected.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/expected/plan-pf02-scenario1-expected.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/pf03/beat-analysis/beat-pf03-ambiguous.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/pf03/beat-analysis/beat-pf03-low-confidence.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/pf03/beat-analysis/beat-pf03-scenario1.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/pf03/briefs/brief-pf03-scenario1.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/pf03/expected/plan-pf03-scenario1-expected.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/pf03/projects/project-pf03-insufficient-handles.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/pf03/projects/project-pf03-locked-broll.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/pf03/projects/project-pf03-scenario1.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/projects/project-g01-export.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/projects/project-g02-reel.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/projects/project-g03-contradiction.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/projects/project-pf02-locked-track.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `fixtures/prompt-core/projects/project-pf02-scenario1.json` | Version exact inherited source/JSON fixture prerequisite; hash in baseline. |
| `schema/eme-beat-actor-plan.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-beat-analysis.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-candidate-set.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-color-grade.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-constraint.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-delivery-manifest.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-delivery-run.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-edit-brief.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-intent-envelope.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-media-qa-report.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-musical-structure.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-operation-plan.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-preference-feedback.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-preference-profile.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-render-job.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-revision-run.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-revision-session.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `schema/eme-sfx-cue.v1.schema.json` | Version exact inherited missing schema prerequisite; no schema rewrite. |
| `scripts/verify-contract-baseline.cjs` | Bounded reproducible verification with unique output roots and raw evidence. |
| `src/creative/audio-mixer-engine.js` | Carry forward exact inherited tracked modification separately from remediation. |
| `src/mcp/server.js` | Carry forward exact inherited tracked modification separately from remediation. |
| `tests/phase35-real-world-workflow.test.js` | Carry forward exact inherited tracked modification separately from remediation. |

## Phase 1 / 1.1 — 51b0cc7

| Actual file | Reason |
| --- | --- |
| `bin/eme-confirm.js` | Use production interactive authority and durable rejection; retain PTY limitation. |
| `docs/remediation/PHASE0.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `docs/security/APPROVAL_THREAT_MODEL.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `docs/security/PHASE1_APPROVAL_POLICY.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `docs/security/PHASE1_IMPLEMENTATION_REPORT.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `scripts/verify-approval-phase1.cjs` | Bounded reproducible verification with unique output roots and raw evidence. |
| `src/cli/index.js` | Protected exact execution/native delivery and explicit withholding of unsafe legacy paths. |
| `src/creative/approval-authority.js` | Durable signed tickets, interactive issuance, rejection and single-use policy. |
| `src/creative/creative-director.js` | Validated persistence and protected execution without recompilation. |
| `src/creative/execution-authority.js` | Shared locked mutation/consumption transaction, immutable committed snapshot and truthful outcomes. |
| `src/creative/execution-record.js` | Seal exact operations, snapshots, options/defaults, destinations and physical assets. |
| `src/creative/index.js` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `src/engine/operations.js` | Canonical history restoration and exact monotonic revision protection. |
| `src/mcp/server.js` | Protect mutation and delivery contracts; actual stdio, truthful status and safe boundaries. |
| `src/ui/server.js` | Protect editing/history/color; unify delivery; isolate and label previews. |
| `tests/helpers/phase1-approval.cjs` | Isolated fixture/production-CLI/process harness; no production confirmation bypass. |
| `tests/helpers/phase1-authorized-fetch.cjs` | Isolated fixture/production-CLI/process harness; no production confirmation bypass. |
| `tests/helpers/phase1-confirm-child.cjs` | Isolated fixture/production-CLI/process harness; no production confirmation bypass. |
| `tests/helpers/phase1-execute-child.cjs` | Isolated fixture/production-CLI/process harness; no production confirmation bypass. |
| `tests/mcp-server.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/phase1-approval-boundary.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/timeline-stage18-2-operations.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/timeline-stage18-3-concurrency.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |

## Phase 2 — d94f468

| Actual file | Reason |
| --- | --- |
| `docs/remediation/PHASE2.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `src/creative/committed-snapshot.js` | Load only signed, acknowledged committed snapshots. |
| `src/creative/execution-authority.js` | Shared locked mutation/consumption transaction, immutable committed snapshot and truthful outcomes. |
| `src/mcp/server.js` | Protect mutation and delivery contracts; actual stdio, truthful status and safe boundaries. |
| `src/prompt-core/render-orchestrator.js` | Managed dispatch from authoritative committed snapshot to native adapter. |
| `src/renderers/canonical-native.js` | Render immutable canonical timing/media/transforms/effects/audio; reject unsupported state. |
| `src/renderers/canonical-text-rasterizer.py` | Raster plain text with measured alpha bounds using the existing Pillow dependency. |
| `tests/canonical-render.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |

## Phase 3 — b1e88b1

| Actual file | Reason |
| --- | --- |
| `docs/remediation/PHASE3.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `scripts/verify-native-delivery.cjs` | Bounded reproducible verification with unique output roots and raw evidence. |
| `src/creative/audio-mixer-engine.js` | Canonical sample mixing, explicit gain control and fail-closed actual audio measurements. |
| `src/mcp/server.js` | Protect mutation and delivery contracts; actual stdio, truthful status and safe boundaries. |
| `src/orchestration/artifact-integrity-guardian.js` | Require valid physical manifest integrity fields. |
| `src/prompt-core/job-orchestrator.js` | Fsync durable job persistence while preserving lifecycle protections. |
| `src/prompt-core/native-delivery.js` | Durable job/retry/recovery, stale/fenced guarded publication and evidence verification. |
| `src/renderers/final-media-qa.js` | Measure actual final mux streams, decode, loudness, true peak, clipping, sync and integrity. |
| `src/renderers/inspector.js` | Reject missing/invalid stream metadata and report measured stream profile. |
| `src/renderers/qa-engine.js` | Require final-media audit and failed-check aggregation. |
| `tests/canonical-render.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/helpers/canonical-media.cjs` | Isolated fixture/production-CLI/process harness; no production confirmation bypass. |
| `tests/helpers/native-delivery-child.cjs` | Isolated fixture/production-CLI/process harness; no production confirmation bypass. |
| `tests/native-delivery.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |

## Phase 4 — b5fb803

| Actual file | Reason |
| --- | --- |
| `docs/remediation/PHASE4.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `src/creative/adapter/runtime-llm-adapter.js` | Validate against canonical context and produce conforming deterministic mock JSON. |
| `src/creative/creative-context-builder.js` | Ground canonical snapshot/media context and backend capabilities. |
| `src/creative/creative-director.js` | Validated persistence and protected execution without recompilation. |
| `src/creative/creative-plan-compiler.js` | Reconcile actual plan/audio/visual contracts and emit exact canonical operations. |
| `src/creative/plan-store.js` | Immutable, fsynced publish-once plans and integrity-checked replay. |
| `src/creative/schema-validator.js` | Validate Creative Plan contracts and actual project snapshot digest. |
| `src/engine/validator.js` | Enforce the schema vocabulary actually present, without changing schema bytes. |
| `src/prompt-core/operation-plan-compiler.js` | Verify declared brief snapshot against engine-computed project digest. |
| `tests/contracts-replay.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/phase1-approval-boundary.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |

## Phase 5 — 84284b4

| Actual file | Reason |
| --- | --- |
| `docs/remediation/PHASE5.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `scripts/verify-native-delivery.cjs` | Bounded reproducible verification with unique output roots and raw evidence. |
| `src/creative/audio-catalog.js` | Verify physical bytes/metadata and normalize declarations and availability. |
| `src/creative/audio-contracts.js` | Normalize speech units and SFX identities/ticks at a single boundary. |
| `src/creative/audio-mixer-engine.js` | Canonical sample mixing, explicit gain control and fail-closed actual audio measurements. |
| `src/creative/creative-context-builder.js` | Ground canonical snapshot/media context and backend capabilities. |
| `src/creative/creative-plan-compiler.js` | Reconcile actual plan/audio/visual contracts and emit exact canonical operations. |
| `src/creative/speech-ducking-compiler.js` | Exact tick/sample envelopes, attack/release and real mono/stereo WAV frame parsing. |
| `src/engine/time.js` | Deterministic rational seconds-to-tick conversion. |
| `src/renderers/canonical-native.js` | Render immutable canonical timing/media/transforms/effects/audio; reject unsupported state. |
| `src/renderers/final-media-qa.js` | Measure actual final mux streams, decode, loudness, true peak, clipping, sync and integrity. |
| `src/renderers/inspector.js` | Reject missing/invalid stream metadata and report measured stream profile. |
| `tests/audio-contracts-canonical.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/native-delivery.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |

## Phase 5 peak control — d09a18d

| Actual file | Reason |
| --- | --- |
| `docs/remediation/PHASE5_PEAK_CONTROL.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `src/creative/audio-mixer-engine.js` | Canonical sample mixing, explicit gain control and fail-closed actual audio measurements. |
| `src/creative/creative-plan-compiler.js` | Reconcile actual plan/audio/visual contracts and emit exact canonical operations. |
| `tests/audio-peak-control.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |

## Phase 6 — 2549afd

| Actual file | Reason |
| --- | --- |
| `docs/remediation/PHASE6.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `scripts/benchmark-canonical-native.cjs` | Real local deterministic benchmark with full provenance and honest review labels. |
| `scripts/verify-native-delivery.cjs` | Bounded reproducible verification with unique output roots and raw evidence. |
| `src/creative/composition-renderer.js` | Strict native-demo capability/parameter checks and animated typography sequence parity. |
| `src/creative/creative-context-builder.js` | Ground canonical snapshot/media context and backend capabilities. |
| `src/creative/creative-plan-compiler.js` | Reconcile actual plan/audio/visual contracts and emit exact canonical operations. |
| `src/creative/curved-rasterizer.py` | Explicit font rasterization, correct alpha compositing and actual glyph bounds. |
| `src/creative/curved-typography.js` | Bounded supported arc/animation contract; reject ignored geometry/style fields. |
| `src/creative/reframing-engine.js` | Map source crop coordinates consistently with canvas rendering. |
| `src/creative/visual-evidence.js` | Map per-source annotations through trims/offsets and require active-frame coverage. |
| `src/mcp/server.js` | Protect mutation and delivery contracts; actual stdio, truthful status and safe boundaries. |
| `src/renderers/canonical-native.js` | Render immutable canonical timing/media/transforms/effects/audio; reject unsupported state. |
| `src/renderers/canonical-text-rasterizer.py` | Raster plain text with measured alpha bounds using the existing Pillow dependency. |
| `src/renderers/graphic-rasterizer.js` | Share actual raster bounds and face-collision validation between compile/render. |
| `src/renderers/hyperframes/capabilities.js` | Reject native-only payloads instead of silently discarding them. |
| `src/renderers/hyperframes/compiler.js` | Honor canonical zero/default effect factors. |
| `src/renderers/native-capabilities.js` | One explicit backend capability/profile descriptor. |
| `tests/audio-contracts-canonical.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/contracts-replay.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/phase1-approval-boundary.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/visual-canonical.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |

## Phase 7 — 4f61f36

| Actual file | Reason |
| --- | --- |
| `README.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `docs/remediation/ACCEPTANCE.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `docs/remediation/CHANGE_INDEX.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `docs/remediation/MCP_WORKFLOW.md` | Document actual implementation, evidence, compatibility impact and remaining limitations. |
| `package.json` | Correct public entry point, expose confirmation CLI and document tested runtime/test commands. |
| `scripts/verify-native-delivery.cjs` | Bounded reproducible verification with unique output roots and raw evidence. |
| `scripts/verify-remediation.cjs` | Bounded reproducible verification with unique output roots and raw evidence. |
| `src/cli/index.js` | Protected exact execution/native delivery and explicit withholding of unsafe legacy paths. |
| `src/creative/creative-plan-compiler.js` | Reconcile actual plan/audio/visual contracts and emit exact canonical operations. |
| `src/creative/execution-record.js` | Seal exact operations, snapshots, options/defaults, destinations and physical assets. |
| `src/engine/operations.js` | Canonical history restoration and exact monotonic revision protection. |
| `src/mcp/server.js` | Protect mutation and delivery contracts; actual stdio, truthful status and safe boundaries. |
| `src/prompt-core/native-delivery.js` | Durable job/retry/recovery, stale/fenced guarded publication and evidence verification. |
| `src/renderers/canonical-native.js` | Render immutable canonical timing/media/transforms/effects/audio; reject unsupported state. |
| `src/renderers/native-capabilities.js` | One explicit backend capability/profile descriptor. |
| `src/ui/server.js` | Protect editing/history/color; unify delivery; isolate and label previews. |
| `tests/contracts-replay.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/native-interface.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |
| `tests/visual-canonical.test.js` | Meaningful focused security, contract, media or regression verification; preserve original assertions where applicable. |

## Phase 7 portability follow-up — b9363e0

| Actual file | Reason |
| --- | --- |
| `assets/bgm` → `assets/bgm/README.md` | Replace this branch's absolute private-library link with portable optional setup; target untouched. |
| `assets/fonts` → `assets/fonts/README.md` | Same preservation/portability correction for fonts. |
| `assets/sfx` → `assets/sfx/README.md` | Same preservation/portability correction for SFX. |
| `assets/transitions` → `assets/transitions/README.md` | Same preservation/portability correction for optional transition media. |
| `src/ui/public/assets/luts` → `src/ui/public/assets/luts/README.md` | Remove absolute dependency on another checkout; no referenced LUT changed. |
| `scripts/verify-portable-inputs.cjs` | Fail closed on reintroduced private library mounts in a clean source checkout. |
| `scripts/verify-remediation.cjs` | Run the portability gate with bounded acceptance checks. |
| `package.json` | Expose the portable-input verification command. |
| `README.md` | Document portable optional assets and verification. |
| `docs/remediation/ACCEPTANCE.md` | Record the initial archive failure and actual safe follow-up. |
| `docs/remediation/MCP_WORKFLOW.md` | Explain optional library compatibility without private mounts. |
| `docs/remediation/CHANGE_INDEX.md` | This complete change index. |

## Final acceptance documentation — this commit

| Actual file | Reason |
| --- | --- |
| `docs/remediation/ACCEPTANCE.md` | Record the tested committed archive tree, exact final packaging results and local evidence retention; keep unrelated private filenames out of committed reports. |
| `docs/remediation/CHANGE_INDEX.md` | Identify the final portability commit and this documentation-only update. |
