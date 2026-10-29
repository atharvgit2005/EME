# Fail-closed native delivery — 2026-10-27

The native MCP render route now runs NativeDelivery, using existing
OrchestrationJobManager, session→job locks, RenderOrchestrator, QualityAssuranceEngine
and ArtifactIntegrityGuardian. Jobs follow canonical states and retain immutable
terminal outcomes. Job writes now use exclusive staging, rename and file/directory fsync.
Unique render directories preserve old artifacts. No cleanup touches original evidence.

The mandatory final-media audit probes and fully decodes the final mux, requires video
and stereo audio, checks dimensions/fps/duration and audio/video timing within one
output frame, requires finite EBU loudness/true-peak measurements, decodes PCM for
clipping, and binds the stable artifact checksum. The default delivery profile requires
−14 LUFS ±1, peak ≤−1 dBFS, zero clipped samples. Silent/missing-audio deliveries need
a separately designed alternative profile; they cannot pass this route by default.
AudioMixerEngine no longer substitutes passing loudness/peak/clipping values after
measurement failures. Unmeasured ducking is explicitly null/false. FrameInspector
rejects missing video and invalid duration/fps/size. Legacy QA additionally invokes the
mandatory final-media gate and cannot pass with failed checks or unavailable metrics.

QA, manifest, provenance and artifact hashes are persisted. Publication verifies both
artifact and QA bytes, checks the live project digest under the same project lock as
execution, rechecks fencing immediately before atomic session publication, and calls
the existing guardian. Stale renders remain historical candidates and never replace
active delivery. Session publication is the delivery commit point; an acknowledgement
failure afterward reports committed publication and reconciliation, not rollback.
Status requires a durable job ID; arbitrary artifact existence no longer means success.
Interrupted unpublished jobs need reconciliation; interrupted published jobs recover
success only from verified manifest, QA and session history. Historical success remains
immutable, with a separate integrity-drift alert if its evidence changes.

Tests use real synthetic media and injected test-only failures. Production has no
simulation flags. `node scripts/verify-native-delivery.cjs` on Node 20.20.1 exited 0:

```text
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 7808.766292
```

Raw TAP and exact command are in the runner's uniquely allocated evidence directory.
Coverage includes invalid/corrupt media, missing audio, absent measurement binary,
non-finite silent measurements, failed decode/render/manifest/hash/promotion, stale
replacement, restart, idempotency, post-publication acknowledgement failure, integrity
drift, actual SIGKILL before rendering and after session publication, and process races:

```text
NATIVE_RACE: processes=2 successful_publications=1 competing_retry=RENDERING
```

The accepted 160x120 H264/AAC artifact has 60 frames, 30 fps, 2.000s video/audio,
−14.0 LUFS, −13.0 dBFS true peak and zero clipped samples. SHA-256:
`d941f570ddb6a584bc73a1f1ddaac3c1b0534176dbce965b1d36f1bddd3012e9`.
An initial fixture correctly failed at −15.7 LUFS; its synthetic input amplitude was
calibrated while keeping acceptance thresholds unchanged. One combined run exposed
a missing test-helper export (17 pass/1 fail); fixed, followed by the passing run above.
No listening/human aesthetic or genuine IDE acceptance is implied by technical QA.

`node scripts/verify-approval-phase1.cjs` again exited 0: 75 focused plus 39
lock/fencing/guardian tests, all passed, zero skipped. Baseline hash check and
`git diff --check` exited 0. The original schemas remain byte-identical.

Changed files: native-delivery workflow, final-media-qa, audio mixer, inspector,
QA engine, durable job persistence, manifest integrity fields, MCP routes, native
verification runner and isolated media/process test helpers and tests.
