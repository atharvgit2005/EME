# Explicit dialogue peak control — 2026-10-27

A real source benchmark correctly failed the linear-only master headroom guard.
The supported remedy is an explicitly selected lookahead peak-control profile compiled
into existing canonical audio volumeEnvelope keyframes before approval. No new schema
or effect discriminator is introduced. The gain envelope, source hashes, profile options
and exact resulting operations are sealed in the existing execution record. The renderer
uses those approved keyframes; it does not invent dynamics processing after approval.

The profile specifies ceilingDb, windowTicks, lookaheadTicks and releaseTicks. Deterministic
per-window peak inspection generates bounded gains, with lookahead and release hold.
The final master and mux still must pass unchanged loudness/peak/clipping gates. This is
peak control via canonical gain automation, not a claim of a particular studio compressor.

`node --test tests/audio-peak-control.test.js`, Node 20.20.1, exit 0:

```text
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 776.450125
```

The test first demonstrates headroom rejection without control, then verifies immutable
inputs, 201 exact canonical keyframes and measured −14.0 LUFS, −7.9 dBFS true peak,
zero clipping with the explicit profile. A later real-footage combined benchmark using
the visual candidate measures −14.0 LUFS, −5.0 dBFS true peak and zero clipping, without
relaxing thresholds. Its separate evidence is recorded with Phase 6/7.
