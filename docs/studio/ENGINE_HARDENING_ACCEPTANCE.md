# Engine hardening acceptance — 2026-10-31

Scope: TigerGraph reliability, contextual sound design and the production anchored
visual-temporal path. This is a bounded patch with measured gates, not a claim
that arbitrary edits or all future footage are error-free.

## Changes

- TigerGraph: bounded overload retries, strict acknowledgement counts, explicit
  stopped-workspace diagnosis, durable pending feedback and verified local fallback.
  The existing atomic header remains in use. An investigated legacy `atomic_post`
  parameter was removed; current documentation deprecates it in favor of the header.
- SFX: six original layered material templates, five contextual profiles, stable
  per-event seeds, salience selection, density/cooldown limits, deliberate silence,
  dialogue priority and explicit handles. IDE list/plan tools and an `eme-sfx` CLI
  expose this through the existing review workflow. Legacy generators reject
  invalid/unbounded inputs, honor seed zero and end at zero; riser filters no
  longer share left/right channel state.
- Visual temporal: safe rational timestamps, monotonic/shot-boundary guards,
  duration-weighted visible coverage and longest-gap reporting. Sparse LK rejects
  absent/nonfinite flow, out-of-frame points and incoherent displacement groups.
- Portable tests: catalog fixtures now generate temporary WAVs instead of requiring
  an absent external sound pack. The Studio tool-list expectation includes the
  two newly registered tools.

## Verification

| Check | Result |
| --- | --- |
| Aggregate `npm test` | Passed: remediation/native delivery, Studio, scene, placement, editor, design, TigerGraph, SFX |
| TigerGraph contract suite | 18 passed, including native export/restart/MCP against an HTTP contract double |
| Additional audio workflow + final temporal regressions | 16 passed |
| Actual OpenCV physics checks | 5 passed; translation sweep covers 6 seeds × 4 motions |
| SFX signal benchmarks | Three rounds, 72 renders each; 216 distinct seed/material outputs, deterministic repeats, silent edges, no sample clipping |
| SFX peak bound at intensity 1 | Worst measured sample peak −7.38 dBFS; no claim of oversampled true-peak certification |
| Dense editorial briefs | 1,500 events across five profiles; timeline handles and density gates passed |
| Actual MobileSAM/MPS controlled tracking | Motion, occlusion, hard cuts, variable frame rate passed; no mocked observations |
| Live TigerGraph Cloud | Blocked: HTTP 500, workspace stopped, auto-start disabled; console requires fresh login |

Controlled tracking's completed run observed 30/30 motion frames with mean box
IoU 0.9989 and 30/30 VFR frames with IoU 0.9978. Occlusion and cut fixtures had
zero false-visible frames. Lost tracks remain lost until reanchored; the benchmark
does not assert automatic reacquisition or general natural-footage accuracy.

The first patch run exposed a timestamp input-type regression: ffprobe supplies
safe numeric timestamps as well as strings. Both are now accepted; overflow,
malformed rational values and negative normalized timestamps still fail. The
first aggregate run caught the outdated MCP tool count. Both were fixed and
the affected suites rerun successfully. No failed gate was converted into a pass
by reducing its quality threshold.

Evidence is local under `.artifacts/engine-hardening/`:
`baseline.log`, `round1.log`, `round2.log`, `full-suite-round2.log`,
`audio-scene-final.log`, `tigergraph-final.log`, `sfx/report.json`,
`scene-m3-final.log`, `cloud-status-final.json`.
The scene verifier also writes `.artifacts/scene/m3-validation/report.json`.

## Remaining external dependency and quality limits

Resume the existing workspace in TigerGraph Cloud after signing in, then run:

```sh
node --env-file=.env.local bin/eme-tigergraph.js sync
node --env-file=.env.local bin/eme-tigergraph.js verify
```

Database credentials cannot resume the cloud service. No settings, billing tier,
credentials or schema were changed to work around the stopped workspace. Local
feedback is retained. Live cloud end-to-end success is **not** claimed for this patch.

SFX checks measure signal integrity and editorial constraints. Aesthetic quality
and mix suitability still require listening; preview WAVs are saved locally.
Pinterest reference discovery and its access limitations are recorded in
[SFX templates and research](SFX_TEMPLATES.md). No third-party audio was copied.

Atomic-upsert reference: [TigerGraph documentation](https://www.tigergraph.com/docs/tigergraph-server/3.11/api/upsert-rest).
