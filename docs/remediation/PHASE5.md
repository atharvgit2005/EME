# Audio contracts and final mix — 2026-10-27

Catalog records are normalized explicitly to project/context identities and absolute
sources. Physical bytes and ffprobe metadata are verified separately from static
metadata declarations. Missing/unreadable entries remain unavailable with diagnostics
and cannot abort inspection of unrelated entries. Licensing is labeled
`evidence_status: declaration_only`; historical rights declarations are not clearance.
The obsolete MCP `.path` default disappeared with the independent renderer route.

Seconds convert to ticks once through decimal-rational BigInt rounding. Speech intervals
normalize to ticks, reject conflicting units, and retain exact attack/release ticks.
WAV speech detection now parses real format/data chunks and measures mono/stereo frames
at the actual sample rate. Merging does not mutate input. Overlapping attack/release
ramps retain their intersection rather than discarding later keyframes. No speech means
a flat envelope, not invented continuous dialogue.

Creative Plan SFX `asset_id`/`trigger_tick` fields normalize at the compiler boundary.
No fabricated default asset paths are emitted. Explicit asset selection and duration
metadata (or an explicit cue duration) are required. Existing project assets must be
imported through approved operations before plans reference them; a catalog listing
does not itself add canonical project assets. Existing dialogue tracks survive music
replacement. `preserveSourceDialogue:true` in sealed compilation options emits explicit
canonical dialogue clips with the same source trims/placement as the video beats.
Without that intent source-video audio remains excluded.

Canonical native audio now uses AudioMixerEngine's sample-accurate PCM mixing for
explicit dialogue/music/SFX, tick gain envelopes, trims and timeline placement. A linear
master gain targets −14 LUFS while retaining relative envelope behavior. Insufficient
headroom fails with `ERR_AUDIO_MASTER_HEADROOM` and requires explicit dynamics intent;
there is no silent compressor substitution. Final AAC mux QA still measures loudness,
true peak, clipping and frame-derived sync. Native renderer version advances to /2.
Legacy mixer missing sources/calibration failures surface, and returned peak/clipping
metrics come from the resulting actual file. Unmeasured metrics are not passing defaults.

Node 20.20.1 commands:

`node --test tests/audio-contracts-canonical.test.js`, exit 0: 5/5 passed,
zero failed/skipped (1819.572625 ms).
`node scripts/verify-native-delivery.cjs`, exit 0:

```text
# tests 31
# suites 0
# pass 31
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 20872.25325
```

`node scripts/verify-approval-phase1.cjs`, exit 0: 75+39 passed, zero failed/skipped.
Baseline hashes and diff checks exit 0. Raw logs and exact commands remain in unique
temporary evidence directories. Earlier audio fixture runs exposed a mock source-size
crop assumption (Phase 6), an incomplete disabled-reframing test object, and a malformed
FFmpeg duration string in the frequency-measurement harness. The audio-focused fixture
explicitly disables reframing while preserving its schema fields; the harness was fixed.
No acceptance threshold was changed.

The accepted deterministic Creative Plan produced an actual 192x108, 30 fps, 2s
H264/AAC stereo 48 kHz artifact, SHA-256:
`855a4d891560f17fa234d8a4d5053625d9c39505577a379b33c016d9e74fffdc`.
Final measures: −14.0 LUFS, −8.7 dBFS true peak, zero clipped samples, stream sync within
one frame. Band-isolated RMS: music before speech 0.20924, during speech 0.02329;
dialogue during speech 0.10489; SFX frequency before cue 0.00258, during cue 0.16868.
This proves intended signal/timing survival, not human listening acceptance.

Changed files: catalog, audio-contract normalizer (new), time conversion, context,
Creative compiler, speech-ducking compiler/detector, AudioMixerEngine, canonical native
adapter, inspector/final QA stream profile, isolated audio tests and expanded runner.
No schema bytes or original media were modified. Commercial licensing and listening
review remain unverified; external production assets were not copied into Git.
